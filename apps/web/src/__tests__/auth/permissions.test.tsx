import React, { useContext } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configure, render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { userHasPermission } from '../../utils/permissions';

/**
 * Permissions côté web (rec040-01) : `user.memberships` (réponse de /auth/me)
 * alimente `hasPermission` d'AuthContext et la garde `requiredPermissions` de
 * ProtectedRoute. Une liste vide n'autorise jamais rien ; le super-admin passe.
 */

// Le refus d'accès est un chunk lazy (AntD) : sa première transformation est lente.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000 });

const getMe = vi.fn();
const loginApi = vi.fn();

vi.mock('../../services/auth-service', () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  login: (...args: unknown[]) => loginApi(...args),
  refreshToken: vi.fn(),
  logout: vi.fn()
}));
vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { success: true, data: { asClient: [], asMember: [] } } }) },
  refreshSession: vi.fn()
}));

import AuthContext, { AuthProvider } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';

const membership = (tenantId: string, permissions: string[]) => ({
  tenantId,
  tenantName: `Agence ${tenantId}`,
  tenantSlug: tenantId,
  tenantType: 'AGENCY',
  membershipId: `m-${tenantId}`,
  roleKeys: [],
  permissions
});

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  email: 'a@example.com',
  globalRole: 'USER',
  ...over
});

describe('userHasPermission', () => {
  const u = user({
    memberships: [membership('t1', ['FINANCE_REPORTS_READ', 'FINANCE_ACCOUNTS_READ']), membership('t2', [])]
  }) as never;

  it('accorde une clé détenue dans la bonne agence seulement', () => {
    expect(userHasPermission(u, 't1', 'FINANCE_REPORTS_READ')).toBe(true);
    expect(userHasPermission(u, 't3', 'FINANCE_REPORTS_READ')).toBe(false);
    expect(userHasPermission(u, null, 'FINANCE_REPORTS_READ')).toBe(false);
  });

  it('exige toutes les clés d’une liste', () => {
    expect(userHasPermission(u, 't1', ['FINANCE_REPORTS_READ', 'FINANCE_ACCOUNTS_READ'])).toBe(true);
    expect(userHasPermission(u, 't1', ['FINANCE_REPORTS_READ', 'FINANCE_SITES_MANAGE'])).toBe(false);
    expect(userHasPermission(u, 't1', [])).toBe(false);
  });

  it('une liste vide n’autorise jamais rien', () => {
    expect(userHasPermission(u, 't2', 'FINANCE_REPORTS_READ')).toBe(false);
  });

  it('ne conclut pas sans utilisateur ni appartenances ; le super-admin passe', () => {
    expect(userHasPermission(null, 't1', 'X')).toBe(false);
    expect(userHasPermission(user() as never, 't1', 'X')).toBe(false);
    expect(userHasPermission(user({ globalRole: 'SUPER_ADMIN' }) as never, 't1', 'X')).toBe(true);
  });
});

const Temoin: React.FC<{ tenantId: string; keys: string | string[] }> = ({ tenantId, keys }) => {
  const auth = useContext(AuthContext as React.Context<any>);
  if (auth.isLoading) return <span>chargement</span>;
  return (
    <span>
      {auth.hasPermission(tenantId, keys) ? 'autorisé' : 'refusé'}:{(auth.memberships ?? []).length}
    </span>
  );
};

describe('AuthContext : memberships et hasPermission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expose les appartenances de /auth/me et ne conclut rien pendant le chargement', async () => {
    getMe.mockResolvedValueOnce({
      success: true,
      user: user({ memberships: [membership('t1', ['FINANCE_REPORTS_READ'])] })
    });
    render(
      <AuthProvider>
        <Temoin tenantId="t1" keys="FINANCE_REPORTS_READ" />
      </AuthProvider>
    );
    expect(screen.getByText('chargement')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('autorisé:1')).toBeInTheDocument());
  });

  it('refuse une clé que l’agence ne donne pas', async () => {
    getMe.mockResolvedValueOnce({ success: true, user: user({ memberships: [membership('t1', ['X'])] }) });
    render(
      <AuthProvider>
        <Temoin tenantId="t1" keys="FINANCE_REPORTS_READ" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('refusé:1')).toBeInTheDocument());
  });

  it('à la connexion, lit les appartenances sur /auth/me (la réponse de login n’en porte pas)', async () => {
    getMe.mockRejectedValueOnce(Object.assign(new Error('non'), { response: { status: 500 } }));
    loginApi.mockResolvedValueOnce({ success: true, user: user() });
    getMe.mockResolvedValueOnce({
      success: true,
      user: user({ memberships: [membership('t1', ['FINANCE_REPORTS_READ'])] })
    });
    let seConnecter: () => Promise<void> = async () => {};
    const Declencheur: React.FC = () => {
      const auth = useContext(AuthContext as React.Context<any>);
      seConnecter = () => auth.login({ email: 'a@example.com', password: 'x' });
      return null;
    };
    render(
      <AuthProvider>
        <Declencheur />
        <Temoin tenantId="t1" keys="FINANCE_REPORTS_READ" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('refusé:0')).toBeInTheDocument());
    await act(async () => {
      await seConnecter();
    });
    await waitFor(() => expect(screen.getByText('autorisé:1')).toBeInTheDocument());
  });

  it('à la connexion, retombe sur la réponse de login quand /auth/me échoue : la connexion aboutit', async () => {
    getMe.mockRejectedValueOnce(Object.assign(new Error('non'), { response: { status: 500 } }));
    loginApi.mockResolvedValueOnce({ success: true, user: user({ email: 'repli@example.com' }) });
    getMe.mockRejectedValueOnce(Object.assign(new Error('indisponible'), { response: { status: 500 } }));
    let seConnecter: () => Promise<void> = async () => {};
    const Declencheur: React.FC = () => {
      const auth = useContext(AuthContext as React.Context<any>);
      seConnecter = () => auth.login({ email: 'repli@example.com', password: 'x' });
      return (
        <span>
          {auth.isLoading ? 'chargement' : auth.isAuthenticated ? `connecté:${auth.user?.email}` : 'anonyme'}
          {auth.error ? `:erreur ${auth.error}` : ''}
        </span>
      );
    };
    render(
      <AuthProvider>
        <Declencheur />
        <Temoin tenantId="t1" keys="FINANCE_REPORTS_READ" />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('anonyme')).toBeInTheDocument());
    await act(async () => {
      await expect(seConnecter()).resolves.toBeUndefined();
    });
    // Connexion réussie sur la réponse de login (sans appartenances) : pas d'erreur,
    // et aucun droit connu (« refusé:0 »).
    await waitFor(() => expect(screen.getByText('connecté:repli@example.com')).toBeInTheDocument());
    expect(screen.getByText('refusé:0')).toBeInTheDocument();
    expect(getMe).toHaveBeenCalledTimes(2);
  });
});

describe('ProtectedRoute : requiredPermissions', () => {
  beforeEach(() => vi.clearAllMocks());

  function monter(me: unknown) {
    getMe.mockResolvedValueOnce({ success: true, user: me });
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/tenant/t1/finance/balance-agee']}>
          <Routes>
            <Route
              path="/tenant/:tenantId/finance/balance-agee"
              element={
                <ProtectedRoute requiredPermissions="FINANCE_REPORTS_READ">
                  <div>écran financier</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
  }

  it('affiche l’écran quand la permission est détenue', async () => {
    monter(user({ memberships: [membership('t1', ['FINANCE_REPORTS_READ'])] }));
    expect(await screen.findByText('écran financier')).toBeInTheDocument();
  });

  it('affiche le refus d’accès quand la permission manque', async () => {
    // Pré-charge le chunk lazy d'AccessDenied : sa première transformation (~6 s à
    // froid) ne compte alors pas dans l'attente du `findBy` sous charge.
    await import('../../components/primitives/AccessDenied');
    monter(user({ memberships: [membership('t1', ['STOCK_VIEW'])] }));
    expect(await screen.findByText('Accès non autorisé', undefined, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByText('écran financier')).not.toBeInTheDocument();
  });

  it('laisse passer quand la liste de permissions de l’agence est vide (échec de calcul indistinguable)', async () => {
    monter(user({ memberships: [membership('t1', [])] }));
    expect(await screen.findByText('écran financier')).toBeInTheDocument();
  });

  it('laisse passer quand l’appartenance de l’agence est inconnue', async () => {
    monter(user({ memberships: [membership('autre', ['STOCK_VIEW'])] }));
    expect(await screen.findByText('écran financier')).toBeInTheDocument();
  });

  it('laisse passer (le serveur tranche) quand les droits ne sont pas connus', async () => {
    monter(user());
    expect(await screen.findByText('écran financier')).toBeInTheDocument();
  });

  it('laisse passer le super-admin', async () => {
    monter(user({ globalRole: 'SUPER_ADMIN', memberships: [] }));
    expect(await screen.findByText('écran financier')).toBeInTheDocument();
  });
});
