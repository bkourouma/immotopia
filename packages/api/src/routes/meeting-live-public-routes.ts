import express, { NextFunction, Request, Response, Router } from 'express';
import { invalidSecureLinkError } from '../lib/secure-links';
import {
  meetingLiveActionRateLimiter,
  meetingLiveIpRateLimiter,
  meetingLiveStateRateLimiter,
  meetingVisioRateLimiter
} from '../middleware/rate-limit-middleware';
import { secureLinkNoStoreHeaders } from '../controllers/secure-link-public-controller';
import {
  meetingLiveJoinHandler,
  meetingLiveStateHandler,
  meetingLiveVoteHandler,
  meetingVisioHandHandler,
  meetingVisioTokenHandler
} from '../controllers/meeting-live-public-controller';

/**
 * Routes publiques de l'AG en direct (spec 043), par lien personnel. Meme
 * gabarit que `secure-link-public-routes.ts` :
 *  - limiteur par IP en PREMIER (600/min : une salle partage souvent une IP),
 *    puis limiteur par jeton (cle = empreinte du jeton, apres le parseur) ;
 *  - en-tetes no-store / noindex / no-referrer sur toutes les reponses ;
 *  - POST uniquement, parseur JSON borne a 4 Ko ; `app.ts` exclut ce prefixe
 *    de ses parseurs globaux ;
 *  - toute erreur de corps devient la 404 uniforme, sans journaliser le
 *    message du parseur (il peut citer un extrait du corps, donc un jeton).
 */

/** Prefixe (avec `/api`) des routes de ce routeur, partage avec `app.ts`. */
export const PUBLIC_MEETING_LIVE_PREFIX = '/api/public/assemblees';

const MAX_BODY = '4kb';

function isBodyParserError(err: unknown): boolean {
  const type = (err as { type?: unknown } | null)?.type;
  return typeof type === 'string' && /^(entity|encoding|charset|request|stream|parameters)\./.test(type);
}

const router = Router();

router.post(
  '/public/assemblees/etat',
  meetingLiveIpRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  meetingLiveStateRateLimiter,
  meetingLiveStateHandler
);

router.post(
  '/public/assemblees/rejoindre',
  meetingLiveIpRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  meetingLiveActionRateLimiter,
  meetingLiveJoinHandler
);

router.post(
  '/public/assemblees/voter',
  meetingLiveIpRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  meetingLiveActionRateLimiter,
  meetingLiveVoteHandler
);

router.post(
  '/public/assemblees/visio',
  meetingLiveIpRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  meetingVisioRateLimiter,
  meetingVisioTokenHandler
);

router.post(
  '/public/assemblees/visio/main',
  meetingLiveIpRateLimiter,
  secureLinkNoStoreHeaders,
  express.json({ limit: MAX_BODY }),
  meetingVisioRateLimiter,
  meetingVisioHandHandler
);

router.use('/public/assemblees', (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  next(isBodyParserError(err) ? invalidSecureLinkError() : err);
});

export default router;
