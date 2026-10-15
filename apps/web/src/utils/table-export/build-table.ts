import type { ReactNode } from 'react';
import type { ColumnsType } from 'antd/es/table/interface';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import { resolveExportColumns, getByPath, type ExportColumn } from './columns';
import { normalizeText } from './text';
import type { ExportCell, ExportRawValue, ExportTable } from './types';

/**
 * Construit le `ExportTable` neutre à partir de colonnes Ant Design et de
 * lignes. Priorité de la valeur d'une cellule :
 *
 *   `exportValue` > texte RENDU de la cellule (si `render`) > valeur brute.
 *
 * Le texte rendu d'un élément React ne s'obtient qu'en le montant : l'appelant
 * fournit `renderNodes`, qui monte un paquet de nœuds (dans un portail du menu
 * d'export, donc avec tous les contextes de l'application) et rend leur
 * `textContent`. `null` à une position = la cellule a levé : repli sur la
 * valeur brute.
 */

/** Cellules montées par paquet, pour ne pas figer l'onglet. */
export const RENDER_BATCH_SIZE = 300;

export type RenderNodes = (nodes: ReactNode[]) => Promise<(string | null)[]>;

export interface BuildTableOptions {
  /** Absent : seules les cellules dont le rendu est du texte simple sont lues. */
  renderNodes?: RenderNodes;
  /** Nom de la propriété des lignes enfants (données arborescentes). */
  childrenColumnName?: string;
  /** Appelé après chaque paquet (0..1). */
  onProgress?: (ratio: number) => void;
}

interface Entry<T> {
  record: T;
  depth: number;
}

function flatten<T>(rows: readonly T[], childrenKey: string, depth = 0, out: Entry<T>[] = []): Entry<T>[] {
  for (const record of rows) {
    out.push({ record, depth });
    const children = (record as Record<string, unknown> | null)?.[childrenKey];
    if (Array.isArray(children) && children.length > 0) flatten(children as T[], childrenKey, depth + 1, out);
  }
  return out;
}

/** Décimale « brute » : `12`, `-3.5`, `1250000.00`. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

function isPlainDecimal(raw: string): boolean {
  if (!DECIMAL.test(raw)) return false;
  // « 0707123456 » est un téléphone, « 12345678901234567890 » dépasse la précision d'un double.
  if (/^-?0\d/.test(raw)) return false;
  return raw.replace(/^-/, '').replace(/\..*$/, '').length <= 15;
}

function formatRaw(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  if (typeof raw === 'boolean') return raw ? t('Oui') : t('Non');
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? '' : raw.toLocaleDateString(activeLocale());
  if (Array.isArray(raw)) return raw.map(formatRaw).filter(Boolean).join(', ');
  return '';
}

function typedFromValue(value: ExportRawValue): ExportCell {
  if (value === null || value === undefined || value === '') return { text: '', value: null, kind: 'empty' };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { text: String(value), value, kind: 'number' }
      : { text: '', value: null, kind: 'empty' };
  }
  if (typeof value === 'boolean') return { text: formatRaw(value), value, kind: 'boolean' };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { text: '', value: null, kind: 'empty' }
      : { text: formatRaw(value), value, kind: 'date' };
  }
  const text = normalizeText(String(value));
  return text ? { text, value: text, kind: 'text' } : { text: '', value: null, kind: 'empty' };
}

/**
 * Typage d'une cellule issue de la valeur brute et du texte rendu.
 *
 * - nombre fini → nombre ;
 * - chaîne décimale dont le texte rendu DIFFÈRE (donc formaté : « 125 000 ») → nombre ;
 * - sinon texte : un téléphone ou une référence affichés tels quels le restent.
 */
export function typeCell(raw: unknown, renderedText: string | null): ExportCell {
  const shown = renderedText === null ? formatRaw(raw) : normalizeText(renderedText);

  // Le rendu a volontairement masqué la valeur : la cellule est vide.
  if (renderedText !== null && shown === '') return { text: '', value: null, kind: 'empty' };

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { text: shown, value: raw, kind: 'number' };
  }
  if (typeof raw === 'string' && isPlainDecimal(raw) && renderedText !== null && shown !== raw) {
    return { text: shown, value: Number(raw), kind: 'number' };
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime()) && renderedText === null) {
    return { text: shown, value: raw, kind: 'date' };
  }
  if (!shown) return { text: '', value: null, kind: 'empty' };
  return { text: shown, value: shown, kind: 'text' };
}

type Pending = { row: number; col: number; node: ReactNode; raw: unknown };

function unwrapRendered(node: unknown): ReactNode {
  // Ant Design autorise `{ children, props }` (fusion de cellules).
  if (node && typeof node === 'object' && !Array.isArray(node) && !('$$typeof' in (node as object))) {
    return (node as { children?: ReactNode }).children ?? null;
  }
  return node as ReactNode;
}

export async function buildExportTable<T>(
  columns: ColumnsType<T> | undefined,
  rows: readonly T[],
  options: BuildTableOptions = {}
): Promise<ExportTable> {
  const exportColumns: ExportColumn<T>[] = resolveExportColumns(columns);
  const entries = flatten(rows, options.childrenColumnName ?? 'children');
  const cells: ExportCell[][] = entries.map(() => new Array<ExportCell>(exportColumns.length));
  const pending: Pending[] = [];

  entries.forEach(({ record }, rowIndex) => {
    exportColumns.forEach((ec, colIndex) => {
      const { column, path } = ec;
      if (column.exportValue) {
        try {
          cells[rowIndex][colIndex] = typedFromValue(column.exportValue(record, rowIndex));
        } catch {
          cells[rowIndex][colIndex] = typeCell(getByPath(record, path), null);
        }
        return;
      }
      const raw = getByPath(record, path);
      if (!column.render) {
        cells[rowIndex][colIndex] = typeCell(raw, null);
        return;
      }
      let node: ReactNode;
      try {
        node = unwrapRendered(column.render(raw as never, record, rowIndex));
      } catch {
        cells[rowIndex][colIndex] = typeCell(raw, null);
        return;
      }
      if (node === null || node === undefined || typeof node === 'boolean') {
        cells[rowIndex][colIndex] = typeCell(raw, '');
      } else if (typeof node === 'string' || typeof node === 'number') {
        cells[rowIndex][colIndex] = typeCell(raw, String(node));
      } else if (!options.renderNodes) {
        cells[rowIndex][colIndex] = typeCell(raw, null);
      } else {
        pending.push({ row: rowIndex, col: colIndex, node, raw });
      }
    });
  });

  if (pending.length > 0 && options.renderNodes) {
    for (let start = 0; start < pending.length; start += RENDER_BATCH_SIZE) {
      const batch = pending.slice(start, start + RENDER_BATCH_SIZE);
      let texts: (string | null)[];
      try {
        texts = await options.renderNodes(batch.map(p => p.node));
      } catch {
        texts = batch.map(() => null);
      }
      batch.forEach((p, i) => {
        cells[p.row][p.col] = typeCell(p.raw, texts[i] ?? null);
      });
      options.onProgress?.(Math.min(1, (start + batch.length) / pending.length));
    }
  }

  // Retrait des lignes enfants sur la première colonne.
  entries.forEach(({ depth }, rowIndex) => {
    if (depth > 0 && cells[rowIndex].length > 0) cells[rowIndex][0] = { ...cells[rowIndex][0], indent: depth };
  });

  const tableColumns = exportColumns.map((ec, colIndex) => {
    const numbers = cells.map(row => row[colIndex]).filter(cell => cell.kind === 'number');
    return {
      header: ec.header,
      numeric: numbers.length > 0,
      integer: numbers.every(cell => Number.isInteger(cell.value as number))
    };
  });

  return { columns: tableColumns, rows: cells };
}
