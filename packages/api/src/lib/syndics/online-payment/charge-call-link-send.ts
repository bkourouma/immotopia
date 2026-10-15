/**
 * Envoi au copropriétaire du lien « Payer cet appel » (lot M6, spec 042,
 * contrat §1.10). Même ordre que `sendInstallmentPaymentLink` (spec 039) :
 *
 *  1. l'appel est lu pour CETTE copropriété et CETTE agence : un appel d'une
 *     autre agence lève la même `NotFoundError` qu'un appel inexistant, et un
 *     appel non payable (soldé, copropriété non configurée…) lève sa 400 ;
 *  2. le destinataire est le copropriétaire RÉEL du lot (`resolveChargeCallRecipient`
 *     puis contrôle « copropriétaire actuel »), jamais un destinataire fourni
 *     par l'appelant ;
 *  3. le plan de canaux est établi AVANT toute création de lien : aucun lien
 *     orphelin quand aucun canal ne peut partir ;
 *  4. le lien est créé, envoyé sur UN canal ; s'il échoue partout il est révoqué.
 *
 * L'URL du lien (qui contient le jeton) ne vit que dans la variable `paymentUrl`
 * du message : jamais dans un sujet, un journal, un audit ni une réponse.
 */
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { flushAuditEvents, logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { revokeSecureLink } from '../../secure-links';
import {
  CHANNEL_RECIPIENT_SELECT,
  loadChannelConfigs,
  planChannels,
  sendOnPlannedChannels,
  type ChannelRecipient,
  type ChannelTargets,
  type NotificationChannel
} from '../../patrimoine/notification-channels';
import {
  CHARGE_CALL_OBJECT_TYPE,
  createChargeCallPaymentLinkFor,
  isCurrentLotOwnerContact,
  requirePayableChargeCall
} from './charge-call-link';

/** Clé d'événement du lien de paiement : la même dans les deux catalogues. */
const PAYMENT_LINK_TARGETS: ChannelTargets = {
  email: 'CHARGE_CALL_PAYMENT_LINK_SENT',
  whatsapp: 'CHARGE_CALL_PAYMENT_LINK_SENT'
};

export type ChargeCallLinkSendResult = {
  sent: boolean;
  channel: NotificationChannel | null;
  reason?: 'NO_ELIGIBLE_CHANNEL' | 'EVENT_DISABLED' | 'SEND_FAILED' | 'RECIPIENT_NOT_FOUND';
  linkId?: string;
  expiresAt?: string;
  amountDue?: number;
  currency?: string;
};

const fr = (date: Date) => date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });

export async function sendChargeCallPaymentLink(
  tenantId: string,
  syndicateId: string,
  chargeCallId: string,
  actorUserId: string | null,
  opts?: { ttlDays?: number }
): Promise<ChargeCallLinkSendResult> {
  // 404 (autre copropriété ou agence), 400 (soldé, non configuré, lot revendu…) : avant tout destinataire.
  const context = await requirePayableChargeCall(tenantId, syndicateId, chargeCallId);

  const contactId = context.lotRecipientContactId;
  if (!contactId || !(await isCurrentLotOwnerContact(context.lotId, contactId))) {
    logger.warn('sendChargeCallPaymentLink: copropriétaire destinataire introuvable', { tenantId, chargeCallId });
    return { sent: false, channel: null, reason: 'RECIPIENT_NOT_FOUND' };
  }
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { ...CHANNEL_RECIPIENT_SELECT, firstName: true, lastName: true, legalName: true }
  });
  if (!contact) {
    logger.warn('sendChargeCallPaymentLink: fiche CRM du copropriétaire introuvable', { tenantId, chargeCallId });
    return { sent: false, channel: null, reason: 'RECIPIENT_NOT_FOUND' };
  }

  const recipient: ChannelRecipient = {
    contactId: contact.id,
    email: contact.email?.trim() || null,
    consentEmail: contact.consentEmail ?? null,
    whatsappNumber: contact.whatsappNumber ?? null,
    phonePrimary: contact.phonePrimary ?? null,
    consentWhatsapp: contact.consentWhatsapp ?? null,
    preferredContactChannel: contact.preferredContactChannel ?? null
  };
  const configs = await loadChannelConfigs(tenantId, PAYMENT_LINK_TARGETS);
  const plan = planChannels(recipient, configs, PAYMENT_LINK_TARGETS);
  if (plan.channels.length === 0) {
    return { sent: false, channel: null, reason: plan.reason };
  }

  // Un canal est éligible : le lien peut maintenant être créé (400 si `ttlDays` hors bornes).
  const link = await createChargeCallPaymentLinkFor(tenantId, context, actorUserId, { ttlDays: opts?.ttlDays });

  const delivery = await sendOnPlannedChannels(plan, {
    tenantId,
    recipient,
    configs,
    targets: PAYMENT_LINK_TARGETS,
    variables: {
      ownerName:
        [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.legalName || 'Copropriétaire',
      syndicateName: context.syndicateName,
      lotLabel: context.lotLabel,
      period: context.period,
      amountDue: `${context.amountDue.toLocaleString('fr-FR')} ${context.currency}`,
      currency: context.currency,
      dueDate: fr(context.dueDate),
      paymentUrl: link.url,
      expiresAt: fr(link.expiresAt)
    }
  });

  if (!delivery.sent) {
    try {
      await revokeSecureLink(tenantId, link.id, actorUserId ?? 'system', {
        objectType: CHARGE_CALL_OBJECT_TYPE,
        objectId: context.chargeCallId
      });
    } catch (error) {
      logger.error('sendChargeCallPaymentLink: révocation du lien impossible après échec', {
        tenantId,
        chargeCallId,
        linkId: link.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return { sent: false, channel: null, reason: 'SEND_FAILED' };
  }

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_CHARGE_PAYMENT_LINK_SENT,
    entityType: CHARGE_CALL_OBJECT_TYPE,
    entityId: context.chargeCallId,
    // Ni jeton ni URL : l'identifiant du lien suffit à retrouver sa trace.
    payload: { chargeCallId: context.chargeCallId, syndicateId, channel: delivery.channel, linkId: link.id }
  });
  await flushAuditEvents();

  logger.info('sendChargeCallPaymentLink completed', { tenantId, chargeCallId, channel: delivery.channel });
  return {
    sent: true,
    channel: delivery.channel,
    linkId: link.id,
    expiresAt: link.expiresAt.toISOString(),
    amountDue: context.amountDue,
    currency: context.currency
  };
}
