import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { reconcilePendingCheckouts } from '../lib/payment-gateway/checkout';

/**
 * Rapprochement planifié des paiements en ligne (lot 7) — contrat §2.7.
 *
 * Toutes les 5 minutes : rapproche les checkouts PENDING créés il y a plus de
 * 2 minutes (le temps que le locataire choisisse son moyen de paiement sur la
 * page PaySecureHub), et expire ceux de plus de 48 heures après une dernière
 * vérification.
 */
let onlinePaymentReconciliationJob: cron.ScheduledTask | null = null;

export function startOnlinePaymentReconciliationJob() {
  if (onlinePaymentReconciliationJob) {
    logger.warn('Online payment reconciliation job is already running');
    return;
  }

  onlinePaymentReconciliationJob = cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        const result = await reconcilePendingCheckouts();
        logger.info('Online payment reconciliation job completed', result);
      } catch (error) {
        logger.error('Error in online payment reconciliation job', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    },
    {
      timezone: 'UTC'
    }
  );

  logger.info('Online payment reconciliation job started (runs every 5 minutes)');
}

export function stopOnlinePaymentReconciliationJob() {
  if (onlinePaymentReconciliationJob) {
    onlinePaymentReconciliationJob.stop();
    onlinePaymentReconciliationJob = null;
    logger.info('Online payment reconciliation job stopped');
  }
}
