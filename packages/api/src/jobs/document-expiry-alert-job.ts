import * as cron from 'node-cron';

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import { alertExpiringDocuments } from '../lib/patrimoine/notifications';

/**
 * Alerte quotidienne d'expiration des documents patrimoine (`PropertyDocument`).
 *
 * Chaque jour a 7 h UTC, chaque agence active est traitee tour a tour, dans
 * son propre contexte tenant (`runWithTenantContext`) : `alertExpiringDocuments`
 * alerte par e-mail les proprietaires (indivision comprise) des biens dont un
 * document expire dans les 30 prochains jours, en filtrant sur leur
 * consentement e-mail (`CrmContact.consentEmail === true`) -- jamais de
 * destinataire suppose.
 *
 * Anti-doublon : `PropertyDocument.warningSentAt` marque un document deja
 * alerte, reserve de facon atomique avant l'envoi ; un document sans
 * destinataire eligible n'est pas marque et sera retente les jours suivants.
 * Aucune migration nouvelle : la colonne existe deja en base.
 *
 * Isolation : la liste des agences est lue hors contexte tenant (lecture
 * transverse volontaire, comme `newsletter-campaign-scheduler.job.ts`), puis
 * chaque agence est traitee sequentiellement -- jamais en parallele -- dans
 * son propre contexte, pour que le garde-fou multi-tenant
 * (`utils/prisma-tenant-guard-extension.ts`) reste pertinent. Une agence en
 * echec est journalisee et n'empeche pas les suivantes.
 */

let job: cron.ScheduledTask | null = null;

export interface DocumentExpiryAlertReport {
  tenants: number;
  sent: number;
  matched: number;
  skippedNoRecipient: number;
  skippedAlreadySent: number;
  failed: number;
  failedTenants: number;
}

export async function runDocumentExpiryAlerts(now: Date = new Date()): Promise<DocumentExpiryAlertReport> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE', isActive: true },
    select: { id: true }
  });

  const report: DocumentExpiryAlertReport = {
    tenants: tenants.length,
    sent: 0,
    matched: 0,
    skippedNoRecipient: 0,
    skippedAlreadySent: 0,
    failed: 0,
    failedTenants: 0
  };

  for (const tenant of tenants) {
    try {
      const result = await runWithTenantContext({ tenantId: tenant.id }, () =>
        alertExpiringDocuments(tenant.id, { now })
      );
      report.sent += result.sent;
      report.matched += result.matched;
      report.skippedNoRecipient += result.skippedNoRecipient;
      report.skippedAlreadySent += result.skippedAlreadySent;
      report.failed += result.failed;
    } catch (error) {
      report.failedTenants += 1;
      logger.error('Document expiry alert failed for tenant', {
        tenantId: tenant.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info('Document expiry alert run completed', report);
  return report;
}

export function startDocumentExpiryAlertJob(): void {
  if (job) {
    logger.warn('Document expiry alert job is already running');
    return;
  }
  job = cron.schedule(
    '0 7 * * *',
    async () => {
      try {
        await runDocumentExpiryAlerts();
      } catch (error) {
        logger.error('Error in document expiry alert job', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    { timezone: 'UTC' }
  );
  logger.info('Document expiry alert job started (runs daily at 7:00 AM UTC)');
}

export function stopDocumentExpiryAlertJob(): void {
  if (!job) return;
  job.stop();
  job = null;
  logger.info('Document expiry alert job stopped');
}
