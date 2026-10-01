import * as cron from 'node-cron';

import { env } from '../config/env';
import { OWNER_STATEMENT_COMPUTATION_VERSION } from '../lib/patrimoine/owner-statement-computation';
import { sendOwnerMonthlyReport } from '../lib/patrimoine/notifications';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';

/**
 * Rapport mensuel propriétaire (lot A3) : envoie à chaque propriétaire, avec un
 * lien sécurisé, son relevé du MOIS PRÉCÉDENT.
 *
 * Fichier distinct de `document-expiry-alert-job.ts` : cadence (quotidienne mais
 * utile seulement les 10 premiers jours du mois) et activation (coupée par
 * défaut, `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED`) différentes de celles des
 * alertes d'échéance, qui tournent toujours.
 *
 * Fenêtre : le cron passe chaque jour à 8 h UTC mais n'agit que du 1er au 10 du
 * mois (UTC). Une agence ou un propriétaire sans canal éligible un jour est
 * retenté les jours suivants de la fenêtre, jamais après : au-delà du 10, le
 * rapport du mois précédent n'est plus envoyé automatiquement (l'agence garde le
 * bouton d'envoi manuel).
 *
 * Sélection : relevés `OwnerStatement` de la période `YYYY-MM` du mois précédent,
 * statut différent de DRAFT, calcul à la version courante, agence ACTIVE. Le
 * relevé déjà envoyé (AuditLog `PATRIMOINE_OWNER_MONTHLY_REPORT_SENT`) est
 * ignoré par `sendOwnerMonthlyReport` : le job n'envoie jamais deux fois le même
 * relevé (l'envoi manuel, lui, peut forcer). La clé d'événement
 * `OWNER_MONTHLY_REPORT_SENT` est respectée par canal (e-mail, WhatsApp).
 *
 * Isolation : comme `document-expiry-alert-job.ts`, la liste des agences est lue
 * hors contexte tenant, puis chaque agence est traitée séquentiellement dans
 * `runWithTenantContext` ; une agence en échec n'arrête pas les suivantes.
 */

/** Dernier jour du mois (UTC) où le rapport du mois précédent part encore automatiquement. */
export const MONTHLY_REPORT_WINDOW_LAST_DAY = 10;

let job: cron.ScheduledTask | null = null;

export interface OwnerMonthlyReportRunReport {
  /** Faux hors fenêtre des 10 premiers jours : rien n'a été lu ni envoyé. */
  inWindow: boolean;
  period: string;
  tenants: number;
  statements: number;
  sent: number;
  skippedAlreadySent: number;
  /** Aucun canal éligible ou événement désactivé. */
  skippedNoChannel: number;
  /** Tous les canaux éligibles ont échoué à l'envoi (fournisseur indisponible…). */
  sendFailed: number;
  /** Relevé dont le traitement a levé une erreur : les suivants de l'agence continuent. */
  failedStatements: number;
  failedTenants: number;
}

/** Période `YYYY-MM` du mois précédent `now` (UTC, comme la borne financière du lot). */
export function previousMonthPeriod(now: Date): string {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function processTenant(tenantId: string, period: string, report: OwnerMonthlyReportRunReport) {
  const statements = await prisma.ownerStatement.findMany({
    where: {
      tenantId,
      period,
      status: { not: 'DRAFT' },
      computationVersion: OWNER_STATEMENT_COMPUTATION_VERSION
    },
    select: { id: true }
  });
  report.statements += statements.length;

  for (const statement of statements) {
    // Un relevé en erreur n'interrompt pas les suivants de l'agence.
    try {
      // Sans `force` : l'anti-doublon mensuel s'applique.
      const result = await sendOwnerMonthlyReport(statement.id, tenantId);
      if (result.sent) report.sent += 1;
      else if (result.reason === 'ALREADY_SENT') report.skippedAlreadySent += 1;
      else if (result.reason === 'SEND_FAILED') report.sendFailed += 1;
      else report.skippedNoChannel += 1;
    } catch (error) {
      report.failedStatements += 1;
      logger.error('Owner monthly report failed for statement', {
        tenantId,
        statementId: statement.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function runOwnerMonthlyReports(now: Date = new Date()): Promise<OwnerMonthlyReportRunReport> {
  const period = previousMonthPeriod(now);
  const report: OwnerMonthlyReportRunReport = {
    inWindow: now.getUTCDate() <= MONTHLY_REPORT_WINDOW_LAST_DAY,
    period,
    tenants: 0,
    statements: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedNoChannel: 0,
    sendFailed: 0,
    failedStatements: 0,
    failedTenants: 0
  };
  if (!report.inWindow) return report;

  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE', isActive: true },
    select: { id: true }
  });
  report.tenants = tenants.length;

  for (const tenant of tenants) {
    try {
      await runWithTenantContext({ tenantId: tenant.id }, () => processTenant(tenant.id, period, report));
    } catch (error) {
      report.failedTenants += 1;
      logger.error('Owner monthly report failed for tenant', {
        tenantId: tenant.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info('Owner monthly report run completed', report);
  return report;
}

export function startOwnerMonthlyReportJob(): void {
  if (!env.PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED) {
    logger.info('Owner monthly report job disabled (PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED=false)');
    return;
  }
  if (job) {
    logger.warn('Owner monthly report job is already running');
    return;
  }
  job = cron.schedule(
    '0 8 * * *',
    async () => {
      try {
        await runOwnerMonthlyReports();
      } catch (error) {
        logger.error('Error in owner monthly report job', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    { timezone: 'UTC' }
  );
  logger.info('Owner monthly report job started (runs daily at 8:00 AM UTC, acts on days 1-10 of the month)');
}

export function stopOwnerMonthlyReportJob(): void {
  if (!job) return;
  job.stop();
  job = null;
  logger.info('Owner monthly report job stopped');
}
