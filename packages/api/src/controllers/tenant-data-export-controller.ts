import { createReadStream } from 'fs';
import type { Request, Response } from 'express';
import { asyncHandler, UnauthorizedError } from '../middleware/error-middleware';
import {
  deleteTenantDataExport,
  getTenantDataExport,
  listTenantDataExports,
  openTenantDataExportDownload,
  requestTenantDataExport
} from '../services/tenant-data-export/export-service';

/**
 * Export complet d'une agence (lot S7) — routes super-admin, montees sous
 * `/api/admin/tenants/:tenantId/data-exports` (routes/tenant-data-export-routes.ts).
 * Aucune reponse ne porte de chemin disque.
 */

function actorId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}

export const requestExportHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestTenantDataExport(req.params.tenantId, actorId(req));
  res.status(202).json({ success: true, data });
});

export const listExportsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listTenantDataExports(req.params.tenantId);
  res.json({ success: true, data });
});

export const getExportHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getTenantDataExport(req.params.tenantId, req.params.exportId);
  res.json({ success: true, data });
});

export const downloadExportHandler = asyncHandler(async (req: Request, res: Response) => {
  const download = await openTenantDataExportDownload(req.params.tenantId, req.params.exportId, actorId(req));
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', String(download.sizeBytes));
  res.setHeader('Content-Disposition', `attachment; filename="${download.fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(download.absolutePath);
    stream.on('error', reject);
    res.on('close', () => {
      stream.destroy();
      resolve();
    });
    stream.pipe(res);
  });
});

export const deleteExportHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteTenantDataExport(req.params.tenantId, req.params.exportId, actorId(req));
  res.json({ success: true });
});
