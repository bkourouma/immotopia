import { createReadStream } from 'fs';
import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  addInspectionPhoto,
  compareInspectionsForLease,
  createInspection,
  deleteInspection,
  deleteInspectionPhoto,
  getInspectionPhotoFile,
  listInspections,
  updateInspection,
  finalizeInspection
} from '../lib/lease-inspections/service';

/**
 * États des lieux d'entrée et de sortie — lot 5 (section B) de la gestion
 * locative. Toute la logique vit dans `lib/lease-inspections/service.ts` ;
 * ces handlers ne font que résoudre le contexte et appeler le service.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte agence requis.');
  }
  return tenantId;
}

function requireLeaseId(req: Request): string {
  const leaseId = req.params.leaseId;
  if (!leaseId) {
    throw new BadRequestError('Bail requis.');
  }
  return leaseId;
}

export const listInspectionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const data = await listInspections(tenantId, leaseId);
  res.json({ success: true, data });
});

export const createInspectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const data = await createInspection(tenantId, leaseId, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const updateInspectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const data = await updateInspection(tenantId, leaseId, req.params.id, req.body);
  res.json({ success: true, data });
});

export const finalizeInspectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const data = await finalizeInspection(tenantId, leaseId, req.params.id, req.user?.userId);
  res.json({ success: true, data });
});

export const deleteInspectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  await deleteInspection(tenantId, leaseId, req.params.id);
  res.json({ success: true, data: null });
});

export const compareInspectionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const data = await compareInspectionsForLease(tenantId, leaseId);
  res.json({ success: true, data });
});

export const addInspectionPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const data = await addInspectionPhoto(tenantId, leaseId, req.params.id, req.file, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const getInspectionPhotoFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  const photo = await getInspectionPhotoFile(tenantId, leaseId, req.params.id, req.params.photoId);

  res.setHeader('Content-Type', photo.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(photo.fileName)}"`);
  res.setHeader('Content-Length', String(photo.sizeBytes));

  const stream = createReadStream(photo.filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'Fichier introuvable.' });
    }
  });
  stream.pipe(res);
});

export const deleteInspectionPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const leaseId = requireLeaseId(req);
  await deleteInspectionPhoto(tenantId, leaseId, req.params.id, req.params.photoId);
  res.json({ success: true, data: null });
});
