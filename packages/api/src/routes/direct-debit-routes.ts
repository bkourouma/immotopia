import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireDirectDebitManage, requireDirectDebitView } from '../middleware/rental-rbac-middleware';
import { MANDATE_SCAN_MAX_BYTES } from '../lib/direct-debit/mandate-files';
import {
  activateMandateHandler,
  checkIbanHandler,
  createCreditorHandler,
  createMandateHandler,
  downloadAuthorizationPdfHandler,
  downloadSignedScanHandler,
  getMandateHandler,
  listCreditorsHandler,
  listMandatesHandler,
  reactivateMandateHandler,
  revokeMandateHandler,
  suspendMandateHandler,
  updateCreditorHandler,
  updateMandateHandler,
  uploadSignedScanHandler
} from '../controllers/direct-debit-controller';

/**
 * Prélèvement bancaire : créanciers et mandats (spec 042, lot P1).
 *
 * Monté sur `/api` tout entier par `app.ts` : chaque route porte donc ses
 * gardes avec son chemin, jamais en `router.use` nu (modèle :
 * `lease-inspection-routes.ts`). Le préfixe `/tenants/:tenantId/rental/…`
 * est couvert par la fonctionnalité RENTAL de l'abonnement
 * (`lib/subscription/route-features.ts`).
 *
 * Droits : consulter = `RENTAL_DIRECT_DEBIT_VIEW` (IBAN masqué) ; tout le
 * reste, dont le PDF à IBAN complet et le scan signé =
 * `RENTAL_DIRECT_DEBIT_MANAGE`.
 */
const router = Router();

const view = [authenticate, requireTenantAccess, requireDirectDebitView];
const manage = [authenticate, requireTenantAccess, requireDirectDebitManage];

// Stockage en mémoire : le service écrit lui-même le fichier, hors de tout
// dossier public, après lecture des octets magiques (PDF, PNG, JPEG).
const uploadScan = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MANDATE_SCAN_MAX_BYTES, files: 1 }
});

const BASE = '/tenants/:tenantId/rental/direct-debit';

// Créanciers
router.get(`${BASE}/creditors`, ...view, listCreditorsHandler);
router.post(`${BASE}/creditors`, ...manage, createCreditorHandler);
router.patch(`${BASE}/creditors/:creditorId`, ...manage, updateCreditorHandler);

// Contrôle d'un IBAN ou d'un RIB (ne renvoie que le masque)
router.post(`${BASE}/iban-check`, ...manage, checkIbanHandler);

// Mandats
router.get(`${BASE}/mandates`, ...view, listMandatesHandler);
router.post(`${BASE}/mandates`, ...manage, createMandateHandler);
router.get(`${BASE}/mandates/:mandateId`, ...view, getMandateHandler);
router.patch(`${BASE}/mandates/:mandateId`, ...manage, updateMandateHandler);
router.post(`${BASE}/mandates/:mandateId/activate`, ...manage, activateMandateHandler);
router.post(`${BASE}/mandates/:mandateId/suspend`, ...manage, suspendMandateHandler);
router.post(`${BASE}/mandates/:mandateId/reactivate`, ...manage, reactivateMandateHandler);
router.post(`${BASE}/mandates/:mandateId/revoke`, ...manage, revokeMandateHandler);

// Documents du mandat
router.get(`${BASE}/mandates/:mandateId/authorization-pdf`, ...manage, downloadAuthorizationPdfHandler);
router.post(`${BASE}/mandates/:mandateId/signed-scan`, ...manage, uploadScan.single('file'), uploadSignedScanHandler);
router.get(`${BASE}/mandates/:mandateId/signed-scan`, ...manage, downloadSignedScanHandler);

export default router;
