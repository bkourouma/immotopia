/** Espaces normalisés, U+00A0 et U+202F (séparateurs de milliers) → espace. */
export function normalizeText(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tiret de remplissage : l'écran affiche « - » (ou « – », « — ») quand la
 * valeur manque. Dans un fichier, ce n'est pas une donnée : la cellule doit
 * être vide. Sans cela, la neutralisation des formules (tout texte qui
 * commence par `-`) l'écrirait « '- ». Seul un tiret SEUL est visé : « -5 »
 * ou « -1+2 » restent des textes et sont neutralisés comme les autres.
 */
export function isDashPlaceholder(text: string): boolean {
  return /^[-–—]$/.test(normalizeText(text));
}
