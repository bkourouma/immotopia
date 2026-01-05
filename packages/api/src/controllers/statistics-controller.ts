import { Request, Response } from 'express';
import { getGlobalStatistics, getTenantActivityStats } from '../services/statistics-service';

/**
 * Get global statistics
 * GET /api/admin/statistics
 */
export async function getGlobalStatisticsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const statistics = await getGlobalStatistics();

    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get tenant activity statistics
 * GET /api/admin/tenants/:tenantId/activity
 */
export async function getTenantActivityStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const statistics = await getTenantActivityStats(tenantId);

    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}




