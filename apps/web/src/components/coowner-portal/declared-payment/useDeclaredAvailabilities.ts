import { useQueries, useQuery } from '@tanstack/react-query';
import {
  getDeclaredAvailability,
  listMyLots,
  type CoOwnerLot,
  type CoOwnerChargeCall,
  type CoOwnerDeclaredAvailability
} from '../../../services/coowner-portal-service';

/**
 * Disponibilité du paiement déclaré (spec 047) pour chaque copropriété

 * présente dans ses LOTS ou dans ses appels de charges : un copropriétaire sans appel (lot neuf, tout soldé)
 * peut quand même déclarer une avance. Une requête en erreur (API absente,
 * 403, 404) est ignorée : elle ne produit aucune entrée et ne casse rien.
 */

export interface DeclaredAvailabilityEntry {
  syndicate: { id: string; name: string };
  availability: CoOwnerDeclaredAvailability;
}

export interface DeclaredAvailabilities {
  entries: DeclaredAvailabilityEntry[];
  anyAvailable: boolean;
}

function distinctSyndicates(calls: CoOwnerChargeCall[], lots: CoOwnerLot[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, { id: string; name: string }>();
  for (const lot of lots) {
    if (lot.syndicate?.id && !seen.has(lot.syndicate.id)) {
      seen.set(lot.syndicate.id, { id: lot.syndicate.id, name: lot.syndicate.name ?? '' });
    }
  }
  for (const call of calls) {
    if (call.syndicateId && !seen.has(call.syndicateId)) {
      seen.set(call.syndicateId, { id: call.syndicateId, name: call.syndicate ?? '' });
    }
  }
  return [...seen.values()];
}

export function useDeclaredAvailabilities(calls: CoOwnerChargeCall[]): DeclaredAvailabilities {
  // Même clé que la section « J'ai payé par mobile money » : une seule requête de lots pour les deux.
  const lotsQuery = useQuery({
    queryKey: ['coowner-portal', 'lots'],
    queryFn: () => listMyLots(),
    retry: false
  });
  const syndicates = distinctSyndicates(calls, lotsQuery.data ?? []);
  const results = useQueries({
    queries: syndicates.map(syndicate => ({
      queryKey: ['coowner-portal', 'declared-availability', syndicate.id],
      queryFn: () => getDeclaredAvailability(syndicate.id),
      retry: false,
      staleTime: 60_000
    }))
  });

  const entries: DeclaredAvailabilityEntry[] = [];
  results.forEach((result, index) => {
    const availability = result.data;
    if (!availability || !availability.available) return;
    if (!availability.receivingNumbers || availability.receivingNumbers.length === 0) return;
    entries.push({ syndicate: syndicates[index], availability });
  });

  return { entries, anyAvailable: entries.length > 0 };
}
