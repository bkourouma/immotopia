import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  listWhatsappNotificationConfigs,
  updateWhatsappNotificationConfig,
  resetWhatsappNotificationConfig
} from '../services/whatsapp-notification-config-service';
import {
  configureWhatsAppProvider,
  getConfiguredWhatsAppProvider,
  sendText
} from '../services/providers/whatsapp.provider';
import { WHATSAPP_NOTIFICATION_KEYS, type WhatsappNotificationKey } from '../constants/whatsapp-notification-keys';
import { sendGroupInviteToEligibleContacts } from '../services/whatsapp-group-automation-service';
import { sendManualGroupBroadcast } from '../services/whatsapp-group-broadcast-service';
import { AppError } from '../middleware/error-middleware';

/**
 * Message montré à l'utilisateur quand aucun fournisseur WhatsApp n'est actif.
 * Il ne cite ni variable d'environnement ni fournisseur : la consigne
 * technique (`getProviderSetupHint`) va dans les journaux.
 */
const WHATSAPP_NOT_CONFIGURED_MESSAGE =
  "L'envoi WhatsApp n'est pas configuré pour cette agence. Contactez l'administrateur de la plateforme pour l'activer.";

/**
 * GET /tenants/:tenantId/whatsapp-notifications
 * List all WhatsApp notification types with current config.
 */
export async function listHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'tenantId requis' });
      return;
    }
    const items = await listWhatsappNotificationConfigs(tenantId);
    res.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la recuperation des configurations';
    logger.error('List WhatsApp notification configs', { error: message });
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'development' ? message : 'Erreur lors de la recuperation des configurations'
    });
  }
}

/**
 * PATCH /tenants/:tenantId/whatsapp-notifications/:key
 * Update config for one notification (enabled, bodyOverride).
 */
export async function updateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    const key = req.params.key as WhatsappNotificationKey;
    if (!tenantId || !key) {
      res.status(400).json({ success: false, message: 'tenantId et key requis' });
      return;
    }
    if (!WHATSAPP_NOTIFICATION_KEYS.includes(key)) {
      res.status(400).json({ success: false, message: 'Cle de notification invalide' });
      return;
    }
    const body = req.body || {};
    const updated = await updateWhatsappNotificationConfig(tenantId, key, {
      enabled: body.enabled,
      bodyOverride: body.bodyOverride !== undefined ? body.bodyOverride : undefined,
      contentSid: body.contentSid !== undefined ? body.contentSid : undefined,
      contentVariablesJson: body.contentVariablesJson !== undefined ? body.contentVariablesJson : undefined
    });
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Update WhatsApp notification config', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la mise a jour'
    });
  }
}

/**
 * POST /tenants/:tenantId/whatsapp-notifications/:key/reset
 * Reset one notification to default (remove overrides).
 */
export async function resetHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    const key = req.params.key as WhatsappNotificationKey;
    if (!tenantId || !key) {
      res.status(400).json({ success: false, message: 'tenantId et key requis' });
      return;
    }
    if (!WHATSAPP_NOTIFICATION_KEYS.includes(key)) {
      res.status(400).json({ success: false, message: 'Cle de notification invalide' });
      return;
    }
    await resetWhatsappNotificationConfig(tenantId, key);
    res.json({ success: true, message: 'Configuration reinitialisee' });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Reset WhatsApp notification config', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la reinitialisation'
    });
  }
}

/**
 * POST /tenants/:tenantId/whatsapp-notifications/group-invite/send-all
 * Send WhatsApp group invite to eligible CRM contacts (consent + phone).
 */
export async function sendGroupInviteToAllHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'tenantId requis' });
      return;
    }
    if (!configureWhatsAppProvider()) {
      // Sans fournisseur, la boucle d'envoi compterait un échec par contact.
      logger.warn('WhatsApp group invite bulk send refused: provider not configured', {
        hint: getProviderSetupHint()
      });
      res
        .status(400)
        .json({ success: false, code: 'WHATSAPP_NOT_CONFIGURED', message: WHATSAPP_NOT_CONFIGURED_MESSAGE });
      return;
    }
    const limitRaw = Number(req.body?.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 300;
    const force = parseBoolean(req.body?.force, false);
    const result = await sendGroupInviteToEligibleContacts(tenantId, limit, { force });
    res.json({
      success: true,
      message: 'Envoi des invitations WhatsApp terminé.',
      data: result
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Group invite bulk send failed', { error: err.message });
    res.status(500).json({
      success: false,
      message: err.message || "Erreur lors de l'envoi en masse."
    });
  }
}

/**
 * POST /tenants/:tenantId/whatsapp-notifications/group-broadcast/send
 * Send a spontaneous WhatsApp message (text + optional image) to configured group destination.
 */
export async function sendGroupBroadcastHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    const messageText = String(req.body?.message ?? '');
    const imageFile = req.file;

    if (!tenantId) {
      res.status(400).json({ success: false, message: 'tenantId requis' });
      return;
    }

    const result = await sendManualGroupBroadcast({
      tenantId,
      message: messageText,
      imageFile: imageFile ?? undefined
    });

    res.json({
      success: true,
      message: 'Message groupe WhatsApp envoyé.',
      data: {
        provider: result.provider,
        target: result.target,
        messageId: result.messageId ?? null,
        mediaUrl: result.mediaUrl ?? null,
        usedFallbackTextOnly: Boolean(result.usedFallbackTextOnly)
      }
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const status = err instanceof AppError ? err.statusCode : err.message.startsWith('Provider HTTP ') ? 400 : 500;

    logger.error('WhatsApp group broadcast failed', {
      error: err.message
    });
    res.status(status).json({
      success: false,
      message: err.message || "Erreur lors de l'envoi du message groupe."
    });
  }
}

function normalizePhone(phone: string, defaultCountryCode = '33'): string {
  const cleaned = String(phone).trim().replace(/\s/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (/^0\d{8,9}$/.test(cleaned)) return `+${defaultCountryCode}${cleaned.slice(1)}`;
  if (/^\d{9,15}$/.test(cleaned)) return `+${defaultCountryCode}${cleaned}`;
  return `+${cleaned}`;
}

function getDefaultCountryCode(): string {
  const value = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim();
  return value && /^\d{1,4}$/.test(value) ? value : '33';
}

function getProviderSetupHint(): string {
  const configured = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (configured === 'wasender' || (!configured && process.env.WASENDER_API_KEY?.trim())) {
    return 'WASENDER_API_KEY requis (WASENDER_API_BASE_URL optionnel).';
  }
  if (configured === 'twilio' || !configured) {
    return 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_WHATSAPP_FROM requis.';
  }
  return 'Definir WHATSAPP_PROVIDER sur wasender ou twilio.';
}

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  if (typeof value === 'number') return value === 1;
  return defaultValue;
}

/**
 * POST /tenants/:tenantId/whatsapp-notifications/test-send
 * Send a raw WhatsApp test message to a number.
 */
export async function testSendHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId;
    const toRaw = String(req.body?.to ?? '').trim();
    const messageRaw = String(req.body?.message ?? '').trim();

    if (!tenantId) {
      res.status(400).json({ success: false, message: 'tenantId requis' });
      return;
    }
    if (!toRaw) {
      res.status(400).json({ success: false, message: 'Numéro requis.' });
      return;
    }
    if (!messageRaw) {
      res.status(400).json({ success: false, message: 'Message requis.' });
      return;
    }
    if (messageRaw.length > 1500) {
      res.status(400).json({ success: false, message: 'Message trop long (1 500 caractères au maximum).' });
      return;
    }

    if (!configureWhatsAppProvider()) {
      logger.warn('WhatsApp test send refused: provider not configured', { hint: getProviderSetupHint() });
      res
        .status(400)
        .json({ success: false, code: 'WHATSAPP_NOT_CONFIGURED', message: WHATSAPP_NOT_CONFIGURED_MESSAGE });
      return;
    }

    const to = normalizePhone(toRaw, getDefaultCountryCode());
    const provider = getConfiguredWhatsAppProvider();
    const result = await sendText({ to, body: messageRaw });

    logger.info('WhatsApp test message sent', {
      tenantId,
      provider,
      to: to.slice(-4),
      messageId: result.messageId
    });

    res.json({
      success: true,
      message: `Message WhatsApp envoyé${provider ? ` via ${provider}` : ''}.`,
      data: { to, messageId: result.messageId ?? null, provider: provider ?? null }
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const status = err.message.startsWith('Provider HTTP ') ? 400 : 500;

    logger.error('WhatsApp test send failed', { error: err.message });
    res.status(status).json({
      success: false,
      message: err.message || "Erreur lors de l'envoi WhatsApp."
    });
  }
}
