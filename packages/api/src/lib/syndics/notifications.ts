import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import type { EmailNotificationKey } from '../../constants/email-notification-keys';
import type { WhatsappNotificationKey } from '../../constants/whatsapp-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService, isEmailDeliveryConfigured } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';
import { paidFromAllocations } from './charge-allocation';
import { computeOutstanding } from './finance-utils';
import { currentOwnerProfilesSorted } from './lot-owner';
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

/**
 * Raison pour laquelle `notifyChargeCall` n'a envoyé aucun avis (ou, pour les
 * deux premières, n'a rien tenté du tout). BUG-2026-09-27 : `NO_OWNER` et
 * `OWNER_NOT_CURRENT` sont distincts d'un simple défaut de canal, et
 * `NO_EMAIL`/`NOTIFICATION_DISABLED`/`EMAIL_NOT_CONFIGURED` remplacent un
 * fourre-tout unique pour que l'écran et le renvoi sachent quoi faire.
 */
export type NotifyChargeCallSkipReason =
  | 'CHARGE_CALL_NOT_FOUND'
  | 'ALREADY_PAID'
  /** Le lot n'a ni propriétaire (`ownerContactId`) ni copropriétaire (`coownerId`). */
  | 'NO_OWNER'
  /** Le contact résolu n'est plus un copropriétaire actuel du lot (fiches `LotOwnerProfile`). */
  | 'OWNER_NOT_CURRENT'
  /** Copropriétaire sans e-mail exploitable, et sans WhatsApp exploitable non plus. */
  | 'NO_EMAIL'
  /** Le copropriétaire a un e-mail, mais la notification « Appel de charges émis » est désactivée pour l'agence. */
  | 'NOTIFICATION_DISABLED'
  /** Le copropriétaire a un e-mail et la notification est activée, mais le serveur n'a aucun transport e-mail configuré. */
  | 'EMAIL_NOT_CONFIGURED'
  /** L'envoi a été tenté (e-mail configuré, activé) et a échoué. */
  | 'SEND_FAILED';

export interface NotifyChargeCallResult {
  emailSent: boolean;
  whatsappSent: boolean;
  skipped?: NotifyChargeCallSkipReason;
  /** `SEND_FAILED` seulement : motif court et non sensible (code/réponse SMTP), jamais d'identifiants. */
  skipDetail?: string;
}

/** Motif court, non sensible, tiré d'une erreur d'envoi (jamais `command` : peut porter les identifiants SMTP en base64). */
/** Le motif est affiché dans les notes de l'exécution : aucune adresse e-mail n'y figure. */
function maskEmailAddresses(text: string): string {
  return text.replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '<adresse>');
}

function emailFailureDetail(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { code?: unknown; responseCode?: unknown; response?: unknown; message?: unknown };
    const codes = [err.responseCode, err.code].filter(part => part !== undefined && part !== null).map(String);
    const response = typeof err.response === 'string' ? err.response.trim().slice(0, 160) : undefined;
    const detail = [...codes, response].filter(Boolean).join(' ').trim();
    if (detail) return maskEmailAddresses(detail).slice(0, 200);
    if (typeof err.message === 'string' && err.message.trim())
      return maskEmailAddresses(err.message.trim()).slice(0, 200);
  }
  return 'erreur inconnue';
}

export async function notifyChargeCall(
  chargeCallId: string,
  options: NotifyChargeCallOptions = {}
): Promise<NotifyChargeCallResult> {
  const eventKeyEmail: EmailNotificationKey = 'CHARGE_CALL_ISSUED';
  const eventKeyWhatsApp: WhatsappNotificationKey = 'CHARGE_CALL_ISSUED';

  const chargeCall = await prisma.chargeCall.findUnique({
    where: { id: chargeCallId },
    include: {
      lot: {
        include: {
          owner: true,
          coowner: true,
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
    return { emailSent: false, whatsappSent: false, skipped: 'CHARGE_CALL_NOT_FOUND' };
  }

  // Lot S2 : un appel entierement couvert (par un paiement ou par l'avance du
  // lot, imputee a la creation) n'est pas notifie comme « a payer ».
  if (computeOutstanding(Number(chargeCall.amount), paidFromAllocations(chargeCall.allocations)) <= 0) {
    logger.info('notifyChargeCall: charge call already covered, skipping notifications', { chargeCallId });
    return { emailSent: false, whatsappSent: false, skipped: 'ALREADY_PAID' };
  }

  const tenantId = chargeCall.syndicate.tenantId;
  const lot = chargeCall.lot;
  // Correctif BUG-2026-09-27 : meme regle de resolution du destinataire que
  // les quittances (`charge-receipt-queries.ts` :
  // `lot?.ownerContactId ?? lot?.coownerId`) — un lot cree depuis l'ecran
  // « Profils et copropriétaires » ne renseigne souvent que `coownerId`
  // (LotOwnerProfile / coowner), jamais `ownerContactId` seul : avant ce
  // correctif, notifyChargeCall ne regardait que `lot.owner`
  // (`ownerContactId`) et envoyait NO_OWNER_CONTACT pour tous ces lots.
  const recipient = lot?.ownerContactId ? lot.owner : lot?.coownerId ? lot.coowner : null;

  if (!recipient) {
    logger.info('notifyChargeCall: no owner or coowner linked to lot, skipping notifications', {
      chargeCallId,
      lotId: chargeCall.lotId
    });
    return { emailSent: false, whatsappSent: false, skipped: 'NO_OWNER' };
  }

  if (!(await isCurrentLotOwner(chargeCall.lotId, recipient.id))) {
    logger.warn('notifyChargeCall: lot owner is not a current co-owner, skipping notifications', {
      chargeCallId,
      lotId: chargeCall.lotId
    });
    return { emailSent: false, whatsappSent: false, skipped: 'OWNER_NOT_CURRENT' };
  }

  const dueDate = new Date(chargeCall.dueDate).toLocaleDateString('fr-FR');
  const amount = Number(chargeCall.amount).toLocaleString('fr-FR');
  const ownerName =
    [recipient.firstName, recipient.lastName].filter(Boolean).join(' ').trim() ||
    recipient.legalName ||
    'Copropriétaire';

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
  let emailBlockReason: NotifyChargeCallSkipReason | undefined;
  let emailBlockDetail: string | undefined;

  if (recipient.email?.trim()) {
    if (!isEmailDeliveryConfigured()) {
      // Aucun transport e-mail au niveau serveur : ne pas tenter l'envoi (il
      // ne partirait de toute facon jamais), ne pas lever.
      emailBlockReason = 'EMAIL_NOT_CONFIGURED';
      logger.warn('notifyChargeCall: email delivery not configured on the server, skipping email attempt', {
        chargeCallId
      });
    } else {
      const emailConfig = await getEmailNotificationConfig(tenantId, eventKeyEmail);
      if (!emailConfig.enabled) {
        emailBlockReason = 'NOTIFICATION_DISABLED';
      } else {
        const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKeyEmail];
        const subjectTpl = emailConfig.subjectOverride || defaults.subject;
        const bodyTpl = emailConfig.bodyHtmlOverride || defaults.bodyHtml;
        const attachments = await resolveAttachments(chargeCallId, options);
        try {
          await emailService.sendEmail({
            to: recipient.email,
            subject: applyTemplate(subjectTpl, templateVars),
            html: applyTemplate(bodyTpl, templateVars, true),
            ...(attachments.length > 0 ? { attachments } : {})
          });
          emailSent = true;
        } catch (error) {
          emailBlockReason = 'SEND_FAILED';
          emailBlockDetail = emailFailureDetail(error);
          logger.warn('notifyChargeCall: email send failed', {
            chargeCallId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  whatsappSent = await sendWhatsappNotification({
    tenantId,
    notificationKey: eventKeyWhatsApp,
    variables: templateVars,
    contactId: recipient.id
  });
  if (!whatsappSent) {
    const directPhone = getOwnerWhatsappTarget(recipient);
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
    ownerId: recipient.id,
    emailSent,
    whatsappSent
  });

  if (emailSent || whatsappSent) {
    // Traçabilité par appel (item 3, correctif renvoi) : filtré par id ET par
    // agence via le syndicat, defense en profondeur meme si chargeCallId est
    // deja connu appartenir a cette agence par l'appelant.
    await prisma.chargeCall.updateMany({
      where: { id: chargeCallId, syndicate: { tenantId } },
      data: { noticeSentAt: new Date() }
    });
    return { emailSent, whatsappSent };
  }

  const skipped: NotifyChargeCallSkipReason = emailBlockReason ?? 'NO_EMAIL';
  return {
    emailSent,
    whatsappSent,
    skipped,
    ...(skipped === 'SEND_FAILED' && emailBlockDetail ? { skipDetail: emailBlockDetail } : {})
  };
}

export interface ConvocationResult {
  /** Copropriétaires distincts visés par cet envoi (hors ceux déjà servis lors d'un renvoi). */
  owners: number;
  /** Renvoi : copropriétaires déjà servis (e-mail ou WhatsApp livré), non relancés. */
  alreadyServed?: number;
  /** Événement e-mail « Convocation Assemblée Générale » activé pour l'agence. */
  emailEnabled: boolean;
  emailSent: number;
  emailFailed: number;
  /** Copropriétaires sans adresse e-mail (aucun envoi tenté). */
  emailSkippedNoAddress: number;
  whatsappSent: number;
  /** Noms des copropriétaires dont l'e-mail a échoué. */
  failures: string[];
  skipped?: 'MEETING_NOT_FOUND' | 'NO_OWNER_CONTACT';
}

function emptyConvocationResult(): ConvocationResult {
  return {
    owners: 0,
    emailEnabled: false,
    emailSent: 0,
    emailFailed: 0,
    emailSkippedNoAddress: 0,
    whatsappSent: 0,
    failures: []
  };
}

const CONVOCATION_DELIVERY_ACTION = 'SYNDIC_MEETING_CONVOCATION_DELIVERY';

type ConvocationRecipient = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  legalName?: string | null;
  email?: string | null;
  whatsappNumber?: string | null;
  phonePrimary?: string | null;
};

/**
 * Destinataires d'une convocation : tous les propriétaires ACTUELS des lots
 * (règle de `lot-owner.ts` : indivision = plusieurs profils), y compris les
 * co-indivisaires ; à défaut de profil, le propriétaire saisi sur le lot. Les
 * lots à 0 tantième (désactivés) ne votent pas et ne sont pas convoqués.
 * Dédoublonnés par contact puis par adresse e-mail.
 */
export function collectConvocationRecipients(
  lots: Array<{
    generalShares?: number | null;
    owner?: ConvocationRecipient | null;
    ownerProfiles?: Array<any> | null;
  }>,
  now: Date = new Date()
): ConvocationRecipient[] {
  const byContact = new Map<string, ConvocationRecipient>();
  for (const lot of lots) {
    if (Number(lot.generalShares ?? 0) <= 0) continue;
    const current = currentOwnerProfilesSorted(lot.ownerProfiles ?? [], now)
      .map(profile => profile.contact as ConvocationRecipient | null | undefined)
      .filter((contact): contact is ConvocationRecipient => Boolean(contact));
    const recipients = current.length > 0 ? current : lot.owner ? [lot.owner] : [];
    for (const recipient of recipients) {
      if (!byContact.has(recipient.id)) byContact.set(recipient.id, recipient);
    }
  }
  const seenEmails = new Set<string>();
  return [...byContact.values()].filter(recipient => {
    const email = recipient.email?.trim().toLowerCase();
    if (!email) return true;
    if (seenEmails.has(email)) return false;
    seenEmails.add(email);
    return true;
  });
}

/** Dernier résultat journalisé par contact (SENT / FAILED / NOT_SERVED) pour cette assemblée. */
async function loadConvocationDeliveries(tenantId: string, meetingId: string): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  try {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId, actionKey: CONVOCATION_DELIVERY_ACTION, entityType: 'GeneralMeeting', entityId: meetingId },
      orderBy: { createdAt: 'asc' },
      select: { payload: true }
    });
    for (const row of rows) {
      const payload = row.payload as { contactId?: string; status?: string } | null;
      if (payload?.contactId && payload.status) statuses.set(payload.contactId, payload.status);
    }
  } catch (error) {
    logger.warn('notifyMeetingConvocation: delivery journal unreadable', {
      meetingId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return statuses;
}

async function recordConvocationDelivery(tenantId: string, meetingId: string, contactId: string, status: string) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actionKey: CONVOCATION_DELIVERY_ACTION,
        entityType: 'GeneralMeeting',
        entityId: meetingId,
        payload: { contactId, status }
      }
    });
  } catch (error) {
    logger.warn('notifyMeetingConvocation: delivery not journaled', {
      meetingId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Convoque les copropriétaires de l'assemblée. Premier envoi : tous. Renvoi
 * (un journal existe) : seuls les destinataires en échec ou jamais servis,
 * sauf `options.all`.
 */
export async function notifyMeetingConvocation(
  meetingId: string,
  options: { all?: boolean } = {}
): Promise<ConvocationResult> {
  const eventKeyEmail: EmailNotificationKey = 'GENERAL_MEETING_CONVOCATION';
  const eventKeyWhatsApp: WhatsappNotificationKey = 'GENERAL_MEETING_CONVOCATION';

  const meeting = await prisma.generalMeeting.findUnique({
    where: { id: meetingId },
    include: {
      syndicate: {
        include: {
          lots: {
            include: {
              owner: true,
              ownerProfiles: { where: { isActive: true }, include: { contact: true } }
            }
          }
        }
      }
    }
  });

  if (!meeting) {
    logger.warn('notifyMeetingConvocation: meeting not found', { meetingId });
    return { ...emptyConvocationResult(), skipped: 'MEETING_NOT_FOUND' as const };
  }

  const allRecipients = collectConvocationRecipients(meeting.syndicate.lots as any[]);

  if (allRecipients.length === 0) {
    return { ...emptyConvocationResult(), skipped: 'NO_OWNER_CONTACT' as const };
  }

  const deliveries = options.all
    ? new Map<string, string>()
    : await loadConvocationDeliveries(meeting.syndicate.tenantId, meetingId);
  const owners = allRecipients.filter(recipient => deliveries.get(recipient.id) !== 'SENT');
  const alreadyServed = allRecipients.length - owners.length;

  const meetingDate = new Date(meeting.scheduledAt).toLocaleDateString('fr-FR');
  const meetingTime = new Date(meeting.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const tenantId = meeting.syndicate.tenantId;
  const emailConfig = await getEmailNotificationConfig(tenantId, eventKeyEmail);
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[eventKeyEmail];

  let emailSent = 0;
  let emailFailed = 0;
  let emailSkippedNoAddress = 0;
  let whatsappSent = 0;
  const failures: string[] = [];

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
    let served = false;
    let failed = false;

    if (emailConfig.enabled && owner.email?.trim()) {
      // Un e-mail en échec ne doit pas empêcher les autres convocations : on
      // compte l'échec et on continue (le décompte est rendu à l'écran).
      try {
        await emailService.sendEmail({
          to: owner.email,
          subject: applyTemplate(emailConfig.subjectOverride || defaults.subject, templateVars),
          html: applyTemplate(emailConfig.bodyHtmlOverride || defaults.bodyHtml, templateVars, true)
        });
        emailSent += 1;
        served = true;
      } catch (error) {
        emailFailed += 1;
        failed = true;
        failures.push(ownerName);
        logger.warn('notifyMeetingConvocation: email send failed', {
          meetingId,
          contactId: owner.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else if (emailConfig.enabled) {
      emailSkippedNoAddress += 1;
    }

    const sentWhatsapp = await sendWhatsappNotification({
      tenantId,
      notificationKey: eventKeyWhatsApp,
      variables: templateVars,
      contactId: owner.id
    });
    if (sentWhatsapp) {
      whatsappSent += 1;
      served = true;
    } else {
      const directPhone = getOwnerWhatsappTarget(owner);
      if (directPhone) {
        const sentDirectWhatsapp = await sendWhatsappNotification({
          tenantId,
          notificationKey: eventKeyWhatsApp,
          variables: templateVars,
          to: directPhone
        });
        if (sentDirectWhatsapp) {
          whatsappSent += 1;
          served = true;
        }
      }
    }

    await recordConvocationDelivery(tenantId, meetingId, owner.id, served ? 'SENT' : failed ? 'FAILED' : 'NOT_SERVED');
  }

  logger.info('notifyMeetingConvocation completed', {
    meetingId,
    tenantId,
    owners: owners.length,
    emailSent,
    emailFailed,
    whatsappSent
  });

  return {
    owners: owners.length,
    alreadyServed,
    emailEnabled: emailConfig.enabled,
    emailSent,
    emailFailed,
    emailSkippedNoAddress,
    whatsappSent,
    failures
  } as ConvocationResult;
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
