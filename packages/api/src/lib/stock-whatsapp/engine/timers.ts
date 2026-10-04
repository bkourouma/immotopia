import { env } from '../../../config/env';
import { runWithLanguage } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { botMessages } from '../bot-messages';
import { quotaMonth, releaseWhatsappPhoto } from '../quota';
import { chefLanguage, resolveChefAccess } from '../registrations/access';
import { closeSessionCount } from './count-writer';
import {
  abandonPendingCapture,
  closeSessionRow,
  EXPIRE_AFTER_MS,
  REMINDER_AFTER_MS,
  sendToChef,
  SESSION_SELECT,
  transitionSession,
  WAITING_STATES,
  withRegistrationLock,
  type ChefTarget,
  type SessionRow
} from './states';

/**
 * Relances et expirations des sessions (lot 041, spec W4-R5, W10, W12 ;
 * contrat plan §3.3 : `runSessionTimers`).
 *
 * - 10 minutes sans message, dans un état d'attente, sans relance depuis le
 *   dernier message : M23, une seule fois (`reminderSentAt` posé par mise à
 *   jour conditionnelle `WHERE reminder_sent_at IS NULL`).
 * - 30 minutes : fermeture `TIMEOUT` (conditionnelle `WHERE closed_at IS
 *   NULL`), proposition abandonnée (`EXPIRED`, rien n'est écrit), inventaire
 *   clos si W5-R5 le permet, M24.
 * - Accès perdu entre-temps (agence suspendue, rôle retiré…) : la session se
 *   ferme `ACCESS_LOST`, SANS message (W10, critère 2), inventaire non clos.
 *
 * - Analyse bloquée : session en `ANALYZING` sans mise à jour depuis
 *   `STOCK_VISION_TIMEOUT_MS` + 60 s (processus arrêté pendant l'appel à
 *   l'IA) : capture `FAILED`, place du quota rendue si l'analyse n'a pas
 *   abouti, retour à `READY`, M22 (sans message si la session expire ou se
 *   ferme dans le même passage).
 * - Une échéance n'est appliquée que si elle tient encore SOUS LE VERROU : un
 *   message du chef arrivé entre la lecture et le verrou l'annule.
 *
 * Deux exécutions simultanées n'envoient jamais deux fois la même relance ni la
 * même expiration (W10-R4). Lecture transverse assumée hors contexte, puis
 * chaque session dans `runWithTenantContext` et `runWithLanguage` (W10-R2).
 */

/** Marge au-delà du délai de l'IA avant de tenir une analyse pour bloquée. */
export const ANALYSIS_STUCK_MARGIN_MS = 60 * 1000;

function stuckBefore(now: Date): Date {
  return new Date(now.getTime() - env.STOCK_VISION_TIMEOUT_MS - ANALYSIS_STUCK_MARGIN_MS);
}

type TimerSession = SessionRow & {
  updatedAt: Date;
  registration: { userId: string; phoneE164: string; user: { preferredLanguage: string | null } };
};

const TIMER_SELECT = {
  ...SESSION_SELECT,
  updatedAt: true,
  registration: { select: { userId: true, phoneE164: true, user: { select: { preferredLanguage: true } } } }
} as const;

/** Sessions ouvertes dont une échéance (relance, expiration, analyse bloquée) est passée. */
async function loadDueSessions(options: { sessionId?: string; now: Date }): Promise<TimerSession[]> {
  const reminderBefore = new Date(options.now.getTime() - REMINDER_AFTER_MS);
  return prisma.stockWhatsappSession.findMany({
    where: {
      closedAt: null,
      OR: [
        { lastInboundAt: { lte: reminderBefore } },
        { state: 'ANALYZING', updatedAt: { lte: stuckBefore(options.now) } }
      ],
      ...(options.sessionId ? { id: options.sessionId } : {})
    },
    select: TIMER_SELECT,
    orderBy: { lastInboundAt: 'asc' },
    take: 500
  }) as Promise<TimerSession[]>;
}

function targetOf(session: TimerSession): ChefTarget {
  return {
    tenantId: session.tenantId,
    registrationId: session.registrationId,
    userId: session.registration.userId,
    phoneE164: session.registration.phoneE164
  };
}

/**
 * Analyse bloquée (processus arrêté pendant l'appel à l'IA) : sous verrou,
 * capture `FAILED`, retour à `READY`. La place du quota est rendue si la
 * capture l'avait prise et n'a jamais été analysée (une nouvelle analyse avec
 * article imposé, W9-R2, ne réserve rien). M22 si `notify`.
 */
async function recoverStuckAnalysis(session: TimerSession, now: Date, notify: boolean): Promise<void> {
  const recovered = await withRegistrationLock(session.registrationId, async tx => {
    const current = await tx.stockWhatsappSession.findFirst({
      where: {
        id: session.id,
        tenantId: session.tenantId,
        closedAt: null,
        state: 'ANALYZING',
        updatedAt: { lte: stuckBefore(now) }
      },
      select: SESSION_SELECT
    });
    if (!current) return null;
    const capture = current.pendingCaptureId
      ? await tx.stockFieldCapture.findFirst({
          where: { id: current.pendingCaptureId, tenantId: session.tenantId },
          select: { id: true, outcome: true, quotaCounted: true, analyzedAt: true, receivedAt: true, updatedAt: true }
        })
      : null;
    const giveBack = capture?.outcome === 'PENDING' && capture.quotaCounted && capture.analyzedAt === null;
    if (capture) {
      await tx.stockFieldCapture.updateMany({
        where: { id: capture.id, tenantId: session.tenantId, outcome: { in: ['RECEIVED', 'PENDING'] } },
        data: { outcome: 'FAILED', ...(giveBack ? { quotaCounted: false } : {}) }
      });
    }
    const moved = await transitionSession(tx, current, ['ANALYZING'], {
      state: 'READY',
      pendingCaptureId: null,
      reminderSentAt: null
    });
    if (!moved) return null;
    return {
      captureId: capture?.id ?? null,
      releaseMonth: giveBack && capture ? quotaMonth(capture.updatedAt ?? capture.receivedAt) : null
    };
  });
  if (!recovered) return;
  if (recovered.releaseMonth) await releaseWhatsappPhoto(session.tenantId, recovered.releaseMonth);
  if (notify) await sendToChef(targetOf(session), session.id, botMessages.analysisFailed(), recovered.captureId);
}

/**
 * Fermeture sans message après une perte d'accès (W12-R1, W10 critère 2).
 * Sous verrou : rien n'est fermé si le chef a écrit depuis la lecture (son
 * message traite lui-même le refus, avec M06) ou si l'accès est revenu.
 */
async function closeForLostAccess(session: TimerSession, now: Date): Promise<void> {
  await withRegistrationLock(session.registrationId, async tx => {
    const current = await tx.stockWhatsappSession.findFirst({
      where: { id: session.id, tenantId: session.tenantId, closedAt: null },
      select: SESSION_SELECT
    });
    if (!current || current.lastInboundAt.getTime() !== session.lastInboundAt.getTime()) return;
    const access = await resolveChefAccess(session.registrationId, { db: tx, now, tenantId: session.tenantId });
    if (access.ok) return;
    await abandonPendingCapture(tx, current);
    await closeSessionRow(tx, current, 'ACCESS_LOST', now);
  });
}

/** Expiration à 30 minutes (W4-R5). */
async function expireSession(session: TimerSession, now: Date): Promise<void> {
  const claimed = await withRegistrationLock(session.registrationId, async tx => {
    const current = await tx.stockWhatsappSession.findFirst({
      where: { id: session.id, tenantId: session.tenantId, closedAt: null },
      select: SESSION_SELECT
    });
    // Un message frais arrivé entre la lecture et le verrou relance le délai.
    if (!current || now.getTime() - current.lastInboundAt.getTime() < EXPIRE_AFTER_MS) return null;
    const dropped = await abandonPendingCapture(tx, current);
    const closed = await closeSessionRow(tx, current, 'TIMEOUT', now);
    return closed ? { dropped, countId: current.countId, siteId: current.siteId } : null;
  });
  if (!claimed) return;

  const target = targetOf(session);
  const result = await closeSessionCount({
    tenantId: session.tenantId,
    registrationId: session.registrationId,
    userId: target.userId,
    sessionId: session.id,
    countId: claimed.countId,
    siteId: claimed.siteId
  });
  await prisma.stockWhatsappSession.updateMany({
    where: { id: session.id, tenantId: session.tenantId },
    data: { countOutcome: result.outcome }
  });
  let closedInfo: { site: string; count: number } | null = null;
  if (result.outcome === 'COUNTED' && claimed.siteId) {
    const site = await prisma.constructionSite.findFirst({
      where: { id: claimed.siteId, tenantId: session.tenantId },
      select: { name: true }
    });
    closedInfo = { site: site?.name ?? '', count: result.chefLines };
  }
  await sendToChef(target, session.id, botMessages.expired({ pendingDropped: claimed.dropped, closed: closedInfo }));
}

/** Relance unique à 10 minutes, dans un état d'attente (W4-R5). */
async function remindSession(session: TimerSession, now: Date): Promise<void> {
  if (!WAITING_STATES.includes(session.state) || session.reminderSentAt) return;
  const marked = await prisma.stockWhatsappSession.updateMany({
    where: {
      id: session.id,
      tenantId: session.tenantId,
      closedAt: null,
      reminderSentAt: null,
      state: { in: WAITING_STATES },
      lastInboundAt: session.lastInboundAt
    },
    data: { reminderSentAt: now }
  });
  if (marked.count === 1) await sendToChef(targetOf(session), session.id, botMessages.reminder());
}

async function processSession(session: TimerSession, now: Date): Promise<void> {
  const stuck = session.state === 'ANALYZING' && session.updatedAt.getTime() <= stuckBefore(now).getTime();
  const expiring = now.getTime() - session.lastInboundAt.getTime() >= EXPIRE_AFTER_MS;
  const access = await resolveChefAccess(session.registrationId, { now, tenantId: session.tenantId });
  if (!access.ok) {
    if (stuck) await recoverStuckAnalysis(session, now, false);
    return closeForLostAccess(session, now);
  }
  if (stuck) await recoverStuckAnalysis(session, now, !expiring);
  if (expiring) return expireSession(session, now);
  return remindSession(session, now);
}

/**
 * Passage des minuteries : toutes les sessions dues, ou une seule
 * (`sessionId`, simulateur W13-R5 après avoir reculé `lastInboundAt`).
 * Une session en échec n'empêche pas les suivantes.
 */
export async function runSessionTimers(options: { sessionId?: string; now?: Date } = {}): Promise<void> {
  const now = options.now ?? new Date();
  const sessions = await loadDueSessions({ sessionId: options.sessionId, now });
  for (const session of sessions) {
    try {
      await runWithTenantContext({ tenantId: session.tenantId, userId: session.registration.userId }, () =>
        runWithLanguage(chefLanguage(session.registration.user.preferredLanguage), () => processSession(session, now))
      );
    } catch (error) {
      logger.error('Inventaire WhatsApp : minuterie de session en échec', {
        tenantId: session.tenantId,
        sessionId: session.id,
        error: error instanceof Error ? error.name : 'inconnue'
      });
    }
  }
}
