import { useQuery } from '@tanstack/react-query';
import { queryKey, STALE_TIME } from '../lib/query-keys';
import { featureAccessFromModules } from '../navigation/feature-access';
import type { FeatureAccessMap } from '../navigation/feature-access';
import type { NavFeature } from '../navigation/model';
import { getMenuEntitlements } from '../services/entitlements-service';

/**
 * Fonctionnalités d'abonnement possédées par l'agence, pour les écrans du
 * socle (tableau de bord, paramètres financiers…) qui mêlent des blocs de
 * plusieurs modules.
 *
 * Même règle que le menu (`useFeatureAccess`) : rien n'est masqué tant que la
 * réponse n'est pas arrivée ni quand elle échoue, et seul le mode `enforce`
 * restreint (en `warn`, l'API laisse tout passer). `has('RENTAL')` est faux
 * uniquement quand la fonctionnalité n'est pas comprise (`NONE`) : la lecture
 * seule reste visible.
 */
export interface AgencyFeatures {
  /** Droits lus (ou définitivement indisponibles) : on peut rendre sans clignoter. */
  ready: boolean;
  access: FeatureAccessMap | null;
  has: (feature: NavFeature) => boolean;
}

export function useAgencyFeatures(tenantId: string | null | undefined): AgencyFeatures {
  const { data, isPending } = useQuery({
    queryKey: queryKey('tenant-entitlements', tenantId),
    queryFn: () => getMenuEntitlements(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list,
    retry: false
  });

  const access = data?.enforcement === 'enforce' ? featureAccessFromModules(data.moduleAccess) : null;

  return {
    ready: !tenantId || !isPending,
    access,
    has: feature => !access || access[feature] !== 'NONE'
  };
}
