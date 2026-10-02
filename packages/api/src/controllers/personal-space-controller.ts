import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../utils/idempotency';
import { createPersonalSpaceSchema } from '../services/personal-space/schemas';
import { createPersonalSpace } from '../services/personal-space/create-personal-space';
import { getAssetUsage } from '../services/personal-space/free-tier';

/**
 * Espace personnel en libre-service (lot 4B). Contrat :
 * specs/026-particuliers-libre-service/plan.md. Modele :
 * controllers/property-media-controller.ts (`asyncHandler` + erreurs typees).
 */

/**
 * POST /api/personal-space
 * L'utilisateur vient du jeton (`req.user`), jamais du corps.
 */
export const createPersonalSpaceHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError('Authentification requise.');

  const body = createPersonalSpaceSchema.parse(req.body ?? {});

  const idempotencyKey = req.header('Idempotency-Key');
  if (idempotencyKey && idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new BadRequestError(
      `L'en-tête Idempotency-Key ne doit pas dépasser ${IDEMPOTENCY_KEY_MAX_LENGTH} caractères.`
    );
  }

  const { result, replay } = await createPersonalSpace(userId, body, idempotencyKey || undefined);
  if (replay) res.setHeader('Idempotent-Replayed', 'true');
  res.status(201).json({ data: result });
});

/** GET /api/tenants/:tenantId/patrimoine/usage */
export const getPatrimoineUsageHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.propertyTenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  res.json({ data: await getAssetUsage(tenantId) });
});
