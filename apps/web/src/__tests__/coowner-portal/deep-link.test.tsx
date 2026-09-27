import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

/**
 * Adresse profonde du portail copropriétaire ouverte directement (barre
 * d'adresse, rechargement) — constat de recette 13.5.
 *
 * `/copropriete/lots/<lot d'un autre copropriétaire>` revenait
 * silencieusement sur `/copropriete`, sans message et sans qu'aucune requête
 * ne parte vers le compte du lot. Cause : au démarrage, pendant un rendu, la
 * session était établie mais l'appartenance (le `TenantClient` CO_OWNER) pas
 * encore demandée ; la coquille concluait « aucun portail » et renvoyait vers
 * `/dashboard`, qui renvoyait vers `/copropriete`.
 *
 * Ce test monte le VRAI `AuthProvider`, la vraie garde `ProtectedRoute`, la
 * vraie coquille `AppShell` et le vrai écran du lot ; seuls le réseau et la
 * session sont simulés. La réponse des appartenances est retenue jusqu'à ce
 * que le test la libère, pour rendre la fenêtre observable.
 */

const getMe = vi.fn();
vi.mock('../../services/auth-service', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  refreshToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn()
}));

let releaseMemberships: () => void = () => undefined;
const apiGet = vi.fn();
vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn(() => 0), eject: vi.fn() },
      response: { use: vi.fn(() => 0), eject: vi.fn() }
    }
  },
  refreshSession: vi.fn()
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import { AuthProvider } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { AppShell } from '../../components/shell/AppShell';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import CoOwnerLotAccount from '../../pages/CoOwnerPortal/LotAccount';
import CoOwnerLots from '../../pages/CoOwnerPortal/Lots';
import CoOwnerPortalNotFound from '../../pages/CoOwnerPortal/PortalNotFound';

const COPROPRIETAIRE = {
  id: 'user-copro',
  email: 'copro1.recette3@exemple.test',
  fullName: 'Copro Un',
  globalRole: 'USER',
  emailVerified: true
};

/** Témoin des adresses traversées : un passage par /dashboard trahirait le défaut. */
const visited: string[] = [];
const Trace: React.FC = () => {
  const location = useLocation();
  visited.push(location.pathname);
  return null;
};

function mount(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <Trace />
            <Routes>
              <Route
                path="/copropriete"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<CoOwnerLots />} />
                <Route path="lots/:lotId" element={<CoOwnerLotAccount />} />
                <Route path="*" element={<CoOwnerPortalNotFound />} />
              </Route>
              <Route path="/dashboard" element={<div>Tableau de bord atteint</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  visited.length = 0;
  getMe.mockResolvedValue({ success: true, user: COPROPRIETAIRE });
  apiGet.mockImplementation((url: string) => {
    if (url === '/tenants/my-memberships') {
      return new Promise(resolve => {
        releaseMemberships = () =>
          resolve({
            data: {
              success: true,
              data: {
                asMember: [],
                asClient: [
                  {
                    id: 'tc-1',
                    clientType: 'CO_OWNER',
                    tenant: { id: 'tenant-a', name: 'Agence Plateau', slug: 'plateau' }
                  }
                ]
              }
            }
          });
      });
    }
    if (url.startsWith('/portal/copropriete/lots/')) {
      // Lot d'un autre copropriétaire : le serveur répond comme pour un lot inexistant.
      return Promise.reject({ response: { status: 404, data: { message: 'Lot introuvable.' } } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
});

describe('Portail copropriétaire — adresse profonde ouverte directement', () => {
  it("un lot d'un autre copropriétaire affiche « Ce lot est introuvable dans votre espace. », sans détour par l'accueil", async () => {
    mount('/copropriete/lots/lot-de-bakary');

    // La session est établie, les appartenances pas encore : aucun renvoi.
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith('/tenants/my-memberships'));
    expect(screen.queryByText('Tableau de bord atteint')).not.toBeInTheDocument();

    releaseMemberships();

    expect(
      await screen.findByText('Ce lot est introuvable dans votre espace.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith('/portal/copropriete/lots/lot-de-bakary/compte');
    expect(visited).not.toContain('/dashboard');
    expect(visited[visited.length - 1]).toBe('/copropriete/lots/lot-de-bakary');
  });

  it('une AG ou un document demandé par identifiant (pas de page de détail) est dit introuvable, dans le portail', async () => {
    mount('/copropriete/assemblees/ag-inconnue');
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith('/tenants/my-memberships'));
    releaseMemberships();

    expect(
      await screen.findByText('Cet élément est introuvable dans votre espace copropriétaire.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mes lots' })).toBeInTheDocument();
    expect(visited).not.toContain('/dashboard');
  });

  it('un identifiant mal formé (400) est dit introuvable de la même façon', async () => {
    apiGet.mockImplementation((url: string) => {
      if (url === '/tenants/my-memberships') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              asMember: [],
              asClient: [{ id: 'tc-1', clientType: 'CO_OWNER', tenant: { id: 'tenant-a', name: 'A', slug: 'a' } }]
            }
          }
        });
      }
      if (url.startsWith('/portal/copropriete/lots/')) {
        return Promise.reject({ response: { status: 400, data: { message: 'Requête invalide.' } } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    mount('/copropriete/lots/pas-un-identifiant');

    expect(
      await screen.findByText('Ce lot est introuvable dans votre espace.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(visited).not.toContain('/dashboard');
  });
});
