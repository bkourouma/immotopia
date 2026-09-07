import express, { NextFunction, Request, Response, Router } from 'express';
import { handleWebhook } from '../services/providers/whatsapp.provider';
import { logger } from '../utils/logger';

const router: Router = Router();

// Twilio sends x-www-form-urlencoded by default.
router.use(
  express.urlencoded({
    extended: true,
    limit: '1mb'
  })
);

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
