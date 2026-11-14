import apiClient from '../utils/api-client';
import { postEventStream } from '../utils/event-stream';
import type { ArtifactVersionChange } from '../types/copilot';
import type {
  ActionExecutedPayload,
  ArtifactDownloadFormat,
  ArtifactVersionPayload,
  AssistantConversation,
  AssistantConversationSummary,
  ChatRequest,
  CopilotSseEvent,
  CopilotStatus,
  ExecuteActionResult,
  ExecuteRequest
} from '../types/copilot';

const DISABLED_STATUS: CopilotStatus = {
  enabled: false,
  provider: null,
  tools: [],
  limits: { maxMessages: 0, maxMessageChars: 0 }
};

/** Les réponses de l'API sont `{ success, data }` ; on tolère aussi le corps nu. */
function unwrap<T>(body: unknown): T {
  const b = body as { data?: T } | undefined;
  return (b && typeof b === 'object' && 'data' in b ? b.data : body) as T;
}

/**
 * État de l'assistant. DÉFENSIF : toute erreur (réseau, 401, 403, 404, 5xx,
 * corps inattendu) donne `enabled: false` — le bouton reste masqué, l'écran
 * n'affiche jamais d'erreur pour une fonctionnalité optionnelle.
 */
async function getStatus(tenantId: string): Promise<CopilotStatus> {
  try {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/status`);
    const status = unwrap<CopilotStatus | undefined>(response.data);
    if (!status || typeof status.enabled !== 'boolean') return DISABLED_STATUS;
    return { ...DISABLED_STATUS, ...status, tools: status.tools ?? [] };
  } catch (error) {
    // Le statut HTTP distingue « refusé pour ce compte » (403) d'« agence introuvable » (404) ;
    // dans tous les cas l'assistant reste désactivé.
    const httpStatus = (error as { response?: { status?: number } } | null)?.response?.status;
    if (httpStatus === 401 || httpStatus === 403) return { ...DISABLED_STATUS, reason: 'FORBIDDEN' };
    if (httpStatus === 404) return { ...DISABLED_STATUS, reason: 'NOT_FOUND' };
    return DISABLED_STATUS;
  }
}

const KNOWN_EVENTS = new Set([
  'meta',
  'text_delta',
  'tool_status',
  'property_results',
  'lease_results',
  'document_list',
  'action_proposal',
  'write_plan',
  'artifact',
  'error',
  'done'
]);

/**
 * Envoie la conversation et remet chaque événement typé à `onEvent`.
 * Événement inconnu ou JSON illisible : ignoré. Une erreur avant l'ouverture
 * du flux est levée sous la forme `{ status, code, message }`.
 */
async function streamChat(
  tenantId: string,
  request: ChatRequest,
  opts: { signal?: AbortSignal; files?: readonly File[]; onEvent(e: CopilotSseEvent): void }
): Promise<void> {
  let body: ChatRequest | FormData = request;
  if (opts.files?.length) {
    const data = new FormData();
    data.append('payload', JSON.stringify(request));
    for (const file of opts.files) data.append('files', file);
    body = data;
  }
  await postEventStream(`/tenants/${tenantId}/ai/chat`, body, {
    signal: opts.signal,
    onEvent: ({ event, data }) => {
      if (!KNOWN_EVENTS.has(event)) return;
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      if (!payload || typeof payload !== 'object') return;
      opts.onEvent({ ...(payload as object), type: event } as CopilotSseEvent);
    }
  });
}

/**
 * Exécute un jeton d'accord : le serveur rejoue auth, permission et jeton. Le retour
 * est un document déjà existant (génération de quittance) OU un résultat de capacité
 * (`kind: 'capability'`) selon le type du jeton. `confirmation` : mot saisi pour un
 * plan sensible ; omis du corps quand il est absent.
 */
async function executeAction(
  tenantId: string,
  proposalToken: string,
  confirmation?: string
): Promise<ExecuteActionResult> {
  const body: ExecuteRequest = confirmation ? { proposalToken, confirmation } : { proposalToken };
  const response = await apiClient.post(`/tenants/${tenantId}/ai/actions/execute`, body);
  return unwrap<ExecuteActionResult>(response.data);
}

/** Confirme une proposition de document (génération de quittance ou de relevé). */
async function executeProposal(tenantId: string, proposalToken: string): Promise<ActionExecutedPayload> {
  return (await executeAction(tenantId, proposalToken)) as ActionExecutedPayload;
}

/**
 * Signale au serveur qu'un plan a été refusé (invalide le jeton). MEILLEUR EFFORT :
 * ne lève jamais, renvoie `false` en cas d'échec ; l'interface n'en dépend pas.
 */
async function rejectAction(tenantId: string, proposalToken: string): Promise<boolean> {
  try {
    const response = await apiClient.post(`/tenants/${tenantId}/ai/actions/reject`, { proposalToken });
    return unwrap<{ rejected?: boolean } | undefined>(response.data)?.rejected === true;
  } catch {
    return false;
  }
}

async function getConversation(tenantId: string, id: string) {
  const response = await apiClient.get(`/tenants/${tenantId}/ai/conversations/${id}`);
  return unwrap<AssistantConversation>(response.data);
}

async function listConversations(tenantId: string, params: { q: string; archived: boolean; cursor?: string }) {
  const response = await apiClient.get(`/tenants/${tenantId}/ai/conversations`, { params });
  return unwrap<{ items: AssistantConversationSummary[]; nextCursor?: string }>(response.data);
}

async function updateConversation(
  tenantId: string,
  id: string,
  changes: Partial<Pick<AssistantConversationSummary, 'title' | 'pinned' | 'archived'>>
) {
  await apiClient.patch(`/tenants/${tenantId}/ai/conversations/${id}`, changes);
}

async function deleteConversation(tenantId: string, id: string) {
  await apiClient.delete(`/tenants/${tenantId}/ai/conversations/${id}`);
}

async function downloadArtifact(
  tenantId: string,
  conversationId: string,
  artifactId: string,
  format: ArtifactDownloadFormat,
  version?: number
) {
  return apiClient.get<Blob>(
    `/tenants/${tenantId}/ai/conversations/${conversationId}/artifacts/${artifactId}/${format}`,
    {
      responseType: 'blob',
      params: { version }
    }
  );
}

function artifactPath(tenantId: string, conversationId: string, artifactId: string) {
  return `/tenants/${tenantId}/ai/conversations/${conversationId}/artifacts/${artifactId}`;
}

async function getArtifactVersion(tenantId: string, conversationId: string, artifactId: string, version?: number) {
  const response = await apiClient.get(artifactPath(tenantId, conversationId, artifactId), { params: { version } });
  return unwrap<ArtifactVersionPayload>(response.data);
}

async function updateArtifactVersion(
  tenantId: string,
  conversationId: string,
  artifactId: string,
  change: ArtifactVersionChange
) {
  const response = await apiClient.post(artifactPath(tenantId, conversationId, artifactId), change);
  return unwrap<{ artifact: unknown; version: number }>(response.data);
}

export const copilotService = {
  updateArtifactVersion,
  getArtifactVersion,
  downloadArtifact,
  async transcribe(tenantId: string, audio: Blob, signal: AbortSignal) {
    const data = new FormData();
    data.set('audio', audio, 'dictation');
    const response = await apiClient.post(`/tenants/${tenantId}/ai/transcribe`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal
    });
    return unwrap<{ text: string }>(response.data).text;
  },
  downloadAttachment(tenantId: string, conversationId: string, turnId: string, position: number) {
    return apiClient.get<Blob>(
      `/tenants/${tenantId}/ai/conversations/${conversationId}/turns/${turnId}/files/${position}`,
      { responseType: 'blob' }
    );
  },
  getStatus,
  streamChat,
  executeAction,
  executeProposal,
  rejectAction,
  getConversation,
  listConversations,
  updateConversation,
  deleteConversation
};
export default copilotService;
