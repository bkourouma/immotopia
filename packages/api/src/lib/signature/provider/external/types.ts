/**
 * Cadre générique d'un prestataire de signature EXTERNE (spec 044, lot S6, SG-R1/SG-R13).
 *
 * Le prestataire porte le parcours du signataire (invitation, authentification,
 * signature) et la valeur juridique ; ImmoTopia garde la demande, la machine
 * d'états et la piste de preuve chaînée. Un adaptateur (ex. `yousign.ts`)
 * implémente `ExternalSignatureClient` ; il reste remplaçable : le reste du
 * noyau ne connaît que ce contrat. Jamais de journal d'un PDF, d'un jeton, d'une
 * clé ni d'un corps de webhook.
 */

export type ExternalLocale = 'fr' | 'en' | 'ar';

export interface ExternalSignerInput {
  /** Position dans la demande (0..n-1) : la liste renvoyée suit le même ordre. */
  position: number;
  fullName: string;
  /** Adresse e-mail : seul canal pris en charge par un prestataire externe. */
  email: string;
  role: string;
}

export interface ExternalCreateInput {
  /** Identifiant ImmoTopia de la demande (référence de rapprochement, jamais un secret). */
  requestId: string;
  title: string;
  /** PDF figé à signer. Jamais journalisé. */
  pdf: Buffer;
  language: ExternalLocale;
  sequential: boolean;
  expiresAt: Date;
  signers: ExternalSignerInput[];
}

export interface ExternalCreated {
  /** Référence de la demande chez le prestataire (stockée dans `SignatureRequest.providerRef`). */
  providerRef: string;
  /** Référence de chaque signataire chez le prestataire, dans l'ordre des positions. */
  signerRefs: string[];
}

export type ExternalSignerState = 'PENDING' | 'OPENED' | 'SIGNED' | 'DECLINED';
export type ExternalRequestState = 'ONGOING' | 'DONE' | 'DECLINED' | 'EXPIRED' | 'CANCELED';

/** État relu AUPRÈS du prestataire (on ne fait jamais confiance au corps d'un webhook). */
export interface ExternalRequestSnapshot {
  ref: string;
  state: ExternalRequestState;
  signers: Array<{ ref: string; state: ExternalSignerState; signedAt: Date | null }>;
}

/** Événement extrait d'un webhook déjà authentifié. `ref` désigne la demande chez le prestataire. */
export interface ExternalWebhookEvent {
  /** Identifiant d'événement du prestataire, s'il en fournit un (journal seulement). */
  eventId: string | null;
  eventName: string;
  ref: string | null;
}

export interface ExternalSignatureClient {
  /** Identifiant du prestataire (`SignatureRequest.providerId`), ex. `yousign`. */
  readonly id: string;
  /** Crée la demande chez le prestataire (document, signataires) et l'active : les invitations partent de son côté. */
  create(input: ExternalCreateInput): Promise<ExternalCreated>;
  /** Annule la demande chez le prestataire. Idempotent : déjà annulée ou terminée = pas d'erreur. */
  cancel(providerRef: string): Promise<void>;
  /** Relit l'état courant de la demande et de ses signataires. */
  getSnapshot(providerRef: string): Promise<ExternalRequestSnapshot>;
  /** PDF signé final (demande terminée). */
  downloadSigned(providerRef: string): Promise<Buffer>;
  /** Dossier de preuve du prestataire (PDF). */
  downloadEvidence(providerRef: string): Promise<Buffer>;
  /**
   * Authentifie un webhook entrant sur son CORPS BRUT et ses en-têtes (HMAC du
   * prestataire), comparaison à temps constant. Faux si le secret est absent.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  /** Extrait l'événement d'un corps déjà authentifié ; null si illisible ou sans référence exploitable. */
  parseWebhook(rawBody: Buffer): ExternalWebhookEvent | null;
}

/** Erreur typée d'un prestataire externe. Le message ne porte ni jeton, ni PDF, ni corps de réponse. */
export class ExternalProviderError extends Error {
  readonly code:
    'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'REJECTED' | 'RATE_LIMITED' | 'SERVER' | 'INVALID_RESPONSE';
  readonly status: number | null;
  constructor(code: ExternalProviderError['code'], status: number | null = null, message?: string) {
    super(message ?? `Prestataire de signature : ${code}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'ExternalProviderError';
    this.code = code;
    this.status = status;
  }
}
