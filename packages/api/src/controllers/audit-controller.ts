import { asyncHandler } from '../middleware/error-middleware';
import { platformAuditExportQuerySchema, platformAuditQuerySchema } from '../lib/audit/platform-audit-schemas';
import { getPlatformAuditLogs } from '../services/audit-platform-read-service';
import { preparePlatformAuditExport, streamPlatformAuditCsv } from '../services/audit-platform-export-service';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';

/**
 * Journal d'audit de la PLATEFORME (super-admin) : tout, toutes agences.
 * Le niveau agence est `tenant-audit-controller`.
 */

/**
 * GET /api/admin/audit — `PLATFORM_AUDIT_VIEW`.
 * Pagination par curseur ; paramètres en schéma strict.
 */
export const getAuditLogsHandler = asyncHandler(async (req, res) => {
  const query = platformAuditQuerySchema.parse(req.query);
  const page = await getPlatformAuditLogs(query);

  // Audit de l'audit : première page seulement (« charger plus » n'en écrit pas).
  if (!query.cursor) {
    const { cursor: _cursor, limit: _limit, ...filters } = query;
    logAuditEvent({
      actionKey: AuditActionKey.AUDIT_VIEWED,
      entityType: 'AuditLog',
      entityId: 'platform',
      payload: { level: 'PLATFORM', filters }
    });
  }

  res.status(200).json({ success: true, data: page });
});

/**
 * GET /api/admin/audit/export — `PLATFORM_AUDIT_EXPORT` + super-admin.
 * CSV, 50 000 lignes au plus ; `X-Export-Truncated: true` quand le filtre est
 * trop large. La trace `AUDIT_EXPORTED` est écrite avant le premier octet.
 */
export const exportAuditLogsHandler = asyncHandler(async (req, res) => {
  const filters = platformAuditExportQuerySchema.parse(req.query);
  const plan = await preparePlatformAuditExport(filters);

  const day = new Date().toISOString().slice(0, 10);
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="journal-audit-${day}.csv"`);
  res.setHeader('X-Export-Truncated', plan.truncated ? 'true' : 'false');
  res.setHeader('X-Export-Rows', String(plan.rows));
  res.setHeader('Cache-Control', 'no-store');
  // Le navigateur ne lit un en-tête personnalisé inter-origine que s'il est exposé.
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Truncated, X-Export-Rows');

  await streamPlatformAuditCsv(filters, res);
});
