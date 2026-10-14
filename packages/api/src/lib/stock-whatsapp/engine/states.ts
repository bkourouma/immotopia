import type { Prisma, StockWhatsappSessionCloseReason, StockWhatsappSessionState } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { getWhatsappTransport } from '../transport';
import type { OutboundMessage } from '../types';

/**
 * Machine à états de la session (lot 041, spec W4, §7) : verrou, transitions
 * conditionnelles, envoi.
 *
 * - Chaque transition est une mise à jour CONDITIONNELLE (`updateMany … WHERE
 *   state IN (…) AND closed_at IS NULL`) dont on compte les lignes : deux
 *   messages ou deux tâches simultanés n'appliquent jamais deux fois la même
 *   transition (W4-R4, W10-R4).
 * - Les messages d'un même chef sont traités un par un : verrou consultatif de
 *   transaction `stock-whatsapp-registration:<id>` pris pour chaque
 *   transition (W4-R9). AUCUN verrou ni transaction n'est tenu pendant l'appel
 *   à l'IA ni pendant un envoi.
 */

/** États où le bot attend une réponse du chef (relance M23, W4-R5). */
export const WAITING_STATES: StockWhatsappSessionState[] = [
  'AWAITING_SITE',
  'AWAITING_ITEM',
  'AWAITING_CONFIRMATION',
  'AWAITING_MERGE'
];

export const OPEN_STATES: StockWhatsappSessionState[] = [
  'AWAITING_SITE',
  'ANALYZING',
  'AWAITING_ITEM',
  'AWAITING_CONFIRMATION',
  'AWAITING_MERGE',
  'READY'
];

/** Délais de la session (W4-R5). */
export const REMINDER_AFTER_MS = 10 * 60 * 1000;
export const EXPIRE_AFTER_MS = 30 * 60 * 1000;

/** Ce qu'une session sait d'elle-même, relu sous verrou. */
export const SESSION_SELECT = {
  id: true,
  tenantId: true,
  registrationId: true,
  state: true,
  siteId: true,
  locationId: true,
  countId: true,
  pendingCaptureId: true,
  lastInboundAt: true,
  reminderSentAt: true,
  closedAt: true
} as const;

export type SessionRow = {
  id: string;
  tenantId: string;
  registrationId: string;
  state: StockWhatsappSessionState;
  siteId: string | null;
  locationId: string | null;
  countId: string | null;
  pendingCaptureId: string | null;
  lastInboundAt: Date;
  reminderSentAt: Date | null;
  closedAt: Date | null;
};

/** Destinataire d'un message du bot et cible de son journal. */
export type ChefTarget = {
  tenantId: string;
  registrationId: string;
  userId: string;
  phoneE164: string;
};

export function registrationLockKey(registrationId: string): string {
  return `stock-whatsapp-registration:${registrationId}`;
}

/** Transaction courte sous le verrou consultatif de l'inscription (W4-R9). */
export async function withRegistrationLock<T>(
  registrationId: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${registrationLockKey(registrationId)}, 0))`;
    return fn(tx);
  });
}

/** Session ouverte d'une inscription (au plus une, index unique partiel). */
export async function findOpenSession(
  db: PrismaTransactionClient | typeof prisma,
  tenantId: string,
  registrationId: string
): Promise<SessionRow | null> {
  return db.stockWhatsappSession.findFirst({
    where: { tenantId, registrationId, closedAt: null },
    select: SESSION_SELECT
  });
}

/** Transition conditionnelle : vrai si CETTE mise à jour l'a appliquée. */
export async function transitionSession(
  tx: PrismaTransactionClient,
  session: Pick<SessionRow, 'id' | 'tenantId'>,
  from: readonly StockWhatsappSessionState[],
  data: Prisma.StockWhatsappSessionUncheckedUpdateManyInput,
  extraWhere: Prisma.StockWhatsappSessionWhereInput = {}
): Promise<boolean> {
  const updated = await tx.stockWhatsappSession.updateMany({
    where: { id: session.id, tenantId: session.tenantId, closedAt: null, state: { in: [...from] }, ...extraWhere },
    data
  });
  return updated.count === 1;
}

/** Ferme la session (conditionnel sur `closedAt` nul). */
export async function closeSessionRow(
  tx: PrismaTransactionClient,
  session: Pick<SessionRow, 'id' | 'tenantId'>,
  reason: StockWhatsappSessionCloseReason,
  now: Date,
  countOutcome: 'COUNTED' | 'LEFT_OPEN' | 'NONE' | null = null
): Promise<boolean> {
  const updated = await tx.stockWhatsappSession.updateMany({
    where: { id: session.id, tenantId: session.tenantId, closedAt: null },
    data: { state: 'CLOSED', closedAt: now, closeReason: reason, pendingCaptureId: null, countOutcome }
  });
  return updated.count === 1;
}

/**
 * Abandonne la capture en attente d'une session (`EXPIRED` par défaut) : seule
 * une capture encore `RECEIVED` ou `PENDING` change. Vrai si une capture a été
 * abandonnée.
 */
export async function abandonPendingCapture(
  tx: PrismaTransactionClient,
  session: Pick<SessionRow, 'tenantId' | 'pendingCaptureId'>,
  outcome: 'EXPIRED' | 'CANCELLED' = 'EXPIRED'
): Promise<boolean> {
  if (!session.pendingCaptureId) return false;
  const updated = await tx.stockFieldCapture.updateMany({
    where: { id: session.pendingCaptureId, tenantId: session.tenantId, outcome: { in: ['RECEIVED', 'PENDING'] } },
    data: { outcome }
  });
  return updated.count === 1;
}

/**
 * Envoie un message au chef par le transport configuré (W1). Ne lève jamais :
 * un échec d'envoi est journalisé par le transport et ne défait pas l'état
 * (W1-R7). Le numéro n'apparaît jamais dans le journal technique.
 */
export async function sendToChef(
  target: ChefTarget,
  sessionId: string | null,
  message: OutboundMessage,
  captureId: string | null = null
): Promise<void> {
  try {
    await getWhatsappTransport().send({
      toE164: target.phoneE164,
      message,
      log: { tenantId: target.tenantId, registrationId: target.registrationId, sessionId, captureId }
    });
  } catch (error) {
    logger.error('Inventaire WhatsApp : envoi au chef impossible', {
      tenantId: target.tenantId,
      registrationId: target.registrationId,
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
}

/** Envoie une suite de messages, dans l'ordre. */
export async function sendAllToChef(
  target: ChefTarget,
  outgoing: ReadonlyArray<{ sessionId: string | null; message: OutboundMessage; captureId?: string | null }>
): Promise<void> {
  for (const entry of outgoing) {
    await sendToChef(target, entry.sessionId, entry.message, entry.captureId ?? null);
  }
}
