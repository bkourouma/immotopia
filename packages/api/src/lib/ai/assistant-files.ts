import { randomUUID } from 'node:crypto';
import { parseString } from 'fast-csv';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';
import type { AnalysisTable, ArtifactCell } from './contracts';
import { readAssistantPdf } from './assistant-pdf';
import { readAssistantWorkbook } from './assistant-workbook';

export const MAX_ASSISTANT_FILES = 5;
export const MAX_ASSISTANT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_COLUMNS = 20;
const MAX_CELL_LENGTH = 500;
const MAX_EXCERPT = 2_000;
const MAX_TABLE_BYTES = 256 * 1024;

export interface AssistantFileExtract {
  name: string;
  excerpt: string;
  table?: AnalysisTable;
}

function invalidFile() {
  return new BadRequestError(t('Ce fichier doit être un document TXT ou un tableau CSV valide en UTF-8.'));
}

function readText(buffer: Buffer) {
  try {
    if (buffer.some(byte => byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) throw invalidFile();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.trim()) throw invalidFile();
    return text;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw invalidFile();
  }
}

async function readCsv(text: string): Promise<string[][]> {
  // Détection sur une ligne d’en-têtes bornée, sans confondre séparateurs et champs entre guillemets.
  const firstLine = text.slice(0, MAX_COLUMNS * (MAX_CELL_LENGTH + 4)).split(/\r?\n/, 1)[0];
  const separators = firstLine.replace(/"(?:[^"]|"")*"/g, '');
  const delimiter = separators.includes(';') ? ';' : separators.includes('\t') ? '\t' : ',';
  const lines: string[][] = [];
  const parser = parseString(text, { delimiter, ignoreEmpty: true, maxRows: MAX_ROWS + 2 });
  try {
    for await (const row of parser) {
      if (row.length > MAX_COLUMNS || row.some((cell: string) => cell.length > MAX_CELL_LENGTH)) {
        throw new BadRequestError(t('Le CSV dépasse les limites de colonnes ou de longueur de cellule.'));
      }
      if (lines.length && row.length !== lines[0].length) throw invalidFile();
      lines.push(row);
    }
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw invalidFile();
  } finally {
    parser.destroy();
  }
  return lines;
}

export async function extractAssistantFile(file: Express.Multer.File, tenantId: string): Promise<AssistantFileExtract> {
  const name = file.originalname
    .replace(/[/\\]/g, '')
    .split('')
    .filter(character => character >= ' ' && character.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 180);
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension === 'pdf') return { name, excerpt: await readAssistantPdf(file.buffer, MAX_EXCERPT) };
  if (extension === 'txt') return { name, excerpt: readText(file.buffer).slice(0, MAX_EXCERPT) };
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new BadRequestError(t('Formats acceptés pour les pièces jointes : CSV, TXT, XLSX et PDF.'));
  }
  const workbook =
    extension === 'xlsx'
      ? await readAssistantWorkbook(file.buffer, { rows: MAX_ROWS, columns: MAX_COLUMNS, cellLength: MAX_CELL_LENGTH })
      : undefined;
  const [labels, ...records] = workbook?.lines ?? (await readCsv(readText(file.buffer)));
  if (!labels?.length || !labels.every(label => label.trim()) || records.length === 0) {
    throw new BadRequestError(
      t('Le tableau importé doit contenir une ligne d’en-têtes et au moins une ligne de données.')
    );
  }
  const columns: AnalysisTable['columns'] = labels.map((label, index) => ({
    key: 'column' + (index + 1),
    label,
    type:
      records.every(row => !row[index].trim() || isNumber(row[index])) && records.some(row => isNumber(row[index]))
        ? 'number'
        : 'text'
  }));
  const parsedRows = records.slice(0, MAX_ROWS).map(row =>
    Object.fromEntries(
      columns.map(({ key, type }, index): [string, ArtifactCell] => {
        const value = row[index];
        return [key, type === 'number' ? (value.trim() ? Number(value.replace(',', '.')) : null) : value];
      })
    )
  );
  const rows: AnalysisTable['rows'] = [];
  let bytes = 0;
  for (const row of parsedRows) {
    bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
    if (bytes > MAX_TABLE_BYTES) break;
    rows.push(row);
  }
  const calculatedAt = new Date().toISOString();
  const table: AnalysisTable = {
    id: randomUUID(),
    kind: 'table',
    title: name,
    columns,
    rows,
    truncated: records.length > rows.length,
    provenance: {
      source: t('Fichier importé'),
      scope: 'attachment',
      href: '/tenant/' + encodeURIComponent(tenantId) + '/assistant',
      period: calculatedAt.slice(0, 10),
      calculatedAt,
      rules: [
        workbook
          ? t('La première ligne non vide de la feuille « {{sheet}} » contient les en-têtes.', {
              sheet: workbook.sheetName
            })
          : t('La première ligne du CSV contient les en-têtes.'),
        t('La devise des données importées doit être confirmée avant toute comparaison financière.')
      ]
    }
  };
  const excerpt = JSON.stringify({ columns, rows: rows.slice(0, 5) }).slice(0, MAX_EXCERPT);
  return { name, excerpt, table };
}

function isNumber(value: string) {
  return /^-?(?:0|[1-9]\d{0,11})(?:[.,]\d{1,6})?$/.test(value.trim());
}
