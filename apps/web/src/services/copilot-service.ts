import apiClient from '../utils/api-client';
import { postEventStream } from '../utils/event-stream';
import type { ActionExecutedPayload, ChatRequest, CopilotSseEvent, CopilotStatus } from '../types/copilot';

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
  } catch {
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
  opts: { signal?: AbortSignal; onEvent(e: CopilotSseEvent): void }
): Promise<void> {
  await postEventStream(`/tenants/${tenantId}/ai/chat`, request, {
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

/** Confirme une proposition : le serveur rejoue auth, permission et jeton. */
async function executeProposal(tenantId: string, proposalToken: string): Promise<ActionExecutedPayload> {
  const response = await apiClient.post(`/tenants/${tenantId}/ai/actions/execute`, { proposalToken });
  return unwrap<ActionExecutedPayload>(response.data);
}

export const copilotService = { getStatus, streamChat, executeProposal };
export default copilotService;
