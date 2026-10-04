import { runWithLanguage } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { botMessages } from '../bot-messages';
import { chefLanguage, resolveChefAccess } from '../registrations/access';
import { closeSessionCount } from './count-writer';
import {
  abandonPendingCapture,
  closeSessionRow,
  EXPIRE_AFTER_MS,
  REMINDER_AFTER_MS,
  sendToChef,
  SESSION_SELECT,
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
 * Deux exécutions simultanées n'envoient jamais deux fois la même relance ni la
 * même expiration (W10-R4). Lecture transverse assumée hors contexte, puis
 * chaque session dans `runWithTenantContext` et `runWithLanguage` (W10-R2).
 */

type TimerSession = SessionRow & {
  registration: { userId: string; phoneE164: string; user: { preferredLanguage: string | null } };
};

const TIMER_SELECT = {
  ...SESSION_SELECT,
  registration: { select: { userId: true, phoneE164: true, user: { select: { preferredLanguage: true } } } }
} as const;

/** Sessions ouvertes dont une échéance (relance ou expiration) est passée. */
async function loadDueSessions(options: { sessionId?: string; now: Date }): Promise<TimerSession[]> {
  const reminderBefore = new Date(options.now.getTime() - REMINDER_AFTER_MS);
  return prisma.stockWhatsappSession.findMany({
    where: {
      closedAt: null,
      lastInboundAt: { lte: reminderBefore },
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

/** Fermeture sans message après une perte d'accès (W12-R1, W10 critère 2). */
async function closeForLostAccess(session: TimerSession, now: Date): Promise<void> {
  await withRegistrationLock(session.registrationId, async tx => {
    const current = await tx.stockWhatsappSession.findFirst({
      where: { id: session.id, tenantId: session.tenantId, closedAt: null },
      select: SESSION_SELECT
    });
    if (!current) return;
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
    if (!current) return null;
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
  const access = await resolveChefAccess(session.registrationId, { now, tenantId: session.tenantId });
  if (!access.ok) return closeForLostAccess(session, now);
  if (now.getTime() - session.lastInboundAt.getTime() >= EXPIRE_AFTER_MS) return expireSession(session, now);
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
