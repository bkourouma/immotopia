import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LANGUAGE_STORAGE_KEY } from '../../i18n/config';

/**
 * FRI-11 : à la déconnexion, les données personnelles gardées dans
 * localStorage (brouillons d'états des lieux, téléphone du payeur du portail
 * copropriétaire, hypothèses de rendement) disparaissent. Les autres clés
 * (ici « theme ») restent.
 *
 * Note : `logout` retire AUSSI le choix de langue mémorisé localement
 * (comportement préexistant, voir `AuthContext.logout`) ; il est donc
 * constaté ici tel quel, la purge FRI-11 n'y ajoute ni n'y retire rien.
 */

const getMe = vi.fn();
const logoutApi = vi.fn();

vi.mock('../../services/auth-service', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: (...args: unknown[]) => logoutApi(...args)
}));
vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { success: true, data: { asClient: [], asMember: [] } } }) },
  refreshSession: vi.fn()
}));

import AuthContext, { AuthProvider } from '../../context/AuthContext';

const KEYS = [
  'immotopia:inspection-draft:insp-1',
  'coowner-portal:payer-phone',
  'patrimoine:performance:assumptions:tenant-1:prop-1'
];

describe('logout : purge des données personnelles locales', () => {
  beforeEach(() => {
    getMe.mockReset();
    logoutApi.mockReset();
    logoutApi.mockResolvedValue(undefined);
    getMe.mockResolvedValue({ success: true, user: { id: 'u1', email: 'a@b.c', globalRole: 'USER' } });
    window.localStorage.clear();
  });

  it('supprime les clés personnelles et garde les autres', async () => {
    for (const key of KEYS) window.localStorage.setItem(key, '{"secret":true}');
    window.localStorage.setItem('theme', 'dark');

    const Temoin: React.FC = () => {
      const auth = React.useContext(AuthContext as React.Context<any>);
      return (
        <div>
          <span>{auth.isAuthenticated ? 'CONNECTE' : 'ANONYME'}</span>
          <button onClick={() => auth.logout()}>SE-DECONNECTER</button>
        </div>
      );
    };
    render(
      <AuthProvider>
        <Temoin />
      </AuthProvider>
    );
    await screen.findByText('CONNECTE');
    for (const key of KEYS) expect(window.localStorage.getItem(key)).not.toBeNull();

    fireEvent.click(screen.getByText('SE-DECONNECTER'));

    await waitFor(() => expect(logoutApi).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      for (const key of KEYS) expect(window.localStorage.getItem(key)).toBeNull();
    });
    expect(window.localStorage.getItem('theme')).toBe('dark');
    // Comportement préexistant : le choix de langue local est retiré à part.
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
  });
});
