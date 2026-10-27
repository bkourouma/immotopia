import { env } from '../../config/env';
import { t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { normalizePhoneE164 } from '../phone/e164';

/**
 * Garde-fous des SMS de signature (lot S7) : un SMS facture l'agence de la plateforme
 * et ne doit pas servir à joindre un numéro quelconque.
 *  - indicatif pays dans la liste blanche `SMS_ALLOWED_DIAL_CODES` (UEMOA + Guinée) ;
 *  - numéro = l'un des numéros du contact CRM désigné (téléphone, second téléphone, WhatsApp) ;
 *  - plafond quotidien par agence (`SIGNATURE_SMS_DAILY_LIMIT`), compté sur les
 *    événements `INVITE_SENT` et `OTP_SENT` du canal SMS depuis minuit UTC.
 * Aucun numéro n'est journalisé ni placé dans un message d'erreur.
 */

/** Vrai si le numéro E.164 commence par un indicatif autorisé. */
export function isAllowedSmsDialCode(e164: string): boolean {
  const digits = e164.replace(/^\+/, '');
  return env.SMS_ALLOWED_DIAL_CODES.some(code => digits.startsWith(code));
}

/** Vrai si le numéro E.164 est l'un des numéros du contact CRM de l'agence. */
export async function contactOwnsPhone(tenantId: string, contactId: string, e164: string): Promise<boolean> {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { phonePrimary: true, phoneSecondary: true, whatsappNumber: true }
  });
  if (!contact) return false;
  return [contact.phonePrimary, contact.phoneSecondary, contact.whatsappNumber].some(
    raw => typeof raw === 'string' && normalizePhoneE164(raw) === e164
  );
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** SMS de signature déjà remis aujourd'hui (UTC) par l'agence. */
export async function countSmsSentToday(tenantId: string, now: Date = new Date()): Promise<number> {
  return prisma.signatureEvent.count({
    where: {
      tenantId,
      type: { in: ['INVITE_SENT', 'OTP_SENT'] },
      createdAt: { gte: startOfUtcDay(now) },
      payload: { path: ['channel'], equals: 'SMS' }
    }
  });
}

/** Vrai s'il reste au moins `needed` SMS dans le plafond du jour. */
export async function hasSmsBudget(tenantId: string, needed = 1, now: Date = new Date()): Promise<boolean> {
  return (await countSmsSentToday(tenantId, now)) + needed <= env.SIGNATURE_SMS_DAILY_LIMIT;
}

/** Refus 429 clair quand le plafond quotidien serait dépassé. */
export async function assertSmsBudget(tenantId: string, needed = 1, now: Date = new Date()): Promise<void> {
  if (!(await hasSmsBudget(tenantId, needed, now))) {
    throw new AppError(
      t(
        'Le plafond quotidien de SMS de signature est atteint pour votre agence : réessayez demain ou changez de canal.'
      ),
      429,
      'RATE_LIMITED'
    );
  }
}
