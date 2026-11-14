import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CopilotRoot from '../../components/copilot/CopilotRoot';
import { requestCopilotOpen } from '../../help/copilot-bridge';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = { getStatus: vi.fn(), streamChat: vi.fn(), executeProposal: vi.fn() };
  return { default: service, copilotService: service };
});

import copilotService from '../../services/copilot-service';

const getStatus = vi.mocked(copilotService.getStatus);
const streamChat = vi.mocked(copilotService.streamChat);

const TENANT = 'tenant-1';
const ENABLED: CopilotStatus = {
  enabled: true,
  provider: 'fake',
  tools: ['search_properties'],
  limits: { maxMessages: 20, maxMessageChars: 2000 }
};
const DISABLED: CopilotStatus = { ...ENABLED, enabled: false, tools: [] };
const BUTTON = { name: "Ouvrir l'assistant" };

function renderRoot(path = `/tenant/${TENANT}/dashboard`) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <main id="main">{path.endsWith('/assistant') && <textarea aria-label="Votre message" />}</main>
        <CopilotRoot tenantId={TENANT} />
      </MemoryRouter>
    </LanguageProvider>
  );
}

/** Renvoie la demande tant que l'écouteur n'est pas posé (effet passif). */
async function emit(request: Parameters<typeof requestCopilotOpen>[0]) {
  const listener = vi.fn();
  window.addEventListener('immotopia:copilot-open', listener);
  await waitFor(
    () => {
      // Sans écouteur de CopilotRoot, le tiroir ne s'ouvre pas : on réessaie.
      act(() => requestCopilotOpen(request));
      expect(document.querySelector('.ant-drawer')).not.toBeNull();
    },
    { timeout: 8000 }
  );
  window.removeEventListener('immotopia:copilot-open', listener);
}

beforeEach(() => {
  vi.clearAllMocks();
  streamChat.mockImplementation(async (_t, _r, opts) => {
    opts.onEvent({ type: 'text_delta', text: 'Réponse' });
    opts.onEvent({ type: 'done', reason: 'end_turn' });
  });
});

describe('CopilotRoot — pont depuis l’aide', () => {
  it('ouvre le tiroir avec la question pré-remplie, sans l’envoyer', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    await screen.findByRole('button', BUTTON);
    await emit({ draft: 'Comment créer un bail ?', helpId: 'locatif.baux.liste', helpExcerpt: 'Texte' });
    const input = (await screen.findByLabelText('Votre message')) as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toBe('Comment créer un bail ?'));
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('n’écoute rien quand l’assistant est désactivé', async () => {
    getStatus.mockResolvedValue(DISABLED);
    renderRoot();
    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    act(() => requestCopilotOpen({ draft: 'Question' }));
    await new Promise(r => setTimeout(r, 50));
    expect(document.querySelector('.ant-drawer')).toBeNull();
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
  });

  it('sur la page assistant, n’ouvre aucun tiroir et met le focus dans la saisie', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot(`/tenant/${TENANT}/assistant`);
    await waitFor(() => {
      act(() => requestCopilotOpen({ draft: 'Question' }));
      expect(screen.getByLabelText('Votre message')).toHaveFocus();
    });
    expect(document.querySelector('.ant-drawer')).toBeNull();
  });

  it('transmet helpId et helpExcerpt (tronqué à 4000) puis les efface après « Nouvelle conversation »', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    await screen.findByRole('button', BUTTON);
    await emit({ draft: 'Question A', helpId: 'locatif.baux.liste', helpExcerpt: 'x'.repeat(5000) });
    const input = (await screen.findByLabelText('Votre message')) as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toBe('Question A'));

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    const first = streamChat.mock.calls[0][1].context;
    expect(first?.helpId).toBe('locatif.baux.liste');
    expect(first?.helpExcerpt).toHaveLength(4000);
    expect(first?.currentPath).toBe(`/tenant/${TENANT}/dashboard`);

    await screen.findByText('Réponse');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nouvelle conversation' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    fireEvent.change(input, { target: { value: 'Question B' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(2), { timeout: 5000 });
    const second = streamChat.mock.calls[1][1].context;
    expect(second?.helpId).toBeUndefined();
    expect(second?.helpExcerpt).toBeUndefined();
  });
});
