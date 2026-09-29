import { z } from 'zod';

/**
 * Contrats figés d'ImmoCopilot (docs/architecture/PLAN_IMMOCOPILOT.md, §3).
 * Miroir des types côté web : apps/web/src/types/copilot.ts — à garder aligné.
 */

// --- Limites ---------------------------------------------------------------

export const COPILOT_MAX_MESSAGES = 20;
export const COPILOT_MAX_MESSAGE_CHARS = 4000;
export const COPILOT_MAX_TOTAL_CHARS = 24000;

// --- Noms et codes ---------------------------------------------------------

export type CopilotToolName =
  | 'search_properties'
  | 'search_leases'
  | 'list_lease_documents'
  | 'list_property_documents'
  | 'propose_rental_document';

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

export const executeRequestSchema = z.object({ proposalToken: z.string().min(20).max(4096) }).strict();

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

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

export interface CopilotStatus {
  enabled: boolean;
  reason?: 'NOT_CONFIGURED' | 'NO_TOOLS';
  provider: 'fake' | 'anthropic' | 'openrouter' | null;
  tools: CopilotToolName[];
  limits: { maxMessages: number; maxMessageChars: number };
}

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
  feature: 'CORE' | 'RENTAL';
  kind: 'read' | 'proposal';
  execute(input: z.infer<S>, ctx: CopilotToolContext): Promise<CopilotToolOutcome>;
}
