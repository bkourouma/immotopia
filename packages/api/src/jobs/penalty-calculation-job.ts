import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { calculatePenaltiesForOverdueInstallments } from '../services/rental-penalty-service';

let penaltyJob: cron.ScheduledTask | null = null;

/**
 * Start the penalty calculation scheduled job
 * Runs daily at 2:00 AM server time
 */
export function startPenaltyCalculationJob() {
  if (penaltyJob) {
    logger.warn('Penalty calculation job is already running');
    return;
  }

  // Schedule job to run daily at 2:00 AM
  penaltyJob = cron.schedule(
    '0 2 * * *',
    async () => {
      try {
        logger.info('Starting scheduled penalty calculation job');
        const results = await calculatePenaltiesForOverdueInstallments();
        logger.info('Penalty calculation job completed', {
          processed: results.processed,
          errors: results.errors.length
        });
      } catch (error) {
        logger.error('Error in penalty calculation job', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    },
    {
      scheduled: true,
      timezone: 'UTC' // Adjust timezone as needed
    }
  );

  logger.info('Penalty calculation job started (runs daily at 2:00 AM)');
}

/**
 * Stop the penalty calculation scheduled job
 */
export function stopPenaltyCalculationJob() {
  if (penaltyJob) {
    penaltyJob.stop();
    penaltyJob = null;
    logger.info('Penalty calculation job stopped');
  }
}

/**
 * Manually trigger penalty calculation (for testing or on-demand)
 * @param tenantId - Optional tenant ID to limit calculation to specific tenant
 */
export async function triggerPenaltyCalculation(tenantId?: string) {
  logger.info('Manually triggering penalty calculation', { tenantId });
  return await calculatePenaltiesForOverdueInstallments(tenantId);
}




