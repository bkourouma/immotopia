import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { emailService } from '../../../services/email-service';
import { configureWhatsAppProvider, sendText } from '../../../services/providers/whatsapp.provider';
import { normalizePhoneE164 } from '../../phone/e164';
import type { DeliveryResult, OutboundSignatureMessage, SignatureProvider } from '../types';

/**
 * Fournisseur `internal` (spec 044, SG-R13) : le noyau gère jeton, code et
 * scellement ; ce fournisseur ne fait que REMETTRE les messages, par e-mail
 * (`email-service`) ou WhatsApp (fournisseur WhatsApp du dépôt). Si un contact
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

export function createInternalProvider(): SignatureProvider {
  return {
    id: 'internal',
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
