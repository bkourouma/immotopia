import { generateToken, hashesMatch, hashToken, looksLikeToken } from './token';
import { findSignatureSource } from './sources';

/**
 * Options de source « code avant consultation » et « passerelle externe » (spec 042 §10.5,
 * spec 044). Le code à usage unique est vérifié AVANT toute lecture du document ; il est alors
 * consommé et remplacé par un jeton de consultation (32 octets aléatoires, 15 minutes) que le
 * navigateur présente dans l'en-tête `X-Signature-View-Token`. Seul son SHA-256 est stocké
 * (`SignatureSigner.viewGrantHash`) ; le jeton en clair n'est jamais journalisé ni conservé.
 */

export const VIEW_TOKEN_HEADER = 'x-signature-view-token';
export const VIEW_GRANT_TTL_MS = 15 * 60 * 1000;

export type SourceGate = {
  codeBeforeView: boolean;
  externalGateway: boolean;
  allowedChannels: readonly string[] | undefined;
};

/** Types dont le PDF porte l'IBAN complet : le code reste exigé même si leur source est introuvable. */
const FAIL_CLOSED_KINDS: ReadonlySet<string> = new Set(['DIRECT_DEBIT_MANDATE', 'SYNDIC_DIRECT_DEBIT_MANDATE']);

/**
 * Options déclarées par la source d'un type ; tout faux / absent pour un type ordinaire.
 * Fermé par défaut pour les mandats de prélèvement : source non enregistrée => code exigé avant consultation.
 */
export function sourceGateOf(kind: string): SourceGate {
  const source = findSignatureSource(kind);
  if (!source && FAIL_CLOSED_KINDS.has(kind)) {
    return { codeBeforeView: true, externalGateway: false, allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP'] };
  }
  return {
    codeBeforeView: Boolean(source?.codeBeforeView),
    externalGateway: Boolean(source?.externalGateway),
    allowedChannels: source?.allowedChannels
  };
}

export function newViewGrant(now: Date = new Date()): { token: string; hash: string; expiresAt: Date } {
  const token = generateToken();
  return { token, hash: hashToken(token), expiresAt: new Date(now.getTime() + VIEW_GRANT_TTL_MS) };
}

/**
 * Le jeton de consultation présenté correspond-il à l'empreinte stockée, et n'est-il pas échu ?
 * Comparaison à temps constant ; toute forme invalide répond simplement « non ».
 */
export function viewGrantIsValid(
  stored: { viewGrantHash: string | null; viewGrantExpiresAt: Date | null },
  presented: unknown,
  now: Date = new Date()
): boolean {
  if (!looksLikeToken(presented)) return false;
  if (!stored.viewGrantHash || !stored.viewGrantExpiresAt) return false;
  if (stored.viewGrantExpiresAt.getTime() <= now.getTime()) return false;
  return hashesMatch(stored.viewGrantHash, hashToken(presented));
}
