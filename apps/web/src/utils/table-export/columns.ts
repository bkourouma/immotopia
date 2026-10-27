import type { ColumnGroupType, ColumnType, ColumnsType } from 'antd/es/table/interface';

/**
 * Extraction des colonnes exportables d'un `columns` Ant Design.
 *
 * Module volontairement léger (aucun import lourd) : `ExportMenu` l'embarque
 * dans le chunk partagé pour décider de proposer ou non le PDF.
 */

export interface ExportColumn<T> {
  /** Identifiant stable (clé, sinon chemin de `dataIndex`, sinon rang). */
  id: string;
  header: string;
  column: ColumnType<T>;
  path: (string | number)[] | null;
}

const ACTION_KEYS = new Set(['actions', 'action', 'operations']);

type AnyColumn<T> = ColumnType<T> | ColumnGroupType<T>;

/** `dataIndex` (chaîne, nombre ou chemin) → chemin de propriétés. */
export function dataIndexToPath(dataIndex: unknown): (string | number)[] | null {
  if (dataIndex === undefined || dataIndex === null) return null;
  if (Array.isArray(dataIndex)) return dataIndex.length ? (dataIndex as (string | number)[]) : null;
  if (typeof dataIndex === 'string' || typeof dataIndex === 'number') return [dataIndex];
  return null;
}

export function getByPath(record: unknown, path: (string | number)[] | null): unknown {
  if (!path) return undefined;
  let current: any = record;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function textTitle(column: AnyColumn<any>): string {
  if (typeof column.exportTitle === 'string' && column.exportTitle.trim()) return column.exportTitle.trim();
  return typeof column.title === 'string' ? column.title.trim() : '';
}

function isActionColumn(column: ColumnType<any>, path: (string | number)[] | null): boolean {
  const key = column.key === undefined || column.key === null ? '' : String(column.key).toLowerCase();
  if (ACTION_KEYS.has(key)) return true;
  return path?.length === 1 && ACTION_KEYS.has(String(path[0]).toLowerCase());
}

function fallbackId(column: ColumnType<any>, path: (string | number)[] | null, index: number): string {
  if (column.key !== undefined && column.key !== null) return String(column.key);
  if (path) return path.join('.');
  return `col-${index}`;
}

function walk<T>(columns: ColumnsType<T>, parents: string[], out: ExportColumn<T>[]): void {
  columns.forEach((raw, index) => {
    const column = raw as AnyColumn<T>;
    if ((column as { hidden?: boolean }).hidden) return;
    if (column.exportable === false) return;

    const label = textTitle(column);
    const children = (column as ColumnGroupType<T>).children;
    if (Array.isArray(children) && children.length > 0) {
      walk(children, label ? [...parents, label] : parents, out);
      return;
    }

    const leaf = column as ColumnType<T>;
    const path = dataIndexToPath(leaf.dataIndex);
    const forced = leaf.exportable === true;
    if (!forced) {
      if (!label) return;
      if (isActionColumn(leaf, path)) return;
    }
    // Rien à lire : ni valeur déclarée, ni rendu, ni chemin de donnée.
    if (!leaf.exportValue && !leaf.render && !path) return;

    const id = fallbackId(leaf, path, out.length + index);
    const header = [...parents, label || id].join(' – ');
    out.push({ id, header, column: leaf, path });
  });
}

/** Colonnes feuilles exportables, groupes aplatis (titre « Parent – Enfant »). */
export function resolveExportColumns<T>(columns: ColumnsType<T> | undefined): ExportColumn<T>[] {
  const out: ExportColumn<T>[] = [];
  if (columns) walk(columns, [], out);
  return out;
}
