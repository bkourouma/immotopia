/**
 * Acces a une OPTION payante (fonctionnalite d'option, features.ts) hors du garde
 * d'agence `/api/tenants/:tenantId` : routes publiques par jeton (AG en direct,
 * copropriétaire sans connexion), portail copropriétaire, liens de convocation.
 *
 * Meme regle de mode que les gardes d'abonnement (SUBSCRIPTION_ENFORCEMENT) :
 * - `off`     : disponible, aucune lecture en base ;
 * - `warn`    : disponible, le refus qui AURAIT eu lieu est journalise ;
 * - `enforce` : disponible seulement si l'agence a l'option.
 * Panne du calcul des droits : `enforce` refuse (jamais d'acces gratuit par
 * defaut), `warn` laisse passer en journalisant.
 */

import { getEntitlements } from '../../services/subscription-v2-service';
import { logger } from '../../utils/logger';
import { getSubscriptionEnforcement } from './enforcement';
import type { Feature } from './features';

const WARN_INTERVAL_MS = 60_000;
const MAX_WARN_KEYS = 500;
const lastWarnAt = new Map<string, number>();

/**
 * Journalise le refus evite au plus une fois par minute et par agence et option : un participant
 * d'AG relance l'etat toutes les quelques secondes, une ligne par requete noierait les autres alertes.
 */
function warnOnce(tenantId: string, feature: Feature): void {
  const key = `${tenantId}:${feature}`;
  const now = Date.now();
  const last = lastWarnAt.get(key);
  if (last !== undefined && now - last < WARN_INTERVAL_MS) return;
  if (lastWarnAt.size >= MAX_WARN_KEYS) lastWarnAt.clear();
  lastWarnAt.set(key, now);
  logger.warn('Subscription option guard (warn): would have refused', { tenantId, feature });
}

/** L'agence peut-elle utiliser l'option `feature` ? Ne leve jamais. */
export async function isTenantOptionAvailable(tenantId: string, feature: Feature): Promise<boolean> {
  const mode = getSubscriptionEnforcement();
  if (mode === 'off') return true;
  try {
    const entitlements = await getEntitlements(tenantId);
    if (entitlements.enforcement === 'off' || entitlements.features.includes(feature)) return true;
    if (entitlements.enforcement === 'warn') {
      warnOnce(tenantId, feature);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Subscription option guard: entitlements unavailable', {
      tenantId,
      feature,
      mode,
      error: error instanceof Error ? error.message : String(error)
    });
    return mode !== 'enforce';
  }
}
