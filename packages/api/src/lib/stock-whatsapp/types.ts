import { z } from 'zod';

/**
 * Types partagés de l'inventaire de chantier par WhatsApp et IA (lot 041,
 * plan §3.3). Les territoires de l'étape 1 codent contre ces formes : les
 * changer demande l'accord du Pilote.
 *
 * Règle de l'aveugle (spec §8.3) : aucun de ces types ne porte un attendu, un
 * solde, un écart, une valeur ni un coût. Le bot et l'IA ne voient que ce que
 * le chef a compté.
 */

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Canal d'arrivée d'un message entrant (colonne `via`, enum `WhatsappInboundVia`). */
export type WhatsappVia = 'META' | 'SIMULATOR';

/** Message entrant, converti depuis le webhook Meta ou injecté par le simulateur. */
export type InboundMessage = {
  /** wamid, ou `sim-<uuid>` pour le simulateur. */
  metaMessageId: string;
  /** Numéro de l'expéditeur, normalisé E.164 (`waIdToE164`). */
  fromE164: string;
  /** Heure du serveur à la réception. */
  receivedAt: Date;
  /** Horodatage annoncé par Meta. */
  sentAt: Date;
  via: WhatsappVia;
} & (
  | { kind: 'TEXT'; text: string }
  | {
      kind: 'IMAGE';
      media: { mediaId: string; mimeType: string; providerSha256: string | null; caption: string | null };
    }
  | { kind: 'REPLY'; replyId: string; replyTitle: string; contextMessageId: string | null }
  | { kind: 'UNSUPPORTED'; originalType: string }
);

/**
 * Message sortant du bot. Les bornes Meta (W1-R4) sont appliquées par le
 * transport, pas par l'appelant : boutons 1 à 3, lignes de liste 1 à 10.
 */
export type OutboundMessage =
  | { kind: 'TEXT'; text: string }
  | { kind: 'BUTTONS'; text: string; buttons: Array<{ id: string; title: string }> }
  | {
      kind: 'LIST';
      text: string;
      buttonText: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    };

// ---------------------------------------------------------------------------
// Transport (W1)
// ---------------------------------------------------------------------------

export interface WhatsappTransport {
  readonly id: 'meta' | 'log' | 'disabled';
  /** Bornes Meta appliquées ici (W1-R4). Écrit le message sortant dans StockWhatsappMessage. */
  send(input: {
    toE164: string;
    message: OutboundMessage;
    /** `null` : expéditeur inconnu, rien n'est journalisé. */
    log: { tenantId: string; registrationId: string; sessionId: string | null; captureId: string | null } | null;
  }): Promise<{ metaMessageId: string | null; error: string | null }>;
  /** Accusé de lecture (W1-R5). Ne lève jamais. */
  markRead(metaMessageId: string): Promise<void>;
  /** Garde SSRF, 10 Mo, octets lus ; lève `MediaFetchError`. */
  fetchMedia(mediaId: string): Promise<{ buffer: Buffer; declaredMimeType: string; providerSha256: string | null }>;
}

export type MediaFetchErrorReason = 'TOO_LARGE' | 'HOST_NOT_ALLOWED' | 'HTTP' | 'TIMEOUT' | 'NOT_FOUND';

/** Échec du téléchargement d'un média (W6-R9). Le message ne contient jamais d'URL signée ni de jeton. */
export class MediaFetchError extends Error {
  constructor(
    readonly reason: MediaFetchErrorReason,
    message: string
  ) {
    super(message);
    this.name = 'MediaFetchError';
  }
}

// ---------------------------------------------------------------------------
// Vision (W8)
// ---------------------------------------------------------------------------

/** Article candidat envoyé à l'IA (W8-R4). JAMAIS de solde, de valeur ni de coût. */
export type StockVisionCandidate = {
  id: string;
  reference: string;
  label: string;
  unit: string;
  category: string | null;
};

export type StockVisionRequest = {
  /** Fichier STOCKÉ (EXIF retiré). */
  image: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** 300 au plus ; jamais de solde. */
  candidates: StockVisionCandidate[];
  imposedItemId: string | null;
  /** Légende de la photo, lue par le SEUL fournisseur `fake` (W8-R9) ; jamais envoyée à une vraie IA. */
  fakeDirective: string | null;
};

export type StockVisionQualityValue = 'OK' | 'TOO_DARK' | 'BLURRY' | 'NOT_STOCK';
export type StockVisionMethodValue = 'SACKS_STACKED' | 'BARS_BUNDLE' | 'BLOCKS_PALLET' | 'OTHER';

/** Sortie validée de l'IA (spec W8-R5). Aucun champ de stock théorique. */
export type StockVisionResult = {
  quality: StockVisionQualityValue;
  itemId: string | null;
  itemConfidence: number;
  visibleUnits: number;
  layers: number | null;
  columns: number | null;
  depthRows: number | null;
  proposedTotal: number;
  confidence: number;
  method: StockVisionMethodValue;
  explanation: string;
};

export const STOCK_VISION_QUALITIES = ['OK', 'TOO_DARK', 'BLURRY', 'NOT_STOCK'] as const;
export const STOCK_VISION_METHODS = ['SACKS_STACKED', 'BARS_BUNDLE', 'BLOCKS_PALLET', 'OTHER'] as const;
export const STOCK_VISION_MAX_TOTAL = 1_000_000;
export const STOCK_VISION_EXPLANATION_MAX = 300;

/**
 * Arrondi à quatre décimales (précision des quantités de stock, `Decimal(16, 4)`).
 * Un total plus précis rendu par l'IA est arrondi, pas rejeté (M13).
 */
function roundToFourDecimals(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const ratio = z.number().finite().min(0).max(1);
const dimension = z.number().int().min(1).nullable();

/**
 * Validation de la sortie de l'IA (W8-R5) — l'autorité, quel que soit le
 * respect du schéma par le fournisseur. Une sortie qui échoue vaut
 * `INVALID_OUTPUT`. `proposedTotal` est arrondi à quatre décimales (le reste
 * reste strict). Un `itemId` hors de la liste des candidats n'est PAS
 * contrôlé ici (le schéma ne connaît pas la liste) : le fournisseur le ramène à
 * `null` après validation.
 */
export const stockVisionResultSchema: z.ZodType<StockVisionResult> = z
  .object({
    quality: z.enum(STOCK_VISION_QUALITIES),
    itemId: z.string().min(1).max(64).nullable(),
    itemConfidence: ratio,
    visibleUnits: z.number().int().min(0),
    layers: dimension,
    columns: dimension,
    depthRows: dimension,
    proposedTotal: z.number().finite().min(0).max(STOCK_VISION_MAX_TOTAL).transform(roundToFourDecimals),
    confidence: ratio,
    method: z.enum(STOCK_VISION_METHODS),
    explanation: z.string().max(STOCK_VISION_EXPLANATION_MAX)
  })
  .strict();

export type StockVisionFailureReason = 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'DISABLED';

export type StockVisionOutcome =
  | { ok: true; result: StockVisionResult; provider: string; model: string; latencyMs: number }
  | { ok: false; reason: StockVisionFailureReason; provider: string; model: string; latencyMs: number };

export interface StockVisionProvider {
  readonly id: 'gemini' | 'openrouter' | 'fake' | 'disabled';
  readonly model: string;
  /** Ne lève jamais. */
  analyze(request: StockVisionRequest, signal: AbortSignal): Promise<StockVisionOutcome>;
}

// ---------------------------------------------------------------------------
// Accès du chef (W3-R10, W12)
// ---------------------------------------------------------------------------

export type ChefLanguage = 'fr' | 'en' | 'ar';
export type WhatsappQuotaSource = 'OPTION' | 'WARN_FALLBACK' | 'OFF_FALLBACK';

export type ChefAccessDeniedReason =
  | 'TENANT_SUSPENDED'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'USER_INACTIVE'
  | 'ROLE_MISSING'
  | 'REGISTRATION_NOT_ACTIVE'
  | 'OPTION_MISSING';

/** Contrôle relu EN BASE à chaque message et avant chaque écriture (W3-R10, W12-R2). */
export type ChefAccess =
  | {
      ok: true;
      tenantId: string;
      userId: string;
      registrationId: string;
      language: ChefLanguage;
      quota: { limit: number; source: WhatsappQuotaSource };
    }
  | { ok: false; reason: ChefAccessDeniedReason };
