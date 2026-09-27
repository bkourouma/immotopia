/**
 * Caractères propres à WinAnsi (Windows-1252) au-delà de Latin-1 : ceux que
 * pdf-lib sait aussi encoder avec les polices standard (`Helvetica`).
 */
const WINANSI_EXTRA_CHARS = 'ŒœŠšŸŽžƒˆ˜' + '–—‘’‚“”„†‡•…‰‹›€™';
const WINANSI_SAFE_PATTERN = new RegExp(`[^\\u0000-\\u00FF${WINANSI_EXTRA_CHARS}]`, 'g');

/**
 * Nettoie un texte avant de le dessiner dans le PDF.
 *
 * La police standard `Helvetica` de pdf-lib encode en WinAnsi. Or
 * `toLocaleString('fr-FR')` (utilisé par `money()` et par le formatage des
 * dates) sépare les groupes de chiffres par une espace fine insécable
 * (U+202F, parfois U+00A0 selon l'environnement Node) : ce caractère est hors
 * de ce jeu et faisait lever `drawText` — « WinAnsi cannot encode U+202F » —
 * dès qu'un montant atteignait quatre chiffres, sur toutes les copropriétés.
 *
 * Les noms, libellés et adresses viennent de saisies libres (l'application
 * est trilingue fr/en/ar) : par prudence, tout autre caractère qui ne serait
 * pas encodable en WinAnsi est remplacé par « ? » plutôt que de faire échouer
 * la génération du relevé. Cette fonction est appliquée à chaque appel de
 * `drawText` de ce fichier via le petit wrapper `draw()` ci-dessous.
 */
export function sanitizeForPdf(text: string): string {
  // Caract\u00E8res de contr\u00F4le (retour \u00E0 la ligne d'une adresse saisie sur deux
  // lignes, tabulation\u2026) : `drawText` ne sait pas les encoder et levait.
  return text
    .replace(CONTROL_CHARS, ' ')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(WINANSI_SAFE_PATTERN, '?');
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
