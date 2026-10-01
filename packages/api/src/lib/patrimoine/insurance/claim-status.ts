/**
 * Table unique des transitions de statut d'un sinistre (lot B1, spec 032).
 * Le raccourci INSURER_NOTIFIED -> SETTLED/REJECTED (sans expertise) est
 * autorisé : une indemnisation ou un refus direct est courant.
 */

export type ClaimStatus = 'DECLARED' | 'INSURER_NOTIFIED' | 'EXPERTISE' | 'SETTLED' | 'REJECTED' | 'CLOSED';

export const CLAIM_TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  DECLARED: ['INSURER_NOTIFIED'],
  INSURER_NOTIFIED: ['EXPERTISE', 'SETTLED', 'REJECTED'],
  EXPERTISE: ['SETTLED', 'REJECTED'],
  SETTLED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: []
};

export function allowedNextStatuses(from: ClaimStatus): ClaimStatus[] {
  return [...CLAIM_TRANSITIONS[from]];
}

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from].includes(to);
}

/** Champ horodaté par la transition vers chaque statut (DECLARED : `declaredAt`, posé à la création). */
export const CLAIM_STATUS_TIMESTAMP_FIELD = {
  INSURER_NOTIFIED: 'insurerNotifiedAt',
  EXPERTISE: 'expertiseAt',
  SETTLED: 'settledAt',
  REJECTED: 'rejectedAt',
  CLOSED: 'closedAt'
} as const;
