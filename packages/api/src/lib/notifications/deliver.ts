/**
 * Envoi sur un canal. Aucune fonction d'ici ne leve : un echec devient
 * `{ status: 'FAILED', failureReason }` pour que l'appelant l'ecrive dans la
 * `NotificationDelivery` sans rien annuler.
 */
import { emailService } from '../../services/email-service';
import { sendWhatsappNotification } from '../../services/whatsapp-notification-send-service';
import type { WhatsappNotificationKey } from '../../constants/whatsapp-notification-keys';
import { getSmsTransport } from '../sms';
import { normalizePhoneE164 } from '../phone/e164';
import { logger } from '../../utils/logger';
import { describeError, describeFailure } from './describe-error';
import { toAbsoluteLink } from './link';
import type { NotificationChannelKey, NotificationStatusKey, ResendPayload } from './types';

export interface ChannelContext {
  tenantId: string;
  title: string;
  body: string;
  link?: string | null;
  /** Adresse e-mail ou numero vise. */
  target?: string | null;
  payload?: ResendPayload | null;
}

export interface ChannelResult {
  status: Extract<NotificationStatusKey, 'SENT' | 'SKIPPED' | 'FAILED'>;
  providerMessageId?: string;
  failureReason?: string;
}

export { describeError };

function composeText(ctx: ChannelContext): string {
  const link = toAbsoluteLink(ctx.link);
  return link ? `${ctx.body}\n\n${link}` : ctx.body;
}

async function sendEmail(ctx: ChannelContext): Promise<ChannelResult> {
  if (!ctx.target) return { status: 'SKIPPED', failureReason: 'Aucune adresse e-mail pour ce destinataire.' };
  await emailService.sendEmail({ to: ctx.target, subject: ctx.title, text: composeText(ctx), tenantId: ctx.tenantId });
  return { status: 'SENT' };
}

async function sendWhatsapp(ctx: ChannelContext): Promise<ChannelResult> {
  const wa = ctx.payload?.whatsapp;
  if (!wa?.notificationKey) return { status: 'SKIPPED', failureReason: 'Gabarit WhatsApp non fourni.' };
  const sent = await sendWhatsappNotification({
    tenantId: ctx.tenantId,
    notificationKey: wa.notificationKey as WhatsappNotificationKey,
    variables: wa.variables ?? {},
    // notify() ecrit deja sa propre ligne de journal : pas de doublon.
    skipJournal: true,
    ...(ctx.target ? { to: ctx.target } : {}),
    ...(ctx.payload?.contactId ? { contactId: ctx.payload.contactId } : {})
  });
  return sent
    ? { status: 'SENT' }
    : { status: 'SKIPPED', failureReason: 'WhatsApp non envoye (desactive, sans consentement ou sans numero).' };
}

async function sendSms(ctx: ChannelContext): Promise<ChannelResult> {
  const to = ctx.target ? normalizePhoneE164(ctx.target) : null;
  if (!to) return { status: 'SKIPPED', failureReason: 'Aucun numero de telephone valide pour ce destinataire.' };
  const result = await getSmsTransport().send({ to, text: `${ctx.title}\n${composeText(ctx)}` });
  if (result.ok) return { status: 'SENT', providerMessageId: result.providerMessageId };
  return result.reason === 'DISABLED'
    ? { status: 'SKIPPED', failureReason: 'Canal SMS non active.' }
    : { status: 'FAILED', failureReason: "Echec d'envoi du SMS." };
}

/** Tente l'envoi sur un canal. IN_APP : ecriture seule, deja faite. Ne leve jamais. */
export async function sendOnChannel(channel: NotificationChannelKey, ctx: ChannelContext): Promise<ChannelResult> {
  try {
    switch (channel) {
      case 'IN_APP':
        return { status: 'SENT' };
      case 'EMAIL':
        return await sendEmail(ctx);
      case 'WHATSAPP':
        return await sendWhatsapp(ctx);
      case 'SMS':
        return await sendSms(ctx);
      default:
        return { status: 'SKIPPED', failureReason: 'Canal inconnu.' };
    }
  } catch (error) {
    logger.warn('Notification: echec sur un canal', { tenantId: ctx.tenantId, channel, error: describeError(error) });
    return { status: 'FAILED', failureReason: describeFailure(error) };
  }
}

/**
 * Statut agregat : FAILED si au moins un canal est en echec et aucun n'est parti ;
 * SENT sinon (partiel : SENT + `failureReason` renseignee).
 */
export function aggregateStatus(
  deliveries: Array<{ channel: string; status: string; failureReason?: string | null }>
): { status: NotificationStatusKey; failureReason: string | null } {
  const failed = deliveries.filter(d => d.status === 'FAILED');
  const reason = failed.length
    ? failed
        .map(d => `${d.channel} : ${d.failureReason ?? 'echec'}`)
        .join(' ; ')
        .slice(0, 500)
    : null;
  const anySent = deliveries.some(d => d.status === 'SENT' || d.status === 'DELIVERED');
  if (anySent) return { status: 'SENT', failureReason: reason };
  if (failed.length) return { status: 'FAILED', failureReason: reason };
  if (deliveries.some(d => d.status === 'PENDING')) return { status: 'PENDING', failureReason: null };
  return { status: 'SKIPPED', failureReason: null };
}
