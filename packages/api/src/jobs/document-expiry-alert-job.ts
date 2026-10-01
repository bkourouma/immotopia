import * as cron from 'node-cron';

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import {
  alertExpiringDocuments,
  alertExpiringLeases,
  alertLoanMaturity,
  alertUpcomingWorks
} from '../lib/patrimoine/notifications';
import { runInsuranceAlerts } from '../lib/patrimoine/insurance-alerts';

/**
 * Alertes quotidiennes d'echeance patrimoine (lot P0, etendu lot P3).
 *
 * Chaque jour a 7 h UTC, chaque agence active est traitee tour a tour, dans
 * son propre contexte tenant (`runWithTenantContext`), par cinq alertes
 * independantes (une agence dont l'une echoue continue avec les autres, voir
 * plus bas) :
 *
 * - `alertExpiringDocuments` : documents patrimoine (`PropertyDocument`)
 *   expirant sous 30 jours, tous types confondus -- assurance comprise, sans
 *   filtre sur `documentType`. Alerte les proprietaires (indivision
 *   comprise), sur UN canal chacun (e-mail ou WhatsApp, routeur
 *   `notification-channels.ts`) : consentement du contact
 *   (`consentEmail` / `consentWhatsapp === true`) ET evenement active par
 *   l'agence sur ce canal. L'e-mail reste actif par defaut ; la cle WhatsApp
 *   `OWNER_DOCUMENT_EXPIRY_ALERT` est OPT-IN (desactivee sans ligne de config).
 * - `alertExpiringLeases` : baux actifs dont `end_date` approche. Meme
 *   destinataires (proprietaires), memes regles de consentement et de canaux
 *   (cle WhatsApp `OWNER_LEASE_ENDING_SOON`, opt-in).
 * - `alertLoanMaturity` : emprunts actifs dont `endDate` approche. Alerte
 *   l'agence (administrateurs actifs), pas le proprietaire -- alerte
 *   operationnelle interne, aucun consentement CRM a verifier.
 * - `alertUpcomingWorks` : programmes de travaux planifies dont
 *   `plannedDate` approche. Memes destinataires internes que
 *   `alertLoanMaturity`.
 * - `runInsuranceAlerts` (lot B1, spec 032) : polices d'assurance dont
 *   `endDate` approche, prochaine echeance d'entretien et fin de garantie du
 *   carnet d'entretien. Memes destinataires internes, cle e-mail
 *   `INSURANCE_DEADLINE_ALERT`, anti-doublon par `AuditLog`
 *   (voir `lib/patrimoine/insurance-alerts.ts`).
 *
 * Anti-doublon : `PropertyDocument.warningSentAt` (colonne existante,
 * reservee de facon atomique) pour les documents ; les autres
 * s'appuient sur `AuditLog` en l'absence de colonne dediee -- voir le
 * commentaire de tete de `lib/patrimoine/notifications.ts` pour le detail et
 * la limite assumee (pas d'atomicite entre lecture et ecriture, acceptable
 * ici car sequentiel, une agence a la fois).
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

/** Cumule le resultat d'une des cinq alertes dans le rapport agrege. */
function accumulate(
  report: DocumentExpiryAlertReport,
  result: { sent: number; matched: number; skippedNoRecipient: number; skippedAlreadySent: number; failed: number }
): void {
  report.sent += result.sent;
  report.matched += result.matched;
  report.skippedNoRecipient += result.skippedNoRecipient;
  report.skippedAlreadySent += result.skippedAlreadySent;
  report.failed += result.failed;
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
      // Sequentiel a l'interieur d'une meme agence aussi : chaque alerte
      // envoie ses propres e-mails et pose sa propre marque anti-doublon,
      // pas besoin de les paralleliser pour une seule agence a la fois.
      await runWithTenantContext({ tenantId: tenant.id }, async () => {
        accumulate(report, await alertExpiringDocuments(tenant.id, { now }));
        accumulate(report, await alertExpiringLeases(tenant.id, { now }));
        accumulate(report, await alertLoanMaturity(tenant.id, { now }));
        accumulate(report, await alertUpcomingWorks(tenant.id, { now }));
        accumulate(report, await runInsuranceAlerts(tenant.id, { now }));
      });
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
