import { RentalBillingFrequency } from '@prisma/client';

/**
 * Calcul pur des périodes de facturation d'un bail (sans Prisma).
 *
 * Règles :
 * - la première période commence à la date de début du bail (n'importe quel jour) ;
 * - chaque période se termine le dernier jour du dernier mois calendaire qu'elle
 *   couvre (mensuel : fin du mois de début ; trimestriel : 3 mois ; etc.), donc
 *   la suivante commence toujours le 1er d'un mois ;
 * - une échéance par période COMMENÇANT à l'intérieur du bail ; une période
 *   suivante réduite au seul dernier jour du bail (début == fin) n'est pas
 *   facturée (un bail du 01/07/2026 au 01/07/2027 a 12 échéances mensuelles) ;
 * - sans date de fin, l'horizon est un an : jusqu'à la veille de l'anniversaire.
 */

const CYCLE_MONTHS: Record<RentalBillingFrequency, number> = {
  [RentalBillingFrequency.MONTHLY]: 1,
  [RentalBillingFrequency.QUARTERLY]: 3,
  [RentalBillingFrequency.SEMIANNUAL]: 6,
  [RentalBillingFrequency.ANNUAL]: 12
};

export interface BillingPeriod {
  start: Date;
  end: Date;
}

function dayStart(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/**
 * Fin de la période commençant à `startDate`. Calcul par arithmétique de mois
 * sur (année, mois) : jamais de `setMonth` depuis un jour 29-31, qui déborderait
 * sur le mois suivant et ferait sauter un mois entier.
 */
export function calculatePeriodEnd(startDate: Date, frequency: RentalBillingFrequency): Date {
  const cycle = CYCLE_MONTHS[frequency] ?? 1;
  // Jour 0 du mois (début + cycle) = dernier jour du mois (début + cycle - 1).
  return new Date(startDate.getFullYear(), startDate.getMonth() + cycle, 0);
}

export function listBillingPeriods(
  leaseStart: Date,
  leaseEnd: Date | null,
  frequency: RentalBillingFrequency
): BillingPeriod[] {
  const first = dayStart(leaseStart);
  let horizon: Date;
  if (leaseEnd) {
    horizon = dayStart(leaseEnd);
  } else {
    horizon = new Date(first.getFullYear() + 1, first.getMonth(), first.getDate());
    // 29/02 -> 01/03 : on retombe sur le dernier jour de février.
    if (horizon.getMonth() !== first.getMonth()) horizon = new Date(first.getFullYear() + 1, first.getMonth() + 1, 0);
    horizon.setDate(horizon.getDate() - 1);
  }

  const periods: BillingPeriod[] = [];
  let start = first;
  while (start <= horizon) {
    // Période finale d'un seul jour (hors première) : non facturée.
    if (periods.length > 0 && start.getTime() === horizon.getTime()) break;
    const end = calculatePeriodEnd(start, frequency);
    periods.push({ start, end: end > horizon ? new Date(horizon) : end });
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  return periods;
}
