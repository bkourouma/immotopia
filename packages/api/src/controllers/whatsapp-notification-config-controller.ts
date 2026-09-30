import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';
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
import { filterNotificationItems } from '../lib/subscription/notification-feature-gate';
import { sendGroupInviteToEligibleContacts } from '../services/whatsapp-group-automation-service';
import { sendManualGroupBroadcast } from '../services/whatsapp-group-broadcast-service';

/**
 * Chaque handler passe par `asyncHandler` : une erreur inattendue part vers
 * `errorHandler` (message masqué hors développement), jamais `error.message`
 * brut dans la réponse. Les erreurs d'entrée sont typées (400) ; le détail du
 * fournisseur WhatsApp reste dans les journaux.
 */
const updateConfigSchema = z.object({
  enabled: z.boolean({ invalid_type_error: t('Valeur invalide.') }).optional(),
  bodyOverride: z.string().max(4000, t('Message trop long (max 4000 caracteres)')).nullable().optional(),
  contentSid: z.string().max(200, t('Valeur invalide.')).nullable().optional(),
  contentVariablesJson: z.string().max(10000, t('Valeur invalide.')).nullable().optional()
});

function requireTenantParam(req: Request): string {
  const tenantId = req.params.tenantId;
  if (!tenantId) throw new BadRequestError(t('tenantId requis'));
  return tenantId;
}

function requireNotificationKey(req: Request): WhatsappNotificationKey {
  const key = req.params.key as WhatsappNotificationKey;
  if (!key) throw new BadRequestError(t('tenantId et key requis'));
  if (!WHATSAPP_NOTIFICATION_KEYS.includes(key)) throw new BadRequestError(t('Cle de notification invalide'));
  return key;
}

/**
 * GET /tenants/:tenantId/whatsapp-notifications
 * List all WhatsApp notification types with current config.
 */
export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantParam(req);
  const items = await filterNotificationItems(tenantId, await listWhatsappNotificationConfigs(tenantId));
  res.json({ success: true, data: items });
});

/**
 * PATCH /tenants/:tenantId/whatsapp-notifications/:key
 * Update config for one notification (enabled, bodyOverride).
 */
export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantParam(req);
  const key = requireNotificationKey(req);
  const body = updateConfigSchema.parse(req.body ?? {});
  const updated = await updateWhatsappNotificationConfig(tenantId, key, body);
  res.json({ success: true, data: updated });
});

/**
 * POST /tenants/:tenantId/whatsapp-notifications/:key/reset
 * Reset one notification to default (remove overrides).
 */
export const resetHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantParam(req);
  const key = requireNotificationKey(req);
  await resetWhatsappNotificationConfig(tenantId, key);
  res.json({ success: true, message: t('Configuration reinitialisee') });
});

/**
 * POST /tenants/:tenantId/whatsapp-notifications/group-invite/send-all
 * Send WhatsApp group invite to eligible CRM contacts (consent + phone).
 */
export const sendGroupInviteToAllHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantParam(req);
  const limitRaw = Number(req.body?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 300;
  const force = parseBoolean(req.body?.force, false);
  const result = await sendGroupInviteToEligibleContacts(tenantId, limit, { force });
  res.json({
    success: true,
    message: t('Envoi des invitations WhatsApp termine'),
    data: result
  });
});

/**
 * POST /tenants/:tenantId/whatsapp-notifications/group-broadcast/send
 * Send a spontaneous WhatsApp message (text + optional image) to configured group destination.
 */
export const sendGroupBroadcastHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantParam(req);
  const messageText = String(req.body?.message ?? '');
  const imageFile = req.file;

  let result: Awaited<ReturnType<typeof sendManualGroupBroadcast>>;
  try {
    result = await sendManualGroupBroadcast({ tenantId, message: messageText, imageFile: imageFile ?? undefined });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('WhatsApp group broadcast failed', { error: err.message });
    if (/provider http/i.test(err.message)) {
      throw new BadRequestError(t("Le fournisseur WhatsApp a refusé l'envoi."));
    }
    // Messages de validation du service : courts, en français, sans interne.
    if (isGroupBroadcastClientError(err.message) && !/[\n\\]/.test(err.message)) {
      throw new BadRequestError(t(err.message));
    }
    throw error;
  }

  res.json({
    success: true,
    message: t('Message groupe WhatsApp envoye'),
    data: {
      provider: result.provider,
      target: result.target,
      messageId: result.messageId ?? null,
      mediaUrl: result.mediaUrl ?? null,
      usedFallbackTextOnly: Boolean(result.usedFallbackTextOnly)
    }
  });
});

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

function isGroupBroadcastClientError(message: string): boolean {
  const value = message.toLowerCase();
  return (
    value.includes('requis') || value.includes('invalide') || value.includes('max') || value.includes('non configure')
  );
}

/**
 * POST /tenants/:tenantId/whatsapp-notifications/test-send
 * Send a raw WhatsApp test message to a number.
 */
export const testSendHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantParam(req);
  const toRaw = String(req.body?.to ?? '').trim();
  const messageRaw = String(req.body?.message ?? '').trim();

  if (!toRaw) throw new BadRequestError(t('Numero requis'));
  if (!messageRaw) throw new BadRequestError(t('Message requis'));
  if (messageRaw.length > 1500) throw new BadRequestError(t('Message trop long (max 1500 caracteres)'));
  if (!configureWhatsAppProvider()) {
    throw new BadRequestError(t("Le fournisseur WhatsApp n'est pas configuré."));
  }

  const to = normalizePhone(toRaw, getDefaultCountryCode());
  const provider = getConfiguredWhatsAppProvider();
  let result: Awaited<ReturnType<typeof sendText>>;
  try {
    result = await sendText({ to, body: messageRaw });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('WhatsApp test send failed', { error: err.message });
    // Le détail du fournisseur reste dans les journaux, jamais dans la réponse.
    if (err.message.startsWith('Provider HTTP ') || err.message.includes('not configured')) {
      throw new BadRequestError(t("Le fournisseur WhatsApp a refusé l'envoi."));
    }
    throw error;
  }

  logger.info('WhatsApp test message sent', {
    tenantId,
    provider,
    to: to.slice(-4),
    messageId: result.messageId
  });

  res.json({
    success: true,
    message: provider ? t('Message WhatsApp envoye via {{provider}}', { provider }) : t('Message WhatsApp envoye'),
    data: { to, messageId: result.messageId ?? null, provider: provider ?? null }
  });
});
