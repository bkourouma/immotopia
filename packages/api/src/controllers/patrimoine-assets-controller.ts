import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createAssetSchema,
  updateAssetSchema,
  disposeAssetSchema,
  listAssetsQuerySchema,
  createAssetValuationSchema,
  updateAssetValuationSchema,
  createDebtSchema,
  updateDebtSchema,
  listDebtsQuerySchema,
  setAssetHoldingSchema,
  netWorthQuerySchema,
  netWorthHistoryQuerySchema
} from '../lib/patrimoine/asset-schemas';
import {
  createAsset,
  listAssets,
  getAsset,
  updateAsset,
  disposeAsset,
  archiveAsset,
  listAssetValuations,
  createAssetValuation,
  updateAssetValuation,
  deleteAssetValuation,
  listDebts,
  createDebt,
  updateDebt,
  deleteDebt,
  listAssetHoldings,
  setAssetHolding,
  deleteAssetHolding,
  getNetWorth,
  getNetWorthHistory
} from '../services/patrimoine-assets-service';

/**
 * Contrôleurs du patrimoine multi-actifs (lot 1). Contrat :
 * `specs/023-patrimoine-multi-actifs/contracts/api.md`. Modèle :
 * `controllers/property-media-controller.ts` (`asyncHandler` + erreurs typées).
 */

const uuid = z.string().uuid();

function requireTenantId(req: Request): string {
  const tenantId = req.propertyTenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

/** Auteur de l'action, pour le journal d'audit. */
function actor(req: Request): string | undefined {
  return req.user?.userId;
}

/** Un identifiant de chemin mal formé est une requête invalide, pas une erreur de base. */
function idParam(req: Request, name: string): string {
  return uuid.parse(req.params[name]);
}

export const listAssetsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listAssetsQuerySchema.parse(req.query ?? {});
  res.json({ data: await listAssets(requireTenantId(req), query) });
});

export const createAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createAssetSchema.parse(req.body ?? {});
  res.status(201).json({ data: await createAsset(requireTenantId(req), body, actor(req)) });
});

export const getAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await getAsset(requireTenantId(req), idParam(req, 'assetId')) });
});

export const updateAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateAssetSchema.parse(req.body ?? {});
  res.json({ data: await updateAsset(requireTenantId(req), idParam(req, 'assetId'), body, actor(req)) });
});

export const disposeAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = disposeAssetSchema.parse(req.body ?? {});
  res.json({ data: await disposeAsset(requireTenantId(req), idParam(req, 'assetId'), body.disposedAt, actor(req)) });
});

export const archiveAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await archiveAsset(requireTenantId(req), idParam(req, 'assetId'), actor(req)) });
});

export const listAssetValuationsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await listAssetValuations(requireTenantId(req), idParam(req, 'assetId')) });
});

export const createAssetValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createAssetValuationSchema.parse(req.body ?? {});
  const data = await createAssetValuation(requireTenantId(req), idParam(req, 'assetId'), body, actor(req));
  res.status(201).json({ data });
});

export const updateAssetValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateAssetValuationSchema.parse(req.body ?? {});
  const data = await updateAssetValuation(
    requireTenantId(req),
    idParam(req, 'assetId'),
    idParam(req, 'valuationId'),
    body,
    actor(req)
  );
  res.json({ data });
});

export const deleteAssetValuationHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteAssetValuation(requireTenantId(req), idParam(req, 'assetId'), idParam(req, 'valuationId'), actor(req));
  res.status(204).send();
});

export const listDebtsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listDebtsQuerySchema.parse(req.query ?? {});
  res.json({ data: await listDebts(requireTenantId(req), query) });
});

export const createDebtHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createDebtSchema.parse(req.body ?? {});
  res.status(201).json({ data: await createDebt(requireTenantId(req), body, actor(req)) });
});

export const updateDebtHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateDebtSchema.parse(req.body ?? {});
  res.json({ data: await updateDebt(requireTenantId(req), idParam(req, 'debtId'), body, actor(req)) });
});

export const deleteDebtHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteDebt(requireTenantId(req), idParam(req, 'debtId'), actor(req));
  res.status(204).send();
});

export const listAssetHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await listAssetHoldings(requireTenantId(req), idParam(req, 'assetId')) });
});

export const setAssetHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = setAssetHoldingSchema.parse(req.body ?? {});
  const data = await setAssetHolding(
    requireTenantId(req),
    idParam(req, 'assetId'),
    idParam(req, 'entityId'),
    body,
    actor(req)
  );
  res.json({ data });
});

export const deleteAssetHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteAssetHolding(requireTenantId(req), idParam(req, 'assetId'), idParam(req, 'entityId'), actor(req));
  res.status(204).send();
});

export const getNetWorthHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = netWorthQuerySchema.parse(req.query ?? {});
  res.json({ data: await getNetWorth(requireTenantId(req), query) });
});

export const getNetWorthHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = netWorthHistoryQuerySchema.parse(req.query ?? {});
  res.json({ data: await getNetWorthHistory(requireTenantId(req), query) });
});
