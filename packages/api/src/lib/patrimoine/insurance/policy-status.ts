/**
 * Statut dérivé d'une police d'assurance (lot B1, spec 032). Jamais stocké :
 * calculé à la date du jour, par jour calendaire UTC.
 */

export type PolicyStatus = 'UPCOMING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';

export const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Minuit UTC du jour calendaire de `date`, en millisecondes. */
function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Nombre de jours calendaires entre `now` et la fin de la police (négatif si échue). */
export function daysToExpiry(policy: { endDate: Date }, now: Date): number {
  return Math.round((utcDayStart(policy.endDate) - utcDayStart(now)) / DAY_MS);
}

export function derivePolicyStatus(policy: { startDate: Date; endDate: Date }, now: Date): PolicyStatus {
  const today = utcDayStart(now);
  if (utcDayStart(policy.startDate) > today) return 'UPCOMING';
  if (utcDayStart(policy.endDate) < today) return 'EXPIRED';
  if (daysToExpiry(policy, now) <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

/**
 * Traduction d'un statut dérivé en conditions Prisma sur `startDate`/`endDate`,
 * mêmes bornes que `derivePolicyStatus` (jours calendaires UTC) : permet de
 * filtrer en base plutôt qu'après lecture d'une liste tronquée.
 */
export function policyStatusWhere(
  status: PolicyStatus,
  now: Date
): { startDate?: { gte?: Date; lt?: Date }; endDate?: { gte?: Date; lt?: Date } } {
  const today = new Date(utcDayStart(now));
  const tomorrow = new Date(utcDayStart(now) + DAY_MS);
  // `daysToExpiry <= 30` équivaut à `endDate < aujourd'hui + 31 jours`.
  const afterSoonWindow = new Date(utcDayStart(now) + (EXPIRING_SOON_DAYS + 1) * DAY_MS);
  switch (status) {
    case 'UPCOMING':
      return { startDate: { gte: tomorrow } };
    case 'EXPIRED':
      return { endDate: { lt: today } };
    case 'EXPIRING_SOON':
      return { startDate: { lt: tomorrow }, endDate: { gte: today, lt: afterSoonWindow } };
    case 'ACTIVE':
      return { startDate: { lt: tomorrow }, endDate: { gte: afterSoonWindow } };
  }
}
