/**
 * Contrats de types du lot 040 — contrôle du stock de chantier (spec 040 §8.5,
 * contrat `contracts/openapi.yaml` 2.0.0).
 *
 * Les fichiers `types-lot5-*.ts` sont des contrats GELÉS : ils ne bougent pas.
 * Les formes nouvelles ou étendues de ce lot vivent ici et **dérivent** les
 * types du lot 5 par `Omit<…> & {…}` — un `extends` ne peut pas élargir
 * `number` en `number | null`, or les champs de valeur deviennent nullables
 * (masquage §8.1, aveugle §8.2). Les services du stock renvoient ces types.
 *
 * Les noms de champs sont ceux du contrat, à l'identique : le web les recopie
 * (`apps/web/src/types/finance-stock-controle-types.ts`).
 *
 * Écrit par l'étape des fondations ; les territoires codent contre ces types
 * sans les modifier. Un manque remonte au Pilote.
 */

import type {
  StockAlertKind,
  StockAlertSeverity,
  StockAlertStatus,
  StockAttachmentPurpose,
  StockAttachmentTarget,
  StockCountKind,
  StockCountStatus,
  StockLocationKind,
  StockMovementType,
  StockReasonCode,
  StockSlipKind,
  StockValuationSource
} from '@prisma/client';

import type { PrismaTransactionClient } from '../../utils/database';
import type { StockBalanceRecord, StockMovementRecord } from './types-lot5-mouvements';
import type { StockCountLineRecord, StockCountRecord, StockTransferRecord } from './types-lot5-inventaire';
import type { StockLocationRecord } from './types-lot5-referentiel';
import type {
  SiteStockReconciliationLine,
  SiteStockReconciliationRecord,
  SiteStockStatusRecord
} from './types-lot5-rapprochement';
import type { SiteClosureBlocker } from './types-lot4-closing';

export type {
  StockAlertKind,
  StockAlertSeverity,
  StockAlertStatus,
  StockAttachmentPurpose,
  StockAttachmentTarget,
  StockCountKind,
  StockCountStatus,
  StockLocationKind,
  StockMovementType,
  StockReasonCode,
  StockSlipKind,
  StockValuationSource
};

export type { StockErrorCode } from '../../middleware/error-middleware';

/**
 * Client Prisma ou client de transaction : le client complet est assignable au
 * client de transaction (`utils/database.ts`), une aide de lecture prend donc
 * l'un ou l'autre.
 */
export type PrismaLike = PrismaTransactionClient;

// ---------------------------------------------------------------------------
// Motifs, par contexte (spec §4)
// ---------------------------------------------------------------------------

/** Colonne « Inventaire » de spec §4 ; `OPENING_BALANCE` est posé par le système, jamais choisi. */
export const COUNT_REASON_CODES: readonly StockReasonCode[] = [
  'BREAKAGE',
  'DETERIORATION',
  'COUNTING_ERROR',
  'ENTRY_ERROR',
  'UNIT_CONFUSION',
  'UNRECORDED_ISSUE',
  'UNRECORDED_RECEIPT',
  'UNEXPLAINED_DISAPPEARANCE',
  'OTHER'
];

/** Colonne « Rebut ». */
export const SCRAP_REASON_CODES: readonly StockReasonCode[] = ['BREAKAGE', 'DETERIORATION', 'OTHER'];

/** Colonne « Retour fournisseur ». */
export const SUPPLIER_RETURN_REASON_CODES: readonly StockReasonCode[] = [
  'NON_CONFORMING',
  'DAMAGED_ON_DELIVERY',
  'EXCESS_DELIVERY',
  'OTHER'
];

/** Colonne « Transfert ». */
export const TRANSFER_REASON_CODES: readonly StockReasonCode[] = [
  'SITE_SUPPLY',
  'RETURN_TO_WAREHOUSE',
  'SITE_EVACUATION',
  'REBALANCING',
  'OTHER'
];

/** Contexte d'un motif, côté service (`assertReasonForContext`). */
export type StockReasonContext = 'COUNT' | 'SCRAP' | 'SUPPLIER_RETURN' | 'TRANSFER';

/** Les quatre listes, sous les clés du contrat (`FieldContext.reasonCodes`). */
export interface StockReasonCodesByContext {
  count: StockReasonCode[];
  scrap: StockReasonCode[];
  supplierReturn: StockReasonCode[];
  transfer: StockReasonCode[];
}

// ---------------------------------------------------------------------------
// Appelant, masques et méta (spec §8.1, §8.2)
// ---------------------------------------------------------------------------

/**
 * Ce que l'appelant peut faire et voir, résolu une fois par requête depuis ses
 * permissions (`getUserPermissions`, cache de 5 minutes, B1-R6).
 */
export interface StockCallerContext {
  userId: string;
  /** STOCK_VALUES_VIEW. Faux : tout champ de valeur vaut `null`. */
  valuesVisible: boolean;
  /** STOCK_COUNT_VALIDATE. Vrai : jamais à l'aveugle hors des routes d'inventaire. */
  canValidateCount: boolean;
  canReceive: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  canCount: boolean;
  canDispose: boolean;
  canManageTakers: boolean;
  canViewAlerts: boolean;
  /** FINANCE_SETTINGS_MANAGE : référentiel et réglages de contrôle. */
  canManageSettings: boolean;
}

/** `meta` de toute réponse qui porte un champ de valeur ou de quantité de solde (contrat `Meta`). */
export interface StockMeta {
  valuesVisible: boolean;
  /** Lieux en comptage masqués pour l'appelant ; vide pour un détenteur de STOCK_COUNT_VALIDATE. */
  blindLocationIds: string[];
  /** Routes paginées seulement ; `null` à la dernière page. */
  nextCursor?: string | null;
}

/** Opérations idempotentes (`StockClientRequest.operation`, B3-R2). */
export type StockClientOperation =
  'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'SCRAP' | 'SUPPLIER_RETURN' | 'COUNT_LINE' | 'ATTACHMENT';

// ---------------------------------------------------------------------------
// Mouvements et soldes
// ---------------------------------------------------------------------------

/** Contrat `MovementView` : `StockMovementRecord` étendu, valeurs nullables. */
export type MovementView = Omit<StockMovementRecord, 'unitCost' | 'totalValue' | 'quantityAfter' | 'valueAfter'> & {
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  unitCost: number | null;
  /** Valeur ; pour SUPPLIER_RETURN, valeur sortie du 311. */
  totalValue: number | null;
  /** Masqué pendant un comptage (aveugle). */
  quantityAfter: number | null;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  valueAfter: number | null;
  takerId: string | null;
  /** Libellé ACTUEL du preneur (« Nom — Équipe »). */
  takerLabel: string | null;
  supplierInvoiceId: string | null;
  stockCountId: string | null;
  slipId: string | null;
  /** « BS-2026-00042 ». */
  slipNumber: string | null;
  reasonCode: StockReasonCode | null;
  /** Précision libre ; visible au journal (A4-R4). */
  reason: string | null;
  /** Valeur (null sans STOCK_VALUES_VIEW) ; RECEIPT seulement. */
  valuationSource: StockValuationSource | null;
  /** Valeur ; SUPPLIER_RETURN seulement. */
  supplierCreditValue: number | null;
  createdByUserId: string;
  /** jour(createdAt) − jour(movementDate), calculé (A5-R5). */
  entryLagDays: number;
  /** Pièces jointes non retirées. */
  attachmentsCount: number;
};

/** Contrat `BalanceView`. */
export type BalanceView = Omit<StockBalanceRecord, 'quantity' | 'value' | 'averageUnitCost'> & {
  /** Masqué pendant un comptage (aveugle). */
  quantity: number | null;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  value: number | null;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  averageUnitCost: number | null;
};

// ---------------------------------------------------------------------------
// Bons (B4)
// ---------------------------------------------------------------------------

/**
 * Libellés métier imprimés, FIGÉS à l'émission (B4-R3). **Aucun montant** :
 * les montants se relisent sur les mouvements, avec STOCK_VALUES_VIEW.
 */
export interface StockSlipSnapshot {
  location: string;
  site: string | null;
  taker: string | null;
  requestedBy: string | null;
  invoice: { reference: string; supplierName: string } | null;
  author: string;
  lines: Array<{ movementId?: string; itemId: string; reference: string; label: string; unit: string }>;
  /** PVI : tous les compteurs (A1-R1). */
  counters?: string[];
  /** PVI : le validateur. */
  validator?: string;
}

/** Contrat `SlipSummary`. */
export interface SlipSummary {
  id: string;
  kind: StockSlipKind;
  /** « BR-2026-00042 » : préfixe, année, rang sur 5 chiffres. */
  number: string;
  documentDate: Date;
  createdAt: Date;
}

/** Contrat `SlipView`. */
export interface SlipView extends SlipSummary {
  location: { id: string; label: string };
  site: { id: string; name: string } | null;
  taker: { id: string; label: string } | null;
  requestedBy: string | null;
  supplierInvoice: { id: string; reference: string; supplierName: string } | null;
  stockCountId: string | null;
  createdByLabel: string;
  /** Valeur. */
  totalValue: number | null;
  currency: string;
  movements: MovementView[];
  attachments: AttachmentView[];
}

// ---------------------------------------------------------------------------
// Réceptions, sorties, transferts (réponses d'écriture)
// ---------------------------------------------------------------------------

/** Contrat `ReceiptControl` (A8-R2). */
export interface ReceiptControl {
  code: 'RECEIPT_REPEATED' | 'RECEIPT_OVER_INVOICE' | 'RECEIPT_UNVALUED';
  severity: StockAlertSeverity;
  /** Traduit ; construit SANS montant pour un appelant sans STOCK_VALUES_VIEW. */
  message: string;
  /** Articles concernés (lignes sans prix pour RECEIPT_UNVALUED) ; vide sinon. */
  itemIds: string[];
  /** Valeur — cumul reçu. */
  amount: number | null;
  /** Valeur — montant de la facture. */
  threshold: number | null;
  alertId: string;
}

/** `data` de `POST /stock/receipts`. */
export interface ReceiptResult {
  slip: SlipSummary;
  movements: MovementView[];
  controls: ReceiptControl[];
}

/** `data` de `POST /stock/issues`. */
export interface SlipResult {
  slip: SlipSummary;
  movements: MovementView[];
}

/** `data` de `POST /stock/transfers`. */
export type TransferResult = Omit<StockTransferRecord, 'movements' | 'value'> & {
  movements: MovementView[];
  /** Valeur. */
  value: number | null;
};

// ---------------------------------------------------------------------------
// Factures réceptionnables (A8-R1, B3-R1)
// ---------------------------------------------------------------------------

/** Contrat `InvoiceLineView`. */
export interface InvoiceLineView {
  id: string;
  label: string;
  quantity: number | null;
  /** Valeur. */
  unitPrice: number | null;
  /** Valeur. */
  amount: number | null;
  /** Vrai si la ligne peut valoriser une réception ou un retour. Rendu à tous. */
  hasUnitPrice: boolean;
}

/** Contrat `ReceivableInvoice` : facture validée, SANS ses lignes. */
export interface ReceivableInvoice {
  id: string;
  reference: string;
  supplierName: string;
  invoiceDate: Date;
  siteId: string | null;
  siteName: string | null;
  receiptCount: number;
  lastReceiptAt: Date | null;
  /** Valeur. */
  amount: number | null;
}

/** Contrat `InvoiceReceiptsView`. */
export interface InvoiceReceiptsView {
  invoice: {
    id: string;
    reference: string;
    supplierName: string;
    invoiceDate: Date;
    status: 'DRAFT' | 'VALIDATED' | 'VOIDED';
    /** Valeur. */
    amount: number | null;
    lines: InvoiceLineView[];
  };
  byItem: Array<{
    itemId: string;
    itemLabel: string;
    itemUnit: string;
    receivedQuantity: number;
    returnedQuantity: number;
    /** Reçu − retourné (le solde du lieu peut limiter davantage). */
    returnableQuantity: number;
    /** Vrai si un retour exige `supplierInvoiceLineId` (A6-R3 bis). Rendu à tous. */
    returnNeedsInvoiceLine: boolean;
    /** Valeur — sources de prix des réceptions de l'article. */
    valuationSources?: StockValuationSource[] | null;
  }>;
  receipts: Array<{
    /** Nul pour une réception d'avant le lot. */
    slipId: string | null;
    slipNumber: string | null;
    receiptDate: Date;
    createdAt: Date;
    createdByLabel: string;
    locationLabel: string;
    lines: Array<{
      itemId: string;
      itemLabel: string;
      itemUnit: string;
      quantity: number;
      /** Valeur. */
      unitCost: number | null;
      /** Valeur. */
      totalValue: number | null;
    }>;
  }>;
  returns: MovementView[];
  /** Valeur — Σ réceptions. */
  receivedValue: number | null;
  /** Valeur — Σ retours (coût de réception). */
  returnedValue: number | null;
}

// ---------------------------------------------------------------------------
// Lieux et contexte terrain (B3-R1)
// ---------------------------------------------------------------------------

/** Un article à recompter : écarté (ou non compté) au dernier inventaire validé du lieu. */
export interface ItemToRecount {
  itemId: string;
  itemLabel: string;
  countId: string;
  setAsideAt: Date;
}

/** Contrat `LocationView`. */
export type LocationView = StockLocationRecord & {
  countInProgress: { countId: string; status: 'DRAFT' | 'COUNTED'; kind: StockCountKind } | null;
  /** Lieu d'un chantier clôturé (n'accepte ni réception ni transfert entrant). */
  siteClosed: boolean;
  /** A7-R1 : lieu de chantier, bascule de moins de 30 jours, aucun OPENING validé ni en cours. */
  openingCountSuggested: boolean;
  toRecount: ItemToRecount[];
};

/** Contrat `TakerView`. */
export interface TakerView {
  id: string;
  /** « Koné Ibrahim — Équipe maçonnerie ». */
  label: string;
  fullName: string;
  teamOrCompany: string | null;
  /** `null` sans STOCK_TAKERS_MANAGE (B2-R6). */
  phone: string | null;
  employeeId: string | null;
  contractorId: string | null;
  linkedPersonLabel: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** Droits de l'appelant, pour n'afficher que les gestes permis (`FieldContext.abilities`). */
export interface StockAbilities {
  canReceive: boolean;
  canIssue: boolean;
  canTransfer: boolean;
  canCount: boolean;
  canValidateCount: boolean;
  canDispose: boolean;
  canManageTakers: boolean;
  valuesVisible: boolean;
  canViewAlerts: boolean;
  canManageSettings: boolean;
}

/** Contrat `FieldContext` (`GET /stock/field-context`). */
export interface FieldContext {
  locations: LocationView[];
  /** Chantiers ouverts, plus les chantiers clos dont le lieu porte encore du stock. */
  sites: Array<{
    id: string;
    name: string;
    status: string;
    closed: boolean;
    stockEnabled: boolean;
    locationId: string | null;
  }>;
  costCategories: Array<{ id: string; label: string }>;
  items: Array<{
    id: string;
    reference: string;
    label: string;
    unit: string;
    category: string | null;
    defaultCostCategoryId: string | null;
  }>;
  takers: TakerView[];
  /** Les 50 factures validées les plus récentes des 180 derniers jours, sans lignes. */
  receivableInvoices: ReceivableInvoice[];
  reasonCodes: StockReasonCodesByContext;
  settings: { requireTaker: boolean; backdatingLimitDays: number };
  abilities: StockAbilities;
  /** Vide sans STOCK_TAKERS_MANAGE. Le nom seulement (B2-R6). */
  people: Array<{ kind: 'EMPLOYEE' | 'CONTRACTOR'; id: string; fullName: string }>;
}

// ---------------------------------------------------------------------------
// Inventaires (A1 à A4, A7)
// ---------------------------------------------------------------------------

/** Contrat `CountLineView` : `StockCountLineRecord` étendu. */
export type CountLineView = Omit<StockCountLineRecord, 'expectedQuantity' | 'countedQuantity' | 'variance'> & {
  /** `null` = ligne non comptée créée à la clôture du comptage (A2-R8). */
  countedQuantity: number | null;
  /** Vrai pour une ligne non comptée : à écarter, jamais ajustée. */
  notCounted: boolean;
  /** Faux si comptée par un détenteur de STOCK_COUNT_VALIDATE (A2-R9) ; null avant le lot ou non comptée. */
  countedBlind: boolean | null;
  countedByUserId: string | null;
  /** Nul pour une ligne d'avant le lot. */
  countedByLabel: string | null;
  countedAtServer: Date | null;
  /** `null` en DRAFT, pour tous (aveugle). */
  expectedQuantity: number | null;
  /** Compté − attendu ; `null` en DRAFT. */
  variance: number | null;
  /** Valeur ; `null` en DRAFT ; figée à la validation. */
  varianceValue: number | null;
  /** Valeur ; VALIDATED seulement. */
  unitCostAtValidation: number | null;
  reasonCode: StockReasonCode | null;
  /** Règle unique A4-R2, calculée par le serveur. */
  justified: boolean;
  justifiedByLabel: string | null;
  justifiedAt: Date | null;
  setAside: { at: Date; byLabel: string; reason: string } | null;
  /** VALIDATED seulement (A3-R4). */
  movementsSinceCapture: number | null;
  attachmentsCount: number;
};

/** Contrat `CountView` : `StockCountRecord` étendu. */
export type CountView = Omit<StockCountRecord, 'lines' | 'varianceCount' | 'varianceValue'> & {
  kind: StockCountKind;
  /** Vrai en DRAFT et en CANCELLED : attendu et écarts masqués à tous. */
  blind: boolean;
  createdByUserId: string;
  closedAt: Date | null;
  closedByLabel: string | null;
  validatedByLabel: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  selfValidated: boolean;
  selfValidationReason: string | null;
  /** Compteurs de l'inventaire (`counterUserIds`, A1-R1), libellés. */
  counters: Array<{ userId: string; label: string }>;
  /** Vide dans la liste sans `withLines=true`. */
  lines: CountLineView[];
  linesCount: number;
  /** Lignes non comptées (A2-R8), écartées ou non. */
  uncountedLinesCount: number;
  /** `null` tant que `blind`. */
  varianceCount: number | null;
  /** Valeur ; figée à la validation. */
  countedValue: number | null;
  /** Valeur ; Σ |écart| valorisé ; figée à la validation. */
  varianceValueGross: number | null;
  /** Valeur ; estimation en COUNTED, figée en VALIDATED, `null` tant que `blind`. */
  varianceValueNet: number | null;
  /** Valeur ; écart des lignes écartées, figé à la validation (A2-R7). */
  setAsideVarianceValue: number | null;
  /** PVI, à partir de la validation. */
  slip: SlipSummary | null;
  /** COUNTED seulement, calculé pour l'appelant (A1-R5). */
  validation: { callerIsCounter: boolean; selfValidationAllowed: boolean } | null;
  /** Articles à recompter du lieu, rappelés à l'ouverture (A2-R7). */
  toRecount: Array<{ itemId: string; itemLabel: string }>;
};

// ---------------------------------------------------------------------------
// Pièces jointes (B5)
// ---------------------------------------------------------------------------

/** Contrat `AttachmentView`. */
export interface AttachmentView {
  id: string;
  targetType: StockAttachmentTarget;
  targetId: string;
  purpose: StockAttachmentPurpose;
  caption: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 hexadécimal du fichier stocké. */
  sha256: string;
  uploadedByLabel: string;
  /** Heure serveur. */
  createdAt: Date;
  removed: { at: Date; byLabel: string; reason: string } | null;
  /** Dépositaire dans les 15 minutes, ou STOCK_DISPOSE. */
  canRemove: boolean;
  /** Fin des 15 minutes du dépositaire ; `null` pour un autre appelant. */
  removableUntil: Date | null;
}

// ---------------------------------------------------------------------------
// Alertes (B7)
// ---------------------------------------------------------------------------

/** Objet visé par une alerte, sans clé étrangère. */
export type StockAlertSubjectType = 'StockSlip' | 'StockCount' | 'StockMovement' | 'SupplierInvoice' | 'CashVoucher';

/** `details.mode` de LARGE_SCRAP et CASH_MATERIAL_PURCHASE. */
export type StockAlertMode = 'SINGLE' | 'MONTHLY_CUMUL';

/** Naissance d'une alerte (`raiseStockAlertTx`, B7-R2). */
export interface StockAlertInput {
  tenantId: string;
  kind: StockAlertKind;
  severity: StockAlertSeverity;
  /** Clé anti-doublon, construite par `alertKeys` (B7-R1). */
  dedupeKey: string;
  /** Montant constaté, figé à la naissance. */
  amount?: number | null;
  /** Seuil, figé à la naissance. */
  threshold?: number | null;
  currency?: string;
  siteId?: string | null;
  locationId?: string | null;
  subjectType: StockAlertSubjectType;
  subjectId: string;
  /** Éléments du message (numéro de bon, `mode`, nombre de lignes…). JAMAIS de nom de personne. */
  details?: Record<string, unknown> | null;
}

/** Contrat `AlertView`. */
export interface AlertView {
  id: string;
  kind: StockAlertKind;
  severity: StockAlertSeverity;
  status: StockAlertStatus;
  /** Construit depuis `kind`, traduit ; jamais de nom de personne. */
  title: string;
  /** Construit à la lecture, traduit ; SANS montant pour un appelant sans STOCK_VALUES_VIEW. */
  message: string;
  /** Valeur, figée. */
  amount: number | null;
  /** Valeur, figée. */
  threshold: number | null;
  currency: string;
  site: { id: string; name: string } | null;
  location: { id: string; label: string } | null;
  subjectType: StockAlertSubjectType;
  subjectId: string;
  subjectLabel: string | null;
  mode?: StockAlertMode | null;
  raisedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByLabel: string | null;
  acknowledgeNote: string | null;
}

// ---------------------------------------------------------------------------
// Indicateurs (B8)
// ---------------------------------------------------------------------------

/** Contrat `IndicatorRow`. */
export interface IndicatorRow {
  /** `null` pour le total. */
  locationId?: string | null;
  locationLabel?: string | null;
  /** « 2026-09 ». */
  month: string;
  countsValidated: number;
  /** Inventaires validés avant le lot, exclus du taux. */
  countsWithoutFrozenValues: number;
  countedValue: number;
  varianceValueGross: number;
  setAsideVarianceValue: number;
  /** (varianceValueGross + setAsideVarianceValue) ÷ countedValue ; `null` sans inventaire. */
  varianceRate: number | null;
  uncountedLines: number;
  blindLineShare: number | null;
  issuesCount: number;
  issuesWithTaker: number;
  takerShare: number | null;
  countsValidatedByOther: number;
  otherValidatorShare: number | null;
  scrapValue: number;
  scrapShare: number | null;
  movementsCount: number;
  averageEntryLagDays: number | null;
  sameDayShare: number | null;
}

/** Contrat `IndicatorsView`. */
export interface IndicatorsView {
  /** « 2026-05 ». */
  from: string;
  to: string;
  rows: IndicatorRow[];
  totals: IndicatorRow[];
}

// ---------------------------------------------------------------------------
// Réglages de contrôle (A5-R4, B2-R3, B7, A9)
// ---------------------------------------------------------------------------

/** Les valeurs de contrôle, telles qu'un service les lit (défauts appliqués). */
export interface StockControlsSettingsValues {
  backdatingLimitDays: number;
  requireTaker: boolean;
  /** Nul = nature désactivée. */
  issueAlertAmount: number | null;
  countVarianceAlertAmount: number | null;
  countVarianceAlertPercent: number | null;
  cashMaterialAlertAmount: number | null;
  materialCostCategoryIds: string[];
}

/** Contrat `ControlsSettings` (`GET /stock/settings/controls`). */
export type ControlsSettings = StockControlsSettingsValues & {
  /** Postes réellement traités comme « matériaux » (A9-R1). */
  effectiveMaterialCostCategoryIds: string[];
  updatedAt: Date | null;
  updatedByLabel: string | null;
};

// ---------------------------------------------------------------------------
// Chantiers (A7)
// ---------------------------------------------------------------------------

/** Contrat `SiteStockStatusView`. */
export type SiteStockStatusView = SiteStockStatusRecord & {
  openingCountSuggested: boolean;
};

/** Ligne du rapprochement étendue (contrat `ReconciliationLineAdditions`). */
export type SiteStockReconciliationLineView = Omit<
  SiteStockReconciliationLine,
  'remainingQuantity' | 'remainingValue'
> & {
  returnedToSupplierQuantity: number;
  returnedToSupplierValue: number;
  scrappedQuantity: number;
  scrappedValue: number;
  /** `null` pendant un comptage du lieu (aveugle). */
  remainingQuantity: number | null;
  /** `null` pendant un comptage du lieu (aveugle). */
  remainingValue: number | null;
};

/** Rapprochement d'un chantier étendu ; le total restant devient nullable (aveugle). */
export type SiteStockReconciliationView = Omit<SiteStockReconciliationRecord, 'lines' | 'remainingValue'> & {
  remainingValue: number | null;
  lines: SiteStockReconciliationLineView[];
};

/** Natures de bloqueur de clôture (contrat `ClosureBlocker.documentType`). */
export type ClosureBlockerDocumentType =
  'SUPPLIER_INVOICE' | 'STOCK_COUNT' | 'STOCK_RESIDUAL' | 'STOCK_CLOSING_COUNT_MISSING';

/** Contrat `ClosureBlocker`. */
export type ClosureBlockerView = Omit<SiteClosureBlocker, 'documentType'> & {
  documentType?: ClosureBlockerDocumentType;
};
