import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listSyndicateLots } from '../../../services/syndic-service';
import { STALE_TIME } from '../../../lib/query-keys';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import type { SearchOption } from '../../../utils/list-search';

/**
 * Options du critère « Lot » des barres de recherche de la copropriété.
 *
 * La route des lots ne sait pas chercher : on charge la liste complète d'UNE
 * copropriété (bornée par sa taille), une seule fois (React Query, `staleTime`
 * long), et le `Select` du critère la filtre lui-même. Valeur = identifiant du
 * lot (paramètre `lotId` des listes), libellé = celui que les tableaux affichent.
 *
 * Tant que la liste n'est pas arrivée, le tableau d'options est vide : le
 * critère n'est pas filtré par ses options (une valeur d'URL partagée reste).
 */
export function useSyndicLotOptions(tenantId: string | undefined, syndicId: string | undefined): SearchOption[] {
  const query = useQuery({
    queryKey: ['syndic-lot-options', tenantId, syndicId],
    queryFn: () => listSyndicateLots(tenantId as string, syndicId as string),
    enabled: Boolean(tenantId && syndicId),
    staleTime: STALE_TIME.reference
  });
  return useMemo(() => (query.data ?? []).map(lot => ({ value: lot.id, label: formatLotLabel(lot) })), [query.data]);
}
