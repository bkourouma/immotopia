import { maskPhone, normalizePhoneE164 } from '../phone/e164';

/**
 * Formes de sortie de l'API de signature (spec 043). Les contacts sont masqués ;
 * `tokenHash`, `otpHash`, IP et clés de fichier ne sortent JAMAIS.
 */

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.charAt(0)}•••@${host.charAt(0)}•••${tld}`;
}

export function maskContact(channel: string, contact: string): string {
  if (channel === 'IN_PERSON' || !contact) return '';
  if (channel === 'EMAIL') return maskEmail(contact);
  return maskPhone(normalizePhoneE164(contact) ?? contact);
}

type SignerRow = {
  id: string;
  role: string;
  position: number;
  fullName: string;
  channel: string;
  contact: string;
  status: string;
  signedAt: Date | null;
  inviteStatus: string;
  otpAttempts: number;
};

export type SignerDto = {
  id: string;
  role: string;
  position: number;
  fullName: string;
  channel: string;
  contactMasked: string;
  status: string;
  signedAt: string | null;
  inviteStatus: string;
  /** Présent une seule fois (création ou réémission), signataire « sur place » seulement. */
  inPersonUrlToken?: string | null;
};

export function toSignerDto(row: SignerRow, inPersonUrlToken?: string | null): SignerDto {
  return {
    id: row.id,
    role: row.role,
    position: row.position,
    fullName: row.fullName,
    channel: row.channel,
    contactMasked: maskContact(row.channel, row.contact),
    status: row.status,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
    inviteStatus: row.inviteStatus,
    ...(inPersonUrlToken ? { inPersonUrlToken } : {})
  };
}

type RequestRow = {
  id: string;
  kind: string;
  targetType: string;
  targetId: string;
  title: string;
  language: string;
  status: string;
  sequential: boolean;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  sourceHash: string;
  signedHash: string | null;
  signedFileKey: string | null;
  signers: SignerRow[];
};

export function toRequestDto(
  row: RequestRow,
  options: {
    inPersonTokens?: Map<string, string>;
    events?: Array<{ type: string; signerId: string | null; createdAt: Date }>;
  } = {}
) {
  return {
    id: row.id,
    kind: row.kind,
    targetType: row.targetType,
    targetId: row.targetId,
    title: row.title,
    language: row.language,
    status: row.status,
    sequential: row.sequential,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    sourceHash: row.sourceHash,
    signedHash: row.signedHash,
    hasSignedFile: Boolean(row.signedFileKey),
    signers: [...row.signers]
      .sort((a, b) => a.position - b.position)
      .map(signer => toSignerDto(signer, options.inPersonTokens?.get(signer.id))),
    ...(options.events
      ? {
          events: options.events.map(event => ({
            type: event.type,
            signerId: event.signerId,
            createdAt: event.createdAt.toISOString()
          }))
        }
      : {})
  };
}
