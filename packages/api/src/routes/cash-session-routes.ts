import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import {
  closeSessionHandler,
  getCurrentSessionHandler,
  getSessionHandler,
  listSessionsHandler,
  openSessionHandler,
  validateSessionHandler
} from '../controllers/cash-session-controller';

/**
 * Caisse d'agence — lot 6.
 *
 * Tenir sa caisse : `FINANCE_DOCUMENTS_CREATE`. La valider : `FINANCE_DOCUMENTS_VALIDATE`,
 * et jamais pour sa propre caisse (contrôle dans le service). Consulter toutes
 * les caisses : `FINANCE_ACCOUNTS_READ` ; le détail d'une session reste
 * accessible à son caissier.
 *
 * `/current` est monté AVANT `/:sessionId`, sans quoi le segment paramétré
 * l'avalerait. Gardes posés avec leur chemin, jamais en `router.use` nu.
 */
const router = Router();
const BASE = '/tenants/:tenantId/cash-sessions';
const guard = (permission: string) => [authenticate, requireTenantAccess, requirePermission(permission)];

router.get(`${BASE}/current`, ...guard('FINANCE_DOCUMENTS_CREATE'), getCurrentSessionHandler);
router.get(BASE, ...guard('FINANCE_ACCOUNTS_READ'), listSessionsHandler);
router.post(BASE, ...guard('FINANCE_DOCUMENTS_CREATE'), openSessionHandler);
router.get(`${BASE}/:sessionId`, authenticate, requireTenantAccess, getSessionHandler);
router.post(`${BASE}/:sessionId/close`, ...guard('FINANCE_DOCUMENTS_CREATE'), closeSessionHandler);
router.post(`${BASE}/:sessionId/validate`, ...guard('FINANCE_DOCUMENTS_VALIDATE'), validateSessionHandler);

export default router;
