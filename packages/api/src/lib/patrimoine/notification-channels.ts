/**
 * Routeur de canaux des notifications patrimoine (lot A3).
 *
 * Un message part sur UN SEUL canal par destinataire : le premier canal
 * éligible qui réussit, sinon repli sur le suivant, sinon une raison explicite.
 *
 * Éligibilité d'un canal, dans cet ordre :
 *  1. le message prévoit une clé d'événement pour ce canal (`ChannelTargets`) ;
 *  2. le contact CRM a consenti ET porte une adresse exploitable
 *     (e-mail : `consentEmail === true` + adresse non vide ; WhatsApp :
 *     `consentWhatsapp === true` + `whatsappNumber` ou `phonePrimary` non vide) ;
 *  3. l'agence n'a pas désactivé l'événement pour ce canal.
 *
 * Ordre des candidats : le canal préféré du contact (`preferredContactChannel`)
 * s'il est géré ici, puis les autres ; sans préférence exploitable (CALL, SMS,
 * vide), e-mail puis WhatsApp. Le canal SMS (branche `feat/sms-lot-1`, non
 * fusionnée) s'ajoutera avec une entrée de `NotificationChannel`, de
 * `CHANNEL_SENDERS`, de `PREFERRED_CHANNEL` et de `DEFAULT_CHANNEL_ORDER`.
 *
 * Jamais de valeur de message (jeton, lien) dans un journal : seuls le canal,
 * l'agence et l'identifiant du contact sont journalisés.
 */
import {
  EMAIL_NOTIFICATION_DEFAULT_TEMPLATES,
  type DefaultEmailTemplate
} from '../../constants/email-notification-default-templates';
import type { EmailNotificationKey } from '../../constants/email-notification-keys';
import type { WhatsappNotificationKey } from '../../constants/whatsapp-notification-keys';
import {
  getEmailNotificationConfig,
  type EmailNotificationConfigForSend
} from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import {
  getWhatsappNotificationConfig,
  type WhatsappNotificationConfigForSend
} from '../../services/whatsapp-notification-config-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';
import { logger } from '../../utils/logger';

export type NotificationChannel = 'WHATSAPP' | 'EMAIL';

/** Clé d'événement à utiliser sur chaque canal ; un canal absent n'est jamais tenté. */
export interface ChannelTargets {
  email?: EmailNotificationKey;
  whatsapp?: WhatsappNotificationKey;
}

/** Ce que le routeur lit d'un contact CRM pour choisir un canal. */
export interface ChannelRecipient {
  contactId: string;
  email: string | null;
  consentEmail: boolean | null;
  whatsappNumber: string | null;
  phonePrimary: string | null;
  consentWhatsapp: boolean | null;
  /** `CrmContact.preferredContactChannel` : CALL | WHATSAPP | EMAIL | SMS | null. */
  preferredContactChannel: string | null;
}

/** Colonnes `CrmContact` à sélectionner pour construire un `ChannelRecipient`. */
export const CHANNEL_RECIPIENT_SELECT = {
  id: true,
  email: true,
  consentEmail: true,
  whatsappNumber: true,
  phonePrimary: true,
  consentWhatsapp: true,
  preferredContactChannel: true
} as const;

export interface ChannelConfigs {
  EMAIL?: EmailNotificationConfigForSend;
  WHATSAPP?: WhatsappNotificationConfigForSend;
}

export type ChannelFailureReason = 'EVENT_DISABLED' | 'NO_ELIGIBLE_CHANNEL' | 'SEND_FAILED';

export interface ChannelDelivery {
  sent: boolean;
  channel: NotificationChannel | null;
  reason?: ChannelFailureReason;
}

export interface ChannelPlan {
  channels: NotificationChannel[];
  /** Renseignée quand `channels` est vide. */
  reason?: Exclude<ChannelFailureReason, 'SEND_FAILED'>;
}

interface SendArgs {
  tenantId: string;
  recipient: ChannelRecipient;
  configs: ChannelConfigs;
  targets: ChannelTargets;
  /** Valeurs en texte brut : le canal e-mail les échappe pour le corps HTML. */
  variables: Record<string, string>;
}

export interface ChannelSender {
  /** Le message prévoit-il une clé d'événement pour ce canal ? */
  hasTarget(targets: ChannelTargets): boolean;
  /** Consentement et adresse du contact. */
  contactEligible(recipient: ChannelRecipient): boolean;
  /** L'agence n'a-t-elle pas désactivé l'événement sur ce canal ? */
  isEnabled(configs: ChannelConfigs): boolean;
  /** Envoie le message ; ne lève pas, renvoie `false` en cas d'échec. */
  send(args: SendArgs): Promise<boolean>;
}

/** Valeurs injectées dans un corps HTML d'e-mail : échappées (saisies utilisateur). */
export function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function escapeVariables(variables: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, escapeHtml(value)]));
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const emailSender: ChannelSender = {
  hasTarget: targets => Boolean(targets.email),
  contactEligible: recipient => recipient.consentEmail === true && nonEmpty(recipient.email),
  isEnabled: configs => configs.EMAIL?.enabled === true,
  async send({ tenantId, recipient, configs, targets, variables }) {
    const config = configs.EMAIL;
    if (!targets.email || !config || !recipient.email) return false;
    const defaults: DefaultEmailTemplate = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[targets.email];
    try {
      await emailService.sendEmail({
        to: recipient.email.trim(),
        // Le sujet part en texte brut ; le corps HTML reprend les valeurs échappées.
        subject: applyTemplate(config.subjectOverride || defaults.subject, variables),
        html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, escapeVariables(variables)),
        tenantId
      });
      return true;
    } catch (error) {
      logger.warn('Notification patrimoine : envoi e-mail échoué', {
        tenantId,
        contactId: recipient.contactId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
};

const whatsappSender: ChannelSender = {
  hasTarget: targets => Boolean(targets.whatsapp),
  contactEligible: recipient =>
    recipient.consentWhatsapp === true && (nonEmpty(recipient.whatsappNumber) || nonEmpty(recipient.phonePrimary)),
  isEnabled: configs => configs.WHATSAPP?.enabled === true,
  async send({ tenantId, recipient, targets, variables }) {
    if (!targets.whatsapp) return false;
    // `contactId` (et non `to`) : le service revérifie le consentement et le
    // numéro du contact, il ne fait pas confiance à l'appelant.
    return sendWhatsappNotification({
      tenantId,
      notificationKey: targets.whatsapp,
      contactId: recipient.contactId,
      variables
    });
  }
};

/** Un canal de plus (ex. SMS) = une entrée ici + une valeur de `NotificationChannel`. */
export const CHANNEL_SENDERS: Record<NotificationChannel, ChannelSender> = {
  WHATSAPP: whatsappSender,
  EMAIL: emailSender
};

/** Canal retenu en premier selon `preferredContactChannel` ; CALL et SMS sont ignorés aujourd'hui. */
const PREFERRED_CHANNEL: Record<string, NotificationChannel> = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL'
};

const DEFAULT_CHANNEL_ORDER: NotificationChannel[] = ['EMAIL', 'WHATSAPP'];

/** Canaux candidats, dans l'ordre d'essai (éligibilité non encore vérifiée). */
export function candidateChannels(preferred: string | null | undefined): NotificationChannel[] {
  const first = preferred ? PREFERRED_CHANNEL[preferred] : undefined;
  if (!first) return [...DEFAULT_CHANNEL_ORDER];
  return [first, ...DEFAULT_CHANNEL_ORDER.filter(channel => channel !== first)];
}

/** Configurations de l'agence pour les clés du message, lues une seule fois par lot. */
export async function loadChannelConfigs(tenantId: string, targets: ChannelTargets): Promise<ChannelConfigs> {
  const [email, whatsapp] = await Promise.all([
    targets.email ? getEmailNotificationConfig(tenantId, targets.email) : Promise.resolve(undefined),
    targets.whatsapp ? getWhatsappNotificationConfig(tenantId, targets.whatsapp) : Promise.resolve(undefined)
  ]);
  return { ...(email ? { EMAIL: email } : {}), ...(whatsapp ? { WHATSAPP: whatsapp } : {}) };
}

/** Vrai si au moins un canal du message est activé par l'agence. */
export function anyChannelEnabled(configs: ChannelConfigs, targets: ChannelTargets): boolean {
  return (Object.keys(CHANNEL_SENDERS) as NotificationChannel[]).some(
    channel => CHANNEL_SENDERS[channel].hasTarget(targets) && CHANNEL_SENDERS[channel].isEnabled(configs)
  );
}

/** Le contact peut-il recevoir quoi que ce soit (au moins un canal prévu, consenti, avec adresse) ? */
export function hasEligibleContactChannel(recipient: ChannelRecipient, targets: ChannelTargets): boolean {
  return (Object.keys(CHANNEL_SENDERS) as NotificationChannel[]).some(
    channel => CHANNEL_SENDERS[channel].hasTarget(targets) && CHANNEL_SENDERS[channel].contactEligible(recipient)
  );
}

/**
 * Canaux éligibles pour ce contact, dans l'ordre d'essai. Vide : `reason` vaut
 * `EVENT_DISABLED` quand un canal utilisable côté contact a été coupé par
 * l'agence, `NO_ELIGIBLE_CHANNEL` sinon (aucun consentement/adresse).
 */
export function planChannels(
  recipient: ChannelRecipient,
  configs: ChannelConfigs,
  targets: ChannelTargets
): ChannelPlan {
  const channels: NotificationChannel[] = [];
  let disabledByAgency = false;
  for (const channel of candidateChannels(recipient.preferredContactChannel)) {
    const sender = CHANNEL_SENDERS[channel];
    if (!sender.hasTarget(targets) || !sender.contactEligible(recipient)) continue;
    if (!sender.isEnabled(configs)) {
      disabledByAgency = true;
      continue;
    }
    channels.push(channel);
  }
  if (channels.length > 0) return { channels };
  return { channels, reason: disabledByAgency ? 'EVENT_DISABLED' : 'NO_ELIGIBLE_CHANNEL' };
}

/** Essaie les canaux du plan dans l'ordre : le premier qui réussit gagne, un seul message part. */
export async function sendOnPlannedChannels(plan: ChannelPlan, args: SendArgs): Promise<ChannelDelivery> {
  if (plan.channels.length === 0) {
    return { sent: false, channel: null, reason: plan.reason ?? 'NO_ELIGIBLE_CHANNEL' };
  }
  for (const channel of plan.channels) {
    if (await CHANNEL_SENDERS[channel].send(args)) {
      logger.info('Notification patrimoine envoyée', {
        tenantId: args.tenantId,
        contactId: args.recipient.contactId,
        channel
      });
      return { sent: true, channel };
    }
  }
  return { sent: false, channel: null, reason: 'SEND_FAILED' };
}

/** Planifie puis envoie sur le meilleur canal éligible. */
export async function deliverOnBestChannel(args: SendArgs): Promise<ChannelDelivery> {
  const plan = planChannels(args.recipient, args.configs, args.targets);
  return sendOnPlannedChannels(plan, args);
}
