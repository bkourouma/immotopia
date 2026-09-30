/**
 * Pénalité de retard d'un appel de charges : même règle que l'API
 * (`computeLatePenalty`, lib/syndics/finance-utils.ts). Le taux est MENSUEL,
 * proratisé au nombre de jours de retard (mois de 30 jours), au moins un jour,
 * et la pénalité ne dépasse jamais le reste dû. Sert à l'aperçu avant
 * validation ; l'API reste seule juge du montant enregistré.
 */

/** Taux mensuel maximal accepté (en %), aligné sur l'API. */
export const MAX_MONTHLY_PENALTY_RATE = 10;

export function computeLatePenaltyPreview(outstanding: number, monthlyRatePercent: number, daysLate: number): number {
  const raw = Math.round(((outstanding * monthlyRatePercent * Math.max(daysLate, 1)) / 3000) * 100) / 100;
  return Math.min(raw, Math.round(outstanding * 100) / 100);
}
