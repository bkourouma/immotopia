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

export interface CopilotStatus {
  enabled: boolean;
  reason?: 'NOT_CONFIGURED' | 'NO_TOOLS';
  provider: 'fake' | 'anthropic' | null;
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

// --- Hook useCopilotChat (plan §3, contrat du hook) -------------------------

export interface CopilotPageContext {
  currentPath?: string;
  activeEntityType?: 'PROPERTY' | 'LEASE';
  activeEntityId?: string;
}

export type CopilotProposalState = 'pending' | 'confirming' | 'confirmed' | 'cancelled' | 'expired' | 'failed';

export type CopilotAttachment =
  | { kind: 'properties'; items: PropertyCardItem[]; total: number }
  | { kind: 'leases'; items: LeaseCardItem[] }
  | { kind: 'documents'; scope: 'lease' | 'property'; items: DocumentCardItem[] }
  | {
      kind: 'proposal';
      proposal: ActionProposal;
      state: CopilotProposalState;
      result?: ActionExecutedPayload;
      error?: { code: string; message: string };
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
  status: CopilotChatStatus;
  error?: { code: string; message: string };
  send(text: string, ctx: CopilotPageContext): Promise<void>;
  stop(): void;
  confirmProposal(proposalId: string): Promise<void>;
  cancelProposal(proposalId: string): void;
  reset(): void;
}
