import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../middleware/error-middleware';
import { AuditActionKey } from '../../types/audit-types';
import { t } from '../../i18n';
import { withTransactionalAdvisoryLock } from './advisory-lock';
import {
  COPILOT_MAX_PROPOSAL_TOKEN_CHARS,
  type CapabilityProposalClaims,
  type ExecuteCapabilityArgs,
  type GenerateRentalDocumentArgs,
  type ProposalClaims
} from './contracts';
import { pathParamsSchema, querySchema } from './gateway/request-utils';
import { planBodySchema } from './gateway/write-input';

/**
 * Jeton de proposition d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md, §3).
 *
 * `v1.<b64url(JSON claims)>.<b64url(HMAC_SHA256(k, "v1."+payload))>`
 * `k` est dérivée de `JWT_SECRET` par HKDF : le jeton d'accès et le jeton de
 * proposition ne partagent donc jamais la même clé brute.
 *
 * Le jeton est lié à l'utilisateur (`sub`), à l'agence (`tid`), à l'action et
 * aux arguments résolus par le serveur ; il est à usage unique.
 *
 * Deux actions : `GENERATE_RENTAL_DOCUMENT` (quittance ou relevé, 300 s par défaut) et
 * `EXECUTE_CAPABILITY` (écriture générique du catalogue, plan V2 étape 4). Cette seconde
 * porte la requête exacte à exécuter (route, paramètres, corps) et son empreinte
 * `planHash` ; sa durée est `AI_WRITE_PLAN_TTL_SECONDS` (900 s par défaut) : l'humain doit
 * le temps de lire les changements calculés par le serveur et, pour un plan sensible, de
 * saisir le mot de confirmation. Le jeton reste de même forme et de même clé.
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

const rentalClaimsSchema = z
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

/** Seules les écritures POST/PUT/PATCH d'une route d'agence : un id `DELETE ...` forgé est refusé dès la lecture des claims. */
const CAPABILITY_ID_PATTERN = /^(POST|PUT|PATCH) \/api\/tenants\/:tenantId(\/[^\s]*)?$/;

const capabilityArgsSchema = z
  .object({
    capabilityId: z.string().max(300).regex(CAPABILITY_ID_PATTERN),
    pathParams: pathParamsSchema,
    query: querySchema,
    body: z.union([z.null(), planBodySchema]),
    planHash: z.string().regex(/^[0-9a-f]{64}$/)
  })
  .strict();

const capabilityClaimsSchema = z
  .object({
    v: z.literal(1),
    jti: z.string().min(1),
    sub: z.string().min(1),
    tid: z.string().min(1),
    act: z.literal('EXECUTE_CAPABILITY'),
    args: capabilityArgsSchema,
    iat: z.number().int(),
    exp: z.number().int()
  })
  .strict();

const claimsSchema = z.discriminatedUnion('act', [rentalClaimsSchema, capabilityClaimsSchema]);

export type AnyProposalClaims = ProposalClaims | CapabilityProposalClaims;

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

export interface SignCapabilityProposalInput {
  userId: string;
  tenantId: string;
  args: ExecuteCapabilityArgs;
}

/** Signe un plan d'écriture. Durée : `env.AI_WRITE_PLAN_TTL_SECONDS` (voir l'en-tête du fichier). */
export function signCapabilityProposal(input: SignCapabilityProposalInput): {
  token: string;
  claims: CapabilityProposalClaims;
} {
  const iat = nowSeconds();
  const claims: CapabilityProposalClaims = {
    v: 1,
    jti: randomUUID(),
    sub: input.userId,
    tid: input.tenantId,
    act: 'EXECUTE_CAPABILITY',
    args: input.args,
    iat,
    exp: iat + env.AI_WRITE_PLAN_TTL_SECONDS
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = sign(payload).toString('base64url');
  return { token: `${TOKEN_VERSION}.${payload}.${signature}`, claims };
}

/**
 * Action portée par un jeton, lue SANS vérifier la signature : sert uniquement à
 * aiguiller la confirmation vers le bon exécuteur, qui vérifie ensuite tout (signature
 * comprise, et que l'action est bien la sienne). Ne pas s'en servir pour autoriser.
 */
export function peekProposalAction(token: string): 'GENERATE_RENTAL_DOCUMENT' | 'EXECUTE_CAPABILITY' | null {
  if (typeof token !== 'string' || token.length > COPILOT_MAX_PROPOSAL_TOKEN_CHARS) return null;
  const payload = token.split('.')[1];
  if (!payload || !B64URL.test(payload)) return null;
  try {
    const act = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { act?: unknown } | null)?.act;
    return act === 'GENERATE_RENTAL_DOCUMENT' || act === 'EXECUTE_CAPABILITY' ? act : null;
  } catch {
    return null;
  }
}

// --- Vérification ----------------------------------------------------------

function verifyAny(token: string, expected: { userId: string; tenantId: string }): AnyProposalClaims {
  if (typeof token !== 'string' || token.length > COPILOT_MAX_PROPOSAL_TOKEN_CHARS) throw invalid('MALFORMED');
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
  const claims = parsed.data as AnyProposalClaims;

  const now = nowSeconds();
  if (claims.iat > now + CLOCK_SKEW_SECONDS) throw invalid('BAD_CLAIMS', claims.jti);
  if (now >= claims.exp) throw new ProposalError('PROPOSAL_EXPIRED', 'EXPIRED', claims.jti);
  if (claims.sub !== expected.userId) throw invalid('WRONG_USER', claims.jti);
  if (claims.tid !== expected.tenantId) throw invalid('WRONG_TENANT', claims.jti);
  return claims;
}

/**
 * Vérifie un jeton de génération de document, dans l'ordre : format et signature
 * (`timingSafeEqual`, longueurs contrôlées avant) → charge utile → expiration →
 * utilisateur → agence. Ne consomme rien : l'usage unique est `redeemProposal`.
 * Un jeton d'une autre action est refusé (`BAD_CLAIMS`).
 *
 * @throws ProposalError `PROPOSAL_INVALID` (signature, utilisateur ou agence
 *         incorrects — même code et même message) ou `PROPOSAL_EXPIRED`.
 */
export function verifyProposal(token: string, expected: { userId: string; tenantId: string }): ProposalClaims {
  const claims = verifyAny(token, expected);
  if (claims.act !== 'GENERATE_RENTAL_DOCUMENT') throw invalid('BAD_CLAIMS', claims.jti);
  return claims;
}

/** Même vérification pour un plan d'écriture (`EXECUTE_CAPABILITY`) ; un jeton d'une autre action est refusé. */
export function verifyCapabilityProposal(
  token: string,
  expected: { userId: string; tenantId: string }
): CapabilityProposalClaims {
  const claims = verifyAny(token, expected);
  if (claims.act !== 'EXECUTE_CAPABILITY') throw invalid('BAD_CLAIMS', claims.jti);
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
 * Réclame le jeton. Deux remparts :
 * 1. table mémoire (réservation synchrone : double clic simultané dans ce
 *    processus, sans aller-retour base) ;
 * 2. ligne `AuditLog` `AI_PROPOSAL_REDEEMED`, lue (`findFirst`) puis écrite
 *    (`create`) sous un verrou consultatif PostgreSQL transactionnel propre au
 *    jeton (`lib/ai/advisory-lock.ts`) : deux instances d'API, ou un
 *    redémarrage entre deux requêtes, ne peuvent pas toutes deux voir « absent »
 *    puis écrire. Aucune contrainte d'unicité ni colonne n'est nécessaire.
 *
 * @throws ProposalError `PROPOSAL_ALREADY_USED` (409) si déjà réclamé. Une panne
 *         de base libère la réservation puis remonte l'erreur.
 */
export async function redeemProposal(claims: AnyProposalClaims): Promise<void> {
  const now = nowSeconds();
  pruneUsed(now);
  if (usedProposals.has(claims.jti)) throw new ProposalError('PROPOSAL_ALREADY_USED', 'ALREADY_USED', claims.jti);
  usedProposals.set(claims.jti, claims.exp + USED_RETENTION_SECONDS);

  try {
    await withTransactionalAdvisoryLock(`ai-proposal:${claims.tid}:${claims.jti}`, async tx => {
      const previous = await tx.auditLog.findFirst({
        where: { tenantId: claims.tid, actionKey: AuditActionKey.AI_PROPOSAL_REDEEMED, entityId: claims.jti },
        select: { id: true }
      });
      if (previous) throw new ProposalError('PROPOSAL_ALREADY_USED', 'ALREADY_USED', claims.jti);

      await tx.auditLog.create({
        data: {
          actorUserId: claims.sub,
          tenantId: claims.tid,
          actionKey: AuditActionKey.AI_PROPOSAL_REDEEMED,
          entityType: 'AI_PROPOSAL',
          entityId: claims.jti,
          payload:
            claims.act === 'EXECUTE_CAPABILITY'
              ? { act: claims.act, capabilityId: claims.args.capabilityId, planHash: claims.args.planHash }
              : { act: claims.act, docType: claims.args.docType, leaseId: claims.args.leaseId }
        },
        select: { id: true }
      });
    });
  } catch (error) {
    if (!(error instanceof ProposalError)) usedProposals.delete(claims.jti);
    throw error;
  }
}
