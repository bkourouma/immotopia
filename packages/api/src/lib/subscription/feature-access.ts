/**
 * Acces a une FONCTIONNALITE (vague 2, lot A) — calcul pur sur des droits
 * deja resolus (`getEntitlements`).
 *
 * Une fonctionnalite est ouverte par un ou plusieurs modules (features.ts :
 * CRM = Agence ou Promoteur). Regle, dans l'ordre :
 * 1. un module qui l'ouvre est FULL -> acces complet ;
 * 2. sinon, un module qui l'ouvre est READ_ONLY (retire, D11) -> lecture
 *    permise, ecriture refusee MODULE_READ_ONLY ;
 * 3. sinon -> MODULE_NOT_INCLUDED, lecture comprise ;
 * 4. puis, pour une ecriture, abonnement en lecture seule (D8) ->
 *    SUBSCRIPTION_READ_ONLY.
 */

import type { ModuleKeyCode } from './catalog';
import type { TenantEntitlements } from './entitlements';
import { Feature, modulesForFeature } from './features';

export type FeatureDenialCode = 'MODULE_NOT_INCLUDED' | 'MODULE_READ_ONLY' | 'SUBSCRIPTION_READ_ONLY';

export type FeatureAccessDecision =
  | { allowed: true }
  | { allowed: false; code: FeatureDenialCode; moduleKey: ModuleKeyCode | null };

type EntitlementsView = Pick<TenantEntitlements, 'moduleAccess' | 'readOnly'>;

/** Module a citer dans un refus : celui qui est en lecture seule, a defaut le premier qui ouvre la fonctionnalite. */
export function evaluateFeatureAccess(
  entitlements: EntitlementsView,
  feature: Feature,
  write: boolean
): FeatureAccessDecision {
  const providers = modulesForFeature(feature);
  const accessOf = (moduleKey: ModuleKeyCode) => entitlements.moduleAccess[moduleKey] ?? 'NONE';

  if (!providers.some(m => accessOf(m) === 'FULL')) {
    const readOnlyModule = providers.find(m => accessOf(m) === 'READ_ONLY');
    if (!readOnlyModule) {
      return { allowed: false, code: 'MODULE_NOT_INCLUDED', moduleKey: providers[0] ?? null };
    }
    if (write) return { allowed: false, code: 'MODULE_READ_ONLY', moduleKey: readOnlyModule };
  }

  if (write && entitlements.readOnly) {
    return { allowed: false, code: 'SUBSCRIPTION_READ_ONLY', moduleKey: null };
  }
  return { allowed: true };
}
