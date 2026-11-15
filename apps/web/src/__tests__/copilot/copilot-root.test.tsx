import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { AppShell } from '../../components/shell/AppShell';
import CopilotRoot from '../../components/copilot/CopilotRoot';
import { selectAssistantLanguage } from '../../i18n/assistant-language';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { resetCopilotStatusCache } from '../../utils/copilot-status-cache';
import copilotService from '../../services/copilot-service';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => ({
  default: {
    getStatus: (tenantId: string) => {
      calls.push(tenantId);
      return statusImpl();
    },
    streamChat: vi.fn(),
    transcribe: vi.fn(),
    executeProposal: vi.fn()
  },
  copilotService: {}
}));

const TENANT = 'tenant-1';
const ENABLED: CopilotStatus = {
  enabled: true,
  provider: 'fake',
  tools: ['search_properties', 'search_leases'],
  limits: { maxMessages: 20, maxMessageChars: 2000 }
};
const DISABLED: CopilotStatus = {
  enabled: false,
  provider: null,
  tools: [],
  limits: { maxMessages: 0, maxMessageChars: 0 }
};

// Fonction simple plutôt que `vi.fn` : vitest garde la promesse rejetée dans
// `mock.results` et la signale comme rejet non géré.
const calls: string[] = [];
let statusImpl: () => Promise<CopilotStatus> = () => Promise.resolve(DISABLED);
const getStatus = {
  mockReset: () => {
    calls.length = 0;
    statusImpl = () => Promise.resolve(DISABLED);
  },
  mockResolvedValue: (v: CopilotStatus) => {
    statusImpl = () => Promise.resolve(v);
  },
  mockImplementation: (fn: () => Promise<CopilotStatus>) => {
    statusImpl = fn;
  }
};

const BUTTON = { name: "Ouvrir l'assistant" };

function renderRoot() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/tenant/${TENANT}/dashboard`]}>
        <CopilotRoot tenantId={TENANT} />
      </MemoryRouter>
    </LanguageProvider>
  );
}

function LaunchDestination() {
  const location = useLocation();
  return <output>{location.search || JSON.stringify(location.state)}</output>;
}

beforeEach(() => {
  resetCopilotStatusCache();
  getStatus.mockReset();
  vi.mocked(copilotService.streamChat).mockReset();
});

describe('CopilotRoot', () => {
  it.each([true, false])('transmet ou retire les filtres actifs à l’ouverture de la page (%s)', async keep => {
    getStatus.mockResolvedValue(ENABLED);
    const path = `/tenant/${TENANT}/rental/installments`;
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[path + '?status=PARTIAL&dueFrom=2026-10-01&page=3&q=Nom']}>
          <Routes>
            <Route path={path} element={<CopilotRoot tenantId={TENANT} />} />
            <Route path={`/tenant/${TENANT}/assistant`} element={<LaunchDestination />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
    await screen.findByRole('button', BUTTON);
    await waitFor(() => expect(fireEvent.keyDown(window, { key: 'k', ctrlKey: true })).toBe(false));
    const composer = await screen.findByRole('textbox', { name: 'Votre message' }, { timeout: 5000 });
    if (!keep) fireEvent.click(screen.getByRole('button', { name: 'Retirer le contexte de l’écran' }));
    fireEvent.change(composer, { target: { value: 'Résume les retards' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    const destination = await screen.findByRole('status');
    expect(JSON.parse(destination.textContent ?? '{}')).toEqual({
      prompt: 'Résume les retards',
      ...(keep ? { sourcePath: path + '?status=PARTIAL&dueFrom=2026-10-01' } : {})
    });
  });

  it('affiche le bouton quand l’assistant est activé', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    const button = await screen.findByRole('button', BUTTON);
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+J Meta+J');
  });

  it('ouvre le tiroir et affiche ses suggestions dans la langue de l’assistant', async () => {
    getStatus.mockResolvedValue(ENABLED);
    selectAssistantLanguage('es');
    renderRoot();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir el asistente' }));
    expect(await screen.findByLabelText('Su mensaje', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muéstrame los inmuebles disponibles' })).toBeInTheDocument();
  });

  it('masque le bouton quand l’assistant est désactivé', async () => {
    getStatus.mockResolvedValue(DISABLED);
    renderRoot();
    await waitFor(() => expect(calls).toContain(TENANT));
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
  });

  it('masque le bouton quand le statut échoue', async () => {
    getStatus.mockImplementation(() => Promise.reject(new Error('boom')));
    renderRoot();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
  });

  it.each([
    ['Ctrl+J', { ctrlKey: true }],
    ['Cmd+J', { metaKey: true }]
  ])(
    '%s ouvre le tiroir',
    async (_label, mod) => {
      getStatus.mockResolvedValue(ENABLED);
      renderRoot();
      await screen.findByRole('button', BUTTON);
      // Le bouton est commité dans le DOM avant l'effet passif qui pose
      // l'écouteur `keydown` : `findByRole` peut rendre la main entre les deux
      // (rare, mais fréquent sous charge en CI). On renvoie donc la touche
      // jusqu'à ce que l'écouteur la prenne (`preventDefault`). Sans écouteur,
      // l'envoi est sans effet ; une fois pris, le tiroir s'ouvre une seule fois.
      await waitFor(() => {
        const notPrevented = fireEvent.keyDown(window, { key: 'j', ...mod });
        expect(notPrevented).toBe(false);
      });
      expect(await screen.findByLabelText('Votre message', {}, { timeout: 5000 })).toBeInTheDocument();
    },
    10_000
  );

  it('ouvre le tiroir au clic et le ferme avec Échap', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    fireEvent.click(await screen.findByRole('button', BUTTON));
    const input = await screen.findByLabelText('Votre message');
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 27, code: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Votre message')).not.toBeInTheDocument());
  });
});

describe('CopilotRoot — page plein écran', () => {
  function renderOnAssistantPage() {
    return render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/assistant`]}>
          <main id="main">
            <textarea aria-label="Votre message" />
          </main>
          <CopilotRoot tenantId={TENANT} />
        </MemoryRouter>
      </LanguageProvider>
    );
  }

  it('masque le bouton flottant sur /assistant', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderOnAssistantPage();
    await waitFor(() => expect(calls).toContain(TENANT));
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
  });

  it('Ctrl+J met le curseur dans la saisie au lieu d’ouvrir un tiroir', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderOnAssistantPage();
    await waitFor(() => {
      const notPrevented = fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
      expect(notPrevented).toBe(false);
    });
    const field = screen.getAllByLabelText('Votre message')[0];
    expect(field).toHaveFocus();
    expect(document.querySelector('.ant-drawer')).toBeNull();
  });

  it('ouvre le tiroir avec des actions en icône seule, nommées et en infobulle', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    fireEvent.click(await screen.findByRole('button', BUTTON));
    const full = await screen.findByRole('button', { name: 'Ouvrir en pleine page' });
    const reset = screen.getByRole('button', { name: 'Nouvelle conversation' });
    expect(full.textContent?.trim()).toBe('');
    expect(reset.textContent?.trim()).toBe('');
  });

  it('joint un fichier au fil privé du tiroir et rouvre le même fil en pleine page', async () => {
    getStatus.mockResolvedValue(ENABLED);
    const conversationId = 'a26ca1bb-006a-4b80-8cb8-ec7050b85471';
    const stream = vi.mocked(copilotService.streamChat);
    stream.mockImplementation(async (_tenant, _payload, { onEvent }) => {
      onEvent({ type: 'meta', conversationId, requestId: 'request-1' });
      onEvent({ type: 'text_delta', text: 'Voici le montant.' });
      onEvent({ type: 'done', reason: 'end_turn' });
    });
    const path = `/tenant/${TENANT}`;
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[`${path}/dashboard`]}>
          <Routes>
            <Route path={`${path}/dashboard`} element={<CopilotRoot tenantId={TENANT} />} />
            <Route path={`${path}/assistant`} element={<LaunchDestination />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    );
    fireEvent.click(await screen.findByRole('button', BUTTON));
    await screen.findByRole('button', { name: 'Joindre des fichiers' });
    const file = new File(['Montant\n50'], 'loyers.csv', { type: 'text/csv' });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(screen.getByRole('button', { name: 'Retirer loyers.csv' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Voici le montant.');
    expect(stream).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        turnId: expect.any(String),
        messages: [{ role: 'user', content: 'Analyse les fichiers joints.' }]
      }),
      expect.objectContaining({ files: [file] })
    );

    const input = screen.getByRole('textbox', { name: 'Votre message' });
    fireEvent.change(input, { target: { value: 'Quel est le total ?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(stream).toHaveBeenLastCalledWith(
      TENANT,
      expect.objectContaining({ conversationId, messages: [{ role: 'user', content: 'Quel est le total ?' }] }),
      expect.not.objectContaining({ files: expect.anything() })
    );
    const openPage = screen.getByRole('button', { name: 'Ouvrir en pleine page' });
    await waitFor(() => expect(openPage).toBeEnabled());
    fireEvent.click(openPage);
    expect(await screen.findByRole('status')).toHaveTextContent(`?c=${conversationId}`);
  });

  it('insère la transcription du micro dans la saisie du tiroir', async () => {
    getStatus.mockResolvedValue({ ...ENABLED, transcription: true });
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
    const mediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    class Recorder {
      static isTypeSupported = () => true;
      readonly mimeType = 'audio/webm;codecs=opus';
      state = 'inactive';
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;

      start() {
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    const transcribe = vi.mocked(copilotService.transcribe).mockResolvedValue('les encaissements');
    try {
      renderRoot();
      fireEvent.click(await screen.findByRole('button', BUTTON));
      fireEvent.change(await screen.findByRole('textbox', { name: 'Votre message' }), { target: { value: 'Résume' } });
      fireEvent.click(screen.getByRole('button', { name: 'Dicter un message' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Arrêter la dictée' }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Votre message' })).toHaveValue('Résume les encaissements')
      );
      expect(transcribe).toHaveBeenCalledWith(TENANT, expect.any(Blob), expect.any(AbortSignal), expect.any(Number));
      expect(transcribe.mock.calls[0][1].type).toBe('audio/webm');
      expect(stopTrack).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (mediaDevices) Object.defineProperty(navigator, 'mediaDevices', mediaDevices);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
      transcribe.mockReset();
    }
  });
});

function makeAuth(over: Partial<AuthContextType>): AuthContextType {
  return {
    user: {
      id: 'user-1',
      email: 'test@example.com',
      fullName: 'Alex Martin',
      avatarUrl: null,
      globalRole: 'USER',
      emailVerified: true,
      preferredLanguage: null,
      isActive: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    tenantMembership: null,
    tenantClient: null,
    isLoadingMembership: false,
    login: async () => undefined,
    logout: async () => undefined,
    register: async () => undefined,
    refreshToken: async () => undefined,
    clearError: () => undefined,
    ...over
  } as AuthContextType;
}

function renderShell(auth: AuthContextType, path: string) {
  return render(
    <LanguageProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<div data-testid="contenu" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

describe('AppShell — montage de l’assistant', () => {
  beforeEach(() => getStatus.mockResolvedValue(ENABLED));

  it('monte le lanceur dans l’en-tête pour un collaborateur d’agence', async () => {
    renderShell(
      makeAuth({
        tenantMembership: {
          id: 'm1',
          tenantId: TENANT,
          tenant: { id: TENANT, name: 'Agence', slug: 'agence' },
          status: 'ACTIVE'
        } as AuthContextType['tenantMembership']
      }),
      `/tenant/${TENANT}/rental/leases`
    );
    expect(await screen.findByRole('button', { name: 'Demander à ImmoCopilot' }, { timeout: 5000 })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+K Meta+K'
    );
  }, 10_000);

  it.each([
    [
      'locataire',
      makeAuth({ tenantClient: { id: 'c1', clientType: 'RENTER' } as AuthContextType['tenantClient'] }),
      '/tenant/lease'
    ],
    [
      'propriétaire',
      makeAuth({ tenantClient: { id: 'c2', clientType: 'OWNER' } as AuthContextType['tenantClient'] }),
      '/owner/revenues'
    ],
    [
      'super-admin',
      makeAuth({ user: { ...(makeAuth({}).user as NonNullable<AuthContextType['user']>), globalRole: 'SUPER_ADMIN' } }),
      '/admin/tenants'
    ]
  ])('ne monte rien pour un %s', async (_n, auth, path) => {
    renderShell(auth, path);
    await screen.findByTestId('contenu');
    await new Promise(r => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole('button', BUTTON)).not.toBeInTheDocument();
  });
});
