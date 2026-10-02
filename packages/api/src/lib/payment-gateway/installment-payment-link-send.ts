/**
 * Envoi au locataire du lien de paiement Mobile Money d'un loyer (lot C5,
 * spec 039). Même ordre que `sendOwnerMonthlyReport` :
 *
 *  1. l'échéance est lue pour CETTE agence (`id` ET `tenant_id`) : une échéance
 *     d'une autre agence lève la même `NotFoundError` qu'une échéance inexistante ;
 *  2. le destinataire est la fiche CRM du locataire principal du bail, rapprochée
 *     par l'e-mail de son compte (même logique que `resolveTenantPortalCrmContactId`) ;
 *     jamais un destinataire fourni par l'appelant ;
 *  3. le plan de canaux est établi AVANT toute création de lien : aucun lien
 *     orphelin quand aucun canal ne peut partir ;
 *  4. le lien est créé, envoyé sur UN canal ; s'il échoue partout il est révoqué.
 *
 * L'URL du lien (qui contient le jeton) ne vit que dans la variable `paymentUrl`
 * du message : jamais dans un sujet, un journal, un audit ni une réponse.
 */
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { logAuditEvent, flushAuditEvents } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { revokeSecureLink } from '../secure-links';
import {
  CHANNEL_RECIPIENT_SELECT,
  loadChannelConfigs,
  planChannels,
  sendOnPlannedChannels,
  type ChannelRecipient,
  type ChannelTargets,
  type NotificationChannel
} from '../patrimoine/notification-channels';
import { createInstallmentPaymentLink, INSTALLMENT_OBJECT_TYPE } from './installment-payment-link';

/** Clé d'événement du lien de paiement : la même dans les deux catalogues. */
const PAYMENT_LINK_TARGETS: ChannelTargets = {
  email: 'RENTER_PAYMENT_LINK_SENT',
  whatsapp: 'RENTER_PAYMENT_LINK_SENT'
};

export type InstallmentLinkSendResult = {
  sent: boolean;
  channel: NotificationChannel | null;
  reason?: 'NO_ELIGIBLE_CHANNEL' | 'EVENT_DISABLED' | 'SEND_FAILED' | 'RENTER_CONTACT_NOT_FOUND';
  linkId?: string;
  expiresAt?: string;
  amountDue?: number;
  currency?: string;
};

/** Fiche CRM du locataire principal du bail, rapprochée par l'e-mail du compte (select explicite). */
async function loadRenterContact(tenantId: string, renterClientId: string) {
  const client = await prisma.tenantClient.findFirst({
    where: { id: renterClientId, tenantId },
    select: { user: { select: { email: true } } }
  });
  const email = client?.user?.email?.trim();
  if (!email) return null;
  return prisma.crmContact.findFirst({
    where: { tenantId, email: { equals: email, mode: 'insensitive' } },
    select: { ...CHANNEL_RECIPIENT_SELECT, firstName: true, lastName: true },
    // Plusieurs fiches peuvent partager l'e-mail : choix déterministe, la plus ancienne (id en départage).
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
}

export async function sendInstallmentPaymentLink(
  tenantId: string,
  installmentId: string,
  actorUserId: string | null,
  opts?: { ttlDays?: number }
): Promise<InstallmentLinkSendResult> {
  const installment = await prisma.rentalInstallment.findFirst({
    where: { id: installmentId, tenant_id: tenantId },
    select: { id: true, lease: { select: { primary_renter_client_id: true } } }
  });
  if (!installment) throw new NotFoundError(t('Échéance introuvable.'));

  const contact = await loadRenterContact(tenantId, installment.lease.primary_renter_client_id);
  if (!contact) {
    logger.warn('sendInstallmentPaymentLink: fiche CRM du locataire introuvable', { tenantId, installmentId });
    return { sent: false, channel: null, reason: 'RENTER_CONTACT_NOT_FOUND' };
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

  // Un canal est éligible : le lien peut maintenant être créé (400 si l'échéance
  // n'est plus payable : l'erreur remonte telle quelle, aucun lien n'existe).
  const { link, context } = await createInstallmentPaymentLink(tenantId, installment.id, actorUserId, {
    ttlDays: opts?.ttlDays
  });

  const delivery = await sendOnPlannedChannels(plan, {
    tenantId,
    recipient,
    configs,
    targets: PAYMENT_LINK_TARGETS,
    variables: {
      renterName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Locataire',
      agencyName: context.agencyName,
      period: `${String(context.periodMonth).padStart(2, '0')}/${context.periodYear}`,
      amountDue: `${context.amountDue.toLocaleString('fr-FR')} ${context.currency}`,
      paymentUrl: link.url,
      expiresAt: link.expiresAt.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
    }
  });

  if (!delivery.sent) {
    try {
      await revokeSecureLink(tenantId, link.id, actorUserId ?? 'system', {
        objectType: INSTALLMENT_OBJECT_TYPE,
        objectId: installment.id
      });
    } catch (error) {
      logger.error('sendInstallmentPaymentLink: révocation du lien impossible après échec', {
        tenantId,
        installmentId,
        linkId: link.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return { sent: false, channel: null, reason: 'SEND_FAILED' };
  }

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.RENTAL_PAYMENT_LINK_SENT,
    entityType: INSTALLMENT_OBJECT_TYPE,
    entityId: installment.id,
    // Ni jeton ni URL : l'identifiant du lien suffit à retrouver sa trace.
    payload: { installmentId: installment.id, channel: delivery.channel, linkId: link.id }
  });
  await flushAuditEvents();

  logger.info('sendInstallmentPaymentLink completed', { tenantId, installmentId, channel: delivery.channel });
  return {
    sent: true,
    channel: delivery.channel,
    linkId: link.id,
    expiresAt: link.expiresAt.toISOString(),
    amountDue: context.amountDue,
    currency: context.currency
  };
}
