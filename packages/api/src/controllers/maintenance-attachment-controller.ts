import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { asyncHandler, BadRequestError, ForbiddenError } from '../middleware/error-middleware';
import { uploadAttachment } from '../services/maintenance-attachment-service';
import {
  getMaintenanceAttachmentFileForOwnerPortal,
  getMaintenanceAttachmentFileForTenant,
  getMaintenanceAttachmentFileForTenantPortal
} from '../lib/maintenance/attachment-files';
import { sendPrivateFile } from '../lib/files/private-files';
import { listPortalLeaseIds } from '../utils/tenant-portal-leases';

/**
 * Upload attachment for a ticket
 * POST /tenants/:tenantId/maintenance/tenant/tickets/:ticketId/attachments
 */
export const uploadAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { ticketId } = req.params;
  const actorUserId = req.user?.userId;
  const actorContactId = req.body.tenantContactId || (req.query.tenantContactId as string | undefined);

  if (!req.file) {
    throw new BadRequestError('Aucun fichier fourni');
  }

  const attachment = await uploadAttachment(tenantId, ticketId, req.file, actorUserId, actorContactId);

  res.status(201).json({
    success: true,
    data: attachment
  });
});

/**
 * Gestion : GET /tenants/:tenantId/maintenance/files/:attachmentId
 *
 * `requireTenantAccess` + permission maintenance (voir maintenance-routes.ts) ;
 * la pièce doit appartenir à l'agence, sinon 404. Le paramètre
 * `tenantContactId` que lisait l'ancienne version n'est plus lu : fourni par
 * l'appelant, il ne pouvait que restreindre, jamais protéger.
 */
export const downloadAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const file = await getMaintenanceAttachmentFileForTenant(tenantId, req.params.attachmentId);
  sendPrivateFile(res, file);
});

/**
 * Portail locataire : GET /portal/tenant/maintenance/:id/attachments/:attachmentId
 *
 * Le périmètre vient de la garde (`requireTenantPortalAccess`), jamais de la
 * requête : seulement les pièces d'un ticket visible dans CE portail.
 */
export const downloadTenantPortalAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantPortal) {
    throw new ForbiddenError('Accès portail locataire refusé.');
  }
  const { tenantId, tenantClientId, leaseId } = req.tenantPortal;
  // Un ticket de n'importe quel bail actif du locataire (H29), jamais d'un autre.
  const leaseIds = await listPortalLeaseIds(tenantId, tenantClientId);
  const file = await getMaintenanceAttachmentFileForTenantPortal(
    { tenantId, tenantClientId, leaseId, leaseIds },
    req.params.id,
    req.params.attachmentId
  );
  sendPrivateFile(res, file);
});

/**
 * Portail propriétaire : GET /portal/owner/maintenance/:id/attachments/:attachmentId
 *
 * Seulement les pièces d'un ticket portant sur un bien du propriétaire
 * connecté, dans l'agence résolue par `requireOwnerPortalAccess`.
 */
export const downloadOwnerPortalAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.ownerPortal) {
    throw new ForbiddenError('Accès portail propriétaire requis.');
  }
  const { tenantId, propertyIds } = req.ownerPortal;
  const file = await getMaintenanceAttachmentFileForOwnerPortal(
    { tenantId, propertyIds },
    req.params.id,
    req.params.attachmentId
  );
  sendPrivateFile(res, file);
});
