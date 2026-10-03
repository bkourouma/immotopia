import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityExecutedPayload, CopilotSseEvent, WritePlan } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = { getStatus: vi.fn(), streamChat: vi.fn(), executeProposal: vi.fn(), executeAction: vi.fn() };
  return { default: service, copilotService: service };
});

import copilotService from '../../services/copilot-service';
import { useCopilotChat } from '../../hooks/useCopilotChat';

const streamChat = vi.mocked(copilotService.streamChat);
const executeAction = vi.mocked(copilotService.executeAction);

function makePlan(over: Partial<WritePlan> = {}): WritePlan {
  return {
    proposalId: 'wp1',
    token: 'jeton-plan',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    action: 'EXECUTE_CAPABILITY',
    capabilityId: 'PATCH /contacts/:id',
    method: 'PATCH',
    module: 'CRM',
    title: 'Mettre à jour',
    steps: ['a'],
    recordKind: 'update',
    target: { label: 'Awa', resolved: true },
    changes: [{ field: 'phone', before: '1', after: '2' }],
    warnings: [],
    sensitive: false,
    requiresTypedConfirmation: false,
    ...over
  };
}

const ok: CapabilityExecutedPayload = {
  kind: 'capability',
  proposalId: 'wp1',
  ok: true,
  status: 200,
  message: 'Fait.',
  resultPreview: { id: 1 }
};

async function withPlan(plan: WritePlan = makePlan()) {
  const events: CopilotSseEvent[] = [
    { type: 'meta', conversationId: 'c1', requestId: 'r1' },
    { type: 'write_plan', plan },
    { type: 'done', reason: 'end_turn' }
  ];
  streamChat.mockImplementation(async (_t, _r, opts) => {
    events.forEach(e => opts.onEvent(e));
  });
  const hook = renderHook(() => useCopilotChat('t1'));
  await act(async () => {
    await hook.result.current.send('modifie', {});
  });
  return hook;
}

const planOf = (r: { current: ReturnType<typeof useCopilotChat> }) => {
  const a = r.current.messages[1].attachments[0];
  if (a.kind !== 'write_plan') throw new Error('pas un plan');
  return a;
};

beforeEach(() => vi.clearAllMocks());

describe("useCopilotChat : plan d'écriture", () => {
  it('un plan reçu devient un élément du fil, en attente', async () => {
    const { result } = await withPlan();
    expect(planOf(result)).toMatchObject({ state: 'pending', plan: { proposalId: 'wp1' } });
  });

  it('ignore un plan mal formé', async () => {
    const { result } = await withPlan({ ...makePlan(), token: '' });
    expect(result.current.messages[1].attachments).toEqual([]);
  });

  it('approuve avec le jeton puis passe à executed', async () => {
    const { result } = await withPlan();
    executeAction.mockResolvedValue(ok);
    await act(async () => {
      await result.current.approveWritePlan('wp1');
    });
    expect(executeAction).toHaveBeenCalledWith('t1', 'jeton-plan', undefined);
    expect(planOf(result)).toMatchObject({ state: 'executed', result: ok });
    expect(planOf(result).decidedAt).toBeTruthy();
    // Déjà décidé : sans effet.
    await act(async () => {
      await result.current.approveWritePlan('wp1');
    });
    expect(executeAction).toHaveBeenCalledTimes(1);
  });

  it('double envoi : un seul appel serveur', async () => {
    const { result } = await withPlan();
    let release: (v: CapabilityExecutedPayload) => void = () => undefined;
    executeAction.mockReturnValue(new Promise(r => (release = r)));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.approveWritePlan('wp1');
      second = result.current.approveWritePlan('wp1');
    });
    expect(planOf(result).state).toBe('approving');
    await act(async () => {
      release(ok);
      await Promise.all([first, second]);
    });
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(planOf(result).state).toBe('executed');
  });

  it('plan sensible : refuse sans le bon mot, envoie la confirmation sinon', async () => {
    const { result } = await withPlan(
      makePlan({ sensitive: true, requiresTypedConfirmation: true, confirmationWord: 'CONFIRMER' })
    );
    executeAction.mockResolvedValue(ok);
    await act(async () => {
      await result.current.approveWritePlan('wp1', 'oups');
    });
    expect(executeAction).not.toHaveBeenCalled();
    expect(planOf(result).state).toBe('pending');
    await act(async () => {
      await result.current.approveWritePlan('wp1', 'CONFIRMER');
    });
    expect(executeAction).toHaveBeenCalledWith('t1', 'jeton-plan', 'CONFIRMER');
  });

  it('refuser : aucun appel serveur, état refusé, le chat continue', async () => {
    const { result } = await withPlan();
    act(() => result.current.refuseWritePlan('wp1'));
    expect(planOf(result)).toMatchObject({ state: 'refused' });
    expect(executeAction).not.toHaveBeenCalled();
    streamChat.mockImplementation(async (_t, req, opts) => {
      // Le refus n'entre pas dans l'historique : l'assistant n'en est pas informé.
      expect(JSON.stringify(req.messages)).not.toMatch(/refus/i);
      opts.onEvent({ type: 'done', reason: 'end_turn' });
    });
    await act(async () => {
      await result.current.send('autre chose', {});
    });
    expect(result.current.status).toBe('idle');
  });

  it('ok:false : état failed avec le message du serveur', async () => {
    const { result } = await withPlan();
    executeAction.mockResolvedValue({ ...ok, ok: false, status: 422, message: 'Téléphone invalide.' });
    await act(async () => {
      await result.current.approveWritePlan('wp1');
    });
    expect(planOf(result)).toMatchObject({ state: 'failed', error: { message: 'Téléphone invalide.' } });
  });

  it.each([
    ['PROPOSAL_EXPIRED', 'expired', 'Cette proposition a expiré. Demandez-la de nouveau.'],
    ['PROPOSAL_ALREADY_USED', 'failed', 'Cette proposition a déjà été utilisée.']
  ])('erreur %s -> %s', async (code, state, message) => {
    const { result } = await withPlan();
    executeAction.mockRejectedValue({ response: { status: 409, data: { code, message: 'brut' } } });
    await act(async () => {
      await result.current.approveWritePlan('wp1');
    });
    expect(planOf(result)).toMatchObject({ state, error: { code, message } });
  });

  it("erreur réseau : échec explicite, sans promettre que rien n'a changé", async () => {
    const { result } = await withPlan();
    executeAction.mockRejectedValue(new Error('Network Error'));
    await act(async () => {
      await result.current.approveWritePlan('wp1');
    });
    const a = planOf(result);
    expect(a.state).toBe('failed');
    expect(a.error?.message).toMatch(/vérifiez/);
  });

  it("plan expiré côté horloge : pas d'appel, état expired", async () => {
    const { result } = await withPlan(makePlan({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    await act(async () => {
      await result.current.approveWritePlan('wp1');
    });
    expect(executeAction).not.toHaveBeenCalled();
    expect(planOf(result).state).toBe('expired');
  });

  it('la génération de documents existante reste inchangée', async () => {
    const proposal = {
      proposalId: 'p1',
      token: 'jeton-doc',
      expiresAt: '2030-01-01T00:00:00Z',
      action: 'GENERATE_RENTAL_DOCUMENT',
      documentType: 'RENT_RECEIPT',
      summary: {
        leaseId: 'l',
        leaseNumber: 'B',
        propertyLabel: 'V',
        renterName: null,
        periodLabel: 'm',
        amount: '1',
        currency: 'EUR'
      }
    } as const;
    streamChat.mockImplementation(async (_t, _r, opts) => {
      opts.onEvent({ type: 'action_proposal', proposal });
      opts.onEvent({ type: 'done', reason: 'end_turn' });
    });
    vi.mocked(copilotService.executeProposal).mockResolvedValue({ proposalId: 'p1', alreadyExisted: false } as never);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('quittance', {});
    });
    await act(async () => {
      await result.current.confirmProposal('p1');
    });
    expect(copilotService.executeProposal).toHaveBeenCalledWith('t1', 'jeton-doc');
    expect(executeAction).not.toHaveBeenCalled();
  });
});
