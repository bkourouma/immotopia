import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireSyndicDirectDebitManage,
  requireSyndicDirectDebitView,
  requireTenantSyndicate
} from '../middleware/syndic-direct-debit-rbac-middleware';
import { MANDATE_SCAN_MAX_BYTES } from '../lib/direct-debit/mandate-files';
import { RETURN_FILE_MAX_BYTES } from '../lib/direct-debit/return-formats/types';
import {
  activateMandateHandler,
  applyReturnHandler,
  cancelRemittanceHandler,
  cancelRemittanceLineHandler,
  checkIbanHandler,
  createMandateHandler,
  createRemittanceHandler,
  downloadAuthorizationPdfHandler,
  downloadSignedScanHandler,
  exportRemittanceHandler,
  getCreditorHandler,
  getMandateHandler,
  getRemittanceHandler,
  listLotDebtorsHandler,
  listMandatesHandler,
  listRemittancesHandler,
  listReturnsHandler,
  previewReturnHandler,
  reactivateMandateHandler,
  refreshRemittanceHandler,
  rejectLineHandler,
  resendPrenotificationsHandler,
  revokeMandateHandler,
  settleAllHandler,
  settleLineHandler,
  submitRemittanceHandler,
  suspendMandateHandler,
  updateMandateHandler,
  uploadSignedScanHandler,
  upsertCreditorHandler,
  validateRemittanceHandler
} from '../controllers/syndic-direct-debit-controller';

/**
 * Prélèvement bancaire des copropriétés : créancier du syndicat, mandats par
 * lot, remises d'appels de charges et retours banque (spec 042, lot P4,
 * data-model §9.4).
 *
 * Monté sur `/api` tout entier par `app.ts` : chaque route porte donc ses
 * gardes avec son chemin, jamais en `router.use` nu. Le préfixe
 * `/tenants/:tenantId/syndics/…` est couvert par la fonctionnalité SYNDIC de
 * l'abonnement (`lib/subscription/route-features.ts`, règle `/syndics`).
 *
 * Gardes : session, agence, syndicat de l'agence (404 sinon), puis
 * `SYNDIC_DIRECT_DEBIT_VIEW` (consulter, IBAN masqué) ou
 * `SYNDIC_DIRECT_DEBIT_MANAGE` (tout le reste, dont le PDF et le fichier à IBAN
 * complet).
 */
const router = Router();

const base: RequestHandler[] = [authenticate, requireTenantAccess, requireTenantSyndicate];
const view = [...base, requireSyndicDirectDebitView];
const manage = [...base, requireSyndicDirectDebitManage];

// Stockage en mémoire : le service lit les octets magiques (scan) ou analyse le fichier (retour).
const uploadScan = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MANDATE_SCAN_MAX_BYTES, files: 1 }
});
const uploadReturn = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RETURN_FILE_MAX_BYTES, files: 1 }
});

const BASE = '/tenants/:tenantId/syndics/:syndicId/prelevements';

// Créancier du syndicat
router.get(`${BASE}/creancier`, ...view, getCreditorHandler);
router.put(`${BASE}/creancier`, ...manage, upsertCreditorHandler);

// Contrôle d'un IBAN ou d'un RIB (ne renvoie que le masque) et copropriétaires d'un lot
router.post(`${BASE}/controle-iban`, ...manage, checkIbanHandler);
router.get(`${BASE}/lots/:lotId/debiteurs`, ...view, listLotDebtorsHandler);

// Mandats
router.get(`${BASE}/mandats`, ...view, listMandatesHandler);
router.post(`${BASE}/mandats`, ...manage, createMandateHandler);
router.get(`${BASE}/mandats/:mandateId`, ...view, getMandateHandler);
router.patch(`${BASE}/mandats/:mandateId`, ...manage, updateMandateHandler);
router.post(`${BASE}/mandats/:mandateId/activer`, ...manage, activateMandateHandler);
router.post(`${BASE}/mandats/:mandateId/suspendre`, ...manage, suspendMandateHandler);
router.post(`${BASE}/mandats/:mandateId/reactiver`, ...manage, reactivateMandateHandler);
router.post(`${BASE}/mandats/:mandateId/revoquer`, ...manage, revokeMandateHandler);

// Documents du mandat (le PDF porte l'IBAN complet : permission de gestion)
router.get(`${BASE}/mandats/:mandateId/autorisation-pdf`, ...manage, downloadAuthorizationPdfHandler);
router.post(`${BASE}/mandats/:mandateId/scan-signe`, ...manage, uploadScan.single('file'), uploadSignedScanHandler);
router.get(`${BASE}/mandats/:mandateId/scan-signe`, ...manage, downloadSignedScanHandler);

// Remises
router.get(`${BASE}/remises`, ...view, listRemittancesHandler);
router.post(`${BASE}/remises`, ...manage, createRemittanceHandler);
router.get(`${BASE}/remises/:remittanceId`, ...view, getRemittanceHandler);
router.post(`${BASE}/remises/:remittanceId/actualiser`, ...manage, refreshRemittanceHandler);
router.post(`${BASE}/remises/:remittanceId/lignes/:lineId/retirer`, ...manage, cancelRemittanceLineHandler);
router.post(`${BASE}/remises/:remittanceId/valider`, ...manage, validateRemittanceHandler);
router.post(`${BASE}/remises/:remittanceId/avis`, ...manage, resendPrenotificationsHandler);
// Le fichier porte les IBAN complets : POST (jamais mis en cache ni préchargé), permission de gestion.
router.post(`${BASE}/remises/:remittanceId/fichier`, ...manage, exportRemittanceHandler);
router.post(`${BASE}/remises/:remittanceId/deposer`, ...manage, submitRemittanceHandler);
router.post(`${BASE}/remises/:remittanceId/annuler`, ...manage, cancelRemittanceHandler);

// Constats (service de retour banque)
router.post(`${BASE}/remises/:remittanceId/lignes/:lineId/regler`, ...manage, settleLineHandler);
router.post(`${BASE}/remises/:remittanceId/lignes/:lineId/rejeter`, ...manage, rejectLineHandler);
router.post(`${BASE}/remises/:remittanceId/tout-regler`, ...manage, settleAllHandler);

// Fichiers de retour de la banque
router.post(`${BASE}/retours/apercu`, ...manage, uploadReturn.single('file'), previewReturnHandler);
router.post(`${BASE}/retours/appliquer`, ...manage, uploadReturn.single('file'), applyReturnHandler);
router.get(`${BASE}/retours`, ...view, listReturnsHandler);

export default router;
