import { hashesMatch, hashToken } from '../../secure-links/token';
import { logAuditEvent, recordAuditEvent, AuditActionKey } from '../../../services/audit-service';
import { prisma } from '../../../utils/database';
import { botMessages } from '../bot-messages';
import { extractActivationDigits } from '../engine/commands';
import { sendToChef, type ChefTarget } from '../engine/states';
import type { InboundMessage } from '../types';

/**
 * Activation d'une inscription par le code envoyé au bot (lot 041, spec
 * W3-R6, W3-R7, W3-R8, W7-R2).
 *
 * Le chef envoie, depuis SON numéro, un message dont les seuls chiffres forment
 * le code (« 482 913 », « Code 482913 »). Le code n'est stocké qu'en empreinte
 * (`hashToken(code + ':' + id)`), comparée à temps constant (`hashesMatch`).
 * 72 heures, 5 essais ; au 5e échec ou après l'échéance : M04 et audit
 * `STOCK_WHATSAPP_ACTIVATION_LOCKED` (une fois, par mise à jour conditionnelle).
 *
 * Toutes les écritures sont conditionnelles : deux messages simultanés ne
 * consomment pas deux fois le même essai et n'activent pas deux fois.
 */

export const ACTIVATION_MAX_ATTEMPTS = 5;
export const ACTIVATION_VALIDITY_MS = 72 * 60 * 60 * 1000;
export const ACTIVATION_CODE_LENGTH = 6;

/** Empreinte stockée d'un code (W3-R6). */
export function activationCodeHash(code: string, registrationId: string): string {
  return hashToken(`${code}:${registrationId}`);
}

export type PendingRegistration = {
  id: string;
  tenantId: string;
  userId: string;
  phoneE164: string;
  activationCodeHash: string | null;
  activationExpiresAt: Date | null;
  activationAttempts: number;
};

function lockedAudit(registration: PendingRegistration, cause: 'ATTEMPTS' | 'EXPIRED'): void {
  logAuditEvent({
    tenantId: registration.tenantId,
    actorUserId: registration.userId,
    actionKey: AuditActionKey.STOCK_WHATSAPP_ACTIVATION_LOCKED,
    entityType: 'StockWhatsappRegistration',
    entityId: registration.id,
    payload: { registrationId: registration.id, cause }
  });
}

/** Code échu : verrouille (essais portés au maximum) et audite une seule fois. */
async function lockExpired(registration: PendingRegistration): Promise<void> {
  const locked = await prisma.stockWhatsappRegistration.updateMany({
    where: {
      id: registration.id,
      tenantId: registration.tenantId,
      status: 'PENDING_ACTIVATION',
      activationAttempts: { lt: ACTIVATION_MAX_ATTEMPTS }
    },
    data: { activationAttempts: ACTIVATION_MAX_ATTEMPTS }
  });
  if (locked.count === 1) lockedAudit(registration, 'EXPIRED');
}

/** Code juste : `ACTIVE`, empreinte effacée, audit critique dans la transaction. */
async function activate(registration: PendingRegistration, now: Date): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const updated = await tx.stockWhatsappRegistration.updateMany({
      where: {
        id: registration.id,
        tenantId: registration.tenantId,
        status: 'PENDING_ACTIVATION',
        activationAttempts: { lt: ACTIVATION_MAX_ATTEMPTS },
        activationCodeHash: registration.activationCodeHash
      },
      data: { status: 'ACTIVE', activatedAt: now, activationCodeHash: null, activationExpiresAt: null }
    });
    if (updated.count !== 1) return false;
    await recordAuditEvent(tx, {
      tenantId: registration.tenantId,
      actorUserId: registration.userId,
      actionKey: AuditActionKey.STOCK_WHATSAPP_REGISTRATION_ACTIVATED,
      entityType: 'StockWhatsappRegistration',
      entityId: registration.id,
      payload: { registrationId: registration.id }
    });
    return true;
  });
}

/** Code faux : un essai de plus (conditionnel) ; rend le nombre d'essais après, ou `null` si déjà changé. */
async function countFailedAttempt(registration: PendingRegistration): Promise<number | null> {
  const updated = await prisma.stockWhatsappRegistration.updateMany({
    where: {
      id: registration.id,
      tenantId: registration.tenantId,
      status: 'PENDING_ACTIVATION',
      activationAttempts: registration.activationAttempts
    },
    data: { activationAttempts: { increment: 1 } }
  });
  return updated.count === 1 ? registration.activationAttempts + 1 : null;
}

async function welcomeMessage(registration: PendingRegistration) {
  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: registration.userId }, select: { fullName: true } }),
    prisma.tenant.findUnique({ where: { id: registration.tenantId }, select: { name: true } })
  ]);
  return botMessages.activated({ name: user?.fullName?.trim() ?? '', agency: tenant?.name ?? '' });
}

/**
 * Message d'un numéro dont l'inscription attend son activation. La langue est
 * posée par l'appelant (`runWithLanguage`). Aucune session n'est ouverte.
 */
export async function handlePendingRegistrationMessage(
  registration: PendingRegistration,
  message: InboundMessage,
  now: Date = new Date()
): Promise<void> {
  const target: ChefTarget = {
    tenantId: registration.tenantId,
    registrationId: registration.id,
    userId: registration.userId,
    phoneE164: registration.phoneE164
  };
  const send = (outbound: Parameters<typeof sendToChef>[2]) => sendToChef(target, null, outbound);

  const digits = message.kind === 'TEXT' ? extractActivationDigits(message.text) : null;
  if (!digits) return send(botMessages.activationPending());

  const expired = !registration.activationExpiresAt || registration.activationExpiresAt.getTime() <= now.getTime();
  if (!registration.activationCodeHash || registration.activationAttempts >= ACTIVATION_MAX_ATTEMPTS || expired) {
    if (expired) await lockExpired(registration);
    return send(botMessages.codeLocked());
  }

  const matches =
    digits.length === ACTIVATION_CODE_LENGTH &&
    hashesMatch(registration.activationCodeHash, activationCodeHash(digits, registration.id));
  if (matches) {
    if (await activate(registration, now)) return send(await welcomeMessage(registration));
    return send(botMessages.codeLocked());
  }

  let attempts = await countFailedAttempt(registration);
  if (attempts === null) {
    // Un autre message a consommé un essai au même instant : relire.
    const current = await prisma.stockWhatsappRegistration.findFirst({
      where: { id: registration.id, tenantId: registration.tenantId, status: 'PENDING_ACTIVATION' },
      select: { activationAttempts: true }
    });
    if (!current || current.activationAttempts >= ACTIVATION_MAX_ATTEMPTS) return send(botMessages.codeLocked());
    attempts = await countFailedAttempt({ ...registration, activationAttempts: current.activationAttempts });
    if (attempts === null) return send(botMessages.codeLocked());
  }
  if (attempts >= ACTIVATION_MAX_ATTEMPTS) {
    lockedAudit(registration, 'ATTEMPTS');
    return send(botMessages.codeLocked());
  }
  return send(botMessages.wrongCode(ACTIVATION_MAX_ATTEMPTS - attempts));
}
