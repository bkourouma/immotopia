/**
 * Export CSV partagé (RFC 4180) : UN seul endroit pour échapper une cellule.
 *
 * - un champ contenant le séparateur, un guillemet, un saut de ligne ou une
 *   tabulation est entouré de guillemets doubles, les guillemets sont doublés ;
 * - un texte commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot
 *   (ou d'espaces puis de ces caractères, y compris pleine chasse) est préfixé d'une
 *   apostrophe (injection de formules dans Excel) ; les
 *   nombres, les chaînes purement numériques (« -350000 », « -12,5 ») et le
 *   tiret « - » isolé ne sont pas touchés ;
 * - lignes séparées par CRLF ; BOM UTF-8 par défaut pour Excel.
 */
export type CsvValue = string | number | boolean | Date | null | undefined;

const NUMERIC = /^[-+]?\d+([.,]\d+)?$/;

/**
 * Debut de texte qu'un tableur executerait comme une formule : `=`, `+`, `-`,
 * `@`, y compris apres des espaces de tete, leurs equivalents pleine chasse
 * (`＝`, `＋`, `－`, `＠`), ou une tabulation / un retour chariot initial.
 * Definition UNIQUE, partagee avec `services/tenant-data-export/csv.ts`.
 */
export const FORMULA_START = /^[\t\r]|^\s*[=+\-@＝＋－＠]/;

export function csvCell(value: CsvValue, separator = ','): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text) && text.trim() !== '-' && !NUMERIC.test(text)) {
    text = `'${text}`;
  }
  const needsQuotes = text.includes(separator) || /["\r\n\t]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: CsvValue[], separator = ','): string {
  return values.map(v => csvCell(v, separator)).join(separator);
}

export function toCsvString(rows: CsvValue[][], options: { separator?: string; bom?: boolean } = {}): string {
  const separator = options.separator ?? ',';
  const body = rows.map(row => csvRow(row, separator)).join('\r\n');
  return (options.bom === false ? '' : '﻿') + body;
}
