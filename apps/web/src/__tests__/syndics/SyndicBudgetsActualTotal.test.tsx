import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp, Modal } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicBudgets, budgetActualTotal } from '../../pages/syndics/SyndicBudgets';

/**
 * Réalisé complet (factures + incidents) dans le dialogue de clôture et
 * avertissement « non rattaché » (recette QA2, C1).
 */
const listBudgets = vi.fn();
const listChargeCallBatches = vi.fn();
const listSyndicateLots = vi.fn();
const createBudget = vi.fn();
const updateBudget = vi.fn();
const recomputeBudgetAllocations = vi.fn();
const generateBudgetChargeCalls = vi.fn();
const createChargeCallBatch = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listChargeCallBatches: (...args: unknown[]) => listChargeCallBatches(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  createBudget: (...args: unknown[]) => createBudget(...args),
  updateBudget: (...args: unknown[]) => updateBudget(...args),
  recomputeBudgetAllocations: (...args: unknown[]) => recomputeBudgetAllocations(...args),
  generateBudgetChargeCalls: (...args: unknown[]) => generateBudgetChargeCalls(...args),
  createChargeCallBatch: (...args: unknown[]) => createChargeCallBatch(...args),
  // Fonds de la copropriete : aucun ici, l'affectation des postes reste masquee.
  listSyndicateFunds: vi.fn(async () => []),
  assignBudgetLineFund: vi.fn()
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

const baseBudget = {
  id: 'budget-1',
  fiscalYear: 2026,
  label: 'Budget 2026',
  totalAmount: 1_200_000,
  currency: 'XOF',
  status: 'APPROVED',
  allocations: [],
  lines: [
    {
      id: 'line-1',
      budgetId: 'budget-1',
      category: 'Maintenance',
      description: 'Maintenance',
      amountForecast: 1_200_000,
      amountActual: 0,
      actualIncidents: 45000,
      actualTotal: 45000,
      distributionKey: 'GENERAL_SHARES'
    }
  ]
};

async function openCloseDialog(budget: unknown) {
  listBudgets.mockResolvedValue([budget]);
  const confirm = vi.spyOn(Modal, 'confirm').mockReturnValue({ destroy: vi.fn(), update: vi.fn() } as any);
  mount();
  fireEvent.click(await screen.findByText('Clôturer', {}, { timeout: 15000 }));
  await waitFor(() => expect(confirm).toHaveBeenCalled());
  const config = confirm.mock.calls[0][0] as { content: React.ReactNode };
  return render(<AntApp>{config.content}</AntApp>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  listChargeCallBatches.mockResolvedValue([]);
  listSyndicateLots.mockResolvedValue([]);
});

describe('budgetActualTotal', () => {
  it('utilise actualTotal du budget, puis des postes, puis amountActual', () => {
    expect(budgetActualTotal({ ...baseBudget, actualTotal: 99 } as any)).toBe(99);
    expect(budgetActualTotal(baseBudget as any)).toBe(45000);
    expect(
      budgetActualTotal({ lines: [{ amountActual: '1000' }, { amountActual: 500, actualTotal: 700 }] } as any)
    ).toBe(1700);
  });
});

describe('SyndicBudgets — dialogue de clôture avec coût d incidents (C1)', () => {
  it('affiche le réalisé complet et non 0', async () => {
    const view = await openCloseDialog(baseBudget);
    const realise = view.getByText(/Total réalisé/).textContent ?? '';
    expect(realise).toMatch(/45\D?000/);
    expect(view.queryByText(/non rattachée/)).toBeNull();
  });

  it('avertit quand des pièces ne sont pas rattachées à un poste', async () => {
    const view = await openCloseDialog({
      ...baseBudget,
      unattached: { invoicesCount: 2, invoicesAmount: 10000, imputationsCount: 1, imputationsAmount: 5000 }
    });
    expect(view.getByText(/3 facture\(s\) \/ imputation\(s\) non rattachée\(s\) à un poste/)).toBeTruthy();
  });
});
