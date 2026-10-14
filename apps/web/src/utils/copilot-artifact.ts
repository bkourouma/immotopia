import { activeLocale } from '../i18n/format';
import {
  ARTIFACT_MAX_CHART_POINTS,
  ARTIFACT_MAX_COLUMNS,
  ARTIFACT_MAX_MARKDOWN_CHARS,
  ARTIFACT_MAX_ROWS,
  ARTIFACT_MAX_SERIES,
  type ArtifactCell,
  type CopilotArtifact
} from '../types/copilot';

/**
 * Artefacts d'ImmoCopilot : validation défensive des données reçues, mise en
 * forme et sérialisation CSV. Fonctions pures, testables sans navigateur.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

function cell(v: unknown): ArtifactCell {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function cleanRows(raw: unknown, keys: string[], max: number): Record<string, ArtifactCell>[] {
  if (!Array.isArray(raw)) return [];
  const rows: Record<string, ArtifactCell>[] = [];
  for (const r of raw.slice(0, max)) {
    if (!isRecord(r)) continue;
    const row: Record<string, ArtifactCell> = {};
    for (const key of keys) row[key] = cell(r[key]);
    rows.push(row);
  }
  return rows;
}

const COLUMN_TYPES = ['text', 'number', 'currency', 'date'] as const;
const CHART_TYPES = ['bar', 'line', 'pie'] as const;

/**
 * Valide et borne un artefact reçu du flux. Renvoie `null` si l'objet est mal
 * formé (ignoré par l'appelant) ; tronque ce qui dépasse les limites de l'API.
 */
export function sanitizeArtifact(raw: unknown): CopilotArtifact | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const title = typeof raw.title === 'string' ? raw.title : '';
  if (!id) return null;

  if (raw.kind === 'markdown') {
    if (typeof raw.content !== 'string') return null;
    return { kind: 'markdown', id, title, content: raw.content.slice(0, ARTIFACT_MAX_MARKDOWN_CHARS) };
  }

  if (raw.kind === 'table') {
    if (!Array.isArray(raw.columns)) return null;
    const columns: Extract<CopilotArtifact, { kind: 'table' }>['columns'] = [];
    for (const c of raw.columns) {
      if (!isRecord(c)) continue;
      const key = str(c.key);
      if (!key || columns.some(x => x.key === key)) continue;
      const type = COLUMN_TYPES.find(x => x === c.type);
      columns.push({ key, label: typeof c.label === 'string' && c.label ? c.label : key, ...(type ? { type } : {}) });
      if (columns.length >= ARTIFACT_MAX_COLUMNS) break;
    }
    if (columns.length === 0) return null;
    const total = Array.isArray(raw.rows) ? raw.rows.length : 0;
    return {
      kind: 'table',
      id,
      title,
      columns,
      rows: cleanRows(
        raw.rows,
        columns.map(c => c.key),
        ARTIFACT_MAX_ROWS
      ),
      truncated: raw.truncated === true || total > ARTIFACT_MAX_ROWS || undefined
    };
  }

  if (raw.kind === 'chart') {
    const chartType = CHART_TYPES.find(x => x === raw.chartType);
    const xKey = str(raw.xKey);
    if (!chartType || !xKey || !Array.isArray(raw.series)) return null;
    const series: { key: string; label: string }[] = [];
    for (const s of raw.series) {
      if (!isRecord(s)) continue;
      const key = str(s.key);
      if (!key || series.some(x => x.key === key)) continue;
      series.push({ key, label: typeof s.label === 'string' && s.label ? s.label : key });
      if (series.length >= ARTIFACT_MAX_SERIES) break;
    }
    if (series.length === 0) return null;
    return {
      kind: 'chart',
      id,
      title,
      chartType,
      xKey,
      ...(str(raw.xLabel) ? { xLabel: str(raw.xLabel) } : {}),
      series,
      data: cleanRows(raw.data, [xKey, ...series.map(s => s.key)], ARTIFACT_MAX_CHART_POINTS)
    };
  }
  return null;
}

// --- Libellés -----------------------------------------------------------------

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.[\]-]*$/;

/**
 * Nom technique d'un champ rendu lisible : `internalNotes` -> « Internal notes »,
 * `owner_name` -> « Owner name », `address.city` -> « Address city ». Un texte qui
 * n'est pas un identifiant (déjà un libellé, accents, espaces) reste tel quel.
 */
export function humanizeFieldName(name: string): string {
  if (!IDENTIFIER.test(name)) return name;
  const words = name
    .replace(/\[(\d+)\]/g, ' $1 ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const looksLikeUuid = (text: string): boolean => UUID.test(text.trim());

// --- Affichage ---------------------------------------------------------------

/** Montant : 0 décimale pour un entier, sinon toujours 2 (« 90 000 » et « 90 000,50 », jamais « 90 000,5 »). */
export function formatArtifactAmount(value: number): string {
  const decimals = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat(activeLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/** Cellule formatée pour l'écran (nombre, devise, date selon la langue active). */
export function formatArtifactCell(value: ArtifactCell, type?: 'text' | 'number' | 'currency' | 'date'): string {
  if (value === null || value === undefined) return '';
  if ((type === 'number' || type === 'currency') && typeof value === 'number') {
    if (type === 'currency') return formatArtifactAmount(value);
    return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 6 }).format(value);
  }
  if (type === 'date') {
    const text = String(value);
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    const date = new Date(dateOnly ? `${text}T00:00:00Z` : text);
    if (Number.isNaN(date.getTime())) return text;
    return new Intl.DateTimeFormat(activeLocale(), {
      dateStyle: 'short',
      ...(dateOnly ? { timeZone: 'UTC' } : {})
    }).format(date);
  }
  return String(value);
}

/** Comparaison pour le tri : les valeurs vides toujours en dernier. */
export function compareCells(a: ArtifactCell, b: ArtifactCell): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), activeLocale(), { numeric: true });
}

// --- Export ------------------------------------------------------------------

/**
 * Protection contre l'injection de formules (CSV et XLSX) : une cellule texte
 * qui commence par `=`, `+`, `-`, `@`, tabulation ou retour chariot est
 * préfixée d'une apostrophe, pour qu'un tableur ne l'évalue jamais.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Séparateur CSV : « ; » en français et en arabe (virgule décimale), « , » sinon. */
export function csvSeparator(locale: string = activeLocale()): ';' | ',' {
  const lang = locale.toLowerCase().split('-')[0];
  return lang === 'fr' || lang === 'ar' ? ';' : ',';
}

function csvField(value: ArtifactCell, sep: string): string {
  let text: string;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    text = String(value);
    if (sep === ';') text = text.replace('.', ',');
  } else {
    text = neutralizeFormula(value);
  }
  return /["\r\n]/.test(text) || text.includes(sep) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV complet, sans BOM (ajouté par l'appelant), lignes séparées par CRLF. */
export function toCsv(
  columns: { key: string; label: string }[],
  rows: Record<string, ArtifactCell>[],
  sep: ';' | ',' = csvSeparator()
): string {
  const lines = [columns.map(c => csvField(c.label, sep)).join(sep)];
  for (const row of rows) lines.push(columns.map(c => csvField(row[c.key] ?? null, sep)).join(sep));
  return lines.join('\r\n');
}

/** Libellé de l'axe des abscisses : celui du serveur s'il existe, sinon la clé rendue lisible. */
export function chartXLabel(artifact: Extract<CopilotArtifact, { kind: 'chart' }>): string {
  return artifact.xLabel || humanizeFieldName(artifact.xKey);
}

/** Colonnes et lignes à exporter pour un tableau ou les données d'un graphique. */
export function exportableTable(
  artifact: CopilotArtifact
): { columns: { key: string; label: string }[]; rows: Record<string, ArtifactCell>[] } | null {
  if (artifact.kind === 'table') return { columns: artifact.columns, rows: artifact.rows };
  if (artifact.kind === 'chart') {
    return {
      columns: [
        { key: artifact.xKey, label: chartXLabel(artifact) },
        ...artifact.series.map(s => ({ key: s.key, label: s.label }))
      ],
      rows: artifact.data
    };
  }
  return null;
}

/** Nom de fichier sûr : lettres, chiffres, `.`, `_`, `-` ; jamais de chemin ni de point initial. */
export function safeFilename(title: string, fallback = 'artefact'): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
    .replace(/[-.]+$/g, '');
  return cleaned || fallback;
}
