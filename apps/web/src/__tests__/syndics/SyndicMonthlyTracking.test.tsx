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
const listBudgets = vi.fn();

vi.mock('../../services/syndic-lot-payment-service', () => ({
  getMonthlyTracking: (...args: unknown[]) => getMonthlyTracking(...args)
}));

// Le `Select` d'Ant Design devient un <select> natif : `onChange` reçoit la valeur d'origine de l'option
// (nombre ou texte), comme le composant réel.
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const Select = ({ options = [], value, onChange, 'aria-label': ariaLabel }: any) => (
    <select
      aria-label={ariaLabel}
      value={String(value ?? '')}
      onChange={event => onChange?.(options.find((option: any) => String(option.value) === event.target.value)?.value)}
    >
      {options.map((option: any) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
  return { ...actual, Select };
});

// Liste des budgets du filtre : seule la lecture est utilisée par la page.
vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args)
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
    listBudgets.mockResolvedValue([]);
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

    await waitFor(() => expect(getMonthlyTracking).toHaveBeenCalledWith('tenant-1', 'syndic-1', undefined, undefined));

    expect(await screen.findByText('A-01')).toBeTruthy();
    expect(await screen.findByText('Awa Diop')).toBeTruthy();
    expect(screen.getAllByText('Réglé').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Partiel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dû').length).toBeGreaterThan(0);
    // La légende explique chaque couleur par du texte, pas seulement une couleur.
    expect(screen.getByLabelText('Légende')).toBeTruthy();
  });

  it('sans budget, affiche la grille de l’année courante sans sélecteur', async () => {
    getMonthlyTracking.mockResolvedValue({ year: 2026, currency: 'XOF', months: [], lots: [] });

    renderWithRoute();
    await waitFor(() => expect(getMonthlyTracking).toHaveBeenCalledWith('tenant-1', 'syndic-1', undefined, undefined));
    expect(screen.queryByLabelText('Budget')).toBeNull();
    expect(screen.queryByLabelText('Exercice')).toBeNull();
  });

  it('affiche par défaut le dernier budget créé, sans sélecteur d’exercice, puis le budget choisi', async () => {
    getMonthlyTracking.mockResolvedValue({ year: 2025, currency: 'XOF', months: [], lots: [] });
    listBudgets.mockResolvedValue([
      { id: 'budget-1', label: 'Budget prévisionnel 2025', fiscalYear: 2025, createdAt: '2026-10-27T10:00:00.000Z' },
      {
        id: 'budget-2',
        label: 'Budget travaux et réserves 2026',
        fiscalYear: 2026,
        createdAt: '2026-10-27T12:00:00.000Z'
      }
    ]);

    renderWithRoute();
    // Le dernier créé est affiché, sans année demandée : l'API la déduit du budget.
    await waitFor(() => expect(getMonthlyTracking).toHaveBeenCalledWith('tenant-1', 'syndic-1', undefined, 'budget-2'));
    expect(getMonthlyTracking).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Exercice')).toBeNull();
    expect(screen.queryByText('Tous les budgets')).toBeNull();

    fireEvent.change(screen.getByLabelText('Budget'), { target: { value: 'budget-1' } });
    await waitFor(() =>
      expect(getMonthlyTracking).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', undefined, 'budget-1')
    );
  });

  it('montre l’année de la grille renvoyée par l’API à côté du budget', async () => {
    getMonthlyTracking.mockResolvedValue({ year: 2025, currency: 'XOF', months: [], lots: [] });
    listBudgets.mockResolvedValue([
      { id: 'budget-1', label: 'Budget prévisionnel 2025', fiscalYear: 2025, createdAt: '2026-10-27T10:00:00.000Z' }
    ]);

    renderWithRoute();
    expect(await screen.findByText('2025')).toBeTruthy();
  });
});
