import { useQueries } from '@tanstack/react-query';
import {
  getDeclaredAvailability,
  type CoOwnerChargeCall,
  type CoOwnerDeclaredAvailability
} from '../../../services/coowner-portal-service';

/**
 * Disponibilité du paiement déclaré (spec 047) pour chaque copropriété
 * présente dans les appels de charges. Une requête en erreur (API absente,
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

function distinctSyndicates(calls: CoOwnerChargeCall[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, { id: string; name: string }>();
  for (const call of calls) {
    if (call.syndicateId && !seen.has(call.syndicateId)) {
      seen.set(call.syndicateId, { id: call.syndicateId, name: call.syndicate ?? '' });
    }
  }
  return [...seen.values()];
}

export function useDeclaredAvailabilities(calls: CoOwnerChargeCall[]): DeclaredAvailabilities {
  const syndicates = distinctSyndicates(calls);
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
