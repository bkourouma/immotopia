import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listDeals, type CrmDeal, type CrmDealDetail, type DealFilters } from '../../services/crm-service';
import type { CrmDealStage } from '../../types/crm-types';

/** Colonnes affichées du pipeline : les affaires gagnées et perdues n'y figurent pas. */
export const KANBAN_STAGES: CrmDealStage[] = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION'];
const ALL_KANBAN_STAGES: CrmDealStage[] = [...KANBAN_STAGES, 'WON', 'LOST'];
/** Affaires chargées par colonne, puis par clic sur « Afficher plus ». */
export const KANBAN_PAGE_SIZE = 30;

export type KanbanDeal = CrmDeal | CrmDealDetail;

export interface KanbanColumn {
  deals: KanbanDeal[];
  /** Total de la colonne côté serveur (pas le nombre de cartes chargées). */
  total: number;
  /** Dernière page chargée. */
  page: number;
  loading: boolean;
  loadingMore: boolean;
}

export type KanbanColumns = Record<string, KanbanColumn>;

/**
 * Critères communs à toutes les colonnes (`search`, `type`, `assignedTo`, budget, période…), tels que
 * `useListSearch(...).filterParams` les produit. Le critère d'étape n'y figure pas : il passe par
 * `stages` (une colonne = une requête).
 */
export type KanbanCriteria = Record<string, string | number>;

function emptyColumn(loading: boolean): KanbanColumn {
  return { deals: [], total: 0, page: 0, loading, loadingMore: false };
}

function initialColumns(loading: boolean, stages: readonly string[]): KanbanColumns {
  return Object.fromEntries(
    ALL_KANBAN_STAGES.map(stage => [
      stage,
      emptyColumn(loading && (stages.length ? stages.includes(stage) : KANBAN_STAGES.includes(stage)))
    ])
  );
}

interface UseDealKanbanOptions {
  tenantId?: string;
  /** Faux : aucune requête (la vue Liste est affichée). */
  enabled: boolean;
  criteria: KanbanCriteria;
  /**
   * Étapes demandées par le critère « Étape » ; vide : toutes les colonnes. Les autres colonnes
   * restent vides, sans requête.
   */
  stages?: readonly string[];
}

/**
 * Pipeline des affaires chargé PAR COLONNE : une requête par étape, avec les
 * mêmes critères que la liste, 30 cartes par page, le total de l'étape venant
 * du serveur. Plus aucun chargement global de 1 000 affaires.
 */
export function useDealKanban({ tenantId, enabled, criteria, stages = [] }: UseDealKanbanOptions) {
  // Prêt à charger : les colonnes naissent en « chargement » pour ne pas afficher « aucune affaire » un instant.
  const [columns, setColumns] = useState<KanbanColumns>(() => initialColumns(enabled && !!tenantId, stages));
  const [error, setError] = useState<string | null>(null);
  // Numéro de la dernière requête de chaque colonne : une réponse en retard est ignorée.
  const sequence = useRef<Record<string, number>>({});
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;
  const stagesKey = stages.join(',');
  const stagesRef = useRef(stagesKey);
  stagesRef.current = stagesKey;
  const criteriaKey = `${JSON.stringify(criteria)}|${stagesKey}`;

  const isRequested = useCallback((stage: string) => {
    const wanted = stagesRef.current;
    return wanted === '' ? KANBAN_STAGES.includes(stage as CrmDealStage) : wanted.split(',').includes(stage);
  }, []);

  const patchColumn = useCallback((stage: string, patch: Partial<KanbanColumn>) => {
    setColumns(previous => ({ ...previous, [stage]: { ...previous[stage], ...patch } }));
  }, []);

  const fetchColumn = useCallback(
    async (stage: CrmDealStage, page: number, append: boolean) => {
      if (!tenantId) return;
      const current = (sequence.current[stage] = (sequence.current[stage] ?? 0) + 1);
      patchColumn(stage, append ? { loadingMore: true } : { loading: true });
      try {
        const response = await listDeals(tenantId, {
          ...criteriaRef.current,
          stage,
          page,
          limit: KANBAN_PAGE_SIZE
        } as DealFilters);
        if (current !== sequence.current[stage]) return;
        if (!response.success) {
          setError('load');
          patchColumn(stage, { loading: false, loadingMore: false });
          return;
        }
        setColumns(previous => {
          const known = previous[stage];
          const loaded = append ? known.deals : [];
          const ids = new Set(loaded.map(deal => deal.id));
          const merged = [...loaded, ...response.deals.filter(deal => !ids.has(deal.id))];
          return {
            ...previous,
            [stage]: {
              deals: merged,
              total: response.pagination?.total ?? merged.length,
              page,
              loading: false,
              loadingMore: false
            }
          };
        });
      } catch {
        if (current !== sequence.current[stage]) return;
        setError('load');
        patchColumn(stage, { loading: false, loadingMore: false });
      }
    },
    [tenantId, patchColumn]
  );

  const reloadAll = useCallback(() => {
    if (!tenantId) return;
    setError(null);
    // Les numéros avancent aussi pour les colonnes sans requête : une réponse d'avant les écarte.
    for (const stage of ALL_KANBAN_STAGES) {
      sequence.current[stage] = (sequence.current[stage] ?? 0) + 1;
    }
    setColumns(Object.fromEntries(ALL_KANBAN_STAGES.map(stage => [stage, emptyColumn(isRequested(stage))])));
    for (const stage of ALL_KANBAN_STAGES) {
      if (isRequested(stage)) void fetchColumn(stage, 1, false);
    }
  }, [tenantId, fetchColumn, isRequested]);

  // Les critères changent (ou la vue Pipeline s'affiche) : toutes les colonnes repartent de la page 1.
  useEffect(() => {
    if (!enabled || !tenantId) return;
    reloadAll();
    // `criteriaKey` porte l'identité des critères et des étapes demandées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tenantId, criteriaKey]);

  /** Page suivante d'UNE colonne, ajoutée à ses cartes. */
  const loadMore = useCallback(
    (stage: CrmDealStage) => {
      const column = columns[stage];
      if (!column || column.loading || column.loadingMore) return;
      void fetchColumn(stage, column.page + 1, true);
    },
    [columns, fetchColumn]
  );

  /** Après le déplacement d'une carte : les colonnes touchées repartent de la page 1. */
  const reloadStages = useCallback(
    (toReload: CrmDealStage[]) => {
      for (const stage of new Set(toReload)) {
        if (!ALL_KANBAN_STAGES.includes(stage) || !isRequested(stage)) continue;
        void fetchColumn(stage, 1, false);
      }
    },
    [fetchColumn, isRequested]
  );

  const findDeal = useCallback(
    (dealId: string): KanbanDeal | undefined => {
      for (const stage of ALL_KANBAN_STAGES) {
        const found = columns[stage]?.deals.find(deal => deal.id === dealId);
        if (found) return found;
      }
      return undefined;
    },
    [columns]
  );

  const total = useMemo(
    () => ALL_KANBAN_STAGES.reduce((sum, stage) => sum + (columns[stage]?.total ?? 0), 0),
    [columns]
  );
  const loading = useMemo(() => ALL_KANBAN_STAGES.some(stage => columns[stage]?.loading), [columns]);
  const visibleStages = stages.length ? ALL_KANBAN_STAGES.filter(stage => stages.includes(stage)) : KANBAN_STAGES;

  return {
    columns,
    stages: visibleStages,
    total,
    loading,
    hasError: error !== null,
    loadMore,
    reloadStages,
    reloadAll,
    findDeal
  };
}
