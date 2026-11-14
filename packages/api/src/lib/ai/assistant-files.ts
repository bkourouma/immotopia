import { randomUUID } from 'node:crypto';
import { parseString } from 'fast-csv';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';
import type { AnalysisTable, ArtifactCell } from './contracts';

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
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text) || !text.trim()) throw invalidFile();
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
  const name = file.originalname.replace(/[\x00-\x1F\x7F/\\]/g, '').slice(0, 180);
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension !== 'txt' && extension !== 'csv') throw invalidFile();

  const text = readText(file.buffer);
  if (extension === 'txt') return { name, excerpt: text.slice(0, MAX_EXCERPT) };

  const [labels, ...records] = await readCsv(text);
  if (!labels || labels.length < 2 || !labels.every(label => label.trim()) || records.length === 0) throw invalidFile();
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
      href: '/tenant/' + encodeURIComponent(tenantId) + '/assistant',
      period: calculatedAt.slice(0, 10),
      calculatedAt,
      rules: [
        t('La première ligne du CSV contient les en-têtes.'),
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
