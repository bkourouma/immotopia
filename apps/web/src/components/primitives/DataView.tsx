import React from 'react';
import { Table, Pagination, Spin, Row, Col } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { SorterResult } from 'antd/es/table/interface';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { StateBlock } from './StateBlock';
import { SkeletonList, SkeletonTable } from './Skeleton';
import type { Sort } from '../../hooks/useListParams';
import { t } from '../../i18n/t';

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

interface DataViewBase<T> {
  /** La page courante, telle que l'API l'a rendue. Jamais filtrée ici. */
  items: T[];
  /** Nombre total d'enregistrements côté serveur. Jamais `items.length`. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;

  /**
   * `false` quand l'API ne pagine pas et renvoie tout d'un bloc.
   *
   * Certains points d'entrée ignorent `page` et `limit` — les pénalités, par
   * exemple. Afficher une barre de pagination y ferait croire à des pages qui
   * n'existent pas. L'écran concerné le déclare ici, au lieu de le faire
   * deviner en posant `pageSize` égal au total : une coïncidence de chiffres
   * se défait au premier changement, une intention écrite non.
   */
  paginated?: boolean;

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

  /** Représentation en carte. Obligatoire dans les deux dispositions. */
  renderCard: (item: T) => React.ReactNode;
  rowKey: (item: T) => string;

  /** Tri courant et son changement. Serveur, comme la pagination. */
  sort?: Sort | null;
  onSortChange?: (sort: Sort | null) => void;

  /**
   * Largeur minimale du tableau, en px, qui ACTIVE le défilement horizontal.
   *
   * Exception assumée à la règle posée plus bas, et volontairement opt-in : par
   * défaut il n'y en a pas, et un écran doit la demander. Elle vaut quand les
   * colonnes ne tiennent pas dans la zone de contenu au PLANCHER du desktop —
   * 992 px moins la sidebar de 256 px, soit environ 690 px utiles. En dessous
   * de cette largeur, AntD ne coupe pas les colonnes : il les comprime, et les
   * valeurs courtes se cassent en deux (« Bail / Habitation »).
   *
   * Cela ne dispense de rien : `renderCard` reste obligatoire, et sous 992 px
   * ce sont toujours des cartes. Le défilement ne sert qu'à la fenêtre
   * 992-1200 px, où la carte n'a plus cours mais où la place manque encore.
   */
  scrollX?: number;

  /** Nom accessible de la liste. */
  'aria-label': string;
}

/**
 * Deux dispositions, et le type le fait respecter.
 *
 * - `table` (défaut) : tableau au-dessus de 992 px, cartes en dessous. Les
 *   colonnes sont **exigées** — c'est ce qui empêche un écran de livrer un
 *   tableau sans stratégie mobile.
 * - `grid` : cartes à toutes les largeurs, en grille responsive. Pour ce qui
 *   se regarde autant que ça se lit — un portefeuille de biens avec ses
 *   photos. Les colonnes y sont **interdites**, faute de quoi on ne saurait
 *   plus laquelle des deux formes fait foi.
 */
export type DataViewProps<T> = DataViewBase<T> &
  ({ layout?: 'table'; columns: ColumnsType<T> } | { layout: 'grid'; columns?: never });

export function DataView<T>(props: DataViewProps<T>) {
  const {
    items,
    total,
    paginated = true,
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
    renderCard,
    rowKey,
    sort = null,
    onSortChange,
    scrollX,
    'aria-label': ariaLabel
  } = props;
  const layout = props.layout ?? 'table';
  const columns = (props as { columns?: import('antd/es/table').ColumnsType<T> }).columns ?? [];
  const { isDesktop } = useBreakpoint();

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={error}
        actions={onRetry ? [{ label: t('Réessayer'), onClick: onRetry, primary: true }] : undefined}
      />
    );
  }

  // Premier chargement seulement : un rechargement garde la liste à l'écran.
  if (loading && items.length === 0) {
    return isDesktop && layout === 'table' ? (
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
          onClearFilters ? [{ label: t('Effacer les filtres'), onClick: onClearFilters, primary: true }] : undefined
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

  const cardList = (
    <div role="list" aria-label={ariaLabel}>
      {items.map(item => (
        <div role="listitem" key={rowKey(item)}>
          {renderCard(item)}
        </div>
      ))}
    </div>
  );

  /**
   * Grille : une colonne sous 768 px, deux au palier `md`, trois au-delà
   * (§5.1). Les paliers sont ceux d'Ant Design, alignés sur `tailwind.config.js`
   * depuis le Lot 0 : il n'y a qu'un seul jeu de points de rupture.
   */
  const cardGrid = (
    <Row gutter={[16, 16]} role="list" aria-label={ariaLabel}>
      {items.map(item => (
        <Col key={rowKey(item)} xs={24} md={12} lg={8} role="listitem">
          {renderCard(item)}
        </Col>
      ))}
    </Row>
  );

  const content =
    layout === 'grid' ? (
      cardGrid
    ) : isDesktop ? (
      <Table<T>
        dataSource={items}
        columns={columns}
        rowKey={rowKey}
        // La pagination est rendue séparément : identique en tableau et en
        // cartes, elle ne doit pas changer de forme avec le palier.
        pagination={false}
        onChange={handleTableChange}
        // Pas de `scroll={{ x }}` par DÉFAUT : au-dessus de 992 px les colonnes
        // tiennent, en dessous ce sont des cartes, et un défilement horizontal
        // posé partout dispenserait de faire la stratégie de colonnes. Les
        // écrans dont les colonnes ne tiennent pas au plancher du desktop le
        // demandent explicitement par `scrollX` — la stratégie carte reste due.
        scroll={scrollX ? { x: scrollX } : undefined}
        size="middle"
        aria-label={ariaLabel}
      />
    ) : (
      cardList
    );

  return (
    <div>
      {/* Rechargement : le contenu reste lisible, l'indicateur dit qu'il
          bouge. `aria-busy` le signale aux lecteurs d'écran sans vider la
          région. */}
      <div aria-busy={isReloading || undefined} style={{ opacity: isReloading ? 0.6 : 1, transition: 'opacity 120ms' }}>
        {isReloading ? <Spin spinning>{content}</Spin> : content}
      </div>

      {/* La barre paraît dès qu'il y a une ligne, et non seulement quand le
          total dépasse une page.

          Elle ne sert pas qu'à tourner les pages : elle porte le COMPTEUR et le
          choix du nombre par page. Les masquer sur une liste qui tient d'un
          seul tenant privait de la seule réponse à « combien y en a-t-il ? » —
          et c'est précisément la question qu'on se pose après avoir posé un
          filtre. Sur dix-neuf baux affichés vingt par page, l'écran ne disait
          plus rien du tout.

          Sur une liste vide, rien : le bloc d'état vide parle déjà. Sur une
          liste non paginée non plus — voir `paginated`. */}
      {paginated && total > 0 && (
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
