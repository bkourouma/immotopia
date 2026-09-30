import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
// La coquille porte desormais le selecteur de langue : sans ce provider,
// `useLanguage` leve, et c'est voulu — un provider oublie doit se voir.
import { LanguageProvider } from '../../i18n/LanguageProvider';

// Lecture des droits d'abonnement : échec immédiat (menu non restreint). Sans
// ce mock, l'appel réseau met du temps à échouer et le menu reste au socle.
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: () => Promise.reject(new Error('hors ligne'))
}));

/**
 * Palier desktop (≥ 992 px).
 *
 * `setupTests` mocke `matchMedia` à `matches: false`, si bien que toutes les
 * autres suites rendent le palier mobile. Ce fichier surcharge la seule
 * mesure de `Grid.useBreakpoint()` pour couvrir l'autre moitié de la
 * coquille : sidebar de 256 px, aucune barre d'onglets, fil d'Ariane complet
 * plutôt que réduit à un retour.
 */
vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    Grid: { useBreakpoint: () => ({ xs: true, sm: true, md: true, lg: true, xl: true }) }
  };
});

const { AppShell } = await import('../../components/shell/AppShell');

const TENANT = 'tenant-1';

const collaborateur = {
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
  tenantMembership: {
    id: 'membership-1',
    tenantId: TENANT,
    tenant: { id: TENANT, name: 'Agence Demo', slug: 'agence-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: () => undefined
} as unknown as AuthContextType;

function renderShell(path: string) {
  return render(
    <LanguageProvider>
      <AuthContext.Provider value={collaborateur}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<div data-testid="contenu">contenu</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

describe('AppShell — palier desktop', () => {
  it('rend la sidebar et non la barre d’onglets', async () => {
    renderShell(`/tenant/${TENANT}/rental/leases`);
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument();
    // La sidebar porte le menu : « Encaisser » y figure comme destination
    // (une fois les droits lus : le menu n'affiche que le socle avant).
    expect((await screen.findAllByText('Encaisser')).length).toBeGreaterThan(0);
  });

  it('rend le fil d’Ariane complet, et non un simple retour', () => {
    renderShell(`/tenant/${TENANT}/rental/leases`);
    expect(screen.getByRole('navigation', { name: "Fil d'Ariane" })).toBeInTheDocument();
    expect(screen.queryByText(/^Retour à/)).not.toBeInTheDocument();
  });

  it('ne rend pas de FAB : l’action passera par le PageHeader en desktop', () => {
    renderShell(`/tenant/${TENANT}/rental/leases`);
    expect(screen.queryByRole('button', { name: 'Nouveau bail' })).not.toBeInTheDocument();
  });

  it('n’expose pas le bouton d’ouverture du drawer', () => {
    renderShell('/dashboard');
    expect(screen.queryByRole('button', { name: 'Ouvrir la navigation' })).not.toBeInTheDocument();
  });

  it('affiche le nom et le rôle dans l’en-tête', () => {
    renderShell('/dashboard');
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Alex Martin')).toBeInTheDocument();
  });
});
