import { BadRequestError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import {
  RETURN_FILE_MAX_BYTES,
  RETURN_FILE_MAX_ROWS,
  type DirectDebitReturnAdapter,
  type ReturnParseResult,
  type ReturnRecord
} from './types';

/**
 * Retour CSV générique (spec 042, P3, data-model §8.5).
 *
 * Parseur maison, pur (aucun accès base, aucune dépendance) : UTF-8 (BOM
 * accepté), séparateur `;` (ou `,` si l'en-tête l'emploie), CRLF ou LF,
 * champs entre guillemets RFC 4180. Une ligne illisible donne une entrée
 * `errors` (jamais la valeur fautive) et n'arrête pas la lecture.
 */

const REQUIRED_COLUMNS = ['reference_operation', 'statut', 'date', 'montant'] as const;
const OPTIONAL_COLUMNS = ['code_rejet', 'motif'] as const;
type Column = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

const REJECTION_CODE_MAX = 20;
const REJECTION_REASON_MAX = 500;
const AMOUNT_MAX_INTEGER_DIGITS = 12;

const OPERATION_REFERENCE = /^PRL-\d{4}-\d{4}-\d{3}$/;

const SETTLED_STATUSES = new Set(['REGLE', 'REGLEE', 'PAYE', 'OK']);
const REJECTED_STATUSES = new Set(['REJETE', 'REJET', 'KO']);

interface RawRow {
  /** Numéro de la ligne physique où l'enregistrement commence (en-tête = 1). */
  row: number;
  fields: string[];
  /** Guillemet jamais refermé : le reste du fichier a été absorbé. */
  unterminated: boolean;
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Nom de colonne comparable : sans accents, casse, espaces ni soulignés. */
function normalizeHeader(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}

/** Même clé pour les noms attendus (`reference_operation` -> `referenceoperation`). */
const COLUMN_BY_KEY = new Map<string, Column>(
  [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map(column => [normalizeHeader(column), column])
);

function decode(buffer: Buffer): string {
  if (buffer.length > RETURN_FILE_MAX_BYTES) {
    throw new BadRequestError(
      t('Le fichier de retour est trop volumineux ({{max}} Mo au maximum).', {
        max: RETURN_FILE_MAX_BYTES / (1024 * 1024)
      })
    );
  }
  const notText = () => new BadRequestError(t("Le fichier de retour n'est pas un fichier texte UTF-8 lisible."));
  if (buffer.includes(0)) throw notText();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw notText();
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** `;` sauf si la première ligne non vide emploie `,` et aucun `;`. */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/).find(line => line.trim() !== '') ?? '';
  return !firstLine.includes(';') && firstLine.includes(',') ? ',' : ';';
}

/**
 * Découpe RFC 4180 : guillemets doublés, séparateur et saut de ligne permis
 * dans un champ cité. Les lignes entièrement vides sont ignorées. Lève si le
 * nombre de lignes de données dépasse `RETURN_FILE_MAX_ROWS`.
 */
function splitRows(text: string, separator: string): RawRow[] {
  const rows: RawRow[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let startLine = 1;
  let inQuotes = false;
  let fieldStart = true;
  let sawContent = false;

  const endField = () => {
    fields.push(field);
    field = '';
    fieldStart = true;
  };
  const endRow = (unterminated = false) => {
    endField();
    const blank = fields.every(value => value.trim() === '');
    if (!blank || unterminated) {
      rows.push({ row: startLine, fields, unterminated });
      // L'en-tête (premier enregistrement) ne compte pas parmi les données.
      if (rows.length - 1 > RETURN_FILE_MAX_ROWS) {
        throw new BadRequestError(
          t('Le fichier de retour compte trop de lignes ({{max}} au maximum).', {
            max: RETURN_FILE_MAX_ROWS
          })
        );
      }
    }
    fields = [];
    sawContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!sawContent) startLine = line;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        line++;
        field += '\n';
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      sawContent = true;
    } else if (char === separator) {
      sawContent = true;
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
    } else {
      field += char;
      fieldStart = false;
      sawContent = true;
    }
  }

  if (inQuotes) endRow(true);
  else if (sawContent) endRow();

  return rows;
}

function parseDate(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (fr) {
    [year, month, day] = [Number(fr[3]), Number(fr[2]), Number(fr[1])];
  } else {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAmount(value: string): number | null {
  // Espaces de milliers : `\s` couvre aussi les insécables (U+00A0, U+202F).
  const text = value.replace(/\s/g, '');
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match || match[1].length > AMOUNT_MAX_INTEGER_DIGITS) return null;
  const amount = Number(`${match[1]}.${match[2] ?? '0'}`);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseOutcome(value: string): ReturnRecord['outcome'] | null {
  const key = stripAccents(value).trim().toUpperCase();
  if (SETTLED_STATUSES.has(key)) return 'SETTLED';
  if (REJECTED_STATUSES.has(key)) return 'REJECTED';
  return null;
}

/**
 * Code de rejet : on retire ce qui sort de `[A-Za-z0-9_-]` (au lieu de
 * refuser la ligne) puis on tronque à 20 caractères. Vide : `null`.
 */
function cleanRejectionCode(value: string): string | null {
  const code = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, REJECTION_CODE_MAX);
  return code === '' ? null : code;
}

/**
 * Motif : les caractères de contrôle (sauts de ligne compris) deviennent une
 * espace pour ne pas coller deux mots, puis on tronque à 500. Vide : `null`.
 */
function cleanRejectionReason(value: string): string | null {
  // eslint-disable-next-line no-control-regex
  const reason = value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
  return reason === '' ? null : reason.slice(0, REJECTION_REASON_MAX);
}

function parse(buffer: Buffer): ReturnParseResult {
  const text = decode(buffer);
  const rows = splitRows(text, detectSeparator(text));
  const result: ReturnParseResult = { records: [], errors: [] };

  const headerError = (): ReturnParseResult => {
    result.errors.push({
      row: 1,
      message: t('En-tête manquant ou incomplet : colonnes attendues reference_operation, statut, date et montant.')
    });
    return result;
  };

  if (rows.length === 0) return headerError();

  const [header, ...dataRows] = rows;
  const index = new Map<Column, number>();
  header.fields.forEach((name, position) => {
    const column = COLUMN_BY_KEY.get(normalizeHeader(name));
    if (column && !index.has(column)) index.set(column, position);
  });
  if (header.unterminated || REQUIRED_COLUMNS.some(column => !index.has(column))) {
    return headerError();
  }

  const cell = (fields: string[], column: Column): string => {
    const position = index.get(column);
    return position === undefined ? '' : (fields[position] ?? '');
  };

  for (const raw of dataRows) {
    const fail = (message: string) => result.errors.push({ row: raw.row, message });

    if (raw.unterminated) {
      fail(t('Ligne illisible : guillemet non refermé.'));
      continue;
    }

    const operationReference = cell(raw.fields, 'reference_operation').trim().toUpperCase();
    if (!OPERATION_REFERENCE.test(operationReference)) {
      fail(t("Référence d'opération invalide (forme attendue PRL-AAAA-NNNN-RRR)."));
      continue;
    }
    const outcome = parseOutcome(cell(raw.fields, 'statut'));
    if (!outcome) {
      fail(t('Statut non reconnu.'));
      continue;
    }
    const date = parseDate(cell(raw.fields, 'date'));
    if (!date) {
      fail(t('Date invalide (AAAA-MM-JJ ou JJ/MM/AAAA attendu).'));
      continue;
    }
    const amount = parseAmount(cell(raw.fields, 'montant'));
    if (amount === null) {
      fail(t('Montant invalide (nombre positif à deux décimales au plus attendu).'));
      continue;
    }

    result.records.push({
      row: raw.row,
      operationReference,
      outcome,
      date,
      amount,
      rejectionCode: cleanRejectionCode(cell(raw.fields, 'code_rejet')),
      rejectionReason: cleanRejectionReason(cell(raw.fields, 'motif'))
    });
  }

  return result;
}

export const genericCsvReturnAdapter: DirectDebitReturnAdapter = {
  format: 'GENERIC_CSV',
  parse
};
