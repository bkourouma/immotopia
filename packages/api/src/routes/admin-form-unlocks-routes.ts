import { Router } from 'express';
import { requirePermission } from '../middleware/rbac-middleware';
import { listFormUnlocksHandler, setFormUnlockHandler } from '../controllers/admin-form-unlocks-controller';

/**
 * Déverrouillage des champs GATED d'une agence (contrat §5). Monté dans
 * admin-routes.ts (`/api/admin`, déjà authentifié par `router.use(authenticate)`).
 */
export const adminFormUnlocksRouter = Router();

const path = '/tenants/:tenantId/form-unlocks';
adminFormUnlocksRouter.get(path, requirePermission('PLATFORM_TENANTS_VIEW'), listFormUnlocksHandler);
adminFormUnlocksRouter.put(path, requirePermission('PLATFORM_TENANTS_EDIT'), setFormUnlockHandler);
