import { z } from 'zod';
import { currentLanguage, t } from '../../../i18n';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import {
  COPILOT_MAX_WRITE_PLANS_PER_REQUEST,
  type CopilotToolContext,
  type CopilotToolDefinition,
  type ExecuteCapabilityArgs,
  type WritePlan
} from '../contracts';
import { findCatalogEntry, findWritableEntry, isPermittedByCatalog, READABLE_METHODS } from '../gateway/catalog';
import type { CatalogEntry } from '../gateway/catalog-builder';
import { LoopbackTimeoutError, loopbackGet } from '../gateway/loopback';
import type { WriteSensitivityCategory } from '../gateway/path-rules';
import { buildPath, httpErrorMessage, MAX_QUERY_KEYS, pathParamsSchema, querySchema } from '../gateway/request-utils';
import { redactSecrets } from '../gateway/sanitize';
import { PLAN_BODY_MAX_BYTES, PLAN_BODY_MAX_DEPTH, planBodySchema } from '../gateway/write-input';
import { canonicalJson, computePlanHash, sha256Hex } from '../plan-hash';
import { signCapabilityProposal } from '../proposal-token';
import {
  assessWrite,
  classifyRecord,
  computeChanges,
  CONFIRMATION_WORD,
  displayQuery,
  isSecretField,
  lastParamAncestorPath,
  MAX_DISPLAYED_CHANGES,
  parentResourcePath,
  readableLabel,
  shortRecordId,
  unwrapRecord,
  type RecordKind
} from '../write-plan';
import { assertToolPermission, outcome } from './tool-utils';

/**
 * `plan_write` : PRÉPARE une écriture du catalogue (POST/PUT/PATCH) pour accord humain.
 * Il n'écrit RIEN : il valide la demande, SIMULE (lit l'état actuel par loopback GET,
 * calcule avant/après), signe un jeton d'exécution et émet l'événement `write_plan`.
 * L'écriture n'existe que derrière la route HTTP de confirmation
 * (`actions/execute-capability.ts`), que ce module n'importe pas.
 *
 * Permission : `PROPERTIES_VIEW`, comme `call_read` (socle CORE, la plus faible des
 * permissions de lecture) : elle n'ouvre rien par elle-même. Le plan refuse une route
 * dont le catalogue connaît une permission que l'utilisateur n'a pas ; à l'exécution, la
 * route réelle (permission, abonnement, garde Prisma) fait autorité.
 *
 * Ce que l'humain voit est calculé ICI : `target`, `changes`, `warnings`, sensibilité.
 * `title` et `steps` sont le texte du modèle, non fiable, rendu en texte brut.
 * Le jeton n'est JAMAIS renvoyé au modèle.
 *
 * Écritures SENSIBLES (plan en rouge, mot « CONFIRMER » exigé) : voir `SENSITIVE_WRITE_WORDS`
 * dans `gateway/path-rules.ts` (paiements, envois, signature, clôtures comptables, droits
 * d'accès, imports en masse).
 */

const PERMISSION = 'PROPERTIES_VIEW';
const MAX_TITLE_CHARS = 120;
const MAX_STEP_CHARS = 240;
const MAX_STEPS = 8;
/** Balises HTML et caractères de contrôle : le titre et les étapes sont du texte brut. */
const HTML_TAG = /<\/?[A-Za-z!][^>]*>/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      value => !HTML_TAG.test(value) && !CONTROL_CHARS.test(value),
      'texte brut attendu (ni HTML ni caractère de contrôle)'
    );

const inputSchema = z
  .object({
    capabilityId: z.string().min(1).max(300),
    pathParams: pathParamsSchema.optional(),
    query: querySchema.optional(),
    body: planBodySchema.optional(),
    title: plainText(MAX_TITLE_CHARS),
    steps: z.array(plainText(MAX_STEP_CHARS)).min(1).max(MAX_STEPS)
  })
  .strict();

type Input = z.infer<typeof inputSchema>;

const SENSITIVE_REASONS: Record<WriteSensitivityCategory, () => string> = {
  payment: () => t('Opération de paiement, de remboursement ou de virement.'),
  sending: () => t('Envoi de message ou de notification à des tiers (irréversible une fois parti).'),
  signature: () => t("Signature d'un document."),
  accounting: () => t('Validation, clôture ou facturation : opération comptable difficile à annuler.'),
  access: () => t("Gestion de comptes, de rôles ou de droits d'accès."),
  lifecycle: () =>
    t(
      'Changement d’état difficile à annuler (résiliation, annulation, archivage, cession, publication, statut d’un bail).'
    ),
  bulk: () => t('Import ou opération en masse : beaucoup d’enregistrements peuvent changer.')
};

const NOT_ALLOWED = () =>
  t(
    "Cette écriture n'existe pas dans le catalogue ou n'est pas autorisée (aucune suppression, aucune route sensible). Utilisez list_capabilities pour trouver une route de création ou de modification."
  );

interface StateSource {
  entry: CatalogEntry;
  /** `parent` : la ressource visée par une action (`/x/:id/verbe`), lue pour l'enregistrement visé. */
  role: 'self' | 'parent';
}

/** Route de lecture de l'enregistrement visé : même chemin (mise à jour), ou ressource parente (action, sous-ressource). */
export function findStateSource(entry: CatalogEntry, kind: RecordKind): StateSource | null {
  const readable = (path: string): CatalogEntry | undefined => {
    const candidate = findCatalogEntry(`GET ${path}`);
    return candidate && READABLE_METHODS.has(candidate.method) && !candidate.sensitive ? candidate : undefined;
  };
  if (kind === 'update') {
    const own = readable(entry.path);
    if (own) return { entry: own, role: 'self' };
  }
  if (kind !== 'create') {
    const parentPath = parentResourcePath(entry.path);
    const parent = parentPath ? readable(parentPath) : undefined;
    if (parent) return { entry: parent, role: 'parent' };
  }
  if (kind === 'create' && entry.pathParams.length > 0) {
    // Création imbriquée (`POST /syndics/:syndicId/charges`) : le parent désigné par les paramètres de chemin.
    const ancestorPath = lastParamAncestorPath(entry.path);
    const ancestor = ancestorPath ? readable(ancestorPath) : undefined;
    if (ancestor) return { entry: ancestor, role: 'parent' };
  }
  return null;
}

interface ReadState {
  record: Record<string, unknown> | null;
  /** La réponse était lisible comme un enregistrement JSON. */
  readable: boolean;
}

/** Lit l'état actuel (loopback GET, mêmes réductions de secrets que `call_read`). Refuse le plan si la lecture échoue. */
async function readCurrentState(
  source: StateSource,
  pathParams: Record<string, string>,
  ctx: CopilotToolContext,
  headers: Record<string, string>
): Promise<ReadState> {
  const params = Object.fromEntries(
    Object.entries(pathParams).filter(([name]) => source.entry.pathParams.includes(name))
  );
  const path = buildPath(source.entry.path, ctx.tenantId, params, source.entry.pathParams);
  let response: Awaited<ReturnType<typeof loopbackGet>>;
  try {
    response = await loopbackGet({
      pathAndQuery: path,
      headers: { ...headers, 'Accept-Language': currentLanguage() },
      signal: ctx.signal
    });
  } catch (error) {
    if (error instanceof LoopbackTimeoutError) {
      throw new BadRequestError(t("L'état actuel de l'enregistrement n'a pas pu être lu dans le délai : plan refusé."));
    }
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    throw new ForbiddenError(
      t("Vous n'avez pas la permission de lire cet enregistrement, donc de le modifier : plan refusé.")
    );
  }
  if (response.status === 404) {
    throw new NotFoundError(
      t("L'enregistrement visé est introuvable (identifiant erroné ou autre agence) : plan refusé.")
    );
  }
  if (response.status >= 300 || response.tooLarge) {
    throw new BadRequestError(
      t("L'état actuel n'a pas pu être lu ({{message}}) : plan refusé.", {
        message: response.tooLarge ? t('réponse trop volumineuse') : httpErrorMessage(response.status, response.text)
      })
    );
  }
  if (!/json/i.test(response.contentType)) return { record: null, readable: false };
  try {
    const record = unwrapRecord(redactSecrets(JSON.parse(response.text)));
    return { record, readable: record !== null };
  } catch {
    return { record: null, readable: false };
  }
}

/** La route vise un utilisateur : un segment `users` suivi d'un paramètre de chemin. */
function targetsUserRecord(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  return segments.some((segment, index) => segment === 'users' && segments[index + 1]?.startsWith(':'));
}

function lastParamValue(entry: CatalogEntry, pathParams: Record<string, string>): string | null {
  for (let index = entry.pathParams.length - 1; index >= 0; index -= 1) {
    const value = pathParams[entry.pathParams[index]!];
    if (value) return value;
  }
  return null;
}

export const planWriteTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'plan_write',
  description:
    "Prépare une ÉCRITURE (création, modification ou action) pour que l'utilisateur l'approuve : ce plan n'écrit rien, il est montré à l'utilisateur avec les changements calculés par le serveur, et rien n'est fait tant qu'il n'a pas approuvé dans l'interface. " +
    "Fournis capabilityId (l'id exact d'une route POST, PUT ou PATCH trouvée par list_capabilities), pathParams (identifiants issus d'un résultat d'outil, jamais inventés ; le tenantId est ajouté par le serveur), body (objet JSON des champs à écrire), " +
    `title (≤ ${MAX_TITLE_CHARS} caractères) et steps (1 à ${MAX_STEPS} étapes courtes, ≤ ${MAX_STEP_CHARS} caractères chacune) : texte honnête, dans la langue de l'utilisateur, qui décrit ce que tu proposes sans rien prétendre de fait. ` +
    `Au plus ${COPILOT_MAX_WRITE_PLANS_PER_REQUEST} plans par demande. Aucune suppression n'est possible. Après plan_write, attends la décision humaine : ne prétends jamais que l'écriture est faite.`,
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['capabilityId', 'title', 'steps'],
    properties: {
      capabilityId: {
        type: 'string',
        maxLength: 300,
        description: "Id exact d'une écriture de list_capabilities (« PATCH /api/tenants/:tenantId/... »)."
      },
      pathParams: {
        type: 'object',
        description: 'Valeur de chaque paramètre de chemin de la route (sauf tenantId).',
        additionalProperties: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' }
      },
      query: {
        type: 'object',
        description: `Paramètres de requête éventuels (au plus ${MAX_QUERY_KEYS}) : texte, nombre ou booléen.`,
        additionalProperties: { type: ['string', 'number', 'boolean'] }
      },
      body: {
        type: 'object',
        description: `Champs à écrire : objet JSON (${PLAN_BODY_MAX_BYTES} octets au plus, ${PLAN_BODY_MAX_DEPTH} niveaux au plus). Pour une modification, ne mets que les champs qui changent.`
      },
      title: {
        type: 'string',
        maxLength: MAX_TITLE_CHARS,
        description: "Titre court du plan, en texte brut, dans la langue de l'utilisateur."
      },
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_STEPS,
        items: { type: 'string', maxLength: MAX_STEP_CHARS },
        description: 'Étapes prévues, en texte brut, honnêtes et sans rien prétendre de déjà fait.'
      }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'proposal',
  async execute(input: Input, ctx) {
    assertToolPermission(ctx, PERMISSION);

    const issued = ctx.writePlansIssued ?? 0;
    if (issued >= COPILOT_MAX_WRITE_PLANS_PER_REQUEST) {
      throw new BadRequestError(
        t(
          'Au plus {{max}} plans d’écriture par demande : attends la décision de l’utilisateur avant d’en proposer d’autres.',
          {
            max: COPILOT_MAX_WRITE_PLANS_PER_REQUEST
          }
        )
      );
    }

    // Id inconnu, lecture, route sensible ou destructive : même refus, sans détail sur la raison.
    const entry = findWritableEntry(input.capabilityId);
    if (!entry) throw new NotFoundError(NOT_ALLOWED());
    if (!isPermittedByCatalog(entry, ctx.permissions)) {
      throw new ForbiddenError(t("Vous n'avez pas la permission d'effectuer cette écriture."));
    }
    const headers = ctx.loopbackHeaders?.();
    if (!headers) throw new ForbiddenError(t("L'écriture n'est pas disponible dans ce contexte."));

    const pathParams = input.pathParams ?? {};
    const query = input.query ?? {};
    const body = input.body ?? null;
    // Valide les paramètres de chemin (inattendus, manquants) comme `call_read` ; `:tenantId` est imposé.
    buildPath(entry.path, ctx.tenantId, pathParams, entry.pathParams);

    const kind = classifyRecord(entry);
    const source = findStateSource(entry, kind);
    const nestedCreate = kind === 'create' && entry.pathParams.length > 0;
    // Création imbriquée dont le parent n'a aucune route de lecture : le serveur ne peut ni le nommer ni
    // vérifier qu'il existe pour l'utilisateur. Plan refusé, avant toute lecture et sans jeton émis.
    if (nestedCreate && !source) {
      throw new ValidationError(
        t("Impossible de vérifier la ressource parente visée : l'assistant ne peut pas proposer cette écriture.")
      );
    }
    const warnings: string[] = [
      t('Le serveur peut modifier d’autres champs (dates, statuts, montants calculés) que ceux listés.')
    ];

    let state: ReadState | null = null;
    let stateReadAt: string | undefined;
    if (source) {
      // Un parent illisible (403, 404, autre erreur, délai) refuse le plan, comme pour une mise à jour.
      state = await readCurrentState(source, pathParams, ctx, headers);
      stateReadAt = new Date().toISOString();
    }

    // « Avant » : état de l'enregistrement pour une mise à jour seulement ; une action ou une création n'a pas d'avant.
    const beforeState = kind === 'update' && state?.record ? state.record : undefined;
    const changeSet = computeChanges(body, beforeState);
    if (kind === 'update' && !beforeState) {
      warnings.push(t("L'état actuel n'a pas pu être lu : les valeurs « avant » ne sont pas disponibles."));
    }
    if (changeSet.absentFields.length > 0) {
      warnings.push(
        t("Champs absents de l'enregistrement actuel : {{fields}}.", {
          fields: changeSet.absentFields.slice(0, 10).join(', ') + (changeSet.absentFields.length > 10 ? '…' : '')
        })
      );
    }
    if (kind === 'update' && beforeState && changeSet.changes.length === 0) {
      warnings.push(t('Aucun changement détecté par rapport à l’état actuel.'));
    }
    if (changeSet.valuesTruncated) {
      warnings.push(t('Certaines valeurs longues sont tronquées à l’affichage ; la requête envoyée est complète.'));
    }
    if (kind === 'action' && !state) {
      warnings.push(t("L'enregistrement visé n'a pas pu être vérifié (aucune route de lecture connue)."));
    }
    if (changeSet.changes.some(change => isSecretField(change.field))) {
      const protectedFields = [...new Set(changeSet.changes.filter(c => isSecretField(c.field)).map(c => c.field))];
      warnings.push(
        t('Champ protégé : valeur non affichée ({{fields}}).', {
          fields: protectedFields.slice(0, 10).join(', ') + (protectedFields.length > 10 ? '…' : '')
        })
      );
    }
    for (const list of changeSet.replacedLists) {
      warnings.push(
        t('Liste remplacée : {{removed}} éléments retirés ({{field}}).', { removed: list.removed, field: list.field })
      );
    }
    const displayedQuery = displayQuery(query);
    if (displayedQuery.length > 0) {
      warnings.push(
        t('Paramètres envoyés à la route : {{params}}.', {
          params: displayedQuery.map(param => `${param.key}=${param.value}`).join(', ')
        })
      );
    }

    const truncated = changeSet.changes.length > MAX_DISPLAYED_CHANGES;
    const changes = truncated ? changeSet.changes.slice(0, MAX_DISPLAYED_CHANGES) : changeSet.changes;
    if (truncated) {
      warnings.push(
        t('{{count}} autres changements ne sont pas affichés : le corps complet sera envoyé tel quel.', {
          count: changeSet.changes.length - MAX_DISPLAYED_CHANGES
        })
      );
    }

    const assessment = assessWrite(entry, body, query);
    // Liste raccourcie : seule l'état lu à l'émission le sait, donc le plan SIGNE l'exigence (voir `requireConfirmation`).
    const forceConfirmation = changeSet.replacedLists.length > 0;
    const requiresTypedConfirmation = assessment.requiresTypedConfirmation || forceConfirmation;
    if (assessment.sensitive) {
      warnings.push(
        t(
          'Action sensible : à approuver avec une extrême attention, elle peut avoir des effets externes difficiles à annuler.'
        )
      );
    } else if (changeSet.leafCount > MAX_DISPLAYED_CHANGES) {
      warnings.push(t('Corps volumineux : la saisie du mot de confirmation est exigée.'));
    }

    let target: WritePlan['target'] = null;
    if (kind !== 'create' || nestedCreate) {
      const rawId = lastParamValue(entry, pathParams);
      const fallback = rawId ? t('Enregistrement {{id}}', { id: shortRecordId(rawId) }) : null;
      const label = readableLabel(state?.record ?? null) ?? fallback;
      target = label ? { label, resolved: state !== null } : null;
    }

    // Action sur un utilisateur (`.../users/:userId/...`) : le serveur nomme la personne dont l'accès change,
    // sans doublonner un avertissement qui le dit déjà.
    if (kind !== 'create' && target && targetsUserRecord(entry.path)) {
      const accessWarning = t("Cette action modifie l'accès de {{label}}.", { label: target.label });
      if (!warnings.includes(accessWarning)) warnings.push(accessWarning);
    }

    const pathParamsDisplay = entry.pathParams
      .filter(name => pathParams[name] !== undefined)
      .map(name => ({ name, value: pathParams[name]! }));

    const args: ExecuteCapabilityArgs = {
      capabilityId: entry.id,
      pathParams,
      query,
      body,
      ...(forceConfirmation ? { requireConfirmation: true as const } : {}),
      planHash: ''
    };
    args.planHash = computePlanHash(args);
    const { token, claims } = signCapabilityProposal({ userId: ctx.userId, tenantId: ctx.tenantId, args });

    const plan: WritePlan = {
      proposalId: claims.jti,
      token,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      action: 'EXECUTE_CAPABILITY',
      capabilityId: entry.id,
      method: entry.method as WritePlan['method'],
      module: entry.module,
      title: input.title,
      steps: input.steps,
      recordKind: kind,
      target,
      ...(pathParamsDisplay.length > 0 ? { pathParams: pathParamsDisplay } : {}),
      ...(displayedQuery.length > 0 ? { query: displayedQuery } : {}),
      ...(stateReadAt ? { stateReadAt } : {}),
      changes,
      ...(truncated ? { changesTruncated: true } : {}),
      warnings,
      sensitive: assessment.sensitive,
      ...(assessment.sensitive && assessment.category
        ? { sensitiveReason: SENSITIVE_REASONS[assessment.category]() }
        : {}),
      requiresTypedConfirmation,
      ...(requiresTypedConfirmation ? { confirmationWord: CONFIRMATION_WORD } : {})
    };

    ctx.writePlansIssued = issued + 1;

    // Audit : jamais le corps ni les valeurs. `displayHash` = empreinte de ce que l'humain a vu.
    const { token: _token, proposalId: _id, expiresAt: _exp, ...displayed } = plan;
    logAuditEvent({
      actorUserId: ctx.userId,
      tenantId: ctx.tenantId,
      actionKey: AuditActionKey.AI_PROPOSAL_ISSUED,
      entityType: 'AI_PROPOSAL',
      entityId: claims.jti,
      payload: {
        act: 'EXECUTE_CAPABILITY',
        capabilityId: entry.id,
        planHash: args.planHash,
        displayHash: sha256Hex(canonicalJson(displayed)),
        recordKind: kind,
        sensitive: assessment.sensitive,
        changeCount: changeSet.changes.length,
        requestId: ctx.requestId
      }
    });

    // Le jeton n'est JAMAIS renvoyé au modèle : il ne sort que par l'événement d'interface `write_plan`.
    return outcome(
      {
        planned: true,
        proposalId: claims.jti,
        summary:
          `Plan « ${input.title} » prêt (${entry.method} ${entry.module}, ${changeSet.changes.length} changement(s) calculé(s) par le serveur` +
          `${requiresTypedConfirmation ? ', confirmation renforcée exigée' : ''}). ` +
          "AUCUNE écriture n'a été faite. Attends la décision humaine dans l'interface (approbation ou refus) ; " +
          "ne prétends jamais l'écriture effectuée avant d'en voir le résultat, et n'en propose pas d'autre tant que l'utilisateur n'a pas répondu."
      },
      { type: 'write_plan', plan }
    );
  }
};
