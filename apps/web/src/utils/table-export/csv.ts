import { neutralizeFormula } from '../copilot-artifact';
import type { ExportCell, ExportTable } from './types';

/**
 * CSV : séparateur « ; », BOM UTF-8 (Excel lit alors les accents et l'arabe),
 * fins de ligne CRLF, guillemets RFC 4180, formules neutralisées.
 *
 * Texte affiché, sauf les cellules numériques : écrites SANS séparateur de
 * milliers et avec le séparateur décimal de la langue (« , » en fr/ar, « . »
 * en en), pour qu'Excel les reconnaisse comme des nombres.
 */

export const CSV_SEPARATOR = ';';
export const CSV_BOM = '\uFEFF';

function decimalSeparator(language: string): string {
  return language === 'en' ? '.' : ',';
}

function numberText(value: number, language: string): string {
  // `String(1e21)` passerait en notation scientifique : on force le décimal.
  const plain =
    Number.isInteger(value) && Math.abs(value) < 1e21 ? String(value) : value.toFixed(10).replace(/\.?0+$/, '');
  return plain.replace('.', decimalSeparator(language));
}

function quote(text: string): string {
  return /["\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellText(cell: ExportCell, language: string): string {
  if (cell.kind === 'number' && typeof cell.value === 'number') return numberText(cell.value, language);
  if (cell.kind === 'empty') return '';
  const text = cell.indent ? `${'  '.repeat(cell.indent)}${cell.text}` : cell.text;
  return neutralizeFormula(text);
}

export function toCsvString(table: ExportTable, language: string): string {
  const lines = [table.columns.map(c => quote(neutralizeFormula(c.header))).join(CSV_SEPARATOR)];
  for (const row of table.rows) lines.push(row.map(cell => quote(cellText(cell, language))).join(CSV_SEPARATOR));
  return CSV_BOM + lines.join('\r\n');
}

export function buildCsvBlob(table: ExportTable, language: string): Blob {
  return new Blob([toCsvString(table, language)], { type: 'text/csv;charset=utf-8' });
}
