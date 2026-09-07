import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { EmailNotificationKey } from '../../constants/email-notification-keys';
import type { WhatsappNotificationKey } from '../../constants/whatsapp-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
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

export async function notifyChargeCall(chargeCallId: string) {
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
      syndicate: true
    }
  });

  if (!chargeCall) {
    logger.warn('notifyChargeCall: charge call not found', { chargeCallId });
    return { emailSent: false, whatsappSent: false, skipped: 'CHARGE_CALL_NOT_FOUND' as const };
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

      await emailService.sendEmail({
        to: owner.email,
        subject: applyTemplate(subjectTpl, templateVars),
        html: applyTemplate(bodyTpl, templateVars)
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
        html: applyTemplate(emailConfig.bodyHtmlOverride || defaults.bodyHtml, templateVars)
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
          payments: true,
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
  const paid = call.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = Math.max(amount - paid, 0);
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
        html: applyTemplate(bodyTpl, templateVars)
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
