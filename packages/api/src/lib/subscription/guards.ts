/**
 * Gardes d'abonnement pretes a brancher (vague 2). Elles s'appliquent a des
 * droits DEJA calcules (`getEntitlements`) et respectent
 * SUBSCRIPTION_ENFORCEMENT (porte par `entitlements.enforcement`) :
 * - `off`     : ne font rien ;
 * - `warn`    : journalisent ce qui aurait ete refuse, laissent passer ;
 * - `enforce` : levent les erreurs typees de middleware/error-middleware.
 *
 * Les portails et paiements des locataires ne passent JAMAIS par ces gardes (D8).
 */

import {
  ModuleNotIncludedError,
  ModuleReadOnlyError,
  OwnAssetsOnlyError,
  QuotaExceededError,
  SubscriptionReadOnlyError,
  ThirdPartyAction
} from '../../middleware/error-middleware';
import { logger } from '../../utils/logger';
import type { CapacityKeyCode, ModuleKeyCode } from './catalog';
import { evaluateQuota, QuotaEvaluation, TenantEntitlements } from './entitlements';

function refuse(
  entitlements: Pick<TenantEntitlements, 'tenantId' | 'enforcement'>,
  error: Error,
  context: Record<string, unknown>
): void {
  if (entitlements.enforcement === 'off') return;
  if (entitlements.enforcement === 'warn') {
    logger.warn('Subscription guard (warn): would have refused', {
      tenantId: entitlements.tenantId,
      error: error.name,
      ...context
    });
    return;
  }
  throw error;
}

/**
 * Acces a un module. Lecture : FULL ou READ_ONLY suffisent (D11 : un module
 * retire reste consultable et exportable). Ecriture : FULL seulement.
 */
export function assertModuleAccess(
  entitlements: TenantEntitlements,
  moduleKey: ModuleKeyCode,
  options: { write: boolean }
): void {
  const access = entitlements.moduleAccess[moduleKey] ?? 'NONE';
  if (access === 'FULL') return;
  if (access === 'READ_ONLY') {
    if (options.write) refuse(entitlements, new ModuleReadOnlyError(moduleKey), { moduleKey, write: true });
    return;
  }
  refuse(entitlements, new ModuleNotIncludedError(moduleKey), { moduleKey, write: options.write });
}

/** Ecriture refusee quand l'abonnement est en lecture seule (fin d'essai ou impaye apres grace, D8). */
export function assertSubscriptionWritable(entitlements: TenantEntitlements): void {
  if (!entitlements.readOnly) return;
  refuse(entitlements, new SubscriptionReadOnlyError(entitlements.readOnlyReason), {
    reason: entitlements.readOnlyReason
  });
}

/**
 * Barriere « detenu en propre » (pack Patrimoine, 28/09) : une agence dont
 * le seul module pleinement ouvert est MODULE_PATRIMOINE (`ownAssetsOnly`)
 * ne cree pas de mandat et ne rattache pas de proprietaire tiers. `off` :
 * rien ; `warn` : journalise et laisse passer ; `enforce` : 403
 * OWN_ASSETS_ONLY. Les agences qui detiennent un autre module (Agence,
 * Syndic, Promoteur) ne sont jamais concernees.
 */
export function assertThirdPartyManagementAllowed(
  entitlements: Pick<TenantEntitlements, 'tenantId' | 'enforcement' | 'ownAssetsOnly'>,
  action: ThirdPartyAction
): void {
  if (!entitlements.ownAssetsOnly) return;
  refuse(entitlements, new OwnAssetsOnlyError(action), { action });
}

/**
 * Applique la politique de quota a une operation qui ajoute `increment`
 * unites (D4). Renvoie l'evaluation : `BILL` signifie « autorise, le
 * depassement sera facture » ; `BLOCK` leve QuotaExceededError (enforce).
 */
export function checkQuota(
  entitlements: TenantEntitlements,
  capacityKey: CapacityKeyCode,
  increment = 1
): QuotaEvaluation {
  const capacity = entitlements.capacities[capacityKey];
  const evaluation = evaluateQuota(capacity, increment, entitlements.quotaPolicy, entitlements.enforcement);
  if (evaluation.decision === 'BLOCK') {
    throw new QuotaExceededError({
      capacityKey,
      limit: capacity.limit,
      used: capacity.used,
      requested: increment
    });
  }
  if (evaluation.decision === 'WARN' || evaluation.decision === 'BILL') {
    logger.warn('Subscription quota exceeded', {
      tenantId: entitlements.tenantId,
      capacityKey,
      decision: evaluation.decision,
      limit: evaluation.limit,
      usedAfter: evaluation.usedAfter
    });
  }
  return evaluation;
}
