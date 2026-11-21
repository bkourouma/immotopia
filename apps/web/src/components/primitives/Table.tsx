import React from 'react';
import { Table as AntTable } from 'antd';
import type { TableProps } from 'antd';
import type { AnyObject } from 'antd/es/_util/type';
import { ExportMenu, type ExportFetchAllResult } from './ExportMenu';
import { resolveExportColumns } from '../../utils/table-export/columns';
import { t } from '../../i18n/t';
import type { ListSearchBinding } from '../../utils/list-search/types';
import { ListSearch } from './ListSearch';
import { StateBlock } from './StateBlock';
import { useTableHelp, withColumnHelp } from '../../help/column-help';

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
 * Avec `search`, la barre `<ListSearch>` se pose au-dessus (voir la prop) et le
 * bouton « Exporter » s'y loge.
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
  /**
   * Recherche multicritères (`useListSearch(...).searchProps`, ou celui de
   * `useLocalListSearch`). La barre `<ListSearch>` se pose au-dessus du
   * tableau, même vide ; le bouton « Exporter » s'y loge. Le compteur vient de
   * `search.resultCount`, sinon de `pagination.total`, sinon de
   * `dataSource.length`. Un tableau vide sous des critères actifs affiche
   * « Aucun résultat » et « Effacer les critères », sauf si l'écran fournit
   * son `locale.emptyText`.
   */
  search?: ListSearchBinding;
  /** Fiche d'aide du tableau : « ? » en tête de bloc et infobulles de colonnes (`howToRead.columns`). */
  helpId?: string;
}

/**
 * Les pastilles de page d'AntD sont des <a> sans href : ni rôle, ni nom, ni page courante pour un
 * lecteur d'écran. Même nommage que la pagination de `DataView` (« Page 2 », rôle bouton) ; le clic
 * remonte à l'<li> d'AntD. Un `itemRender` fourni par l'écran garde la priorité.
 */
export function namedPageItemRender(current?: number) {
  return (pageNumber: number, type: string, element: React.ReactNode): React.ReactNode =>
    type === 'page' && React.isValidElement(element)
      ? React.cloneElement(element as React.ReactElement<Record<string, unknown>>, {
          role: 'button',
          'aria-label': t('Page {{page}}', { page: pageNumber }),
          'aria-current': pageNumber === current ? 'page' : undefined
        })
      : element;
}

function withNamedPages(pagination: TableProps<AnyObject>['pagination']): TableProps<AnyObject>['pagination'] {
  if (pagination === false) return pagination;
  const base = typeof pagination === 'object' && pagination !== null ? pagination : {};
  if (base.itemRender) return pagination;
  return { ...base, itemRender: namedPageItemRender(base.current) };
}

function TableImpl<T extends AnyObject = AnyObject>(props: ExportableTableProps<T>): React.ReactElement {
  const {
    exportable = true,
    exportFilename,
    exportTitle,
    exportFetchAll,
    exportPdf,
    search,
    helpId,
    ...tableProps
  } = props;
  const { node: helpNode, entry: helpEntry } = useTableHelp(helpId);
  // L'export lit les titres : il garde les colonnes d'origine ; seul AntD reçoit les colonnes décorées.
  const displayColumns = React.useMemo(
    () => (helpNode ? withColumnHelp(tableProps.columns, helpEntry?.howToRead?.columns) : tableProps.columns),
    [helpNode, helpEntry, tableProps.columns]
  );
  const namedPagination = withNamedPages(
    tableProps.pagination as TableProps<AnyObject>['pagination']
  ) as TableProps<T>['pagination'];
  const rows = (tableProps.dataSource ?? []) as readonly T[];
  const childrenColumnName = tableProps.expandable?.childrenColumnName ?? 'children';
  const hasColumns = React.useMemo(() => resolveExportColumns(tableProps.columns).length > 0, [tableProps.columns]);
  // Recadrage d'une page hors bornes quand la recherche est active (voir DataView).
  const searchPagination = search && typeof tableProps.pagination === 'object' ? tableProps.pagination : null;
  const pgTotal = searchPagination?.total;
  const pgCurrent = searchPagination?.current;
  const pgSize = searchPagination?.pageSize;
  const pgOnChange = searchPagination?.onChange;
  const pgLastPage =
    typeof pgTotal === 'number' && pgTotal > 0 && typeof pgSize === 'number' && pgSize > 0
      ? Math.ceil(pgTotal / pgSize)
      : 0;
  const pgOutOfRange = pgLastPage > 0 && typeof pgCurrent === 'number' && pgCurrent > pgLastPage;
  React.useEffect(() => {
    if (pgOutOfRange) pgOnChange?.(pgLastPage, pgSize as number);
    // `onChange` est volontairement hors des dépendances : l'écran le recrée à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgOutOfRange, pgLastPage, pgSize]);

  const showExport = exportable && rows.length > 0 && hasColumns;
  const label =
    exportFilename ??
    exportTitle ??
    ((tableProps as Record<string, unknown>)['aria-label'] as string | undefined) ??
    t('Export');

  const exportMenu = showExport ? (
    <ExportMenu<T>
      columns={tableProps.columns}
      rows={rows}
      fetchAll={exportFetchAll}
      filename={label}
      title={exportTitle ?? label}
      pdf={exportPdf}
      childrenColumnName={childrenColumnName}
    />
  ) : null;

  if (!search) {
    return (
      <>
        {(exportMenu || helpNode) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 'var(--space-2)',
              ...(helpNode ? { alignItems: 'center', gap: 'var(--space-2)' } : null)
            }}
          >
            {helpNode}
            {exportMenu}
          </div>
        )}
        <AntTable<T> {...tableProps} columns={displayColumns} pagination={namedPagination} />
      </>
    );
  }

  const pagination = tableProps.pagination;
  const resultCount =
    search.resultCount ??
    (pagination && typeof pagination === 'object' && typeof pagination.total === 'number'
      ? pagination.total
      : rows.length);

  // Aucun résultat sous des critères actifs : un état qui propose d'en sortir,
  // sauf si l'écran a fourni le sien. Pas pendant un chargement : la liste n'est
  // pas encore connue, et le bouton serait recouvert par l'indicateur d'AntD.
  const loadingProp = tableProps.loading;
  const isLoading =
    typeof loadingProp === 'object' && loadingProp !== null ? loadingProp.spinning !== false : Boolean(loadingProp);
  const showNoResults =
    rows.length === 0 && !pgOutOfRange && search.activeCount > 0 && tableProps.locale?.emptyText === undefined;
  const locale = showNoResults
    ? {
        ...tableProps.locale,
        emptyText: isLoading ? (
          // Emplacement neutre sous l'indicateur : ni « aucune donnée » ni « aucun résultat ».
          <div style={{ minHeight: 120 }} aria-hidden="true" />
        ) : (
          <StateBlock
            variant="no-results"
            actions={[{ label: t('Effacer les critères'), onClick: search.onClear, primary: true }]}
          />
        )
      }
    : tableProps.locale;

  return (
    <>
      <ListSearch
        {...search}
        resultCount={resultCount}
        extra={
          helpNode ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {helpNode}
              {exportMenu}
            </span>
          ) : (
            exportMenu
          )
        }
      />
      <AntTable<T> {...tableProps} columns={displayColumns} locale={locale} pagination={namedPagination} />
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
