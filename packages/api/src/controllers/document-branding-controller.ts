import type { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { BRANDING_IMAGE_MIME, type BrandingImage } from '../lib/documents/branding-storage';
import {
  assertUuidOrNotFound,
  createMandatingAgency,
  createMandatingAgencySchema,
  deleteMandatingAgency,
  getAgencyDocumentIdentity,
  getMandatingAgency,
  listMandatingAgencies,
  parseAgencyImageKind,
  parseMandantImageKind,
  readAgencyImage,
  readMandantImage,
  readSyndicateLogo,
  removeAgencyImage,
  removeMandantImage,
  removeSyndicateLogo,
  updateMandatingAgency,
  updateMandatingAgencySchema,
  uploadAgencyImage,
  uploadMandantImage,
  uploadSyndicateLogo
} from '../lib/documents/mandating-agencies';

/**
 * Identité des documents (lot S1) : agences mandantes, logo d'une
 * copropriété, signature et cachet de l'agence. Les gardes (session, agence,
 * permission) sont posées par `routes/document-branding-routes.ts`.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Agence manquante dans la requête.');
  return tenantId;
}

/**
 * `:kind` du chemin ; absent sur la route littérale `.../images/logo`, déclarée
 * à part parce que le logo n'exige pas les mêmes droits (voir le routeur).
 */
const mandantKindOf = (req: Request) => parseMandantImageKind(req.params.kind ?? 'logo');
const agencyIdOf = (req: Request) => assertUuidOrNotFound(req.params.agencyId, 'Agence mandante introuvable.');
const syndicIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.syndicId, 'Copropriete introuvable ou inaccessible');

/** Image privée : affichée par le navigateur (balise <img> via blob), jamais mise en cache partagé. */
function sendImage(res: Response, image: BrandingImage): void {
  const buffer = Buffer.from(image.bytes);
  res.setHeader('Content-Type', BRANDING_IMAGE_MIME[image.format]);
  res.setHeader('Content-Disposition', `inline; filename="image.${image.format}"`);
  res.setHeader('Content-Length', buffer.length.toString());
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
}

// ------------------------------------------------------------ mandants

export const listMandatingAgenciesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listMandatingAgencies(tenantIdOf(req)) });
});

export const getMandatingAgencyHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getMandatingAgency(tenantIdOf(req), agencyIdOf(req)) });
});

export const createMandatingAgencyHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createMandatingAgencySchema.parse(req.body ?? {});
  res.status(201).json({ success: true, data: await createMandatingAgency(tenantIdOf(req), input) });
});

export const updateMandatingAgencyHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateMandatingAgencySchema.parse(req.body ?? {});
  res.json({ success: true, data: await updateMandatingAgency(tenantIdOf(req), agencyIdOf(req), input) });
});

export const deleteMandatingAgencyHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await deleteMandatingAgency(tenantIdOf(req), agencyIdOf(req)) });
});

export const uploadMandantImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = mandantKindOf(req);
  res.json({
    success: true,
    data: await uploadMandantImage(tenantIdOf(req), agencyIdOf(req), kind, req.file, req.user?.userId)
  });
});

export const removeMandantImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = mandantKindOf(req);
  res.json({ success: true, data: await removeMandantImage(tenantIdOf(req), agencyIdOf(req), kind, req.user?.userId) });
});

export const readMandantImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = mandantKindOf(req);
  sendImage(res, await readMandantImage(tenantIdOf(req), agencyIdOf(req), kind));
});

// ------------------------------------------------------------ logo de copropriété

export const uploadSyndicateLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await uploadSyndicateLogo(tenantIdOf(req), syndicIdOf(req), req.file) });
});

export const removeSyndicateLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await removeSyndicateLogo(tenantIdOf(req), syndicIdOf(req)) });
});

export const readSyndicateLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  sendImage(res, await readSyndicateLogo(tenantIdOf(req), syndicIdOf(req)));
});

// ------------------------------------------------------------ signature et cachet de l'agence

export const getAgencyDocumentIdentityHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getAgencyDocumentIdentity(tenantIdOf(req)) });
});

export const uploadAgencyImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseAgencyImageKind(req.params.kind);
  res.json({ success: true, data: await uploadAgencyImage(tenantIdOf(req), kind, req.file, req.user?.userId) });
});

export const removeAgencyImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseAgencyImageKind(req.params.kind);
  res.json({ success: true, data: await removeAgencyImage(tenantIdOf(req), kind, req.user?.userId) });
});

export const readAgencyImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseAgencyImageKind(req.params.kind);
  sendImage(res, await readAgencyImage(tenantIdOf(req), kind));
});
