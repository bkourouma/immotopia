import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { livekitWebhookRateLimiter } from '../middleware/rate-limit-middleware';
import { isVisioEnabled, verifyWebhook } from '../services/livekit-service';
import { handleEgressEnded } from '../lib/syndics/meeting-recording';
import { logger } from '../utils/logger';

/**
 * Webhook LiveKit (spec 045, R4) : `POST /api/webhooks/livekit`.
 *
 * Montage (`src/app.ts`) : AVANT les routeurs `/api`, et ce prefixe est exclu des
 * parseurs globaux : le corps arrive BRUT, pour verifier la signature sur les
 * octets recus (`WebhookReceiver`, cles du projet LiveKit). Public par nature :
 * signature TOUJOURS exigee, absente ou invalide = 401 sans detail. Visio non
 * configuree = 404. Seul `egress_ended` agit ; reponse 200 rapide, le
 * rapatriement du fichier suit la reponse. Journal : jamais le corps ni la
 * signature.
 */
export const LIVEKIT_WEBHOOK_PREFIX = '/api/webhooks/livekit';

const router = Router();

function requireVisio(_req: Request, res: Response, next: NextFunction): void {
  if (!isVisioEnabled()) {
    res.status(404).end();
    return;
  }
  next();
}

const rawParser = express.raw({ type: '*/*', limit: '1mb' });

/** Corps brut ; erreur du parseur : 413 au-dela de 1 Mo, 400 sinon, sans passer par le gestionnaire global. */
function readRawBody(req: Request, res: Response, next: NextFunction): void {
  rawParser(req, res, (error?: unknown) => {
    if (error) {
      res.status((error as { status?: unknown }).status === 413 ? 413 : 400).end();
      return;
    }
    next();
  });
}

router.post(
  '/',
  requireVisio,
  livekitWebhookRateLimiter,
  readRawBody,
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody: unknown = req.body;
    let event;
    try {
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw new Error('empty');
      event = await verifyWebhook(rawBody.toString('utf8'), req.get('authorization'));
    } catch {
      logger.warn('Webhook LiveKit : signature absente ou invalide', { ip: req.ip });
      res.status(401).end();
      return;
    }

    if (event.event !== 'egress_ended') {
      res.status(200).json({ received: true });
      return;
    }

    // Ecriture AVANT la reponse : une erreur de base repond 500 et LiveKit renverra.
    const { followUp } = await handleEgressEnded({ id: event.id, egressInfo: event.egressInfo });
    res.status(200).json({ received: true });
    if (followUp) setImmediate(() => void followUp());
  })
);

export default router;
