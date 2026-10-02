import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { tenantAuditQuerySchema } from '../lib/audit/tenant-audit-schemas';
import { getTenantAuditLogs } from '../services/audit-read-service';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';

/**
 * Journal d'activité de l'agence.
 * GET /api/tenants/:tenantId/audit
 *
 * L'agence lue est celle de `req.tenantContext`, posée par `requireTenantAccess`
 * à partir de l'URL après vérification des droits ; jamais un champ de la
 * requête (le schéma refuse d'ailleurs tout paramètre `tenantId`).
 */
export const getTenantAuditLogsHandler = asyncHandler(async (req, res) => {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError("Contexte d'agence requis.");
  }

  const query = tenantAuditQuerySchema.parse(req.query);
  const page = await getTenantAuditLogs(tenantId, query);

  // Audit de l'audit : une consultation = une trace, sur la première page
  // seulement (« charger plus » ne crée pas une ligne par clic).
  if (!query.cursor) {
    const { cursor: _cursor, limit: _limit, ...filters } = query;
    logAuditEvent({
      actionKey: AuditActionKey.AUDIT_VIEWED,
      entityType: 'AuditLog',
      entityId: tenantId,
      payload: { level: 'TENANT', filters }
    });
  }

  res.status(200).json({ success: true, data: page });
});
