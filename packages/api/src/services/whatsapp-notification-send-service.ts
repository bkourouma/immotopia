/**
 * WhatsApp notification send service.
 * Checks tenant config, consent and recipient phone, then sends via provider.
 */
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logNotificationDelivery } from '../lib/notifications/log-delivery';
import { describeFailure } from '../lib/notifications/describe-error';
import { isReplayableVariables } from '../lib/notifications/replayable';
import { env } from '../config/env';
import { getWhatsappNotificationConfig } from './whatsapp-notification-config-service';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../constants/whatsapp-notification-default-templates';
import { WHATSAPP_NOTIFICATION_META, type WhatsappNotificationKey } from '../constants/whatsapp-notification-keys';
import type { NotifyRecipient } from '../lib/notifications/types';
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
 * Retire du gabarit la phrase qui porte une variable facultative VIDE (ex. un
 * lien qui n'a pas pu etre cree) : « … en ligne : {{meetingLink}} » ne doit pas
 * partir avec un deux-points orphelin. Une phrase s'arrete au point, au saut
 * de ligne ou a la fin du texte.
 */
export function omitSentencesWithEmptyVariables(tpl: string, vars: Record<string, string>, optional: string[]): string {
  let output = tpl;
  for (const key of optional) {
    if ((vars[key] ?? '').trim()) continue;
    output = output
      .replace(new RegExp(`[^.!?\\n]*\\{\\{${key}\\}\\}[^.!?\\n]*[.!?]?`, 'g'), '')
      .replace(/[ \t]+$/gm, '');
  }
  return output.trim();
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
  const configured = env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (configured === 'wasender' || (!configured && env.WASENDER_API_KEY?.trim())) {
    return 'Set WASENDER_API_KEY (and optional WASENDER_API_BASE_URL).';
  }
  if (configured === 'twilio' || !configured) {
    return 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM.';
  }
  return 'Set WHATSAPP_PROVIDER to "wasender" or "twilio" and configure matching env vars.';
}

/** Corps journalise : jamais le message rendu (il peut porter un lien d'acces ou un jeton). */
function whatsappJournalBody(key: WhatsappNotificationKey): string {
  return `Message WhatsApp envoyé : ${WHATSAPP_NOTIFICATION_META[key]?.label ?? key}.`;
}

/**
 * Les variables d'un message qui porte un lien, un jeton, un mot de passe ou un
 * code ne sont pas conservees en base : l'envoi est journalise mais non rejouable.
 * Le test porte sur le NOM (liste blanche du gabarit de la cle) et sur la VALEUR des variables (URL, jeton long) :
 * voir `lib/notifications/replayable.ts`.
 */
const isReplayable = isReplayableVariables;

export interface SendWhatsappOptions {
  tenantId: string;
  notificationKey: WhatsappNotificationKey;
  variables: Record<string, string>;
  /** E.164 number or any number to normalize (used when contactId is not provided). */
  to?: string;
  /** If provided, uses consentWhatsapp + whatsappNumber or phonePrimary from CRM contact. */
  contactId?: string;
  /** Variables facultatives : si l'une est vide, la phrase du gabarit qui la porte est retiree. */
  optionalVariables?: string[];
  /** Precisions pour le journal des notifications (titre, destinataire, entite liee, lien). */
  journal?: {
    title?: string;
    recipient?: NotifyRecipient;
    relatedEntity?: { type: string; id: string };
    link?: string;
    senderUserId?: string;
  };
  /** Interne : l'appelant (service central `notify`) journalise deja cet envoi. */
  skipJournal?: boolean;
}

/**
 * Sends a WhatsApp notification if config is enabled and a valid recipient exists.
 * Returns true if a message was sent, false otherwise.
 */
export async function sendWhatsappNotification(options: SendWhatsappOptions): Promise<boolean> {
  const { tenantId, notificationKey, variables, to: toOption, contactId, optionalVariables } = options;

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

  const target: string = to;

  // Echec releve pour le journal ; le retour booleen de la fonction ne change pas.
  let failure: { status: 'FAILED' | 'SKIPPED'; reason: string } | null = null;

  const attempt = async (): Promise<boolean> => {
    try {
      if (!configureWhatsAppProvider()) {
        logger.warn(`WhatsApp skipped: provider not configured. ${getProviderConfigHint()}`);
        failure = { status: 'SKIPPED', reason: 'Fournisseur WhatsApp non configure.' };
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
          to: target,
          templateSid: String(config.contentSid).trim(),
          contentVariables: Object.keys(contentVariables).length > 0 ? contentVariables : undefined
        });

        logger.info('WhatsApp template notification sent', {
          tenantId,
          notificationKey,
          provider,
          to: target.slice(-4),
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
      const effectiveTpl = optionalVariables?.length
        ? omitSentencesWithEmptyVariables(bodyTpl, variables, optionalVariables)
        : bodyTpl;
      const body = normalizeBodyForClickableLinks(applyTemplate(effectiveTpl, variables));
      if (!body.trim()) {
        logger.warn('WhatsApp body empty after template rendering', { tenantId, notificationKey, provider });
        failure = { status: 'SKIPPED', reason: 'Message WhatsApp vide apres rendu du gabarit.' };
        return false;
      }

      await sendText({ to: target, body });
      logger.info('WhatsApp notification sent', { tenantId, notificationKey, provider, to: target.slice(-4) });
      return true;
    } catch (err) {
      logger.error('WhatsApp send failed', {
        tenantId,
        notificationKey,
        error: err instanceof Error ? err.message : String(err)
      });
      failure = { status: 'FAILED', reason: describeFailure(err) };
      return false;
    }
  };

  if (options.skipJournal) return attempt();

  // Journal (menu lot 3) : une ligne par envoi reel. Les cas ecartes plus haut
  // (desactive, sans consentement, sans numero) n'ont rien tente : pas de ligne.
  let sent = false;
  const journal = options.journal;
  try {
    await logNotificationDelivery({
      tenantId,
      recipient: { ...(contactId ? { contactId } : {}), phone: target, ...journal?.recipient },
      key: notificationKey,
      title: journal?.title ?? WHATSAPP_NOTIFICATION_META[notificationKey]?.label ?? notificationKey,
      body: whatsappJournalBody(notificationKey),
      link: journal?.link,
      channel: 'WHATSAPP',
      target,
      senderUserId: journal?.senderUserId,
      relatedEntity: journal?.relatedEntity,
      ...(isReplayable(variables, notificationKey)
        ? { resendPayload: { whatsapp: { notificationKey, variables }, ...(contactId ? { contactId } : {}) } }
        : { replayable: false }),
      run: async () => {
        sent = await attempt();
        if (sent) return { status: 'SENT' };
        const f = failure as { status: 'FAILED' | 'SKIPPED'; reason: string } | null;
        return { status: f?.status ?? 'FAILED', failureReason: f?.reason ?? 'WhatsApp non envoye.' };
      }
    });
  } catch {
    // run() ne leve jamais : toute erreur ici vient du journal, sans effet sur l'envoi.
  }
  return sent;
}
