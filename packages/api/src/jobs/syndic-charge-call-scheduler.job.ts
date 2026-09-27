import * as cron from 'node-cron';

import { logger } from '../utils/logger';
import { runDueChargeSchedules } from '../lib/syndics/charge-schedule-runner';

/**
 * Appels de charges automatiques des copropriétés — lot S4 (besoin 6, P3).
 *
 * Chaque jour à 6 h UTC, toutes les programmations actives dont la date
 * d'émission est arrivée émettent leur période : lot d'appels, imputation
 * des avances (quittance pour chaque appel couvert), puis envoi de l'avis
 * d'appel PDF aux seuls copropriétaires qui ont quelque chose à payer.
 *
 * Idempotent par construction : l'unicité (programmation, début de période)
 * du journal des exécutions interdit toute double émission, y compris si la
 * tâche est relancée à la main ou tourne deux fois. Un serveur arrêté
 * plusieurs jours rattrape les périodes manquées dans l'ordre (au plus 12
 * par programmation et par passage). Un échec est consigné programmation par
 * programmation, avec la copropriété nommée, et n'arrête jamais les autres.
 */

let schedulerJob: cron.ScheduledTask | null = null;

export async function runSyndicChargeCallScheduler(now: Date = new Date()) {
  const report = await runDueChargeSchedules(now);
  logger.info('Syndic charge call scheduler completed', {
    schedules: report.schedules,
    success: report.success,
    skipped: report.skipped,
    failed: report.failed
  });
  for (const failure of report.failures) {
    logger.error('Syndic charge schedule failed', failure);
  }
  return report;
}

export function startSyndicChargeCallSchedulerJob(): void {
  if (schedulerJob) {
    logger.warn('Syndic charge call scheduler job is already running');
    return;
  }
  schedulerJob = cron.schedule(
    '0 6 * * *',
    async () => {
      try {
        await runSyndicChargeCallScheduler();
      } catch (error) {
        logger.error('Error in syndic charge call scheduler job', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    { timezone: 'UTC' }
  );
  logger.info('Syndic charge call scheduler job started (runs daily at 6:00 AM UTC)');
}

export function stopSyndicChargeCallSchedulerJob(): void {
  if (!schedulerJob) return;
  schedulerJob.stop();
  schedulerJob = null;
  logger.info('Syndic charge call scheduler job stopped');
}
