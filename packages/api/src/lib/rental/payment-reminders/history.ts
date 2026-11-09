/**
 * Historique des relances de loyer (contrat 049 sections 3.5 et 3.6).
 *
 * Lecture seule, TOUJOURS filtree par agence. `failure_message` n'est jamais expose.
 * Les noms (auteur, locataire) sont charges en requetes groupees (`where id in`),
 * sans N+1 et avec des `select` explicites (jamais `include: { user: true }`).
 */
import { NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { resteDuEcheance } from '../../payment-gateway/checkout';
import type {
  ListRemindersQuery,
  RentalPaymentReminderDto,
  RentalReminderChannel,
  RentalReminderPaginated,
  RentalReminderStatus
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_INSTALLMENT_HISTORY = 50;

const REMINDER_SELECT = {
  id: true,
  tenant_id: true,
  installment_id: true,
  lease_id: true,
  level: true,
  channel: true,
  status: true,
  sent_by: true,
  sent_at: true,
  payment_link_id: true,
  failure_code: true,
  installment: {
    select: {
      period_year: true,
      period_month: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true,
      amount_paid: true,
      payments: { select: { amount: true, payment: { select: { status: true } } } },
      lease: { select: { lease_number: true, primary_renter_client_id: true } }
    }
  }
} as const;

type ReminderRow = {
  id: string;
  tenant_id: string;
  installment_id: string;
  lease_id: string;
  level: number;
  channel: unknown;
  status: unknown;
  sent_by: string | null;
  sent_at: Date;
  payment_link_id: string | null;
  failure_code: string | null;
  installment: {
    period_year: number;
    period_month: number;
    amount_rent: unknown;
    amount_service: unknown;
    amount_other_fees: unknown;
    penalty_amount: unknown;
    amount_paid: unknown;
    payments: Array<{ amount: unknown; payment: { status: string } | null }>;
    lease: { lease_number: string | null; primary_renter_client_id: string | null } | null;
  } | null;
};

/** Noms des auteurs (User) : une requete `id in`. */
async function loadAuthorNames(rows: ReminderRow[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(rows.map(r => r.sent_by).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string | null>();
  if (ids.length === 0) return names;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, email: true }
  });
  for (const u of users) names.set(u.id, u.fullName?.trim() || u.email || null);
  return names;
}

/** Locataires actuels : TenantClient -> e-mail du compte -> fiche CRM, sinon User.fullName. 2 requetes. */
async function loadRenterNames(tenantId: string, rows: ReminderRow[]): Promise<Map<string, string | null>> {
  const clientIds = [
    ...new Set(rows.map(r => r.installment?.lease?.primary_renter_client_id).filter((v): v is string => Boolean(v)))
  ];
  const names = new Map<string, string | null>();
  if (clientIds.length === 0) return names;

  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, id: { in: clientIds } },
    select: { id: true, user: { select: { email: true, fullName: true } } }
  });
  const emails = new Map<string, string>();
  for (const c of clients) {
    const email = c.user?.email?.trim();
    if (email) emails.set(email.toLowerCase(), email);
  }
  const contacts = emails.size
    ? await prisma.crmContact.findMany({
        where: {
          tenantId,
          OR: [...emails.values()].map(email => ({ email: { equals: email, mode: 'insensitive' as const } }))
        },
        select: { email: true, firstName: true, lastName: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      })
    : [];
  const crmNameByEmail = new Map<string, string>();
  for (const contact of contacts) {
    const key = contact.email?.trim().toLowerCase();
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
    if (key && name && !crmNameByEmail.has(key)) crmNameByEmail.set(key, name);
  }
  for (const c of clients) {
    const email = c.user?.email?.trim().toLowerCase();
    names.set(c.id, (email && crmNameByEmail.get(email)) || c.user?.fullName?.trim() || null);
  }
  return names;
}

async function toDtos(tenantId: string, rows: ReminderRow[]): Promise<RentalPaymentReminderDto[]> {
  if (rows.length === 0) return [];
  const [authors, renters] = await Promise.all([loadAuthorNames(rows), loadRenterNames(tenantId, rows)]);
  return rows.map(row => {
    const inst = row.installment;
    const clientId = inst?.lease?.primary_renter_client_id ?? null;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      installment_id: row.installment_id,
      lease_id: row.lease_id,
      level: row.level,
      channel: row.channel as RentalReminderChannel,
      status: row.status as RentalReminderStatus,
      sent_by: row.sent_by,
      sent_by_name: row.sent_by ? (authors.get(row.sent_by) ?? null) : null,
      sent_at: row.sent_at.toISOString(),
      payment_link_id: row.payment_link_id,
      failure_code: row.failure_code,
      leaseReference: inst?.lease?.lease_number ?? null,
      tenantName: clientId ? (renters.get(clientId) ?? null) : null,
      periodYear: inst?.period_year ?? 0,
      periodMonth: inst?.period_month ?? 0,
      amountDue: inst ? Math.round(resteDuEcheance(inst) * 100) / 100 : 0
    };
  });
}

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** GET /payment-reminders : historique pagine de l'agence, plus recent d'abord. */
export async function listReminders(
  tenantId: string,
  query: ListRemindersQuery
): Promise<RentalReminderPaginated<RentalPaymentReminderDto>> {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(query.pageSize) || DEFAULT_PAGE_SIZE)));

  const sentAt: { gte?: Date; lt?: Date } = {};
  const from = parseDay(query.from);
  const to = parseDay(query.to);
  if (from) sentAt.gte = from;
  if (to) sentAt.lt = new Date(to.getTime() + DAY_MS);

  const where = {
    tenant_id: tenantId,
    ...(query.installmentId ? { installment_id: query.installmentId } : {}),
    ...(query.leaseId ? { lease_id: query.leaseId } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.level ? { level: query.level } : {}),
    ...(sentAt.gte || sentAt.lt ? { sent_at: sentAt } : {})
  };

  const [total, rows] = await Promise.all([
    prisma.rentalPaymentReminder.count({ where }),
    prisma.rentalPaymentReminder.findMany({
      where,
      orderBy: [{ sent_at: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: REMINDER_SELECT
    })
  ]);
  const items = await toDtos(tenantId, rows as unknown as ReminderRow[]);
  return { items, total, page, pageSize };
}

/** GET /installments/:id/payment-reminders : 50 dernieres relances d'une echeance de l'agence. */
export async function listInstallmentReminders(
  tenantId: string,
  installmentId: string
): Promise<RentalPaymentReminderDto[]> {
  const installment = await prisma.rentalInstallment.findFirst({
    where: { id: installmentId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!installment) throw new NotFoundError(t('Échéance introuvable.'));
  const rows = await prisma.rentalPaymentReminder.findMany({
    where: { tenant_id: tenantId, installment_id: installmentId },
    orderBy: [{ sent_at: 'desc' }, { id: 'asc' }],
    take: MAX_INSTALLMENT_HISTORY,
    select: REMINDER_SELECT
  });
  return toDtos(tenantId, rows as unknown as ReminderRow[]);
}
