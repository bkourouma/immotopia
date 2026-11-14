import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = {
    getStatus: vi.fn(),
    streamChat: vi.fn(),
    executeProposal: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ items: [] }),
    getConversation: vi.fn(),
    downloadAttachment: vi.fn(),
    transcribe: vi.fn()
  };
  return { default: service, copilotService: service };
});

vi.mock('../../services/dashboard-service', () => ({
  getTenantDashboard: vi.fn().mockResolvedValue({ data: { workQueue: [] } })
}));

vi.mock('../../utils/save-blob', async importOriginal => ({
  ...(await importOriginal<typeof import('../../utils/save-blob')>()),
  saveBlob: vi.fn()
}));
import { saveBlob } from '../../utils/save-blob';
import copilotService from '../../services/copilot-service';
import AssistantPage, { pageHeight, unavailableMessage } from '../../pages/assistant/AssistantPage';

const getStatus = vi.mocked(copilotService.getStatus);
const streamChat = vi.mocked(copilotService.streamChat);
const getConversation = vi.mocked(copilotService.getConversation);

const ENABLED: CopilotStatus = {
  enabled: true,
  provider: 'fake',
  tools: ['search_properties', 'search_leases'],
  limits: { maxMessages: 20, maxMessageChars: 2000 }
};
const DISABLED: CopilotStatus = { ...ENABLED, enabled: false, tools: [] };

const w = window as unknown as Record<string, unknown>;

function renderPage(path = '/tenant/t1/assistant') {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
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

const ARTIFACT_EVENT = {
  type: 'artifact' as const,
  artifact: {
    kind: 'markdown' as const,
    id: 'a1',
    title: 'Synthèse du mois',
    content: 'Contenu **important**'
  }
};

function setDesktop(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: desktop && /min-width/.test(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  });
}

describe('AssistantPage — artefacts', () => {
  afterEach(() => setDesktop(false));

  async function sendWithArtifact() {
    getStatus.mockResolvedValue(ENABLED);
    streamChat.mockImplementation(async (_t, _r, opts) => {
      opts.onEvent({ type: 'text_delta', text: 'Voilà' });
      opts.onEvent(ARTIFACT_EVENT);
      opts.onEvent({ type: 'done', reason: 'end_turn' });
    });
    renderPage();
    const input = await screen.findByLabelText('Votre message');
    fireEvent.change(input, { target: { value: 'synthèse' } });
    fireEvent.keyDown(input, { key: 'Enter' });
  }

  it('ordinateur : le panneau apparaît seul et peut être refermé', async () => {
    setDesktop(true);
    await sendWithArtifact();
    const panel = await screen.findByRole('complementary', { name: 'Résultats et documents' });
    expect(within(panel).getByText('important')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Fermer le panneau' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir : Synthèse du mois' }));
    expect(await screen.findByRole('complementary')).toBeInTheDocument();
  });

  it('mobile : le panneau reste replié, la pastille ouvre un tiroir', async () => {
    setDesktop(false);
    await sendWithArtifact();
    const chip = await screen.findByRole('button', { name: 'Ouvrir : Synthèse du mois' });
    expect(screen.queryByText('important')).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(await screen.findByText('important')).toBeInTheDocument();
  });
});

describe('AssistantPage', () => {
  it('joint un classeur et peut envoyer le message sans saisie', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const { container } = renderPage();
    const attach = await screen.findByRole('button', { name: 'Joindre des fichiers' });
    expect(attach).toBeEnabled();
    const picker = container.querySelector('input[type=file]')!;
    const file = new File(['workbook'], 'loyers.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(screen.getByRole('button', { name: 'Retirer loyers.xlsx' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat.mock.calls[0][1].messages).toEqual([{ role: 'user', content: 'Analyse les fichiers joints.' }]);
    expect(streamChat.mock.calls[0][2].files).toEqual([file]);
    expect(await screen.findByText('loyers.xlsx')).toBeVisible();
  });

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

  it('utilise la transcription serveur et laisse le texte dans le brouillon', async () => {
    const stopTrack = vi.fn();
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported() {
          return true;
        }
        state = 'inactive';
        mimeType = 'audio/webm;codecs=opus';
        ondataavailable?: (event: { data: Blob }) => void;
        onstop?: () => void;
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['audio']) });
          this.onstop?.();
        }
      }
    );
    const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) }
    });
    try {
      getStatus.mockResolvedValue({ ...ENABLED, transcription: true });
      vi.mocked(copilotService.transcribe).mockResolvedValue('Bilan des loyers');
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Dicter un message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Arrêter la dictée' }));
      await waitFor(() => expect(screen.getByLabelText('Votre message')).toHaveValue('Bilan des loyers'));
      expect(copilotService.transcribe).toHaveBeenCalledWith('t1', expect.any(Blob), expect.any(AbortSignal));
      expect(stopTrack).toHaveBeenCalled();
      expect(streamChat).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (original) Object.defineProperty(navigator, 'mediaDevices', original);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
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

it('rouvre le fil et ses artefacts depuis le lien de conversation', async () => {
  getStatus.mockResolvedValue(ENABLED);
  const id = '5258bdd1-74d6-47ea-a37f-ab4d1e8eae45';
  getConversation.mockResolvedValue({
    id,
    title: 'Analyse',
    pinned: false,
    archived: false,
    updatedAt: '2026-11-14T12:00:00Z',
    turns: [
      {
        id: 'tour-1',
        question: 'Bilan du mois',
        attachments: [{ name: 'bilan.pdf', position: 0 }],
        response: 'Voici le bilan.',
        result: [ARTIFACT_EVENT],
        outcome: 'end_turn'
      }
    ]
  });
  renderPage(`/tenant/t1/assistant?c=${id}`);
  expect(await screen.findByText('Voici le bilan.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ouvrir : Synthèse du mois' })).toBeInTheDocument();
  expect(getConversation).toHaveBeenCalledWith('t1', id);
  const file = new Blob(['bilan']);
  vi.mocked(copilotService.downloadAttachment).mockResolvedValue({
    data: file,
    headers: { 'content-disposition': 'attachment; filename="bilan.pdf"' }
  } as Awaited<ReturnType<typeof copilotService.downloadAttachment>>);
  fireEvent.click(screen.getByRole('button', { name: 'bilan.pdf' }));
  await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(file, 'bilan.pdf'));
  expect(copilotService.downloadAttachment).toHaveBeenCalledWith('t1', id, 'tour-1', 0);
});

describe('AssistantPage — hauteur', () => {
  it('retranche la barre d’onglets au lieu de l’ajouter (bas parenthésé)', () => {
    expect(pageHeight(true)).toBe(
      'calc(100dvh - 64px - var(--page-padding) - (var(--control-h-lg) + var(--space-6) + env(safe-area-inset-bottom, 0px)))'
    );
    expect(pageHeight(false)).toBe('calc(100dvh - 64px - var(--page-padding) - var(--page-padding))');
  });
});

describe('AssistantPage — messages d’accès', () => {
  it('désactivé pour l’agence', () => {
    expect(unavailableMessage(DISABLED, true).title).toBe("L'assistant n'est pas activé pour cette agence.");
    expect(unavailableMessage({ ...DISABLED, reason: 'NOT_CONFIGURED' }, true).title).toBe(
      "L'assistant n'est pas activé pour cette agence."
    );
  });
  it('refusé pour ce compte (403)', () => {
    const m = unavailableMessage({ ...DISABLED, reason: 'FORBIDDEN' }, true);
    expect(m.title).toBe("L'assistant n'est pas disponible pour ce compte.");
    expect(m.subTitle).toMatch(/collaborateurs/);
  });
  it('aucune agence rattachée (pas d’identifiant ou 404)', () => {
    expect(unavailableMessage(null, false).title).toBe("Aucune agence n'est rattachée à cette page.");
    expect(unavailableMessage({ ...DISABLED, reason: 'NOT_FOUND' }, true).title).toBe(
      "Aucune agence n'est rattachée à cette page."
    );
  });
  it('la page affiche le message du refus', async () => {
    getStatus.mockResolvedValue({ ...DISABLED, reason: 'FORBIDDEN' });
    renderPage();
    expect(await screen.findByText("L'assistant n'est pas disponible pour ce compte.")).toBeInTheDocument();
    expect(screen.queryByText("L'assistant n'est pas activé pour cette agence.")).not.toBeInTheDocument();
  });
});
