import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { sendPrivateFile } from '../lib/files/private-files';
import { getPropertyDocumentFileForTenant } from '../lib/properties/document-files';
import { getPaymentDeclarationProofForTenant, getPenaltyJustificationForTenant } from '../lib/rental/proof-files';

/**
 * Téléchargement des fichiers privés de gestion — ceux que le service
 * statique `/uploads` ne sert plus (AGENTS.md : « les documents privés ne sont
 * jamais servis en statique »). Chaque route porte sa garde d'agence et la
 * permission de son module ; le service vérifie ensuite que l'objet appartient
 * à l'agence (404 sinon).
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

/** GET /api/tenants/:tenantId/properties/:id/documents/:documentId/file */
export const downloadPropertyDocumentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getPropertyDocumentFileForTenant(tenantIdOf(req), req.params.id, req.params.documentId);
  sendPrivateFile(res, file);
});

/** GET /api/tenants/:tenantId/rental/payment-declarations/:declarationId/proof */
export const downloadPaymentDeclarationProofHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getPaymentDeclarationProofForTenant(tenantIdOf(req), req.params.declarationId);
  sendPrivateFile(res, file);
});

/** GET /api/tenants/:tenantId/rental/penalties/:penaltyId/justification */
export const downloadPenaltyJustificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getPenaltyJustificationForTenant(tenantIdOf(req), req.params.penaltyId);
  sendPrivateFile(res, file);
});
