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
  | 'search_syndicates'
  | 'search_syndicate_lots'
  | 'search_sale_mandates'
  | 'search_construction_sites'
  | 'search_leases'
  | 'rental_arrears'
  | 'rental_receipts'
  | 'rental_due_comparison'
  | 'rental_monthly_review'
  | 'maintenance_overview'
  | 'syndicate_maintenance'
  | 'syndicate_charges'
  | 'syndicate_budget'
  | 'property_portfolio'
  | 'lease_portfolio'
  | 'crm_pipeline'
  | 'sale_mandates'
  | 'construction_budget'
  | 'owner_statements'
  | 'owner_payouts'
  | 'chart_analysis'
  | 'pivot_analysis'
  | 'show_indicators'
  | 'compose_report'
  | 'list_lease_documents'
  | 'list_property_documents'
  | 'propose_rental_document'
  | 'show_artifact'
  | 'list_capabilities'
  | 'list_datasets'
  | 'call_read'
  | 'propose_follow_up'
  | 'prepare_budget_alert'
  | 'prepare_lease_expiry_alert'
  | 'prepare_declaration_alert'
  | 'prepare_rent_arrears_alert';

export type RentalAlertRule = { propertyId?: string; days: number } & (
  { kind: 'lease_expiry' | 'declaration_pending' } | { kind: 'overdue_rent'; minimumAmount: number; currency: string }
);

export type PreparedAlert =
  | {
      kind: 'construction_budget';
      siteId: string;
      siteName: string;
      thresholdPercent: number;
    }
  | { kind: 'rental'; rule: RentalAlertRule; propertyLabel?: string };

export interface FollowUpProposal {
  id: string;
  kind: 'notify' | 'task' | 'email' | 'schedule';
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'FAILED';
  display: {
    recipients: string[];
    artifactTitle?: string;
    sharesAnalysis?: boolean;
    title?: string;
    message?: string;
    priority?: 'low' | 'normal' | 'high';
    dueDate?: string;
    formats?: string[];
    schedule?: { frequency: 'daily' | 'weekly' | 'monthly'; time: string; timeZone: string; day?: number };
  };
}

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

export interface AssistantBriefingItem {
  id: string;
  title: string;
  description: string;
  href: string;
  occurredAt: string;
  severity: 'danger' | 'warning' | 'info';
}

export interface AssistantConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
}

export interface ResponseFeedback {
  revision: number;
  helpful: boolean;
  comment: string;
}

export interface AssistantConversation extends AssistantConversationSummary {
  turns: Array<{
    id: string;
    question: string;
    files?: string[];
    attachments?: Array<{ name: string; position: number }>;
    response: string;
    responseRevision?: number;
    feedback?: ResponseFeedback | null;
    result: Array<Extract<CopilotSseEvent, { type: 'artifact' | 'prepared_alert' }>> | null;
    followUps?: FollowUpProposal[];
    outcome: string | null;
  }>;
}

export interface ChatRequest {
  focus?: { artifactId: string; version: number };
  regenerateTurnId?: string;
  turnId?: string;
  deep?: boolean;
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
  fieldErrors?: CapabilityFieldError[];
}

/** Champ refusé par la validation d'une écriture (message déjà traduit, jamais la valeur saisie). */
export interface CapabilityFieldError {
  path: string;
  message: string;
}

/** Retour de POST /actions/execute : document (sans `kind`) ou capacité (`kind: 'capability'`). */
export type ExecuteActionResult = ActionExecutedPayload | CapabilityExecutedPayload;

export function isCapabilityExecuted(r: ExecuteActionResult | undefined): r is CapabilityExecutedPayload {
  return !!r && (r as { kind?: unknown }).kind === 'capability';
}

export interface CopilotStatus {
  agencyTimeZone?: string;
  preferredAssistantLanguage?: import('../i18n/assistant-language').AssistantLanguage | null;
  transcription?: boolean;
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

export const ANALYSIS_CHART_TYPES = [
  'bar',
  'stacked_bar',
  'horizontal_bar',
  'line',
  'area',
  'stacked_area',
  'pie',
  'donut',
  'scatter',
  'combo',
  'heatmap',
  'treemap',
  'funnel',
  'gauge'
] as const;

export interface AnalysisChartSeries {
  key: string;
  label: string;
  form?: 'bar' | 'line';
  axis?: 'primary' | 'secondary';
}

export type ChartMark =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string; tip?: string }
  | {
      kind: 'text';
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      text: string;
      align?: 'start' | 'center' | 'end';
    };

export interface ChartScene {
  width: number;
  height: number;
  marks: ChartMark[];
}

export interface ArtifactProvenance {
  scope?: 'agency' | 'shared' | 'attachment';
  filters?: Array<{ label: string; value?: string }>;
  source: string;
  href: string;
  period: string;
  calculatedAt: string;
  rules: string[];
}

export interface ArtifactIndicator {
  label: string;
  value: number;
  currency?: string;
  comparison?: { label: string; value: number; change?: number };
}

export type ArtifactDocumentBlock = { kind: 'text'; content: string } | { kind: 'table'; table: AnalysisTable };

export interface ArtifactVersionChange {
  expectedVersion: number;
  restoreVersion?: number;
  title?: string;
  textSections?: string[];
}

export interface ArtifactVersionInfo {
  version: number;
  createdAt: string | null;
}

export interface ArtifactVersionPayload {
  artifact: unknown;
  version: number;
  latest: number;
  versions: ArtifactVersionInfo[];
}

export type ArtifactDownloadFormat = 'pdf' | 'pptx' | 'csv' | 'xlsx';

export type CopilotArtifact = { canRefresh?: boolean } & (
  | { kind: 'document'; id: string; title: string; blocks: ArtifactDocumentBlock[] }
  | { kind: 'indicators'; id: string; title: string; cards: ArtifactIndicator[]; provenance?: ArtifactProvenance }
  | {
      kind: 'table';
      id: string;
      title: string;
      columns: { key: string; label: string; linkKey?: string; type?: 'text' | 'number' | 'currency' | 'date' }[];
      provenance?: ArtifactProvenance;
      rows: Record<string, ArtifactCell>[];
      totals?: Record<string, ArtifactCell>;
      truncated?: boolean;
    }
  | { kind: 'markdown'; id: string; title: string; content: string }
  | {
      kind: 'chart';
      provenance?: ArtifactProvenance;
      id: string;
      title: string;
      chartType: (typeof ANALYSIS_CHART_TYPES)[number];
      xKey: string;
      /** Libellé de l'axe des abscisses, si le serveur en fournit un ; sinon la clé rendue lisible. */
      xLabel?: string;
      groupKey?: string;
      groupLabel?: string;
      scene?: ChartScene;
      notices?: string[];
      series: AnalysisChartSeries[];
      data: Record<string, ArtifactCell>[];
    }
);

/** Limites de l'API ; le front les réapplique à l'affichage (défensif). */
export const ARTIFACT_MAX_ROWS = 500;
export const ARTIFACT_MAX_COLUMNS = 20;
export const ARTIFACT_MAX_PIVOT_COLUMNS = 50;
export const ARTIFACT_MAX_MARKDOWN_CHARS = 20000;
export const ARTIFACT_MAX_CHART_POINTS = 200;
export const ARTIFACT_MAX_SERIES = 6;

// --- Fil SSE ---------------------------------------------------------------

// "event: <type>\ndata: <JSON de l'objet>\n\n" ; commentaire ": ping" toutes les 15 s
export type CopilotSseEvent =
  | { type: 'meta'; conversationId: string; requestId: string }
  | { type: 'conversation_title'; conversationId: string; title: string }
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
  | { type: 'follow_up'; proposal: FollowUpProposal }
  | { type: 'prepared_alert'; alert: PreparedAlert }
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
  | { kind: 'follow_up'; proposal: FollowUpProposal }
  | { kind: 'prepared_alert'; alert: PreparedAlert }
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

export type AnalysisTable = Extract<CopilotArtifact, { kind: 'table' }>;

export interface CopilotUiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  rating?: { turnId: string; revision: number; previous?: ResponseFeedback | null };
  files?: Array<{ name: string; position?: number }>;
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
  send(
    text: string,
    ctx: CopilotPageContext,
    deep?: boolean,
    files?: readonly File[],
    focus?: ChatRequest['focus']
  ): Promise<void>;
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
  restoreConversation?(conversation: AssistantConversation): void;
  replaceArtifact?(artifact: CopilotArtifact, conversationId: string): void;
  conversationId?: string;
}
