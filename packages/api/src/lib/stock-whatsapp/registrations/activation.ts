import crypto from 'crypto';
import { env } from '../../../config/env';
import { hashesMatch } from '../../secure-links/token';
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
 * HMAC-SHA256 à clé serveur (`activationCodeHash`), comparée à temps constant
 * (`hashesMatch`). 72 heures, 5 essais ; au 5e échec ou après l'échéance : M04
 * et audit `STOCK_WHATSAPP_ACTIVATION_LOCKED` (une fois).
 *
 * L'essai est RÉSERVÉ avant toute comparaison (`reserveAttempt`) : la limite de
 * 5 tient même sous des messages simultanés. Toutes les écritures sont
 * conditionnelles : deux messages simultanés n'activent pas deux fois.
 */

export const ACTIVATION_MAX_ATTEMPTS = 5;
export const ACTIVATION_VALIDITY_MS = 72 * 60 * 60 * 1000;
export const ACTIVATION_CODE_LENGTH = 6;

/**
 * Clé HMAC des codes d'activation, DÉRIVÉE de `JWT_SECRET` (secret serveur
 * obligatoire, au moins 32 caractères, contrôlé au démarrage par `env.ts`) :
 * aucune variable de plus. La dérivation par une étiquette propre sépare les
 * usages : la clé de signature des jetons n'est jamais employée telle quelle.
 * Une empreinte SHA-256 sans secret se retrouvait en un million d'essais hors
 * ligne (six chiffres) à partir d'une copie de la base ; avec le HMAC, il faut
 * aussi le secret du serveur.
 *
 * Conséquence assumée : changer `JWT_SECRET` invalide les codes en attente
 * (l'administrateur régénère le code). De même, une inscription en attente
 * créée avant ce changement porte une empreinte SHA-256 qui ne correspond plus :
 * régénérer le code suffit.
 */
function activationKey(): Buffer {
  return crypto.createHmac('sha256', env.JWT_SECRET).update('immotopia:stock-whatsapp:activation-code:v1').digest();
}

/** Empreinte stockée d'un code (W3-R6) : HMAC-SHA256 hexadécimal (64 caractères). */
export function activationCodeHash(code: string, registrationId: string): string {
  return crypto.createHmac('sha256', activationKey()).update(`${code}:${registrationId}`, 'utf8').digest('hex');
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

type AttemptOutcome = { kind: 'LOCKED' } | { kind: 'ACTIVATED' } | { kind: 'WRONG'; attempts: number };

/**
 * Réserve un essai PUIS compare, dans une seule transaction (W3-R7).
 *
 * `UPDATE … SET activation_attempts = activation_attempts + 1 WHERE … AND
 * activation_attempts < 5` : PostgreSQL réévalue la condition sur la ligne à
 * jour après l'attente du verrou, donc cinq réservations au plus réussissent,
 * quel que soit le nombre de messages simultanés. Le verrou de ligne posé par
 * la mise à jour est tenu jusqu'à la fin de la transaction : la relecture qui
 * suit voit exactement le compteur de CET essai et l'empreinte courante (un
 * code régénéré entre-temps est pris en compte). Pas de comparaison sans
 * réservation réussie.
 */
async function reserveAndCheck(registration: PendingRegistration, digits: string, now: Date): Promise<AttemptOutcome> {
  return prisma.$transaction(async tx => {
    const reserved = await tx.stockWhatsappRegistration.updateMany({
      where: {
        id: registration.id,
        tenantId: registration.tenantId,
        status: 'PENDING_ACTIVATION',
        activationAttempts: { lt: ACTIVATION_MAX_ATTEMPTS },
        activationExpiresAt: { gt: now }
      },
      data: { activationAttempts: { increment: 1 } }
    });
    if (reserved.count !== 1) return { kind: 'LOCKED' };

    const current = await tx.stockWhatsappRegistration.findFirst({
      where: { id: registration.id, tenantId: registration.tenantId },
      select: { activationAttempts: true, activationCodeHash: true }
    });
    if (!current?.activationCodeHash) return { kind: 'LOCKED' };

    const matches =
      digits.length === ACTIVATION_CODE_LENGTH &&
      hashesMatch(current.activationCodeHash, activationCodeHash(digits, registration.id));
    if (!matches) return { kind: 'WRONG', attempts: current.activationAttempts };

    // Code juste : `ACTIVE`, empreinte effacée, audit critique dans la transaction.
    const updated = await tx.stockWhatsappRegistration.updateMany({
      where: {
        id: registration.id,
        tenantId: registration.tenantId,
        status: 'PENDING_ACTIVATION',
        activationCodeHash: current.activationCodeHash
      },
      data: { status: 'ACTIVE', activatedAt: now, activationCodeHash: null, activationExpiresAt: null }
    });
    if (updated.count !== 1) return { kind: 'LOCKED' };
    await recordAuditEvent(tx, {
      tenantId: registration.tenantId,
      actorUserId: registration.userId,
      actionKey: AuditActionKey.STOCK_WHATSAPP_REGISTRATION_ACTIVATED,
      entityType: 'StockWhatsappRegistration',
      entityId: registration.id,
      payload: { registrationId: registration.id }
    });
    return { kind: 'ACTIVATED' };
  });
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

  const outcome = await reserveAndCheck(registration, digits, now);
  if (outcome.kind === 'ACTIVATED') return send(await welcomeMessage(registration));
  if (outcome.kind === 'LOCKED') return send(botMessages.codeLocked());
  // Seule la réservation qui atteint le maximum audite : une seule fois.
  if (outcome.attempts >= ACTIVATION_MAX_ATTEMPTS) {
    if (outcome.attempts === ACTIVATION_MAX_ATTEMPTS) lockedAudit(registration, 'ATTEMPTS');
    return send(botMessages.codeLocked());
  }
  return send(botMessages.wrongCode(ACTIVATION_MAX_ATTEMPTS - outcome.attempts));
}
