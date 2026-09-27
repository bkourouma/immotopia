import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicMonthlyTracking } from '../../pages/syndics/SyndicMonthlyTracking';

/**
 * Lot S2 (besoin 5) : grille lot × mois. Le mock se pose sur le service
 * dédié (frontière réseau logique de ce module) : `syndic-lot-payment-service`.
 */

const getMonthlyTracking = vi.fn();

vi.mock('../../services/syndic-lot-payment-service', () => ({
  getMonthlyTracking: (...args: unknown[]) => getMonthlyTracking(...args)
}));

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

function renderWithRoute() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/suivi-mensuel']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/suivi-mensuel" element={<SyndicMonthlyTracking />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

describe('SyndicMonthlyTracking (lot S2, besoin 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la grille lot × mois avec les statuts et l’avance de chaque lot', async () => {
    getMonthlyTracking.mockResolvedValue({
      year: 2026,
      currency: 'XOF',
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      lots: [
        {
          lotId: 'lot-1',
          lotNumber: 'A-01',
          ownerName: 'Awa Diop',
          advance: 15000,
          months: [
            { month: 1, due: 50000, paid: 50000, status: 'PAID' },
            { month: 2, due: 50000, paid: 20000, status: 'PARTIAL' },
            { month: 3, due: 50000, paid: 0, status: 'OVERDUE' },
            { month: 4, due: 50000, paid: 0, status: 'DUE' },
            { month: 5, due: 0, paid: 0, status: 'NONE' },
            { month: 6, due: 0, paid: 0, status: 'NONE' },
            { month: 7, due: 0, paid: 0, status: 'NONE' },
            { month: 8, due: 0, paid: 0, status: 'NONE' },
            { month: 9, due: 0, paid: 0, status: 'NONE' },
            { month: 10, due: 0, paid: 0, status: 'NONE' },
            { month: 11, due: 0, paid: 0, status: 'NONE' },
            { month: 12, due: 0, paid: 0, status: 'NONE' }
          ]
        }
      ]
    });

    renderWithRoute();

    await waitFor(() => expect(getMonthlyTracking).toHaveBeenCalledWith('tenant-1', 'syndic-1', 2026));

    expect(await screen.findByText('A-01')).toBeTruthy();
    expect(await screen.findByText('Awa Diop')).toBeTruthy();
    expect(screen.getAllByText('Réglé').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Partiel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dû').length).toBeGreaterThan(0);
    // La légende explique chaque couleur par du texte, pas seulement une couleur.
    expect(screen.getByLabelText('Légende')).toBeTruthy();
  });

  it('recharge la grille quand on change d’exercice', async () => {
    getMonthlyTracking.mockResolvedValue({ year: 2026, currency: 'XOF', months: [], lots: [] });

    renderWithRoute();
    await waitFor(() => expect(getMonthlyTracking).toHaveBeenCalledWith('tenant-1', 'syndic-1', 2026));

    const yearSelect = screen.getByLabelText('Exercice') as HTMLSelectElement;
    fireEvent.change(yearSelect, { target: { value: '2025' } });

    await waitFor(() => expect(getMonthlyTracking).toHaveBeenCalledWith('tenant-1', 'syndic-1', 2025));
  });
});
