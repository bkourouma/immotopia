import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireCoOwnerPortalAccess } from '../middleware/coowner-portal-access';
import { getCoOwnerPortalFormModesHandler } from '../controllers/form-settings-controller';

/**
 * Modes des champs des formulaires du portail copropriétaire, monté sur
 * `/api/portal/copropriete`. Même garde que `paiements-declares` ; hors
 * abonnement comme le reste du portail.
 */
const router = Router();

router.get('/forms/:formKey/modes', authenticate, requireCoOwnerPortalAccess, getCoOwnerPortalFormModesHandler);

export default router;
