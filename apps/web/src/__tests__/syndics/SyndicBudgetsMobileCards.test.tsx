import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';
import { authValue } from './charges-form-modes-mock';

/** Budgets sous 992 px : des cartes avec totaux et écart lisibles, au lieu d'un tableau à défilement. */

const T = { timeout: 15000 };

vi.mock('../../hooks/useFormFieldModes', async () => (await import('./charges-form-modes-mock')).formModesModule);

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
}));

// Le bouton « Exporter » a ses propres tests.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const listBudgets = vi.fn();
const updateBudget = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listChargeCallBatches: vi.fn(async () => []),
  listSyndicateLots: vi.fn(async () => []),
  createBudget: vi.fn(),
  updateBudget: (...args: unknown[]) => updateBudget(...args),
  recomputeBudgetAllocations: vi.fn(),
  generateBudgetChargeCalls: vi.fn(),
  createChargeCallBatch: vi.fn(),
  listSyndicateFunds: vi.fn(async () => []),
  assignBudgetLineFund: vi.fn()
}));

const BUDGET = {
  id: 'budget-1',
  syndicateId: 'syndic-1',
  fiscalYear: 2026,
  label: 'Budget courant',
  totalAmount: 1000000,
  currency: 'XOF',
  status: 'DRAFT',
  createdAt: '2026-01-01T00:00:00.000Z',
  actualTotal: 1200000,
  allocations: [],
  lines: []
};

function mount() {
  render(
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

describe('SyndicBudgets — cartes mobiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBudgets.mockResolvedValue([BUDGET]);
    updateBudget.mockResolvedValue({ ...BUDGET, status: 'APPROVED' });
  });

  it('affiche une carte avec le réalisé et un dépassement dit en toutes lettres', async () => {
    mount();

    expect(await screen.findByText('Budget courant', {}, T)).toBeInTheDocument();
    expect(screen.getByText('Exercice 2026')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByText(/dépassement/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it("garde l'action principale (Approuver) visible et l'exécute", async () => {
    mount();

    fireEvent.click(await screen.findByRole('button', { name: /Approuver/ }, T));

    await waitFor(() =>
      expect(updateBudget).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'budget-1', { status: 'APPROVED' })
    );
  });

  it('range les autres actions derrière « Autres actions »', async () => {
    mount();

    expect(await screen.findByRole('button', { name: 'Autres actions' }, T)).toBeInTheDocument();
  });
});
