import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { withJobLock } from '../utils/job-lock';
import { reconcilePendingCheckouts } from '../lib/payment-gateway/checkout';
import { reconcilePendingPlatformCheckouts } from '../services/platform-payment-service';
import { reconcilePendingSyndicCheckouts } from '../lib/syndics/online-payment/checkout-reconcile';

/**
 * Rapprochement planifié des paiements en ligne (lot 7) — contrat §2.7.
 *
 * Toutes les 5 minutes : rapproche les checkouts PENDING créés il y a plus de
 * 2 minutes (le temps que le locataire choisisse son moyen de paiement sur la
 * page PaySecureHub), et expire ceux de plus de 48 heures après une dernière
 * vérification.
 */
let onlinePaymentReconciliationJob: cron.ScheduledTask | null = null;

/** Un passage complet : checkouts de location, factures d'abonnement, charges de copropriété. */
async function reconcileAllPending(): Promise<void> {
  try {
    const result = await reconcilePendingCheckouts();
    logger.info('Online payment reconciliation job completed', result);
  } catch (error) {
    logger.error('Error in online payment reconciliation job', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  // Factures d'abonnement payees sur le compte ImmoTopia (vague 3) : memes
  // regles, table distincte (platform_payment_checkouts).
  try {
    const platform = await reconcilePendingPlatformCheckouts();
    logger.info('Platform invoice payment reconciliation completed', platform);
  } catch (error) {
    logger.error('Error in platform invoice payment reconciliation', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  // Appels de charges payés sur le compte de la copropriété (spec 042, codes « IMS- »).
  try {
    const syndic = await reconcilePendingSyndicCheckouts();
    logger.info('Syndic charge payment reconciliation completed', syndic);
  } catch (error) {
    logger.error('Error in syndic charge payment reconciliation', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export function startOnlinePaymentReconciliationJob() {
  if (onlinePaymentReconciliationJob) {
    logger.warn('Online payment reconciliation job is already running');
    return;
  }

  onlinePaymentReconciliationJob = cron.schedule(
    '*/5 * * * *',
    // TTL 4 min, sous la période de 5 min : un passage resté bloqué n'empêche pas le suivant.
    () => withJobLock('online-payment-reconciliation', 4 * 60 * 1000, reconcileAllPending),
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
