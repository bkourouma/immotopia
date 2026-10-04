import { t } from '../i18n/t';
import type { StockMovementType } from './finance-stock-mouvements-types';

/**
 * Contrat de la frontière réseau du lot 040 — contrôle du stock de chantier
 * (spec 040, ecrans.md §3.1 et §3.6).
 *
 * Recopie en TypeScript des schémas de `specs/040-controle-stock/contracts/openapi.yaml`
 * (version 2.0.0), **noms de champs identiques** à ceux que le serveur émet
 * (`packages/api/src/lib/finance/types-040-controle.ts`). Les noms de TYPE
 * portent le préfixe `Stock` côté web.
 *
 * **Les dates sont des chaînes ici** : elles traversent JSON en ISO 8601.
 *
 * **Les champs « valeur » sont `number | null`**, et `quantity` d'un solde,
 * `quantityAfter`, `countedQuantity` aussi : sans STOCK_VALUES_VIEW, ou sur un
 * lieu en comptage à l'aveugle, le serveur les rend `null`. Un type qui
 * promettrait `number` ferait écrire `formatQuantity(null)` sans que le
 * compilateur proteste. L'écran n'invente jamais une valeur masquée.
 *
 * Écrit par l'étape des fondations ; les écrans codent contre ces types. Un
 * manque remonte au Pilote, jamais une copie locale.
 */

export type { StockMovementType };

// ---------------------------------------------------------------------------
// Énumérations
// ---------------------------------------------------------------------------

export type StockReasonCode =
  | 'BREAKAGE'
  | 'DETERIORATION'
  | 'COUNTING_ERROR'
  | 'ENTRY_ERROR'
  | 'UNIT_CONFUSION'
  | 'UNRECORDED_ISSUE'
  | 'UNRECORDED_RECEIPT'
  | 'UNEXPLAINED_DISAPPEARANCE'
  | 'OPENING_BALANCE'
  | 'NON_CONFORMING'
  | 'DAMAGED_ON_DELIVERY'
  | 'EXCESS_DELIVERY'
  | 'SITE_SUPPLY'
  | 'RETURN_TO_WAREHOUSE'
  | 'SITE_EVACUATION'
  | 'REBALANCING'
  | 'OTHER';

export type StockCountStatus = 'DRAFT' | 'COUNTED' | 'VALIDATED' | 'CANCELLED';
export type StockCountKind = 'REGULAR' | 'OPENING' | 'CLOSING';
export type StockValuationSource = 'DECLARED' | 'INVOICE_LINE' | 'AVERAGE_COST' | 'LAST_RECEIPT' | 'NONE';
export type StockSlipKind = 'RECEIPT' | 'ISSUE' | 'COUNT_REPORT';
export type StockAttachmentTarget = 'MOVEMENT' | 'SLIP' | 'COUNT_LINE';
export type StockAttachmentPurpose = 'GOODS_PHOTO' | 'DELIVERY_NOTE' | 'SIGNED_SLIP' | 'OTHER';
export type StockAlertKind =
  | 'COUNT_VARIANCE'
  | 'COUNT_LINE_SET_ASIDE'
  | 'COUNT_CANCELLED'
  | 'LARGE_ISSUE'
  | 'LARGE_SCRAP'
  | 'RECEIPT_REPEATED'
  | 'RECEIPT_OVER_INVOICE'
  | 'RECEIPT_UNVALUED'
  | 'CASH_MATERIAL_PURCHASE'
  | 'COUNT_SELF_VALIDATED';
export type StockAlertSeverity = 'INFO' | 'WARNING';
export type StockAlertStatus = 'OPEN' | 'ACKNOWLEDGED';
export type StockAlertSubjectType = 'StockSlip' | 'StockCount' | 'StockMovement' | 'SupplierInvoice' | 'CashVoucher';
export type StockLocationKindValue = 'WAREHOUSE' | 'SITE';

/** Contrat `StockErrorCode` : lu dans `err.response.data.code` (ecrans §3.9). */
export type StockErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'MODULE_NOT_INCLUDED'
  | 'STOCK_INSUFFICIENT'
  | 'STOCK_DATE_IN_FUTURE'
  | 'STOCK_DATE_TOO_OLD'
  | 'STOCK_REQUESTER_REQUIRED'
  | 'STOCK_TAKER_REQUIRED'
  | 'STOCK_TAKER_INACTIVE'
  | 'STOCK_TAKER_DUPLICATE'
  | 'STOCK_REASON_REQUIRED'
  | 'STOCK_REASON_NOT_ALLOWED'
  | 'STOCK_VALUE_FIELD_FORBIDDEN'
  | 'STOCK_SITE_CLOSED'
  | 'STOCK_LOCATION_INACTIVE'
  | 'STOCK_ITEM_INACTIVE'
  | 'STOCK_INVOICE_NOT_VALIDATED'
  | 'STOCK_RETURN_EXCEEDS_RECEIVED'
  | 'STOCK_RETURN_UNVALUED'
  | 'STOCK_COUNT_ALREADY_OPEN'
  | 'STOCK_OPENING_COUNT_EXISTS'
  | 'STOCK_OPENING_COUNT_NOT_ALLOWED'
  | 'STOCK_COUNT_WRONG_STATUS'
  | 'STOCK_COUNT_EMPTY'
  | 'STOCK_COUNT_INCOMPLETE'
  | 'STOCK_COUNT_UNCOUNTED_LINES'
  | 'STOCK_COUNT_UNJUSTIFIED_VARIANCE'
  | 'STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS'
  | 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN'
  | 'STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED'
  | 'STOCK_COUNT_IN_PROGRESS'
  | 'STOCK_IDEMPOTENCY_MISMATCH'
  | 'STOCK_ATTACHMENT_TYPE'
  | 'STOCK_ATTACHMENT_TOO_LARGE'
  | 'STOCK_ATTACHMENT_REMOVAL_FORBIDDEN'
  | 'STOCK_ATTACHMENT_TARGET_NOT_ALLOWED'
  | 'STOCK_ALERT_ALREADY_ACKNOWLEDGED'
  | 'STOCK_EXPORT_TOO_LARGE';

/** `data` d'une erreur du stock (`data.items`, `data.existingTakerId`). */
export interface StockErrorData {
  items?: Array<{ itemId: string; itemLabel: string }>;
  existingTakerId?: string;
}

// ---------------------------------------------------------------------------
// Méta et enveloppes
// ---------------------------------------------------------------------------

/** Contrat `Meta`. */
export interface StockMeta {
  /** Faux sans STOCK_VALUES_VIEW : tous les champs « valeur » valent alors `null`. */
  valuesVisible: boolean;
  /** Lieux en comptage dont les quantités sont masquées à l'appelant. */
  blindLocationIds: string[];
  /** Routes paginées seulement ; `null` à la dernière page. */
  nextCursor?: string | null;
}

/** Une lecture qui porte `meta`. */
export interface StockRead<T> {
  data: T;
  meta: StockMeta;
}

/**
 * Une écriture terrain : `replayed` vaut vrai quand le serveur a répondu `200`
 * (rejeu idempotent) plutôt que `201` (création) — l'écran dit alors « déjà
 * enregistrée » (ecrans §3.7).
 */
export interface StockWrite<T> extends StockRead<T> {
  replayed: boolean;
}

/** Un fichier téléchargé. */
export interface StockDownload {
  blob: Blob;
  filename: string;
}

// ---------------------------------------------------------------------------
// Mouvements et soldes
// ---------------------------------------------------------------------------

/** Contrat `MovementView`. */
export interface StockMovementView {
  id: string;
  type: StockMovementType;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  movementDate: string;
  /** Toujours positive ; le sens est dans `type` / `isDecrease`. */
  quantity: number;
  isDecrease: boolean;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  unitCost: number | null;
  /** Valeur ; pour SUPPLIER_RETURN, valeur sortie du 311. */
  totalValue: number | null;
  currency: string;
  /** Masqué pendant un comptage (aveugle). */
  quantityAfter: number | null;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  valueAfter: number | null;
  siteId: string | null;
  siteLabel: string | null;
  costCategoryLabel: string | null;
  /** Texte, ou instantané du libellé du preneur. */
  requestedBy: string | null;
  takerId: string | null;
  /** Libellé ACTUEL du preneur (« Nom — Équipe »). */
  takerLabel: string | null;
  supplierInvoiceId: string | null;
  supplierInvoiceReference: string | null;
  transferGroupId: string | null;
  stockCountId: string | null;
  slipId: string | null;
  slipNumber: string | null;
  reasonCode: StockReasonCode | null;
  /** Précision libre ; visible au journal (A4-R4). */
  reason: string | null;
  /** Valeur (null sans STOCK_VALUES_VIEW) ; RECEIPT seulement. */
  valuationSource: StockValuationSource | null;
  /** Valeur ; SUPPLIER_RETURN seulement. */
  supplierCreditValue: number | null;
  createdByUserId: string;
  createdByLabel: string;
  /** Heure serveur de saisie. */
  createdAt: string;
  /** jour(createdAt) − jour(movementDate). */
  entryLagDays: number;
  /** Pièces jointes non retirées. */
  attachmentsCount: number;
}

/** Contrat `BalanceView`. */
export interface StockBalanceView {
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  /** Masqué pendant un comptage (aveugle). */
  quantity: number | null;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  value: number | null;
  /** Valeur ; masqué aussi pendant un comptage (aveugle). */
  averageUnitCost: number | null;
  currency: string;
}

/** Filtres du journal (contrat, `GET /stock/movements`). */
export interface StockMovementsFilters {
  itemId?: string;
  locationId?: string;
  siteId?: string;
  type?: StockMovementType;
  slipId?: string;
  /** Un mouvement, ou les deux moitiés de son transfert. */
  movementId?: string;
  /** Réservé à STOCK_VALUES_VIEW (403 sinon). */
  takerId?: string;
  /** Réservé à STOCK_VALUES_VIEW (403 sinon). */
  createdByUserId?: string;
  /** Contient, insensible à la casse. Réservé à STOCK_VALUES_VIEW (403 sinon). */
  requestedBy?: string;
  /** `AAAA-MM-JJ`, borne incluse. */
  from?: string;
  /** `AAAA-MM-JJ`, borne incluse. */
  to?: string;
  cursor?: string;
  /** 1 à 200, 50 par défaut. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Bons (B4)
// ---------------------------------------------------------------------------

/** Contrat `SlipSummary`. */
export interface StockSlipSummary {
  id: string;
  kind: StockSlipKind;
  /** « BR-2026-00042 ». */
  number: string;
  documentDate: string;
  createdAt: string;
}

/** Contrat `SlipView`. */
export interface StockSlipView extends StockSlipSummary {
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
  movements: StockMovementView[];
  attachments: StockAttachmentView[];
}

// ---------------------------------------------------------------------------
// Réceptions, sorties, transferts, rebuts, retours
// ---------------------------------------------------------------------------

/** Contrat `ReceiptControl`. */
export interface StockReceiptControl {
  code: 'RECEIPT_REPEATED' | 'RECEIPT_OVER_INVOICE' | 'RECEIPT_UNVALUED';
  severity: StockAlertSeverity;
  /** Traduit par le serveur ; sans montant pour un appelant sans valeurs. */
  message: string;
  itemIds: string[];
  /** Valeur — cumul reçu. */
  amount: number | null;
  /** Valeur — montant de la facture. */
  threshold: number | null;
  alertId: string;
}

/** `data` de `POST /stock/receipts`. */
export interface StockReceiptResult {
  slip: StockSlipSummary;
  movements: StockMovementView[];
  controls: StockReceiptControl[];
}

/** `data` de `POST /stock/issues`. */
export interface StockSlipResult {
  slip: StockSlipSummary;
  movements: StockMovementView[];
}

/** `data` de `POST /stock/transfers`. */
export interface StockTransferResult {
  transferGroupId: string;
  /** Les deux moitiés : la sortie d'abord, l'entrée ensuite. */
  movements: StockMovementView[];
  fromLocationLabel: string;
  toLocationLabel: string;
  quantity: number;
  /** Valeur. */
  value: number | null;
  currency: string;
}

/** Contrat `ReceiptLine`. */
export interface ReceiptLineRequest {
  itemId: string;
  quantity: number;
  /** Facultatif ; réservé à STOCK_VALUES_VIEW. Envoyé seulement s'il a été saisi. */
  unitCost?: number;
  /** Ligne de la MÊME facture d'où prendre le prix unitaire (A8-R3). */
  supplierInvoiceLineId?: string;
}

/** Contrat `ReceiptRequest`. */
export interface ReceiptRequest {
  locationId: string;
  supplierInvoiceId: string;
  /** `AAAA-MM-JJ`. */
  receiptDate: string;
  lines: ReceiptLineRequest[];
  clientRequestId?: string;
}

/** Contrat `RequesterFields` : au moins l'un des deux. */
export interface RequesterFields {
  takerId?: string;
  /** 1 à 200 caractères. Ignoré par le serveur quand `takerId` est fourni. */
  requestedBy?: string;
}

/** Contrat `IssueLine`. */
export interface IssueLineRequest {
  itemId: string;
  quantity: number;
  /** Exigé, jamais deviné. */
  costCategoryId: string;
}

/** Contrat `IssueRequest` (multi-lignes, B3-R3). */
export interface IssueRequest extends RequesterFields {
  locationId: string;
  siteId: string;
  /** `AAAA-MM-JJ`. */
  issueDate: string;
  /** 1 à 50 lignes. */
  lines: IssueLineRequest[];
  clientRequestId?: string;
}

/** Contrat `IssueRequestSingle` : forme d'un seul article, encore acceptée. */
export interface IssueRequestSingle extends RequesterFields {
  locationId: string;
  itemId: string;
  quantity: number;
  siteId: string;
  costCategoryId: string;
  /** `AAAA-MM-JJ`. */
  issueDate: string;
  clientRequestId?: string;
}

/** Contrat `TransferRequest`. */
export interface TransferRequest extends RequesterFields {
  fromLocationId: string;
  toLocationId: string;
  itemId: string;
  quantity: number;
  /** `AAAA-MM-JJ`. */
  transferDate: string;
  reasonCode: StockReasonCode;
  /** Obligatoire pour OTHER, 500 caractères au plus. */
  reason?: string;
  clientRequestId?: string;
}

/** Contrat `SupplierReturnRequest`. */
export interface SupplierReturnRequest {
  locationId: string;
  supplierInvoiceId: string;
  supplierInvoiceLineId?: string;
  itemId: string;
  quantity: number;
  /** `AAAA-MM-JJ`. */
  returnDate: string;
  reasonCode: StockReasonCode;
  reason?: string;
  clientRequestId?: string;
}

/** Contrat `ScrapRequest`. */
export interface ScrapRequest {
  locationId: string;
  itemId: string;
  quantity: number;
  /** `AAAA-MM-JJ`. */
  scrapDate: string;
  reasonCode: StockReasonCode;
  reason?: string;
  clientRequestId?: string;
}

// ---------------------------------------------------------------------------
// Factures réceptionnables (A8-R1, B3-R1)
// ---------------------------------------------------------------------------

/** Contrat `InvoiceLineView`. */
export interface StockInvoiceLineView {
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

/** Contrat `ReceivableInvoice` : facture validée, sans ses lignes. */
export interface StockReceivableInvoice {
  id: string;
  reference: string;
  supplierName: string;
  invoiceDate: string;
  siteId: string | null;
  siteName: string | null;
  receiptCount: number;
  lastReceiptAt: string | null;
  /** Valeur. */
  amount: number | null;
}

/** Contrat `InvoiceReceiptsView`. */
export interface StockInvoiceReceiptsView {
  invoice: {
    id: string;
    reference: string;
    supplierName: string;
    invoiceDate: string;
    status: 'DRAFT' | 'VALIDATED' | 'VOIDED';
    /** Valeur. */
    amount: number | null;
    lines: StockInvoiceLineView[];
  };
  /** Cumul par article, calculé par le serveur : l'écran n'additionne rien. */
  byItem: Array<{
    itemId: string;
    itemLabel: string;
    itemUnit: string;
    receivedQuantity: number;
    returnedQuantity: number;
    returnableQuantity: number;
    returnNeedsInvoiceLine: boolean;
    /** Valeur. */
    valuationSources?: StockValuationSource[] | null;
  }>;
  receipts: Array<{
    slipId: string | null;
    slipNumber: string | null;
    receiptDate: string;
    createdAt: string;
    createdByLabel: string;
    locationLabel: string;
    lines: Array<{
      itemId: string;
      itemLabel: string;
      itemUnit: string;
      quantity: number;
      unitCost: number | null;
      totalValue: number | null;
    }>;
  }>;
  returns: StockMovementView[];
  /** Valeur. */
  receivedValue: number | null;
  /** Valeur. */
  returnedValue: number | null;
}

// ---------------------------------------------------------------------------
// Lieux et contexte terrain (B3-R1)
// ---------------------------------------------------------------------------

/** Contrat `LocationView`. */
export interface StockLocationView {
  id: string;
  tenantId: string;
  kind: StockLocationKindValue;
  label: string;
  siteId: string | null;
  siteLabel: string | null;
  isActive: boolean;
  countInProgress: { countId: string; status: 'DRAFT' | 'COUNTED'; kind: StockCountKind } | null;
  /** Lieu d'un chantier clôturé : ni réception ni transfert entrant. */
  siteClosed: boolean;
  openingCountSuggested: boolean;
  toRecount: Array<{ itemId: string; itemLabel: string; countId: string; setAsideAt: string }>;
}

/** Contrat `TakerView`. */
export interface StockTakerView {
  id: string;
  /** « Koné Ibrahim — Équipe maçonnerie ». */
  label: string;
  fullName: string;
  teamOrCompany: string | null;
  /** `null` sans STOCK_TAKERS_MANAGE. */
  phone: string | null;
  employeeId: string | null;
  contractorId: string | null;
  linkedPersonLabel: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Droits de l'appelant (`FieldContext.abilities`), une seule source pour les gestes. */
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

/** Une personne liable à un preneur (le nom seulement). */
export interface StockPerson {
  kind: 'EMPLOYEE' | 'CONTRACTOR';
  id: string;
  fullName: string;
}

/** Contrat `FieldContext`. */
export interface StockFieldContext {
  locations: StockLocationView[];
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
  takers: StockTakerView[];
  receivableInvoices: StockReceivableInvoice[];
  reasonCodes: {
    count: StockReasonCode[];
    scrap: StockReasonCode[];
    supplierReturn: StockReasonCode[];
    transfer: StockReasonCode[];
  };
  settings: { requireTaker: boolean; backdatingLimitDays: number };
  abilities: StockAbilities;
  /** Vide sans STOCK_TAKERS_MANAGE. */
  people: StockPerson[];
}

/** Contrat `CreateTakerRequest`. */
export interface CreateTakerRequest {
  fullName: string;
  teamOrCompany?: string | null;
  phone?: string | null;
  employeeId?: string | null;
  /** Exclusif avec `employeeId`. */
  contractorId?: string | null;
}

/** Contrat `UpdateTakerRequest` : au moins un champ ; `phone: null` efface le numéro. */
export interface UpdateTakerRequest {
  fullName?: string;
  teamOrCompany?: string | null;
  phone?: string | null;
  employeeId?: string | null;
  contractorId?: string | null;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Inventaires
// ---------------------------------------------------------------------------

/** Contrat `CountLineView`. */
export interface StockCountLineView {
  id: string;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  /** `null` = ligne non comptée créée à la clôture du comptage (A2-R8). */
  countedQuantity: number | null;
  notCounted: boolean;
  countedBlind: boolean | null;
  countedByUserId: string | null;
  countedByLabel: string | null;
  countedAtServer: string | null;
  /** `null` en DRAFT, pour tous (aveugle). */
  expectedQuantity: number | null;
  /** `null` en DRAFT. */
  variance: number | null;
  /** Valeur. */
  varianceValue: number | null;
  /** Valeur ; VALIDATED seulement. */
  unitCostAtValidation: number | null;
  reasonCode: StockReasonCode | null;
  reason: string | null;
  /** Règle unique A4-R2, calculée par le serveur : l'écran n'a pas sa propre règle. */
  justified: boolean;
  justifiedByLabel: string | null;
  justifiedAt: string | null;
  setAside: { at: string; byLabel: string; reason: string } | null;
  /** VALIDATED seulement. */
  movementsSinceCapture: number | null;
  attachmentsCount: number;
}

/** Contrat `CountView`. */
export interface StockCountView {
  id: string;
  tenantId: string;
  locationId: string;
  locationLabel: string;
  kind: StockCountKind;
  status: StockCountStatus;
  /** Vrai en DRAFT et en CANCELLED : attendu et écarts masqués à tous. */
  blind: boolean;
  countedAt: string;
  createdByUserId: string;
  createdByLabel: string;
  closedAt: string | null;
  closedByLabel: string | null;
  validatedAt: string | null;
  validatedByLabel: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  selfValidated: boolean;
  selfValidationReason: string | null;
  counters: Array<{ userId: string; label: string }>;
  /** Vide dans la liste. */
  lines: StockCountLineView[];
  linesCount: number;
  uncountedLinesCount: number;
  /** `null` tant que `blind`. */
  varianceCount: number | null;
  countedValue: number | null;
  varianceValueGross: number | null;
  varianceValueNet: number | null;
  setAsideVarianceValue: number | null;
  currency: string;
  slip: StockSlipSummary | null;
  /** COUNTED seulement, calculé pour l'appelant (A1-R5). */
  validation: { callerIsCounter: boolean; selfValidationAllowed: boolean } | null;
  toRecount: Array<{ itemId: string; itemLabel: string }>;
}

/** Contrat `CreateCountRequest`. */
export interface CreateCountRequest {
  locationId: string;
  /** `AAAA-MM-JJ`. */
  countedAt: string;
  /** `REGULAR` par défaut. */
  kind?: StockCountKind;
}

/** Contrat `SetCountLineRequest` : jamais de motif à la saisie (A2-R5). */
export interface SetCountLineRequest {
  itemId: string;
  /** Zéro accepté. */
  countedQuantity: number;
  clientRequestId?: string;
}

/** Contrat `JustifyLineRequest`. */
export interface JustifyLineRequest {
  reasonCode: StockReasonCode;
  /** Obligatoire pour OTHER. */
  reason?: string | null;
}

/** Contrat `ValidateCountRequest`. */
export interface ValidateCountRequest {
  /** Exigé seulement en dérogation (A1-R3), 10 à 500 caractères. */
  selfValidationReason?: string;
}

/** Filtres de `GET /stock/counts`. */
export interface StockCountsFilters {
  locationId?: string;
  status?: StockCountStatus;
  kind?: StockCountKind;
}

// ---------------------------------------------------------------------------
// Pièces jointes (B5)
// ---------------------------------------------------------------------------

/** Contrat `AttachmentView`. */
export interface StockAttachmentView {
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
  createdAt: string;
  removed: { at: string; byLabel: string; reason: string } | null;
  /** Calculé par le serveur pour l'appelant. */
  canRemove: boolean;
  removableUntil: string | null;
}

/** Corps du dépôt d'une pièce jointe (multipart, champ « file »). */
export interface StockAttachmentUpload {
  file: Blob;
  /** Nom d'affichage du fichier envoyé. */
  fileName?: string;
  targetType: StockAttachmentTarget;
  targetId: string;
  purpose?: StockAttachmentPurpose;
  caption?: string;
  clientRequestId: string;
}

// ---------------------------------------------------------------------------
// Alertes, indicateurs, réglages (B7, B8, A9)
// ---------------------------------------------------------------------------

/** Contrat `AlertView`. */
export interface StockAlertView {
  id: string;
  kind: StockAlertKind;
  severity: StockAlertSeverity;
  status: StockAlertStatus;
  /** Construit et traduit par le serveur : affiché tel quel. */
  title: string;
  /** Construit et traduit par le serveur : affiché tel quel. */
  message: string;
  amount: number | null;
  threshold: number | null;
  currency: string;
  site: { id: string; name: string } | null;
  location: { id: string; label: string } | null;
  subjectType: StockAlertSubjectType;
  subjectId: string;
  subjectLabel: string | null;
  mode?: 'SINGLE' | 'MONTHLY_CUMUL' | null;
  raisedAt: string;
  acknowledgedAt: string | null;
  acknowledgedByLabel: string | null;
  acknowledgeNote: string | null;
}

/** Filtres de `GET /stock/alerts`. */
export interface StockAlertsFilters {
  status?: StockAlertStatus;
  kind?: StockAlertKind;
  siteId?: string;
  locationId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** Contrat `IndicatorRow`. */
export interface StockIndicatorRow {
  locationId?: string | null;
  locationLabel?: string | null;
  /** « 2026-09 ». */
  month: string;
  countsValidated: number;
  countsWithoutFrozenValues: number;
  countedValue: number;
  varianceValueGross: number;
  setAsideVarianceValue: number;
  /** 0 à 1 ; `null` sans inventaire. */
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
export interface StockIndicatorsView {
  from: string;
  to: string;
  rows: StockIndicatorRow[];
  totals: StockIndicatorRow[];
}

/** Paramètres de `GET /stock/indicators` (mois `AAAA-MM`, 1 à 24 mois). */
export interface StockIndicatorsQuery {
  from: string;
  to: string;
  locationId?: string;
}

/** Contrat `ControlsSettings`. */
export interface StockControlsSettings {
  backdatingLimitDays: number;
  requireTaker: boolean;
  issueAlertAmount: number | null;
  countVarianceAlertAmount: number | null;
  countVarianceAlertPercent: number | null;
  cashMaterialAlertAmount: number | null;
  materialCostCategoryIds: string[];
  effectiveMaterialCostCategoryIds: string[];
  updatedAt: string | null;
  updatedByLabel: string | null;
}

/** Contrat `ControlsSettingsPatch` : seulement les champs modifiés ; `null` désactive un seuil. */
export interface ControlsSettingsPatch {
  backdatingLimitDays?: number;
  requireTaker?: boolean;
  issueAlertAmount?: number | null;
  countVarianceAlertAmount?: number | null;
  countVarianceAlertPercent?: number | null;
  cashMaterialAlertAmount?: number | null;
  materialCostCategoryIds?: string[];
}

/** Un auteur de mouvements (`GET /stock/movements/authors`). */
export interface StockMovementAuthor {
  userId: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Libellés partagés (ecrans §3.6) — texte français = clé
// ---------------------------------------------------------------------------

/** Motifs : libellés de spec §4, à l'identique. */
export const STOCK_REASON_LABELS: Record<StockReasonCode, string> = {
  BREAKAGE: t('Casse'),
  DETERIORATION: t('Détérioration (humidité, péremption)'),
  COUNTING_ERROR: t('Erreur du comptage précédent'),
  ENTRY_ERROR: t('Erreur de saisie d’un mouvement'),
  UNIT_CONFUSION: t('Confusion d’unité'),
  UNRECORDED_ISSUE: t('Sortie non enregistrée'),
  UNRECORDED_RECEIPT: t('Réception non enregistrée'),
  UNEXPLAINED_DISAPPEARANCE: t('Disparition non expliquée'),
  OPENING_BALANCE: t('Stock d’ouverture (posé par le système)'),
  NON_CONFORMING: t('Non conforme à la commande'),
  DAMAGED_ON_DELIVERY: t('Endommagé à la livraison'),
  EXCESS_DELIVERY: t('Livré en trop'),
  SITE_SUPPLY: t('Approvisionnement d’un chantier'),
  RETURN_TO_WAREHOUSE: t('Retour au magasin'),
  SITE_EVACUATION: t('Évacuation d’un chantier'),
  REBALANCING: t('Rééquilibrage entre lieux'),
  OTHER: t('Autre (précision obligatoire)')
};

/** Aide affichée sous l'option, quand elle existe. */
export const STOCK_REASON_HELP: Partial<Record<StockReasonCode, string>> = {
  BREAKAGE: t('Matière brisée ou endommagée sur place.'),
  DETERIORATION: t('Matière devenue inutilisable avec le temps.'),
  COUNTING_ERROR: t('Le dernier inventaire avait mal compté.'),
  ENTRY_ERROR: t('Une réception, une sortie ou un transfert a été mal saisi.'),
  UNIT_CONFUSION: t('Compté dans une autre unité que celle de l’article.'),
  UNRECORDED_ISSUE: t('De la matière est partie sans sortie saisie.'),
  UNRECORDED_RECEIPT: t('De la matière est arrivée sans réception saisie.'),
  UNEXPLAINED_DISAPPEARANCE: t('Il manque de la matière et personne n’en connaît la cause. C’est une constatation.')
};

/** Le libellé d'un motif, ou « Motif libre : … » pour une ligne d'avant le lot. */
export function stockReasonDisplay(reasonCode: StockReasonCode | null, reason: string | null): string | null {
  if (reasonCode) return STOCK_REASON_LABELS[reasonCode];
  const libre = (reason ?? '').trim();
  return libre ? t('Motif libre : {{reason}}', { reason: libre }) : null;
}

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Statut d'inventaire : toujours passé en `label` à `<StatusTag>` (son « DRAFT » dit « Brouillon »). */
export const STOCK_COUNT_STATUS_DISPLAY: Record<StockCountStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: t('Comptage en cours'), tone: 'info' },
  COUNTED: { label: t('Comptage clos'), tone: 'warning' },
  VALIDATED: { label: t('Validé'), tone: 'success' },
  CANCELLED: { label: t('Abandonné'), tone: 'neutral' }
};

export const STOCK_COUNT_KIND_LABELS: Record<StockCountKind, string> = {
  REGULAR: t('Inventaire courant'),
  OPENING: t('Inventaire d’ouverture'),
  CLOSING: t('Inventaire de clôture')
};

export const STOCK_SLIP_KIND_LABELS: Record<StockSlipKind, string> = {
  RECEIPT: t('Bon de réception'),
  ISSUE: t('Bon de sortie'),
  COUNT_REPORT: t('Procès-verbal d’inventaire')
};

export const STOCK_ATTACHMENT_PURPOSE_LABELS: Record<StockAttachmentPurpose, string> = {
  GOODS_PHOTO: t('Photo de la marchandise'),
  DELIVERY_NOTE: t('Bon de livraison du fournisseur'),
  SIGNED_SLIP: t('Bon signé'),
  OTHER: t('Autre document')
};

/** Source du prix : affichée avec les valeurs seulement. */
export const STOCK_VALUATION_SOURCE_LABELS: Record<StockValuationSource, string> = {
  DECLARED: t('Prix saisi'),
  INVOICE_LINE: t('Prix de la ligne de facture'),
  AVERAGE_COST: t('Coût moyen du lieu'),
  LAST_RECEIPT: t('Dernier prix reçu'),
  NONE: t('Aucun prix connu')
};

export const STOCK_ALERT_SEVERITY_DISPLAY: Record<StockAlertSeverity, { label: string; tone: Tone }> = {
  WARNING: { label: t('À regarder'), tone: 'warning' },
  INFO: { label: t('Information'), tone: 'info' }
};

/** Natures d'alerte (filtre). Le titre d'une alerte vient du serveur. */
export const STOCK_ALERT_KIND_LABELS: Record<StockAlertKind, string> = {
  COUNT_VARIANCE: t('Écart d’inventaire au-dessus du seuil'),
  COUNT_LINE_SET_ASIDE: t('Lignes d’inventaire écartées'),
  COUNT_CANCELLED: t('Inventaire abandonné'),
  LARGE_ISSUE: t('Sortie importante'),
  LARGE_SCRAP: t('Rebut important'),
  RECEIPT_REPEATED: t('Facture déjà réceptionnée'),
  RECEIPT_OVER_INVOICE: t('Valeur reçue supérieure à la facture'),
  RECEIPT_UNVALUED: t('Réception sans prix connu'),
  CASH_MATERIAL_PURCHASE: t('Achat de matériaux en espèces'),
  COUNT_SELF_VALIDATED: t('Inventaire validé par son compteur')
};
