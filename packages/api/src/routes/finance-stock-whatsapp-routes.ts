import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { hasAnyPermission } from '../services/permission-service';
import { requireSettingsManage } from '../middleware/finance-rbac-middleware';
import { requireStockDispose, requireStockView, STOCK_PERMISSIONS } from '../middleware/stock-rbac-middleware';
import { AppError, ErrorCode, UnauthorizedError } from '../middleware/error-middleware';
import { CAPTURE_MAX_BYTES } from '../lib/stock-whatsapp/capture-files';
import {
  advanceSimulatorClockHandler,
  createRegistrationHandler,
  getCaptureFileHandler,
  getCaptureHandler,
  getOverviewHandler,
  getRegistrationHandler,
  getSimulatorConversationHandler,
  injectSimulatorMessageHandler,
  listCapturesHandler,
  listCountCapturesHandler,
  listEligibleMembersHandler,
  listEligibleSitesHandler,
  listFieldCountsHandler,
  listRegistrationsHandler,
  listSessionMessagesHandler,
  listSessionsHandler,
  regenerateActivationCodeHandler,
  removeCapturePhotoHandler,
  requireSimulatorAvailable,
  revokeRegistrationHandler,
  updateRegistrationSitesHandler
} from '../controllers/finance-stock-whatsapp-controller';

/**
 * Routes d'agence de l'inventaire de chantier par WhatsApp (lot 041, contrat
 * `specs/041-inventaire-whatsapp/contracts/openapi.yaml`), toutes sous
 * `/api/tenants/:tenantId/finance/stock/whatsapp/…` : inscriptions, passerelle
 * et mesures, comptages terrain, captures, conversations, simulateur.
 *
 * **Gardes d'agence posés AVEC leur chemin**, jamais en `router.use(authenticate)`
 * nu (incident du lot 1, `finance-routes.ts`) : ce routeur est monté sur `/api`
 * à côté des routeurs du stock. Le préfixe `/finance/stock` est classé
 * `CONSTRUCTION` (`lib/subscription/route-features.ts`).
 *
 * Droits (contrat, `x-permission`) :
 * - `FINANCE_SETTINGS_MANAGE` : passerelle et mesures, inscriptions, simulateur ;
 * - `STOCK_VIEW` : comptages terrain, captures et leur photo ;
 * - `STOCK_DISPOSE` : retrait d'une photo ;
 * - `FINANCE_SETTINGS_MANAGE` ou `STOCK_COUNT_VALIDATE` : conversations
 *   (`requireConversationReader`, refus `403 STOCK_WHATSAPP_CONVERSATION_FORBIDDEN`).
 * Un chef de chantier ne porte que `STOCK_COUNT` : aucune de ces routes ne lui
 * est ouverte.
 *
 * Simulateur : `requireSimulatorAvailable` passe EN TÊTE de chaque route, avant
 * la garde de droit et la lecture du fichier (W13-R1).
 *
 * Limiteurs (énumération) : `POST …/registrations` et `POST …/simulator/messages`
 * répondent l'un et l'autre si un numéro est déjà inscrit ailleurs ; ils sont
 * plafonnés par agence ET par utilisateur, après la garde de droit.
 *
 * Les chemins à segment fixe se déclarent avant les chemins paramétrés de même
 * profondeur.
 */

const router = Router();

const BASE = '/tenants/:tenantId/finance/stock/whatsapp';

router.use(BASE, authenticate, requireTenantAccess);

// ---------------------------------------------------------------------------
// Conversations (W14-R3) : elles contiennent les textes du chef
// ---------------------------------------------------------------------------

const CONVERSATION_PERMISSIONS = ['FINANCE_SETTINGS_MANAGE', STOCK_PERMISSIONS.COUNT_VALIDATE];

/**
 * Même règle que `requireAnyPermission`, mais le refus porte le code du contrat,
 * `403 STOCK_WHATSAPP_CONVERSATION_FORBIDDEN`, par le gestionnaire central.
 * `anyPermissionKeys` reste lisible par le catalogue de la passerelle IA.
 */
const requireConversationReader = Object.assign(
  (req: Request, _res: Response, next: NextFunction): void => {
    const userId = req.user?.userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }
    hasAnyPermission(userId, CONVERSATION_PERMISSIONS, req.tenantContext?.tenantId).then(allowed => {
      if (allowed) {
        next();
        return;
      }
      next(
        new AppError(
          "Vous n'avez pas accès aux conversations WhatsApp.",
          403,
          ErrorCode.STOCK_WHATSAPP_CONVERSATION_FORBIDDEN
        )
      );
    }, next);
  },
  { anyPermissionKeys: [...CONVERSATION_PERMISSIONS] }
);

// ---------------------------------------------------------------------------
// Limiteurs d'énumération (magasin en mémoire de processus)
// ---------------------------------------------------------------------------

/** Par agence ET par utilisateur : un collaborateur de deux agences a un budget dans chacune. */
function tenantUserKey(req: Request): string {
  return `${req.tenantContext?.tenantId ?? req.params.tenantId ?? 'aucune-agence'}:${req.user?.userId ?? 'anonyme'}`;
}

function limiterRefusal(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Trop de requêtes. Réessayez dans quelques minutes.', 429, 'RATE_LIMITED'));
}

/** Création d'inscriptions : 20 par quart d'heure, bien au-dessus d'une mise en place d'équipe. */
export const REGISTRATION_CREATE_LIMIT = { windowMs: 15 * 60_000, max: 20 } as const;

/** Messages du simulateur : 30 par minute, le rythme d'une recette menée à la main. */
export const SIMULATOR_MESSAGE_LIMIT = { windowMs: 60_000, max: 30 } as const;

const registrationCreateLimiter = rateLimit({
  ...REGISTRATION_CREATE_LIMIT,
  keyGenerator: req => `wa-registration:${tenantUserKey(req)}`,
  handler: limiterRefusal,
  standardHeaders: true,
  legacyHeaders: false
});

const simulatorMessageLimiter = rateLimit({
  ...SIMULATOR_MESSAGE_LIMIT,
  keyGenerator: req => `wa-simulator:${tenantUserKey(req)}`,
  handler: limiterRefusal,
  standardHeaders: true,
  legacyHeaders: false
});

// ---------------------------------------------------------------------------
// Photo du simulateur : mémoire, 10 Mo, JPEG / PNG / WebP déclarés
// ---------------------------------------------------------------------------

const SIMULATOR_PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const simulatorPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CAPTURE_MAX_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && SIMULATOR_PHOTO_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(
      new AppError(
        'Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WebP.',
        400,
        ErrorCode.STOCK_WHATSAPP_SIMULATOR_FILE_TYPE
      )
    );
  }
}).single('file');

/**
 * Lit la photo seulement pour un corps `multipart` (le texte et la réponse de
 * bouton arrivent en JSON). Le dépassement de 10 Mo reçoit son code du contrat,
 * `413 STOCK_WHATSAPP_FILE_TOO_LARGE`.
 */
function readSimulatorPhoto(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  simulatorPhotoUpload(req, res, (error?: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('Photo de plus de 10 Mo.', 413, ErrorCode.STOCK_WHATSAPP_FILE_TOO_LARGE));
      return;
    }
    next(error);
  });
}

// ---------------------------------------------------------------------------
// Passerelle, quota, mesures (W1, W11, W14-R7)
// ---------------------------------------------------------------------------

router.get(`${BASE}/overview`, requireSettingsManage, getOverviewHandler);

// ---------------------------------------------------------------------------
// Inscriptions (W3)
// ---------------------------------------------------------------------------

router.get(`${BASE}/eligible-members`, requireSettingsManage, listEligibleMembersHandler);
router.get(`${BASE}/eligible-sites`, requireSettingsManage, listEligibleSitesHandler);

router.get(`${BASE}/registrations`, requireSettingsManage, listRegistrationsHandler);
router.post(`${BASE}/registrations`, requireSettingsManage, registrationCreateLimiter, createRegistrationHandler);
router.get(`${BASE}/registrations/:registrationId`, requireSettingsManage, getRegistrationHandler);
router.patch(`${BASE}/registrations/:registrationId`, requireSettingsManage, updateRegistrationSitesHandler);
router.post(
  `${BASE}/registrations/:registrationId/regenerate-code`,
  requireSettingsManage,
  regenerateActivationCodeHandler
);
router.post(`${BASE}/registrations/:registrationId/revoke`, requireSettingsManage, revokeRegistrationHandler);

// ---------------------------------------------------------------------------
// Comptages terrain (W14-R2, ecrans §3)
// ---------------------------------------------------------------------------

router.get(`${BASE}/field-counts`, requireStockView, listFieldCountsHandler);

// ---------------------------------------------------------------------------
// Captures et preuve (T10, W14)
// ---------------------------------------------------------------------------

router.get(`${BASE}/captures`, requireStockView, listCapturesHandler);
router.get(`${BASE}/captures/:captureId`, requireStockView, getCaptureHandler);
router.get(`${BASE}/captures/:captureId/file`, requireStockView, getCaptureFileHandler);
router.post(`${BASE}/captures/:captureId/remove-photo`, requireStockDispose, removeCapturePhotoHandler);
router.get(`${BASE}/counts/:countId/captures`, requireStockView, listCountCapturesHandler);

// ---------------------------------------------------------------------------
// Conversations (T9, W14-R3)
// ---------------------------------------------------------------------------

router.get(`${BASE}/sessions`, requireConversationReader, listSessionsHandler);
router.get(`${BASE}/sessions/:sessionId/messages`, requireConversationReader, listSessionMessagesHandler);

// ---------------------------------------------------------------------------
// Simulateur (W13) — absent hors transport `log`, ou en production sans
// WHATSAPP_INVENTORY_SIMULATOR=1 ; exclu du catalogue de l'assistant
// ---------------------------------------------------------------------------

router.post(
  `${BASE}/simulator/messages`,
  requireSimulatorAvailable,
  requireSettingsManage,
  simulatorMessageLimiter,
  readSimulatorPhoto,
  injectSimulatorMessageHandler
);
router.get(
  `${BASE}/simulator/conversation`,
  requireSimulatorAvailable,
  requireSettingsManage,
  getSimulatorConversationHandler
);
router.post(
  `${BASE}/simulator/sessions/:sessionId/advance`,
  requireSimulatorAvailable,
  requireSettingsManage,
  advanceSimulatorClockHandler
);

export default router;
