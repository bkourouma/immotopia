/** Espaces normalisés, U+00A0 et U+202F (séparateurs de milliers) → espace. */
export function normalizeText(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
