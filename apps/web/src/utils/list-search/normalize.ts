/**
 * Jour calendaire `aaaa-mm-jj` d'une date, en heure locale.
 * Une date invalide donne une chaîne vide.
 */
export function toLocalDay(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Forme comparable d'une valeur pour la recherche : sans diacritiques, en
 * minuscules, espaces compactés. `null` et `undefined` donnent `''`, une date
 * son jour `aaaa-mm-jj`.
 */
export function normalizeText(value: unknown): string {
  const raw = value instanceof Date ? toLocalDay(value) : String(value ?? '');
  return (
    raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Apostrophes typographiques ramenées à l'apostrophe droite : « d'Ivoire »
      // saisi au clavier doit trouver « d’Ivoire » enregistré.
      .replace(/[‘’ʼ]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  );
}
