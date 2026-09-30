import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { AppShell } from '../../components/shell/AppShell';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import type { MenuEntitlements } from '../../services/entitlements-service';

const getMenuEntitlements = vi.fn();
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: (...args: unknown[]) => getMenuEntitlements(...args)
}));

/**
 * Adresse tapée à la main d'un module hors abonnement (BUG-2026-09-30-001) :
 * l'écran de refus remplace celui du module, avec les mêmes droits que le menu.
 */
const TENANT = 'tenant-1';

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

const collaborateur = makeAuth({
  tenantMembership: {
    id: 'membership-1',
    tenantId: TENANT,
    tenant: { id: TENANT, name: 'Agence Demo', slug: 'agence-demo' },
    status: 'ACTIVE'
  } as AuthContextType['tenantMembership']
});
const superAdmin = makeAuth({ user: { ...makeAuth({}).user!, globalRole: 'SUPER_ADMIN' } });

const agencePack: MenuEntitlements = {
  moduleAccess: { MODULE_AGENCY: 'FULL' },
  readOnly: false,
  phase: 'ACTIVE',
  enforcement: 'enforce'
};

/** Écran du module : signale son montage, pour prouver qu'un module refusé ne monte jamais. */
const mounted = vi.fn();
function ModuleScreen() {
  React.useEffect(() => {
    mounted();
  }, []);
  return <div data-testid="contenu">écran du module</div>;
}

/** Attend la résolution (ou le rejet) de toutes les lectures de droits, puis laisse React se stabiliser. */
async function settle() {
  await act(async () => {
    await Promise.allSettled(getMenuEntitlements.mock.results.map(result => result.value));
  });
}

function renderAt(auth: AuthContextType, path: string) {
  return render(
    <LanguageProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<ModuleScreen />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

const REFUS = 'Fonction non comprise dans votre abonnement';

describe('AppShell — garde des modules hors abonnement', () => {
  let release: (value: MenuEntitlements) => void = () => undefined;
  let pending: Promise<MenuEntitlements> = Promise.resolve(agencePack);
  beforeEach(() => {
    getMenuEntitlements.mockReset();
    mounted.mockClear();
    pending = new Promise<MenuEntitlements>(resolve => {
      release = resolve;
    });
  });
  // Les droits en attente sont libérés en fin de test : le démontage ne doit
  // pas laisser de promesse pendante derrière lui.
  afterEach(() => release({ ...agencePack, enforcement: 'off' }));

  it('remplace l’écran du module par l’écran de refus (pack Agence, chantiers)', async () => {
    getMenuEntitlements.mockResolvedValue(agencePack);
    renderAt(collaborateur, `/tenant/${TENANT}/finance/chantiers`);
    expect(await screen.findByText(REFUS)).toBeInTheDocument();
    expect(screen.queryByTestId('contenu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paramètres › Abonnement/ })).toBeInTheDocument();
  });

  it('laisse un module souscrit intact', async () => {
    getMenuEntitlements.mockResolvedValue(agencePack);
    renderAt(collaborateur, `/tenant/${TENANT}/rental/leases`);
    await waitFor(() => expect(getMenuEntitlements).toHaveBeenCalled());
    await settle();
    expect(await screen.findByTestId('contenu')).toBeInTheDocument();
    expect(screen.queryByText(REFUS)).not.toBeInTheDocument();
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it('ne monte pas l’écran d’un module pendant la lecture des droits, sans refus prématuré', async () => {
    getMenuEntitlements.mockImplementation(() => pending);
    renderAt(collaborateur, `/tenant/${TENANT}/finance/chantiers`);
    await waitFor(() => expect(getMenuEntitlements).toHaveBeenCalled());
    expect(screen.queryByTestId('contenu')).not.toBeInTheDocument();
    expect(screen.queryByText(REFUS)).not.toBeInTheDocument();
    expect(mounted).not.toHaveBeenCalled();

    // Droits reçus : module non souscrit => refus, et l'écran du module n'a jamais monté.
    await act(async () => release(agencePack));
    expect(await screen.findByText(REFUS)).toBeInTheDocument();
    expect(mounted).not.toHaveBeenCalled();
  });

  it('monte l’écran d’un module souscrit dès la réponse des droits, une seule fois', async () => {
    getMenuEntitlements.mockImplementation(() => pending);
    renderAt(collaborateur, `/tenant/${TENANT}/rental/leases`);
    await waitFor(() => expect(getMenuEntitlements).toHaveBeenCalled());
    expect(screen.queryByTestId('contenu')).not.toBeInTheDocument();
    await act(async () => release(agencePack));
    expect(await screen.findByTestId('contenu')).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it('monte aussitôt un écran du socle (contacts), sans attendre les droits', async () => {
    getMenuEntitlements.mockImplementation(() => pending);
    renderAt(collaborateur, `/tenant/${TENANT}/crm/contacts`);
    expect(screen.getByTestId('contenu')).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it('ne bloque pas quand la lecture des droits échoue', async () => {
    getMenuEntitlements.mockImplementation(() => Promise.reject(new Error('réseau')));
    renderAt(collaborateur, `/tenant/${TENANT}/finance/chantiers`);
    await waitFor(() => expect(getMenuEntitlements).toHaveBeenCalled());
    await settle();
    expect(await screen.findByTestId('contenu')).toBeInTheDocument();
    expect(screen.queryByText(REFUS)).not.toBeInTheDocument();
  });

  it('ne bloque pas quand le contrôle n’est pas appliqué (warn)', async () => {
    getMenuEntitlements.mockResolvedValue({ ...agencePack, enforcement: 'warn' });
    renderAt(collaborateur, `/tenant/${TENANT}/finance/chantiers`);
    await waitFor(() => expect(getMenuEntitlements).toHaveBeenCalled());
    await settle();
    expect(await screen.findByTestId('contenu')).toBeInTheDocument();
    expect(screen.queryByText(REFUS)).not.toBeInTheDocument();
  });

  it('ne bloque jamais un super-administrateur', async () => {
    getMenuEntitlements.mockResolvedValue(agencePack);
    renderAt(superAdmin, `/tenant/${TENANT}/finance/chantiers`);
    expect(screen.getByTestId('contenu')).toBeInTheDocument();
    expect(getMenuEntitlements).not.toHaveBeenCalled();
    expect(screen.queryByText(REFUS)).not.toBeInTheDocument();
  });

  it('menu : pas d’entrée de module pendant la lecture des droits, menu complet si elle échoue', async () => {
    getMenuEntitlements.mockImplementation(() => pending);
    const enCours = renderAt(collaborateur, `/tenant/${TENANT}/crm/contacts`);
    await waitFor(() => expect(getMenuEntitlements).toHaveBeenCalled());
    // Palier mobile : la barre d'onglets porte « Baux » (gestion locative).
    expect(screen.queryByText('Baux')).not.toBeInTheDocument();
    enCours.unmount();

    getMenuEntitlements.mockImplementation(() => Promise.reject(new Error('réseau')));
    renderAt(collaborateur, `/tenant/${TENANT}/crm/contacts`);
    expect(await screen.findByText('Baux')).toBeInTheDocument();
  });
});
