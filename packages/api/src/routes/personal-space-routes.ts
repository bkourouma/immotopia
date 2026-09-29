import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { createPersonalSpaceHandler } from '../controllers/personal-space-controller';

/**
 * Espace personnel en libre-service (lot 4B, specs/026-particuliers-libre-service).
 *
 * Monte sur `/api` dans `app.ts`. Route HORS tenant : l'utilisateur n'appartient
 * encore a aucune agence, donc ni `requireTenantAccess` ni garde de module ;
 * `authenticate` suffit, et l'identifiant vient du jeton.
 */
const router = Router();

router.post('/personal-space', authenticate, createPersonalSpaceHandler);

export default router;
