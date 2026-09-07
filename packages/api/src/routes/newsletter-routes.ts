import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireTenantCollaborator } from '../middleware/tenant-middleware';
import * as controller from '../controllers/newsletter-controller';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB for CSV

router.use(authenticate);
router.use(requireTenantAccess);
router.use(requireTenantCollaborator);
router.use(enforceTenantIsolation);

// Lists
router.get('/lists', controller.listListsHandler);
router.post('/lists', controller.createListHandler);
router.get('/lists/:listId', controller.getListHandler);
router.patch('/lists/:listId', controller.updateListHandler);
router.delete('/lists/:listId', controller.deleteListHandler);

// Subscribers
router.get('/lists/:listId/subscribers', controller.listSubscribersHandler);
router.post('/lists/:listId/subscribers', controller.addSubscriberHandler);
router.post('/lists/:listId/subscribers/from-contacts', controller.addSubscribersFromContactsHandler);
router.post('/lists/:listId/import', upload.single('file'), controller.importSubscribersHandler);
router.get('/lists/:listId/export', controller.exportSubscribersHandler);

// Subscriber remove (need a route that doesn't conflict - use dedicated path)
router.delete('/subscribers/:subscriberId', controller.removeSubscriberHandler);

// Campaigns
router.get('/campaigns', controller.listCampaignsHandler);
router.post('/campaigns', controller.createCampaignHandler);
router.get('/campaigns/:campaignId', controller.getCampaignHandler);
router.patch('/campaigns/:campaignId', controller.updateCampaignHandler);
router.post('/campaigns/:campaignId/send', controller.sendCampaignHandler);
router.post('/campaigns/:campaignId/schedule', controller.scheduleCampaignHandler);
router.post('/campaigns/:campaignId/cancel', controller.cancelCampaignHandler);
router.get('/campaigns/:campaignId/preview', controller.previewCampaignHandler);
router.get('/campaigns/:campaignId/recipients', controller.listRecipientsHandler);

// Templates
router.get('/templates', controller.listTemplatesHandler);
router.post('/templates', controller.createTemplateHandler);
router.get('/templates/:templateId', controller.getTemplateHandler);
router.patch('/templates/:templateId', controller.updateTemplateHandler);
router.delete('/templates/:templateId', controller.deleteTemplateHandler);

export default router;
