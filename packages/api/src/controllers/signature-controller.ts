import { Request, Response } from 'express';
import { SignatureDocumentKind } from '@prisma/client';
import { z } from 'zod';
import { createSignatureSchema, listSignaturesSchema, signatureSummarySchema } from '../lib/signature/schemas';
import { permittedSignatureKinds } from '../middleware/signature-access-middleware';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import {
  cancelSignatureRequest,
  createSignatureRequest,
  getSignatureRequest,
  getSignatureSummary,
  getSignatureTargetContext,
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
const fileQuerySchema = z.object({ variant: z.enum(['source', 'signed', 'evidence']).default('source') });

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
  const { tenantId, userId } = ctxOf(req);
  // La liste ne montre que les types de document que l'utilisateur a le droit de lire.
  const data = await listSignatureRequests(tenantId, filters, await permittedSignatureKinds(userId, tenantId));
  res.json({ success: true, data });
});

export const signatureSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId: _ignored, ...query } = req.query as Record<string, unknown>;
  void _ignored;
  const filters = signatureSummarySchema.parse(query);
  const { tenantId, userId } = ctxOf(req);
  const data = await getSignatureSummary(tenantId, filters, await permittedSignatureKinds(userId, tenantId));
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
  const { tenantId, userId } = ctxOf(req);
  await sendSignatureFile(tenantId, idSchema.parse(req.params.id), parsed.data.variant, res, userId);
});

const targetContextParams = z.object({
  kind: z.nativeEnum(SignatureDocumentKind),
  targetId: z.string().trim().min(1).max(64)
});

/** Contexte d'une cible (signataires proposés) : permission d'écriture du type, vérifiée par la route. */
export const signatureTargetContextHandler = asyncHandler(async (req: Request, res: Response) => {
  const { kind, targetId } = targetContextParams.parse(req.params);
  const data = await getSignatureTargetContext(ctxOf(req), kind, targetId);
  res.json({ success: true, data });
});
