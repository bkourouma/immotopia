import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { getEntitlements } from '../../services/subscription-v2-service';
import { evaluateFeatureAccess } from '../subscription/feature-access';

/**
 * Tâche quotidienne des appels automatiques (lot S4) : l'agence a-t-elle le
 * droit d'émettre ? Les routes passent par `requireTenantAccess` (agence
 * suspendue refusée) et par `subscriptionRouteGuard` (fonctionnalité SYNDIC) ;
 * la tâche, elle, n'a pas de requête : elle reprend ici les deux mêmes
 * décisions, avec les mêmes fonctions (`getEntitlements`,
 * `evaluateFeatureAccess`) et le même traitement des modes :
 * - `off` : rien n'est vérifié côté abonnement ;
 * - `warn` : le refus est journalisé comme par le garde de route, l'émission
 *   continue ;
 * - `enforce` : refus.
 * Comme le garde, une panne du calcul des droits laisse passer (journalisée).
 *
 * Écrire des appels et les envoyer est une ÉCRITURE : un abonnement en
 * lecture seule ou un module retiré refusent donc l'émission.
 */

export type SchedulingDenial = 'TENANT_INACTIVE' | 'SUBSCRIPTION_DENIED';

async function subscriptionDenial(tenantId: string, now: Date): Promise<SchedulingDenial | null> {
  let entitlements;
  try {
    entitlements = await getEntitlements(tenantId, { fresh: true, now });
  } catch (error) {
    logger.error('Charge scheduler: entitlements unavailable, issuing allowed', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
  if (entitlements.enforcement === 'off') return null;
  const decision = evaluateFeatureAccess(entitlements, 'SYNDIC', true);
  if (decision.allowed) return null;
  if (entitlements.enforcement === 'warn') {
    logger.warn('Subscription feature guard (warn): would have refused', {
      tenantId,
      feature: 'SYNDIC',
      code: decision.code,
      moduleKey: decision.moduleKey,
      source: 'syndic-charge-call-scheduler'
    });
    return null;
  }
  return 'SUBSCRIPTION_DENIED';
}

/** Refus d'émission pour l'agence, ou `null` si elle peut émettre. */
export async function evaluateSchedulingGate(tenantId: string, now: Date): Promise<SchedulingDenial | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  if (!tenant || tenant.status !== 'ACTIVE') return 'TENANT_INACTIVE';
  return subscriptionDenial(tenantId, now);
}

/** Même décision, calculée une seule fois par agence au cours d'un passage. */
export function createSchedulingGateCache(now: Date) {
  const cache = new Map<string, Promise<SchedulingDenial | null>>();
  return (tenantId: string) => {
    let decision = cache.get(tenantId);
    if (!decision) {
      decision = evaluateSchedulingGate(tenantId, now);
      cache.set(tenantId, decision);
    }
    return decision;
  };
}
