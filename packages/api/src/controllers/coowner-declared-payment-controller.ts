import type { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import {
  cancelCoOwnerDeclaration,
  createCoOwnerDeclaration,
  getCoOwnerDeclaredAvailability,
  listCoOwnerDeclarations
} from '../lib/syndics/declared-payment/portal';
import { readPaymentProof } from '../lib/syndics/declared-payment/proof-read';
import {
  availabilityQuerySchema,
  coOwnerDeclarationPayloadSchema,
  parseMultipartPayload,
  portalListQuerySchema,
  syndicIdFieldSchema
} from '../lib/syndics/declared-payment/request-schemas';

/**
 * Paiement mobile money déclaré, portail copropriétaire (spec 047, contrats §2).
 *
 * L'agence, les lots et le déclarant viennent EXCLUSIVEMENT de la garde
 * (`requireCoOwnerPortalAccess`) ; le corps ne porte jamais d'identifiant d'agence.
 * Les captures sont des fichiers privés : le portail ne les sert pas (le
 * copropriétaire les a déjà), seul le gestionnaire les lit par une route authentifiée.
 */

function scopeOf(req: Request) {
  if (!req.coOwnerPortal) throw new ForbiddenError('Accès portail copropriétaire refusé.');
  return req.coOwnerPortal.scope;
}

const declarationIdOf = (req: Request) => assertUuidOrNotFound(req.params.declarationId, t('Déclaration introuvable.'));

export const getCoOwnerDeclaredAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { syndicId } = availabilityQuerySchema.parse(req.query);
  res.json({ success: true, data: await getCoOwnerDeclaredAvailability(scopeOf(req), syndicId) });
});

export const createCoOwnerDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const payload = parseMultipartPayload(req.body?.payload, coOwnerDeclarationPayloadSchema);
  const data = await createCoOwnerDeclaration(scopeOf(req), payload, req.file ?? null);
  res.status(201).json({ success: true, data });
});

/** §2.3 : lecture IA de la capture. Le fichier `proof` et le champ texte `syndicId` viennent du multipart. */
export const readCoOwnerPaymentProofHandler = asyncHandler(async (req: Request, res: Response) => {
  const { syndicId } = syndicIdFieldSchema.parse({ syndicId: req.body?.syndicId });
  const data = await readPaymentProof({ scope: scopeOf(req), syndicateId: syndicId, file: req.file ?? null });
  res.json({ success: true, data });
});

export const listCoOwnerDeclarationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = portalListQuerySchema.parse(req.query);
  res.json({ success: true, data: await listCoOwnerDeclarations(scopeOf(req), query) });
});

export const cancelCoOwnerDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await cancelCoOwnerDeclaration(scopeOf(req), declarationIdOf(req)) });
});
