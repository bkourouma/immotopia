import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = { getStatus: vi.fn(), streamChat: vi.fn(), executeProposal: vi.fn() };
  return { default: service, copilotService: service };
});

import copilotService from '../../services/copilot-service';
import AssistantPage from '../../pages/assistant/AssistantPage';

const getStatus = vi.mocked(copilotService.getStatus);
const streamChat = vi.mocked(copilotService.streamChat);

const ENABLED: CopilotStatus = {
  enabled: true,
  provider: 'fake',
  tools: ['search_properties', 'search_leases'],
  limits: { maxMessages: 20, maxMessageChars: 2000 }
};
const DISABLED: CopilotStatus = { ...ENABLED, enabled: false, tools: [] };

const w = window as unknown as Record<string, unknown>;

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/tenant/t1/assistant']}>
        <Routes>
          <Route path="/tenant/:tenantId/assistant" element={<AssistantPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  streamChat.mockImplementation(async (_t, _r, opts) => {
    opts.onEvent({ type: 'text_delta', text: 'Réponse' });
    opts.onEvent({ type: 'done', reason: 'end_turn' });
  });
});
afterEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});

describe('AssistantPage', () => {
  it('affiche le fil, la saisie et l’emplacement de l’artefact', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    expect(await screen.findByLabelText('Votre message')).toBeInTheDocument();
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });

  it('annonce que l’assistant est désactivé et n’affiche pas de saisie', async () => {
    getStatus.mockResolvedValue(DISABLED);
    renderPage();
    expect(await screen.findByText("L'assistant n'est pas activé pour cette agence.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument();
  });

  it('envoie le message avec Entrée et vide la zone', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.change(input, { target: { value: 'Montre les biens' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat.mock.calls[0][0]).toBe('t1');
    expect(JSON.stringify(streamChat.mock.calls[0][1])).toContain('Montre les biens');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('n’envoie pas avec Maj+Entrée (saut de ligne)', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.change(input, { target: { value: 'ligne 1' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(streamChat).not.toHaveBeenCalled();
    expect(input).toHaveValue('ligne 1');
  });

  it('masque le bouton de dictée si le navigateur n’a pas l’API', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    await screen.findByLabelText('Votre message');
    expect(screen.queryByRole('button', { name: 'Dicter un message' })).not.toBeInTheDocument();
  });

  it('dicte du texte dans la zone sans l’envoyer', async () => {
    class Fake {
      static last: Fake;
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        Fake.last = this;
      }
    }
    w.SpeechRecognition = Fake;
    getStatus.mockResolvedValue(ENABLED);
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.click(screen.getByRole('button', { name: 'Dicter un message' }));
    expect(await screen.findByRole('button', { name: 'Arrêter la dictée' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Écoute en cours…')).toBeInTheDocument();

    const final = Object.assign([{ transcript: 'bonjour' }], { isFinal: true });
    Fake.last.onresult?.({ resultIndex: 0, results: [final] });
    await waitFor(() => expect(input).toHaveValue('bonjour'));
    expect(streamChat).not.toHaveBeenCalled();
  });
});
