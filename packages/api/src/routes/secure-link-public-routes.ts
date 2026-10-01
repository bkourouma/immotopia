import express, { NextFunction, Request, Response, Router } from 'express';
import { invalidSecureLinkError } from '../lib/secure-links';
import { secureLinkPublicRateLimiter } from '../middleware/rate-limit-middleware';
import {
  ownerMonthlyReportPublicHandler,
  secureLinkNoStoreHeaders
} from '../controllers/secure-link-public-controller';

/**
 * Routes publiques des liens sécurisés (lot A3, lib/secure-links). Montées
 * dans `app.ts` AVANT les routeurs qui imposent une authentification ou un
 * contexte d'agence : le jeton du lien est la seule preuve d'accès.
 *
 * Le limiteur par IP passe en premier, avant toute vérification du jeton.
 *
 * Corps : cette route a SON PROPRE parseur JSON borné à 1 Ko (un jeton fait
 * ~43 caractères). `app.ts` exclut ce préfixe de ses parseurs globaux
 * (`PUBLIC_SECURE_LINKS_PREFIX`) : sans cela, le parseur global à 10 Mo
 * répondrait lui-même (400/413 sans en-têtes no-store) avant cette route.
 * Toute erreur du parseur (JSON invalide, corps trop gros, encodage refusé…)
 * est convertie ici en la 404 uniforme, sans journaliser le message du
 * parseur (il peut citer un extrait du corps, donc un jeton).
 */

/** Préfixe (avec `/api`) des routes de ce routeur, partagé avec `app.ts`. */
export const PUBLIC_SECURE_LINKS_PREFIX = '/api/public/secure-links';

const MAX_BODY = '1kb';

/** Erreur de `body-parser` : `type` en `entity.*`, `encoding.*`, `charset.*`, `request.*`, `stream.*`. */
function isBodyParserError(err: unknown): boolean {
  const type = (err as { type?: unknown } | null)?.type;
  return typeof type === 'string' && /^(entity|encoding|charset|request|stream|parameters)\./.test(type);
}

const router = Router();

// En-têtes anti-cache/indexation posés avant le handler : l'erreur 404 les porte aussi.
router.post(
  '/public/secure-links/owner-monthly-report',
  secureLinkPublicRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  ownerMonthlyReportPublicHandler
);

// Erreur de parseur : refus uniforme (les en-têtes no-store sont déjà posés),
// message du parseur jeté sans journalisation. Les autres erreurs suivent leur cours.
router.use('/public/secure-links', (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  next(isBodyParserError(err) ? invalidSecureLinkError() : err);
});

export default router;
