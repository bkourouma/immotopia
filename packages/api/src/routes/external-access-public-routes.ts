import express, { NextFunction, Request, Response, Router } from 'express';
import { invalidSecureLinkError } from '../lib/secure-links';
import { secureLinkPublicRateLimiter } from '../middleware/rate-limit-middleware';
import { secureLinkNoStoreHeaders } from '../controllers/secure-link-public-controller';
import {
  externalAccessDocumentDownloadPublicHandler,
  externalAccessViewPublicHandler
} from '../controllers/external-access-public-controller';

/**
 * Routes publiques de l'accès des tiers de confiance (lot B3, spec 034).
 * Même gabarit, mêmes mesures que `secure-link-public-routes.ts` (SECURITY.md
 * §12 bis) :
 *  - limiteur par IP en PREMIER (le même que celui du rapport mensuel : un seul
 *    budget de 30 requêtes par minute et par IP pour tous les liens publics) ;
 *  - en-têtes no-store / noindex / no-referrer sur toutes les réponses, refus
 *    et 429 compris ;
 *  - parseur JSON propre, borné à 1 Ko ; `app.ts` exclut ce préfixe de ses
 *    parseurs globaux (`PUBLIC_EXTERNAL_ACCESS_PREFIX`) ;
 *  - toute erreur de corps devient la 404 uniforme, sans journaliser le
 *    message du parseur (il peut citer un extrait du corps, donc un jeton).
 */

/** Préfixe (avec `/api`) des routes de ce routeur, partagé avec `app.ts`. */
export const PUBLIC_EXTERNAL_ACCESS_PREFIX = '/api/public/external-access';

const MAX_BODY = '1kb';

/** Erreur de `body-parser` : `type` en `entity.*`, `encoding.*`, `charset.*`, `request.*`, `stream.*`. */
function isBodyParserError(err: unknown): boolean {
  const type = (err as { type?: unknown } | null)?.type;
  return typeof type === 'string' && /^(entity|encoding|charset|request|stream|parameters)\./.test(type);
}

const router = Router();

router.post(
  '/public/external-access/patrimoine',
  secureLinkPublicRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  externalAccessViewPublicHandler
);

router.post(
  '/public/external-access/documents/download',
  secureLinkPublicRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  externalAccessDocumentDownloadPublicHandler
);

// Erreur de parseur : refus uniforme (en-têtes no-store déjà posés), message jeté sans journal.
router.use('/public/external-access', (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  next(isBodyParserError(err) ? invalidSecureLinkError() : err);
});

export default router;
