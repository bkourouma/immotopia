/**
 * Regles pures de l'assemblee generale en direct (spec 043).
 *
 * Aucun acces base : ces fonctions decident, le service (`meeting-live.ts`)
 * lit et ecrit. Elles sont testees seules.
 */

export type LiveAttendanceStatus = 'PRESENT' | 'REPRESENTED' | 'ABSENT';
export type LiveAttendanceMode = 'ONLINE' | 'IN_PERSON';
export type LiveVoteSource = 'MANAGER' | 'CO_OWNER' | 'PROXY_HOLDER';
export type LiveVoteStatus = 'PENDING' | 'OPEN' | 'CLOSED';

/** Un participant est « en ligne » s'il a ete vu il y a moins de 30 secondes. */
export const ONLINE_WINDOW_MS = 30_000;

/** `lastSeenAt` n'est reecrit que toutes les 10 secondes au plus, par participant. */
export const LAST_SEEN_WRITE_INTERVAL_MS = 10_000;

/** Un lien d'AG vit 7 jours apres la date de l'AG (plafonne par SECURE_LINK_MAX_TTL_DAYS). */
export const MEETING_LINK_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  return now.getTime() - seen < ONLINE_WINDOW_MS && seen <= now.getTime() + ONLINE_WINDOW_MS;
}

export function shouldTouchLastSeen(lastSeenAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSeenAt) return true;
  return now.getTime() - new Date(lastSeenAt).getTime() >= LAST_SEEN_WRITE_INTERVAL_MS;
}

/**
 * Duree de vie (en jours entiers, au moins 1, au plus `maxTtlDays`) d'un lien
 * personnel : jusqu'a 7 jours apres la date de l'AG.
 */
export function meetingLinkTtlDays(scheduledAt: Date | string, maxTtlDays: number, now: Date = new Date()): number {
  const expiry = new Date(scheduledAt).getTime() + MEETING_LINK_GRACE_DAYS * DAY_MS;
  const days = Math.ceil((expiry - now.getTime()) / DAY_MS);
  return Math.max(1, Math.min(maxTtlDays, days));
}

export function isMeetingFrozen(status: string): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

// ---------------------------------------------------------------------------
// Lots votables par un contact (D6)
// ---------------------------------------------------------------------------

export interface LotWithVoters {
  lotId: string;
  /** Contacts votants du lot A LA DATE de l'AG (`votersAt`, indivision comprise). */
  voterContactIds: string[];
}

export interface VotableLot {
  lotId: string;
  /** OWNER : le contact est votant du lot ; PROXY : il le represente par pouvoir. */
  role: 'OWNER' | 'PROXY';
  /** Mandant (PROXY seulement). */
  grantorContactId: string | null;
}

/**
 * Lots que `contactId` peut voter : ceux dont il est votant a la date de l'AG,
 * puis ceux des mandants qui lui ont donne un pouvoir (`GMProxy`). Un lot dont
 * il est lui-meme votant reste `OWNER`, meme s'il le detient aussi par pouvoir.
 * Un pouvoir n'est pas transitif : le mandataire du mandataire ne vote pas.
 */
export function resolveVotableLots(
  contactId: string,
  lots: LotWithVoters[],
  proxyGrantorContactIds: string[]
): VotableLot[] {
  const grantors = new Set(proxyGrantorContactIds.filter(id => id !== contactId));
  const result: VotableLot[] = [];
  for (const lot of lots) {
    if (lot.voterContactIds.includes(contactId)) {
      result.push({ lotId: lot.lotId, role: 'OWNER', grantorContactId: null });
      continue;
    }
    const grantor = lot.voterContactIds.find(id => grantors.has(id));
    if (grantor) result.push({ lotId: lot.lotId, role: 'PROXY', grantorContactId: grantor });
  }
  return result;
}

export function voteSourceForRole(role: VotableLot['role']): LiveVoteSource {
  return role === 'OWNER' ? 'CO_OWNER' : 'PROXY_HOLDER';
}

// ---------------------------------------------------------------------------
// Emargement
// ---------------------------------------------------------------------------

export interface ExistingAttendance {
  lotId: string;
  status: LiveAttendanceStatus;
}

export interface PlannedAttendance {
  lotId: string;
  status: 'PRESENT' | 'REPRESENTED';
  attendeeContactId: string;
  representedByContactId: string | null;
}

/**
 * Presences a ecrire quand `contactId` rejoint (ou vote). On ne retrograde
 * jamais un emargement existant (PRESENT ou REPRESENTED) ; un ABSENT pose par
 * le gestionnaire, ou l'absence de ligne, est remplace.
 */
export function planAttendanceForContact(
  contactId: string,
  votable: VotableLot[],
  existing: ExistingAttendance[]
): PlannedAttendance[] {
  const byLot = new Map(existing.map(a => [a.lotId, a.status]));
  const plans: PlannedAttendance[] = [];
  for (const lot of votable) {
    const current = byLot.get(lot.lotId);
    if (current === 'PRESENT' || current === 'REPRESENTED') continue;
    plans.push({
      lotId: lot.lotId,
      status: lot.role === 'OWNER' ? 'PRESENT' : 'REPRESENTED',
      attendeeContactId: contactId,
      representedByContactId: lot.role === 'OWNER' ? null : contactId
    });
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Etat de vote d'une resolution (D4)
// ---------------------------------------------------------------------------

/** Ouvrir : resolution PENDING ou CLOSED (reouverture). */
export function canOpenVote(status: LiveVoteStatus): boolean {
  return status === 'PENDING' || status === 'CLOSED';
}

/** Clore : resolution OPEN. */
export function canCloseVote(status: LiveVoteStatus): boolean {
  return status === 'OPEN';
}

/** Le resultat n'est montre aux copropriétaires que pour un vote clos ou une AG cloturee. */
export function isResultVisible(voteStatus: LiveVoteStatus, meetingStatus: string): boolean {
  return voteStatus === 'CLOSED' || meetingStatus === 'COMPLETED';
}

/** Nom d'affichage d'un contact CRM. */
export function contactDisplayName(contact: {
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
}): string {
  return contact.legalName?.trim() || [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || '';
}
