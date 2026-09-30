import * as cron from 'node-cron';

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import { reconcileLotActivations } from '../services/lot-registry-service';

/**
 * Reconciliation quotidienne du registre des lots (`LotActivation`), 03:10 UTC.
 *
 * Le registre est tenu au fil de l'eau (`syncLotActivationsTx`), mais rien ne
 * declenche une operation quand une echeance passe seule : un mandat dont la
 * date de fin est depassee sort du decompte ici, au plus tard a la prochaine
 * passe. La tache corrige aussi toute derive (ecriture hors service, reprise).
 *
 * Agences traitees une a une, chacune dans son contexte tenant ; une agence
 * en echec est journalisee et n'arrete pas les suivantes. Idempotente : une
 * seconde passe ne change rien. Verrou simple en memoire contre le
 * chevauchement de deux passes ; l'ecriture par agence prend en plus le
 * verrou consultatif d'agence du registre.
 */

let job: cron.ScheduledTask | null = null;
let running = false;

export interface LotReconciliationReport {
  tenants: number;
  added: number;
  removed: number;
  reclassified: number;
  failed: number;
  skipped: boolean;
}

export async function runLotReconciliation(): Promise<LotReconciliationReport> {
  const report: LotReconciliationReport = {
    tenants: 0,
    added: 0,
    removed: 0,
    reclassified: 0,
    failed: 0,
    skipped: false
  };
  if (running) {
    logger.warn('Lot reconciliation job already running, pass skipped');
    return { ...report, skipped: true };
  }
  running = true;
  try {
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE', isActive: true },
      select: { id: true }
    });
    report.tenants = tenants.length;
    for (const tenant of tenants) {
      try {
        // eslint-disable-next-line no-await-in-loop -- agences traitees une a une.
        const result = await runWithTenantContext({ tenantId: tenant.id }, () => reconcileLotActivations(tenant.id));
        report.added += result.added.length;
        report.removed += result.removed.length;
        report.reclassified += result.reclassified;
      } catch (error) {
        report.failed += 1;
        logger.error('Lot reconciliation failed for tenant', {
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    logger.info('Lot reconciliation run completed', report);
    return report;
  } finally {
    running = false;
  }
}

export function startLotReconciliationJob(): void {
  if (job) {
    logger.warn('Lot reconciliation job is already running');
    return;
  }
  job = cron.schedule(
    '10 3 * * *',
    async () => {
      try {
        await runLotReconciliation();
      } catch (error) {
        logger.error('Error in lot reconciliation job', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    { timezone: 'UTC' }
  );
  logger.info('Lot reconciliation job started (runs daily at 3:10 AM UTC)');
}

export function stopLotReconciliationJob(): void {
  if (!job) return;
  job.stop();
  job = null;
}
