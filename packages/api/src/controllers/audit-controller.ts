import { Request, Response } from 'express';
import { getAuditLogs } from '../services/audit-service';
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
      tenantId: req.query.tenantId as string,
      actionKey: req.query.actionKey as string,
      entityType: req.query.entityType as string,
      entityId: req.query.entityId as string,
      actorUserId: req.query.actorUserId as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50
    };

    const result = await getAuditLogs(filters);

    res.status(200).json({
      success: true,
      data: { logs: result.logs, pagination: result.pagination }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}




