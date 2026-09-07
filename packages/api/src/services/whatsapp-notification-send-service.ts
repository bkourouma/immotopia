/**
 * WhatsApp notification send service.
 * Checks tenant config, consent and recipient phone, then sends via provider.
 */
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { getWhatsappNotificationConfig } from './whatsapp-notification-config-service';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../constants/whatsapp-notification-default-templates';
import type { WhatsappNotificationKey } from '../constants/whatsapp-notification-keys';
import {
  configureWhatsAppProvider,
  getConfiguredWhatsAppProvider,
  sendText,
  sendTemplate,
  supportsTemplateMessages
} from './providers/whatsapp.provider';

/** Replace {{key}} with vars[key] in template. */
function applyTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

/**
 * Normalize body text so WhatsApp clients can auto-detect clickable links.
 * - Convert markdown links [text](url) to "text: url"
 * - Remove backticks/angle-brackets around urls
 * - Trim trailing punctuation that often breaks auto-linking
 */
function normalizeBodyForClickableLinks(body: string): string {
  if (!body) return body;

  let output = body;

  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1: $2');
  output = output.replace(/`(https?:\/\/[^`\s]+)`/gi, '$1');
  output = output.replace(/<(https?:\/\/[^>\s]+)>/gi, '$1');

  output = output.replace(/https?:\/\/\S+/gi, match => match.replace(/[`,.;!?]+$/g, ''));

  return output;
}

/**
 * Normalize a phone number to E.164.
 */
function normalizePhone(phone: string, defaultCountryCode = '33'): string {
  const cleaned = String(phone).trim().replace(/\s/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.match(/^0\d{8,9}$/)) return '+' + defaultCountryCode + cleaned.slice(1);
  if (cleaned.match(/^\d{9,15}$/)) return '+' + defaultCountryCode + cleaned;
  return '+' + cleaned;
}

function getDefaultCountryCode(): string {
  const value = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE?.trim();
  return value && /^\d{1,4}$/.test(value) ? value : '33';
}

function getProviderConfigHint(): string {
  const configured = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (configured === 'wasender' || (!configured && process.env.WASENDER_API_KEY?.trim())) {
    return 'Set WASENDER_API_KEY (and optional WASENDER_API_BASE_URL).';
  }
  if (configured === 'twilio' || !configured) {
    return 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM.';
  }
  return 'Set WHATSAPP_PROVIDER to "wasender" or "twilio" and configure matching env vars.';
}

export interface SendWhatsappOptions {
  tenantId: string;
  notificationKey: WhatsappNotificationKey;
  variables: Record<string, string>;
  /** E.164 number or any number to normalize (used when contactId is not provided). */
  to?: string;
  /** If provided, uses consentWhatsapp + whatsappNumber or phonePrimary from CRM contact. */
  contactId?: string;
}

/**
 * Sends a WhatsApp notification if config is enabled and a valid recipient exists.
 * Returns true if a message was sent, false otherwise.
 */
export async function sendWhatsappNotification(options: SendWhatsappOptions): Promise<boolean> {
  const { tenantId, notificationKey, variables, to: toOption, contactId } = options;

  const config = await getWhatsappNotificationConfig(tenantId, notificationKey);
  if (!config.enabled) {
    logger.info('WhatsApp notification disabled for this event', { tenantId, notificationKey });
    return false;
  }

  let to: string | null = null;
  if (toOption) {
    to = normalizePhone(toOption, getDefaultCountryCode());
  } else if (contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId },
      select: { consentWhatsapp: true, whatsappNumber: true, phonePrimary: true }
    });
    if (!contact?.consentWhatsapp) {
      logger.info('WhatsApp skipped: contact has no consentWhatsapp', { contactId, notificationKey });
      return false;
    }
    const raw = contact.whatsappNumber || contact.phonePrimary;
    if (!raw || !raw.trim()) {
      logger.info('WhatsApp skipped: contact has no whatsappNumber nor phonePrimary', { contactId, notificationKey });
      return false;
    }
    to = normalizePhone(raw, getDefaultCountryCode());
  }

  if (!to) {
    logger.info('WhatsApp skipped: no recipient (no contactId/to or contact without phone)', {
      tenantId,
      notificationKey
    });
    return false;
  }

  try {
    if (!configureWhatsAppProvider()) {
      logger.warn(`WhatsApp skipped: provider not configured. ${getProviderConfigHint()}`);
      return false;
    }

    const provider = getConfiguredWhatsAppProvider();

    // If template is configured and provider supports it, use provider template send.
    const hasTemplateSid = Boolean(config.contentSid?.trim());
    const templateSupported = supportsTemplateMessages();

    if (hasTemplateSid && templateSupported) {
      const contentVariables: Record<string, string> = {};
      if (config.contentVariablesJson?.trim()) {
        try {
          const mapping = JSON.parse(config.contentVariablesJson) as Record<string, string>;
          for (const [placeholder, ourKey] of Object.entries(mapping)) {
            contentVariables[placeholder] = String(variables[ourKey] ?? '');
          }
        } catch (e) {
          logger.warn('Invalid contentVariablesJson, using empty mapping', {
            tenantId,
            notificationKey,
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }

      await sendTemplate({
        to,
        templateSid: String(config.contentSid).trim(),
        contentVariables: Object.keys(contentVariables).length > 0 ? contentVariables : undefined
      });

      logger.info('WhatsApp template notification sent', {
        tenantId,
        notificationKey,
        provider,
        to: to.slice(-4),
        contentSid: config.contentSid
      });
      return true;
    }

    if (hasTemplateSid && !templateSupported) {
      logger.warn(
        'Template SID is configured but current provider does not support templates; falling back to text body',
        {
          tenantId,
          notificationKey,
          provider
        }
      );
    }

    const defaultBody = WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES[notificationKey];
    const bodyTpl = config.bodyOverride ?? defaultBody ?? '';
    const body = normalizeBodyForClickableLinks(applyTemplate(bodyTpl, variables));
    if (!body.trim()) {
      logger.warn('WhatsApp body empty after template rendering', { tenantId, notificationKey, provider });
      return false;
    }

    await sendText({ to, body });
    logger.info('WhatsApp notification sent', { tenantId, notificationKey, provider, to: to.slice(-4) });
    return true;
  } catch (err) {
    logger.error('WhatsApp send failed', {
      tenantId,
      notificationKey,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}
