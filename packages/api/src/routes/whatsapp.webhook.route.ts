import express, { NextFunction, Request, Response, Router } from 'express';
import twilio from 'twilio';
import { handleWebhook } from '../services/providers/whatsapp.provider';
import { logger } from '../utils/logger';
import { env, isProduction } from '../config/env';
import { webhookRateLimiter } from '../middleware/rate-limit-middleware';

const router: Router = Router();

// Twilio sends x-www-form-urlencoded by default.
router.use(
  express.urlencoded({
    extended: true,
    limit: '1mb'
  })
);

/**
 * Verify the X-Twilio-Signature header on inbound Twilio payloads.
 *
 * The endpoint is public by necessity, so without this anyone can post
 * arbitrary messages into the WhatsApp pipeline. Non-Twilio providers
 * (WaSender) do not sign requests and are identified by the absence of the
 * Twilio-specific fields; in production we refuse unsigned Twilio-shaped
 * payloads rather than trusting them.
 */
function verifyTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const looksLikeTwilio = typeof body.From === 'string' || typeof body.MessageSid === 'string';

  if (!looksLikeTwilio) {
    next();
    return;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.get('X-Twilio-Signature');

  if (!authToken) {
    // Twilio is not configured: a Twilio-shaped payload cannot be genuine.
    logger.warn('Twilio-shaped webhook received but TWILIO_AUTH_TOKEN is not set');
    res.status(403).type('text/plain; charset=utf-8').send('Forbidden');
    return;
  }

  // Twilio signs the exact URL it was configured with.
  const url = `${env.BACKEND_URL.replace(/\/$/, '')}${req.originalUrl}`;
  const isValid = Boolean(signature) && twilio.validateRequest(authToken, signature as string, url, body as never);

  if (!isValid) {
    logger.warn('Invalid Twilio webhook signature', { url, hasSignature: Boolean(signature) });
    if (isProduction) {
      res.status(403).type('text/plain; charset=utf-8').send('Forbidden');
      return;
    }
    // Outside production, log loudly but let local tunnels (ngrok URLs that do
    // not match BACKEND_URL) keep working.
    logger.warn('Signature check bypassed (NODE_ENV != production)');
  }

  next();
}

interface WhatsAppWebhookBody {
  From?: string;
  Body?: string;
  MessageSid?: string;
  from?: string;
  body?: string;
  messageId?: string;
  [key: string]: unknown;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildTwiMLMessage(message: string): string {
  const escaped = escapeXml(message);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`;
}

router.post(
  '/whatsapp/webhook',
  webhookRateLimiter,
  verifyTwilioSignature,
  async (req: Request<unknown, unknown, WhatsAppWebhookBody>, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const payload = req.body ?? {};
      handleWebhook(payload);

      const isTwilioPayload = typeof payload.From === 'string' || typeof payload.MessageSid === 'string';
      if (isTwilioPayload) {
        logger.info('Twilio WhatsApp webhook received', {
          from: payload.From ?? '(missing)',
          bodyPreview: String(payload.Body ?? '').slice(0, 120),
          messageSid: payload.MessageSid ?? '(missing)'
        });

        const confirmationMessage = 'Merci pour votre message ! Un conseiller ImmoTopia vous repondra bientot.';
        res.status(200).type('text/xml; charset=utf-8').send(buildTwiMLMessage(confirmationMessage));
        return;
      }

      logger.info('WhatsApp webhook received (non-Twilio payload)', {
        keys: Object.keys(payload)
      });
      res.status(200).json({ success: true, processed: true });
    } catch (error: unknown) {
      logger.error('WhatsApp webhook error', {
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).type('text/plain; charset=utf-8').send('Internal Server Error');
    }
  }
);

export default router;
