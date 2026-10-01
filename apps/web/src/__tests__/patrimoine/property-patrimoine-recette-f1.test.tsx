import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import { queryKey } from '../../lib/query-keys';
import * as patrimoineService from '../../services/patrimoine-service';

/**
 * Lot F1 — BUG-2026-10-01-002 (la valeur marchande du profil fiscal doit suivre
 * les valorisations) et BUG-2026-10-01-010 (le total des charges exclut les
 * dépenses capitalisées, comme le rendement net de l'API).
 */

vi.mock('../../services/patrimoine-service', () => ({
  createExpense: vi.fn(),
  createLoan: vi.fn(),
  createValuation: vi.fn(),
  createWorkProgram: vi.fn(),
  deleteExpense: vi.fn(),
  deleteLoan: vi.fn(),
  deleteValuation: vi.fn(),
  deleteWorkProgram: vi.fn(),
  downloadPatrimoineExport: vi.fn(),
  getPropertyYield: vi.fn(),
  getYieldAssumptions: vi.fn(),
  saveYieldAssumptions: vi.fn(),
  listExpenses: vi.fn(),
  listLoans: vi.fn(),
  listWorkPrograms: vi.fn(),
  listValuations: vi.fn(),
  updateExpense: vi.fn(),
  updateLoan: vi.fn(),
  updateValuation: vi.fn(),
  updateWorkProgram: vi.fn()
}));

vi.mock('../../services/property-service', () => ({
  uploadDocument: vi.fn(),
  listPropertyDocuments: vi.fn(async () => []),
  deletePropertyDocument: vi.fn(),
  downloadPropertyDocumentFile: vi.fn()
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn(async () => [])
}));

vi.mock('../../components/patrimoine/ValuationHistory', () => ({ ValuationHistory: () => null }));
vi.mock('../../components/patrimoine/ExpenseTracker', () => ({ ExpenseTracker: () => null }));
vi.mock('../../components/patrimoine/LoanWidget', () => ({ LoanWidget: () => null }));
vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({ YieldProjectionChart: () => null }));
vi.mock('../../components/patrimoine/WorkProgramTimeline', () => ({ WorkProgramTimeline: () => null }));
vi.mock('../../components/patrimoine/YieldCalculator', () => ({ YieldCalculator: () => null }));

const baseValuation = {
  id: 'valuation-1',
  propertyId: 'property-1',
  tenantId: 'tenant-1',
  valuatedAt: new Date().toISOString(),
  estimatedValue: 100,
  currency: 'XOF',
  method: 'MANUAL' as const
};

const depense = (id: string, amount: number, isCapitalized: boolean) => ({
  id,
  propertyId: 'property-1',
  tenantId: 'tenant-1',
  category: 'OTHER' as const,
  label: id,
  amount,
  currency: 'XOF',
  paidAt: new Date().toISOString(),
  isCapitalized
});

function mockLoadAll(expenses: unknown[] = []) {
  vi.mocked(patrimoineService.listValuations).mockResolvedValue([baseValuation] as never);
  vi.mocked(patrimoineService.listExpenses).mockResolvedValue(expenses as never);
  vi.mocked(patrimoineService.listLoans).mockResolvedValue([] as never);
  vi.mocked(patrimoineService.listWorkPrograms).mockResolvedValue([] as never);
  vi.mocked(patrimoineService.getPropertyYield).mockResolvedValue({
    grossYield: 10,
    netYield: 9,
    netNetYield: 8,
    latentCapitalGain: 1000,
    projection: []
  } as never);
  vi.mocked(patrimoineService.getYieldAssumptions).mockResolvedValue({
    assumptions: {
      years: 10,
      valueGrowthRate: 0.03,
      rentGrowthRate: 0.02,
      expenseGrowthRate: 0.025,
      vacancyRate: 0.05
    },
    saved: false,
    updatedAt: null
  });
}

/** Observateur au même clé que PropertyHoldingTaxSection (profil fiscal du bien). */
const ProfilObserver: React.FC<{ fetchProfile: () => Promise<unknown> }> = ({ fetchProfile }) => {
  useQuery({
    queryKey: queryKey('property-tax-profile', 'tenant-1', { propertyId: 'property-1' }),
    queryFn: fetchProfile
  });
  return null;
};

function mount(fetchProfile: () => Promise<unknown> = async () => ({})) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <ProfilObserver fetchProfile={fetchProfile} />
        <PropertyPatrimoineTab tenantId="tenant-1" propertyId="property-1" />
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('PropertyPatrimoineTab — recette F1', () => {
  it('relance la requête du profil fiscal après la suppression d’une valorisation', async () => {
    mockLoadAll();
    vi.mocked(patrimoineService.deleteValuation).mockResolvedValue(undefined as never);
    const fetchProfile = vi.fn(async () => ({ marketValue: 100 }));
    mount(fetchProfile);

    const titre = await screen.findByText('Gérer les valorisations');
    const carte = titre.closest('.ant-card') as HTMLElement;
    await waitFor(() => expect(fetchProfile).toHaveBeenCalledTimes(1));
    await userEvent.click(await within(carte).findByRole('button', { name: 'Supprimer' }));
    await userEvent.click(await screen.findByRole('button', { name: /ok/i }));

    await waitFor(() => expect(patrimoineService.deleteValuation).toHaveBeenCalled());
    await waitFor(() => expect(fetchProfile).toHaveBeenCalledTimes(2));
  });

  it('exclut les dépenses capitalisées du total des charges de l’année', async () => {
    mockLoadAll([depense('charges', 400_000, false), depense('renovation', 5_000_000, true)]);
    mount();

    const alerte = await screen.findByText(/Total des charges de l'année en cours/);
    expect(alerte.textContent).toMatch(/400\D000/);
    expect(alerte.textContent).not.toMatch(/5\D400\D000/);
    expect(alerte.textContent).not.toMatch(/5\D000\D000/);
  });
});
