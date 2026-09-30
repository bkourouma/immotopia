/**
 * Règle pure du rattrapage des créances d'échéances
 * (`scripts/backfill-rental-deposits.ts`), isolée pour être testée.
 *
 * Une échéance est débitée au compte du locataire seulement si :
 *   - son bail est vivant (ni brouillon ni annulé) ;
 *   - elle est ÉCHUE (`due_date` passée) : une échéance à venir reste
 *     Brouillon, jamais de débit daté du futur (même règle que `listInstallments`
 *     et `markOverdueInstallments`, `emitDraft: false`) ;
 *   - son statut calculé n'est ni Brouillon ni Annulé ;
 *   - elle n'a pas déjà son débit ;
 *   - elle n'a pas été repricée par une révision de loyer (un ajustement
 *     `LEASE_REVISION` est déjà écrit : débiter le montant révisé en plus
 *     l'ajouterait deux fois).
 */
import { RentalInstallmentStatus, RentalLeaseStatus } from '@prisma/client';
import { computeInstallmentStatus, type InstallmentForStatus } from './installment-status';

export interface BackfillInstallment extends InstallmentForStatus {
  id: string;
  lease_id: string;
  lease?: { status: RentalLeaseStatus } | null;
}

const DEAD_LEASE_STATUSES: RentalLeaseStatus[] = [RentalLeaseStatus.DRAFT, RentalLeaseStatus.CANCELED];

export function isLeaseAlive(installment: { lease?: { status: RentalLeaseStatus } | null }): boolean {
  const status = installment.lease?.status;
  return !status || !DEAD_LEASE_STATUSES.includes(status);
}

export function selectInstallmentsToDebit<T extends BackfillInstallment>(
  installments: T[],
  now: Date,
  ctx: { debited: Set<string>; repriced: Set<string> }
): { toDebit: T[]; skippedRepriced: T[] } {
  const toDebit: T[] = [];
  const skippedRepriced: T[] = [];
  for (const installment of installments) {
    if (!isLeaseAlive(installment)) continue;
    if (new Date(installment.due_date) > now) continue;
    const status = computeInstallmentStatus(installment, now, { emitDraft: false });
    if (status === RentalInstallmentStatus.DRAFT || status === RentalInstallmentStatus.CANCELED) continue;
    if (ctx.debited.has(installment.id)) continue;
    if (ctx.repriced.has(installment.id)) {
      skippedRepriced.push(installment);
      continue;
    }
    toDebit.push(installment);
  }
  return { toDebit, skippedRepriced };
}

/** Identifiants d'échéances portés par des pièces `LEASE_REVISION` (`<échéance>:<révision>`). */
export function repricedInstallmentIds(revisionSourceIds: string[]): Set<string> {
  return new Set(revisionSourceIds.map(id => id.split(':')[0]).filter(Boolean));
}
