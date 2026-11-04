import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { configure, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * BUG-2026-11-04-044 : une panne réseau (ou un 5xx) au chargement du compte ou
 * de l'agence affiche « Impossible de charger votre compte. » avec Réessayer.
 * Seul un vrai 401 mène à la connexion ; « aucune agence » exige une réponse.
 */
configure({ asyncUtilTimeout: 25000 });
vi.setConfig({ testTimeout: 60000 });

const getMe = vi.fn();
const apiGet = vi.fn();
const refreshSession = vi.fn();
const loginApi = vi.fn();
const logoutApi = vi.fn();

vi.mock('../../services/auth-service', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  login: (...args: unknown[]) => loginApi(...args),
  refreshToken: vi.fn(),
  logout: (...args: unknown[]) => logoutApi(...args)
}));
vi.mock('../../utils/api-client', () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
  refreshSession: (...args: unknown[]) => refreshSession(...args)
}));

import AuthContext, { AuthProvider } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status: number) => Object.assign(new Error('http'), { response: { status } });

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/owner/account']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>PAGE-CONNEXION</div>} />
          <Route
            path="/owner/account"
            element={
              <ProtectedRoute>
                <div>CONTENU</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

describe('panne réseau au chargement', () => {
  // Le premier import d'AntD (chunk lazy) est lent : on le chauffe hors délai de test.
  beforeAll(async () => {
    await import('../../components/primitives/AccountLoadError');
  }, 180000);

  beforeEach(() => {
    getMe.mockReset();
    apiGet.mockReset();
    refreshSession.mockReset();
    loginApi.mockReset();
    logoutApi.mockReset();
    logoutApi.mockResolvedValue(undefined);
  });

  describe('refresh() : une panne n’est pas une perte de session', () => {
    const lancerRefresh = async (erreur: unknown) => {
      getMe.mockResolvedValue({ success: true, user: { id: 'sa', email: 'sa@b.c', globalRole: 'SUPER_ADMIN' } });
      refreshSession.mockRejectedValue(erreur);
      let auth: any;
      const Temoin: React.FC = () => {
        auth = React.useContext(AuthContext as React.Context<any>);
        return <span>{auth.isAuthenticated ? 'CONNECTE' : 'ANONYME'}</span>;
      };
      render(
        <AuthProvider>
          <Temoin />
        </AuthProvider>
      );
      await screen.findByText('CONNECTE');
      await auth.refreshToken().catch(() => undefined);
    };

    it.each([
      ['réseau coupé', networkError()],
      ['5xx', httpError(503)],
      ['429', httpError(429)]
    ])('%s : pas de déconnexion', async (_nom, erreur) => {
      await lancerRefresh(erreur);
      expect(logoutApi).not.toHaveBeenCalled();
    });

    it('401 : déconnexion', async () => {
      await lancerRefresh(httpError(401));
      expect(logoutApi).toHaveBeenCalledTimes(1);
    });

    it('403 : déconnexion', async () => {
      await lancerRefresh(httpError(403));
      expect(logoutApi).toHaveBeenCalledTimes(1);
    });
  });

  it('panne au chargement puis connexion d’un SUPER_ADMIN : plus d’écran d’erreur', async () => {
    getMe.mockRejectedValueOnce(networkError());
    const Temoin: React.FC = () => {
      const auth = React.useContext(AuthContext as React.Context<any>);
      return (
        <div>
          <span>{auth.loadError ? 'ERREUR-CHARGEMENT' : 'SANS-ERREUR'}</span>
          <button onClick={() => auth.login({ email: 'a@b.c', password: 'x' })}>SE-CONNECTER</button>
        </div>
      );
    };
    render(
      <AuthProvider>
        <Temoin />
      </AuthProvider>
    );
    expect(await screen.findByText('ERREUR-CHARGEMENT')).toBeTruthy();
    const superAdmin = { id: 'sa', email: 'sa@b.c', globalRole: 'SUPER_ADMIN' };
    loginApi.mockResolvedValue({ success: true, user: superAdmin });
    getMe.mockResolvedValue({ success: true, user: superAdmin });
    fireEvent.click(screen.getByText('SE-CONNECTER'));
    await waitFor(() => expect(screen.getByText('SANS-ERREUR')).toBeTruthy());
  });

  it('API coupée : message et Réessayer, pas de renvoi vers la connexion', async () => {
    getMe.mockRejectedValue(networkError());
    renderApp();
    expect(await screen.findByText('Impossible de charger votre compte.')).toBeTruthy();
    expect(screen.queryByText('PAGE-CONNEXION')).toBeNull();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeTruthy();
  });

  it('Réessayer relit le compte et affiche la page quand l’API revient', async () => {
    getMe.mockRejectedValueOnce(networkError());
    renderApp();
    const bouton = await screen.findByRole('button', { name: /Réessayer/ });
    getMe.mockResolvedValue({ success: true, user: { id: 'u1', email: 'a@b.c', globalRole: 'USER' } });
    apiGet.mockResolvedValue({ data: { success: true, data: { asClient: [], asMember: [] } } });
    fireEvent.click(bouton);
    expect(await screen.findByText('CONTENU')).toBeTruthy();
  });

  it('agence illisible (réseau) : Réessayer, pas « aucune agence »', async () => {
    getMe.mockResolvedValue({ success: true, user: { id: 'u1', email: 'a@b.c', globalRole: 'USER' } });
    apiGet.mockRejectedValue(networkError());
    renderApp();
    expect(await screen.findByText('Impossible de charger votre compte.')).toBeTruthy();
    expect(screen.queryByText('CONTENU')).toBeNull();
  });

  it('5xx sur /auth/me : même message', async () => {
    getMe.mockRejectedValue(httpError(503));
    renderApp();
    expect(await screen.findByText('Impossible de charger votre compte.')).toBeTruthy();
  });

  it('vrai 401 (rafraîchissement refusé) : renvoi vers la connexion', async () => {
    getMe.mockRejectedValue(httpError(401));
    refreshSession.mockRejectedValue(httpError(401));
    renderApp();
    await waitFor(() => expect(screen.getByText('PAGE-CONNEXION')).toBeTruthy());
  });
});
