/**
 * Conversations : liste, lecture, creation (1-a-1 deduplique / groupe),
 * ajout de participants, depart.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { BadRequestError, NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { hasPermission } from '../../services/permission-service';
import { requireParticipant } from './access';
import {
  assertActorBelongs,
  exposedUserId,
  isHiddenPeer,
  kindsFor,
  labelFor,
  otherParticipantLabel,
  resolveReachable,
  type Person
} from './identity';
import { sendMessage, unreadSince } from './messages';
import { MAX_CLIENT_GROUP_PARTICIPANTS, MAX_PARTICIPANTS } from './schemas';
import type { ConversationSummary, MessagingActor, Paginated } from './types';

const SUMMARY_SELECT = {
  id: true,
  kind: true,
  title: true,
  lastMessageAt: true,
  updatedAt: true,
  participants: {
    where: { leftAt: null },
    select: {
      userId: true,
      lastReadAt: true,
      joinedAt: true,
      user: { select: { id: true, email: true, fullName: true } }
    }
  }
} as const;

/** Client Prisma ou client de transaction. */
type DbClient = Pick<typeof prisma, 'conversationParticipant'>;

type SummaryRow = Prisma.ConversationGetPayload<{ select: typeof SUMMARY_SELECT }>;

/**
 * Resumes d'une page de conversations en un nombre CONSTANT de requetes
 * (membres, derniers messages, non-lus), quel que soit le nombre de lignes :
 *  - dernier message : celui dont la date est `lastMessageAt` (posee a chaque
 *    envoi avec la meme date) ; une requete pour toute la page ;
 *  - non-lus : un `groupBy` par conversation, avec la reference de lecture de
 *    chacune.
 * Un dernier message introuvable alors que `lastMessageAt` existe (message
 * supprime) retombe sur une recherche unitaire : cas d'anomalie uniquement.
 */
async function buildSummaries(actor: MessagingActor, rows: SummaryRow[]): Promise<ConversationSummary[]> {
  if (!rows.length) return [];
  const allIds = [...new Set(rows.flatMap(r => r.participants.map(p => p.userId)))];
  const kinds = await kindsFor(actor.tenantId, allIds);

  const epoch = new Date(0);
  const meOf = (row: SummaryRow) => row.participants.find(p => p.userId === actor.userId);
  const joinedOf = (row: SummaryRow) => meOf(row)?.joinedAt ?? epoch;
  const unreadSinceOf = (row: SummaryRow) => {
    const me = meOf(row);
    return me ? unreadSince(me) : { gt: epoch };
  };

  // Derniers messages : une requete pour la page.
  type LastRow = { id: string; conversationId: string; body: string; authorUserId: string; createdAt: Date };
  const lastByConversation = new Map<string, LastRow>();
  const needLast = rows.filter(r => r.lastMessageAt !== null && r.lastMessageAt.getTime() >= joinedOf(r).getTime());
  if (needLast.length) {
    const lastRows = await prisma.message.findMany({
      where: {
        tenantId: actor.tenantId,
        deletedAt: null,
        OR: needLast.map(r => ({ conversationId: r.id, createdAt: r.lastMessageAt as Date }))
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, conversationId: true, body: true, authorUserId: true, createdAt: true }
    });
    for (const m of lastRows)
      if (!lastByConversation.has(m.conversationId)) lastByConversation.set(m.conversationId, m);
    for (const r of needLast) {
      if (lastByConversation.has(r.id)) continue;
      const fallback = await prisma.message.findFirst({
        where: { conversationId: r.id, tenantId: actor.tenantId, deletedAt: null, createdAt: { gte: joinedOf(r) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, conversationId: true, body: true, authorUserId: true, createdAt: true }
      });
      if (fallback) lastByConversation.set(r.id, fallback);
    }
  }

  // Non-lus : un groupBy pour la page.
  const unreadByConversation = new Map<string, number>();
  const groups = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      tenantId: actor.tenantId,
      deletedAt: null,
      authorUserId: { not: actor.userId },
      OR: rows.map(r => ({ conversationId: r.id, createdAt: unreadSinceOf(r) }))
    },
    _count: { _all: true }
  });
  for (const g of groups) unreadByConversation.set(g.conversationId, g._count._all);

  // Auteurs de derniers messages qui ne sont plus participants : leur role reste necessaire.
  const extra = [...lastByConversation.values()].map(m => m.authorUserId).filter(id => !kinds.has(id));
  for (const [id, k] of await kindsFor(actor.tenantId, extra)) kinds.set(id, k);

  return rows.map(row => {
    const last = lastByConversation.get(row.id);
    return {
      id: row.id,
      kind: row.kind,
      title: row.title ?? null,
      // Un client ne voit ni le nom ni l'identifiant reel d'un autre client.
      participants: row.participants.map(p => {
        const kind = kinds.get(p.userId) ?? 'CLIENT';
        return {
          userId: exposedUserId(actor, row.id, p.userId, kind),
          label: isHiddenPeer(actor, p.userId, kind) ? otherParticipantLabel() : labelFor(actor, p.user),
          kind
        };
      }),
      lastMessage: last
        ? {
            id: last.id,
            body: last.body,
            authorUserId: exposedUserId(actor, row.id, last.authorUserId, kinds.get(last.authorUserId)),
            createdAt: last.createdAt.toISOString()
          }
        : null,
      unreadCount: unreadByConversation.get(row.id) ?? 0,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString()
    } satisfies ConversationSummary;
  });
}

async function summaryOf(actor: MessagingActor, conversationId: string): Promise<ConversationSummary> {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId: actor.tenantId },
    select: SUMMARY_SELECT
  });
  if (!row) throw new NotFoundError(t('Conversation introuvable.'));
  const [summary] = await buildSummaries(actor, [row]);
  return summary;
}

export async function listConversations(
  actor: MessagingActor,
  options: { page?: number; pageSize?: number } = {}
): Promise<Paginated<ConversationSummary>> {
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
  const where = {
    tenantId: actor.tenantId,
    participants: { some: { userId: actor.userId, tenantId: actor.tenantId, leftAt: null } }
  };
  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: SUMMARY_SELECT
    }),
    prisma.conversation.count({ where })
  ]);
  return { items: await buildSummaries(actor, rows), total, page, pageSize };
}

export async function getConversation(actor: MessagingActor, conversationId: string): Promise<ConversationSummary> {
  await requireParticipant(actor, conversationId);
  return summaryOf(actor, conversationId);
}

/**
 * Verifie que chaque id est une personne joignable de l'agence (et, pour un
 * client portail, du PERSONNEL). Toute anomalie leve la MEME NotFoundError
 * qu'un utilisateur inexistant.
 *
 * Meme restriction que l'annuaire : pour un appelant STAFF, un client portail
 * (non membre actif du personnel) n'est admis que si l'appelant a
 * CRM_CONTACTS_VIEW dans l'agence (donnees CRM). Sinon, meme NotFoundError.
 * Un client qui est aussi membre actif reste joignable (kind STAFF).
 */
async function resolveTargets(actor: MessagingActor, ids: string[]): Promise<Person[]> {
  const reachable = await resolveReachable(actor.tenantId, ids);
  let canSeeClients: boolean | null = null;
  const people: Person[] = [];
  for (const id of ids) {
    const person = reachable.get(id);
    if (!person || (actor.audience === 'CLIENT' && person.kind !== 'STAFF')) {
      throw new NotFoundError(t('Utilisateur introuvable.'));
    }
    if (actor.audience === 'STAFF' && person.kind === 'CLIENT') {
      canSeeClients ??= await hasPermission(actor.userId, 'CRM_CONTACTS_VIEW', actor.tenantId);
      if (!canSeeClients) throw new NotFoundError(t('Utilisateur introuvable.'));
    }
    people.push(person);
  }
  return people;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === 'P2002'
    : typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/**
 * Reactive (ou cree) la participation ; `joinedAt` repart de maintenant apres un
 * depart. Avec `reactivate: false`, une personne PARTIE reste partie (on ne cree
 * que la participation manquante) : seul le depart volontaire d'un participant le
 * sort d'une conversation, seule sa propre action l'y ramene.
 */
async function activateParticipant(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  userId: string,
  options: { reactivate?: boolean } = {}
): Promise<void> {
  const now = new Date();
  const existing = await db.conversationParticipant.findFirst({
    where: { conversationId, tenantId, userId },
    select: { id: true, leftAt: true }
  });
  if (existing) {
    if (existing.leftAt !== null && options.reactivate !== false) {
      await db.conversationParticipant.updateMany({
        where: { id: existing.id, tenantId },
        data: { leftAt: null, joinedAt: now, lastReadAt: null }
      });
    }
    return;
  }
  try {
    await db.conversationParticipant.create({
      data: { tenantId, conversationId, userId, joinedAt: now }
    });
  } catch (error) {
    // Dans une transaction Postgres une erreur l'invalide : le verrou de la conversation
    // rend la course impossible, on ne rattrape donc que hors transaction.
    if (db !== prisma || !isUniqueViolation(error)) throw error; // ajoute en parallele : rien a faire
  }
}

export async function createConversation(
  actor: MessagingActor,
  input: { participantUserIds: string[]; title?: string; firstMessage?: string }
): Promise<ConversationSummary> {
  await assertActorBelongs(actor);
  const others = [...new Set(input.participantUserIds)].filter(id => id !== actor.userId);
  if (!others.length) throw new BadRequestError(t('Choisissez au moins un autre participant.'));
  if (others.length + 1 > MAX_PARTICIPANTS) throw new BadRequestError(t('Trop de participants.'));
  const targets = await resolveTargets(actor, others);

  const title = input.title?.trim() || null;
  const isDirect = others.length === 1 && !title;
  // Un client n'ouvre qu'un 1-a-1 avec du personnel : pas de groupe cree par un client.
  if (actor.audience === 'CLIENT' && !isDirect) {
    throw new BadRequestError(t("Un client ne peut ouvrir qu'une conversation avec un membre de l'agence."));
  }
  // Un groupe qui contient un client reste petit (anti-fuite et anti-spam).
  if (!isDirect && targets.some(p => p.kind === 'CLIENT') && others.length + 1 > MAX_CLIENT_GROUP_PARTICIPANTS) {
    throw new BadRequestError(t('Un groupe avec un client est limité à 5 participants.'));
  }
  let conversationId: string;

  if (isDirect) {
    const directKey = [actor.userId, others[0]].sort().join(':');
    const find = () =>
      prisma.conversation.findFirst({
        where: { tenantId: actor.tenantId, directKey },
        select: { id: true }
      });
    let existing = await find();
    if (!existing) {
      try {
        existing = await prisma.conversation.create({
          data: {
            tenantId: actor.tenantId,
            kind: 'DIRECT',
            directKey,
            createdByUserId: actor.userId,
            participants: {
              create: [actor.userId, others[0]].map(userId => ({ tenantId: actor.tenantId, userId }))
            }
          },
          select: { id: true }
        });
      } catch (error) {
        // Course a l'unique (tenantId, directKey) : l'autre requete a gagne.
        if (!isUniqueViolation(error)) throw error;
        existing = await find();
        if (!existing) throw error;
      }
    }
    conversationId = existing.id;
    // Conversation existante : seul l'APPELANT, s'il l'avait quittee, y revient. L'autre
    // personne, si elle est partie, le reste (option la plus prudente : on ne la remet pas
    // dans une conversation sans son accord ; elle y revient en ouvrant elle-meme la conversation).
    await activateParticipant(prisma, actor.tenantId, conversationId, actor.userId);
    await activateParticipant(prisma, actor.tenantId, conversationId, others[0], { reactivate: false });
  } else {
    const created = await prisma.conversation.create({
      data: {
        tenantId: actor.tenantId,
        kind: 'GROUP',
        title,
        createdByUserId: actor.userId,
        participants: {
          create: [actor.userId, ...others].map(userId => ({ tenantId: actor.tenantId, userId }))
        }
      },
      select: { id: true }
    });
    conversationId = created.id;
  }

  if (input.firstMessage) await sendMessage(actor, conversationId, input.firstMessage);
  return summaryOf(actor, conversationId);
}

export async function addParticipants(
  actor: MessagingActor,
  conversationId: string,
  userIds: string[]
): Promise<ConversationSummary> {
  const me = await requireParticipant(actor, conversationId);
  if (me.conversation.kind !== 'GROUP') {
    throw new BadRequestError(t("On ne peut ajouter des participants qu'à un groupe."));
  }
  const ids = [...new Set(userIds)];
  const targets = await resolveTargets(actor, ids);

  // Plafond : 5 participants au total des qu'un client est (ou devient) membre du groupe.
  const current = await prisma.conversationParticipant.findMany({
    where: { conversationId, tenantId: actor.tenantId, leftAt: null },
    select: { userId: true }
  });
  const currentKinds = await kindsFor(
    actor.tenantId,
    current.map(c => c.userId)
  );
  const hasClient =
    actor.audience === 'CLIENT' ||
    targets.some(p => p.kind === 'CLIENT') ||
    [...currentKinds.values()].includes('CLIENT');
  const maxParticipants = hasClient ? MAX_CLIENT_GROUP_PARTICIPANTS : MAX_PARTICIPANTS;
  const tooMany = () =>
    new BadRequestError(
      hasClient ? t('Un groupe avec un client est limité à 5 participants.') : t('Trop de participants.')
    );

  // Controle rapide hors transaction (echec sans verrou dans le cas courant).
  const countActive = (db: DbClient) =>
    db.conversationParticipant.count({ where: { conversationId, tenantId: actor.tenantId, leftAt: null } });
  if ((await countActive(prisma)) + ids.length > maxParticipants) throw tooMany();

  // Verification definitive et insertion dans la MEME transaction, sous un verrou de
  // ligne sur la conversation : deux ajouts concurrents sont serialises, le second
  // recompte apres le premier et ne peut pas depasser le plafond.
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId} AND tenant_id = ${actor.tenantId} FOR UPDATE`;
    if ((await countActive(tx)) + ids.length > maxParticipants) throw tooMany();
    // Une personne partie ne revient que par sa propre action.
    for (const id of ids) await activateParticipant(tx, actor.tenantId, conversationId, id, { reactivate: false });
  });
  return summaryOf(actor, conversationId);
}

export async function leaveConversation(actor: MessagingActor, conversationId: string): Promise<{ left: true }> {
  await requireParticipant(actor, conversationId);
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, tenantId: actor.tenantId, userId: actor.userId, leftAt: null },
    data: { leftAt: new Date() }
  });
  return { left: true };
}
