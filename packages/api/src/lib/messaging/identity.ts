/**
 * Resolution des personnes joignables dans une agence.
 *
 * Une personne est joignable si c'est un User ACTIF (`isActive`) ET soit
 * membre ACTIF de l'agence (STAFF), soit client portail de l'agence (CLIENT).
 * Tout le reste (autre agence, inexistant, desactive, membership suspendu)
 * est indistinguable : l'appelant leve la meme NotFoundError.
 *
 * Les libelles viennent d'un `select` explicite sur User (jamais passwordHash).
 */
import { createHash } from 'crypto';
import { prisma } from '../../utils/database';
import { ForbiddenError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { hasPermission } from '../../services/permission-service';
import type { DirectoryEntry, MessagingActor, ParticipantKind } from './types';

const USER_SELECT = { id: true, email: true, fullName: true, isActive: true } as const;

export interface Person {
  userId: string;
  label: string;
  kind: ParticipantKind;
}

export function labelOf(user: { email: string; fullName: string | null }): string {
  return user.fullName?.trim() || user.email;
}

/** Libelle d'un membre du personnel vu par un client sans nom renseigne : jamais son e-mail. */
export function teamLabel(): string {
  return t("Équipe de l'agence");
}

/**
 * Libelle d'une personne VUE PAR `actor`. Un client ne voit jamais l'e-mail
 * d'un autre compte : sans nom, repli generique (soi-meme reste libre).
 */
export function labelFor(actor: MessagingActor, user: { id?: string; email: string; fullName: string | null }): string {
  if (actor.audience !== 'CLIENT' || user.id === actor.userId) return labelOf(user);
  return user.fullName?.trim() || teamLabel();
}

/** Roles (STAFF / CLIENT) de personnes deja participantes : membres ACTIFS = STAFF. */
export async function kindsFor(tenantId: string, userIds: string[]): Promise<Map<string, ParticipantKind>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const members = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE', userId: { in: ids } },
    select: { userId: true }
  });
  const staff = new Set(members.map(m => m.userId));
  return new Map(ids.map(id => [id, staff.has(id) ? 'STAFF' : 'CLIENT'] as const));
}

/** Vrai quand `actor` (un client) regarde un AUTRE client : identite a masquer. */
export function isHiddenPeer(actor: MessagingActor, userId: string, kind: ParticipantKind | undefined): boolean {
  return actor.audience === 'CLIENT' && userId !== actor.userId && (kind ?? 'CLIENT') === 'CLIENT';
}

/**
 * Identifiant expose a `actor` : l'identifiant reel, sauf pour un client qui
 * regarde un autre client (identifiant opaque, stable PAR conversation, qui ne
 * permet pas de retrouver le compte ni de le recouper entre conversations).
 */
export function exposedUserId(
  actor: MessagingActor,
  conversationId: string,
  userId: string,
  kind: ParticipantKind | undefined
): string {
  if (!isHiddenPeer(actor, userId, kind)) return userId;
  return `p_${createHash('sha256').update(`${conversationId}:${userId}`).digest('hex').slice(0, 16)}`;
}

/** Libelle d'un autre client vu par un client : generique, jamais son nom. */
export function otherParticipantLabel(): string {
  return t('Autre participant');
}

/** Libelle de repli pour un auteur dont le compte n'existe plus. */
export function unknownUserLabel(): string {
  return t('Utilisateur supprimé');
}

/**
 * Personnes joignables parmi `userIds` (STAFF prioritaire si double role).
 * Les ids absents du resultat ne sont pas joignables.
 */
export async function resolveReachable(tenantId: string, userIds: string[]): Promise<Map<string, Person>> {
  const result = new Map<string, Person>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return result;

  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE', userId: { in: ids } },
    select: { userId: true, user: { select: USER_SELECT } }
  });
  for (const m of memberships) {
    if (m.user?.isActive) result.set(m.userId, { userId: m.userId, label: labelOf(m.user), kind: 'STAFF' });
  }

  const missing = ids.filter(id => !result.has(id));
  if (missing.length) {
    const clients = await prisma.tenantClient.findMany({
      where: { tenantId, userId: { in: missing } },
      select: { userId: true, user: { select: USER_SELECT } }
    });
    for (const c of clients) {
      if (c.user?.isActive && !result.has(c.userId)) {
        result.set(c.userId, { userId: c.userId, label: labelOf(c.user), kind: 'CLIENT' });
      }
    }
  }
  return result;
}

/**
 * L'appelant doit lui-meme appartenir a l'agence dans son role :
 * STAFF => membre ACTIF ; CLIENT => client portail.
 * Un super-admin sans Membership est refuse (il n'est pas un User de l'agence :
 * choix documente, ForbiddenError car il s'agit de l'appelant, pas d'un tiers).
 */
export async function assertActorBelongs(actor: MessagingActor): Promise<void> {
  const reachable = await resolveReachable(actor.tenantId, [actor.userId]);
  const me = reachable.get(actor.userId);
  const ok = actor.audience === 'STAFF' ? me?.kind === 'STAFF' : me !== undefined;
  if (!ok) {
    throw new ForbiddenError(t("Vous n'avez pas accès à la messagerie de cette agence."));
  }
}

/** Libelles (id -> label) de comptes quelconques, en une requete. */
export async function userLabels(userIds: string[], actor?: MessagingActor): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, fullName: true }
  });
  for (const u of users) map.set(u.id, actor ? labelFor(actor, u) : labelOf(u));
  return map;
}

/** Personnes joignables par l'appelant. CLIENT => personnel seulement. */
export async function directory(actor: MessagingActor, q?: string): Promise<DirectoryEntry[]> {
  const term = q?.trim();
  // Un client ne cherche que par nom : filtrer sur l'e-mail reviendrait a le deviner.
  const searchFields =
    actor.audience === 'CLIENT'
      ? [{ fullName: { contains: term ?? '', mode: 'insensitive' as const } }]
      : [
          { fullName: { contains: term ?? '', mode: 'insensitive' as const } },
          { email: { contains: term ?? '', mode: 'insensitive' as const } }
        ];
  const userFilter = {
    isActive: true,
    id: { not: actor.userId },
    ...(term ? { OR: searchFields } : {})
  };

  const members = await prisma.membership.findMany({
    where: { tenantId: actor.tenantId, status: 'ACTIVE', user: userFilter },
    select: { userId: true, user: { select: USER_SELECT } },
    take: 50
  });
  const entries = new Map<string, DirectoryEntry>();
  for (const m of members) entries.set(m.userId, { userId: m.userId, label: labelFor(actor, m.user), kind: 'STAFF' });

  // Les clients portail (donnees CRM) ne sont proposes qu'a qui a le droit de voir les contacts.
  if (actor.audience === 'STAFF' && (await hasPermission(actor.userId, 'CRM_CONTACTS_VIEW', actor.tenantId))) {
    const clients = await prisma.tenantClient.findMany({
      where: { tenantId: actor.tenantId, user: userFilter },
      select: { userId: true, user: { select: USER_SELECT } },
      take: 50
    });
    for (const c of clients) {
      if (!entries.has(c.userId)) entries.set(c.userId, { userId: c.userId, label: labelOf(c.user), kind: 'CLIENT' });
    }
  }
  return [...entries.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(0, 50);
}
