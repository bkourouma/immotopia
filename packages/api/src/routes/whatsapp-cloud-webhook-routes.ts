import { Router } from 'express';

/**
 * Webhook Meta WhatsApp Cloud — inventaire de chantier par WhatsApp (lot 041,
 * spec W6, contrat `GET` et `POST /api/webhooks/whatsapp-cloud/events`).
 *
 * SQUELETTE des fondations : aucune route. Le territoire W1 y déclare
 * `GET /events` (vérification d'abonnement) et `POST /events` (événements).
 *
 * Montage (`src/app.ts`) : `app.use(WHATSAPP_CLOUD_WEBHOOK_PREFIX, router)`,
 * AVANT `whatsappWebhookRoutes` (dont le `router.use(express.urlencoded…)`
 * traverse toute requête `/api/*`), et ce préfixe est exclu des parseurs
 * globaux (`express.json`, `express.urlencoded`) : le corps arrive BRUT. Ce
 * routeur lit lui-même `express.raw({ type: 'application/json', limit: '1mb' })`,
 * pour vérifier `X-Hub-Signature-256` sur les octets reçus (W6-R2, W6-R4).
 *
 * Public par nature (aucune session) : signature toujours vérifiée, hors
 * abonnement, hors catalogue de l'assistant (chemin contenant « webhook »).
 */
export const WHATSAPP_CLOUD_WEBHOOK_PREFIX = '/api/webhooks/whatsapp-cloud';

const router = Router();

export default router;
