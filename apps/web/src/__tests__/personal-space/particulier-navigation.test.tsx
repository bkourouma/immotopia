import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { getNavigation } from '../../navigation/model';
import { particulierNavigation } from '../../navigation/particulier';
import { resetTenantTypeCache } from '../../hooks/useTenantType';

/**
 * Navigation d'un espace PARTICULIER (lot 4C) : réduite au patrimoine, aux
 * biens, aux baux et aux paramètres, décidée par le TYPE de l'espace renvoyé
 * par le serveur, et non par SUBSCRIPTION_ENFORCEMENT (ici `warn`).
 */

vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    Grid: { useBreakpoint: () => ({ xs: true, sm: true, md: true, lg: true, xl: true }) }
  };
});

const getMenuEntitlements = vi.fn();
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: (...a: unknown[]) => getMenuEntitlements(...a)
}));

const getMyMenuAccess = vi.fn();
vi.mock('../../services/role-menu-service', () => ({
  getMyMenuAccess: (...a: unknown[]) => getMyMenuAccess(...a)
}));

const getTenantIdentity = vi.fn();
vi.mock('../../services/personal-space-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/personal-space-service')>();
  return { ...actual, getTenantIdentity: (...a: unknown[]) => getTenantIdentity(...a) };
});

vi.mock('../../services/owner-portal-patrimoine-service', () => ({
  ownerPortalPatrimoineService: { getSettings: vi.fn().mockResolvedValue({ enabled: true }) }
}));

const { AppShell } = await import('../../components/shell/AppShell');

const TENANT = 'espace-1';

function auth(type?: 'PARTICULIER' | 'AGENCY'): AuthContextType {
  return {
    user: { id: 'u1', email: 'awa@example.com', fullName: 'Awa', globalRole: 'USER', emailVerified: true },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    tenantMembership: {
      id: 'm1',
      tenantId: TENANT,
      tenant: { id: TENANT, name: 'Espace', slug: 'espace', ...(type ? { type } : {}) },
      status: 'ACTIVE'
    },
    tenantClient: null,
    isLoadingMembership: false,
    availableTenants: [],
    login: async () => undefined,
    logout: async () => undefined,
    register: async () => undefined,
    refreshToken: async () => undefined,
    clearError: () => undefined,
    refreshMembership: async () => undefined
  } as unknown as AuthContextType;
}

function monter(value: AuthContextType) {
  return render(
    <LanguageProvider>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[`/tenant/${TENANT}/patrimoine/valeur-nette`]}>
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

function sidebar() {
  // Le groupe de la page courante est ouvert d'emblée (BUG-2026-10-19-008) : son sous-menu en ligne
  // porte aussi `role="menu"`. La racine est le premier menu dans l'ordre du document.
  return screen.getAllByRole('menu')[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Pas de `localStorage.clear()` : `setupTests` y pose la langue française.
  window.localStorage.removeItem(`immotopia.tenant-type:${TENANT}`);
  resetTenantTypeCache();
  // Mode global `warn` : l'abonnement ne masque rien, seul le type décide.
  getMenuEntitlements.mockResolvedValue({ enforcement: 'warn', moduleAccess: {}, readOnly: false, phase: 'ACTIVE' });
  getMyMenuAccess.mockResolvedValue({ disabledMenuKeys: [], permissionKeys: null });
  getTenantIdentity.mockResolvedValue({ type: 'AGENCY', contactPhone: null });
});

describe('particulierNavigation (modèle)', () => {
  const nav = particulierNavigation(getNavigation().collaborateur);
  const keys = nav.tree.map(group => group.key);

  it('ne garde que patrimoine, biens, baux et paramètres', () => {
    expect(keys).toEqual(['accueil', 'patrimoine', 'biens', 'baux', 'particulier-parametres']);
  });

  it('accueille sur la valeur nette, sans copropriété, chantiers, ventes ni mandats', () => {
    expect(nav.tree[0].href).toBe('/tenant/:tenantId/patrimoine/valeur-nette');
    const hrefs = JSON.stringify(nav.tree);
    for (const interdit of ['/syndics', '/sales', '/finance', '/crm', '/newsletter', 'mandates']) {
      expect(hrefs).not.toContain(interdit);
    }
  });

  it('garde Facturation à côté d’Abonnement pour atteindre les factures', () => {
    const parametres = nav.tree.find(group => group.key === 'particulier-parametres');
    expect(parametres?.children?.map(leaf => leaf.key)).toEqual([
      'particulier-abonnement',
      'particulier-facturation',
      'particulier-settings'
    ]);
  });

  it('limite le patrimoine à la valeur nette, aux actifs et aux projections', () => {
    const patrimoine = nav.tree.find(group => group.key === 'patrimoine');
    expect(patrimoine?.children?.map(leaf => leaf.key)).toEqual([
      'patrimoine-net-worth',
      'patrimoine-assets',
      'patrimoine-projections'
    ]);
  });

  it('propose une barre d’onglets réduite (accueil, biens, baux, plus)', () => {
    expect(nav.tabs.map(tab => tab.key)).toEqual(['tab-accueil', 'tab-biens', 'tab-baux', 'tab-plus']);
  });
});

describe('AppShell — espace particulier', () => {
  it('réduit le menu dès que la réponse porte le type, même en mode warn', async () => {
    monter(auth('PARTICULIER'));
    const menu = sidebar();
    expect(within(menu).getByText('Valeur nette')).toBeInTheDocument();
    expect(within(menu).getByText('Biens')).toBeInTheDocument();
    // Pendant la lecture des droits, le menu ne montre que le socle (BUG-010) : attendre la réponse.
    expect(await within(menu).findByText('Baux')).toBeInTheDocument();
    expect(within(menu).queryByText('Ventes')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Copropriété')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Finance')).not.toBeInTheDocument();
    expect(getTenantIdentity).not.toHaveBeenCalled();
  });

  it('réduit le menu quand le type vient de la fiche de l’espace renvoyée par le serveur', async () => {
    getTenantIdentity.mockResolvedValue({ type: 'PARTICULIER', contactPhone: null });
    monter(auth());
    await waitFor(() => expect(within(sidebar()).getByText('Valeur nette')).toBeInTheDocument());
    expect(getTenantIdentity).toHaveBeenCalledWith(TENANT);
    expect(within(sidebar()).queryByText('Ventes')).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Copropriété')).not.toBeInTheDocument();
  });

  it('garde le menu complet d’une agence, mode warn compris', async () => {
    monter(auth('AGENCY'));
    // Pendant la lecture des droits, le menu ne montre que le socle (BUG-010) : attendre la réponse.
    expect((await within(sidebar()).findAllByText('Ventes')).length).toBeGreaterThan(0);
    expect(within(sidebar()).getByText('Copropriété')).toBeInTheDocument();
    // Le groupe Patrimoine de la page courante est ouvert d'emblée : « Valeur nette » y figure aussi pour une agence.
    // Ce qui distingue l'agence du particulier : « Vue consolidée » (absente du palier particulier).
    expect(within(sidebar()).getByText('Vue consolidée')).toBeInTheDocument();
  });
});
