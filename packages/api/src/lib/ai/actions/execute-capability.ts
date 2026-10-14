import { currentLanguage, t } from '../../../i18n';
import { AppError, ForbiddenError } from '../../../middleware/error-middleware';
import { getUserPermissions } from '../../../services/permission-service';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { getRequestContext } from '../../../utils/request-context';
import { logger } from '../../../utils/logger';
import type { CapabilityExecutedPayload, CapabilityFieldError, CapabilityProposalClaims } from '../contracts';
import { findWritableEntry, isPermittedByCatalog } from '../gateway/catalog';
import { isDestructive } from '../gateway/path-rules';
import { LoopbackTimeoutError, loopbackWrite, type LoopbackResponse } from '../gateway/loopback';
import { buildPath, buildQueryString, extractErrorMessage } from '../gateway/request-utils';
import { isSecretKey, redactSecrets, reduceForModel, stripDiskPaths } from '../gateway/sanitize';
import { computePlanHash } from '../plan-hash';
import { ProposalError, redeemProposal, verifyCapabilityProposal } from '../proposal-token';
import { assessWrite, CONFIRMATION_WORD } from '../write-plan';

/**
 * Exécution CONFIRMÉE d'un plan d'écriture (`plan_write`, plan V2 étape 4). C'est la
 * SEULE porte d'écriture générique de l'assistant : route HTTP de confirmation, jeton
 * signé à usage unique. Cette fonction n'est PAS dans le registre des outils du LLM et
 * l'orchestrateur ne l'importe pas.
 *
 * L'écriture part par LOOPBACK, sous l'identité de l'utilisateur QUI CONFIRME (ses
 * en-têtes d'authentification, ceux de la requête de confirmation) : toute la chaîne de
 * middlewares réelle s'applique (authentification, accès à l'agence, permission de la
 * route, abonnement, validation du corps, garde Prisma, limiteurs, audit de la route).
 * Aucun compte de service, aucune élévation de droits.
 *
 * Ordre : signature, expiration, utilisateur et agence (`verifyCapabilityProposal`) →
 * empreinte `planHash` recalculée sur les arguments signés → catalogue revérifié (existe,
 * POST/PUT/PATCH, ni destructif ni sensible-interdit : défense en profondeur, un jeton
 * valide ne vaut pas un accès) → permissions connues du catalogue (relues) → mot de
 * confirmation si exigé → usage unique (`redeemProposal`) → loopback → audit.
 *
 * Mot de confirmation manquant ou erroné : refus `CONFIRMATION_REQUIRED` (400) AVANT la
 * réclamation du jeton, qui n'est donc PAS consommé : l'utilisateur peut ressaisir
 * dans le délai du plan. Toute autre erreur après la réclamation consomme le jeton.
 *
 * Résultat : toute réponse de la route, succès ou refus métier (400, 403, 409…), devient
 * un `CapabilityExecutedPayload` (`ok`, `status`, `message`) ; le jeton est alors consommé.
 * Après un dépassement de 30 s l'écriture a PU aboutir : elle n'est jamais rejouée.
 */

export interface ExecuteCapabilityInput {
  /** Jeton reçu du client. */
  token: string;
  /** Toujours issus de la requête authentifiée, jamais du corps. */
  userId: string;
  tenantId: string;
  /** Mot saisi par l'utilisateur (`CONFIRMER`), pour un plan qui l'exige. */
  confirmation?: string;
  /** Authentification de la requête de confirmation (voir `gateway/loopback-auth.ts`). Absente : refus. */
  loopbackHeaders?: () => Record<string, string>;
}

export interface ExecuteCapabilityResult {
  payload: CapabilityExecutedPayload;
}

function reject(input: ExecuteCapabilityInput, jti: string | undefined, reason: string): void {
  logAuditEvent({
    actorUserId: input.userId,
    tenantId: input.tenantId,
    actionKey: AuditActionKey.AI_ACTION_REJECTED,
    entityType: 'AI_PROPOSAL',
    entityId: jti ?? 'unknown',
    payload: { reason }
  });
}

function writeMessage(status: number, text: string): string {
  const fromServer = extractErrorMessage(text);
  if (fromServer) return fromServer;
  if (status === 401) return t('Authentification refusée.');
  if (status === 403) return t("Vous n'avez pas la permission d'effectuer cette écriture.");
  if (status === 404) return t('Ressource introuvable.');
  if (status === 429) return t('Trop de requêtes, réessayez dans un instant.');
  return t("L'écriture a échoué.");
}

const MAX_FIELD_ERRORS = 10;
const MAX_FIELD_ERROR_CHARS = 200;

/**
 * Un message qui CITE une valeur (entre « … », “ ” ou "…", ou `received`/`reçu`/`المستلم` suivi d'un guillemet)
 * peut contenir la valeur saisie : détection indépendante de la langue. L'apostrophe simple n'en est pas une
 * (« l'utilisateur »), et un message de type sans citation (« Type invalide : X attendu, Y reçu. ») reste lisible.
 */
const QUOTED_VALUE = /«[^»]*»|“[^”]*”|"[^"]*"|(?:received|reçu|المستلم)\s*[:=]?\s*["«“'‘]/i;
function quotesAValue(message: string): boolean {
  return QUOTED_VALUE.test(message);
}

/**
 * Erreurs par champ d'un refus de validation de la route (400/422 `VALIDATION_ERROR`). Jamais la valeur saisie :
 * un chemin secret ou un message Zod par défaut (« received ») qui peut citer la valeur donne un texte générique.
 * Tout autre cas (autre erreur, succès, JSON illisible) : `undefined`.
 */
function extractFieldErrors(status: number, text: string): CapabilityFieldError[] | undefined {
  if (status !== 400 && status !== 422) return undefined;
  let body: { code?: unknown; errors?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return undefined;
  }
  if (!body || typeof body !== 'object' || body.code !== 'VALIDATION_ERROR' || !Array.isArray(body.errors)) {
    return undefined;
  }
  const result: CapabilityFieldError[] = [];
  for (const raw of body.errors) {
    if (result.length >= MAX_FIELD_ERRORS) break;
    if (!raw || typeof raw !== 'object') continue;
    const { field, message } = raw as { field?: unknown; message?: unknown };
    if (typeof field !== 'string' || typeof message !== 'string') continue;
    const secret = field.split(/[.[\]]+/).some(segment => segment !== '' && isSecretKey(segment));
    const mayQuoteValue = quotesAValue(message);
    result.push({
      path: field.slice(0, MAX_FIELD_ERROR_CHARS),
      message: secret || mayQuoteValue ? t('Valeur invalide.') : message.slice(0, MAX_FIELD_ERROR_CHARS)
    });
  }
  return result.length > 0 ? result : undefined;
}

function preview(response: LoopbackResponse): unknown {
  if (response.tooLarge || !/json/i.test(response.contentType)) return null;
  try {
    return reduceForModel(stripDiskPaths(redactSecrets(JSON.parse(response.text)))).data;
  } catch {
    return null;
  }
}

/** Revérifie le catalogue et les droits connus, avant toute réclamation du jeton. */
async function revalidate(
  input: ExecuteCapabilityInput,
  claims: CapabilityProposalClaims
): Promise<{ method: 'POST' | 'PUT' | 'PATCH'; pathAndQuery: string; requiresConfirmation: boolean }> {
  const { args } = claims;
  if (computePlanHash(args) !== args.planHash) {
    reject(input, claims.jti, 'PLAN_HASH_MISMATCH');
    throw new ProposalError('PROPOSAL_INVALID', 'BAD_CLAIMS', claims.jti);
  }

  const entry = findWritableEntry(args.capabilityId);
  // Défense en profondeur : le catalogue peut avoir changé depuis le plan, et un jeton forgé ne doit rien pouvoir
  // exécuter de destructif. `findWritableEntry` écarte déjà DELETE, les suffixes destructifs et les routes sensibles.
  if (!entry || isDestructive(entry.method, entry.path) || entry.method === ('DELETE' as string)) {
    reject(input, claims.jti, 'CAPABILITY_NOT_ALLOWED');
    throw new ForbiddenError(t("Cette écriture n'est plus autorisée."));
  }

  const permissions = new Set(await getUserPermissions(input.userId, input.tenantId));
  if (!isPermittedByCatalog(entry, permissions)) {
    reject(input, claims.jti, 'PERMISSION_REVOKED');
    throw new ForbiddenError(t("Vous n'avez plus la permission d'effectuer cette écriture."));
  }

  const path = buildPath(entry.path, input.tenantId, args.pathParams, entry.pathParams);
  if (!path.startsWith(`/api/tenants/${encodeURIComponent(input.tenantId)}/`)) {
    reject(input, claims.jti, 'PATH_OUT_OF_TENANT');
    throw new ForbiddenError(t("Cette écriture n'est plus autorisée."));
  }

  return {
    method: entry.method as 'POST' | 'PUT' | 'PATCH',
    pathAndQuery: `${path}${buildQueryString(args.query)}`,
    requiresConfirmation:
      assessWrite(entry, args.body, args.query).requiresTypedConfirmation || args.requireConfirmation === true
  };
}

/**
 * @throws ProposalError (`PROPOSAL_INVALID`, `PROPOSAL_EXPIRED`, `PROPOSAL_ALREADY_USED`),
 *         ForbiddenError, BadRequestError (chemin), AppError `CONFIRMATION_REQUIRED` (400).
 */
export async function executeCapability(input: ExecuteCapabilityInput): Promise<ExecuteCapabilityResult> {
  let claims: CapabilityProposalClaims;
  try {
    claims = verifyCapabilityProposal(input.token, { userId: input.userId, tenantId: input.tenantId });
  } catch (error) {
    if (error instanceof ProposalError) reject(input, error.jti, error.reason);
    throw error;
  }

  const { method, pathAndQuery, requiresConfirmation } = await revalidate(input, claims);

  const headers = input.loopbackHeaders?.();
  if (!headers) {
    reject(input, claims.jti, 'NO_AUTH_HEADERS');
    throw new ForbiddenError(t("L'écriture n'est pas disponible dans ce contexte."));
  }

  if (requiresConfirmation && input.confirmation !== CONFIRMATION_WORD) {
    reject(input, claims.jti, 'CONFIRMATION_REQUIRED');
    throw new AppError(
      t('Saisissez le mot « {{word}} » pour approuver cette écriture.', { word: CONFIRMATION_WORD }),
      400,
      'CONFIRMATION_REQUIRED'
    );
  }

  try {
    await redeemProposal(claims);
  } catch (error) {
    if (error instanceof ProposalError) reject(input, error.jti ?? claims.jti, error.reason);
    throw error;
  }

  const requestId = getRequestContext()?.requestId;
  let status: number;
  let message: string;
  let resultPreview: unknown = null;
  let fieldErrors: CapabilityFieldError[] | undefined;
  try {
    const response = await loopbackWrite({
      method,
      pathAndQuery,
      headers: {
        ...headers,
        'Accept-Language': currentLanguage(),
        ...(requestId ? { 'X-Request-Id': requestId } : {})
      },
      body: claims.args.body,
      // L'écriture ne s'interrompt pas si le client ferme la page : jeton consommé, la requête va à son terme.
      signal: new AbortController().signal
    });
    status = response.status;
    const succeeded = status >= 200 && status < 300;
    message = succeeded ? t('Écriture effectuée.') : writeMessage(status, response.text);
    resultPreview = preview(response);
    if (!succeeded) fieldErrors = extractFieldErrors(status, response.text);
  } catch (error) {
    if (error instanceof LoopbackTimeoutError) {
      status = 504;
      message = t("Délai dépassé : l'écriture a peut-être été appliquée. Vérifiez avant de réessayer.");
    } else {
      logger.error('ImmoCopilot : échec réseau de l’écriture confirmée', {
        tenantId: input.tenantId,
        proposalId: claims.jti,
        capabilityId: claims.args.capabilityId,
        error
      });
      status = 502;
      message = t("L'écriture n'a pas pu être envoyée. Vérifiez avant de réessayer.");
    }
  }

  const ok = status >= 200 && status < 300;
  // Audit : qui, agence, route, empreinte du plan approuvé, statut. Jamais le corps ni un secret.
  logAuditEvent({
    actorUserId: input.userId,
    tenantId: input.tenantId,
    actionKey: AuditActionKey.AI_ACTION_EXECUTED,
    entityType: 'AI_CAPABILITY',
    entityId: claims.jti,
    payload: {
      kind: 'capability',
      proposalId: claims.jti,
      capabilityId: claims.args.capabilityId,
      planHash: claims.args.planHash,
      status,
      ok,
      ...(requestId ? { requestId } : {})
    }
  });

  return {
    payload: {
      kind: 'capability',
      proposalId: claims.jti,
      ok,
      status,
      message,
      resultPreview,
      ...(fieldErrors ? { fieldErrors } : {})
    }
  };
}
