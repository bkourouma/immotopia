import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireContactsView } from '../middleware/crm-rbac-middleware';
import * as controller from '../controllers/contact-search-controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);
router.use(requireContactsView);

router.post('/search', controller.advancedSearchHandler);
router.get('/suggestions/:field', controller.getSuggestionsHandler);
router.get('/saved', controller.listSavedSearchesHandler);
router.post('/saved', controller.createSavedSearchHandler);
router.post('/saved/:searchId/use', controller.useSavedSearchHandler);
router.delete('/saved/:searchId', controller.deleteSavedSearchHandler);
router.post('/export', controller.exportSearchHandler);

export default router;
