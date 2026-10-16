import { toCsvString } from '../../csv';
import { toIsoDate } from '../business-days';
import type { DirectDebitFileAdapter, FileInput } from './index';

/**
 * Fichier de remise `GENERIC_CSV` (data-model §7.4) : séparateur `;`, BOM UTF-8,
 * CRLF, neutralisation des formules par `lib/csv.ts`. Une ligne d'en-tête, puis
 * une ligne par opération, dans l'ordre reçu (le service trie par `lineNumber`).
 */

export const GENERIC_CSV_HEADER = [
  'reference_remise',
  'numero_emetteur',
  'creancier',
  'date_echeance',
  'reference_operation',
  'reference_mandat',
  'date_signature_mandat',
  'titulaire',
  'iban',
  'montant',
  'devise',
  'libelle'
] as const;

/** Décimal à point, sans séparateur de milliers, sans décimales s'il est entier. */
export function formatCsvAmount(amount: number): string {
  const fixed = (Math.round(amount * 100) / 100).toFixed(2);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
}

/** Majuscules ASCII : accents retirés, tout autre caractère remplacé par une espace. */
export function toAsciiUpper(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 /.\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function operationLabel(periodMonth: number, periodYear: number, leaseNumber: string): string {
  return toAsciiUpper(`LOYER ${String(periodMonth).padStart(2, '0')}/${periodYear} ${leaseNumber}`);
}

function build(input: FileInput): Buffer {
  const rows: string[][] = [[...GENERIC_CSV_HEADER]];
  for (const line of input.lines) {
    rows.push([
      input.reference,
      input.creditorIdentifier,
      input.creditorLabel,
      toIsoDate(input.collectionDate),
      line.reference,
      line.mandateReference,
      line.mandateSignedAt ? toIsoDate(line.mandateSignedAt) : '',
      line.holderName,
      line.iban,
      formatCsvAmount(line.amount),
      'XOF',
      operationLabel(line.periodMonth, line.periodYear, line.leaseNumber)
    ]);
  }
  return Buffer.from(toCsvString(rows, { separator: ';' }), 'utf8');
}

export const GENERIC_CSV_ADAPTER: DirectDebitFileAdapter = {
  format: 'GENERIC_CSV',
  fileExtension: 'csv',
  contentType: 'text/csv; charset=utf-8',
  build
};
