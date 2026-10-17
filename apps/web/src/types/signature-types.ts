/**
 * Contrat de l'API de signature électronique (spec 044, lot S1).
 * Typé d'après le contrat communiqué par le lot API ; à confronter au code réel.
 */

export type SignatureKind =
  | 'LEASE_CONTRACT'
  | 'MANAGEMENT_MANDATE'
  | 'SALE_MANDATE'
  | 'LEASE_INSPECTION'
  | 'SALE_AGREEMENT'
  | 'DIRECT_DEBIT_MANDATE'
  | 'SYNDIC_DIRECT_DEBIT_MANDATE';
export type SignatureRequestStatus =
  'DRAFT' | 'SENT' | 'PARTIALLY_SIGNED' | 'COMPLETED' | 'DECLINED' | 'EXPIRED' | 'CANCELED';
export type SignerStatus = 'PENDING' | 'OPENED' | 'SIGNED' | 'DECLINED';
export type SignerChannel = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'IN_PERSON';
export type SignatureMode = 'TYPED' | 'DRAWN';

export interface SignerDto {
  id: string;
  role: string;
  position: number;
  fullName: string;
  channel: SignerChannel;
  contactMasked: string;
  status: SignerStatus;
  signedAt?: string | null;
  /** Présent seulement pour un signataire « sur place » : jeton du flux public. */
  inPersonUrlToken?: string | null;
}

export interface SignatureRequestDto {
  id: string;
  kind: SignatureKind;
  status: SignatureRequestStatus;
  expiresAt: string;
  createdAt: string;
  completedAt?: string | null;
  signers: SignerDto[];
}

export interface SignerInput {
  role: string;
  fullName: string;
  channel: SignerChannel;
  contact: string;
  /** Contact CRM du signataire : exigé par l'API pour les canaux WHATSAPP et SMS. */
  contactId?: string;
  /** Indication d'affichage (jamais envoyée) : faux quand le téléphone du contact est inconnu ou masqué. */
  phoneKnown?: boolean;
}

export interface CreateSignatureRequestInput {
  kind: SignatureKind;
  targetId: string;
  signers: SignerInput[];
  sequential?: boolean;
  expiresInDays?: number;
}

export interface ListSignaturesFilters {
  status?: SignatureRequestStatus;
  targetType?: string;
  targetId?: string;
}

export interface PublicSignatureDto {
  request: { kind: SignatureKind; title: string; status: SignatureRequestStatus; expiresAt: string };
  signer: { fullName: string; role: string; maskedContact: string; status: SignerStatus; channel: SignerChannel };
  consentText: string;
  /** Faux tant que ce n'est pas le tour du signataire (signature séquentielle). */
  canSign?: boolean;
  /** Types « code avant consultation » (prélèvement) : rien du document avant la vérification du code. */
  codeRequiredBeforeView?: boolean;
  /** Fournisseur externe : la signature se fait chez le prestataire, après la vérification du code. */
  external?: boolean;
}

/** Réponse de `POST /otp/verify`. */
export interface PublicVerifyResult {
  viewToken: string;
  expiresAt?: string;
}

export interface PublicOtpResult {
  sentTo: string;
  retryAfterSeconds: number;
}

export interface PublicSignInput {
  code?: string;
  consent: true;
  signature: { mode: SignatureMode; value: string };
}

export type PublicSignatureFailure = 'invalid' | 'rate_limited' | 'unavailable' | 'conflict';

/** Échec d'un appel public : statut HTTP, code métier et détails éventuels de l'API. */
export interface PublicFailure {
  status: PublicSignatureFailure;
  httpStatus: number;
  code?: string;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

/** Réponse de `POST /sign`. */
export interface PublicSignOutcome {
  status: 'SIGNED';
  requestStatus: 'COMPLETED' | 'PARTIALLY_SIGNED';
}

/** Réponse de `POST /remind`. */
export interface RemindOutcome {
  reminded: number;
  failed: number;
}

/** Signataire proposé par l'API pour une cible (`GET /signatures/targets/:kind/:targetId/context`). */
export interface DefaultSignerDto {
  role: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  contactId?: string | null;
}

export interface SignatureTargetContext {
  kind: SignatureKind;
  targetType: string;
  providerRequired: boolean;
  externalProvider?: boolean;
  /** Faux quand le fournisseur SMS n'est pas configuré sur ce serveur. */
  smsAvailable?: boolean;
  signers: DefaultSignerDto[];
}
