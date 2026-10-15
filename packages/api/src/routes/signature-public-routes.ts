import express, { NextFunction, Request, Response, Router } from 'express';
import { t } from '../i18n';
import { invalidSecureLinkError } from '../lib/secure-links';
import { AppError } from '../middleware/error-middleware';
import {
  signatureActionRateLimiter,
  signatureOtpRateLimiter,
  signaturePublicRateLimiter
} from '../middleware/rate-limit-middleware';
import { secureLinkNoStoreHeaders } from '../controllers/secure-link-public-controller';
import {
  declinePublicHandler,
  getPublicSignatureFileHandler,
  getPublicSignatureHandler,
  sendPublicOtpHandler,
  signPublicHandler
} from '../controllers/signature-public-controller';

/**
 * Routes publiques de la signature électronique (spec 044, lot S1), sous
 * `/api/public/signatures/:token`. Montées dans `app.ts` AVANT les routeurs qui
 * imposent une authentification : le jeton du signataire est la seule preuve
 * d'accès. Limiteur par IP avant toute vérification, en-têtes anti-cache sur
 * succès comme échec, refus uniforme (404) pour tout jeton sans effet.
 *
 * Corps : parseur JSON propre (le préfixe est exclu des parseurs globaux de
 * `app.ts`) ; 1 Ko partout, sauf la signature dessinée (400 Ko). Toute erreur
 * du parseur devient le 404 uniforme, sans journaliser son message.
 */
export const PUBLIC_SIGNATURES_PREFIX = '/api/public/signatures';

const router = Router();
const SMALL = express.json({ limit: '2kb' });
const SIGN = express.json({ limit: '400kb' });

router.get(
  '/public/signatures/:token',
  signaturePublicRateLimiter,
  secureLinkNoStoreHeaders,
  getPublicSignatureHandler
);
router.get(
  '/public/signatures/:token/file',
  signaturePublicRateLimiter,
  secureLinkNoStoreHeaders,
  getPublicSignatureFileHandler
);
router.post(
  '/public/signatures/:token/otp',
  signatureOtpRateLimiter,
  secureLinkNoStoreHeaders,
  SMALL,
  sendPublicOtpHandler
);
router.post(
  '/public/signatures/:token/sign',
  signatureActionRateLimiter,
  secureLinkNoStoreHeaders,
  SIGN,
  signPublicHandler
);
router.post(
  '/public/signatures/:token/decline',
  signatureActionRateLimiter,
  secureLinkNoStoreHeaders,
  SMALL,
  declinePublicHandler
);

function isBodyParserError(err: unknown): boolean {
  const type = (err as { type?: unknown } | null)?.type;
  return typeof type === 'string' && /^(entity|encoding|charset|request|stream|parameters)\./.test(type);
}

/**
 * Erreurs publiques : un parseur en échec devient le 404 uniforme ; une erreur
 * typée qui porte des données (`remainingAttempts`, `retryAfterSeconds`) les
 * expose sous `details` (et `data`), avec son `code`. Les autres suivent leur cours.
 */
router.use('/public/signatures', (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (isBodyParserError(err)) return next(invalidSecureLinkError());
  if (err instanceof AppError && err.data !== undefined) {
    res.status(err.statusCode).json({
      success: false,
      message: t(err.message),
      ...(err.code ? { code: err.code } : {}),
      details: err.data,
      data: err.data
    });
    return;
  }
  next(err);
});

export default router;
