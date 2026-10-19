/**
 * Messages : lecture paginee par curseur, envoi, lu / non-lu, notifications.
 *
 * Visibilite : un participant ne voit que les messages posterieurs a son
 * `joinedAt` (reinitialise s'il est reajoute apres etre parti).
 */
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { notify } from '../notifications';
// Import direct (et non via l'index) : la cle est definie UNE fois, dans lib/notifications.
import { MESSAGE_NOTIFICATION_KEY } from '../notifications/keys';
import { requireParticipant } from './access';
import {
  exposedUserId,
  isHiddenPeer,
  kindsFor,
  labelOf,
  otherParticipantLabel,
  resolveReachable,
  teamLabel,
  unknownUserLabel,
  userLabels
} from './identity';
import { MAX_MESSAGE_LENGTH } from './schemas';
import type { MessageItem, MessagingActor } from './types';

export { MESSAGE_NOTIFICATION_KEY };

export async function listMessages(
  actor: MessagingActor,
  conversationId: string,
  options: { before?: string; limit?: number } = {}
): Promise<{ items: MessageItem[]; hasMore: boolean }> {
  const me = await requireParticipant(actor, conversationId);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  const and: Array<Record<string, unknown>> = [{ createdAt: { gte: me.joinedAt } }];
  if (options.before) {
    const cursor = await prisma.message.findFirst({
      where: { id: options.before, conversationId, tenantId: actor.tenantId },
      select: { id: true, createdAt: true }
    });
    if (!cursor) throw new NotFoundError(t('Message introuvable.'));
    and.push({
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }]
    });
  }

  const rows = await prisma.message.findMany({
    where: { conversationId, tenantId: actor.tenantId, deletedAt: null, AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: { id: true, authorUserId: true, body: true, createdAt: true }
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const labels = await userLabels(
    page.map(r => r.authorUserId),
    actor
  );

  // Un client ne voit ni le nom ni l'identifiant d'un autre client (identifiant opaque stable).
  const kinds =
    actor.audience === 'CLIENT'
      ? await kindsFor(
          actor.tenantId,
          page.map(r => r.authorUserId)
        )
      : new Map<string, 'STAFF' | 'CLIENT'>();

  return {
    hasMore,
    items: page.map(r => ({
      id: r.id,
      authorUserId: exposedUserId(actor, conversationId, r.authorUserId, kinds.get(r.authorUserId)),
      authorLabel: isHiddenPeer(actor, r.authorUserId, kinds.get(r.authorUserId))
        ? otherParticipantLabel()
        : (labels.get(r.authorUserId) ?? unknownUserLabel()),
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      mine: r.authorUserId === actor.userId
    }))
  };
}

export async function sendMessage(
  actor: MessagingActor,
  conversationId: string,
  rawBody: string
): Promise<MessageItem> {
  const body = (rawBody ?? '').trim();
  if (!body || body.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestError(t('Le message doit contenir entre 1 et 5000 caractères.'));
  }
  await requireParticipant(actor, conversationId);

  const now = new Date();
  const created = await prisma.message.create({
    data: { tenantId: actor.tenantId, conversationId, authorUserId: actor.userId, body, createdAt: now },
    select: { id: true, authorUserId: true, body: true, createdAt: true }
  });
  // Mises a jour par updateMany + tenantId : jamais une ecriture par id seul.
  await prisma.conversation.updateMany({
    where: { id: conversationId, tenantId: actor.tenantId },
    data: { lastMessageAt: now }
  });
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, tenantId: actor.tenantId, userId: actor.userId },
    data: { lastReadAt: now }
  });

  // Fire-and-forget : ne fait JAMAIS echouer l'envoi.
  void Promise.resolve()
    .then(() => notifyRecipients(actor, conversationId))
    .catch(error => {
      logger.warn('Messagerie: notification des destinataires impossible', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  const labels = await userLabels([actor.userId]);
  return {
    id: created.id,
    authorUserId: created.authorUserId,
    authorLabel: labels.get(actor.userId) ?? unknownUserLabel(),
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    mine: true
  };
}

/**
 * Une notification IN_APP par autre participant. Si une notification non lue
 * du meme destinataire existe deja pour la conversation, on la met a jour au
 * lieu d'en creer une nouvelle (anti-bruit).
 *
 * VIE PRIVEE : le corps est GENERIQUE, jamais un extrait du message. La ligne
 * `UserNotification` est lisible hors messagerie (journal, exports) : le contenu
 * d'un message prive n'y est donc jamais copie. Le titre est le nom de
 * l'expediteur (la mise a jour anti-bruit ne reecrit aucun contenu).
 */
async function notifyRecipients(actor: MessagingActor, conversationId: string): Promise<void> {
  const [sender, others] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, email: true, fullName: true } }),
    prisma.conversationParticipant.findMany({
      where: { conversationId, tenantId: actor.tenantId, leftAt: null, userId: { not: actor.userId } },
      select: { userId: true }
    })
  ]);
  const relatedEntity = { type: 'Conversation', id: conversationId };
  const text = t('Vous avez reçu un nouveau message.');
  // Un client ne voit jamais l'e-mail de l'expediteur : repli generique sans nom.
  const reachable = await resolveReachable(
    actor.tenantId,
    others.map(o => o.userId)
  );
  const titleFor = (recipientId: string): string => {
    if (!sender) return unknownUserLabel();
    if (reachable.get(recipientId)?.kind === 'STAFF') return labelOf(sender);
    return sender.fullName?.trim() || teamLabel();
  };

  for (const { userId } of others) {
    try {
      const title = titleFor(userId);
      const existing = await prisma.userNotification.findFirst({
        where: {
          tenantId: actor.tenantId,
          recipientUserId: userId,
          key: MESSAGE_NOTIFICATION_KEY,
          readAt: null,
          relatedEntityType: relatedEntity.type,
          relatedEntityId: conversationId
        },
        select: { id: true }
      });
      if (existing) {
        // Seul le titre (nom de l'expediteur) change : aucun contenu n'est reecrit.
        await prisma.userNotification.updateMany({
          where: { id: existing.id, tenantId: actor.tenantId },
          data: { title }
        });
        continue;
      }
      await notify({
        tenantId: actor.tenantId,
        recipients: [{ userId }],
        key: MESSAGE_NOTIFICATION_KEY,
        title,
        body: text,
        link: `/messages/${conversationId}`,
        channels: ['IN_APP'],
        senderUserId: actor.userId,
        relatedEntity
      });
    } catch (error) {
      logger.warn('Messagerie: notification impossible pour un destinataire', {
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function markRead(actor: MessagingActor, conversationId: string): Promise<{ lastReadAt: string }> {
  await requireParticipant(actor, conversationId);
  const now = new Date();
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, tenantId: actor.tenantId, userId: actor.userId, leftAt: null },
    data: { lastReadAt: now }
  });
  return { lastReadAt: now.toISOString() };
}

/** Borne de lecture : `gt` la derniere lecture, sinon `gte` l'arrivee dans la conversation. */
export function unreadSince(p: { lastReadAt: Date | null; joinedAt: Date }): { gt: Date } | { gte: Date } {
  return p.lastReadAt ? { gt: p.lastReadAt } : { gte: p.joinedAt };
}

/**
 * Nombre de conversations ayant au moins un message non lu d'un autre auteur.
 * Deux requetes, quel que soit le nombre de conversations : les participations
 * de l'utilisateur, puis UN `groupBy` sur les messages (plus une requete par
 * conversation, la page interrogeant ce compteur toutes les 30 s).
 */
export async function unreadCount(actor: MessagingActor): Promise<{ count: number }> {
  const mine = await prisma.conversationParticipant.findMany({
    where: { tenantId: actor.tenantId, userId: actor.userId, leftAt: null, conversation: { tenantId: actor.tenantId } },
    select: {
      conversationId: true,
      lastReadAt: true,
      joinedAt: true,
      conversation: { select: { lastMessageAt: true } }
    }
  });
  // Jamais lu : tout message depuis l'arrivee (inclus) compte, comme la visibilite de listMessages ;
  // deja lu : les messages strictement posterieurs a la lecture.
  const candidates = mine.filter(p => {
    const last = p.conversation.lastMessageAt;
    if (last === null) return false;
    return p.lastReadAt ? last.getTime() > p.lastReadAt.getTime() : last.getTime() >= p.joinedAt.getTime();
  });
  if (!candidates.length) return { count: 0 };
  const groups = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      tenantId: actor.tenantId,
      deletedAt: null,
      authorUserId: { not: actor.userId },
      OR: candidates.map(p => ({ conversationId: p.conversationId, createdAt: unreadSince(p) }))
    },
    _count: { _all: true }
  });
  return { count: groups.length };
}
