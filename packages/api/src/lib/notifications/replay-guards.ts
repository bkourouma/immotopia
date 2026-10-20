/**
 * Controles avant de rejouer une livraison en echec (renvoi du journal).
 *
 * Un renvoi n'est jamais "meilleur" qu'un premier envoi : il repasse par les
 * memes gardes (consentement, numero, plafond) et refuse tout ce qui ne peut
 * pas etre rejoue sans risque. Un refus laisse la livraison en FAILED avec un
 * motif lisible par l'administrateur.
 */
import { prisma } from '../../utils/database';
import { normalizePhoneE164 } from '../phone/e164';
import { contactOwnsPhone, hasSmsBudget, isAllowedSmsDialCode } from '../signature/sms-guard';
import type { NotificationChannelKey, ResendPayload } from './types';

export const NOT_REPLAYABLE = 'Relance impossible : message non rejouable';
export const CONSENT_WITHDRAWN = 'Relance impossible : consentement retiré';
export const SMS_NOT_ALLOWED = 'Relance impossible : SMS non autorisé (contact, numéro ou plafond quotidien)';
export const SMS_NO_CONTACT = "Relance impossible : SMS non rejouable sans contact CRM de l'agence";

export const RECIPIENT_OR_EVENT_DISABLED = 'Relance impossible : destinataire ou événement désactivé';

export interface ReplayContext {
  tenantId: string;
  channel: NotificationChannelKey | string;
  target: string | null;
  payload: ResendPayload | null;
  recipientContactId: string | null;
  /** Compte destinataire : doit etre actif et rattache a l'agence au moment du renvoi. */
  recipientUserId?: string | null;
  /** Cle metier de la notification (config d'evenement e-mail). */
  notificationKey?: string | null;
}

/** Destinataire (compte) toujours actif ET evenement non desactive pour le canal. */
async function recipientOrEventDisabled(ctx: ReplayContext): Promise<boolean> {
  if (ctx.recipientUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: ctx.recipientUserId,
        isActive: true,
        OR: [
          { memberships: { some: { tenantId: ctx.tenantId, status: 'ACTIVE' } } },
          { clientProfiles: { some: { tenantId: ctx.tenantId } } }
        ]
      },
      select: { id: true }
    });
    if (!user) return true;
  }
  if (ctx.channel === 'EMAIL' && ctx.notificationKey) {
    const config = await prisma.emailNotificationConfig.findFirst({
      where: { tenant_id: ctx.tenantId, notification_key: ctx.notificationKey },
      select: { enabled: true }
    });
    if (config && !config.enabled) return true;
  }
  if (ctx.channel === 'WHATSAPP') {
    const waKey = ctx.payload?.whatsapp?.notificationKey ?? ctx.notificationKey;
    if (waKey) {
      const config = await prisma.whatsappNotificationConfig.findFirst({
        where: { tenant_id: ctx.tenantId, notification_key: waKey },
        select: { enabled: true }
      });
      if (config && !config.enabled) return true;
    }
  }
  return false;
}

/** `null` : la livraison peut etre rejouee ; sinon le motif de refus. */
export async function replayRefusal(ctx: ReplayContext): Promise<string | null> {
  if (ctx.payload?.replayable === false) return NOT_REPLAYABLE;
  if (ctx.channel !== 'EMAIL' && ctx.channel !== 'WHATSAPP' && ctx.channel !== 'SMS') return null;

  if (await recipientOrEventDisabled(ctx)) return RECIPIENT_OR_EVENT_DISABLED;

  const contactId = ctx.recipientContactId;
  if (ctx.channel === 'SMS' && !contactId) return SMS_NO_CONTACT;
  if (!contactId) return null; // destinataire avec compte : pas de consentement CRM a revalider

  // Consentement releve a nouveau chez l'agence au moment du renvoi (jamais le contact d'une autre agence).
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId: ctx.tenantId },
    select: { consentWhatsapp: true, consentEmail: true }
  });
  if (!contact) return CONSENT_WITHDRAWN;
  if (ctx.channel === 'WHATSAPP' && !contact.consentWhatsapp) return CONSENT_WITHDRAWN;
  if (ctx.channel === 'EMAIL' && !contact.consentEmail) return CONSENT_WITHDRAWN;

  if (ctx.channel === 'SMS') {
    // Le modele CRM n'a pas de consentement SMS : memes gardes que les SMS de signature.
    const to = ctx.target ? normalizePhoneE164(ctx.target) : null;
    if (!to || !isAllowedSmsDialCode(to)) return SMS_NOT_ALLOWED;
    if (!(await contactOwnsPhone(ctx.tenantId, contactId, to))) return SMS_NOT_ALLOWED;
    if (!(await hasSmsBudget(ctx.tenantId))) return SMS_NOT_ALLOWED;
  }
  return null;
}
