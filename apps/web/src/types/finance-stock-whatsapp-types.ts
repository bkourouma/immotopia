/**
 * Types de l'inventaire de chantier par WhatsApp — lot 041.
 *
 * Recopie du contrat `specs/041-inventaire-whatsapp/contracts/openapi.yaml`
 * (version 1.0.0), avec les NOMS du contrat. Les schémas déclarés en ligne
 * dans une route du contrat portent ici un nom tiré de son `operationId`.
 *
 * Règles reprises du serveur :
 *  - le numéro de téléphone n'est en clair (`phoneE164`) que dans une
 *    inscription, lue par un détenteur de FINANCE_SETTINGS_MANAGE ; partout
 *    ailleurs, `phoneMasked` ;
 *  - le code d'activation n'est rendu QUE par la création et la régénération ;
 *  - une quantité théorique ou une valeur reçue à `null` s'affiche comme le
 *    lot 040 (« Comptage en cours », colonne absente) : l'écran ne montre que
 *    ce que le serveur rend.
 */

/** Même forme que `Meta` du lot 040 : `valuesVisible`, `blindLocationIds`, `nextCursor`. */
export type { StockMeta } from './finance-stock-controle-types';

// ---------------------------------------------------------------------------
// Inscriptions (W3)
// ---------------------------------------------------------------------------

export type RegistrationStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'REVOKED';

export type SiteIneligibleReason = 'CLOSED' | 'NOT_STOCK_ENABLED' | 'LOCATION_INACTIVE';

export interface SiteRef {
  siteId: string;
  name: string;
  locationId?: string | null;
  /** Ouvert, basculé au stock, lieu actif (relu à chaque lecture). */
  eligible: boolean;
  ineligibleReason?: SiteIneligibleReason | null;
}

/** Corps de `POST …/whatsapp/registrations`. Rien d'autre : ni `tenantId`, ni statut. */
export interface CreateRegistrationRequest {
  userId: string;
  /** Saisi librement ; normalisé par le serveur (225 par défaut). */
  phone: string;
  /** 1 à 10, sans doublon. */
  siteIds: string[];
}

export type RegistrationAccessReason =
  'TENANT_SUSPENDED' | 'MEMBERSHIP_NOT_ACTIVE' | 'USER_INACTIVE' | 'ROLE_MISSING' | 'OPTION_MISSING';

/** Contrôle W3-R10 relu à la lecture, pour l'écran. */
export interface RegistrationAccess {
  ok?: boolean;
  reason?: RegistrationAccessReason | null;
}

export interface RegistrationView {
  id: string;
  userId: string;
  userLabel: string;
  /** En clair : route réservée à FINANCE_SETTINGS_MANAGE. */
  phoneE164: string;
  /** Ex. « +225 07 •• •• •• 78 ». */
  phoneMasked: string;
  status: RegistrationStatus;
  activationExpiresAt?: string | null;
  activationAttemptsLeft?: number | null;
  activatedAt?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
  lastInboundAt?: string | null;
  access?: RegistrationAccess;
  sites: SiteRef[];
  openSessionId?: string | null;
  createdAt: string;
}

/** Création et régénération seulement : le code est rendu UNE fois, jamais relisible. */
export interface RegistrationWithCode extends RegistrationView {
  /** Six chiffres. */
  activationCode: string;
  /** WHATSAPP_INVENTORY_PUBLIC_NUMBER. */
  botNumber: string | null;
}

/** Élément de `GET …/whatsapp/eligible-members` (operationId `listStockWhatsappEligibleMembers`). */
export interface EligibleMember {
  userId: string;
  /** fullName, sinon e-mail. */
  label: string;
  /** Porte déjà une inscription non révoquée. */
  registered: boolean;
}

/** Corps de `PATCH …/registrations/{registrationId}` : remplace les chantiers affectés. */
export interface UpdateRegistrationSitesRequest {
  /** 1 à 10, sans doublon. */
  siteIds: string[];
}

/** Corps de `POST …/registrations/{registrationId}/revoke`. */
export interface RevokeRegistrationRequest {
  /** 500 caractères au plus. */
  reason?: string;
}

export interface RegistrationsFilters {
  status?: RegistrationStatus;
}

// ---------------------------------------------------------------------------
// Passerelle, quota, mesures (W1, W11, W14-R7)
// ---------------------------------------------------------------------------

export type WhatsappTransportId = 'disabled' | 'log' | 'meta';
export type StockVisionProviderId = 'disabled' | 'fake' | 'gemini' | 'openrouter';
/** `NONE` : `enforce` sans option. */
export type WhatsappQuotaSource = 'OPTION' | 'WARN_FALLBACK' | 'OFF_FALLBACK' | 'NONE';

export interface WhatsappQuota {
  /** « AAAA-MM ». */
  month: string;
  used: number;
  limit: number;
  source: WhatsappQuotaSource;
  /** Blocs EXT_INVENTAIRE_WHATSAPP souscrits. */
  blocks?: number;
}

/** Agence entière, jamais par personne (W14-R7). */
export interface WhatsappMeasures {
  photosAnalyzed?: number;
  medianSecondsToConfirm?: number | null;
  /** ACCEPTED ÷ (ACCEPTED + CORRECTED). */
  acceptedFirstTimeRate?: number | null;
  /** Lignes WhatsApp avec photo non retirée ÷ lignes WhatsApp. */
  proofCoverageRate?: number | null;
  unreadableRate?: number | null;
  unrecognizedRate?: number | null;
  failedRate?: number | null;
}

export interface WhatsappOverview {
  transport: WhatsappTransportId;
  /** meta : variables présentes ; log : vrai ; disabled : faux. */
  gatewayReady?: boolean;
  botNumber?: string | null;
  simulatorAvailable: boolean;
  vision: { provider?: StockVisionProviderId; model?: string };
  quota: WhatsappQuota;
  measures: WhatsappMeasures;
}

// ---------------------------------------------------------------------------
// Comptages terrain (W14, ecrans §3)
// ---------------------------------------------------------------------------

export type StockCountSource = 'WEB' | 'WHATSAPP';

export interface FieldCountLastCount {
  countId?: string;
  countStatus?: 'DRAFT' | 'COUNTED' | 'VALIDATED';
  countSource?: StockCountSource;
  /** `null` pour une ligne non comptée (A2-R8). */
  countedQuantity?: number | null;
  countedAtServer?: string | null;
  countedByLabel?: string | null;
  captureId?: string | null;
  hasPhoto?: boolean;
  outcome?: 'ACCEPTED' | 'CORRECTED' | null;
}

export interface FieldCountRow {
  locationId: string;
  locationLabel: string;
  siteId?: string | null;
  siteName?: string | null;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  unit: string;
  /** Solde courant ; `null` sur un lieu en comptage sans STOCK_COUNT_VALIDATE. */
  theoreticalQuantity?: number | null;
  /** Valeur : `null` sans STOCK_VALUES_VIEW ou sur un lieu en comptage. */
  theoreticalValue?: number | null;
  /** Valeur : idem. */
  averageUnitCost?: number | null;
  lastCount?: FieldCountLastCount | null;
}

export interface FieldCountsFilters {
  siteId?: string;
  locationId?: string;
  itemId?: string;
  /** Source du dernier comptage. */
  source?: StockCountSource;
  cursor?: string;
  /** 1 à 200, 50 par défaut. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Captures et preuve (T10, W14)
// ---------------------------------------------------------------------------

export type CaptureOutcome =
  | 'RECEIVED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'CORRECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'UNREADABLE'
  | 'UNRECOGNIZED'
  | 'FAILED';

export type WhatsappVia = 'META' | 'SIMULATOR';

export interface CaptureSummary {
  id: string;
  receivedAt: string;
  outcome: CaptureOutcome;
  via: WhatsappVia;
  siteName?: string | null;
  locationId?: string | null;
  itemId?: string | null;
  itemLabel?: string | null;
  unit?: string | null;
  proposedTotal?: number | null;
  confirmedQuantity?: number | null;
  chefLabel?: string;
  countId?: string | null;
  hasPhoto: boolean;
}

export type StockVisionQuality = 'OK' | 'TOO_DARK' | 'BLURRY' | 'NOT_STOCK';
export type StockVisionMethod = 'SACKS_STACKED' | 'BARS_BUNDLE' | 'BLOCKS_PALLET' | 'OTHER';
export type StockVisionFailureReason = 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'DISABLED';

/** Sortie validée de l'IA (spec W8-R5). Aucun champ de stock théorique. */
export interface StockVisionResult {
  quality: StockVisionQuality;
  itemId: string | null;
  itemConfidence: number;
  visibleUnits: number;
  layers: number | null;
  columns: number | null;
  depthRows: number | null;
  proposedTotal: number;
  confidence: number;
  method: StockVisionMethod;
  explanation: string;
}

export interface CaptureView extends CaptureSummary {
  /** Empreinte du fichier stocké. */
  sha256?: string;
  mimeType?: string;
  sizeBytes?: number;
  itemImposed?: boolean;
  itemReference?: string | null;
  countLineId?: string | null;
  countStatus?: 'DRAFT' | 'COUNTED' | 'VALIDATED' | 'CANCELLED' | null;
  lineQuantityAfter?: number | null;
  mergeMode?: 'ADD' | 'REPLACE' | null;
  confirmedAt?: string | null;
  sessionId?: string;
  analysis?: StockVisionResult | null;
  vision?: {
    provider?: string | null;
    model?: string | null;
    analysisMs?: number | null;
    failureReason?: StockVisionFailureReason | null;
  };
  photoRemoved?: { at?: string; byLabel?: string; reason?: string } | null;
  /** STOCK_DISPOSE et photo présente. */
  canRemovePhoto?: boolean;
  canReadConversation?: boolean;
}

export interface CapturesFilters {
  countId?: string;
  locationId?: string;
  itemId?: string;
  outcome?: CaptureOutcome;
  /** Date « AAAA-MM-JJ ». */
  from?: string;
  /** Date « AAAA-MM-JJ ». */
  to?: string;
  cursor?: string;
  /** 1 à 100, 50 par défaut. */
  limit?: number;
}

/** Corps de `POST …/captures/{captureId}/remove-photo`. */
export interface RemoveCapturePhotoRequest {
  /** 3 à 500 caractères. */
  reason: string;
}

/** Ligne de `GET …/whatsapp/counts/{countId}/captures`. */
export interface CountCaptureLine {
  itemId: string;
  countLineId?: string | null;
  captureId: string;
  outcome: 'ACCEPTED' | 'CORRECTED';
  mergeMode?: 'ADD' | 'REPLACE' | null;
  confirmedAt: string;
  hasPhoto: boolean;
  /** Captures confirmées pour cet article dans l'inventaire (additions comprises). */
  capturesCount?: number;
}

/** Données de `GET …/whatsapp/counts/{countId}/captures` (operationId `listStockCountFieldCaptures`). Aucun attendu. */
export interface CountFieldCaptures {
  countId: string;
  source: StockCountSource;
  lines: CountCaptureLine[];
}

/** `meta` des listes paginées par curseur sans masque (captures, sessions). */
export interface CursorMeta {
  nextCursor?: string | null;
}

// ---------------------------------------------------------------------------
// Conversations (T9, W14-R3)
// ---------------------------------------------------------------------------

export type SessionState =
  'AWAITING_SITE' | 'ANALYZING' | 'AWAITING_ITEM' | 'AWAITING_CONFIRMATION' | 'AWAITING_MERGE' | 'READY' | 'CLOSED';

export type SessionCloseReason = 'FIN' | 'SITE_CHANGE' | 'TIMEOUT' | 'ACCESS_LOST' | 'REVOKED' | 'NO_SITE';
export type SessionCountOutcome = 'COUNTED' | 'LEFT_OPEN' | 'NONE';

export interface SessionView {
  id: string;
  registrationId: string;
  chefLabel?: string;
  state: SessionState;
  siteName?: string | null;
  countId?: string | null;
  openedAt: string;
  lastInboundAt?: string;
  closedAt?: string | null;
  closeReason?: SessionCloseReason | null;
  countOutcome?: SessionCountOutcome | null;
  capturesCount?: number;
}

export interface SessionsFilters {
  registrationId?: string;
  open?: boolean;
  cursor?: string;
}

export type ConversationDirection = 'INBOUND' | 'OUTBOUND';
export type ConversationMessageKind = 'TEXT' | 'IMAGE' | 'BUTTONS' | 'LIST' | 'REPLY' | 'UNSUPPORTED';

export interface ConversationInteractiveItem {
  id?: string;
  title?: string;
  description?: string;
}

export interface ConversationMessage {
  id: string;
  direction: ConversationDirection;
  kind: ConversationMessageKind;
  /** 1 000 caractères au plus. */
  text?: string | null;
  /** Boutons ou lignes proposés, ou réponse choisie. */
  interactive?: ConversationInteractiveItem[] | null;
  captureId?: string | null;
  via?: WhatsappVia | null;
  sendError?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Simulateur (W13)
// ---------------------------------------------------------------------------

/**
 * Corps JSON de `POST …/simulator/messages` : exactement une cible
 * (`registrationId` ou `freePhone`) et exactement un contenu (`text` ou `replyId`).
 */
export interface SimulatorTextOrReply {
  registrationId?: string;
  /** 40 caractères au plus. */
  freePhone?: string;
  /** 1 à 1 000 caractères. */
  text?: string;
  /** Identifiant d'un bouton ou d'une ligne proposés par le bot. */
  replyId?: string;
  /** 24 caractères au plus. */
  replyTitle?: string;
}

/** Corps `multipart/form-data` de `POST …/simulator/messages` : une photo. */
export interface SimulatorPhotoMessage {
  registrationId?: string;
  freePhone?: string;
  /** Lue par le faux fournisseur seulement (fake:…). 200 caractères au plus. */
  caption?: string;
  /** JPEG, PNG ou WebP, 10 Mo. */
  file: Blob;
  fileName?: string;
}

/** Réponse `202` de `POST …/simulator/messages`. */
export interface SimulatorInjectResult {
  metaMessageId?: string;
}

export interface SimulatorConversationQuery {
  registrationId?: string;
  freePhone?: string;
  /** Messages postérieurs (relecture incrémentale), date-heure ISO. */
  after?: string;
}

/** Données de `GET …/simulator/conversation`. */
export interface SimulatorConversation {
  session?: SessionView | null;
  messages?: ConversationMessage[];
}

/** Corps de `POST …/simulator/sessions/{sessionId}/advance`. */
export interface AdvanceSimulatorClockRequest {
  minutes: 10 | 30;
}

// ---------------------------------------------------------------------------
// Codes d'erreur et clés d'audit
// ---------------------------------------------------------------------------

export type StockWhatsappErrorCode =
  | 'STOCK_WHATSAPP_PHONE_INVALID'
  | 'STOCK_WHATSAPP_PHONE_UNAVAILABLE'
  | 'STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE'
  | 'STOCK_WHATSAPP_MEMBER_ALREADY_REGISTERED'
  | 'STOCK_WHATSAPP_SITES_REQUIRED'
  | 'STOCK_WHATSAPP_SITE_NOT_ELIGIBLE'
  | 'STOCK_WHATSAPP_REGISTRATION_WRONG_STATUS'
  | 'STOCK_WHATSAPP_PHOTO_ALREADY_REMOVED'
  | 'STOCK_WHATSAPP_PHOTO_REMOVED'
  | 'STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE'
  | 'STOCK_WHATSAPP_SIMULATOR_FILE_TYPE'
  | 'STOCK_WHATSAPP_FILE_TOO_LARGE'
  | 'STOCK_WHATSAPP_CONVERSATION_FORBIDDEN';

export type StockWhatsappAuditKey =
  | 'STOCK_WHATSAPP_REGISTRATION_CREATED'
  | 'STOCK_WHATSAPP_REGISTRATION_UPDATED'
  | 'STOCK_WHATSAPP_ACTIVATION_CODE_REGENERATED'
  | 'STOCK_WHATSAPP_REGISTRATION_ACTIVATED'
  | 'STOCK_WHATSAPP_ACTIVATION_LOCKED'
  | 'STOCK_WHATSAPP_REGISTRATION_REVOKED'
  | 'STOCK_WHATSAPP_COUNT_RECORDED'
  | 'STOCK_WHATSAPP_COUNT_CLOSED'
  | 'STOCK_WHATSAPP_QUOTA_REACHED'
  | 'STOCK_WHATSAPP_PHOTO_REMOVED';
