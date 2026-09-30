/**
 * Mise en forme CSV de l'export complet (lot S7).
 *
 * Meme convention que les exports comptables (`lib/accounting-exports`) :
 * separateur `;` (Excel francais), UTF-8 avec BOM, fins de ligne CRLF.
 * Dates en ISO 8601, montants `Decimal` en texte exact (jamais de flottant),
 * JSON et listes serialises en JSON.
 */

import { FORMULA_START } from '../../lib/csv';

export const CSV_BOM = '﻿';
const SEPARATOR = ';';

function isDecimalLike(value: object): value is { toFixed: () => string; toString: () => string } {
  const ctor = (value as { constructor?: { name?: string; isDecimal?: (v: unknown) => boolean } }).constructor;
  return Boolean(ctor && (ctor.name === 'Decimal' || ctor.isDecimal?.(value)));
}

/** Valeur d'une cellule, avant echappement. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object' && isDecimalLike(value)) return value.toString();
  return JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner));
}

/**
 * Neutralise une formule qu'un tableur executerait a l'ouverture : tout texte
 * qui commence — y compris apres des espaces — par `=`, `+`, `-`, `@`, une
 * tabulation, un retour chariot, ou leurs equivalents pleine chasse (`＝`,
 * `＋`, `－`, `＠`), est prefixe d'une apostrophe. Ne touche que les textes :
 * un montant (Decimal, nombre) reste un nombre.
 */

function neutralizeFormula(text: string, original: unknown): string {
  if (typeof original !== 'string') return text;
  return FORMULA_START.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  const text = neutralizeFormula(formatValue(value), value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(SEPARATOR)}\r\n`;
}
