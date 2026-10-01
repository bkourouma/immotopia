import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { requireTenantId, uuidParam } from '../lib/patrimoine/insurance/request-params';
import {
  createMaintenanceLogEntrySchema,
  exportMaintenanceLogQuerySchema,
  listMaintenanceLogQuerySchema,
  updateMaintenanceLogEntrySchema
} from '../lib/patrimoine/insurance/maintenance-log-schemas';
import {
  createMaintenanceLogEntry,
  deleteMaintenanceLogEntry,
  exportMaintenanceLogCsv,
  listMaintenanceLog,
  updateMaintenanceLogEntry
} from '../lib/patrimoine/insurance/maintenance-log-service';

/**
 * Contrôleurs du carnet d'entretien (lot B1, spec 032). Modèle :
 * `controllers/patrimoine-entities-controller.ts` (`asyncHandler`, erreurs
 * typées, schémas Zod `.parse()` en tête).
 */

const entryIdOf = (req: Request) => uuidParam(req, 'entryId', "Entrée du carnet d'entretien introuvable.");

export const listMaintenanceLogHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listMaintenanceLogQuerySchema.parse(req.query ?? {});
  const data = await listMaintenanceLog(requireTenantId(req), query);
  res.json({ success: true, data });
});

export const exportMaintenanceLogHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = exportMaintenanceLogQuerySchema.parse(req.query ?? {});
  const { csv, filename } = await exportMaintenanceLogCsv(requireTenantId(req), query.propertyId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

export const createMaintenanceLogHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createMaintenanceLogEntrySchema.parse(req.body ?? {});
  const data = await createMaintenanceLogEntry(requireTenantId(req), body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const updateMaintenanceLogHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateMaintenanceLogEntrySchema.parse(req.body ?? {});
  const data = await updateMaintenanceLogEntry(requireTenantId(req), entryIdOf(req), body);
  res.json({ success: true, data });
});

export const deleteMaintenanceLogHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteMaintenanceLogEntry(requireTenantId(req), entryIdOf(req));
  res.status(204).send();
});
