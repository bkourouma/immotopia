import { activeLocale } from '../i18n/format';
import { t } from '../i18n/t';
import {
  ANALYSIS_CHART_TYPES,
  ARTIFACT_MAX_CHART_POINTS,
  ARTIFACT_MAX_COLUMNS,
  ARTIFACT_MAX_MARKDOWN_CHARS,
  ARTIFACT_MAX_PIVOT_COLUMNS,
  ARTIFACT_MAX_ROWS,
  ARTIFACT_MAX_SERIES,
  type ArtifactCell,
  type AnalysisChartSeries,
  type ArtifactIndicator,
  type ArtifactDocumentBlock,
  type ArtifactProvenance,
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

export function artifactInternalLink(value: unknown): string | undefined {
  return typeof value === 'string' && /^\/tenant\/[A-Za-z0-9_-]+\/[A-Za-z0-9_/-]+$/.test(value) ? value : undefined;
}

function sanitizeProvenance(raw: unknown): ArtifactProvenance | undefined {
  if (!isRecord(raw)) return undefined;
  const { source, period, calculatedAt, rules } = raw;
  const href = artifactInternalLink(raw.href);
  if (
    typeof source !== 'string' ||
    typeof period !== 'string' ||
    typeof calculatedAt !== 'string' ||
    !Number.isFinite(Date.parse(calculatedAt)) ||
    !href ||
    !Array.isArray(rules)
  )
    return undefined;
  return {
    source,
    href,
    period,
    calculatedAt,
    rules: rules.filter((rule): rule is string => typeof rule === 'string').slice(0, 20)
  };
}

/**
 * Valide et borne un artefact reçu du flux. Renvoie `null` si l'objet est mal
 * formé (ignoré par l'appelant) ; tronque ce qui dépasse les limites de l'API.
 */
export function canRefreshArtifact(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  switch (raw.kind) {
    case 'table':
      return isRecord(raw.query);
    case 'indicators':
    case 'chart':
      return isRecord(raw.replay);
    case 'document':
      return (
        Array.isArray(raw.blocks) &&
        raw.blocks.some(
          block => isRecord(block) && block.kind === 'table' && isRecord(block.table) && isRecord(block.table.query)
        )
      );
    default:
      return false;
  }
}

export function sanitizeArtifact(raw: unknown): (CopilotArtifact & { canRefresh?: boolean }) | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const title = typeof raw.title === 'string' ? raw.title : '';
  if (!id) return null;
  const refresh = canRefreshArtifact(raw) ? { canRefresh: true } : {};

  if (raw.kind === 'document') {
    if (!Array.isArray(raw.blocks)) return null;
    const blocks: ArtifactDocumentBlock[] = [];
    for (const block of raw.blocks.slice(0, 20)) {
      if (!isRecord(block)) continue;
      if (block.kind === 'text' && typeof block.content === 'string') {
        blocks.push({ kind: 'text', content: block.content.slice(0, 4000) });
      }
      if (block.kind === 'table' && isRecord(block.table) && block.table.kind === 'table') {
        const table = sanitizeArtifact(block.table);
        if (table?.kind === 'table') blocks.push({ kind: 'table', table });
      }
    }
    return blocks.length ? { kind: 'document', id, title, blocks, ...refresh } : null;
  }

  if (raw.kind === 'indicators') {
    if (!Array.isArray(raw.cards)) return null;
    const cards: ArtifactIndicator[] = [];
    for (const item of raw.cards.slice(0, 12)) {
      if (!isRecord(item) || !str(item.label) || typeof item.value !== 'number' || !Number.isFinite(item.value))
        continue;
      const card: ArtifactIndicator = { label: String(item.label).slice(0, 400), value: item.value };
      if (typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency)) card.currency = item.currency;
      const cmp = item.comparison;
      if (
        isRecord(cmp) &&
        typeof cmp.label === 'string' &&
        typeof cmp.value === 'number' &&
        Number.isFinite(cmp.value)
      ) {
        card.comparison = { label: cmp.label.slice(0, 400), value: cmp.value };
        if (typeof cmp.change === 'number' && Number.isFinite(cmp.change)) card.comparison.change = cmp.change;
      }
      cards.push(card);
    }
    if (cards.length === 0) return null;
    const provenance = sanitizeProvenance(raw.provenance);
    return { kind: 'indicators', id, title, cards, ...refresh, ...(provenance ? { provenance } : {}) };
  }

  if (raw.kind === 'markdown') {
    if (typeof raw.content !== 'string') return null;
    return { kind: 'markdown', id, title, content: raw.content.slice(0, ARTIFACT_MAX_MARKDOWN_CHARS) };
  }

  if (raw.kind === 'table') {
    if (!Array.isArray(raw.columns)) return null;
    const columns: Extract<CopilotArtifact, { kind: 'table' }>['columns'] = [];
    const maxColumns = isRecord(raw.totals) ? ARTIFACT_MAX_PIVOT_COLUMNS : ARTIFACT_MAX_COLUMNS;
    for (const c of raw.columns) {
      if (!isRecord(c)) continue;
      const key = str(c.key);
      if (!key || columns.some(x => x.key === key)) continue;
      const type = COLUMN_TYPES.find(x => x === c.type);
      const linkKey =
        typeof c.linkKey === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(c.linkKey) ? c.linkKey : undefined;
      columns.push({
        key,
        label: typeof c.label === 'string' && c.label ? c.label : key,
        ...(type ? { type } : {}),
        ...(linkKey ? { linkKey } : {})
      });
      if (columns.length >= maxColumns) break;
    }
    if (columns.length === 0) return null;
    const total = Array.isArray(raw.rows) ? raw.rows.length : 0;
    const provenance = sanitizeProvenance(raw.provenance);
    const [totals] = cleanRows(
      [raw.totals],
      columns.map(column => column.key),
      1
    );
    return {
      kind: 'table',
      id,
      title,
      columns,
      rows: cleanRows(
        raw.rows,
        columns.flatMap(c => (c.linkKey ? [c.key, c.linkKey] : [c.key])),
        ARTIFACT_MAX_ROWS
      ),
      truncated: raw.truncated === true || total > ARTIFACT_MAX_ROWS || undefined,
      ...(totals ? { totals } : {}),
      ...refresh,
      ...(provenance ? { provenance } : {})
    };
  }

  if (raw.kind === 'chart') {
    const chartType = ANALYSIS_CHART_TYPES.find(x => x === raw.chartType);
    const xKey = str(raw.xKey);
    if (!chartType || !xKey || !Array.isArray(raw.series)) return null;
    const series: AnalysisChartSeries[] = [];
    for (const s of raw.series) {
      if (!isRecord(s)) continue;
      const key = str(s.key);
      if (!key || series.some(x => x.key === key)) continue;
      series.push({
        key,
        label: typeof s.label === 'string' && s.label ? s.label : key,
        ...(chartType === 'combo' && (s.form === 'bar' || s.form === 'line') ? { form: s.form } : {}),
        ...(chartType === 'combo' && s.axis === 'secondary' ? { axis: 'secondary' } : {})
      });
      if (series.length >= (chartType === 'combo' ? 12 : ARTIFACT_MAX_SERIES)) break;
    }
    if (series.length === 0) return null;
    const provenance = sanitizeProvenance(raw.provenance);
    return {
      kind: 'chart',
      id,
      title,
      chartType,
      xKey,
      ...(str(raw.xLabel) ? { xLabel: str(raw.xLabel) } : {}),
      series,
      data: cleanRows(raw.data, [xKey, ...series.map(s => s.key)], ARTIFACT_MAX_CHART_POINTS),
      ...refresh,
      ...(provenance ? { provenance } : {})
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
  if (artifact.kind === 'table') {
    return { columns: artifact.columns, rows: artifact.totals ? [...artifact.rows, artifact.totals] : artifact.rows };
  }
  if (artifact.kind === 'indicators') {
    return {
      columns: [
        { key: 'label', label: t('Indicateur') },
        { key: 'value', label: t('Valeur') },
        { key: 'currency', label: t('Devise') },
        { key: 'comparisonLabel', label: t('Comparaison') },
        { key: 'comparisonValue', label: t('Valeur de référence') },
        { key: 'change', label: t('Variation (%)') }
      ],
      rows: artifact.cards.map(card => ({
        label: card.label,
        value: card.value,
        currency: card.currency ?? null,
        comparisonLabel: card.comparison?.label ?? null,
        comparisonValue: card.comparison?.value ?? null,
        change: card.comparison?.change ?? null
      }))
    };
  }
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
