import type { Request, Response } from 'express';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { sendPrivateFile } from '../lib/files/private-files';
import { getPropertyDocumentFileForTenant } from '../lib/properties/document-files';
import {
  assertOwnerPortalDocumentAccessible,
  getOwnerPortalPatrimoine,
  getOwnerPortalPatrimoineProperty,
  getPatrimoineSettingsForOwnerPortal
} from '../lib/patrimoine/owner-portal-view';

/**
 * Vue patrimoine du portail propriétaire (lot P5) : que des GET, lecture
 * seule. Le périmètre vient exclusivement de `req.ownerPortal`, posé par
 * `requireOwnerPortalAccess` (déjà limité à l'agence du portail).
 */

function requireOwnerPortal(req: Request) {
  if (!req.ownerPortal) throw new ForbiddenError('Accès portail propriétaire requis.');
  return req.ownerPortal;
}

export const getOwnerPortalPatrimoineSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = requireOwnerPortal(req);
  const data = await getPatrimoineSettingsForOwnerPortal(tenantId);
  res.json({ success: true, data });
});

export const getOwnerPortalPatrimoineHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, tenantClientId, propertyIds } = requireOwnerPortal(req);
  const data = await getOwnerPortalPatrimoine(tenantId, tenantClientId, propertyIds);
  res.json({ success: true, data });
});

export const getOwnerPortalPatrimoinePropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, tenantClientId, propertyIds } = requireOwnerPortal(req);
  const data = await getOwnerPortalPatrimoineProperty(tenantId, tenantClientId, propertyIds, req.params.propertyId);
  res.json({ success: true, data });
});

export const downloadOwnerPortalPatrimoineDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, propertyIds } = requireOwnerPortal(req);
  const { propertyId, documentId } = req.params;
  await assertOwnerPortalDocumentAccessible(tenantId, propertyIds, propertyId);
  sendPrivateFile(
    res,
    await getPropertyDocumentFileForTenant(tenantId, propertyId, documentId, { managedByMandate: true })
  );
});
