import { Request } from 'express';
import { getAuditLogs, enrichAuditLogsWithResourceLabels } from '../services/audit-service';
import { AuditLogFilters } from '../types/audit-types';
import { parsePagination } from '../utils/pagination-helper';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';

/** Date de filtre facultative : absente = ignorée, illisible = 400 (et non un 500 de Prisma). */
function optionalDate(value: unknown, invalidMessage: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(invalidMessage);
  }
  return date;
}

function parseFilters(req: Request): AuditLogFilters {
  return {
    tenantId: (req.query.tenantId as string) || undefined,
    actionKey: (req.query.actionKey as string) || (req.query.action as string) || undefined,
    entityType: (req.query.entityType as string) || (req.query.resourceType as string) || undefined,
    entityId: (req.query.entityId as string) || undefined,
    actorUserId: (req.query.actorUserId as string) || (req.query.userId as string) || undefined,
    startDate: optionalDate(req.query.startDate, 'Date de début invalide'),
    endDate: optionalDate(req.query.endDate, 'Date de fin invalide'),
    ...parsePagination(req.query, { defaultPage: 1, defaultLimit: 50 })
  };
}

/**
 * Get audit logs with filtering (platform level)
 * GET /api/admin/audit
 */
export const getAuditLogsHandler = asyncHandler(async (req, res) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError('Authentification requise.');
  }

  const result = await getAuditLogs(parseFilters(req));

  const resourceLabels = await enrichAuditLogsWithResourceLabels(
    result.logs.map(log => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      tenantId: log.tenantId,
      payload: log.payload
    }))
  );

  const logs = result.logs.map(log => ({
    id: log.id,
    userId: log.actorUserId,
    tenantId: log.tenantId,
    action: log.actionKey,
    resourceType: log.entityType,
    resourceId: log.entityId,
    resourceLabel: resourceLabels.get(log.id) ?? undefined,
    details: log.payload,
    changes: log.changes ?? undefined,
    ipAddress: log.ipAddress ?? undefined,
    userAgent: log.userAgent ?? undefined,
    createdAt: log.createdAt,
    scope: log.scope,
    visibility: log.visibility,
    category: log.category,
    outcome: log.outcome,
    actorType: log.actorType,
    actorLabel: log.actorLabel ?? undefined,
    requestId: log.requestId ?? undefined,
    user: log.actor
      ? {
          id: log.actor.id,
          email: log.actor.email,
          fullName: log.actor.fullName ?? null
        }
      : undefined,
    tenant: log.tenant ? { id: log.tenant.id, name: log.tenant.name } : undefined
  }));

  res.status(200).json({
    success: true,
    data: { logs, pagination: result.pagination }
  });
});
