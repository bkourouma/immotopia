/**
 * Lectures pour les routes (agence, admin d'agence, plateforme).
 * Toute requete sur un modele d'agence est filtree par `tenantId`, sauf les
 * lectures de plateforme, explicitement nommees `*Platform*`.
 * `User` n'est lu que par `select` explicite (jamais passwordHash).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { MESSAGE_NOTIFICATION_KEY } from './keys';
import { userLabel } from './recipient';
import type {
  AdminNotificationDetail,
  AdminNotificationFilters,
  AdminNotificationItem,
  NotificationChannelKey,
  NotificationItem,
  NotificationStatusKey,
  Paginated,
  PlatformNotificationFilters,
  PlatformNotificationItem
} from './types';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

function paging(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.floor(page ?? 1));
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// Boite de reception de l'utilisateur
// ---------------------------------------------------------------------------

const ITEM_SELECT = {
  id: true,
  key: true,
  title: true,
  body: true,
  link: true,
  status: true,
  failureReason: true,
  readAt: true,
  sentAt: true,
  createdAt: true,
  deliveries: { select: { channel: true, status: true, failureReason: true }, orderBy: { createdAt: 'asc' as const } }
} satisfies Prisma.UserNotificationSelect;

type ItemRow = Prisma.UserNotificationGetPayload<{ select: typeof ITEM_SELECT }>;

/**
 * Motif d'echec montre a un UTILISATEUR (cloche, portails) : generique. Le motif
 * detaille (erreur SMTP, WhatsApp...) peut porter une adresse ou un detail de
 * configuration ; il reste reserve au journal admin / plateforme.
 */
function userFacingFailure(reason: string | null): string | null {
  return reason ? t("L'envoi a échoué.") : null;
}

function toItem(row: ItemRow): NotificationItem {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    body: row.body,
    link: row.link,
    status: row.status as NotificationStatusKey,
    failureReason: userFacingFailure(row.failureReason),
    readAt: iso(row.readAt),
    sentAt: iso(row.sentAt),
    createdAt: row.createdAt.toISOString(),
    deliveries: row.deliveries.map(d => ({
      channel: d.channel as NotificationChannelKey,
      status: d.status as NotificationStatusKey,
      failureReason: userFacingFailure(d.failureReason)
    }))
  };
}

export async function listMyNotifications(input: {
  tenantId: string;
  userId: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<NotificationItem>> {
  const { page, pageSize, skip, take } = paging(input.page, input.pageSize);
  const where: Prisma.UserNotificationWhereInput = {
    tenantId: input.tenantId,
    recipientUserId: input.userId,
    ...(input.unreadOnly ? { readAt: null } : {})
  };
  const [rows, total] = await Promise.all([
    prisma.userNotification.findMany({
      where,
      select: ITEM_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.userNotification.count({ where })
  ]);
  return { items: rows.map(toItem), total, page, pageSize };
}

export async function countUnread(tenantId: string, userId: string): Promise<number> {
  return prisma.userNotification.count({ where: { tenantId, recipientUserId: userId, readAt: null } });
}

export async function markRead(
  tenantId: string,
  userId: string,
  notificationId: string
): Promise<{ id: string; readAt: string }> {
  const where = { id: notificationId, tenantId, recipientUserId: userId };
  const existing = await prisma.userNotification.findFirst({ where, select: { id: true, readAt: true } });
  if (!existing) throw new NotFoundError(t('Notification introuvable.'));
  if (existing.readAt) return { id: existing.id, readAt: existing.readAt.toISOString() };
  const readAt = new Date();
  await prisma.userNotification.updateMany({ where: { ...where, readAt: null }, data: { readAt } });
  return { id: existing.id, readAt: readAt.toISOString() };
}

export async function markAllRead(tenantId: string, userId: string): Promise<{ updated: number }> {
  const res = await prisma.userNotification.updateMany({
    where: { tenantId, recipientUserId: userId, readAt: null },
    data: { readAt: new Date() }
  });
  return { updated: res.count };
}

// ---------------------------------------------------------------------------
// Journal (admin d'agence et plateforme)
// ---------------------------------------------------------------------------

const ADMIN_SELECT = {
  id: true,
  tenantId: true,
  key: true,
  title: true,
  body: true,
  link: true,
  status: true,
  failureReason: true,
  readAt: true,
  sentAt: true,
  createdAt: true,
  recipientUserId: true,
  recipientLabel: true,
  senderUserId: true,
  relatedEntityType: true,
  relatedEntityId: true,
  deliveries: {
    select: {
      channel: true,
      status: true,
      target: true,
      failureReason: true,
      attempts: true,
      lastAttemptAt: true,
      sentAt: true
    },
    orderBy: { createdAt: 'asc' as const }
  }
} satisfies Prisma.UserNotificationSelect;

type AdminRow = Prisma.UserNotificationGetPayload<{ select: typeof ADMIN_SELECT }>;

/** Libelles des expediteurs, en une requete (select explicite). */
async function senderLabels(rows: AdminRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map(r => r.senderUserId).filter((v): v is string => !!v))];
  if (!ids.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, fullName: true }
  });
  return new Map(users.map(u => [u.id, userLabel(u)]));
}

function toAdminItem(row: AdminRow, senders: Map<string, string>): AdminNotificationItem {
  const base = toItem({ ...row, deliveries: [] });
  return {
    ...base,
    // Journal : motif detaille (reserve a l'admin d'agence et a la plateforme).
    failureReason: row.failureReason,
    recipient: { userId: row.recipientUserId, label: row.recipientLabel },
    sender: row.senderUserId
      ? { userId: row.senderUserId, label: senders.get(row.senderUserId) ?? t('Utilisateur supprimé') }
      : null,
    relatedEntity:
      row.relatedEntityType && row.relatedEntityId ? { type: row.relatedEntityType, id: row.relatedEntityId } : null,
    deliveries: row.deliveries.map(d => ({
      channel: d.channel as NotificationChannelKey,
      status: d.status as NotificationStatusKey,
      target: d.target,
      failureReason: d.failureReason,
      attempts: d.attempts,
      lastAttemptAt: iso(d.lastAttemptAt),
      sentAt: iso(d.sentAt)
    }))
  };
}

function buildAdminWhere(
  filters: AdminNotificationFilters,
  tenantId: string | undefined
): Prisma.UserNotificationWhereInput {
  const q = filters.q?.trim();
  const range =
    filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {};
  return {
    ...(tenantId ? { tenantId } : {}),
    // Un message prive n'apparait jamais au journal, meme en metadonnees.
    key: { not: MESSAGE_NOTIFICATION_KEY },
    ...(filters.recipientUserId ? { recipientUserId: filters.recipientUserId } : {}),
    ...(filters.senderUserId ? { senderUserId: filters.senderUserId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.channel ? { deliveries: { some: { channel: filters.channel } } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { body: { contains: q, mode: 'insensitive' as const } },
            { recipientLabel: { contains: q, mode: 'insensitive' as const } }
          ]
        }
      : {}),
    ...range
  };
}

export async function listAdminNotifications(
  tenantId: string,
  filters: AdminNotificationFilters = {}
): Promise<Paginated<AdminNotificationItem>> {
  const { page, pageSize, skip, take } = paging(filters.page, filters.pageSize);
  const where = buildAdminWhere(filters, tenantId);
  const [rows, total] = await Promise.all([
    prisma.userNotification.findMany({ where, select: ADMIN_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.userNotification.count({ where })
  ]);
  const senders = await senderLabels(rows);
  return { items: rows.map(r => toAdminItem(r, senders)), total, page, pageSize };
}

export async function getAdminNotification(tenantId: string, id: string): Promise<AdminNotificationDetail> {
  const row = await prisma.userNotification.findFirst({
    where: { id, tenantId, key: { not: MESSAGE_NOTIFICATION_KEY } },
    select: ADMIN_SELECT
  });
  if (!row) throw new NotFoundError(t('Notification introuvable.'));
  return toAdminItem(row, await senderLabels([row]));
}

/** Destinataires deja notifies (filtre du journal), par libelle. */
export async function listNotificationRecipients(
  tenantId: string,
  q?: string
): Promise<Array<{ userId: string; label: string }>> {
  const term = q?.trim();
  const rows = await prisma.userNotification.findMany({
    where: {
      tenantId,
      key: { not: MESSAGE_NOTIFICATION_KEY },
      recipientUserId: { not: null },
      ...(term ? { recipientLabel: { contains: term, mode: 'insensitive' as const } } : {})
    },
    select: { recipientUserId: true, recipientLabel: true },
    distinct: ['recipientUserId'],
    orderBy: { recipientLabel: 'asc' },
    take: 50
  });
  return rows.flatMap(r => (r.recipientUserId ? [{ userId: r.recipientUserId, label: r.recipientLabel }] : []));
}

// ---------------------------------------------------------------------------
// Plateforme (super-admin) : toutes les agences
// ---------------------------------------------------------------------------

export async function listPlatformNotifications(
  filters: PlatformNotificationFilters = {}
): Promise<Paginated<PlatformNotificationItem>> {
  const { page, pageSize, skip, take } = paging(filters.page, filters.pageSize);
  const where = buildAdminWhere(filters, filters.tenantId);
  const [rows, total] = await Promise.all([
    prisma.userNotification.findMany({
      where,
      select: { ...ADMIN_SELECT, tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.userNotification.count({ where })
  ]);
  const senders = await senderLabels(rows);
  return {
    items: rows.map(r => ({ ...toAdminItem(r, senders), tenant: { id: r.tenant.id, name: r.tenant.name } })),
    total,
    page,
    pageSize
  };
}

export async function getPlatformNotification(id: string): Promise<PlatformNotificationItem> {
  const row = await prisma.userNotification.findFirst({
    where: { id, key: { not: MESSAGE_NOTIFICATION_KEY } },
    select: { ...ADMIN_SELECT, tenant: { select: { id: true, name: true } } }
  });
  if (!row) throw new NotFoundError(t('Notification introuvable.'));
  const senders = await senderLabels([row]);
  return { ...toAdminItem(row, senders), tenant: { id: row.tenant.id, name: row.tenant.name } };
}
