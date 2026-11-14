import apiClient from '../utils/api-client';
import { postEventStream } from '../utils/event-stream';
import type {
  ActionExecutedPayload,
  ArtifactDownloadFormat,
  ArtifactVersionChange,
  ArtifactVersionPayload,
  AssistantConversation,
  AssistantConversationSummary,
  ChatRequest,
  CopilotSseEvent,
  CopilotStatus,
  ExecuteActionResult,
  ExecuteRequest,
  ResponseFeedback
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
  'conversation_title',
  'text_delta',
  'tool_status',
  'property_results',
  'lease_results',
  'document_list',
  'action_proposal',
  'write_plan',
  'follow_up',
  'prepared_alert',
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

export type SavedAnalysisReference = { conversationId: string; artifactId: string };
export type ReportSchedule = { time: string; timeZone: string } & (
  { frequency: 'daily' } | { frequency: 'weekly' | 'monthly'; day: number }
);
export type ReportFormat = 'xlsx' | 'pdf' | 'csv';
export type ScheduledReport = {
  id: string;
  schedule: ReportSchedule | null;
  formats: ReportFormat[];
  active: boolean;
  sharesCreated: boolean;
  shareRecipients: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  analysis: { title: string };
};
export type SharedConversation = { turns: Array<{ id: string; startedAt: string; artifacts: unknown[] }> };
export type SavedAnalysis = SavedAnalysisReference & { title: string; createdAt: string; pinnedAt?: string | null };
export type TaskPriority = 'low' | 'normal' | 'high';
export type AssistantTask = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  creator: { fullName: string };
  assignee: { fullName: string };
  canComplete: boolean;
  analysis?: SavedAnalysisReference;
  shareId?: string;
};
export type AnalysisShare = {
  id: string;
  colleague: string;
  createdAt: string;
  title?: string;
  pinned?: boolean;
  message?: string | null;
  kind?: 'artifact' | 'conversation';
};

function savedAnalysisPath(tenantId: string, { conversationId, artifactId }: SavedAnalysisReference) {
  return `/tenants/${tenantId}/ai/analyses/${conversationId}/${artifactId}`;
}

export const copilotService = {
  async listRentalAlerts(tenantId: string, cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/rental-alerts`, { params: { cursor }, signal });
    return unwrap<{
      items: Array<{
        id: string;
        rule?: import('../types/copilot').RentalAlertRule;
        property?: { title: string; internalReference: string | null };
        unavailable?: boolean;
      }>;
      nextCursor?: string;
    }>(response.data);
  },
  async rentalAlertProperties(tenantId: string, params: { q?: string; id?: string }, signal: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/rental-alerts/properties`, { params, signal });
    return unwrap<Array<{ id: string; title: string; internalReference: string | null }>>(response.data);
  },
  async saveRentalAlert(tenantId: string, id: string, rule: import('../types/copilot').RentalAlertRule) {
    await apiClient.put(`/tenants/${tenantId}/ai/rental-alerts/${id}`, rule);
  },
  async deleteRentalAlert(tenantId: string, id: string) {
    await apiClient.delete(`/tenants/${tenantId}/ai/rental-alerts/${id}`);
  },
  async decideFollowUp(tenantId: string, id: string, confirm: boolean) {
    const response = await apiClient.patch(`/tenants/${tenantId}/ai/follow-ups/${id}`, { confirm });
    return unwrap<{ status: import('../types/copilot').FollowUpProposal['status'] }>(response.data);
  },
  async notifyColleagues(
    tenantId: string,
    input: {
      requestId: string;
      recipientIds: string[];
      message: string;
      analysis?: SavedAnalysisReference;
    }
  ) {
    await apiClient.post(`/tenants/${tenantId}/ai/notifications`, {
      ...input,
      ...(input.analysis ? { share: true } : {})
    });
  },
  async listTasks(tenantId: string, cursor?: string, focus?: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/tasks`, { params: { cursor, focus }, signal });
    return unwrap<{ items: AssistantTask[]; nextCursor?: string }>(response.data);
  },
  async createTask(
    tenantId: string,
    input: {
      requestId: string;
      title: string;
      description?: string;
      assigneeId: string;
      dueDate?: string;
      priority: TaskPriority;
      analysis?: SavedAnalysisReference;
    }
  ) {
    const response = await apiClient.post(`/tenants/${tenantId}/ai/tasks`, {
      ...input,
      ...(input.analysis ? { share: true } : {})
    });
    return unwrap<{ id: string }>(response.data);
  },
  async setTaskCompleted(tenantId: string, id: string, completed: boolean) {
    await apiClient.patch(`/tenants/${tenantId}/ai/tasks/${id}`, { completed });
  },
  async listScheduledReports(tenantId: string, cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/reports`, { params: { cursor }, signal });
    return unwrap<{ items: ScheduledReport[]; nextCursor?: string }>(response.data);
  },
  async createScheduledReport(
    tenantId: string,
    input: SavedAnalysisReference & {
      schedule: ReportSchedule;
      formats: ReportFormat[];
      recipientIds: string[];
    }
  ) {
    const response = await apiClient.post(`/tenants/${tenantId}/ai/reports`, input);
    return unwrap<{ id: string; previewRunAt: string }>(response.data);
  },
  async queueImmediateReport(
    tenantId: string,
    input: SavedAnalysisReference & {
      requestId: string;
      formats: ReportFormat[];
      recipientIds: string[];
      message?: string;
    }
  ) {
    const response = await apiClient.post(`/tenants/${tenantId}/ai/reports`, { ...input, share: true });
    return unwrap<{ id: string }>(response.data);
  },
  async setScheduledReportActive(tenantId: string, id: string, active: boolean, share?: true) {
    await apiClient.patch(`/tenants/${tenantId}/ai/reports/${id}`, { active, share });
  },
  async deleteScheduledReport(tenantId: string, id: string) {
    await apiClient.delete(`/tenants/${tenantId}/ai/reports/${id}`);
  },
  async listSavedAnalysisPins(tenantId: string, signal: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/analyses/pins`, { signal });
    return unwrap<SavedAnalysisReference[]>(response.data);
  },
  async getSavedAnalysisPin(tenantId: string, reference: SavedAnalysisReference, signal: AbortSignal) {
    const response = await apiClient.get(savedAnalysisPath(tenantId, reference) + '/pin', { signal });
    return unwrap<{ artifact: unknown }>(response.data).artifact;
  },
  async setSavedAnalysisPin(tenantId: string, reference: SavedAnalysisReference, pinned: boolean) {
    await apiClient.put(savedAnalysisPath(tenantId, reference) + '/pin', { pinned });
  },
  async listAnalysisPins(tenantId: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/shares/pins`, { signal });
    return unwrap<Array<{ id: string }>>(response.data);
  },
  async setAnalysisPin(tenantId: string, id: string, pinned: boolean) {
    await apiClient.put(`/tenants/${tenantId}/ai/shares/${id}/pin`, { pinned });
  },
  async listAnalysisRecipients(tenantId: string, includeSelf = false) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/shares/recipients`, {
      params: includeSelf ? { includeSelf: 'true' } : undefined
    });
    return unwrap<Array<{ userId: string; displayName: string }>>(response.data);
  },
  async listAnalysisShares(tenantId: string, direction: 'incoming' | 'outgoing', cursor?: string) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/shares`, { params: { direction, cursor } });
    return unwrap<{ items: AnalysisShare[]; nextCursor?: string }>(response.data);
  },
  async shareAnalysis(
    tenantId: string,
    { conversationId, artifactId }: { conversationId: string; artifactId?: string },
    recipientIds: string[],
    message?: string
  ) {
    await apiClient.post(`/tenants/${tenantId}/ai/shares`, { conversationId, artifactId, recipientIds, message });
  },
  async revokeAnalysisShare(tenantId: string, id: string) {
    await apiClient.delete(`/tenants/${tenantId}/ai/shares/${id}`);
  },
  async getSharedAnalysis(tenantId: string, id: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/shares/${id}`, { signal });
    const data = unwrap<{ artifact?: unknown; conversation?: SharedConversation }>(response.data);
    return data.artifact ?? data.conversation;
  },
  downloadSharedAnalysis(tenantId: string, id: string, format: ArtifactDownloadFormat, artifactId?: string) {
    return apiClient.get<Blob>(`/tenants/${tenantId}/ai/shares/${id}/${format}`, {
      responseType: 'blob',
      params: { artifactId }
    });
  },
  async listSavedAnalyses(tenantId: string, cursor?: SavedAnalysisReference, signal?: AbortSignal) {
    const response = await apiClient.get(`/tenants/${tenantId}/ai/analyses`, { params: cursor, signal });
    return unwrap<{ items: SavedAnalysis[]; nextCursor?: SavedAnalysisReference }>(response.data);
  },
  async saveAnalysis(tenantId: string, reference: SavedAnalysisReference) {
    const response = await apiClient.put(savedAnalysisPath(tenantId, reference));
    return unwrap<SavedAnalysis>(response.data);
  },
  async removeSavedAnalysis(tenantId: string, reference: SavedAnalysisReference) {
    await apiClient.delete(savedAnalysisPath(tenantId, reference));
  },
  updateArtifactVersion,
  async rewriteArtifactSection(
    tenantId: string,
    conversationId: string,
    artifactId: string,
    change: { expectedVersion: number; section: number; text: string; instruction: string }
  ) {
    const response = await apiClient.post(artifactPath(tenantId, conversationId, artifactId) + '/rewrite', change);
    return unwrap<{ text: string }>(response.data).text;
  },
  getArtifactVersion,
  downloadArtifact,
  async saveResponseFeedback(tenantId: string, conversationId: string, turnId: string, vote: ResponseFeedback) {
    await apiClient.put(`/tenants/${tenantId}/ai/conversations/${conversationId}/turns/${turnId}/feedback`, vote);
  },
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
