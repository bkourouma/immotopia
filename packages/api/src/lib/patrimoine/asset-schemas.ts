import { z } from 'zod';
import {
  ASSET_CLASSES,
  MAX_VALUATION_AMOUNT,
  parseAssetDetails,
  type AssetDetails,
  type ValuationMethodKey
} from './assets';
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
/** Les 11 méthodes de l'enum Prisma `ValuationMethod` (lot 2) ; `satisfies` garde la liste alignée sur le domaine. */
export const VALUATION_METHODS = [
  'MANUAL',
  'MARKET_ESTIMATE',
  'EXPERT_APPRAISAL',
  'DEPRECIATION_LINEAR',
  'DEPRECIATION_DECLINING',
  'EQUITY_SHARE',
  'UNIT_COST',
  'BALANCE',
  'ACCRUED_SAVINGS',
  'DISCOUNTED_CLAIM',
  'UNIT_VALUE'
] as const satisfies readonly ValuationMethodKey[];
const LOAN_STATUSES = ['ACTIVE', 'CLOSED', 'DEFAULTED'] as const;
const ASSET_STATUSES = ['ACTIVE', 'DISPOSED', 'ARCHIVED'] as const;

/** Bornes de taille des textes : courts (noms, prêteur, source) et libres (notes). */
export const SHORT_TEXT_MAX = 200;
export const NOTES_MAX = 2000;

/** Plafonds alignés sur les colonnes Prisma (`Decimal(14,2)`, `Decimal(6,4)`, `Decimal(18,6)`). */
export const MAX_MONEY = MAX_VALUATION_AMOUNT;
export const MAX_INTEREST_RATE = 99.9999;
export const MIN_EXCHANGE_RATE = 0.000001;
export const MAX_EXCHANGE_RATE = 1_000_000_000;

const optionalNullableText = z.string().trim().max(NOTES_MAX).nullable().optional();
const optionalNullableShortText = z.string().trim().max(SHORT_TEXT_MAX).nullable().optional();

const positiveMoney = z.number().finite().positive().max(MAX_MONEY);
const nonNegativeMoney = z.number().finite().nonnegative().max(MAX_MONEY);

/** Fenêtre de dates acceptée : 1900-01-01 à 2100-12-31 inclus. */
const DATE_MIN_MS = Date.UTC(1900, 0, 1);
const DATE_MAX_MS = Date.UTC(2100, 11, 31, 23, 59, 59, 999);
const DATE_ERROR = 'Date AAAA-MM-JJ (ou ISO 8601) valide entre 1900 et 2100 attendue';
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$/;

/** Une chaîne `AAAA-MM-JJ` ou ISO 8601 réellement existante et dans la fenêtre ; `null` sinon. */
export function parseStrictDate(value: string): Date | null {
  const match = DATETIME_RE.exec(value) ?? DAY_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  // Une date-heure sans fuseau est lue en UTC, jamais dans le fuseau du serveur.
  const hasZone = DAY_RE.test(value) || match[4] !== undefined;
  const date = new Date(hasZone ? value : `${value}Z`);
  const time = date.getTime();
  return Number.isNaN(time) || time < DATE_MIN_MS || time > DATE_MAX_MS ? null : date;
}

/** Remplace `z.coerce.date()` : refuse `null`, nombres et booléens, n'accepte qu'une chaîne de date valide. */
const strictDate = z
  .string({ invalid_type_error: DATE_ERROR, required_error: 'Champ obligatoire' })
  .transform((value, ctx) => {
    const date = parseStrictDate(value);
    if (!date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: DATE_ERROR });
      return z.NEVER;
    }
    return date;
  });
/** Date facultative : `null` reste permis pour effacer la valeur ; nombres et booléens sont refusés. */
const optionalNullableDate = strictDate.nullable().optional();

export const EXPERT_SOURCE_MESSAGE = 'Une expertise exige une source (nom de l’expert ou référence du rapport).';

/** Une expertise sans source ne prouve rien : erreur sur le champ `source`. */
function requireExpertSource(value: { method?: string; source?: string | null }, ctx: z.RefinementCtx): void {
  if (value.method === 'EXPERT_APPRAISAL' && !value.source) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: EXPERT_SOURCE_MESSAGE, path: ['source'] });
  }
}

export const initialValuationSchema = z
  .object({
    valuatedAt: strictDate,
    estimatedValue: positiveMoney,
    method: z.enum(VALUATION_METHODS).default('MANUAL'),
    source: optionalNullableShortText,
    notes: optionalNullableText
  })
  .strict()
  .superRefine(requireExpertSource);

const assetFields = {
  name: z.string().trim().min(1).max(SHORT_TEXT_MAX),
  currency: CURRENCY.optional(),
  exchangeRateToXof: z.number().finite().min(MIN_EXCHANGE_RATE).max(MAX_EXCHANGE_RATE).nullable().optional(),
  acquisitionCost: nonNegativeMoney.nullable().optional(),
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

export const disposeAssetSchema = z.object({ disposedAt: strictDate }).strict();

export const listAssetsQuerySchema = z
  .object({
    assetClass: z.enum(ASSET_CLASSES).optional(),
    status: z.enum(ASSET_STATUSES).optional(),
    search: z.string().trim().max(200).optional()
  })
  .strict();

const valuationFields = {
  valuatedAt: strictDate,
  estimatedValue: positiveMoney,
  currency: CURRENCY.optional(),
  method: z.enum(VALUATION_METHODS).optional(),
  source: optionalNullableShortText,
  notes: optionalNullableText
};

export const createAssetValuationSchema = z.object(valuationFields).strict().superRefine(requireExpertSource);

/**
 * PATCH : la source finale d'une expertise se vérifie sur la ligne fusionnée
 * (service). Ici, seul un corps qui pose `method = EXPERT_APPRAISAL` en effaçant
 * la source, ou en la laissant vide, est refusé d'emblée.
 */
export const updateAssetValuationSchema = z
  .object(valuationFields)
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Au moins un champ est requis' })
  .superRefine((value, ctx) => {
    if (value.method === 'EXPERT_APPRAISAL' && value.source !== undefined) requireExpertSource(value, ctx);
  });

const debtFields = {
  lender: z.string().trim().min(2).max(SHORT_TEXT_MAX),
  capitalAmount: positiveMoney,
  remainingCapital: nonNegativeMoney,
  // Un prêt à taux zéro (familial, employeur) est un cas réel.
  interestRate: z.number().finite().nonnegative().max(MAX_INTEREST_RATE),
  monthlyPayment: nonNegativeMoney,
  currency: CURRENCY.optional(),
  startDate: strictDate,
  endDate: strictDate,
  status: z.enum(LOAN_STATUSES).optional()
};

export const createDebtSchema = z
  .object({ ...debtFields, assetId: z.string().uuid().nullable().optional() })
  .strict()
  // Une date déjà invalide (z.NEVER) est signalée par son propre champ : pas de second message ici.
  .refine(
    value => !(value.endDate instanceof Date && value.startDate instanceof Date) || value.endDate >= value.startDate,
    {
      message: 'La date de fin doit suivre la date de début',
      path: ['endDate']
    }
  );

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
    effectiveFrom: optionalNullableDate
  })
  .strict();

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date AAAA-MM-JJ attendue');

/** Suggestion de valeur (lot 2) : `asOf` facultatif, défaut aujourd'hui. */
export const suggestValuationSchema = z
  .object({ asOf: isoDay.refine(value => parseStrictDate(value) !== null, DATE_ERROR).optional() })
  .strict();

export const netWorthQuerySchema = z.object({ asOf: isoDay.optional() }).strict();

export const netWorthHistoryQuerySchema = z
  .object({ from: isoDay.optional(), to: isoDay.optional(), step: z.literal('month').optional() })
  .strict();

/** Taille sérialisée maximale des `details` d'un actif. */
export const ASSET_DETAILS_MAX_BYTES = 8 * 1024;

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
  if (Buffer.byteLength(JSON.stringify(details ?? {}), 'utf8') > ASSET_DETAILS_MAX_BYTES) {
    throw new ValidationError('Les détails de l’actif sont invalides.', [
      { field: 'details', message: `Les détails dépassent ${ASSET_DETAILS_MAX_BYTES / 1024} Ko.` }
    ]);
  }
  const parsed = parseAssetDetails(assetClass, stripNullDetails(details));
  if (parsed.success) return parsed.data;

  throw new ValidationError(
    'Les détails de l’actif sont invalides.',
    parsed.issues.map(issue => ({ field: issue.path ? `details.${issue.path}` : 'details', message: issue.message }))
  );
}
