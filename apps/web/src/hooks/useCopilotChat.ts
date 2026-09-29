import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';
import copilotService from '../services/copilot-service';
import {
  COPILOT_MAX_MESSAGES,
  COPILOT_MAX_MESSAGE_CHARS,
  type CopilotAttachment,
  type CopilotChatStatus,
  type CopilotPageContext,
  type CopilotProposalState,
  type CopilotSseEvent,
  type CopilotUiMessage,
  type UseCopilotChatResult
} from '../types/copilot';

type ChatError = { code: string; message: string };

/** Texte affiché pour les erreurs de proposition (le texte français est la clé). */
function proposalErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'PROPOSAL_EXPIRED':
      return t('Cette proposition a expiré. Demandez-la de nouveau.');
    case 'PROPOSAL_INVALID':
      return t("Cette proposition n'est plus valide.");
    case 'PROPOSAL_ALREADY_USED':
      return t('Cette proposition a déjà été utilisée.');
    default:
      return fallback || t("L'action n'a pas pu être effectuée.");
  }
}

/** Normalise une erreur `{status, code, message}`, axios ou réseau. */
function toChatError(err: unknown): ChatError {
  const e = (err ?? {}) as {
    status?: number;
    code?: string;
    message?: string;
    response?: { data?: { code?: string; message?: string } };
  };
  const data = e.response?.data;
  const code = data?.code ?? (typeof e.code === 'string' ? e.code : 'INTERNAL');
  // `{status, code, message}` de postEventStream : message déjà lisible ;
  // erreur réseau brute (« Network Error ») : message générique traduit.
  const message = data?.message ?? (typeof e.status === 'number' ? e.message : undefined);
  if (code.startsWith('PROPOSAL_')) return { code, message: proposalErrorMessage(code, undefined) };
  return { code, message: message || t("L'assistant est indisponible pour le moment.") };
}

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err as { name?: string })?.name === 'AbortError';
}

let idCounter = 0;
const nextId = () => `copilot-msg-${++idCounter}`;

/**
 * État d'une conversation ImmoCopilot. Rien n'est stocké dans le navigateur :
 * la conversation vit en mémoire et disparaît au rechargement.
 */
export function useCopilotChat(tenantId: string): UseCopilotChatResult {
  const [messages, setMessages] = useState<CopilotUiMessage[]>([]);
  const [status, setStatus] = useState<CopilotChatStatus>('idle');
  const [error, setError] = useState<ChatError | undefined>();

  const messagesRef = useRef<CopilotUiMessage[]>([]);
  messagesRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const streamingRef = useRef(false);

  const updateMessage = useCallback((id: string, fn: (m: CopilotUiMessage) => CopilotUiMessage) => {
    setMessages(prev => prev.map(m => (m.id === id ? fn(m) : m)));
  }, []);

  const setProposalState = useCallback(
    (
      proposalId: string,
      state: CopilotProposalState,
      extra?: Partial<Extract<CopilotAttachment, { kind: 'proposal' }>>
    ) => {
      setMessages(prev =>
        prev.map(m => ({
          ...m,
          attachments: m.attachments.map(a =>
            a.kind === 'proposal' && a.proposal.proposalId === proposalId ? { ...a, ...extra, state } : a
          )
        }))
      );
    },
    []
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    conversationIdRef.current = undefined;
    setMessages([]);
    setStatus('idle');
    setError(undefined);
  }, []);

  // Changement d'agence : on repart d'une conversation vide. Démontage : on coupe le flux.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  const previousTenant = useRef(tenantId);
  useEffect(() => {
    if (previousTenant.current !== tenantId) {
      previousTenant.current = tenantId;
      reset();
    }
  }, [tenantId, reset]);

  const send = useCallback(
    async (text: string, ctx: CopilotPageContext): Promise<void> => {
      const content = text.trim();
      if (!content || streamingRef.current) return;

      const userMessage: CopilotUiMessage = { id: nextId(), role: 'user', text: content, attachments: [] };
      const assistantId = nextId();
      const assistantMessage: CopilotUiMessage = { id: assistantId, role: 'assistant', text: '', attachments: [] };

      const history = [...messagesRef.current, userMessage]
        .filter(m => m.text.trim() !== '')
        .slice(-COPILOT_MAX_MESSAGES)
        .map(m => ({ role: m.role, content: m.text.slice(0, COPILOT_MAX_MESSAGE_CHARS) }));

      streamingRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setStatus('streaming');
      setError(undefined);

      let failed: ChatError | undefined;
      const addAttachment = (a: CopilotAttachment) =>
        updateMessage(assistantId, m => ({ ...m, attachments: [...m.attachments, a] }));

      const onEvent = (e: CopilotSseEvent) => {
        switch (e.type) {
          case 'meta':
            conversationIdRef.current = e.conversationId;
            break;
          case 'text_delta':
            updateMessage(assistantId, m => ({ ...m, text: m.text + e.text }));
            break;
          case 'property_results':
            addAttachment({ kind: 'properties', items: e.items, total: e.total });
            break;
          case 'lease_results':
            addAttachment({ kind: 'leases', items: e.items });
            break;
          case 'document_list':
            addAttachment({ kind: 'documents', scope: e.scope, items: e.items });
            break;
          case 'action_proposal':
            addAttachment({ kind: 'proposal', proposal: e.proposal, state: 'pending' });
            break;
          case 'error':
            failed = { code: e.code, message: e.message };
            break;
          default:
            break; // tool_status, done : rien à conserver
        }
      };

      try {
        await copilotService.streamChat(
          tenantId,
          {
            conversationId: conversationIdRef.current,
            messages: history,
            context: ctx
          },
          { signal: controller.signal, onEvent }
        );
      } catch (err) {
        if (!isAbort(err, controller.signal)) failed = toChatError(err);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        streamingRef.current = false;
      }

      if (failed) {
        setError(failed);
        setStatus('error');
      } else {
        setStatus('idle');
      }
    },
    [tenantId, updateMessage]
  );

  const confirmProposal = useCallback(
    async (proposalId: string): Promise<void> => {
      let token: string | undefined;
      for (const m of messagesRef.current) {
        for (const a of m.attachments) {
          if (a.kind === 'proposal' && a.proposal.proposalId === proposalId && a.state === 'pending') {
            token = a.proposal.token;
          }
        }
      }
      if (!token) return;

      setProposalState(proposalId, 'confirming');
      try {
        const result = await copilotService.executeProposal(tenantId, token);
        setProposalState(proposalId, 'confirmed', { result, error: undefined });
      } catch (err) {
        const e = toChatError(err);
        const state: CopilotProposalState = e.code === 'PROPOSAL_EXPIRED' ? 'expired' : 'failed';
        setProposalState(proposalId, state, { error: e });
      }
    },
    [tenantId, setProposalState]
  );

  const cancelProposal = useCallback(
    (proposalId: string): void => {
      const pending = messagesRef.current.some(m =>
        m.attachments.some(a => a.kind === 'proposal' && a.proposal.proposalId === proposalId && a.state === 'pending')
      );
      if (pending) setProposalState(proposalId, 'cancelled');
    },
    [setProposalState]
  );

  return { messages, status, error, send, stop, confirmProposal, cancelProposal, reset };
}

export default useCopilotChat;
