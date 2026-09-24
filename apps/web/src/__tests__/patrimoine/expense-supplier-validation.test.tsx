import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';

/**
 * Dépense d'un bien — lot 10, conformité SYSCOHADA.
 *
 * Quand l'agence a commandé et doit la facture, le fournisseur devient
 * obligatoire (contrat : `supplierName` requis si `agencyIsBuyer`). Rendu avec
 * le vrai antd : c'est la règle du Form.Item qui est vérifiée. Chaque `vi.mock`
 * couvre tous les exports utilisés par le composant (AGENTS.md).
 */

const createExpense = vi.fn();

vi.mock('../../services/patrimoine-service', () => ({
  createDocument: vi.fn(),
  createExpense: (...a: unknown[]) => createExpense(...a),
  createLoan: vi.fn(),
  createValuation: vi.fn(),
  createWorkProgram: vi.fn(),
  deleteDocument: vi.fn(),
  deleteExpense: vi.fn(),
  deleteLoan: vi.fn(),
  deleteValuation: vi.fn(),
  deleteWorkProgram: vi.fn(),
  getPropertyYield: vi.fn(async () => ({
    grossYield: 0,
    netYield: 0,
    netNetYield: 0,
    latentCapitalGain: 0,
    projection: []
  })),
  listDocuments: vi.fn(async () => []),
  listExpenses: vi.fn(async () => []),
  listLoans: vi.fn(async () => []),
  listWorkPrograms: vi.fn(async () => []),
  listValuations: vi.fn(async () => []),
  updateExpense: vi.fn(),
  updateLoan: vi.fn(),
  updateValuation: vi.fn(),
  updateWorkProgram: vi.fn()
}));

vi.mock('../../services/crm-service', () => ({
  listContacts: vi.fn(async () => ({ contacts: [], pagination: { total: 0 } }))
}));

vi.mock('../../services/property-service', () => ({
  uploadDocument: vi.fn()
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn(async () => [])
}));

// Composants d'affichage sans rapport avec le formulaire de dépense.
vi.mock('../../components/patrimoine/ValuationHistory', () => ({ ValuationHistory: () => null }));
vi.mock('../../components/patrimoine/ExpenseTracker', () => ({ ExpenseTracker: () => null }));
vi.mock('../../components/patrimoine/LoanWidget', () => ({ LoanWidget: () => null }));
vi.mock('../../components/patrimoine/YieldCalculator', () => ({ YieldCalculator: () => null }));
vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({ YieldProjectionChart: () => null }));
vi.mock('../../components/patrimoine/WorkProgramTimeline', () => ({ WorkProgramTimeline: () => null }));
vi.mock('../../components/patrimoine/DocumentVault', () => ({ DocumentVault: () => null }));

const MESSAGE_FOURNISSEUR = 'Le fournisseur est requis quand l’agence a commandé';

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <PropertyPatrimoineTab tenantId="tenant-1" propertyId="property-1" />
      </AntApp>
    </QueryClientProvider>
  );
}

async function ouvrirModaleDepense() {
  const carte = await screen.findByText('Gérer les dépenses');
  const card = carte.closest('.ant-card') as HTMLElement;
  await userEvent.click(within(card).getByRole('button', { name: 'Ajouter' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dépense d’un bien — fournisseur requis si l’agence a commandé', () => {
  it('n’affiche pas le champ fournisseur tant que la case n’est pas cochée', async () => {
    mount();
    const modale = await ouvrirModaleDepense();
    expect(within(modale).queryByLabelText('Fournisseur')).toBeNull();
  });

  it('exige le fournisseur quand l’agence a commandé et bloque l’enregistrement', async () => {
    mount();
    const modale = await ouvrirModaleDepense();

    await userEvent.click(within(modale).getByRole('switch', { name: "L'agence a commandé et doit la facture" }));
    expect(await within(modale).findByLabelText('Fournisseur')).toBeTruthy();

    await userEvent.click(within(modale).getByRole('button', { name: /ok/i }));

    await waitFor(() => {
      expect(within(modale).getByText(MESSAGE_FOURNISSEUR)).toBeTruthy();
    });
    expect(createExpense).not.toHaveBeenCalled();
  });
});
