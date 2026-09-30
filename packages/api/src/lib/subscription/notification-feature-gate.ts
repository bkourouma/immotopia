/**
 * Événements de notification et abonnement : liste filtrée et garde d'écriture.
 *
 * Même règle que les autres gardes : rien ne change hors mode `enforce`, et une
 * panne du calcul des droits laisse tout passer. Un événement d'une
 * fonctionnalité non comprise (NONE) n'est pas listé et ne se modifie pas
 * (403 `MODULE_NOT_INCLUDED`) ; un module retiré (READ_ONLY, D11) reste listé
 * pour consultation mais ne se modifie plus (403 `MODULE_READ_ONLY`).
 */
import type { NextFunction, Request, Response } from 'express';
import { featureOfNotificationKey } from '../../constants/notification-key-features';
import { ModuleNotIncludedError, ModuleReadOnlyError } from '../../middleware/error-middleware';
import { getEntitlements } from '../../services/subscription-v2-service';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { evaluateFeatureAccess } from './feature-access';
import type { Feature } from './features';

type Denial = { code: 'MODULE_NOT_INCLUDED' | 'MODULE_READ_ONLY'; moduleKey: string | null } | null;

async function denialFor(tenantId: string, feature: Feature, write: boolean): Promise<Denial> {
  if (feature === 'CORE') return null;
  try {
    const entitlements = await getEntitlements(tenantId);
    if (entitlements.enforcement !== 'enforce') return null;
    const decision = evaluateFeatureAccess(entitlements, feature, write);
    // La lecture seule de l'abonnement entier relève des gardes de routes, pas d'ici.
    if (decision.allowed || decision.code === 'SUBSCRIPTION_READ_ONLY') return null;
    return { code: decision.code, moduleKey: decision.moduleKey };
  } catch (error) {
    logger.error('Notification gate: entitlements unavailable, not filtered', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Le module retiré (READ_ONLY) a-t-il encore des données de l'agence ? Sans
 * aucune donnée (module ajouté puis retiré sans usage), ses événements ne
 * servent à rien : la liste les traite comme NONE.
 */
async function featureHasData(tenantId: string, feature: Feature): Promise<boolean> {
  const where = { where: { tenantId } };
  switch (feature) {
    case 'SYNDIC':
      return (await prisma.syndicate.count(where)) > 0;
    case 'CRM':
      return (await prisma.crmDeal.count(where)) > 0;
    case 'RENTAL':
      return (await prisma.rentalLease.count({ where: { tenant_id: tenantId } })) > 0;
    case 'PATRIMOINE':
      return (
        (await prisma.propertyLoan.count(where)) + (await prisma.workProgram.count(where)) > 0 ||
        (await prisma.propertyExpense.count(where)) > 0
      );
    case 'CONSTRUCTION':
      return (await prisma.constructionSite.count(where)) > 0;
    default:
      return true;
  }
}

/** Ne garde que les événements des fonctionnalités que l'agence possède (ou consulte avec des données). */
export async function filterNotificationItems<T extends { key: string }>(tenantId: string, items: T[]): Promise<T[]> {
  const features = [...new Set(items.map(item => featureOfNotificationKey(item.key)))].filter(f => f !== 'CORE');
  const denied = new Set<Feature>();
  await Promise.all(
    features.map(async feature => {
      if (await denialFor(tenantId, feature, false)) {
        denied.add(feature);
        return;
      }
      // Module retiré (READ_ONLY) : visible seulement s'il reste des données.
      const readOnly = await denialFor(tenantId, feature, true);
      if (readOnly?.code === 'MODULE_READ_ONLY') {
        try {
          if (!(await featureHasData(tenantId, feature))) denied.add(feature);
        } catch (error) {
          logger.error('Notification gate: data check failed, events kept', {
            tenantId,
            feature,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    })
  );
  return items.filter(item => !denied.has(featureOfNotificationKey(item.key)));
}

/** Refuse (403 MODULE_NOT_INCLUDED) la modification d'un événement d'une fonctionnalité non possédée. */
export async function requireNotificationKeyFeature(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    if (tenantId) {
      const denial = await denialFor(tenantId, featureOfNotificationKey(req.params.key), true);
      if (denial?.code === 'MODULE_READ_ONLY') throw new ModuleReadOnlyError(denial.moduleKey ?? 'UNKNOWN');
      if (denial) throw new ModuleNotIncludedError(denial.moduleKey ?? 'UNKNOWN');
    }
    next();
  } catch (error) {
    next(error);
  }
}
