import { z } from 'zod';

/**
 * Contrats figés d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md, §3).
 * Miroir des types côté web : apps/web/src/types/copilot.ts — à garder aligné.
 */

// --- Limites ---------------------------------------------------------------

export const COPILOT_MAX_MESSAGES = 20;
export const COPILOT_MAX_MESSAGE_CHARS = 4000;
export const COPILOT_MAX_TOTAL_CHARS = 24000;

// Artefacts (plan V2, étape 2) : limites du panneau d'affichage.
export const COPILOT_ARTIFACT_MAX_ROWS = 500;
export const COPILOT_ARTIFACT_MAX_COLUMNS = 20;
export const COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS = 20000;
export const COPILOT_ARTIFACT_MAX_CHART_POINTS = 200;
export const COPILOT_ARTIFACT_MAX_SERIES = 6;

/** Plans d'écriture au plus par requête de chat : une IA qui chaîne des écritures reste lisible pour l'humain. */
export const COPILOT_MAX_WRITE_PLANS_PER_REQUEST = 3;

// --- Noms et codes ---------------------------------------------------------

export type CopilotToolName =
  | 'search_properties'
  | 'search_leases'
  | 'list_lease_documents'
  | 'list_property_documents'
  | 'propose_rental_document'
  | 'show_artifact'
  | 'list_capabilities'
  | 'call_read'
  | 'plan_write';

export type CopilotErrorCode =
  | 'AI_DISABLED'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REFUSAL'
  | 'TOOL_FORBIDDEN'
  | 'MAX_ROUNDS'
  | 'INTERNAL'
  | 'PROPOSAL_INVALID'
  | 'PROPOSAL_EXPIRED'
  | 'PROPOSAL_ALREADY_USED';

// --- Requêtes --------------------------------------------------------------

// POST /api/tenants/:tenantId/ai/chat — corps (.strict() partout)
export const chatRequestSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(COPILOT_MAX_MESSAGE_CHARS)
          })
          .strict()
      )
      .min(1)
      .max(COPILOT_MAX_MESSAGES),
    context: z
      .object({
        currentPath: z.string().max(300).optional(),
        activeEntityType: z.enum(['PROPERTY', 'LEASE']).optional(),
        activeEntityId: z.string().uuid().optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const last = value.messages[value.messages.length - 1];
    if (last && last.role !== 'user') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messages', value.messages.length - 1, 'role'],
        message: 'le dernier message doit venir de l’utilisateur'
      });
    }
    const total = value.messages.reduce((sum, message) => sum + message.content.length, 0);
    if (total > COPILOT_MAX_TOTAL_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messages'],
        message: `la conversation dépasse ${COPILOT_MAX_TOTAL_CHARS} caractères`
      });
    }
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Taille maximale d'un jeton de proposition. Un jeton de plan d'écriture porte le
 * corps de la requête (8 Ko au plus) en base64url : 4 096 caractères ne suffisent plus.
 */
export const COPILOT_MAX_PROPOSAL_TOKEN_CHARS = 16384;

export const executeRequestSchema = z
  .object({
    proposalToken: z.string().min(20).max(COPILOT_MAX_PROPOSAL_TOKEN_CHARS),
    /** Mot saisi par l'utilisateur pour un plan sensible (`CONFIRMER`) ; revérifié par le serveur. */
    confirmation: z.string().max(20).optional()
  })
  .strict();

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

/** Refus d'un plan par l'humain : `POST /ai/actions/reject` consomme le jeton (il ne pourra plus être exécuté). */
export const rejectRequestSchema = z
  .object({ proposalToken: z.string().min(20).max(COPILOT_MAX_PROPOSAL_TOKEN_CHARS) })
  .strict();

export type RejectRequest = z.infer<typeof rejectRequestSchema>;

/** Réponse du refus : `rejected: false` si le jeton était déjà utilisé ou expiré (idempotent, jamais d'erreur). */
export interface RejectPayload {
  rejected: boolean;
}

// --- Cartes et propositions ------------------------------------------------

export interface PropertyCardItem {
  id: string;
  internalReference: string;
  title: string;
  propertyType: string;
  status: string;
  locationZone: string | null;
  address: string;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  surfaceArea: number | null;
  thumbnailUrl: string | null;
}

export interface LeaseCardItem {
  id: string;
  leaseNumber: string;
  status: string;
  propertyLabel: string;
  renterName: string | null;
  rentAmount: string;
  currency: string;
  startDate: string;
}

export interface DocumentCardItem {
  id: string;
  kind: 'rental' | 'property';
  label: string;
  type: string;
  status: string | null;
  date: string | null;
  downloadable: boolean;
  /** Renseigné pour les pièces d'un bien (route /properties/:id/documents/:docId/file). */
  propertyId?: string;
}

export interface ActionProposal {
  proposalId: string;
  token: string;
  expiresAt: string;
  action: 'GENERATE_RENTAL_DOCUMENT';
  documentType: 'RENT_RECEIPT' | 'RENT_STATEMENT';
  summary: {
    leaseId: string;
    leaseNumber: string;
    propertyLabel: string;
    renterName: string | null;
    periodLabel: string;
    amount: string | null;
    currency: string;
  };
}

export interface ActionExecutedPayload {
  proposalId: string;
  alreadyExisted: boolean;
  document: {
    id: string;
    documentNumber: string | null;
    type: 'RENT_RECEIPT' | 'STATEMENT';
    mimeType: string;
    filename: string;
    downloadPath: string; // /tenants/:tid/documents/:id/download
  };
}

// --- Plans d'écriture (plan V2, étape 4) ------------------------------------

export type PlanScalar = string | number | boolean | null;

export interface WritePlanChange {
  field: string;
  /** Absent = création (aucune valeur avant). */
  before: PlanScalar | undefined;
  after: PlanScalar;
}

/** Paramètre de requête envoyé à la route, tel qu'affiché (valeur masquée si la clé évoque un secret). */
export interface WritePlanQueryParam {
  key: string;
  value: string;
}

/** Paramètre de chemin de la route (identifiant brut, `tenantId` exclu). */
export interface WritePlanPathParam {
  name: string;
  value: string;
}

/**
 * Plan d'écriture montré à l'humain. `title` et `steps` sont rédigés par le modèle
 * (texte non fiable, rendu en texte brut) ; `target`, `changes`, `warnings` et les
 * indicateurs de sensibilité sont CALCULÉS PAR LE SERVEUR, jamais par le modèle.
 */
export interface WritePlan {
  proposalId: string;
  token: string;
  expiresAt: string;
  action: 'EXECUTE_CAPABILITY';
  capabilityId: string;
  method: 'POST' | 'PUT' | 'PATCH';
  module: string;
  title: string;
  steps: string[];
  recordKind: 'create' | 'update' | 'action';
  target: { label: string; resolved: boolean } | null;
  /** Identifiants de chemin envoyés (hors tenantId), calculés par le serveur depuis la requête signée. */
  pathParams?: WritePlanPathParam[];
  /** Paramètres de requête envoyés (calculés depuis la requête signée ; valeurs secrètes masquées). Non vide : confirmation par mot. */
  query?: WritePlanQueryParam[];
  /** Instant (ISO) de la lecture de l'état « avant » ; absent si aucun état n'a été lu. */
  stateReadAt?: string;
  changes: WritePlanChange[];
  changesTruncated?: boolean;
  warnings: string[];
  sensitive: boolean;
  sensitiveReason?: string;
  requiresTypedConfirmation: boolean;
  confirmationWord?: 'CONFIRMER';
}

/** Erreur de validation d'un champ, remontée de la route (message traduit, jamais la valeur saisie). */
export interface CapabilityFieldError {
  path: string;
  message: string;
}

/** Résultat de POST /actions/execute pour un jeton de plan d'écriture. */
export interface CapabilityExecutedPayload {
  kind: 'capability';
  proposalId: string;
  ok: boolean;
  status: number;
  message: string;
  /** Réponse de la route, masquée et réduite comme `call_read`. */
  resultPreview: unknown;
  /** Présent seulement pour un refus de validation (400/422 VALIDATION_ERROR) : 10 erreurs au plus. */
  fieldErrors?: CapabilityFieldError[];
}

export interface CopilotStatus {
  enabled: boolean;
  reason?: 'NOT_CONFIGURED' | 'NO_TOOLS';
  provider: 'fake' | 'anthropic' | 'openrouter' | null;
  tools: CopilotToolName[];
  limits: { maxMessages: number; maxMessageChars: number };
}

// --- Artefacts -------------------------------------------------------------

/** Données d'affichage seulement : jamais de HTML, jamais d'écriture. L'`id` est généré par le serveur. */
export type ArtifactCell = string | number | null;

export type CopilotArtifact =
  | {
      kind: 'table';
      id: string;
      title: string;
      columns: { key: string; label: string; type?: 'text' | 'number' | 'currency' | 'date' }[];
      rows: Record<string, ArtifactCell>[];
      truncated?: boolean;
    }
  | { kind: 'markdown'; id: string; title: string; content: string }
  | {
      kind: 'chart';
      id: string;
      title: string;
      chartType: 'bar' | 'line' | 'pie';
      xKey: string;
      series: { key: string; label: string }[];
      data: Record<string, ArtifactCell>[];
    };

// --- Fil SSE ---------------------------------------------------------------

// "event: <type>\ndata: <JSON de l'objet>\n\n" ; commentaire ": ping" toutes les 15 s
export type CopilotSseEvent =
  | { type: 'meta'; conversationId: string; requestId: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_status';
      tool: CopilotToolName;
      status: 'started' | 'succeeded' | 'failed' | 'forbidden';
    }
  | { type: 'property_results'; items: PropertyCardItem[]; total: number }
  | { type: 'lease_results'; items: LeaseCardItem[] }
  | {
      type: 'document_list';
      scope: 'lease' | 'property';
      items: DocumentCardItem[];
    }
  | { type: 'action_proposal'; proposal: ActionProposal }
  | { type: 'write_plan'; plan: WritePlan }
  | { type: 'artifact'; artifact: CopilotArtifact }
  | {
      type: 'error';
      code: CopilotErrorCode;
      message: string;
      retryable: boolean;
    }
  | {
      type: 'done';
      reason: 'end_turn' | 'max_rounds' | 'aborted' | 'error' | 'refusal';
    };

// --- Jeton de proposition --------------------------------------------------

// `v1.<b64url(JSON claims)>.<b64url(HMAC_SHA256(k, "v1."+payload))>`
// k = crypto.hkdfSync('sha256', env.JWT_SECRET, 'immotopia/immocopilot', 'proposal-token/v1', 32)
export type GenerateRentalDocumentArgs =
  | {
      docType: 'RENT_RECEIPT';
      leaseId: string;
      paymentId: string;
      installmentId: string;
    }
  | {
      docType: 'RENT_STATEMENT';
      leaseId: string;
      startDate: string;
      endDate: string;
    }; // YYYY-MM-DD

export interface ProposalClaims {
  v: 1;
  jti: string;
  sub: string;
  tid: string;
  act: 'GENERATE_RENTAL_DOCUMENT';
  args: GenerateRentalDocumentArgs;
  iat: number;
  exp: number;
}

/** Arguments signés d'un plan d'écriture : exactement ce que la confirmation exécutera. */
export interface ExecuteCapabilityArgs {
  capabilityId: string;
  pathParams: Record<string, string>;
  query: Record<string, string | number | boolean>;
  body: Record<string, unknown> | null;
  /**
   * `true` si le plan a exigé le mot de confirmation pour une raison que seul l'état lu à l'émission connaît
   * (liste remplacée par une plus courte). Signé et inclus dans `planHash` : le serveur l'applique à l'exécution.
   */
  requireConfirmation?: boolean;
  /** SHA-256 (hex) de la requête approuvée : voir `lib/ai/plan-hash.ts`. */
  planHash: string;
}

export interface CapabilityProposalClaims {
  v: 1;
  jti: string;
  sub: string;
  tid: string;
  act: 'EXECUTE_CAPABILITY';
  args: ExecuteCapabilityArgs;
  iat: number;
  exp: number;
}

// --- Fournisseur LLM (neutre) ----------------------------------------------

export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    }
  | { type: 'opaque'; raw: unknown }; // blocs natifs (thinking…) renvoyés tels quels

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmBlock[];
}

export interface LlmToolSpec {
  name: CopilotToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmTurnResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';
  assistantContent: LlmBlock[];
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
}

/** Réglages relus à chaque tour depuis la configuration effective (voir `services/ai-settings-service.ts`). */
export interface ProviderRuntimeConfig {
  model: string;
  effort: 'low' | 'medium' | 'high';
  refusalFallback: boolean;
}

export interface LlmProvider {
  readonly id: 'fake' | 'anthropic' | 'openrouter';
  runTurn(
    req: {
      system: string;
      messages: LlmMessage[];
      tools: LlmToolSpec[];
      maxOutputTokens: number;
    },
    onTextDelta: (text: string) => void,
    signal: AbortSignal
  ): Promise<LlmTurnResult>;
}

// --- Registre d'outils -----------------------------------------------------

export interface CopilotToolContext {
  tenantId: string;
  userId: string;
  permissions: ReadonlySet<string>;
  requestId: string;
  conversationId: string;
  signal: AbortSignal;
  /**
   * Baux « vus » pendant CETTE requête de chat : renvoyés par `search_leases`,
   * `list_lease_documents`, ou l'entité de l'écran vérifié. `propose_rental_document`
   * refuse un bail absent de cet ensemble (défense contre l'injection de prompt).
   * Mutable, propre à la requête.
   */
  seenLeaseIds: Set<string>;
  /**
   * En-têtes qui rejouent l'authentification de l'utilisateur du chat pour la
   * passerelle (`call_read`, appel loopback). Fonction, et non propriété
   * lisible : le jeton ne figure ni dans un `JSON.stringify(ctx)`, ni dans un
   * journal, ni dans un résultat d'outil. Absente : la passerelle refuse d'appeler.
   */
  loopbackHeaders?: () => Record<string, string>;
  /** Plans d'écriture émis pendant CETTE requête de chat (plafond : `COPILOT_MAX_WRITE_PLANS_PER_REQUEST`). Mutable. */
  writePlansIssued?: number;
}

export interface CopilotToolOutcome {
  modelResult: Record<string, unknown>;
  uiEvent?: CopilotSseEvent;
}

export interface CopilotToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: CopilotToolName;
  description: string;
  inputSchema: S;
  jsonSchema: Record<string, unknown>;
  requiredPermission: string;
  /** Permissions supplémentaires, toutes exigées (ex. voir le document généré pour le télécharger). */
  additionalPermissions?: readonly string[];
  feature: 'CORE' | 'RENTAL';
  kind: 'read' | 'proposal';
  execute(input: z.infer<S>, ctx: CopilotToolContext): Promise<CopilotToolOutcome>;
}
