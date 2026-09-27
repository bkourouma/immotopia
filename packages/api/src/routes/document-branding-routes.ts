import { Router, type RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { brandingImageUpload } from '../middleware/branding-upload-middleware';
import {
  createMandatingAgencyHandler,
  deleteMandatingAgencyHandler,
  getAgencyDocumentIdentityHandler,
  getMandatingAgencyHandler,
  listMandatingAgenciesHandler,
  readAgencyImageHandler,
  readMandantImageHandler,
  readSyndicateLogoHandler,
  removeAgencyImageHandler,
  removeMandantImageHandler,
  removeSyndicateLogoHandler,
  updateMandatingAgencyHandler,
  uploadAgencyImageHandler,
  uploadMandantImageHandler,
  uploadSyndicateLogoHandler
} from '../controllers/document-branding-controller';

/**
 * Identité des documents (lot S1, besoin 7).
 *
 * - Agences mandantes et logo d'une copropriété : module Syndic, mêmes
 *   permissions que les copropriétés (`syndic-routes.ts`).
 * - Signature et cachet de l'agence : paramètres de l'agence
 *   (`TENANT_SETTINGS_VIEW` / `TENANT_SETTINGS_EDIT`).
 *
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

const syndicGuards: RequestHandler[] = [authenticate, requireTenantAccess, enforcePropertyTenantIsolation];
const settingsGuards: RequestHandler[] = [authenticate, requireTenantAccess];

const canView = requireAnyPropertyPermission(['PROPERTIES_VIEW']);
const canCreate = requireAnyPropertyPermission(['PROPERTIES_CREATE']);
const canEdit = requirePropertyPermission('PROPERTIES_EDIT');
const imageField = brandingImageUpload.single('file');

// ------------------------------------------------------------ agences mandantes
const MANDANTS = '/tenants/:tenantId/syndic-mandating-agencies';
const MANDANT = `${MANDANTS}/:agencyId`;
const MANDANT_IMAGE = `${MANDANT}/images/:kind`;

router.get(MANDANTS, ...syndicGuards, canView, listMandatingAgenciesHandler);
router.post(MANDANTS, ...syndicGuards, canCreate, createMandatingAgencyHandler);
router.get(MANDANT, ...syndicGuards, canView, getMandatingAgencyHandler);
router.patch(MANDANT, ...syndicGuards, canEdit, updateMandatingAgencyHandler);
router.delete(MANDANT, ...syndicGuards, canEdit, deleteMandatingAgencyHandler);
router.get(MANDANT_IMAGE, ...syndicGuards, canView, readMandantImageHandler);
router.put(MANDANT_IMAGE, ...syndicGuards, canEdit, imageField, uploadMandantImageHandler);
router.delete(MANDANT_IMAGE, ...syndicGuards, canEdit, removeMandantImageHandler);

// ------------------------------------------------------------ logo d'une copropriété
const SYNDIC_LOGO = '/tenants/:tenantId/syndics/:syndicId/logo';

router.get(SYNDIC_LOGO, ...syndicGuards, canView, readSyndicateLogoHandler);
router.put(SYNDIC_LOGO, ...syndicGuards, canEdit, imageField, uploadSyndicateLogoHandler);
router.delete(SYNDIC_LOGO, ...syndicGuards, canEdit, removeSyndicateLogoHandler);

// ------------------------------------------------------------ signature et cachet de l'agence
const IDENTITY = '/tenants/:tenantId/document-identity';
const IDENTITY_IMAGE = `${IDENTITY}/images/:kind`;

router.get(IDENTITY, ...settingsGuards, requirePermission('TENANT_SETTINGS_VIEW'), getAgencyDocumentIdentityHandler);
router.get(IDENTITY_IMAGE, ...settingsGuards, requirePermission('TENANT_SETTINGS_VIEW'), readAgencyImageHandler);
router.put(
  IDENTITY_IMAGE,
  ...settingsGuards,
  requirePermission('TENANT_SETTINGS_EDIT'),
  imageField,
  uploadAgencyImageHandler
);
router.delete(IDENTITY_IMAGE, ...settingsGuards, requirePermission('TENANT_SETTINGS_EDIT'), removeAgencyImageHandler);

export default router;
