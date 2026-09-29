import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionProposal, CopilotSseEvent } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = { getStatus: vi.fn(), streamChat: vi.fn(), executeProposal: vi.fn() };
  return { default: service, copilotService: service };
});

import copilotService from '../../services/copilot-service';
import { useCopilotChat } from '../../hooks/useCopilotChat';

const streamChat = vi.mocked(copilotService.streamChat);
const executeProposal = vi.mocked(copilotService.executeProposal);

const proposal: ActionProposal = {
  proposalId: 'p1',
  token: 'jeton-secret',
  expiresAt: '2030-01-01T00:00:00Z',
  action: 'GENERATE_RENTAL_DOCUMENT',
  documentType: 'RENT_RECEIPT',
  summary: {
    leaseId: 'l1',
    leaseNumber: 'B-1',
    propertyLabel: 'Villa',
    renterName: null,
    periodLabel: 'mars 2026',
    amount: '1000',
    currency: 'EUR'
  }
};

function script(events: CopilotSseEvent[]) {
  streamChat.mockImplementation(async (_t, _r, opts) => {
    events.forEach(e => opts.onEvent(e));
  });
}

async function withProposal() {
  script([
    { type: 'meta', conversationId: 'c1', requestId: 'r1' },
    { type: 'text_delta', text: 'Voici' },
    { type: 'action_proposal', proposal },
    { type: 'done', reason: 'end_turn' }
  ]);
  const hook = renderHook(() => useCopilotChat('t1'));
  await act(async () => {
    await hook.result.current.send('quittance', {});
  });
  return hook;
}

const proposalOf = (r: { current: ReturnType<typeof useCopilotChat> }) => {
  const a = r.current.messages[1].attachments[0];
  if (a.kind !== 'proposal') throw new Error('pas une proposition');
  return a;
};

beforeEach(() => vi.clearAllMocks());

describe('useCopilotChat', () => {
  it('accumule texte et pièces jointes et renvoie le contexte', async () => {
    script([
      { type: 'meta', conversationId: 'c1', requestId: 'r1' },
      { type: 'text_delta', text: 'Bon' },
      { type: 'text_delta', text: 'jour' },
      { type: 'property_results', items: [], total: 0 },
      { type: 'done', reason: 'end_turn' }
    ]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('salut', { currentPath: '/x' });
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.messages.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(result.current.messages[1].text).toBe('Bonjour');
    expect(result.current.messages[1].attachments).toEqual([{ kind: 'properties', items: [], total: 0 }]);
    expect(streamChat.mock.calls[0][1]).toMatchObject({
      messages: [{ role: 'user', content: 'salut' }],
      context: { currentPath: '/x' }
    });

    // Second tour : historique et conversationId renvoyés.
    await act(async () => {
      await result.current.send('encore', {});
    });
    expect(streamChat.mock.calls[1][1]).toMatchObject({
      conversationId: 'c1',
      messages: [
        { role: 'user', content: 'salut' },
        { role: 'assistant', content: 'Bonjour' },
        { role: 'user', content: 'encore' }
      ]
    });
  });

  it('passe en erreur sur un événement error du flux', async () => {
    script([{ type: 'error', code: 'RATE_LIMITED', message: 'Trop vite', retryable: true }]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('a', {});
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toEqual({ code: 'RATE_LIMITED', message: 'Trop vite' });
  });

  it('passe en erreur sur un échec avant le flux', async () => {
    streamChat.mockRejectedValue({ status: 503, code: 'AI_DISABLED', message: 'Désactivé' });
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('a', {});
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('AI_DISABLED');
  });

  it('stop() abandonne le flux sans erreur', async () => {
    streamChat.mockImplementation(
      (_t, _r, opts) =>
        new Promise((_res, rej) => {
          opts.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
        })
    );
    const { result } = renderHook(() => useCopilotChat('t1'));
    let p: Promise<void>;
    act(() => {
      p = result.current.send('a', {});
    });
    await waitFor(() => expect(result.current.status).toBe('streaming'));
    act(() => result.current.stop());
    await act(async () => {
      await p;
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeUndefined();
  });

  it('confirmProposal exécute avec le jeton puis passe à confirmed', async () => {
    const { result } = await withProposal();
    expect(proposalOf(result).state).toBe('pending');
    const payload = { proposalId: 'p1', alreadyExisted: false, document: { id: 'd1' } } as never;
    executeProposal.mockResolvedValue(payload);
    await act(async () => {
      await result.current.confirmProposal('p1');
    });
    expect(executeProposal).toHaveBeenCalledWith('t1', 'jeton-secret');
    expect(proposalOf(result)).toMatchObject({ state: 'confirmed', result: payload });

    // Une seconde confirmation est sans effet.
    await act(async () => {
      await result.current.confirmProposal('p1');
    });
    expect(executeProposal).toHaveBeenCalledTimes(1);
  });

  it('cancelProposal annule sans appel réseau', async () => {
    const { result } = await withProposal();
    act(() => result.current.cancelProposal('p1'));
    expect(proposalOf(result).state).toBe('cancelled');
    expect(executeProposal).not.toHaveBeenCalled();
  });

  it.each([
    ['PROPOSAL_EXPIRED', 'expired', 'Cette proposition a expiré. Demandez-la de nouveau.'],
    ['PROPOSAL_INVALID', 'failed', "Cette proposition n'est plus valide."],
    ['PROPOSAL_ALREADY_USED', 'failed', 'Cette proposition a déjà été utilisée.']
  ])('erreur %s -> %s avec message traduit', async (code, state, message) => {
    const { result } = await withProposal();
    executeProposal.mockRejectedValue({ response: { status: 409, data: { code, message: 'brut serveur' } } });
    await act(async () => {
      await result.current.confirmProposal('p1');
    });
    expect(proposalOf(result)).toMatchObject({ state, error: { code, message } });
  });

  it('reset vide la conversation', async () => {
    const { result } = await withProposal();
    act(() => result.current.reset());
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it("borne l'historique envoyé à 24 000 caractères en gardant le dernier message", async () => {
    const chunk = 'a'.repeat(4000);
    const { result } = renderHook(() => useCopilotChat('t1'));
    for (let i = 0; i < 4; i++) {
      script([
        { type: 'text_delta', text: chunk },
        { type: 'done', reason: 'end_turn' }
      ]);
      await act(async () => {
        await result.current.send(`${i}${chunk.slice(1)}`, {});
      });
    }
    script([{ type: 'done', reason: 'end_turn' }]);
    await act(async () => {
      await result.current.send('dernier', {});
    });
    const sent = streamChat.mock.calls[4][1].messages;
    expect(sent.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(24000);
    expect(sent[sent.length - 1]).toEqual({ role: 'user', content: 'dernier' });
    expect(sent[0].role).toBe('user');
    expect(sent.length).toBeLessThan(9);
  });

  it("un flux annulé par reset n'écrase pas le statut du nouveau flux", async () => {
    let releaseFirst: () => void = () => undefined;
    streamChat.mockImplementationOnce(
      (_t, _r, opts) =>
        new Promise<void>(resolve => {
          releaseFirst = () => resolve();
          opts.signal?.addEventListener('abort', () => resolve());
        })
    );
    const { result } = renderHook(() => useCopilotChat('t1'));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.send('un', {});
    });
    act(() => result.current.reset());

    let releaseSecond: () => void = () => undefined;
    streamChat.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          releaseSecond = () => resolve();
        })
    );
    let second: Promise<void> = Promise.resolve();
    act(() => {
      second = result.current.send('deux', {});
    });
    await act(async () => {
      releaseFirst();
      await first;
    });
    expect(result.current.status).toBe('streaming');
    await act(async () => {
      releaseSecond();
      await second;
    });
  });

  it("signale une erreur quand le flux s'arrête sans événement done", async () => {
    script([{ type: 'text_delta', text: 'Bon' }]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('salut', {});
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('La réponse a été interrompue.');
  });

  it("n'y voit pas une erreur quand l'utilisateur arrête le flux", async () => {
    streamChat.mockImplementation(
      (_t, _r, opts) =>
        new Promise<void>(resolve => {
          opts.signal?.addEventListener('abort', () => resolve());
        })
    );
    const { result } = renderHook(() => useCopilotChat('t1'));
    let p: Promise<void> = Promise.resolve();
    act(() => {
      p = result.current.send('salut', {});
    });
    await act(async () => {
      result.current.stop();
      await p;
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeUndefined();
  });
});
