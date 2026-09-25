/**
 * Gardes de fonctionnalites d'abonnement (vague 2, lot A).
 *
 * - `requireFeature(feature)` : garde de route explicite, a poser APRES
 *   `authenticate` et `requireTenantAccess` (il lit `req.params.tenantId` ou
 *   `req.tenantContext`).
 * - `subscriptionRouteGuard` : garde unique monte dans `app.ts` sur
 *   `/api/tenants/:tenantId` — AVEC son chemin, jamais en `use()` nu (voir
 *   l'en-tete de finance-sites-routes.ts). Il classe la requete par la table
 *   `lib/subscription/route-features.ts`, puis applique la meme verification.
 *
 * Mode (SUBSCRIPTION_ENFORCEMENT, defaut `warn`) :
 * - `off`     : rien, aucune lecture en base ;
 * - `warn`    : le refus est journalise (logger) et compte
 *               (`getSubscriptionGuardCounters`), la requete passe ;
 * - `enforce` : 403 MODULE_NOT_INCLUDED / MODULE_READ_ONLY /
 *               SUBSCRIPTION_READ_ONLY, via les erreurs typees.
 *
 * Jamais bloques : routes EXEMPT de la table (portails, auto-inscription,
 * droits), super-admin, clients de l'agence (`tenantContext.isClient` :
 * locataires et proprietaires, D8). Webhooks, IPN, simulateur PaySecureHub,
 * portails `/api/portal/*`, auth et `/api/admin` ne sont pas sous
 * `/api/tenants/:tenantId` : le garde ne les voit pas.
 *
 * Une erreur de calcul des droits laisse passer (journalisee) : une panne du
 * module d'abonnement ne doit pas fermer l'application.
 */

import { NextFunction, Request, Response } from 'express';
import { getEntitlements } from '../services/subscription-v2-service';
import { getSubscriptionEnforcement } from '../lib/subscription/enforcement';
import { assertModuleAccess, assertSubscriptionWritable } from '../lib/subscription/guards';
import type { Feature } from '../lib/subscription/features';
import { evaluateFeatureAccess, FeatureDenialCode } from '../lib/subscription/feature-access';
import {
  classifyTenantRoute,
  isWriteRequest,
  NON_TENANT_SEGMENTS,
  RouteFeature
} from '../lib/subscription/route-features';
import { logger } from '../utils/logger';
import { authenticate } from './auth-middleware';
import { requireTenantAccess } from './tenant-middleware';

// ---------------------------------------------------------------- compteur

/** Refus constates, par `code:feature` (en warn : ce qui AURAIT ete refuse). */
const counters = new Map<string, number>();

export function getSubscriptionGuardCounters(): Record<string, number> {
  return Object.fromEntries(counters);
}

export function resetSubscriptionGuardCounters(): void {
  counters.clear();
}

function count(code: FeatureDenialCode, feature: Feature): void {
  const key = `${code}:${feature}`;
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

// ---------------------------------------------------------------- verification

function isExemptActor(req: Request): boolean {
  if (req.user?.globalRole === 'SUPER_ADMIN') return true;
  return Boolean(req.tenantContext?.isClient);
}

/**
 * Verifie la fonctionnalite pour l'agence `tenantId`. Leve l'erreur typee en
 * `enforce` ; en `warn`, journalise et compte, puis rend la main.
 */
async function checkFeature(
  req: Request,
  tenantId: string,
  feature: Feature,
  write: boolean
): Promise<void> {
  let entitlements;
  try {
    entitlements = await getEntitlements(tenantId);
  } catch (error) {
    logger.error('Subscription guard: entitlements unavailable, request allowed', {
      tenantId,
      feature,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }
  if (entitlements.enforcement === 'off') return;

  const decision = evaluateFeatureAccess(entitlements, feature, write);
  if (decision.allowed) return;

  count(decision.code, feature);
  if (entitlements.enforcement === 'warn') {
    logger.warn('Subscription feature guard (warn): would have refused', {
      tenantId,
      feature,
      code: decision.code,
      moduleKey: decision.moduleKey,
      method: req.method,
      path: req.originalUrl.split('?')[0]
    });
    return;
  }

  // enforce : les gardes de la vague 1 levent l'erreur typee (403 + code).
  if (decision.code === 'SUBSCRIPTION_READ_ONLY') {
    assertSubscriptionWritable(entitlements);
  } else if (decision.moduleKey) {
    assertModuleAccess(entitlements, decision.moduleKey, { write });
  }
}

function resolveTenantId(req: Request): string | undefined {
  return (req.params?.tenantId as string | undefined) ?? req.tenantContext?.tenantId;
}

/**
 * Garde explicite d'une route. `feature` : fonctionnalite requise ; lecture
 * ou ecriture deduite de la methode HTTP.
 */
export function requireFeature(feature: Feature) {
  const middleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (getSubscriptionEnforcement() === 'off' || isExemptActor(req)) {
      next();
      return;
    }
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      next();
      return;
    }
    try {
      await checkFeature(req, tenantId, feature, isWriteRequest(req.method, req.path));
      next();
    } catch (error) {
      next(error);
    }
  };
  (middleware as { requiredFeature?: Feature }).requiredFeature = feature;
  return middleware;
}

/**
 * Garde d'application, monte sur `/api/tenants/:tenantId`. `req.path` y est
 * relatif a ce prefixe : c'est la cle de la table.
 */
export function subscriptionRouteGuard(req: Request, res: Response, next: NextFunction): void {
  if (getSubscriptionEnforcement() === 'off') {
    next();
    return;
  }
  const tenantId = req.params?.tenantId;
  if (!tenantId || NON_TENANT_SEGMENTS.includes(tenantId)) {
    next();
    return;
  }

  const relativePath = req.path;
  const classified: RouteFeature | undefined = classifyTenantRoute(relativePath);
  if (classified === 'EXEMPT') {
    next();
    return;
  }
  if (!classified) {
    // Route non classee : le test d'inventaire doit l'avoir signalee. On ne
    // bloque pas (404 ou route neuve), on le dit.
    logger.warn('Subscription guard: unclassified tenant route', {
      method: req.method,
      path: req.originalUrl.split('?')[0]
    });
    next();
    return;
  }
  const feature: Feature = classified;
  const write = isWriteRequest(req.method, relativePath);

  // Le garde passe avant les routeurs : il authentifie et verifie l'acces a
  // l'agence lui-meme, pour qu'un anonyme recoive 401 et un etranger 403
  // d'acces — jamais l'etat de l'abonnement d'autrui. Les deux gardes sont
  // idempotents : les routeurs suivants ne refont pas le travail.
  authenticate(req, res, () => {
    void requireTenantAccess(req, res, () => {
      if (isExemptActor(req)) {
        next();
        return;
      }
      checkFeature(req, tenantId, feature, write).then(
        () => next(),
        error => next(error)
      );
    });
  });
}
