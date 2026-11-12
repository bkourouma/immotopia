import { useEffect, useState } from 'react';
import { getMenuEntitlements, type MenuEntitlements } from '../services/entitlements-service';

/** Fonctionnalité d'option « AG en direct et visio » (extension `EXT_AG_EN_DIRECT`). */
export const SYNDIC_LIVE_FEATURE = 'SYNDIC_LIVE';

export type LiveOptionState = 'loading' | 'available' | 'missing';

/**
 * L'option est-elle refusée ? Seulement quand le serveur l'applique (`enforcement === 'enforce'`)
 * ET que `features` ne contient pas `SYNDIC_LIVE` : en `warn`/`off`, l'API laisse tout passer.
 * Une réponse sans `features` (serveur plus ancien) ne prouve rien : on ne bloque pas.
 */
export function isLiveOptionMissing(entitlements: Pick<MenuEntitlements, 'enforcement' | 'features'>): boolean {
  return (
    entitlements.enforcement === 'enforce' &&
    Array.isArray(entitlements.features) &&
    !entitlements.features.includes(SYNDIC_LIVE_FEATURE)
  );
}

/**
 * État de l'option « AG en direct » de l'agence, lu dans `GET /tenants/:id/entitlements`.
 * Tant que la lecture est en cours : `loading` (la console n'appelle aucune route). Lecture en
 * échec : `available` (le serveur reste juge ; un refus arrive en 403 `OPTION_NOT_INCLUDED`).
 */
export function useLiveOption(tenantId: string | null | undefined): LiveOptionState {
  const [state, setState] = useState<{ tenantId: string | null | undefined; value: LiveOptionState } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    getMenuEntitlements(tenantId)
      .then(entitlements => {
        if (!cancelled) setState({ tenantId, value: isLiveOptionMissing(entitlements) ? 'missing' : 'available' });
      })
      .catch(() => {
        if (!cancelled) setState({ tenantId, value: 'available' });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (!tenantId) return 'available';
  return state && state.tenantId === tenantId ? state.value : 'loading';
}
