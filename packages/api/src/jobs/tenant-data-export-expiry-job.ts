import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import {
  STALE_RUNNING_AGE_MS,
  expireOldExports,
  failStaleRunningExports
} from '../services/tenant-data-export/export-service';

/**
 * Export complet d'une agence (lot S7) : une fois par heure, les archives
 * echues de TOUTES les agences sont supprimees (statut EXPIRED), sans attendre
 * qu'un super-admin rouvre la liste. Les exports RUNNING bloques depuis plus
 * de 6 heures hors de ce processus passent FAILED (sinon ils empecheraient
 * toute nouvelle demande pour l'agence).
 */

let job: cron.ScheduledTask | null = null;

export async function runTenantDataExportMaintenance(now: Date = new Date()): Promise<void> {
  try {
    const expired = await expireOldExports(undefined, now);
    const stale = await failStaleRunningExports(STALE_RUNNING_AGE_MS, now);
    if (expired > 0 || stale > 0) logger.info('Tenant data export maintenance', { expired, stale });
  } catch (error) {
    logger.error('Error in tenant data export maintenance', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/** Demarre la tache horaire (minute 40, UTC). */
export function startTenantDataExportExpiryJob(): void {
  if (job) {
    logger.warn('Tenant data export expiry job is already running');
    return;
  }
  job = cron.schedule('40 * * * *', () => runTenantDataExportMaintenance(), { timezone: 'UTC' });
  logger.info('Tenant data export expiry job started (hourly)');
}

export function stopTenantDataExportExpiryJob(): void {
  job?.stop();
  job = null;
}
