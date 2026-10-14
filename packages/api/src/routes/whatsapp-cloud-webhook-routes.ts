import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env';
import { processWebhookEventsInOrder } from '../lib/stock-whatsapp/webhook/process-event';
import { parseMetaWebhookPayload } from '../lib/stock-whatsapp/webhook/parse-payload';
import { recordWebhookEvents } from '../lib/stock-whatsapp/webhook/record-event';
import { verifyMetaSignature, verifyTokenMatches } from '../lib/stock-whatsapp/webhook/signature';
import { asyncHandler } from '../middleware/error-middleware';
import { whatsappCloudWebhookRateLimiter } from '../middleware/rate-limit-middleware';
import { logger } from '../utils/logger';

/**
 * Webhook Meta WhatsApp Cloud — inventaire de chantier par WhatsApp (lot 041,
 * spec W6, contrat `GET` et `POST /api/webhooks/whatsapp-cloud/events`).
 *
 * Montage (`src/app.ts`) : `app.use(WHATSAPP_CLOUD_WEBHOOK_PREFIX, router)`,
 * AVANT `whatsappWebhookRoutes` (dont le `router.use(express.urlencoded…)`
 * traverse toute requête `/api/*`), et ce préfixe est exclu des parseurs
 * globaux (`express.json`, `express.urlencoded`) : le corps arrive BRUT. Ce
 * routeur lit lui-même `express.raw({ type: 'application/json', limit: '1mb' })`,
 * pour vérifier `X-Hub-Signature-256` sur les octets reçus (W6-R2, W6-R4).
 *
 * Public par nature (aucune session) : signature TOUJOURS vérifiée, quel que
 * soit `NODE_ENV`, sans aucun contournement ; hors abonnement ; hors catalogue
 * de l'assistant (chemin contenant « webhook »). Hors transport `meta`, les
 * deux routes répondent `404` (W6-R1).
 *
 * Journal : jamais le corps, le jeton, la signature ni un numéro.
 */
export const WHATSAPP_CLOUD_WEBHOOK_PREFIX = '/api/webhooks/whatsapp-cloud';

const router = Router();

/** Challenge renvoyé tel quel, borné et sans caractère de contrôle (corps `text/plain`). */
const CHALLENGE_PATTERN = /^[\x21-\x7e]{1,256}$/;

/** `404` tant que le transport n'est pas `meta` (lu à chaque requête). */
function requireMetaTransport(_req: Request, res: Response, next: NextFunction): void {
  if (env.WHATSAPP_INVENTORY_TRANSPORT !== 'meta') {
    res.status(404).end();
    return;
  }
  next();
}

function queryString(req: Request, name: string): string | null {
  const value = (req.query as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

const rawJsonParser = express.raw({ type: 'application/json', limit: '1mb' });

/**
 * Corps brut (W6-R2), erreurs du parseur traitées ici : `413` au-delà de 1 Mo,
 * `400` sinon, sans passer par le gestionnaire global (qui journaliserait le
 * message du parseur).
 */
function readRawBody(req: Request, res: Response, next: NextFunction): void {
  rawJsonParser(req, res, (error?: unknown) => {
    if (error) {
      const status = (error as { status?: unknown }).status;
      res.status(status === 413 ? 413 : 400).end();
      return;
    }
    next();
  });
}

/** Vérification d'abonnement (W6-R3). */
router.get('/events', requireMetaTransport, whatsappCloudWebhookRateLimiter, (req: Request, res: Response) => {
  const mode = queryString(req, 'hub.mode');
  const token = queryString(req, 'hub.verify_token');
  const challenge = queryString(req, 'hub.challenge');
  if (
    mode !== 'subscribe' ||
    challenge === null ||
    !CHALLENGE_PATTERN.test(challenge) ||
    !verifyTokenMatches(env.META_WA_VERIFY_TOKEN, token)
  ) {
    logger.warn('Webhook WhatsApp Cloud : vérification d’abonnement refusée', { ip: req.ip });
    res.status(403).end();
    return;
  }
  res.status(200).type('text/plain').send(challenge);
});

/** Événements (W6-R4 à R8) : signature, insertion, `200`, puis traitement dans le processus. */
router.post(
  '/events',
  requireMetaTransport,
  // Limiteur propre à ce webhook, AVANT la lecture du corps et la signature.
  whatsappCloudWebhookRateLimiter,
  readRawBody,
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody: unknown = req.body;
    if (
      !Buffer.isBuffer(rawBody) ||
      !verifyMetaSignature(rawBody, req.get('x-hub-signature-256'), env.META_WA_APP_SECRET)
    ) {
      logger.warn('Webhook WhatsApp Cloud : signature absente ou invalide', { ip: req.ip });
      res.status(401).end();
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      // Signé mais illisible : un renvoi n'y changerait rien.
      logger.warn('Webhook WhatsApp Cloud : corps signé mais illisible', { sizeBytes: rawBody.length });
      res.status(200).json({ received: true });
      return;
    }

    const receivedAt = new Date();
    const parsed = parseMetaWebhookPayload(body, { phoneNumberId: env.META_WA_PHONE_NUMBER_ID, receivedAt });
    // Insertion AVANT la réponse : une erreur de base répond 500 et Meta renverra.
    const recorded = await recordWebhookEvents(parsed, receivedAt);
    if (parsed.staleMessages > 0) {
      // Comptes seuls : jamais le corps ni un numéro.
      logger.warn('Webhook WhatsApp Cloud : messages trop anciens ignorés (rejeu possible)', {
        staleMessages: parsed.staleMessages
      });
    }
    if (parsed.invalidMessages > 0 || parsed.ignoredChanges > 0) {
      logger.info('Webhook WhatsApp Cloud : éléments ignorés', {
        invalidMessages: parsed.invalidMessages,
        ignoredChanges: parsed.ignoredChanges
      });
    }

    res.status(200).json({ received: true });

    if (recorded.eventIds.length > 0) {
      const eventIds = recorded.eventIds;
      setImmediate(() => {
        void processWebhookEventsInOrder(eventIds);
      });
    }
  })
);

export default router;
