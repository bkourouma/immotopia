import type {
  AssetClass,
  AssetStatus,
  NetWorthExclusionReason,
  Reliability,
  ReliabilityReason,
  ValuationMethod
} from '../../../services/patrimoine-assets-service';
import { t } from '../../../i18n/t';

/**
 * Classes d'actifs côté web : libellés et description des champs propres à
 * chaque classe (`details`), d'après `data-model.md` et les schémas du serveur
 * (`packages/api/src/lib/patrimoine/assets/asset-classes.ts`). Le formulaire
 * d'actif se construit depuis cette description ; le serveur reste l'autorité
 * de validation. Des fonctions, et non des constantes : `t()` se lit au rendu.
 */

export const ASSET_CLASS_KEYS: readonly AssetClass[] = [
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
];

/** Couleur de la classe dans les graphiques (repère visuel, jamais seul porteur de sens). */
export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  REAL_ESTATE: '#1677ff',
  BUSINESS_EQUITY: '#722ed1',
  INVENTORY: '#fa8c16',
  VEHICLE_EQUIPMENT: '#13c2c2',
  CASH: '#52c41a',
  SAVINGS_INVESTMENT: '#2f54eb',
  RECEIVABLE: '#eb2f96',
  AGRICULTURE: '#a0d911',
  MOVABLE: '#fa541c',
  OTHER: '#8c8c8c'
};

export function assetClassLabel(assetClass: AssetClass | string): string {
  switch (assetClass) {
    case 'REAL_ESTATE':
      return t('Immobilier');
    case 'BUSINESS_EQUITY':
      return t('Entreprises et parts de sociétés');
    case 'INVENTORY':
      return t('Stocks et marchandises');
    case 'VEHICLE_EQUIPMENT':
      return t('Véhicules et équipements');
    case 'CASH':
      return t('Comptes et mobile money');
    case 'SAVINGS_INVESTMENT':
      return t('Épargne et placements');
    case 'RECEIVABLE':
      return t('Créances');
    case 'AGRICULTURE':
      return t('Agriculture et élevage');
    case 'MOVABLE':
      return t('Biens meubles de valeur');
    case 'OTHER':
      return t('Autre');
    default:
      return String(assetClass);
  }
}

export function assetClassOptions(): Array<{ value: AssetClass; label: string }> {
  return ASSET_CLASS_KEYS.map(value => ({ value, label: assetClassLabel(value) }));
}

export function assetStatusLabel(status: AssetStatus | string): string {
  if (status === 'ACTIVE') return t('Actif');
  if (status === 'DISPOSED') return t('Cédé');
  if (status === 'ARCHIVED') return t('Archivé');
  return String(status);
}

export function assetStatusOptions(): Array<{ value: AssetStatus; label: string }> {
  return (['ACTIVE', 'DISPOSED', 'ARCHIVED'] as const).map(value => ({ value, label: assetStatusLabel(value) }));
}

export function exclusionReasonLabel(reason: NetWorthExclusionReason | string): string {
  switch (reason) {
    case 'NO_VALUATION':
      return t('Sans valeur');
    case 'MISSING_EXCHANGE_RATE':
      return t('Taux de change manquant');
    case 'DISPOSED':
      return t('Cédé');
    case 'ARCHIVED':
      return t('Archivé');
    default:
      return String(reason);
  }
}

// --- Valorisation par classe et fiabilité (lot 2) ---------------------------

export const VALUATION_METHODS: readonly ValuationMethod[] = [
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
];

export function valuationMethodName(method: ValuationMethod | string): string {
  switch (method) {
    case 'MANUAL':
      return t('Manuelle');
    case 'MARKET_ESTIMATE':
      return t('Estimation de marché');
    case 'EXPERT_APPRAISAL':
      return t('Expertise');
    case 'DEPRECIATION_LINEAR':
      return t('Amortissement linéaire');
    case 'DEPRECIATION_DECLINING':
      return t('Amortissement dégressif');
    case 'EQUITY_SHARE':
      return t("Quote-part de l'entreprise");
    case 'UNIT_COST':
      return t('Quantité × coût unitaire');
    case 'BALANCE':
      return t('Solde');
    case 'ACCRUED_SAVINGS':
      return t('Épargne capitalisée');
    case 'DISCOUNTED_CLAIM':
      return t('Créance décotée');
    case 'UNIT_VALUE':
      return t('Quantité × valeur unitaire');
    default:
      return String(method);
  }
}

export function reliabilityLabel(level: Reliability | null | undefined): string {
  if (level === 'HIGH') return t('Élevée');
  if (level === 'MEDIUM') return t('Moyenne');
  return t('Faible');
}

export function reliabilityReasonLabel(reason: ReliabilityReason | string): string {
  switch (reason) {
    case 'METHOD_EXPERT':
      return t('Expertise');
    case 'METHOD_BALANCE':
      return t('Solde saisi');
    case 'METHOD_COMPUTED':
      return t("Calculée à partir des caractéristiques de l'actif");
    case 'METHOD_MANUAL_WITH_SOURCE':
      return t('Saisie manuelle, source indiquée');
    case 'METHOD_MANUAL_NO_SOURCE':
      return t('Saisie manuelle, sans source');
    case 'STALE_ONE_LEVEL':
      return t('Valeur ancienne');
    case 'STALE_TWO_LEVELS':
      return t('Valeur très ancienne');
    case 'LEGAL_STATUS_FRAGILE':
      return t('Statut juridique fragile');
    case 'LEGAL_STATUS_UNKNOWN':
      return t('Statut juridique non renseigné');
    default:
      return String(reason);
  }
}

/** Statuts juridiques qui plafonnent la fiabilité à « faible » (règle du serveur). */
export const FRAGILE_LEGAL_STATUSES: readonly string[] = ['LETTRE_ATTRIBUTION', 'ATTESTATION_COUTUMIERE'];

const legalStatusOptions = () => [
  { value: 'TITRE_FONCIER', label: t('Titre foncier') },
  { value: 'ACD', label: t('Arrêté de concession définitive (ACD)') },
  { value: 'CERTIFICAT_PROPRIETE', label: t('Certificat de propriété ou de détention') },
  { value: 'LETTRE_ATTRIBUTION', label: t("Lettre d'attribution") },
  { value: 'ATTESTATION_COUTUMIERE', label: t('Attestation villageoise ou coutumière') },
  { value: 'AUTRE', label: t('Autre') }
];

const depreciationMethodOptions = () => [
  { value: 'LINEAR', label: t('Linéaire') },
  { value: 'DECLINING', label: t('Dégressif') }
];

// --- Champs propres à chaque classe ---------------------------------------

export type AssetFieldType = 'text' | 'number' | 'integer' | 'percent' | 'select' | 'date';

export interface AssetFieldSpec {
  /** Clé dans `details`, identique à celle du schéma serveur. */
  name: string;
  label: string;
  type: AssetFieldType;
  required: boolean;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
  /** Format exigé pour un champ texte (ex. quatre derniers chiffres d'un compte). */
  pattern?: RegExp;
  patternMessage?: string;
  maxLength?: number;
  help?: string;
  /** Borne basse exclue (ex. un multiple strictement positif). */
  exclusiveMin?: boolean;
  /** Avertissement (non bloquant) selon la valeur saisie. */
  warning?: (value: unknown) => string | null;
}

const MIN_VEHICLE_YEAR = 1950;

const legalFormOptions = () =>
  ['SARL', 'SA', 'SAS', 'SCI', 'GIE', 'SNC', 'EI']
    .map(value => ({ value, label: value }))
    .concat([{ value: 'AUTRE', label: t('Autre') }]);

const cashKindOptions = () => [
  { value: 'BANK', label: t('Compte bancaire') },
  { value: 'MOBILE_MONEY', label: t('Mobile money') },
  { value: 'CASH_ON_HAND', label: t('Espèces') }
];

const savingsKindOptions = () => [
  { value: 'PLACEMENT', label: t('Placement') },
  { value: 'TONTINE', label: t('Tontine') },
  { value: 'LIFE_INSURANCE', label: t('Assurance-vie') },
  { value: 'OTHER', label: t('Autre') }
];

const agricultureKindOptions = () => [
  { value: 'PLANTATION', label: t('Plantation') },
  { value: 'LIVESTOCK', label: t('Cheptel') },
  { value: 'HARVEST', label: t('Récolte') }
];

export function assetClassFields(assetClass: AssetClass): AssetFieldSpec[] {
  switch (assetClass) {
    case 'BUSINESS_EQUITY':
      return [
        { name: 'companyName', label: t('Raison sociale'), type: 'text', required: true },
        {
          name: 'legalForm',
          label: t('Forme juridique (OHADA)'),
          type: 'select',
          required: true,
          options: legalFormOptions()
        },
        { name: 'country', label: t('Pays'), type: 'text', required: true },
        { name: 'ownershipPercent', label: t('Pourcentage détenu'), type: 'percent', required: true, min: 0, max: 100 },
        { name: 'sector', label: t("Secteur d'activité"), type: 'text', required: false },
        { name: 'companyValue', label: t("Valeur de l'entreprise"), type: 'number', required: false, min: 0 },
        { name: 'netIncome', label: t('Résultat net'), type: 'number', required: false, min: 0 },
        {
          name: 'earningsMultiple',
          label: t('Multiple de résultat'),
          type: 'number',
          required: false,
          min: 0,
          max: 100,
          exclusiveMin: true,
          help: t("Sans valeur de l'entreprise, la valeur se calcule avec le résultat net et ce multiple.")
        }
      ];
    case 'INVENTORY':
      return [
        { name: 'designation', label: t('Désignation'), type: 'text', required: true },
        { name: 'quantity', label: t('Quantité'), type: 'number', required: true, min: 0 },
        { name: 'unit', label: t('Unité'), type: 'text', required: true },
        { name: 'unitCost', label: t('Coût unitaire'), type: 'number', required: true, min: 0 },
        { name: 'writeDownPercent', label: t('Décote (%)'), type: 'percent', required: false, min: 0, max: 100 }
      ];
    case 'VEHICLE_EQUIPMENT':
      return [
        { name: 'kind', label: t('Type'), type: 'text', required: true },
        { name: 'brand', label: t('Marque'), type: 'text', required: false },
        { name: 'model', label: t('Modèle'), type: 'text', required: false },
        {
          name: 'year',
          label: t('Année'),
          type: 'integer',
          required: false,
          min: MIN_VEHICLE_YEAR,
          max: new Date().getFullYear() + 1
        },
        { name: 'registration', label: t('Immatriculation ou numéro de série'), type: 'text', required: false },
        {
          name: 'usefulLifeYears',
          label: t("Durée d'utilité"),
          type: 'integer',
          required: false,
          min: 1,
          max: 50,
          help: t('En années.')
        },
        {
          name: 'residualValuePercent',
          label: t('Valeur résiduelle (%)'),
          type: 'percent',
          required: false,
          min: 0,
          max: 100
        },
        {
          name: 'depreciationMethod',
          label: t("Méthode d'amortissement"),
          type: 'select',
          required: false,
          options: depreciationMethodOptions()
        },
        {
          name: 'decliningRatePercent',
          label: t('Taux dégressif (%)'),
          type: 'percent',
          required: false,
          min: 0,
          max: 100
        }
      ];
    case 'CASH':
      return [
        { name: 'institution', label: t('Établissement ou opérateur'), type: 'text', required: true },
        { name: 'cashKind', label: t('Type de compte'), type: 'select', required: true, options: cashKindOptions() },
        {
          name: 'accountLast4',
          label: t('Quatre derniers chiffres du compte'),
          type: 'text',
          required: false,
          pattern: /^\d{4}$/,
          patternMessage: t('Saisissez exactement 4 chiffres, jamais le numéro complet'),
          maxLength: 4,
          help: t('Jamais le numéro complet : seulement les 4 derniers chiffres.')
        }
      ];
    case 'SAVINGS_INVESTMENT':
      return [
        { name: 'savingsKind', label: t('Type'), type: 'select', required: true, options: savingsKindOptions() },
        { name: 'organization', label: t('Organisme'), type: 'text', required: false },
        {
          name: 'expectedRatePercent',
          label: t('Taux attendu (%)'),
          type: 'percent',
          required: false,
          min: 0,
          max: 100
        },
        { name: 'principal', label: t('Capital'), type: 'number', required: false, min: 0 }
      ];
    case 'RECEIVABLE':
      return [
        { name: 'debtor', label: t('Débiteur'), type: 'text', required: true },
        { name: 'principal', label: t('Capital'), type: 'number', required: false, min: 0 },
        {
          name: 'collectibilityPercent',
          label: t('Recouvrabilité (%)'),
          type: 'percent',
          required: false,
          min: 0,
          max: 100
        },
        { name: 'dueDate', label: t('Échéance'), type: 'date', required: false },
        { name: 'ratePercent', label: t('Taux (%)'), type: 'percent', required: false, min: 0, max: 100 }
      ];
    case 'AGRICULTURE':
      return [
        {
          name: 'agricultureKind',
          label: t('Nature'),
          type: 'select',
          required: true,
          options: agricultureKindOptions()
        },
        { name: 'crop', label: t('Culture ou espèce'), type: 'text', required: false },
        { name: 'areaHectares', label: t('Surface (hectares)'), type: 'number', required: false, min: 0 },
        { name: 'headcount', label: t('Effectif'), type: 'integer', required: false, min: 0 },
        { name: 'unitValue', label: t('Valeur unitaire'), type: 'number', required: false, min: 0 }
      ];
    case 'MOVABLE':
      return [
        { name: 'designation', label: t('Désignation'), type: 'text', required: true },
        { name: 'category', label: t('Catégorie'), type: 'text', required: false }
      ];
    case 'OTHER':
      return [{ name: 'label', label: t('Libellé'), type: 'text', required: true }];
    case 'REAL_ESTATE':
      return [
        {
          name: 'legalStatus',
          label: t('Statut juridique'),
          type: 'select',
          required: false,
          options: legalStatusOptions(),
          warning: value =>
            typeof value === 'string' && FRAGILE_LEGAL_STATUSES.includes(value)
              ? t('Statut juridique fragile : la fiabilité de la valeur est plafonnée.')
              : null
        }
      ];
    default:
      return [];
  }
}

const EXTRA_KEY_LABELS = (): Record<string, string> => ({
  acquisitionCost: t("Coût d'acquisition"),
  acquisitionDate: t("Date d'acquisition"),
  balance: t('Solde'),
  elapsedYears: t('Années écoulées')
});

/** Libellé français d'une clé de détail (champ manquant ou hypothèse) ; clé inconnue renvoyée telle quelle. */
export function detailKeyLabel(rawKey: string): string {
  const key = rawKey.replace(/^details\./, '');
  for (const assetClass of ASSET_CLASS_KEYS) {
    const spec = assetClassFields(assetClass).find(field => field.name === key);
    if (spec) return spec.label;
  }
  return EXTRA_KEY_LABELS()[key] ?? key;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** Message d'erreur d'un champ de classe, ou `null` s'il est valide. Cohérent avec les schémas du serveur. */
export function validateAssetField(spec: AssetFieldSpec, value: unknown): string | null {
  if (isEmpty(value)) return spec.required ? t('Champ obligatoire') : null;
  if (spec.type === 'number' || spec.type === 'integer' || spec.type === 'percent') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return t('Saisissez un nombre valide');
    if (spec.type === 'integer' && !Number.isInteger(numeric)) return t('Saisissez un nombre entier');
    if (spec.min !== undefined && (numeric < spec.min || (spec.exclusiveMin && numeric === spec.min))) {
      return spec.type === 'percent'
        ? t('La valeur doit être comprise entre 0 et 100')
        : t('La valeur est trop petite');
    }
    if (spec.max !== undefined && numeric > spec.max) {
      return spec.type === 'percent'
        ? t('La valeur doit être comprise entre 0 et 100')
        : t('La valeur est trop grande');
    }
    return null;
  }
  if (spec.pattern && !spec.pattern.test(String(value))) return spec.patternMessage ?? t('Format invalide');
  return null;
}

/** Valide tous les champs d'une classe ; renvoie `{ nomDuChamp: message }`. */
export function validateAssetDetails(assetClass: AssetClass, values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const spec of assetClassFields(assetClass)) {
    const message = validateAssetField(spec, values[spec.name]);
    if (message) errors[spec.name] = message;
  }
  return errors;
}

/** Construit l'objet `details` à envoyer : champs vides retirés, nombres typés, textes rognés. */
export function buildAssetDetails(assetClass: AssetClass, values: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const spec of assetClassFields(assetClass)) {
    const value = values[spec.name];
    if (isEmpty(value)) continue;
    if (spec.type === 'number' || spec.type === 'integer' || spec.type === 'percent') {
      details[spec.name] = Number(value);
    } else {
      details[spec.name] = String(value).trim();
    }
  }
  return details;
}
