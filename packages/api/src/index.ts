// Validates required configuration and aborts startup on an unsafe setup.
// Must be imported first so no module reads process.env before validation.
import { env } from './config/env';
import app from './app';
import { startPenaltyCalculationJob } from './jobs/penalty-calculation-job';
import { startOnlinePaymentReconciliationJob } from './jobs/online-payment-reconciliation-job';
import { startLandLeaseAccrualJob } from './jobs/land-lease-accrual-job';
import { startReminderSchedulerJob } from './jobs/reminder-scheduler.job';
import { startNewsletterCampaignSchedulerJob } from './jobs/newsletter-campaign-scheduler.job';
import { startSubscriptionUsageJob } from './jobs/subscription-usage-job';
import { startSyndicChargeCallSchedulerJob } from './jobs/syndic-charge-call-scheduler.job';
import { recoverTenantDataExports } from './services/tenant-data-export/export-service';
import { startTenantDataExportExpiryJob } from './jobs/tenant-data-export-expiry-job';
import { startDocumentExpiryAlertJob } from './jobs/document-expiry-alert-job';
import { startOwnerMonthlyReportJob } from './jobs/owner-monthly-report-job';
import { startLotReconciliationJob } from './jobs/lot-reconciliation-job';
import { startAuditMaintenanceJob } from './jobs/audit-maintenance-job';
import { logger } from './utils/logger';

/**
 * Point d'entree du serveur : ecoute du port et demarrage des jobs planifies.
 *
 * La construction de l'app (middlewares, montage des routeurs) vit dans
 * `app.ts` (lot E, multi-tenant) pour que les tests d'etancheite puissent
 * importer l'app Express sans ouvrir de port ni demarrer de jobs. Ne remettez
 * pas de middleware ou de routeur ici : ajoutez-le dans `app.ts`.
 */

const PORT = env.PORT;

// Safety net: an unhandled rejection anywhere (a fire-and-forget notification,
// a job) would otherwise terminate the process silently on newer Node versions.
process.on('unhandledRejection', reason => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

process.on('uncaughtException', error => {
  logger.error('Uncaught exception', { message: error.message, stack: error.stack });
  // The process is in an undefined state: exit and let the supervisor restart it.
  process.exit(1);
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);

  // Start scheduled jobs
  if (env.NODE_ENV !== 'test') {
    startPenaltyCalculationJob();
    startOnlinePaymentReconciliationJob();
    // Lot 4 : le 2 de chaque mois, un douzieme du loyer de chaque bail de
    // terrain est constate. Idempotent : le rejouer ne double rien.
    startLandLeaseAccrualJob();
    startReminderSchedulerJob();
    startNewsletterCampaignSchedulerJob();
    // Abonnements par packs : echeances (PAST_DUE, retraits programmes),
    // releves de consommation, alertes de seuil, rappels de fin d essai.
    startSubscriptionUsageJob();
    // Lot S4 : appels de charges automatiques des coproprietes, chaque jour a
    // 6 h UTC. Idempotent : une periode deja emise ne l'est jamais deux fois.
    startSyndicChargeCallSchedulerJob();
    // Lot S7 : archives d'export echues supprimees toutes les heures.
    startTenantDataExportExpiryJob();
    // Lot Patrimoine : alerte quotidienne d'expiration des documents (7 h UTC).
    startDocumentExpiryAlertJob();
    // Lot A3 : rapport mensuel propriétaire (liens sécurisés), coupé par défaut.
    if (env.PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED) startOwnerMonthlyReportJob();
    // Registre des lots : reconciliation quotidienne (mandats echus, derives).
    startLotReconciliationJob();
    // Journal d'audit (ADR-006, phase 5) : scellement quotidien, purge (opt-in), verification.
    startAuditMaintenanceJob();
    // Lot S7 : exports d'agence interrompus par un redemarrage (RUNNING →
    // FAILED), demandes en attente relancees, archives echues supprimees.
    recoverTenantDataExports().catch(error =>
      logger.error('Export agence : reprise au demarrage impossible', { message: (error as Error).message })
    );
  }
});
