import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { AuditActionKey } from '../../types/audit-types';
import { t } from '../../i18n';
import type { GenerateRentalDocumentArgs, ProposalClaims } from './contracts';

/**
 * Jeton de proposition d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md, §3).
 *
 * `v1.<b64url(JSON claims)>.<b64url(HMAC_SHA256(k, "v1."+payload))>`
 * `k` est dérivée de `JWT_SECRET` par HKDF : le jeton d'accès et le jeton de
 * proposition ne partagent donc jamais la même clé brute.
 *
 * Le jeton est lié à l'utilisateur (`sub`), à l'agence (`tid`), à l'action et
 * aux arguments résolus par le serveur ; il est à usage unique.
 */

const TOKEN_VERSION = 'v1';
const HKDF_SALT = 'immotopia/immocopilot';
const HKDF_INFO = 'proposal-token/v1';
const B64URL = /^[A-Za-z0-9_-]+$/;
/** Tolérance sur `iat` : un jeton « émis dans le futur » au-delà est rejeté. */
const CLOCK_SKEW_SECONDS = 60;
/** Marge de conservation d'une entrée de la table d'usage unique après `exp`. */
const USED_RETENTION_SECONDS = 120;

export type ProposalFailureReason =
  'MALFORMED' | 'BAD_SIGNATURE' | 'BAD_CLAIMS' | 'WRONG_USER' | 'WRONG_TENANT' | 'EXPIRED' | 'ALREADY_USED';

/**
 * Erreur typée du jeton. Le code et le message vus par le client sont
 * identiques pour toute signature, tout utilisateur et toute agence
 * incorrects (`PROPOSAL_INVALID`) ; `reason` ne sert qu'à l'audit.
 */
export class ProposalError extends AppError {
  readonly reason: ProposalFailureReason;
  readonly jti?: string;

  constructor(
    code: 'PROPOSAL_INVALID' | 'PROPOSAL_EXPIRED' | 'PROPOSAL_ALREADY_USED',
    reason: ProposalFailureReason,
    jti?: string
  ) {
    const status = code === 'PROPOSAL_ALREADY_USED' ? 409 : code === 'PROPOSAL_EXPIRED' ? 410 : 400;
    const message =
      code === 'PROPOSAL_ALREADY_USED'
        ? t('Cette proposition a déjà été utilisée.')
        : code === 'PROPOSAL_EXPIRED'
          ? t('Cette proposition a expiré.')
          : t('Proposition invalide.');
    super(message, status, code);
    this.reason = reason;
    this.jti = jti;
  }
}

const invalid = (reason: ProposalFailureReason, jti?: string) => new ProposalError('PROPOSAL_INVALID', reason, jti);

// --- Clé -------------------------------------------------------------------

let cachedKey: Buffer | null = null;
let cachedKeySource: string | null = null;

function signingKey(): Buffer {
  const secret = env.JWT_SECRET;
  if (!cachedKey || cachedKeySource !== secret) {
    cachedKey = Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, 32));
    cachedKeySource = secret;
  }
  return cachedKey;
}

function sign(payload: string): Buffer {
  return createHmac('sha256', signingKey()).update(`${TOKEN_VERSION}.${payload}`).digest();
}

// --- Charge utile ----------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const argsSchema = z.discriminatedUnion('docType', [
  z
    .object({
      docType: z.literal('RENT_RECEIPT'),
      leaseId: z.string().min(1),
      paymentId: z.string().min(1),
      installmentId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      docType: z.literal('RENT_STATEMENT'),
      leaseId: z.string().min(1),
      startDate: isoDate,
      endDate: isoDate
    })
    .strict()
]);

const claimsSchema = z
  .object({
    v: z.literal(1),
    jti: z.string().min(1),
    sub: z.string().min(1),
    tid: z.string().min(1),
    act: z.literal('GENERATE_RENTAL_DOCUMENT'),
    args: argsSchema,
    iat: z.number().int(),
    exp: z.number().int()
  })
  .strict();

const nowSeconds = () => Math.floor(Date.now() / 1000);

// --- Émission --------------------------------------------------------------

export interface SignProposalInput {
  userId: string;
  tenantId: string;
  args: GenerateRentalDocumentArgs;
}

/** Signe une proposition. Durée : `env.AI_PROPOSAL_TTL_SECONDS`. */
export function signProposal(input: SignProposalInput): { token: string; claims: ProposalClaims } {
  const iat = nowSeconds();
  const claims: ProposalClaims = {
    v: 1,
    jti: randomUUID(),
    sub: input.userId,
    tid: input.tenantId,
    act: 'GENERATE_RENTAL_DOCUMENT',
    args: input.args,
    iat,
    exp: iat + env.AI_PROPOSAL_TTL_SECONDS
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = sign(payload).toString('base64url');
  return { token: `${TOKEN_VERSION}.${payload}.${signature}`, claims };
}

// --- Vérification ----------------------------------------------------------

/**
 * Vérifie un jeton, dans l'ordre : format et signature (`timingSafeEqual`,
 * longueurs contrôlées avant) → charge utile → expiration → utilisateur →
 * agence. Ne consomme rien : l'usage unique est `redeemProposal`.
 *
 * @throws ProposalError `PROPOSAL_INVALID` (signature, utilisateur ou agence
 *         incorrects — même code et même message) ou `PROPOSAL_EXPIRED`.
 */
export function verifyProposal(token: string, expected: { userId: string; tenantId: string }): ProposalClaims {
  if (typeof token !== 'string' || token.length > 4096) throw invalid('MALFORMED');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) throw invalid('MALFORMED');
  const [, payload, signature] = parts;
  if (!payload || !signature || !B64URL.test(payload) || !B64URL.test(signature)) throw invalid('MALFORMED');

  const given = Buffer.from(signature, 'base64url');
  const wanted = sign(payload);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw invalid('BAD_SIGNATURE');

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw invalid('BAD_CLAIMS');
  }
  const parsed = claimsSchema.safeParse(raw);
  if (!parsed.success) throw invalid('BAD_CLAIMS');
  const claims = parsed.data as ProposalClaims;

  const now = nowSeconds();
  if (claims.iat > now + CLOCK_SKEW_SECONDS) throw invalid('BAD_CLAIMS', claims.jti);
  if (now >= claims.exp) throw new ProposalError('PROPOSAL_EXPIRED', 'EXPIRED', claims.jti);
  if (claims.sub !== expected.userId) throw invalid('WRONG_USER', claims.jti);
  if (claims.tid !== expected.tenantId) throw invalid('WRONG_TENANT', claims.jti);
  return claims;
}

// --- Usage unique ----------------------------------------------------------

/** jti → expiration (secondes) de la conservation. Une seule instance d'API. */
const usedProposals = new Map<string, number>();

function pruneUsed(now: number): void {
  for (const [jti, until] of usedProposals) {
    if (until <= now) usedProposals.delete(jti);
  }
}

/** Vide la table mémoire (tests). */
export function resetProposalUsageForTests(): void {
  usedProposals.clear();
}

/**
 * Réclame le jeton : table mémoire (réservation synchrone, donc sûre contre un
 * double clic simultané) puis ligne `AuditLog` `AI_PROPOSAL_REDEEMED` lue
 * (`findFirst`) et écrite (`create`) de façon synchrone — elle survit à un
 * redémarrage, contrairement à la table.
 *
 * @throws ProposalError `PROPOSAL_ALREADY_USED` (409) si déjà réclamé. Une panne
 *         de base libère la réservation puis remonte l'erreur.
 */
export async function redeemProposal(claims: ProposalClaims): Promise<void> {
  const now = nowSeconds();
  pruneUsed(now);
  if (usedProposals.has(claims.jti)) throw new ProposalError('PROPOSAL_ALREADY_USED', 'ALREADY_USED', claims.jti);
  usedProposals.set(claims.jti, claims.exp + USED_RETENTION_SECONDS);

  try {
    const previous = await prisma.auditLog.findFirst({
      where: { tenantId: claims.tid, actionKey: AuditActionKey.AI_PROPOSAL_REDEEMED, entityId: claims.jti },
      select: { id: true }
    });
    if (previous) throw new ProposalError('PROPOSAL_ALREADY_USED', 'ALREADY_USED', claims.jti);

    await prisma.auditLog.create({
      data: {
        actorUserId: claims.sub,
        tenantId: claims.tid,
        actionKey: AuditActionKey.AI_PROPOSAL_REDEEMED,
        entityType: 'AI_PROPOSAL',
        entityId: claims.jti,
        payload: { act: claims.act, docType: claims.args.docType, leaseId: claims.args.leaseId }
      },
      select: { id: true }
    });
  } catch (error) {
    if (!(error instanceof ProposalError)) usedProposals.delete(claims.jti);
    throw error;
  }
}
