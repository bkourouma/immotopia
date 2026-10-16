import React from 'react';
import { Table as AntTable } from 'antd';
import type { TableProps } from 'antd';
import type { AnyObject } from 'antd/es/_util/type';
import { ExportMenu, type ExportFetchAllResult } from './ExportMenu';
import { resolveExportColumns } from '../../utils/table-export/columns';
import { t } from '../../i18n/t';

/**
 * `Table` — le `Table` d'Ant Design, avec le bouton « Exporter » en plus.
 *
 * Pour un tableau qui n'est pas un `<DataView>` (données client, panneaux,
 * onglets) : remplacer `import { Table } from 'antd'` par
 * `import { Table } from '../../components/primitives'` et poser
 * `exportFilename`. Aucune autre modification : mêmes props, mêmes génériques
 * (`<Table<Bail> …>`), mêmes sous-composants (`Table.Summary`…).
 *
 * Tout `dataSource` est exporté (la pagination cliente d'AntD n'y change rien) ;
 * les données arborescentes (`children`) sont aplaties avec un retrait sur la
 * première colonne. Le bouton se place au-dessus du tableau, à l'extrémité de
 * fin, et n'apparaît que s'il y a au moins une ligne et une colonne exportable.
 *
 * Quand le tableau est une vue partielle d'un jeu paginé par le serveur,
 * `exportFetchAll` va chercher le reste (voir `collectAllPages`).
 * `exportable={false}` retire le bouton — par exemple pour un sous-tableau
 * d'une ligne dépliée, ou un tableau d'aperçu.
 *
 * Limite : la `ref` d'AntD n'est pas relayée.
 */

export interface ExportableTableProps<T extends AnyObject = AnyObject> extends TableProps<T> {
  /** `false` retire le bouton d'export. Défaut : `true`. */
  exportable?: boolean;
  /** Base du nom de fichier (la date et l'extension sont ajoutées). */
  exportFilename?: string;
  /** Titre du document (PDF) et de la feuille (Excel). Défaut : le nom de fichier. */
  exportTitle?: string;
  /** Récupère toutes les lignes quand `dataSource` n'est qu'une partie du jeu. */
  exportFetchAll?: () => Promise<ExportFetchAllResult<T>>;
  /** `true` impose le PDF, `false` le retire (défaut : jusqu'à 12 colonnes). */
  exportPdf?: boolean;
}

function TableImpl<T extends AnyObject = AnyObject>(props: ExportableTableProps<T>): React.ReactElement {
  const { exportable = true, exportFilename, exportTitle, exportFetchAll, exportPdf, ...tableProps } = props;
  const rows = (tableProps.dataSource ?? []) as readonly T[];
  const childrenColumnName = tableProps.expandable?.childrenColumnName ?? 'children';
  const hasColumns = React.useMemo(() => resolveExportColumns(tableProps.columns).length > 0, [tableProps.columns]);
  const showExport = exportable && rows.length > 0 && hasColumns;
  const label =
    exportFilename ??
    exportTitle ??
    ((tableProps as Record<string, unknown>)['aria-label'] as string | undefined) ??
    t('Export');

  return (
    <>
      {showExport && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
          <ExportMenu<T>
            columns={tableProps.columns}
            rows={rows}
            fetchAll={exportFetchAll}
            filename={label}
            title={exportTitle ?? label}
            pdf={exportPdf}
            childrenColumnName={childrenColumnName}
          />
        </div>
      )}
      <AntTable<T> {...tableProps} />
    </>
  );
}

type Statics = Pick<
  typeof AntTable,
  | 'Summary'
  | 'Column'
  | 'ColumnGroup'
  | 'EXPAND_COLUMN'
  | 'SELECTION_COLUMN'
  | 'SELECTION_ALL'
  | 'SELECTION_INVERT'
  | 'SELECTION_NONE'
>;

export const Table: typeof TableImpl & Statics = Object.assign(TableImpl, {
  Summary: AntTable.Summary,
  Column: AntTable.Column,
  ColumnGroup: AntTable.ColumnGroup,
  EXPAND_COLUMN: AntTable.EXPAND_COLUMN,
  SELECTION_COLUMN: AntTable.SELECTION_COLUMN,
  SELECTION_ALL: AntTable.SELECTION_ALL,
  SELECTION_INVERT: AntTable.SELECTION_INVERT,
  SELECTION_NONE: AntTable.SELECTION_NONE
});
