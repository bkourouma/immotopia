/**
 * Reste à charge d'un sinistre (lot B1, spec 032) : calculé, jamais stocké ni
 * accepté en entrée. Calcul en centimes entiers pour éviter les erreurs de
 * flottant, jamais négatif.
 */

import type { ClaimStatus } from './claim-status';

const SETTLED_STATUSES: readonly ClaimStatus[] = ['SETTLED', 'REJECTED', 'CLOSED'];

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** `max(0, réclamé - indemnisé)`, en unités monétaires avec 2 décimales au plus. */
export function computeOutOfPocket(claimed: number, indemnified: number | null | undefined): number {
  const cents = toCents(claimed) - toCents(indemnified ?? 0);
  return Math.max(0, cents) / 100;
}

/** Le reste à charge n'est exposé qu'une fois le dossier tranché (indemnisé, refusé ou clos). */
export function outOfPocketForStatus(
  status: ClaimStatus,
  claimed: number,
  indemnified: number | null | undefined
): number | null {
  return SETTLED_STATUSES.includes(status) ? computeOutOfPocket(claimed, indemnified) : null;
}
