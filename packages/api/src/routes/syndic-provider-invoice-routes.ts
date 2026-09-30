import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { PROVIDER_INVOICE_FILE_MAX_BYTES } from '../lib/syndics/provider-invoice-files';
import {
  cancelProviderInvoiceHandler,
  cancelProviderPaymentHandler,
  createProviderInvoiceHandler,
  deleteProviderInvoiceFileHandler,
  downloadProviderInvoiceFileHandler,
  getProviderInvoiceHandler,
  listFundMovementsHandler,
  listProviderBalancesHandler,
  listProviderInvoicesHandler,
  payProviderInvoiceHandler,
  updateProviderInvoiceHandler,
  uploadProviderInvoiceFileHandler
} from '../controllers/syndic-provider-invoice-controller';

/**
 * Lot S6 — factures et paiements des prestataires d'une copropriete.
 *
 * Routeur distinct de `syndic-routes.ts`, meme prefixe (classe SYNDIC dans
 * lib/subscription/route-features.ts) et memes gardes : session, acces a
 * l'agence, contexte d'agence, puis permission de lecture (SYNDIC_VIEW)
 * ou d'edition (SYNDIC_EDIT), comme les routes prestataires et fonds.
 *
 * Les gardes sont posees ROUTE PAR ROUTE et non par `router.use` : monte sur
 * `/api`, un `router.use(requireTenantAccess)` s'appliquerait a toute requete
 * `/api/*` qui traverse ce routeur.
 *
 * La piece jointe (PDF, PNG, JPEG, 10 Mo) arrive en multipart, champ `file`.
 * Le type reel est verifie sur les octets dans lib/syndics/provider-invoice-files.ts ;
 * multer ne fait que borner la taille. Le fichier n'est jamais servi en
 * statique : seulement par `GET .../fichier`.
 */

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROVIDER_INVOICE_FILE_MAX_BYTES, files: 1 }
});

const BASE = '/tenants/:tenantId/syndics/:syndicId';
const read: RequestHandler[] = [
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requireAnyPropertyPermission(['SYNDIC_VIEW'])
];
const write: RequestHandler[] = [
  authenticate,
  requireTenantAccess,
  enforcePropertyTenantIsolation,
  requirePropertyPermission('SYNDIC_EDIT')
];

router.get(`${BASE}/factures-prestataires`, ...read, listProviderInvoicesHandler);
router.post(`${BASE}/factures-prestataires`, ...write, upload.single('file'), createProviderInvoiceHandler);
router.get(`${BASE}/factures-prestataires/:invoiceId`, ...read, getProviderInvoiceHandler);
router.patch(`${BASE}/factures-prestataires/:invoiceId`, ...write, updateProviderInvoiceHandler);
router.post(`${BASE}/factures-prestataires/:invoiceId/annulation`, ...write, cancelProviderInvoiceHandler);
router.get(`${BASE}/factures-prestataires/:invoiceId/fichier`, ...read, downloadProviderInvoiceFileHandler);
router.post(
  `${BASE}/factures-prestataires/:invoiceId/fichier`,
  ...write,
  upload.single('file'),
  uploadProviderInvoiceFileHandler
);
router.delete(`${BASE}/factures-prestataires/:invoiceId/fichier`, ...write, deleteProviderInvoiceFileHandler);
router.post(`${BASE}/factures-prestataires/:invoiceId/paiements`, ...write, payProviderInvoiceHandler);
router.post(
  `${BASE}/factures-prestataires/:invoiceId/paiements/:paymentId/annulation`,
  ...write,
  cancelProviderPaymentHandler
);
router.get(`${BASE}/prestataires/soldes`, ...read, listProviderBalancesHandler);
router.get(`${BASE}/fonds/:fundId/mouvements`, ...read, listFundMovementsHandler);

export default router;
