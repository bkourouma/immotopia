import { Request, Response } from 'express';
import { z } from 'zod';
import { createSignatureSchema, listSignaturesSchema } from '../lib/signature/schemas';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import {
  cancelSignatureRequest,
  createSignatureRequest,
  getSignatureRequest,
  listSignatureRequests,
  reissueInPersonToken,
  remindSignatureRequest,
  sendSignatureFile
} from '../services/signature-service';

/**
 * Contrôleurs « agence » de la signature électronique (spec 044, lot S1).
 * L'agence et l'utilisateur viennent du contexte posé par `requireTenantAccess`,
 * jamais du corps de la requête.
 */

function ctxOf(req: Request) {
  const tenantId = req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  if (!tenantId || !userId) throw new UnauthorizedError();
  return { tenantId, userId };
}

const idSchema = z.string().uuid();
const fileQuerySchema = z.object({ variant: z.enum(['source', 'signed']).default('source') });

export const createSignatureHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSignatureSchema.parse(req.body ?? {});
  const data = await createSignatureRequest(ctxOf(req), input);
  // La réponse porte les jetons de signature sur place (une seule fois) : jamais en cache.
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ success: true, data });
});

export const listSignaturesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId: _ignored, ...query } = req.query as Record<string, unknown>;
  void _ignored;
  const filters = listSignaturesSchema.parse(query);
  const data = await listSignatureRequests(ctxOf(req).tenantId, filters);
  res.json({ success: true, data });
});

export const getSignatureHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getSignatureRequest(ctxOf(req).tenantId, idSchema.parse(req.params.id));
  res.json({ success: true, data });
});

export const cancelSignatureHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await cancelSignatureRequest(ctxOf(req), idSchema.parse(req.params.id));
  res.json({ success: true, data });
});

export const remindSignatureHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await remindSignatureRequest(ctxOf(req), idSchema.parse(req.params.id));
  res.json({ success: true, data });
});

export const reissueInPersonTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reissueInPersonToken(
    ctxOf(req),
    idSchema.parse(req.params.id),
    idSchema.parse(req.params.signerId)
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

export const signatureFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId: _ignored, ...query } = req.query as Record<string, unknown>;
  void _ignored;
  const parsed = fileQuerySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestError('Variante de fichier invalide.');
  await sendSignatureFile(ctxOf(req).tenantId, idSchema.parse(req.params.id), parsed.data.variant, res);
});
