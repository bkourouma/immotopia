import { once } from 'events';
import type { Writable } from 'stream';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { recordAuditEvent } from './audit-service';
import {
  countPlatformAuditLogs,
  iteratePlatformAuditLogs,
  PlatformAuditFilters,
  PLATFORM_AUDIT_EXPORT_MAX_ROWS
} from './audit-platform-read-service';
import { platformAuditCsvHead, platformAuditCsvLine } from '../lib/audit/platform-audit-csv';
import { AuditActionKey } from '../types/audit-types';

/**
 * Export CSV du journal d'audit de la plateforme (ADR-006, phase 4).
 *
 * Deux temps, pour qu'une trace précède toujours les données :
 *   1. `preparePlatformAuditExport` compte les lignes, **écrit `AUDIT_EXPORTED`
 *      de façon synchrone** (la requête échoue si la trace ne s'écrit pas), et
 *      dit si l'export sera tronqué (l'en-tête HTTP doit le savoir avant le corps) ;
 *   2. `streamPlatformAuditCsv` écrit le fichier par lots, avec contre-pression.
 */

export interface PlatformAuditExportPlan {
  rows: number;
  truncated: boolean;
}

export async function preparePlatformAuditExport(filters: PlatformAuditFilters): Promise<PlatformAuditExportPlan> {
  const total = await countPlatformAuditLogs(filters);
  const plan = {
    rows: Math.min(total, PLATFORM_AUDIT_EXPORT_MAX_ROWS),
    truncated: total > PLATFORM_AUDIT_EXPORT_MAX_ROWS
  };

  // Avant tout octet de données : sans trace, pas d'export.
  await recordAuditEvent(prisma, {
    actionKey: AuditActionKey.AUDIT_EXPORTED,
    entityType: 'AuditLog',
    entityId: 'platform',
    payload: { level: 'PLATFORM', filters, rows: plan.rows, truncated: plan.truncated }
  });
  return plan;
}

/**
 * Écrit l'en-tête puis le journal, du plus récent au plus ancien, par lots de
 * 1 000. S'arrête si le client coupe. Une erreur en cours de route ne peut plus
 * produire de réponse JSON (les en-têtes sont partis) : la connexion est
 * coupée, pour que le client ne prenne pas un fichier tronqué pour complet.
 */
export async function streamPlatformAuditCsv(filters: PlatformAuditFilters, out: Writable): Promise<void> {
  const send = async (chunk: string): Promise<boolean> => {
    if (out.destroyed) return false;
    if (!out.write(chunk)) {
      await once(out, 'drain');
    }
    return !out.destroyed;
  };

  try {
    if (!(await send(platformAuditCsvHead()))) return;
    for await (const batch of iteratePlatformAuditLogs(filters)) {
      const chunk = `${batch.map(platformAuditCsvLine).join('\r\n')}\r\n`;
      if (!(await send(chunk))) return;
    }
    out.end();
  } catch (error) {
    logger.error('Export du journal d’audit interrompu', {
      error: error instanceof Error ? error.message : String(error)
    });
    out.destroy(error instanceof Error ? error : undefined);
  }
}
