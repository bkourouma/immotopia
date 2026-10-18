/**
 * Référence de transaction mobile money (spec 047, contracts §0).
 * Normalisée côté serveur : espaces retirés, majuscules, puis contrôlée
 * contre le motif.
 */

export const TRANSACTION_REFERENCE_PATTERN = /^[A-Z0-9.-]{4,40}$/;

/**
 * Retourne la référence normalisée (sans aucun espace, en majuscules) ou
 * `null` si elle sort du motif `TRANSACTION_REFERENCE_PATTERN`.
 */
export function normalizeTransactionReference(input: string): string | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().replace(/\s+/g, '').toUpperCase();
  return TRANSACTION_REFERENCE_PATTERN.test(normalized) ? normalized : null;
}
