/**
 * Miroir des TYPES d'ImmoCopilot (sans Zod) — source :
 * packages/api/src/lib/ai/contracts.ts. À garder aligné.
 */

export const COPILOT_MAX_MESSAGES = 20;
export const COPILOT_MAX_MESSAGE_CHARS = 4000;
/** Somme maximale des contenus d'une requête (le serveur rejette au-delà en 400 VALIDATION). */
export const COPILOT_MAX_TOTAL_CHARS = 24000;

export type CopilotToolName =
  | 'search_properties'
  | 'search_leases'
  | 'list_lease_documents'
  | 'list_property_documents'
  | 'propose_rental_document'
  | 'show_artifact'
  | 'list_capabilities'
  | 'call_read';

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

export interface ChatRequest {
  conversationId?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: {
    currentPath?: string;
    activeEntityType?: 'PROPERTY' | 'LEASE';
    activeEntityId?: string;
  };
}

export interface ExecuteRequest {
  proposalToken: string;
  /** Mot de confirmation saisi (plans sensibles) ; le serveur le revérifie. */
  confirmation?: string;
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

// --- Plans d'écriture (étape 4 : carte d'accord) ------------------------------

export type PlanScalar = string | number | boolean | null;

export interface WritePlanChange {
  field: string;
  /** Absent = création (aucune valeur avant). */
  before: PlanScalar | undefined;
  after: PlanScalar;
}

/**
 * Plan d'écriture : `title` et `steps` sont rédigés par l'assistant (texte non
 * fiable, rendu en texte brut) ; `target`, `changes` et `warnings` sont calculés
 * par le SERVEUR. Aucune écriture n'a eu lieu tant que l'utilisateur n'approuve pas.
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
  changes: WritePlanChange[];
  changesTruncated?: boolean;
  warnings: string[];
  sensitive: boolean;
  sensitiveReason?: string;
  requiresTypedConfirmation: boolean;
  confirmationWord?: 'CONFIRMER';
  /** Paramètres de requête réellement envoyés à la route (calculés par le serveur). */
  query?: WritePlanQueryParam[];
  /** Identifiants bruts des éléments visés dans le chemin de la route (serveur). */
  pathParams?: WritePlanPathParam[];
  /** Instant (ISO) où le serveur a lu l'état affiché ; les données ont pu changer depuis. */
  stateReadAt?: string;
}

export interface WritePlanQueryParam {
  key: string;
  value: string;
}

export interface WritePlanPathParam {
  name: string;
  value: string;
}

/** Résultat de POST /actions/execute pour un jeton de plan d'écriture. */
export interface CapabilityExecutedPayload {
  kind: 'capability';
  proposalId: string;
  ok: boolean;
  status: number;
  message: string;
  resultPreview: unknown;
}

/** Retour de POST /actions/execute : document (sans `kind`) ou capacité (`kind: 'capability'`). */
export type ExecuteActionResult = ActionExecutedPayload | CapabilityExecutedPayload;

export function isCapabilityExecuted(r: ExecuteActionResult | undefined): r is CapabilityExecutedPayload {
  return !!r && (r as { kind?: unknown }).kind === 'capability';
}

export interface CopilotStatus {
  enabled: boolean;
  /**
   * `NOT_CONFIGURED` / `NO_TOOLS` : renvoyés par l'API. `FORBIDDEN` / `NOT_FOUND` : posés par
   * le client quand l'état est refusé (401/403) ou que l'agence est introuvable (404).
   */
  reason?: 'NOT_CONFIGURED' | 'NO_TOOLS' | 'FORBIDDEN' | 'NOT_FOUND';
  provider: 'fake' | 'anthropic' | 'openrouter' | null;
  tools: CopilotToolName[];
  limits: { maxMessages: number; maxMessageChars: number };
}

// --- Artefacts (panneau de résultats) ---------------------------------------

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
      /** Libellé de l'axe des abscisses, si le serveur en fournit un ; sinon la clé rendue lisible. */
      xLabel?: string;
      series: { key: string; label: string }[];
      data: Record<string, ArtifactCell>[];
    };

/** Limites de l'API ; le front les réapplique à l'affichage (défensif). */
export const ARTIFACT_MAX_ROWS = 500;
export const ARTIFACT_MAX_COLUMNS = 20;
export const ARTIFACT_MAX_MARKDOWN_CHARS = 20000;
export const ARTIFACT_MAX_CHART_POINTS = 200;
export const ARTIFACT_MAX_SERIES = 6;

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

// --- Hook useCopilotChat (plan §3, contrat du hook) -------------------------

export interface CopilotPageContext {
  currentPath?: string;
  activeEntityType?: 'PROPERTY' | 'LEASE';
  activeEntityId?: string;
}

export type CopilotProposalState = 'pending' | 'confirming' | 'confirmed' | 'cancelled' | 'expired' | 'failed';

/** pending -> approving -> executed | failed | refused | expired. */
export type WritePlanState = 'pending' | 'approving' | 'executed' | 'failed' | 'refused' | 'expired';

export type CopilotAttachment =
  | { kind: 'properties'; items: PropertyCardItem[]; total: number }
  | { kind: 'leases'; items: LeaseCardItem[] }
  | { kind: 'documents'; scope: 'lease' | 'property'; items: DocumentCardItem[] }
  | { kind: 'artifact'; artifactId: string; title: string; artifactKind: CopilotArtifact['kind'] }
  | {
      kind: 'proposal';
      proposal: ActionProposal;
      state: CopilotProposalState;
      result?: ActionExecutedPayload;
      error?: { code: string; message: string };
    }
  | {
      kind: 'write_plan';
      plan: WritePlan;
      state: WritePlanState;
      result?: CapabilityExecutedPayload;
      error?: { code: string; message: string };
      /** Instant de la décision (ISO) : exécution, échec ou refus. */
      decidedAt?: string;
    };

export interface CopilotUiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments: CopilotAttachment[];
}

export type CopilotChatStatus = 'idle' | 'streaming' | 'error';

export interface UseCopilotChatResult {
  messages: CopilotUiMessage[];
  /** Artefacts de la conversation, du plus ancien au plus récent. */
  artifacts: CopilotArtifact[];
  /** Artefact affiché dans le panneau (le dernier reçu par défaut). */
  selectedArtifactId?: string;
  selectArtifact(id: string): void;
  status: CopilotChatStatus;
  error?: { code: string; message: string };
  send(text: string, ctx: CopilotPageContext): Promise<void>;
  stop(): void;
  confirmProposal(proposalId: string): Promise<void>;
  cancelProposal(proposalId: string): void;
  /** Approuve un plan d'écriture ; `confirmation` : mot saisi pour un plan sensible. */
  approveWritePlan(proposalId: string, confirmation?: string): Promise<void>;
  /**
   * Refuse un plan : aucun appel serveur, état local « Refusé ». L'assistant n'en
   * est PAS informé automatiquement (le refus n'entre pas dans l'historique envoyé) ;
   * l'utilisateur peut le lui dire dans un message.
   */
  refuseWritePlan(proposalId: string): void;
  reset(): void;
}
