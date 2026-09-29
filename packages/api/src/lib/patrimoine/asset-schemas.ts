import { z } from 'zod';
import { ASSET_CLASSES, parseAssetDetails, type AssetDetails } from './assets';
import { ValidationError } from '../../middleware/error-middleware';

/**
 * Corps de requête des routes `/patrimoine/assets`, `/patrimoine/debts` et des
 * parts d'actifs (contrat : `specs/023-patrimoine-multi-actifs/contracts/api.md`).
 * Schémas `.strict()` : un champ inattendu est rejeté. Un `ZodError` remonte via
 * `asyncHandler` (400 avec le détail par champ).
 */

const CURRENCY = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Devise ISO à trois lettres attendue')
  .transform(value => value.toUpperCase());
const VALUATION_METHODS = ['MANUAL', 'MARKET_ESTIMATE', 'EXPERT_APPRAISAL'] as const;
const LOAN_STATUSES = ['ACTIVE', 'CLOSED', 'DEFAULTED'] as const;
const ASSET_STATUSES = ['ACTIVE', 'DISPOSED', 'ARCHIVED'] as const;

const optionalNullableText = z.string().trim().max(2000).nullable().optional();
const optionalNullableDate = z.coerce.date().nullable().optional();

export const initialValuationSchema = z
  .object({
    valuatedAt: z.coerce.date(),
    estimatedValue: z.number().positive(),
    method: z.enum(VALUATION_METHODS).default('MANUAL'),
    source: optionalNullableText,
    notes: optionalNullableText
  })
  .strict();

const assetFields = {
  name: z.string().trim().min(1).max(200),
  currency: CURRENCY.optional(),
  exchangeRateToXof: z.number().positive().nullable().optional(),
  acquisitionCost: z.number().nonnegative().nullable().optional(),
  acquisitionDate: optionalNullableDate,
  holdingEntityId: z.string().uuid().nullable().optional(),
  details: z.record(z.unknown()).optional(),
  notes: optionalNullableText
};

export const createAssetSchema = z
  .object({
    ...assetFields,
    assetClass: z.enum(ASSET_CLASSES),
    propertyId: z.string().trim().min(1).nullable().optional(),
    initialValuation: initialValuationSchema.optional()
  })
  .strict();

export const updateAssetSchema = z
  .object(assetFields)
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: "Au moins un champ est requis pour modifier l'actif" });

export const disposeAssetSchema = z.object({ disposedAt: z.coerce.date() }).strict();

export const listAssetsQuerySchema = z
  .object({
    assetClass: z.enum(ASSET_CLASSES).optional(),
    status: z.enum(ASSET_STATUSES).optional(),
    search: z.string().trim().max(200).optional()
  })
  .strict();

const valuationFields = {
  valuatedAt: z.coerce.date(),
  estimatedValue: z.number().positive(),
  currency: CURRENCY.optional(),
  method: z.enum(VALUATION_METHODS).optional(),
  source: optionalNullableText,
  notes: optionalNullableText
};

export const createAssetValuationSchema = z.object(valuationFields).strict();

export const updateAssetValuationSchema = z
  .object(valuationFields)
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Au moins un champ est requis' });

const debtFields = {
  lender: z.string().trim().min(2).max(200),
  capitalAmount: z.number().positive(),
  remainingCapital: z.number().nonnegative(),
  // Un prêt à taux zéro (familial, employeur) est un cas réel.
  interestRate: z.number().nonnegative(),
  monthlyPayment: z.number().nonnegative(),
  currency: CURRENCY.optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(LOAN_STATUSES).optional()
};

export const createDebtSchema = z
  .object({ ...debtFields, assetId: z.string().uuid().nullable().optional() })
  .strict()
  .refine(value => value.endDate.getTime() >= value.startDate.getTime(), {
    message: 'La date de fin doit suivre la date de début',
    path: ['endDate']
  });

export const updateDebtSchema = z
  .object(debtFields)
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Au moins un champ est requis' });

export const listDebtsQuerySchema = z
  .object({
    assetId: z.string().uuid().optional(),
    unattached: z.enum(['true', 'false']).optional()
  })
  .strict();

export const setAssetHoldingSchema = z
  .object({
    sharePercent: z.number().gt(0).max(100),
    effectiveFrom: z.coerce.date().nullable().optional()
  })
  .strict();

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date AAAA-MM-JJ attendue');

export const netWorthQuerySchema = z.object({ asOf: isoDay.optional() }).strict();

export const netWorthHistoryQuerySchema = z
  .object({ from: isoDay.optional(), to: isoDay.optional(), step: z.literal('month').optional() })
  .strict();

/** Retire les `null` d'un objet de détails : `parseAssetDetails` refuse `null` pour un champ facultatif. */
export function stripNullDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details ?? {}).filter(([, value]) => value !== null));
}

/**
 * Valide les `details` selon la classe. Échec : `ValidationError` typée dont
 * `errors` porte `{ field, message }` (forme commune de l'API), avec
 * `field = "details.<clé>"` pour un champ propre à la classe.
 */
export function validateAssetDetails(assetClass: string, details: Record<string, unknown> | undefined): AssetDetails {
  const parsed = parseAssetDetails(assetClass, stripNullDetails(details));
  if (parsed.success) return parsed.data;

  throw new ValidationError(
    'Les détails de l’actif sont invalides.',
    parsed.issues.map(issue => ({ field: issue.path ? `details.${issue.path}` : 'details', message: issue.message }))
  );
}
