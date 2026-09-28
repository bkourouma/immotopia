import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { EmailNotificationKey } from '../../constants/email-notification-keys';
import type { WhatsappNotificationKey } from '../../constants/whatsapp-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';
import { paidFromAllocations } from './charge-allocation';
import { computeOutstanding } from './finance-utils';
// Même substitution que les reçus S3 : les valeurs injectées dans le HTML
// (noms, libellés saisis librement) y sont échappées.
import { applyReceiptTemplate } from './charge-receipt-delivery';

/** Sujet (texte brut) ou corps HTML d'un e-mail : valeurs échappées dans le HTML. */
function applyTemplate(template: string, vars: Record<string, string>, html = false): string {
  return applyReceiptTemplate(template, vars, html);
}

/**
 * Lot S4 : le propriétaire lié au lot (`lot.owner`) est-il toujours un
 * copropriétaire actuel ? Quand le lot a des fiches de copropriétaire
 * actives et non closes, il doit en faire partie ; un lot sans aucune fiche
 * (données anciennes) garde le comportement historique.
 */
async function isCurrentLotOwner(lotId: string, ownerId: string, now: Date = new Date()): Promise<boolean> {
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { lotId, isActive: true },
    select: { contactId: true, ownedUntil: true }
  });
  const current = profiles.filter(profile => !profile.ownedUntil || profile.ownedUntil.getTime() >= now.getTime());
  return current.length === 0 || current.some(profile => profile.contactId === ownerId);
}

function getOwnerWhatsappTarget(owner: {
  whatsappNumber?: string | null;
  phonePrimary?: string | null;
}): string | undefined {
  const raw = owner.whatsappNumber?.trim() || owner.phonePrimary?.trim();
  return raw || undefined;
}

function getLotDisplayLabel(
  lot?: {
    lotNumber?: string | null;
    property?: {
      title?: string | null;
      internalReference?: string | null;
      address?: string | null;
    } | null;
  } | null
): string {
  if (!lot) return '';
  const propertyTitle = lot.property?.title?.trim();
  const propertyReference = lot.property?.internalReference?.trim();
  const propertyAddress = lot.property?.address?.trim();
  return propertyTitle || propertyReference || propertyAddress || lot.lotNumber || '';
}

/** Pièce jointe d'un e-mail de notification. */
export interface NotificationAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface NotifyChargeCallOptions {
  /**
   * Lot S4 : pièces jointes de l'e-mail (avis d'appel PDF), construites
   * seulement quand un e-mail part vraiment. Une erreur de construction
   * n'empêche pas l'envoi : l'e-mail part sans pièce jointe.
   */
  buildAttachments?: () => Promise<NotificationAttachment[]>;
}

async function resolveAttachments(chargeCallId: string, options: NotifyChargeCallOptions) {
  if (!options.buildAttachments) return [];
  try {
    return await options.buildAttachments();
  } catch (error) {
    logger.warn('notifyChargeCall: attachment could not be built', { chargeCallId, error: String(error) });
    return [];
  }
}

export async function notifyChargeCall(chargeCallId: string, options: NotifyChargeCallOptions = {}) {
  const eventKeyEmail: EmailNotificationKey = 'CHARGE_CALL_ISSUED';
  const eventKeyWhatsApp: WhatsappNotificationKey = 'CHARGE_CALL_ISSUED';

  const chargeCall = await prisma.chargeCall.findUnique({
    where: { id: chargeCallId },
    include: {
      lot: {
        include: {
          owner: true,
          property: {
            select: {
              title: true,
              internalReference: true,
              address: true
            }
          }
        }
      },
      allocations: { select: { amount: true } },
      syndicate: true
    }
  });

  if (!chargeCall) {
    logger.warn('notifyChargeCall: charge call not found', { chargeCallId });
    return { emailSent: false, whatsappSent: false, skipped: 'CHARGE_CALL_NOT_FOUND' as const };
  }

  // Lot S2 : un appel entierement couvert (par un paiement ou par l'avance du
  // lot, imputee a la creation) n'est pas notifie comme « a payer ».
  if (computeOutstanding(Number(chargeCall.amount), paidFromAllocations(chargeCall.allocations)) <= 0) {
    logger.info('notifyChargeCall: charge call already covered, skipping notifications', { chargeCallId });
    return { emailSent: false, whatsappSent: false, skipped: 'ALREADY_PAID' as const };
  }

  const owner = chargeCall.lot?.owner;
  const tenantId = chargeCall.syndicate.tenantId;

  if (!owner) {
    logger.info('notifyChargeCall: no owner linked to lot, skipping notifications', {
      chargeCallId,
      lotId: chargeCall.lotId
    });
    return { emailSent: false, whatsappSent: false, skipped: 'NO_OWNER_CONTACT' as const };
  }

  if (!(await isCurrentLotOwner(chargeCall.lotId, owner.id))) {
    logger.warn('notifyChargeCall: lot owner is not a current co-owner, skipping notifications', {
      chargeCallId,
      lotId: chargeCall.lotId
    });
    return { emailSent: false, whatsappSent: false, skipped: 'OWNER_NOT_CURRENT' as const };
  }

  const dueDate = new Date(chargeCall.dueDate).toLocaleDateString('fr-FR');
  const amount = Number(chargeCall.amount).toLocaleString('fr-FR');
  const ownerName =
    [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.legalName || 'Copropriétaire';

  const templateVars = {
    ownerName,
    syndicateName: chargeCall.syndicate.name,
    lotNumber: getLotDisplayLabel(chargeCall.lot),
    lotLabel: getLotDisplayLabel(chargeCall.lot),
    period: chargeCall.period,
    amount,
    currency: chargeCall.currency,
    dueDate
  };

  let emailSent = false;
  let whatsappSent = false;

  if (owner.email?.trim()) {
    const emailConfig = await getEmailNotificationConfig(tenantId, eventKeyEmail);
    if (emailConfig.enabled) {
      const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKeyEmail];
      const subjectTpl = emailConfig.subjectOverride || defaults.subject;
      const bodyTpl = emailConfig.bodyHtmlOverride || defaults.bodyHtml;

      const attachments = await resolveAttachments(chargeCallId, options);
      await emailService.sendEmail({
        to: owner.email,
        subject: applyTemplate(subjectTpl, templateVars),
        html: applyTemplate(bodyTpl, templateVars, true),
        ...(attachments.length > 0 ? { attachments } : {})
      });
      emailSent = true;
    }
  }

  whatsappSent = await sendWhatsappNotification({
    tenantId,
    notificationKey: eventKeyWhatsApp,
    variables: templateVars,
    contactId: owner.id
  });
  if (!whatsappSent) {
    const directPhone = getOwnerWhatsappTarget(owner);
    if (directPhone) {
      whatsappSent = await sendWhatsappNotification({
        tenantId,
        notificationKey: eventKeyWhatsApp,
        variables: templateVars,
        to: directPhone
      });
    }
  }

  logger.info('notifyChargeCall completed', {
    chargeCallId,
    tenantId,
    ownerId: owner.id,
    emailSent,
    whatsappSent
  });

  return { emailSent, whatsappSent };
}

export async function notifyMeetingConvocation(meetingId: string) {
  const eventKeyEmail: EmailNotificationKey = 'GENERAL_MEETING_CONVOCATION';
  const eventKeyWhatsApp: WhatsappNotificationKey = 'GENERAL_MEETING_CONVOCATION';

  const meeting = await prisma.generalMeeting.findUnique({
    where: { id: meetingId },
    include: {
      syndicate: {
        include: {
          lots: {
            include: {
              owner: true
            }
          }
        }
      }
    }
  });

  if (!meeting) {
    logger.warn('notifyMeetingConvocation: meeting not found', { meetingId });
    return { emailSent: 0, whatsappSent: 0, skipped: 'MEETING_NOT_FOUND' as const };
  }

  const owners = meeting.syndicate.lots
    .map(lot => lot.owner)
    .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner))
    .filter((owner, index, all) => all.findIndex(item => item.id === owner.id) === index);

  if (owners.length === 0) {
    return { emailSent: 0, whatsappSent: 0, skipped: 'NO_OWNER_CONTACT' as const };
  }

  const meetingDate = new Date(meeting.scheduledAt).toLocaleDateString('fr-FR');
  const meetingTime = new Date(meeting.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const tenantId = meeting.syndicate.tenantId;
  const emailConfig = await getEmailNotificationConfig(tenantId, eventKeyEmail);
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKeyEmail];

  let emailSent = 0;
  let whatsappSent = 0;

  for (const owner of owners) {
    const ownerName =
      [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.legalName || 'Copropriétaire';
    const templateVars = {
      ownerName,
      syndicateName: meeting.syndicate.name,
      meetingDate,
      meetingTime,
      meetingLocation: meeting.location || 'À préciser'
    };

    if (emailConfig.enabled && owner.email?.trim()) {
      await emailService.sendEmail({
        to: owner.email,
        subject: applyTemplate(emailConfig.subjectOverride || defaults.subject, templateVars),
        html: applyTemplate(emailConfig.bodyHtmlOverride || defaults.bodyHtml, templateVars, true)
      });
      emailSent += 1;
    }

    const sentWhatsapp = await sendWhatsappNotification({
      tenantId,
      notificationKey: eventKeyWhatsApp,
      variables: templateVars,
      contactId: owner.id
    });
    if (sentWhatsapp) {
      whatsappSent += 1;
    } else {
      const directPhone = getOwnerWhatsappTarget(owner);
      if (directPhone) {
        const sentDirectWhatsapp = await sendWhatsappNotification({
          tenantId,
          notificationKey: eventKeyWhatsApp,
          variables: templateVars,
          to: directPhone
        });
        if (sentDirectWhatsapp) whatsappSent += 1;
      }
    }
  }

  logger.info('notifyMeetingConvocation completed', {
    meetingId,
    tenantId,
    owners: owners.length,
    emailSent,
    whatsappSent
  });

  return { emailSent, whatsappSent };
}

export async function notifyChargeCallReminder(reminderId: string) {
  const eventKeyEmail: EmailNotificationKey = 'CHARGE_CALL_REMINDER';
  const eventKeyWhatsApp: WhatsappNotificationKey = 'CHARGE_CALL_REMINDER';

  const reminder = await prisma.paymentReminder.findUnique({
    where: { id: reminderId },
    include: {
      chargeCall: {
        include: {
          lot: {
            include: {
              owner: true,
              property: {
                select: {
                  title: true,
                  internalReference: true,
                  address: true
                }
              }
            }
          },
          allocations: { select: { amount: true } },
          syndicate: true
        }
      }
    }
  });

  if (!reminder || !reminder.chargeCall) {
    logger.warn('notifyChargeCallReminder: reminder not found', { reminderId });
    return { emailSent: false, whatsappSent: false, skipped: 'REMINDER_NOT_FOUND' as const };
  }

  const call = reminder.chargeCall;
  const owner = call.lot?.owner;
  if (!owner) {
    logger.info('notifyChargeCallReminder: no owner linked to lot', { reminderId, lotId: call.lotId });
    return { emailSent: false, whatsappSent: false, skipped: 'NO_OWNER_CONTACT' as const };
  }

  const tenantId = call.syndicate.tenantId;
  const amount = Number(call.amount);
  // Lot S2 : regle lu dans les affectations (paiements et avances imputees).
  const paid = paidFromAllocations(call.allocations);
  const outstanding = computeOutstanding(amount, paid);
  if (outstanding <= 0) {
    logger.info('notifyChargeCallReminder: charge call already covered', { reminderId, chargeCallId: call.id });
    return { emailSent: false, whatsappSent: false, skipped: 'ALREADY_PAID' as const };
  }
  const ownerName =
    [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.legalName || 'Copropriétaire';

  const templateVars = {
    ownerName,
    syndicateName: call.syndicate.name,
    lotNumber: getLotDisplayLabel(call.lot),
    lotLabel: getLotDisplayLabel(call.lot),
    period: call.period,
    amount: amount.toLocaleString('fr-FR'),
    paid: paid.toLocaleString('fr-FR'),
    outstanding: outstanding.toLocaleString('fr-FR'),
    remainingAmount: outstanding.toLocaleString('fr-FR'),
    currency: call.currency,
    dueDate: new Date(call.dueDate).toLocaleDateString('fr-FR'),
    reminderLevel: String(reminder.reminderLevel)
  };

  let emailSent = false;
  let whatsappSent = false;

  if (owner.email?.trim()) {
    const emailConfig = await getEmailNotificationConfig(tenantId, eventKeyEmail);
    if (emailConfig.enabled) {
      const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKeyEmail];
      const subjectTpl = emailConfig.subjectOverride || defaults.subject;
      const bodyTpl = emailConfig.bodyHtmlOverride || defaults.bodyHtml;
      await emailService.sendEmail({
        to: owner.email,
        subject: applyTemplate(subjectTpl, templateVars),
        html: applyTemplate(bodyTpl, templateVars, true)
      });
      emailSent = true;
    }
  }

  whatsappSent = await sendWhatsappNotification({
    tenantId,
    notificationKey: eventKeyWhatsApp,
    variables: templateVars,
    contactId: owner.id
  });
  if (!whatsappSent) {
    const directPhone = getOwnerWhatsappTarget(owner);
    if (directPhone) {
      whatsappSent = await sendWhatsappNotification({
        tenantId,
        notificationKey: eventKeyWhatsApp,
        variables: templateVars,
        to: directPhone
      });
    }
  }

  logger.info('notifyChargeCallReminder completed', {
    reminderId,
    chargeCallId: call.id,
    tenantId,
    ownerId: owner.id,
    emailSent,
    whatsappSent
  });

  return { emailSent, whatsappSent };
}
