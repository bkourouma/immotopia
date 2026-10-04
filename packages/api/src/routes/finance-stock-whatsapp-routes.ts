import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';

/**
 * Routes d'agence de l'inventaire de chantier par WhatsApp (lot 041, contrat
 * `specs/041-inventaire-whatsapp/contracts/openapi.yaml`), toutes sous
 * `/api/tenants/:tenantId/finance/stock/whatsapp/…` : inscriptions, passerelle
 * et mesures, comptages terrain, captures, conversations, simulateur.
 *
 * SQUELETTE des fondations : aucune route. Le territoire W4 les déclare, chacune
 * avec sa garde de permission (`requirePermission` / `requireAnyPermission`).
 *
 * **Gardes d'agence posés AVEC leur chemin**, jamais en `router.use(authenticate)`
 * nu (incident du lot 1, `finance-routes.ts`) : ce routeur est monté sur `/api`
 * à côté des routeurs du stock. Le préfixe `/finance/stock` est classé
 * `CONSTRUCTION` (`lib/subscription/route-features.ts`).
 */

const router = Router();

router.use('/tenants/:tenantId/finance/stock/whatsapp', authenticate, requireTenantAccess);

export default router;
