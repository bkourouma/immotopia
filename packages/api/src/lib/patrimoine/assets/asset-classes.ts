/**
 * Classes d'actifs du patrimoine et schémas de leurs détails (lot 1 du
 * patrimoine multi-actifs, ADR-005, `specs/023-patrimoine-multi-actifs`).
 *
 * Module de domaine pur : aucune dépendance à Prisma. Les clés de
 * `ASSET_CLASSES` reprennent à l'identique l'enum Prisma `AssetClass` ; c'est
 * la couche service qui garantit la correspondance.
 *
 * Les `details` d'un actif sont un JSON libre côté base : la validation vit
 * ici, un schéma strict par classe. `ASSET_DETAILS_VERSION` permet de faire
 * évoluer ces schémas sans réécrire les lignes déjà stockées.
 */

import { z } from 'zod';

export const ASSET_CLASSES = [
  'REAL_ESTATE',
  'BUSINESS_EQUITY',
  'INVENTORY',
  'VEHICLE_EQUIPMENT',
  'CASH',
  'SAVINGS_INVESTMENT',
  'RECEIVABLE',
  'AGRICULTURE',
  'MOVABLE',
  'OTHER'
] as const;

export type AssetClassKey = (typeof ASSET_CLASSES)[number];

/** Version courante des schémas de `details` ; à incrémenter à toute évolution incompatible. */
export const ASSET_DETAILS_VERSION = 2;

/**
 * Libellés français des classes. Le texte français est la clé de traduction
 * (`t()`), donc ces chaînes doivent rester exactes et stables.
 */
export const ASSET_CLASS_LABELS: Record<AssetClassKey, string> = {
  REAL_ESTATE: 'Immobilier',
  BUSINESS_EQUITY: 'Entreprises et parts de sociétés',
  INVENTORY: 'Stocks et marchandises',
  VEHICLE_EQUIPMENT: 'Véhicules et équipements',
  CASH: 'Comptes et mobile money',
  SAVINGS_INVESTMENT: 'Épargne et placements',
  RECEIVABLE: 'Créances',
  AGRICULTURE: 'Agriculture et élevage',
  MOVABLE: 'Biens meubles de valeur',
  OTHER: 'Autre'
};

const LEGAL_FORMS = ['SARL', 'SA', 'SAS', 'SCI', 'GIE', 'SNC', 'EI', 'AUTRE'] as const;
const CASH_KINDS = ['BANK', 'MOBILE_MONEY', 'CASH_ON_HAND'] as const;
const SAVINGS_KINDS = ['PLACEMENT', 'TONTINE', 'LIFE_INSURANCE', 'OTHER'] as const;
const AGRICULTURE_KINDS = ['PLANTATION', 'LIVESTOCK', 'HARVEST'] as const;
const DEPRECIATION_METHODS = ['LINEAR', 'DECLINING'] as const;

/** Statuts juridiques d'un bien immobilier ; `AUTRE` est neutre : ni plafond bas, ni absence. */
export const ASSET_LEGAL_STATUSES = [
  'TITRE_FONCIER',
  'ACD',
  'CERTIFICAT_PROPRIETE',
  'LETTRE_ATTRIBUTION',
  'ATTESTATION_COUTUMIERE',
  'AUTRE'
] as const;
export type AssetLegalStatus = (typeof ASSET_LEGAL_STATUSES)[number];

/** Statuts qui plafonnent la fiabilité d'une valeur à « faible ». */
export const FRAGILE_LEGAL_STATUSES: readonly AssetLegalStatus[] = ['LETTRE_ATTRIBUTION', 'ATTESTATION_COUTUMIERE'];

/** Année maximale d'un véhicule : l'année en cours + 1 (modèles annoncés), évaluée à chaque validation. */
const MIN_VEHICLE_YEAR = 1950;
const maxVehicleYear = () => new Date().getFullYear() + 1;

/** Bornes de taille : un détail n'est jamais un fourre-tout (déni de service, débordement d'affichage). */
export const SHORT_TEXT_MAX = 200;
const MAX_QUANTITY = 999_999_999_999.99;

const requiredText = z.string().trim().min(1).max(SHORT_TEXT_MAX);
const optionalText = z.string().trim().min(1).max(SHORT_TEXT_MAX).optional();
const percent = z.number().finite().min(0).max(100);
const nonNegativeAmount = z.number().finite().min(0).max(MAX_QUANTITY);
/** Durée d'utilité : entier ou décimal, de 1 à 50 ans. */
const usefulLifeYears = z.number().finite().min(1).max(50);
/** Multiple de résultat strictement positif, plafonné à 100. */
const earningsMultiple = z.number().finite().gt(0).max(100);

/** Date ISO : `AAAA-MM-JJ` ou date-heure ISO 8601, et réellement existante. */
const isoDate = z
  .string()
  .max(40)
  .refine(value => /^\d{4}-\d{2}-\d{2}(T.+)?$/.test(value) && !Number.isNaN(Date.parse(value)), {
    message: 'Date ISO invalide (format AAAA-MM-JJ attendu)'
  });

export const realEstateDetailsSchema = z.object({ legalStatus: z.enum(ASSET_LEGAL_STATUSES).optional() }).strict();

export const businessEquityDetailsSchema = z
  .object({
    companyName: requiredText,
    legalForm: z.enum(LEGAL_FORMS),
    country: requiredText,
    ownershipPercent: percent,
    sector: optionalText,
    companyValue: nonNegativeAmount.optional(),
    netIncome: nonNegativeAmount.optional(),
    earningsMultiple: earningsMultiple.optional()
  })
  .strict();

export const inventoryDetailsSchema = z
  .object({
    designation: requiredText,
    quantity: nonNegativeAmount,
    unit: requiredText,
    unitCost: nonNegativeAmount,
    writeDownPercent: percent.optional()
  })
  .strict();

export const vehicleEquipmentDetailsSchema = z
  .object({
    kind: requiredText,
    brand: optionalText,
    model: optionalText,
    year: z
      .number()
      .int()
      .min(MIN_VEHICLE_YEAR)
      .refine(year => year <= maxVehicleYear(), {
        message: `L'année doit être comprise entre ${MIN_VEHICLE_YEAR} et l'année en cours + 1`
      })
      .optional(),
    registration: optionalText,
    usefulLifeYears: usefulLifeYears.optional(),
    residualValuePercent: percent.optional(),
    depreciationMethod: z.enum(DEPRECIATION_METHODS).optional(),
    decliningRatePercent: percent.optional()
  })
  .strict();

/** Jamais un numéro de compte complet : exactement quatre chiffres, pour reconnaître le compte sans l'exposer. */
export const cashDetailsSchema = z
  .object({
    institution: requiredText,
    cashKind: z.enum(CASH_KINDS),
    accountLast4: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
  })
  .strict();

export const savingsInvestmentDetailsSchema = z
  .object({
    savingsKind: z.enum(SAVINGS_KINDS),
    organization: optionalText,
    expectedRatePercent: percent.optional(),
    principal: nonNegativeAmount.optional()
  })
  .strict();

export const receivableDetailsSchema = z
  .object({
    debtor: requiredText,
    dueDate: isoDate.optional(),
    ratePercent: percent.optional(),
    principal: nonNegativeAmount.optional(),
    collectibilityPercent: percent.optional()
  })
  .strict();

export const agricultureDetailsSchema = z
  .object({
    agricultureKind: z.enum(AGRICULTURE_KINDS),
    crop: optionalText,
    areaHectares: nonNegativeAmount.optional(),
    headcount: z.number().int().min(0).max(1_000_000_000).optional(),
    unitValue: nonNegativeAmount.optional()
  })
  .strict();

export const movableDetailsSchema = z
  .object({
    designation: requiredText,
    category: optionalText
  })
  .strict();

export const otherDetailsSchema = z.object({ label: requiredText }).strict();

export const ASSET_DETAILS_SCHEMAS = {
  REAL_ESTATE: realEstateDetailsSchema,
  BUSINESS_EQUITY: businessEquityDetailsSchema,
  INVENTORY: inventoryDetailsSchema,
  VEHICLE_EQUIPMENT: vehicleEquipmentDetailsSchema,
  CASH: cashDetailsSchema,
  SAVINGS_INVESTMENT: savingsInvestmentDetailsSchema,
  RECEIVABLE: receivableDetailsSchema,
  AGRICULTURE: agricultureDetailsSchema,
  MOVABLE: movableDetailsSchema,
  OTHER: otherDetailsSchema
} as const satisfies Record<AssetClassKey, z.ZodTypeAny>;

export type AssetDetails = {
  [K in AssetClassKey]: z.infer<(typeof ASSET_DETAILS_SCHEMAS)[K]>;
}[AssetClassKey];

export interface AssetDetailsIssue {
  path: string;
  message: string;
}

export type ParseAssetDetailsResult =
  { success: true; data: AssetDetails } | { success: false; issues: AssetDetailsIssue[] };

/** Messages de validation en français, posés à l'appel plutôt que globalement pour ne pas toucher au reste de l'API. */
const frenchErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' ? 'Champ obligatoire' : 'Type de valeur invalide' };
    case 'too_small':
      if (issue.type === 'string') return { message: 'Le champ ne peut pas être vide' };
      return { message: `La valeur doit être supérieure ou égale à ${issue.minimum}` };
    case 'too_big':
      if (issue.type === 'string') return { message: `Le texte ne peut pas dépasser ${issue.maximum} caractères` };
      return { message: `La valeur doit être inférieure ou égale à ${issue.maximum}` };
    case 'invalid_enum_value':
      return { message: `Valeur non autorisée (attendu : ${issue.options.join(', ')})` };
    case 'invalid_string':
      return { message: 'Format invalide' };
    case 'custom':
      return { message: issue.message ?? ctx.defaultError };
    default:
      return { message: ctx.defaultError };
  }
};

function toIssues(error: z.ZodError): AssetDetailsIssue[] {
  return error.issues.flatMap(issue => {
    const path = issue.path.join('.');
    if (issue.code === 'unrecognized_keys') {
      // Un champ inconnu est signalé sous son propre nom, pas sous celui de l'objet parent.
      return issue.keys.map(key => ({
        path: path ? `${path}.${key}` : key,
        message: "Champ inconnu pour cette classe d'actif"
      }));
    }
    return [{ path, message: issue.message }];
  });
}

function isAssetClassKey(value: string): value is AssetClassKey {
  return (ASSET_CLASSES as readonly string[]).includes(value);
}

/**
 * Valide les `details` d'un actif selon sa classe. Ne lève jamais : le
 * résultat porte soit les données typées, soit la liste des problèmes.
 */
export function parseAssetDetails(assetClass: string, details: unknown): ParseAssetDetailsResult {
  if (!isAssetClassKey(assetClass)) {
    return { success: false, issues: [{ path: 'assetClass', message: "Classe d'actif inconnue" }] };
  }

  const parsed = ASSET_DETAILS_SCHEMAS[assetClass].safeParse(details, { errorMap: frenchErrorMap });
  if (parsed.success) {
    return { success: true, data: parsed.data as AssetDetails };
  }
  return { success: false, issues: toIssues(parsed.error) };
}
