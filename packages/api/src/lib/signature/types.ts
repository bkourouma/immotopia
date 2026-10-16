/**
 * Types partagés du noyau de signature électronique (spec 044, lot S1).
 * Les types d'énumération viennent de Prisma ; ce fichier porte le contrat du
 * fournisseur et les formes de sortie.
 */
export type SignatureDocumentKindCode = import('@prisma/client').SignatureDocumentKind;
export type SignatureChannelCode = 'EMAIL' | 'WHATSAPP' | 'SMS' | 'IN_PERSON';
export type SignatureLanguage = 'fr' | 'en' | 'ar';

/** Identifiant d'un fournisseur : `disabled`, `log`, `internal`, ou le nom d'un prestataire (lot S6). */
export type SignatureProviderId = 'disabled' | 'log' | 'internal' | (string & Record<never, never>);

export interface CreateRequestInput {
  tenantId: string;
  requestId: string;
  kind: SignatureDocumentKindCode;
  signerCount: number;
  /** Prestataire externe (S6) : document figé et signataires à transmettre au prestataire. */
  external?: {
    title: string;
    pdf: Buffer;
    language: import('./provider/external/types').ExternalLocale;
    sequential: boolean;
    expiresAt: Date;
    signers: import('./provider/external/types').ExternalSignerInput[];
  };
}

/** Message à remettre à un signataire. Jamais journalisé. */
export interface OutboundSignatureMessage {
  tenantId: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'SMS';
  /** Adresse e-mail ou numéro (E.164 pour WhatsApp). */
  to: string;
  /** Contact CRM : consentement WhatsApp exigé s'il est connu ; obligatoire (et de l'agence) pour SMS. */
  contactId?: string | null;
  subject: string;
  text: string;
  html?: string;
}

export type DeliveryResult =
  { ok: true } | { ok: false; reason: 'DISABLED' | 'UNSUPPORTED' | 'NO_CONSENT' | 'SEND_FAILED' | 'RATE_LIMITED' };

/**
 * Contrat d'un fournisseur de signature. `internal` : le noyau gère jeton, code
 * et scellement, le fournisseur ne fait que remettre les messages. Un
 * prestataire (lot S6) se branchera ici et renverra ses événements par webhook
 * vers la même machine d'états.
 */
export interface SignatureProvider {
  readonly id: SignatureProviderId;
  /**
   * Prestataire QUALIFIÉ (valeur juridique renforcée, SG-R1). Liste d'autorisation :
   * seul un fournisseur qui le déclare peut signer un type de document qui exige
   * un prestataire. `internal`, `log` et `disabled` ne le sont pas.
   */
  readonly qualified: boolean;
  /** Prestataire externe (S6) : client qui porte invitation, signature et preuve. Absent pour `internal`. */
  readonly external?: import('./provider/external/types').ExternalSignatureClient;
  createRequest(input: CreateRequestInput): Promise<{ providerRef?: string; signerRefs?: string[] }>;
  cancel(requestId: string, ctx?: { tenantId: string; providerRef: string | null }): Promise<void>;
  deliver(message: OutboundSignatureMessage): Promise<DeliveryResult>;
}

/** Statuts de demande encore ouverts : une seule demande ouverte par document. */
export const OPEN_REQUEST_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_SIGNED'] as const;
/** Statuts où un jeton peut agir (lire, demander un code, signer, refuser). */
export const ACTIVE_REQUEST_STATUSES = ['SENT', 'PARTIALLY_SIGNED'] as const;
export const ACTIONABLE_SIGNER_STATUSES = ['PENDING', 'OPENED'] as const;

export type SignatureEventType =
  | 'CREATED'
  | 'INVITE_SENT'
  | 'INVITE_FAILED'
  | 'OPENED'
  | 'OTP_SENT'
  | 'OTP_FAILED'
  | 'OTP_LOCKED'
  | 'SIGNED'
  | 'DECLINED'
  | 'SEALED'
  | 'EXPIRED'
  | 'CANCELED'
  | 'REMINDER_SENT'
  | 'REMINDER_AUTO'
  | 'IN_PERSON_TOKEN_ISSUED';

/** Fournisseurs dont le noyau gère lui-même jeton, code, relance et scellement (jamais un prestataire externe). */
export const INTERNAL_PROVIDER_IDS = ['internal', 'log'] as const;

export function isInternalSignatureProvider(providerId: string | null | undefined): boolean {
  return typeof providerId === 'string' && (INTERNAL_PROVIDER_IDS as readonly string[]).includes(providerId);
}
