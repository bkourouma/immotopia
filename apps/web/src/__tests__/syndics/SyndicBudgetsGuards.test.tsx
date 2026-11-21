import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';

/**
 * Garde-fous des actions d'écriture de l'écran Budgets : « Générer appels » n'est proposé actif que pour un budget
 * APPROVED (l'API répond 422 sinon), et les actions sont grisées quand la personne n'a pas SYNDIC_EDIT.
 */
const listBudgets = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listChargeCallBatches: vi.fn(async () => []),
  listSyndicateLots: vi.fn(async () => []),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  recomputeBudgetAllocations: vi.fn(),
  generateBudgetChargeCalls: vi.fn(),
  createChargeCallBatch: vi.fn(),
  listSyndicateFunds: vi.fn(async () => []),
  assignBudgetLineFund: vi.fn()
}));

let access: { permissions: Set<string> | null; ready: boolean } = { permissions: null, ready: true };
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), ...access })
}));

const authValue = {
  user: { id: 'user-1', email: 'test@example.com', fullName: 'Test User', globalRole: 'USER', isActive: true },
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
} as unknown as AuthContextType;

function mount() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/budgets']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/budgets" element={<SyndicBudgets />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

const budget = (status: string) => ({
  id: 'budget-1',
  syndicateId: 'syndic-1',
  fiscalYear: 2026,
  label: 'Budget 2026',
  totalAmount: 1_200_000,
  currency: 'XOF',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  allocations: [],
  lines: []
});

const buttonOf = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  access = { permissions: null, ready: true };
});

describe('SyndicBudgets - garde-fous des actions', () => {
  it("grise « Générer appels » tant que le budget n'est pas approuvé", async () => {
    listBudgets.mockResolvedValue([budget('DRAFT')]);
    mount();
    await screen.findByText('Budget 2026', {}, { timeout: 15000 });
    expect(buttonOf(/Générer appels/).disabled).toBe(true);
    expect(buttonOf(/Approuver/).disabled).toBe(false);
  });

  it('laisse « Générer appels » actif pour un budget approuvé', async () => {
    listBudgets.mockResolvedValue([budget('APPROVED')]);
    mount();
    await screen.findByText('Budget 2026', {}, { timeout: 15000 });
    expect(buttonOf(/Générer appels/).disabled).toBe(false);
  });

  it("grise toutes les actions d'écriture sans SYNDIC_EDIT", async () => {
    access = { permissions: new Set(['SYNDIC_VIEW']), ready: true };
    listBudgets.mockResolvedValue([budget('APPROVED')]);
    mount();
    await screen.findByText('Budget 2026', {}, { timeout: 15000 });
    expect(buttonOf(/Nouveau budget/).disabled).toBe(true);
    expect(buttonOf(/Nouvelle campagne/).disabled).toBe(true);
    expect(buttonOf(/Générer appels/).disabled).toBe(true);
    expect(buttonOf(/Répartir/).disabled).toBe(true);
    expect(buttonOf(/Clôturer/).disabled).toBe(true);
    // La lecture reste possible.
    expect(buttonOf(/Postes et fonds/).disabled).toBe(false);
  });
});
