import * as cron from 'node-cron';

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import { withTransactionalAdvisoryLock } from '../lib/ai/advisory-lock';
import { isOverdue } from '../lib/syndics/declared-payment/business-days';
import { sendReviewSummary } from '../lib/syndics/declared-payment/notifications';
import { purgeExpiredProofReads } from '../lib/syndics/declared-payment/proof-files';
import { getDeclaredPaymentRules } from '../lib/syndics/declared-payment/settings';

/**
 * Tâches du paiement mobile money déclaré (spec 047, D12).
 *
 * 1. **Chaque heure** : récapitulatif aux gestionnaires des déclarations arrivées
 *    pendant l'heure écoulée (regroupement : un message par copropriété, jamais un
 *    par déclaration), puis purge des captures temporaires des lectures IA expirées.
 *    La fenêtre est l'heure pleine précédente `[H-1, H[` ; une heure où le serveur était arrêté
 *    n'est pas rattrapée (le résumé quotidien reprend alors les déclarations en retard).
 *
 * IDEMPOTENCE ENTRE INSTANCES : chaque récapitulatif (une copropriété, une heure ou un jour) prend un
 * verrou consultatif PostgreSQL de transaction, relit un `NotificationMarker` et, s'il n'existe pas,
 * envoie PUIS le pose. Deux instances qui se déclenchent à la même seconde se suivent : la seconde voit
 * le marqueur et n'envoie rien. Un envoi qui n'a joint personne ne pose pas de marqueur (il peut être
 * retenté). Hors de cette garde, rien n'empêche un rejeu : le marqueur est la seule mémoire.
 * 2. **Chaque jour à 8 h (Africa/Abidjan)** : alerte « en retard » pour les copropriétés
 *    dont une déclaration attend depuis au moins `reviewAlertBusinessDays` jours ouvrés.
 *
 * Lectures TRANSVERSES assumées pour trouver les copropriétés concernées (c'est la
 * tâche elle-même qui doit voir toutes les agences, comme `stock-maintenance-job.ts`),
 * puis traitement UNE AGENCE À LA FOIS dans `runWithTenantContext` pour que la garde
 * Prisma reste active. Un échec sur une agence n'arrête pas les autres.
 */

let hourlyJob: cron.ScheduledTask | null = null;
let dailyJob: cron.ScheduledTask | null = null;
let hourlyRunning = false;
let dailyRunning = false;

const HOUR_MS = 60 * 60 * 1000;
/** `NotificationMarker.kind` des récapitulatifs envoyés (anti-doublon entre instances). */
export const REVIEW_SUMMARY_MARKER_KIND = 'SYNDIC_DECLARED_REVIEW_SUMMARY_SENT';
const MARKER_ENTITY_TYPE = 'SYNDICATE';
const LOCK_TIMEOUT_MS = 120_000;

export interface DeclarationJobReport {
  syndicates: number;
  summariesSent: number;
  failed: number;
}

interface PendingGroup {
  tenantId: string;
  syndicateId: string;
}

/** Début de l'heure pleine qui contient `now` (UTC). */
export function startOfHour(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/** Copropriétés (par agence) qui ont des déclarations `PENDING` : lecture transverse assumée. */
async function listPendingGroups(extra: { createdAt?: { gte: Date; lt: Date } } = {}): Promise<PendingGroup[]> {
  return prisma.syndicPaymentDeclaration.findMany({
    where: { status: 'PENDING', ...extra },
    distinct: ['tenantId', 'syndicateId'],
    select: { tenantId: true, syndicateId: true }
  });
}

/** Comptes de la copropriété : toutes les `PENDING` et celles en retard selon son délai. */
async function countPending(tenantId: string, syndicateId: string, now: Date) {
  const rules = await getDeclaredPaymentRules(prisma, tenantId, syndicateId);
  const pending = await prisma.syndicPaymentDeclaration.findMany({
    where: { tenantId, syndicateId, status: 'PENDING' },
    select: { createdAt: true }
  });
  return {
    pendingCount: pending.length,
    overdueCount: pending.filter(row => isOverdue(row.createdAt, rules.reviewAlertBusinessDays, now)).length
  };
}

async function summarize(
  group: PendingGroup,
  now: Date,
  options: { onlyIfOverdue: boolean; markerId: string },
  report: DeclarationJobReport
): Promise<void> {
  await withTransactionalAdvisoryLock(
    `syndic-declared-summary:${group.tenantId}:${options.markerId}`,
    async tx => {
      const marker = await tx.notificationMarker.findFirst({
        where: {
          tenantId: group.tenantId,
          kind: REVIEW_SUMMARY_MARKER_KIND,
          entityType: MARKER_ENTITY_TYPE,
          entityId: options.markerId
        },
        select: { id: true }
      });
      if (marker) return;
      const delivered = await sendSummaryOnce(group, now, options, report);
      if (delivered > 0) {
        await tx.notificationMarker.create({
          data: {
            tenantId: group.tenantId,
            kind: REVIEW_SUMMARY_MARKER_KIND,
            entityType: MARKER_ENTITY_TYPE,
            entityId: options.markerId
          }
        });
      }
    },
    { timeoutMs: LOCK_TIMEOUT_MS }
  );
}

async function sendSummaryOnce(
  group: PendingGroup,
  now: Date,
  options: { onlyIfOverdue: boolean },
  report: DeclarationJobReport
): Promise<number> {
  const { pendingCount, overdueCount } = await countPending(group.tenantId, group.syndicateId, now);
  if (pendingCount === 0 || (options.onlyIfOverdue && overdueCount === 0)) return 0;
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: group.syndicateId, tenantId: group.tenantId },
    select: { name: true }
  });
  const delivered = await sendReviewSummary({
    tenantId: group.tenantId,
    syndicateId: group.syndicateId,
    syndicName: syndicate?.name ?? '',
    pendingCount,
    overdueCount
  });
  if (delivered > 0) report.summariesSent += 1;
  return delivered;
}

async function runGroups(
  groups: PendingGroup[],
  now: Date,
  options: { onlyIfOverdue: boolean; markerOf: (group: PendingGroup) => string }
): Promise<DeclarationJobReport> {
  const report: DeclarationJobReport = { syndicates: groups.length, summariesSent: 0, failed: 0 };
  for (const group of groups) {
    try {
      await runWithTenantContext({ tenantId: group.tenantId }, () =>
        summarize(group, now, { onlyIfOverdue: options.onlyIfOverdue, markerId: options.markerOf(group) }, report)
      );
    } catch (error) {
      report.failed += 1;
      logger.error('[declared-payment] récapitulatif impossible pour une copropriété', {
        tenantId: group.tenantId,
        syndicateId: group.syndicateId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return report;
}

/** Passage horaire : déclarations arrivées pendant l'heure pleine précédente, puis purge des lectures expirées. */
export async function runHourlyDeclarationBatch(now: Date = new Date()): Promise<DeclarationJobReport> {
  const windowEnd = startOfHour(now);
  const windowStart = new Date(windowEnd.getTime() - HOUR_MS);
  const groups = await listPendingGroups({ createdAt: { gte: windowStart, lt: windowEnd } });
  const report = await runGroups(groups, now, {
    onlyIfOverdue: false,
    markerOf: group => `${group.syndicateId}|hour|${windowStart.toISOString()}`
  });
  try {
    const purged = await purgeExpiredProofReads(now);
    if (purged > 0) logger.info('[declared-payment] captures temporaires expirées purgées', { purged });
  } catch (error) {
    logger.error('[declared-payment] purge des captures temporaires en échec', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return report;
}

/** Passage quotidien : alerte pour les copropriétés qui ont des déclarations en retard. */
export async function runDailyOverdueAlert(now: Date = new Date()): Promise<DeclarationJobReport> {
  const groups = await listPendingGroups();
  // Jour civil d'Africa/Abidjan (UTC+0, sans changement d'heure).
  const day = now.toISOString().slice(0, 10);
  return runGroups(groups, now, { onlyIfOverdue: true, markerOf: group => `${group.syndicateId}|day|${day}` });
}

export function startSyndicDeclaredPaymentJob(): void {
  if (hourlyJob || dailyJob) {
    logger.warn('Syndic declared payment job is already running');
    return;
  }
  hourlyJob = cron.schedule(
    '0 * * * *',
    async () => {
      if (hourlyRunning) return;
      hourlyRunning = true;
      try {
        const report = await runHourlyDeclarationBatch();
        if (report.syndicates > 0) logger.info('[declared-payment] passage horaire terminé', report);
      } catch (error) {
        logger.error('Error in syndic declared payment hourly job', {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        hourlyRunning = false;
      }
    },
    { timezone: 'UTC' }
  );
  dailyJob = cron.schedule(
    '0 8 * * *',
    async () => {
      if (dailyRunning) return;
      dailyRunning = true;
      try {
        const report = await runDailyOverdueAlert();
        if (report.summariesSent > 0 || report.failed > 0) {
          logger.info('[declared-payment] alerte quotidienne terminée', report);
        }
      } catch (error) {
        logger.error('Error in syndic declared payment daily job', {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        dailyRunning = false;
      }
    },
    { timezone: 'Africa/Abidjan' }
  );
  logger.info('Syndic declared payment job started (hourly summary, daily overdue alert at 8:00 Africa/Abidjan)');
}

export function stopSyndicDeclaredPaymentJob(): void {
  hourlyJob?.stop();
  dailyJob?.stop();
  hourlyJob = null;
  dailyJob = null;
  logger.info('Syndic declared payment job stopped');
}
