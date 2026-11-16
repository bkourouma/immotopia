import { Router } from 'express';
import {
  createHelpFeedbackHandler,
  listPlatformHelpFeedbackHandler,
  listTenantHelpFeedbackHandler
} from '../controllers/help-feedback-controller';
import { authenticate } from '../middleware/auth-middleware';
import { helpFeedbackDailyLimiter, helpFeedbackRateLimiter } from '../middleware/rate-limit-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireSuperAdmin } from '../middleware/super-admin-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';

/**
 * Avis sur les fiches d'aide interne, monté sur `/api` tout entier : gardes posées avec leur
 * chemin, jamais en `router.use` nu.
 *
 *  - `POST /help/feedback` : tout utilisateur authentifié (agence, particulier, super-admin,
 *    portails locataire, propriétaire, copropriétaire : ils ont tous un jeton). Hors agence par
 *    nature ; l'agence est déduite et vérifiée côté serveur, jamais lue du corps.
 *  - `GET /admin/help-feedback` : super-admin uniquement (permission + rôle relu en base).
 *  - `GET /tenants/:tenantId/help-feedback` : `TENANT_AUDIT_VIEW`, détenue par TENANT_ADMIN seul
 *    (et le super-admin), voir prisma/seeds/audit-permissions-seed.ts. `TENANT_SETTINGS_VIEW` est
 *    aussi portée par le rôle Agent : trop large pour des avis qui peuvent citer des tiers.
 *    Aucune nouvelle permission, aucun seed.
 */
const router = Router();
/** Route d'agence : montée APRÈS le garde d'abonnement (`/api/tenants/:tenantId`), voir app.ts. */
export const helpFeedbackTenantRoutes = Router();

router.post(
  '/help/feedback',
  authenticate,
  helpFeedbackRateLimiter,
  helpFeedbackDailyLimiter,
  createHelpFeedbackHandler
);

router.get(
  '/admin/help-feedback',
  authenticate,
  requirePermission('PLATFORM_TENANTS_VIEW'),
  requireSuperAdmin,
  listPlatformHelpFeedbackHandler
);

helpFeedbackTenantRoutes.get(
  '/tenants/:tenantId/help-feedback',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_AUDIT_VIEW'),
  listTenantHelpFeedbackHandler
);

export default router;
