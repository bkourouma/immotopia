import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
import {
  requireContactsView,
  requireContactsCreate,
  requireContactsEdit,
  requireDealsView,
  requireDealsCreate,
  requireDealsEdit,
  requireActivitiesView,
  requireActivitiesCreate,
  requireMatchingRun,
  requireMatchingView
} from '../middleware/crm-rbac-middleware';
import {
  createContactHandler,
  getContactHandler,
  listContactsHandler,
  updateContactHandler,
  deleteContactHandler,
  getContactTagsHandler,
  assignTagHandler,
  removeTagHandler,
  listTagsHandler,
  createTagHandler,
  createDealHandler,
  getDealHandler,
  listDealsHandler,
  updateDealHandler,
  createActivityHandler,
  listActivitiesHandler,
  convertContactHandler,
  deactivateRoleHandler,
  updateRolesHandler,
  getDashboardHandler
} from '../controllers/crm-controller';
import {
  getCalendarHandler,
  rescheduleFollowUpHandler,
  markFollowUpDoneHandler
} from '../controllers/crm-calendar-controller';
import {
  matchPropertiesHandler as crmMatchPropertiesHandler,
  getMatchesHandler,
  addPropertyToShortlistHandler,
  updatePropertyStatusHandler
} from '../controllers/crm-matching-controller';
import {
  matchPropertiesHandler,
  addToShortlistHandler,
  updateMatchStatusHandler
} from '../controllers/property-matching-controller';
import { validate } from '../middleware/validation-middleware';
import {
  createContactSchema,
  updateContactSchema,
  createDealSchema,
  updateDealSchema,
  createActivitySchema,
  convertContactSchema
} from '../types/crm-types';

const router = Router();

// All CRM routes require authentication and tenant access
router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);

// Contact routes
router.get('/:tenantId/crm/contacts', requireContactsView, listContactsHandler);

router.post('/:tenantId/crm/contacts', requireContactsCreate, validate(createContactSchema), createContactHandler);

router.get('/:tenantId/crm/contacts/:contactId', requireContactsView, getContactHandler);

router.patch(
  '/:tenantId/crm/contacts/:contactId',
  requireContactsEdit,
  validate(updateContactSchema),
  updateContactHandler
);

router.delete('/:tenantId/crm/contacts/:contactId', requireContactsEdit, deleteContactHandler);

// Contact tags routes
router.get('/:tenantId/crm/contacts/:contactId/tags', requireContactsView, getContactTagsHandler);

router.post('/:tenantId/crm/contacts/:contactId/tags', requireContactsEdit, assignTagHandler);

router.delete('/:tenantId/crm/contacts/:contactId/tags/:tagId', requireContactsEdit, removeTagHandler);

// Tag management routes
router.get('/:tenantId/crm/tags', requireContactsView, listTagsHandler);

router.post('/:tenantId/crm/tags', requireContactsEdit, createTagHandler);

// Deal routes
router.get('/:tenantId/crm/deals', requireDealsView, listDealsHandler);

router.post('/:tenantId/crm/deals', requireDealsCreate, validate(createDealSchema), createDealHandler);

router.get('/:tenantId/crm/deals/:dealId', requireDealsView, getDealHandler);

router.patch('/:tenantId/crm/deals/:dealId', requireDealsEdit, validate(updateDealSchema), updateDealHandler);

// Activity routes
router.get('/:tenantId/crm/activities', requireActivitiesView, listActivitiesHandler);

router.post(
  '/:tenantId/crm/activities',
  requireActivitiesCreate,
  validate(createActivitySchema),
  createActivityHandler
);

// Contact conversion route
router.post(
  '/:tenantId/crm/contacts/:contactId/convert',
  requireContactsEdit,
  validate(convertContactSchema),
  convertContactHandler
);

// Contact role deactivation route
router.delete('/:tenantId/crm/contacts/:contactId/roles/:roleId', requireContactsEdit, deactivateRoleHandler);

// Contact roles update route
router.patch(
  '/:tenantId/crm/contacts/:contactId/roles',
  requireContactsEdit,
  validate(convertContactSchema),
  updateRolesHandler
);

// Property matching routes (using new property-matching-service)
router.post('/:tenantId/crm/deals/:dealId/properties/match', requireMatchingRun, matchPropertiesHandler);

// Legacy matching route (kept for backward compatibility)
router.post('/:tenantId/crm/deals/:dealId/match', requireMatchingRun, crmMatchPropertiesHandler);

router.get('/:tenantId/crm/deals/:dealId/matches', requireMatchingView, getMatchesHandler);

router.post('/:tenantId/crm/deals/:dealId/properties', requireMatchingRun, addToShortlistHandler);

router.post(
  '/:tenantId/crm/deals/:dealId/properties/:propertyId/status',
  requireMatchingView,
  updateMatchStatusHandler
);

// Legacy routes (kept for backward compatibility)
router.post('/:tenantId/crm/deals/:dealId/properties/legacy', requireMatchingRun, addPropertyToShortlistHandler);

router.post(
  '/:tenantId/crm/deals/:dealId/properties/:propertyId/status/legacy',
  requireMatchingView,
  updatePropertyStatusHandler
);

// Dashboard route
router.get(
  '/:tenantId/crm/dashboard',
  requireContactsView, // Dashboard requires at least contacts view permission
  getDashboardHandler
);

// Calendar routes
router.get(
  '/:tenantId/crm/calendar',
  requireActivitiesView, // Calendar requires activities view permission
  getCalendarHandler
);

router.patch(
  '/:tenantId/crm/activities/:id/next-action',
  requireActivitiesCreate, // Rescheduling follow-up requires create permission
  rescheduleFollowUpHandler
);

router.patch(
  '/:tenantId/crm/activities/:id/mark-done',
  requireActivitiesCreate, // Marking done requires create permission
  markFollowUpDoneHandler
);

export default router;
