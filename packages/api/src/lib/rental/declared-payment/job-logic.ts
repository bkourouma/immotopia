import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { runWithTenantContext } from '../../../utils/tenant-context';
import { withTransactionalAdvisoryLock } from '../../ai/advisory-lock';
import { isOverdue } from '../../payment-proof/business-days';
import { sendOverdueAlert, sendReviewSummary, type RentalDeclarationDigestLine } from './notifications';
import { loadDeclaredPaymentSettings } from './settings';
import { purgeExpiredProofReads } from './proof-read-purge';

/**
 * Logique des tâches du paiement de loyer déclaré (contrat §1.7), séparée du
 * planificateur pour être testable.
 *
 * 1. Chaque heure : récapitulatif groupé (UN message par agence, jamais un par
 *    déclaration) des déclarations arrivées pendant l'heure pleine précédente
 *    `[H-1, H[`, puis purge des lectures IA expirées.
 * 2. Chaque jour à 8 h Africa/Abidjan : alerte des déclarations PENDING en retard
 *    (au moins `reviewAlertBusinessDays` jours ouvrés) ; `review_alerted_at` est
 *    posée sur celles qui viennent d'être signalées.
 *
 * Anti-doublon entre instances : verrou consultatif de transaction + relecture d'un
 * `NotificationMarker`, posé APRÈS un envoi réussi (un envoi qui n'a joint personne
 * n'en pose pas : il peut être retenté). Lectures transverses assumées pour trouver
 * les agences concernées, puis traitement UNE AGENCE À LA FOIS dans
 * `runWithTenantContext` (la garde Prisma reste active).
 */

const HOUR_MS = 60 * 60 * 1000;
const LOCK_TIMEOUT_MS = 120_000;

export const RENTAL_REVIEW_SUMMARY_MARKER_KIND = 'RENTAL_DECLARED_REVIEW_SUMMARY_SENT';
export const RENTAL_OVERDUE_ALERT_MARKER_KIND = 'RENTAL_DECLARED_OVERDUE_ALERT_SENT';
const MARKER_ENTITY_TYPE = 'TENANT';

export interface RentalDeclarationJobReport {
  tenants: number;
  summariesSent: number;
  failed: number;
}

/** Début de l'heure pleine qui contient `now` (UTC). */
export function startOfHour(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

const toLine = (row: { amount: unknown; created_at: Date }): RentalDeclarationDigestLine => ({
  amount: Number(row.amount),
  createdAt: row.created_at
});

/** Exécute `send` une seule fois par `markerId` (verrou + marqueur). */
async function sendOnce(
  tenantId: string,
  markerKind: string,
  markerId: string,
  send: () => Promise<number>
): Promise<number> {
  let delivered = 0;
  await withTransactionalAdvisoryLock(
    `rental-declared:${markerKind}:${tenantId}:${markerId}`,
    async tx => {
      const marker = await tx.notificationMarker.findFirst({
        where: { tenantId, kind: markerKind, entityType: MARKER_ENTITY_TYPE, entityId: markerId },
        select: { id: true }
      });
      if (marker) return;
      delivered = await send();
      if (delivered > 0) {
        await tx.notificationMarker.create({
          data: { tenantId, kind: markerKind, entityType: MARKER_ENTITY_TYPE, entityId: markerId }
        });
      }
    },
    { timeoutMs: LOCK_TIMEOUT_MS }
  );
  return delivered;
}

async function hourlySummaryForTenant(tenantId: string, windowStart: Date): Promise<number> {
  const markerId = `${tenantId}|hour|${windowStart.toISOString()}`;
  return sendOnce(tenantId, RENTAL_REVIEW_SUMMARY_MARKER_KIND, markerId, async () => {
    const pending = await prisma.rentalPaymentDeclaration.findMany({
      where: { tenant_id: tenantId, status: 'PENDING' },
      select: { amount: true, created_at: true },
      orderBy: { created_at: 'asc' }
    });
    if (pending.length === 0) return 0;
    return sendReviewSummary({ tenantId, count: pending.length, lines: pending.map(toLine) });
  });
}

/** Passage horaire : récapitulatif des arrivées de l'heure précédente, puis purge des lectures expirées. */
export async function runHourlyDeclarationBatch(now: Date = new Date()): Promise<RentalDeclarationJobReport> {
  const windowEnd = startOfHour(now);
  const windowStart = new Date(windowEnd.getTime() - HOUR_MS);
  const groups = await prisma.rentalPaymentDeclaration.findMany({
    where: { status: 'PENDING', created_at: { gte: windowStart, lt: windowEnd } },
    distinct: ['tenant_id'],
    select: { tenant_id: true }
  });
  const report: RentalDeclarationJobReport = { tenants: groups.length, summariesSent: 0, failed: 0 };
  for (const { tenant_id: tenantId } of groups) {
    try {
      const delivered = await runWithTenantContext({ tenantId }, () => hourlySummaryForTenant(tenantId, windowStart));
      if (delivered > 0) report.summariesSent += 1;
    } catch (error) {
      report.failed += 1;
      logger.error('[rental-declared-payment] récapitulatif impossible pour une agence', {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  try {
    const purged = await purgeExpiredProofReads(now);
    if (purged > 0) logger.info('[rental-declared-payment] lectures temporaires expirées purgées', { purged });
  } catch (error) {
    logger.error('[rental-declared-payment] purge des lectures temporaires en échec', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return report;
}

async function overdueAlertForTenant(tenantId: string, now: Date, day: string): Promise<number> {
  return sendOnce(tenantId, RENTAL_OVERDUE_ALERT_MARKER_KIND, `${tenantId}|day|${day}`, async () => {
    const { reviewAlertBusinessDays } = await loadDeclaredPaymentSettings(tenantId);
    const pending = await prisma.rentalPaymentDeclaration.findMany({
      where: { tenant_id: tenantId, status: 'PENDING' },
      select: { id: true, amount: true, created_at: true },
      orderBy: { created_at: 'asc' }
    });
    const overdue = pending.filter(row => isOverdue(row.created_at, reviewAlertBusinessDays, now));
    if (overdue.length === 0) return 0;
    const delivered = await sendOverdueAlert({
      tenantId,
      count: overdue.length,
      days: reviewAlertBusinessDays,
      lines: overdue.map(toLine)
    });
    if (delivered > 0) {
      await prisma.rentalPaymentDeclaration.updateMany({
        where: { tenant_id: tenantId, id: { in: overdue.map(row => row.id) }, review_alerted_at: null },
        data: { review_alerted_at: now }
      });
    }
    return delivered;
  });
}

/** Passage quotidien : alerte des agences qui ont des déclarations en retard. */
export async function runDailyOverdueAlert(now: Date = new Date()): Promise<RentalDeclarationJobReport> {
  const groups = await prisma.rentalPaymentDeclaration.findMany({
    where: { status: 'PENDING' },
    distinct: ['tenant_id'],
    select: { tenant_id: true }
  });
  // Jour civil d'Africa/Abidjan (UTC+0, sans changement d'heure).
  const day = now.toISOString().slice(0, 10);
  const report: RentalDeclarationJobReport = { tenants: groups.length, summariesSent: 0, failed: 0 };
  for (const { tenant_id: tenantId } of groups) {
    try {
      const delivered = await runWithTenantContext({ tenantId }, () => overdueAlertForTenant(tenantId, now, day));
      if (delivered > 0) report.summariesSent += 1;
    } catch (error) {
      report.failed += 1;
      logger.error('[rental-declared-payment] alerte de retard impossible pour une agence', {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return report;
}
