import { Request, Response } from 'express';
import { z } from 'zod';
import { CapacityKey, ModuleKey, QuotaPolicy } from '@prisma/client';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import {
  addSubscriptionItem,
  changePack,
  clearModuleOverride,
  clearSubscriptionManualReadOnly,
  getEntitlements,
  getSubscriptionOverview,
  grantCapacityOverride,
  listCapacityOverrides,
  listCatalog,
  previewNextInvoice,
  removeSubscriptionItem,
  revokeCapacityOverride,
  setSubscriptionManualReadOnly,
  updateCatalogItem,
  updateSubscriptionSettings
} from '../services/subscription-v2-service';
import { reconcileLotActivations } from '../services/lot-registry-service';
import { estimateMonthly, annualPrice } from '../lib/subscription';

/**
 * Abonnements par packs — routes super-admin (/api/admin, permissions
 * PLATFORM_SUBSCRIPTIONS_*) et lecture des droits par l'agence elle-meme.
 * Modele : property-media-controller.ts (asyncHandler + erreurs typees).
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md.
 */

function actor(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError('Authentification requise.');
  return userId;
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestError(
      'Données invalides',
      result.error.errors.map(e => ({ field: e.path.join('.') || '(racine)', message: e.message }))
    );
  }
  return result.data;
}

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform(value => new Date(value));

const rulesSchema = z
  .object({
    byHeldPacks: z.array(z.object({ anyOf: z.array(z.string()).min(1), monthlyPrice: z.number().nonnegative() })).optional(),
    lotTiers: z
      .array(
        z.object({
          onlyPacks: z.array(z.string()).min(1),
          fromLot: z.number().int().positive(),
          monthlyPrice: z.number().nonnegative()
        })
      )
      .optional(),
    requiresAnyOf: z.array(z.string()).optional()
  })
  .strict();

// ------------------------------------------------------------------ catalogue

/** GET /api/admin/catalog?all=1 */
export const listCatalogHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listCatalog({ includeUnsellable: req.query.all === '1' || req.query.all === 'true' });
  res.json({ success: true, data });
});

const catalogPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    monthlyPrice: z.number().nonnegative().optional(),
    setupPrice: z.number().nonnegative().optional(),
    isSellable: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    rules: rulesSchema.nullable().optional()
  })
  .strict();

/** PATCH /api/admin/catalog/:code — n'affecte aucun abonnement en cours (prix figes, D12). */
export const updateCatalogItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const patch = parse(catalogPatchSchema, req.body);
  const data = await updateCatalogItem(req.params.code, patch, actor(req));
  res.json({ success: true, data });
});

const quoteSchema = z.object({
  packs: z.array(z.string().trim().min(1)).min(1).max(4),
  lots: z.number().int().min(0).optional(),
  copros: z.number().int().min(0).optional(),
  chantiers: z.number().int().min(0).optional()
});

/** POST /api/admin/catalog/quote — estimation mensuelle et annuelle d'une composition (catalogue en base). */
export const quoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(quoteSchema, req.body);
  const catalog = await listCatalog({ includeUnsellable: true });
  let estimate;
  try {
    estimate = estimateMonthly(input, catalog);
  } catch (error) {
    throw new NotFoundError((error as Error).message);
  }
  res.json({ success: true, data: { ...estimate, monthly: estimate.subtotal, annual: annualPrice(estimate.subtotal) } });
});

// ------------------------------------------------------------------ abonnement d'une agence

/** GET /api/admin/tenants/:tenantId/subscription/overview */
export const getOverviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getSubscriptionOverview(req.params.tenantId);
  res.json({ success: true, data });
});

/** GET /api/admin/tenants/:tenantId/entitlements et GET /api/tenants/:tenantId/entitlements */
export const getEntitlementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getEntitlements(req.params.tenantId, { fresh: req.query.fresh === '1' });
  res.json({ success: true, data });
});

const addItemSchema = z.object({
  code: z.string().trim().min(1).max(40),
  quantity: z.number().int().min(1).max(1000).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  note: z.string().trim().max(500).optional()
});

/** POST /api/admin/tenants/:tenantId/subscription/items */
export const addItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(addItemSchema, req.body);
  const data = await addSubscriptionItem(req.params.tenantId, input, actor(req));
  res.status(201).json({ success: true, data });
});

const removeItemSchema = z.object({
  immediate: z.boolean().optional(),
  reason: z.string().trim().max(500).optional(),
  quantity: z.number().int().min(1).optional()
});

/** DELETE /api/admin/tenants/:tenantId/subscription/items/:itemId — a l'echeance par defaut (D7). */
export const removeItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(removeItemSchema, req.body ?? {});
  const data = await removeSubscriptionItem(req.params.tenantId, req.params.itemId, input, actor(req));
  res.json({ success: true, data });
});

const changePackSchema = z.object({
  fromCodes: z.array(z.string().trim().min(1)).min(1).max(3),
  toCode: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional()
});

/** POST /api/admin/tenants/:tenantId/subscription/change-pack — montee immediate, descente a l'echeance (D7). */
export const changePackHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(changePackSchema, req.body);
  const data = await changePack(req.params.tenantId, input, actor(req));
  res.json({ success: true, data });
});

const settingsSchema = z
  .object({
    quotaPolicy: z.nativeEnum(QuotaPolicy).optional(),
    graceDays: z.number().int().min(0).max(90).optional(),
    comboDiscountPercent: z.number().min(0).max(100).optional(),
    trialEndsAt: isoDate.optional()
  })
  .strict();

/** PATCH /api/admin/tenants/:tenantId/subscription/settings */
export const updateSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(settingsSchema, req.body);
  const data = await updateSubscriptionSettings(req.params.tenantId, input, actor(req));
  res.json({ success: true, data });
});

const manualReadOnlySchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

/**
 * POST /api/admin/tenants/:tenantId/subscription/manual-read-only — lecture
 * seule manuelle (Baba, 25/09), independante de la lecture seule d'impaye.
 */
export const setManualReadOnlyHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(manualReadOnlySchema, req.body);
  const data = await setSubscriptionManualReadOnly(req.params.tenantId, input.reason, actor(req));
  res.json({ success: true, data });
});

/** DELETE /api/admin/tenants/:tenantId/subscription/manual-read-only */
export const clearManualReadOnlyHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await clearSubscriptionManualReadOnly(req.params.tenantId, actor(req));
  res.json({ success: true, data });
});

// ------------------------------------------------------------------ derogations

/** GET /api/admin/tenants/:tenantId/subscription/overrides */
export const listOverridesHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listCapacityOverrides(req.params.tenantId);
  res.json({ success: true, data });
});

const grantOverrideSchema = z.object({
  capacityKey: z.nativeEnum(CapacityKey),
  delta: z.number().int(),
  reason: z.string().trim().min(3).max(500),
  startsAt: isoDate.optional(),
  expiresAt: isoDate.nullable().optional()
});

/** POST /api/admin/tenants/:tenantId/subscription/overrides */
export const grantOverrideHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(grantOverrideSchema, req.body);
  const data = await grantCapacityOverride(req.params.tenantId, input, actor(req));
  res.status(201).json({ success: true, data });
});

/** DELETE /api/admin/tenants/:tenantId/subscription/overrides/:overrideId */
export const revokeOverrideHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await revokeCapacityOverride(req.params.tenantId, req.params.overrideId, actor(req));
  res.json({ success: true, data });
});

// ------------------------------------------------------------------ facture, lots, modules

/** GET /api/admin/tenants/:tenantId/subscription/invoice-preview — rien n'est emis. */
export const invoicePreviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await previewNextInvoice(req.params.tenantId);
  res.json({ success: true, data });
});

/** POST /api/admin/tenants/:tenantId/subscription/lots/reconcile { dryRun? } */
export const reconcileLotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { dryRun } = parse(z.object({ dryRun: z.boolean().optional() }), req.body ?? {});
  const result = await reconcileLotActivations(req.params.tenantId, { dryRun, actorUserId: actor(req) });
  res.json({
    success: true,
    data: {
      ...result,
      added: result.added.length,
      removed: result.removed.length,
      addedUnits: result.added.slice(0, 200),
      removedUnits: result.removed.slice(0, 200)
    }
  });
});

/** DELETE /api/admin/tenants/:tenantId/modules/:moduleKey/override — rend le module a ses packs. */
export const clearModuleOverrideHandler = asyncHandler(async (req: Request, res: Response) => {
  const moduleKey = parse(z.nativeEnum(ModuleKey), req.params.moduleKey);
  const data = await clearModuleOverride(req.params.tenantId, moduleKey, actor(req));
  res.json({ success: true, data });
});
