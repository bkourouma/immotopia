import * as cron from 'node-cron';

import { logger } from '../utils/logger';
import { withJobLock } from '../utils/job-lock';
import { runDailyOverdueAlert, runHourlyDeclarationBatch } from '../lib/rental/declared-payment/job-logic';

/**
 * Tâches du paiement de loyer déclaré (parité Syndic, spec 049, contrat §1.7).
 *
 * - Toutes les heures : récapitulatif groupé aux gestionnaires, puis purge des
 *   lectures IA expirées.
 * - Tous les jours à 8 h (Africa/Abidjan) : alerte des déclarations en retard.
 *
 * La logique vit dans `lib/rental/declared-payment/job-logic.ts` (testée) ;
 * ce fichier ne fait que planifier, sous `withJobLock` (une instance à la fois).
 */

let hourlyJob: cron.ScheduledTask | null = null;
let dailyJob: cron.ScheduledTask | null = null;
let hourlyRunning = false;
let dailyRunning = false;

export function startRentalDeclaredPaymentJob(): void {
  if (hourlyJob || dailyJob) {
    logger.warn('Rental declared payment job is already running');
    return;
  }
  hourlyJob = cron.schedule(
    '0 * * * *',
    async () => {
      if (hourlyRunning) return;
      hourlyRunning = true;
      try {
        const report = await withJobLock('rental-declared-payment-hourly', 30 * 60 * 1000, () =>
          runHourlyDeclarationBatch()
        );
        if (report && report.tenants > 0) logger.info('[rental-declared-payment] passage horaire terminé', report);
      } catch (error) {
        logger.error('Error in rental declared payment hourly job', {
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
        const report = await withJobLock('rental-declared-payment-daily', 60 * 60 * 1000, () => runDailyOverdueAlert());
        if (report && (report.summariesSent > 0 || report.failed > 0)) {
          logger.info('[rental-declared-payment] alerte quotidienne terminée', report);
        }
      } catch (error) {
        logger.error('Error in rental declared payment daily job', {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        dailyRunning = false;
      }
    },
    { timezone: 'Africa/Abidjan' }
  );
  logger.info('Rental declared payment job started (hourly summary, daily overdue alert at 8:00 Africa/Abidjan)');
}

export function stopRentalDeclaredPaymentJob(): void {
  hourlyJob?.stop();
  dailyJob?.stop();
  hourlyJob = null;
  dailyJob = null;
  logger.info('Rental declared payment job stopped');
}
