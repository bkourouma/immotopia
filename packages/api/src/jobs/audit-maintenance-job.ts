import * as cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { flushAuditEvents, logAuditEvent } from '../services/audit-service';
import { getAuditChainHead, sealPendingPartitions, verifyAuditIntegrity } from '../services/audit-integrity-service';
import { currentRetentionCutoffs, purgeExpiredAuditRows } from '../services/audit-retention-service';
import { AuditActionKey } from '../types/audit-types';

/**
 * Maintenance quotidienne du journal d'audit (ADR-006, phase 5), 2 h 30 UTC :
 *   1. scelle les journées révolues (toujours actif) ;
 *   2. purge les lignes scellées échues — seulement si `AUDIT_PURGE_ENABLED=true` ;
 *   3. revérifie la chaîne et les sept dernières journées scellées ;
 *   4. journalise la tête de chaîne, à recopier hors de la base (RUNBOOK).
 * Une étape en échec n'empêche pas les suivantes : chacune est indépendante.
 */

const VERIFY_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

let job: cron.ScheduledTask | null = null;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function sealStep(now: Date): Promise<void> {
  const result = await sealPendingPartitions({ now });
  if (result.sealed > 0 || result.failed > 0) logger.info('Audit : scellement quotidien', result);
  if (result.sealed > 0) {
    logAuditEvent({
      actionKey: AuditActionKey.AUDIT_SEALED,
      entityType: 'AuditLog',
      entityId: 'platform',
      payload: { ...result }
    });
  }
}

async function purgeStep(now: Date): Promise<void> {
  if (!env.AUDIT_PURGE_ENABLED) return;
  const result = await purgeExpiredAuditRows(now);
  const total = result.deleted.TENANT + result.deleted.PLATFORM_ONLY;
  if (total > 0 || result.moreToPurge) logger.info('Audit : purge de rétention', result);
}

async function verifyStep(now: Date): Promise<void> {
  const report = await verifyAuditIntegrity({
    from: new Date(now.getTime() - VERIFY_WINDOW_DAYS * DAY_MS),
    cutoffs: currentRetentionCutoffs(now)
  });
  if (!report.ok) {
    logger.error('Audit : INTÉGRITÉ DU JOURNAL COMPROMISE', {
      chain: report.chain,
      tampered: report.partitions.tampered.slice(0, 20)
    });
    logAuditEvent({
      actionKey: AuditActionKey.AUDIT_INTEGRITY_FAILED,
      entityType: 'AuditLog',
      entityId: 'platform',
      payload: {
        chainOk: report.chain.ok,
        brokenAtSeq: report.chain.brokenAtSeq ?? null,
        tamperedPartitions: report.partitions.tampered.length
      }
    });
  }
  const head = report.chain.head ?? (await getAuditChainHead());
  if (head) logger.info('Audit : tête de chaîne à ancrer', head);
}

export async function runAuditMaintenance(now: Date = new Date()): Promise<void> {
  const steps: Array<[string, (at: Date) => Promise<void>]> = [
    ['scellement', sealStep],
    ['purge', purgeStep],
    ['vérification', verifyStep]
  ];
  for (const [name, step] of steps) {
    try {
      await step(now);
    } catch (error) {
      logger.error(`Audit : étape « ${name} » en échec`, { error: message(error) });
    }
  }
  await flushAuditEvents().catch(() => undefined);
}

/** Démarre la tâche quotidienne (2 h 30 UTC). */
export function startAuditMaintenanceJob(): void {
  if (job) {
    logger.warn('Audit maintenance job is already running');
    return;
  }
  job = cron.schedule('30 2 * * *', () => runAuditMaintenance(), { timezone: 'UTC' });
  logger.info(`Audit maintenance job started (daily, purge ${env.AUDIT_PURGE_ENABLED ? 'ON' : 'OFF'})`);
}

export function stopAuditMaintenanceJob(): void {
  job?.stop();
  job = null;
}
