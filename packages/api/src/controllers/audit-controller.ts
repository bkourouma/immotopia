import { Request, Response } from 'express';
import { getAuditLogs, enrichAuditLogsWithResourceLabels } from '../services/audit-service';
import { AuditLogFilters } from '../types/audit-types';

/**
 * Get audit logs with filtering
 * GET /api/admin/audit
 */
export async function getAuditLogsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const filters: AuditLogFilters = {
      tenantId: (req.query.tenantId as string) || undefined,
      actionKey: (req.query.actionKey as string) || (req.query.action as string) || undefined,
      entityType: (req.query.entityType as string) || (req.query.resourceType as string) || undefined,
      entityId: (req.query.entityId as string) || undefined,
      actorUserId: (req.query.actorUserId as string) || (req.query.userId as string) || undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50
    };

    const result = await getAuditLogs(filters);

    const resourceLabels = await enrichAuditLogsWithResourceLabels(
      result.logs.map((log: any) => ({
        id: log.id,
        entityType: log.entityType,
        entityId: log.entityId,
        tenantId: log.tenantId,
        payload: log.payload
      }))
    );

    const logs = result.logs.map((log: any) => ({
      id: log.id,
      userId: log.actorUserId,
      tenantId: log.tenantId,
      action: log.actionKey,
      resourceType: log.entityType,
      resourceId: log.entityId,
      resourceLabel: resourceLabels.get(log.id) ?? undefined,
      details: log.payload,
      ipAddress: log.ipAddress ?? undefined,
      userAgent: log.userAgent ?? undefined,
      createdAt: log.createdAt,
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
