import { env } from '../../config/env';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { runWithTenantContext } from '../../utils/tenant-context';
import { appendSignatureEventStandalone } from './events';
import { agencyNameOf, commitSignerToken, inviteSigner, prepareSignerToken } from './notify';
import { ACTIVE_REQUEST_STATUSES, INTERNAL_PROVIDER_IDS } from './types';

/**
 * Rappels automatiques avant expiration (spec 044, SG-R11).
 *
 * Pour chaque demande en cours, le plus petit seuil (en jours) atteint
 * s'applique ; un seuil n'est joué qu'une fois (événement `REMINDER_AUTO`
 * `{ threshold }`), et un seuil franchi pendant un arrêt du job n'est rattrapé
 * qu'une fois (le plus petit seuil atteint seul compte, jamais plusieurs d'affilée).
 *
 * Réservation multi-instances : `updateMany` conditionnel sur `lastReminderAt`
 * (nul ou plus ancien que l'intervalle minimal, comme la relance manuelle). Une
 * seule instance l'emporte ; les autres n'envoient rien. L'événement est ajouté
 * juste après l'envoi, bien avant la fin de l'intervalle : au passage suivant,
 * il est visible et le seuil est écarté. Aucun contact, jeton ni lien n'est journalisé.
 */

/** Même intervalle que la relance manuelle (`REMINDER_MIN_INTERVAL_MS` du service). */
const REMINDER_MIN_INTERVAL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 20;

/** Plus petit seuil (jours, liste triée décroissante) dont l'échéance est comprise dans ]now, now + N j]. */
export function applicableThreshold(thresholds: number[], expiresAt: Date, now: Date): number | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) return null;
  let found: number | null = null;
  for (const days of thresholds) {
    if (remaining <= days * DAY_MS && (found === null || days < found)) found = days;
  }
  return found;
}

type DueRequest = {
  id: string;
  tenantId: string;
  title: string;
  language: string;
  sequential: boolean;
  expiresAt: Date;
  signers: Array<{
    id: string;
    fullName: string;
    channel: string;
    contact: string;
    contactId: string | null;
    status: string;
  }>;
};

function targetsOf(request: DueRequest) {
  // Comme la relance manuelle : le signataire courant d'abord (PENDING ou OPENED), puis seuls les PENDING sont relancés.
  const unsigned = request.signers.filter(s => s.status === 'PENDING' || s.status === 'OPENED');
  const candidates = request.sequential ? unsigned.slice(0, 1) : unsigned;
  return candidates.filter(s => s.status === 'PENDING' && s.channel !== 'IN_PERSON');
}

async function alreadyRemindedThresholds(requestIds: string[], tenantIds: string[]): Promise<Map<string, Set<number>>> {
  const done = new Map<string, Set<number>>();
  if (requestIds.length === 0) return done;
  const events = await prisma.signatureEvent.findMany({
    where: { tenantId: { in: tenantIds }, requestId: { in: requestIds }, type: 'REMINDER_AUTO' },
    select: { requestId: true, payload: true }
  });
  for (const event of events) {
    const threshold = (event.payload as { threshold?: unknown } | null)?.threshold;
    if (typeof threshold !== 'number') continue;
    if (!done.has(event.requestId)) done.set(event.requestId, new Set());
    done.get(event.requestId)!.add(threshold);
  }
  return done;
}

/** Réserve, envoie, trace. Rend les compteurs, ou null si la réservation est perdue. */
async function remindOne(request: DueRequest, threshold: number, targets: ReturnType<typeof targetsOf>, now: Date) {
  const maxMs = Math.max(...env.SIGNATURE_REMINDER_DAYS_BEFORE) * DAY_MS;
  const claimed = await prisma.signatureRequest.updateMany({
    where: {
      id: request.id,
      tenantId: request.tenantId,
      status: { in: [...ACTIVE_REQUEST_STATUSES] },
      providerId: { in: [...INTERNAL_PROVIDER_IDS] },
      expiresAt: { gt: now, lte: new Date(now.getTime() + maxMs) },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(now.getTime() - REMINDER_MIN_INTERVAL_MS) } }]
    },
    data: { lastReminderAt: now }
  });
  if (claimed.count !== 1) return null;

  const agencyName = await agencyNameOf(request.tenantId);
  let reminded = 0;
  let failed = 0;
  for (const signer of targets) {
    try {
      const prepared = prepareSignerToken(request.expiresAt, false, now);
      const status = await inviteSigner({ request, signer, token: prepared.token, agencyName, reminder: true });
      if (status === 'SENT' && (await commitSignerToken(request.tenantId, signer.id, prepared))) reminded += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logger.warn('Signature : rappel automatique en échec', {
        requestId: request.id,
        error: error instanceof Error ? error.name : 'inconnue'
      });
    }
  }
  await appendSignatureEventStandalone({
    tenantId: request.tenantId,
    requestId: request.id,
    type: 'REMINDER_AUTO',
    payload: { threshold, reminded, failed },
    now
  });
  await prisma.$transaction(tx =>
    recordAuditEvent(tx, {
      tenantId: request.tenantId,
      actorUserId: null,
      actorType: 'SYSTEM',
      actionKey: AuditActionKey.SIGNATURE_REMINDER_AUTO,
      entityType: 'SignatureRequest',
      entityId: request.id,
      payload: { requestId: request.id, threshold, reminded, failed }
    })
  );
  return { reminded, failed };
}

/** Envoie les rappels échus (tâche planifiée). `requests` : demandes réellement relancées. */
export async function sendDueSignatureReminders(
  now: Date = new Date(),
  batch = 100
): Promise<{ requests: number; reminded: number; failed: number }> {
  const result = { requests: 0, reminded: 0, failed: 0 };
  const thresholds = env.SIGNATURE_REMINDER_DAYS_BEFORE;
  if (thresholds.length === 0) return result;
  const horizon = new Date(now.getTime() + Math.max(...thresholds) * DAY_MS);

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const requests: DueRequest[] = await prisma.signatureRequest.findMany({
      where: {
        status: { in: [...ACTIVE_REQUEST_STATUSES] },
        providerId: { in: [...INTERNAL_PROVIDER_IDS] },
        expiresAt: { gt: now, lte: horizon },
        signers: { some: { status: 'PENDING' } }
      },
      orderBy: { id: 'asc' },
      take: batch,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tenantId: true,
        title: true,
        language: true,
        sequential: true,
        expiresAt: true,
        signers: {
          orderBy: { position: 'asc' },
          select: { id: true, fullName: true, channel: true, contact: true, contactId: true, status: true }
        }
      }
    });
    if (requests.length === 0) break;

    const done = await alreadyRemindedThresholds(
      requests.map(r => r.id),
      [...new Set(requests.map(r => r.tenantId))]
    );
    for (const request of requests) {
      const threshold = applicableThreshold(thresholds, request.expiresAt, now);
      if (threshold === null || done.get(request.id)?.has(threshold)) continue;
      const targets = targetsOf(request);
      if (targets.length === 0) continue;
      try {
        const outcome = await runWithTenantContext({ tenantId: request.tenantId }, () =>
          remindOne(request, threshold, targets, now)
        );
        if (!outcome) continue;
        result.requests += 1;
        result.reminded += outcome.reminded;
        result.failed += outcome.failed;
      } catch (error) {
        logger.error('Signature : rappels automatiques en échec', {
          requestId: request.id,
          error: error instanceof Error ? error.name : 'inconnue'
        });
      }
    }
    if (requests.length < batch) break;
    cursor = requests[requests.length - 1].id;
  }
  return result;
}
