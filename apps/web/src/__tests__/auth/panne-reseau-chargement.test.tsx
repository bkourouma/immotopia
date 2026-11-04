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

vi.mock('../../services/auth-service', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn()
}));
vi.mock('../../utils/api-client', () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
  refreshSession: (...args: unknown[]) => refreshSession(...args)
}));

import { AuthProvider } from '../../context/AuthContext';
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
