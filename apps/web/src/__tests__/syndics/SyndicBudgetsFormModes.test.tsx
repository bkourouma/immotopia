import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';
import { authValue, formModes } from './charges-form-modes-mock';

/** Réglage du champ « Fonds alimenté par ce poste » du formulaire de budget. */

const T = { timeout: 15000 };

vi.mock('../../hooks/useFormFieldModes', async () => (await import('./charges-form-modes-mock')).formModesModule);

const createBudget = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: vi.fn(async () => []),
  listChargeCallBatches: vi.fn(async () => []),
  listSyndicateLots: vi.fn(async () => []),
  createBudget: (...args: unknown[]) => createBudget(...args),
  updateBudget: vi.fn(),
  recomputeBudgetAllocations: vi.fn(),
  generateBudgetChargeCalls: vi.fn(),
  createChargeCallBatch: vi.fn(),
  listSyndicateFunds: vi.fn(async () => [{ id: 'fund-1', name: 'Fonds travaux' }]),
  assignBudgetLineFund: vi.fn()
}));

async function openCreateModal() {
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
  fireEvent.click(await screen.findByRole('button', { name: /Nouveau budget/ }, T));
  await screen.findByText('Postes du budget', {}, T);
}

describe('SyndicBudgets — champ réglable du fonds par poste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formModes.current = {};
  });

  it('sans réglage : le fonds est facultatif', async () => {
    await openCreateModal();
    expect(await screen.findByText('Fonds alimenté par ce poste (optionnel)', {}, T)).toBeTruthy();
  }, 120000);

  it('masqué : le champ est absent', async () => {
    formModes.current = { 'lines[].fundId': 'HIDDEN' };
    await openCreateModal();
    expect(screen.queryByText(/Fonds alimenté par ce poste/)).toBeNull();
  }, 120000);

  it('obligatoire : message de validation, aucun appel API', async () => {
    formModes.current = { 'lines[].fundId': 'REQUIRED' };
    await openCreateModal();
    fireEvent.click(screen.getByRole('button', { name: /Créer le budget/ }));
    expect(await screen.findByText('Le fonds alimenté est obligatoire', {}, T)).toBeTruthy();
    await waitFor(() => expect(createBudget).not.toHaveBeenCalled());
  }, 120000);
});

// Les écrans « charges » et « budgets » basculent en cartes sous 992 px : ici on teste la disposition tableau.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
