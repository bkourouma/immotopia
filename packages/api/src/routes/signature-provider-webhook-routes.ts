import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { signatureProviderWebhookRateLimiter } from '../middleware/rate-limit-middleware';
import { handleSignatureProviderWebhook } from '../services/signature-provider-webhook-service';

/**
 * Webhook du prestataire de signature externe (spec 044, lot S6) :
 * `POST /api/public/signature-provider/yousign`. Public par nature (aucune
 * session) : l'authenticité vient de la signature HMAC du prestataire sur le
 * corps BRUT, toujours vérifiée ; l'état est ensuite relu chez le prestataire.
 * Monté dans `app.ts` avant `signaturePublicRoutes`, préfixe exclu des
 * parseurs globaux. Réponses uniformes et vides, jamais de détail.
 */
export const PUBLIC_SIGNATURE_PROVIDER_PREFIX = '/api/public/signature-provider';

const router = Router();

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  next();
}

const rawJsonParser = express.raw({ type: 'application/json', limit: '256kb' });

/** Corps brut : `413` au-delà de 256 Ko, `400` sinon, sans message du parseur. */
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

router.post(
  '/yousign',
  noStore,
  signatureProviderWebhookRateLimiter,
  readRawBody,
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody: unknown = req.body;
    const result = await handleSignatureProviderWebhook(
      'yousign',
      Buffer.isBuffer(rawBody) ? rawBody : Buffer.alloc(0),
      req.headers,
      req.ip
    );
    if (result.status === 200) {
      res.status(200).json({ received: true });
      return;
    }
    res.status(result.status).end();
  })
);

export default router;
