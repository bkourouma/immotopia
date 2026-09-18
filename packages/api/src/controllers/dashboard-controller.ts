import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { getTenantDashboard } from '../services/dashboard-service';
import { logger } from '../utils/logger';

/**
 * Get the generic tenant dashboard figures
 * GET /tenants/:tenantId/dashboard
 */
export async function getTenantDashboardHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise.'
      });
      return;
    }

    const dashboard = await getTenantDashboard(tenantId, userId);

    res.status(200).json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    logger.error('Error building tenant dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Impossible de charger le tableau de bord.'
    });
  }
}
