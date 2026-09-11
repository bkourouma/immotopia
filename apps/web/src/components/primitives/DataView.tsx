import React from 'react';
import { Table, Pagination, Spin } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { StateBlock } from './StateBlock';
import { SkeletonList, SkeletonTable } from './Skeleton';
import type { Sort } from '../../hooks/useListParams';

/**
 * `<DataView>` — une liste, dans les deux représentations (§5.1, §6, §10.1).
 *
 * Tableau au-dessus de 992 px, cartes en dessous. Le choix n'est pas laissé à
 * l'écran : `renderCard` est **obligatoire**. C'est ce qui fait tenir le critère
 * de sortie du Lot 2 — « aucun `<Table>` sans stratégie carte/colonnes
 * prioritaires sur les 23 écrans » — par construction plutôt que par
 * vigilance. Un écran qui oublie la version mobile ne compile pas.
 *
 * Trois autres propriétés sont posées ici, une fois, plutôt que réinventées
 * vingt-trois fois :
 *
 * **Les états sont distingués.** « Aucune donnée » et « aucun résultat pour ces
 * filtres » ne sont pas le même écran : le premier invite à créer, le second à
 * élargir la recherche. Le dépôt affichait un `<Empty>` identique dans les deux
 * cas, ce qui laissait croire à un portefeuille vide alors qu'un filtre était
 * resté posé.
 *
 * **Le rechargement ne renvoie pas au squelette.** Changer de page ou revenir
 * sur l'onglet garde la donnée affichée et la grise. Repasser par le squelette
 * fait sauter la mise en page et perdre le fil de lecture.
 *
 * **La pagination est serveur.** `total` vient de l'API, jamais de
 * `items.length`. C'est exactement le défaut du §8.4 : `Properties.tsx`
 * filtrait la page reçue tout en affichant le compteur du serveur, si bien que
 * la liste et son compteur se contredisaient.
 */

export interface DataViewProps<T> {
  /** La page courante, telle que l'API l'a rendue. Jamais filtrée ici. */
  items: T[];
  /** Nombre total d'enregistrements côté serveur. Jamais `items.length`. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;

  /** Premier chargement : la mise en page n'existe pas encore. */
  loading?: boolean;
  /** Rechargement d'une liste déjà affichée : on garde le contenu. */
  isReloading?: boolean;
  /** Message d'erreur métier, déjà traduit. */
  error?: string | null;
  onRetry?: () => void;

  /** Vrai si un filtre est posé. Décide entre « vide » et « aucun résultat ». */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  /** Proposition de création, affichée quand la liste est vide SANS filtre. */
  emptyAction?: { label: string; onClick: () => void };
  /** Phrase d'accueil quand il n'y a rien, avant tout filtre. */
  emptyDescription?: string;

  /** Colonnes du tableau, au-dessus de 992 px. */
  columns: ColumnsType<T>;
  /** Représentation en carte, sous 992 px. Obligatoire. */
  renderCard: (item: T) => React.ReactNode;
  rowKey: (item: T) => string;

  /** Tri courant et son changement. Serveur, comme la pagination. */
  sort?: Sort | null;
  onSortChange?: (sort: Sort | null) => void;

  /** Nom accessible de la liste. */
  'aria-label': string;
}

export function DataView<T>({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  loading = false,
  isReloading = false,
  error = null,
  onRetry,
  isFiltered = false,
  onClearFilters,
  emptyAction,
  emptyDescription,
  columns,
  renderCard,
  rowKey,
  sort = null,
  onSortChange,
  'aria-label': ariaLabel
}: DataViewProps<T>) {
  const { isDesktop } = useBreakpoint();

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={error}
        actions={onRetry ? [{ label: 'Réessayer', onClick: onRetry, primary: true }] : undefined}
      />
    );
  }

  // Premier chargement seulement : un rechargement garde la liste à l'écran.
  if (loading && items.length === 0) {
    return isDesktop ? (
      <SkeletonTable
        rows={pageSize > 10 ? 8 : pageSize}
        columns={columns.length}
        aria-label={`${ariaLabel} en cours de chargement`}
      />
    ) : (
      <SkeletonList rows={5} aria-label={`${ariaLabel} en cours de chargement`} />
    );
  }

  if (items.length === 0) {
    // La distinction qui compte : rien n'existe, ou rien ne correspond.
    return isFiltered ? (
      <StateBlock
        variant="no-results"
        actions={
          onClearFilters ? [{ label: 'Effacer les filtres', onClick: onClearFilters, primary: true }] : undefined
        }
      />
    ) : (
      <StateBlock
        variant="empty"
        description={emptyDescription}
        actions={emptyAction ? [{ label: emptyAction.label, onClick: emptyAction.onClick, primary: true }] : undefined}
      />
    );
  }

  /**
   * Le tri d'AntD arrive sous une forme qui lui est propre. On le traduit vers
   * le contrat serveur, et on ignore les tris multiples : l'API n'en accepte
   * qu'un, et laisser l'utilisateur en composer deux produirait un ordre
   * silencieusement différent de celui affiché.
   */
  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, unknown>,
    sorter: SorterResult<T> | SorterResult<T>[]
  ) => {
    if (!onSortChange) return;
    const single = Array.isArray(sorter) ? sorter[0] : sorter;
    if (!single || !single.order || !single.field) {
      onSortChange(null);
      return;
    }
    onSortChange({ field: String(single.field), order: single.order === 'descend' ? 'desc' : 'asc' });
  };

  const content = isDesktop ? (
    <Table<T>
      dataSource={items}
      columns={columns}
      rowKey={rowKey}
      // La pagination est rendue séparément : identique en tableau et en
      // cartes, elle ne doit pas changer de forme avec le palier.
      pagination={false}
      onChange={handleTableChange}
      // Aucun `scroll={{ x }}` : au-dessus de 992 px les colonnes tiennent,
      // en dessous ce sont des cartes. Le défilement horizontal d'un tableau
      // est un aveu que la stratégie de colonnes n'a pas été faite.
      size="middle"
      aria-label={ariaLabel}
    />
  ) : (
    <div role="list" aria-label={ariaLabel}>
      {items.map(item => (
        <div role="listitem" key={rowKey(item)}>
          {renderCard(item)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* Rechargement : le contenu reste lisible, l'indicateur dit qu'il
          bouge. `aria-busy` le signale aux lecteurs d'écran sans vider la
          région. */}
      <div aria-busy={isReloading || undefined} style={{ opacity: isReloading ? 0.6 : 1, transition: 'opacity 120ms' }}>
        {isReloading ? <Spin spinning>{content}</Spin> : content}
      </div>

      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-5)' }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={onPageChange}
            showSizeChanger={isDesktop}
            // Le compteur vient du serveur. Sur mobile il prend trop de place
            // à côté des numéros de page.
            showTotal={isDesktop ? (count, range) => `${range[0]}–${range[1]} sur ${count}` : undefined}
            responsive
          />
        </div>
      )}
    </div>
  );
}
