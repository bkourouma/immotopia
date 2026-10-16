import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { emailService } from '../../../services/email-service';
import { configureWhatsAppProvider, sendText } from '../../../services/providers/whatsapp.provider';
import { normalizePhoneE164 } from '../../phone/e164';
import { getSmsTransport } from '../../sms';
import { contactOwnsPhone, hasSmsBudget, isAllowedSmsDialCode } from '../sms-guard';
import type { DeliveryResult, OutboundSignatureMessage, SignatureProvider } from '../types';

/**
 * Fournisseur `internal` (spec 044, SG-R13) : le noyau gère jeton, code et
 * scellement ; ce fournisseur ne fait que REMETTRE les messages, par e-mail
 * (`email-service`), WhatsApp (fournisseur WhatsApp du dépôt) ou SMS. Si un contact
 * CRM est désigné, son consentement WhatsApp est exigé. Aucune erreur de
 * l'envoi n'est journalisée avec son contenu (le message porte lien ou code).
 */

async function hasWhatsappConsent(tenantId: string, contactId: string): Promise<boolean> {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { consentWhatsapp: true }
  });
  return Boolean(contact?.consentWhatsapp);
}

async function deliverEmail(message: OutboundSignatureMessage): Promise<DeliveryResult> {
  await emailService.sendEmail({
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    tenantId: message.tenantId
  });
  return { ok: true };
}

async function deliverWhatsapp(message: OutboundSignatureMessage): Promise<DeliveryResult> {
  if (message.contactId && !(await hasWhatsappConsent(message.tenantId, message.contactId))) {
    return { ok: false, reason: 'NO_CONSENT' };
  }
  const to = normalizePhoneE164(message.to);
  if (!to) return { ok: false, reason: 'SEND_FAILED' };
  if (!configureWhatsAppProvider()) {
    logger.warn('Signature : fournisseur WhatsApp non configuré');
    return { ok: false, reason: 'SEND_FAILED' };
  }
  await sendText({ to, body: message.text });
  return { ok: true };
}

/**
 * SMS : exige un contact CRM DE L'AGENCE (pas de champ de consentement SMS au CRM),
 * puis passe par le transport SMS du dépôt. Un SMS = un envoi, comme les autres
 * canaux : le quota compte les demandes de signature, pas les messages.
 */
async function deliverSms(message: OutboundSignatureMessage): Promise<DeliveryResult> {
  if (!message.contactId) return { ok: false, reason: 'NO_CONSENT' };
  const to = normalizePhoneE164(message.to);
  if (!to || !isAllowedSmsDialCode(to)) return { ok: false, reason: 'SEND_FAILED' };
  // Le numéro doit être celui du contact CRM désigné (de l'agence) : jamais un numéro libre.
  if (!(await contactOwnsPhone(message.tenantId, message.contactId, to))) return { ok: false, reason: 'NO_CONSENT' };
  if (!(await hasSmsBudget(message.tenantId))) return { ok: false, reason: 'RATE_LIMITED' };
  const result = await getSmsTransport().send({ to, text: message.text });
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.reason === 'DISABLED' ? 'DISABLED' : 'SEND_FAILED' };
}

export function createInternalProvider(): SignatureProvider {
  return {
    id: 'internal',
    qualified: false,
    async createRequest(input) {
      return { providerRef: `internal-${input.requestId}` };
    },
    async cancel() {
      // Le jeton cesse d'agir dès que la demande n'est plus ouverte : rien à révoquer ailleurs.
    },
    async deliver(message) {
      try {
        if (message.channel === 'EMAIL') return await deliverEmail(message);
        if (message.channel === 'WHATSAPP') return await deliverWhatsapp(message);
        if (message.channel === 'SMS') return await deliverSms(message);
        return { ok: false, reason: 'UNSUPPORTED' };
      } catch (error) {
        logger.error('Signature : envoi en échec', {
          tenantId: message.tenantId,
          channel: message.channel,
          error: error instanceof Error ? error.name : 'inconnue'
        });
        return { ok: false, reason: 'SEND_FAILED' };
      }
    }
  };
}
