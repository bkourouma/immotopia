import { env } from '../config/env';
import { prisma } from '../utils/database';
import { recordAuditEvent } from './audit-service';
import { startOfUtcDay, RetentionCutoffs, SealVisibility } from './audit-integrity-service';
import { AuditActionKey } from '../types/audit-types';

/**
 * Rétention du journal d'audit (ADR-006, phase 5).
 *
 * Deux durées, une par visibilité (`visibility` sépare les partitions scellées,
 * donc chacune se purge d'un bloc) :
 *   - lignes visibles de l'agence (`TENANT`) : `AUDIT_RETENTION_TENANT_MONTHS` ;
 *   - lignes réservées à la plateforme (`PLATFORM_ONLY`, dont celles sans
 *     agence) : `AUDIT_RETENTION_PLATFORM_MONTHS`.
 *
 * La suppression passe EXCLUSIVEMENT par la fonction SQL `audit_logs_purge`, qui
 * refuse une date limite de moins de 180 jours et ne supprime qu'une ligne dont
 * la partition est scellée. Chaque lot est supprimé dans la même transaction que
 * sa trace `AUDIT_PURGED` : pas de purge sans trace.
 */

const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_VISIBILITY = 200;

/** Date limite à minuit UTC, `months` mois avant `now` : on ne purge que des journées entières. */
export function retentionCutoff(now: Date, months: number): Date {
  const date = startOfUtcDay(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

export function currentRetentionCutoffs(now: Date = new Date()): RetentionCutoffs {
  return {
    tenant: retentionCutoff(now, env.AUDIT_RETENTION_TENANT_MONTHS),
    platform: retentionCutoff(now, env.AUDIT_RETENTION_PLATFORM_MONTHS)
  };
}

export interface PurgeResult {
  deleted: { TENANT: number; PLATFORM_ONLY: number };
  /** Un plafond de lots a été atteint : le reste attend le prochain passage. */
  moreToPurge: boolean;
}

async function purgeVisibility(visibility: SealVisibility, cutoff: Date): Promise<{ deleted: number; more: boolean }> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_VISIBILITY; batch++) {
    const deleted = await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<Array<{ deleted: number }>>`
        SELECT audit_logs_purge(${cutoff}::timestamp, ${visibility}::"AuditVisibility", ${BATCH_SIZE}::int) AS deleted
      `;
      const count = Number(row?.deleted ?? 0);
      if (count > 0) {
        await recordAuditEvent(tx, {
          actionKey: AuditActionKey.AUDIT_PURGED,
          entityType: 'AuditLog',
          entityId: 'platform',
          payload: { visibility, cutoff: cutoff.toISOString(), deleted: count }
        });
      }
      return count;
    });
    total += deleted;
    if (deleted < BATCH_SIZE) return { deleted: total, more: false };
  }
  return { deleted: total, more: true };
}

/** Purge les lignes scellées plus anciennes que leur durée de conservation. */
export async function purgeExpiredAuditRows(now: Date = new Date()): Promise<PurgeResult> {
  const cutoffs = currentRetentionCutoffs(now);
  const tenant = await purgeVisibility('TENANT', cutoffs.tenant);
  const platform = await purgeVisibility('PLATFORM_ONLY', cutoffs.platform);
  return {
    deleted: { TENANT: tenant.deleted, PLATFORM_ONLY: platform.deleted },
    moreToPurge: tenant.more || platform.more
  };
}
