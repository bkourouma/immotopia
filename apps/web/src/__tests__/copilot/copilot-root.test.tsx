import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { AppShell } from '../../components/shell/AppShell';
import CopilotRoot from '../../components/copilot/CopilotRoot';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => ({
  default: {
    getStatus: (tenantId: string) => {
      calls.push(tenantId);
      return statusImpl();
    },
    streamChat: vi.fn(),
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

beforeEach(() => getStatus.mockReset());

describe('CopilotRoot', () => {
  it('affiche le bouton quand l’assistant est activé', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    const button = await screen.findByRole('button', BUTTON);
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+J Meta+J');
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
  ])('%s ouvre le tiroir', async (_label, mod) => {
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
    expect(await screen.findByLabelText('Votre message')).toBeInTheDocument();
  });

  it('ouvre le tiroir au clic et le ferme avec Échap', async () => {
    getStatus.mockResolvedValue(ENABLED);
    renderRoot();
    fireEvent.click(await screen.findByRole('button', BUTTON));
    const input = await screen.findByLabelText('Votre message');
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 27, code: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Votre message')).not.toBeVisible());
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

  it('monte le bouton pour un collaborateur d’agence', async () => {
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
    expect(await screen.findByRole('button', BUTTON)).toBeInTheDocument();
  });

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
