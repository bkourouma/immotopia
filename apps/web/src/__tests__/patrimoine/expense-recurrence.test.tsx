import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';

/**
 * Périodicité d'une dépense (spec 030) : une dépense mensuelle, trimestrielle ou
 * annuelle alimente le plan de trésorerie. Rendu avec le vrai antd.
 */

const createExpense = vi.fn();
const listExpenses = vi.fn();

vi.mock('../../services/patrimoine-service', () => ({
  createExpense: (...a: unknown[]) => createExpense(...a),
  createLoan: vi.fn(),
  createValuation: vi.fn(),
  createWorkProgram: vi.fn(),
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
  listExpenses: (...a: unknown[]) => listExpenses(...a),
  listLoans: vi.fn(async () => []),
  listWorkPrograms: vi.fn(async () => []),
  listValuations: vi.fn(async () => []),
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
vi.mock('../../components/patrimoine/YieldCalculator', () => ({ YieldCalculator: () => null }));
vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({ YieldProjectionChart: () => null }));
vi.mock('../../components/patrimoine/WorkProgramTimeline', () => ({ WorkProgramTimeline: () => null }));
vi.mock('../../components/patrimoine/DocumentVault', () => ({ DocumentVault: () => null }));

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

async function remplirDepense(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Assurance multirisque');
  await userEvent.type(within(dialog).getByLabelText('Montant'), '45000');
  await userEvent.type(within(dialog).getByLabelText('Date de paiement'), '2026-09-05T09:00');
}

async function choisirPeriodicite(dialog: HTMLElement, libelle: string) {
  await userEvent.click(within(dialog).getByLabelText('Périodicité'));
  await userEvent.click(await screen.findByTitle(libelle));
}

beforeEach(() => {
  vi.clearAllMocks();
  listExpenses.mockResolvedValue([]);
  createExpense.mockResolvedValue({ id: 'e1' });
});

describe('Dépense d’un bien — périodicité', () => {
  it('propose Ponctuelle par défaut et masque la date de fin', async () => {
    mount();
    const dialog = await ouvrirModaleDepense();
    expect(within(dialog).getByText('Ponctuelle')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Date de fin')).not.toBeInTheDocument();
  });

  it('envoie la périodicité mensuelle et sa date de fin', async () => {
    mount();
    const dialog = await ouvrirModaleDepense();
    await remplirDepense(dialog);
    await choisirPeriodicite(dialog, 'Mensuelle');
    await userEvent.type(await within(dialog).findByLabelText('Date de fin'), '2027-12-31');
    await userEvent.click(within(dialog).getByRole('button', { name: /OK|Enregistrer/ }));

    await waitFor(() => expect(createExpense).toHaveBeenCalled());
    const payload = createExpense.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.recurrence).toBe('MONTHLY');
    expect(payload.recurrenceEndDate).toBe(new Date('2027-12-31').toISOString());
  });

  it("refuse une dépense périodique datée dans le futur (la date est celle d'un paiement déjà effectué)", async () => {
    mount();
    const dialog = await ouvrirModaleDepense();
    await userEvent.type(within(dialog).getByLabelText('Libellé'), 'Assurance multirisque');
    await userEvent.type(within(dialog).getByLabelText('Montant'), '45000');
    await userEvent.type(within(dialog).getByLabelText('Date de paiement'), '2099-01-05T09:00');
    await choisirPeriodicite(dialog, 'Mensuelle');
    await userEvent.click(within(dialog).getByRole('button', { name: /OK|Enregistrer/ }));

    expect(
      await within(dialog).findByText("La date de paiement d'une dépense périodique ne peut pas être dans le futur")
    ).toBeInTheDocument();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("n'envoie pas de date de fin pour une dépense ponctuelle", async () => {
    mount();
    const dialog = await ouvrirModaleDepense();
    await remplirDepense(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /OK|Enregistrer/ }));

    await waitFor(() => expect(createExpense).toHaveBeenCalled());
    const payload = createExpense.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.recurrence).toBe('ONE_OFF');
    expect(payload.recurrenceEndDate).toBeNull();
  });

  it('affiche la périodicité dans la liste des dépenses', async () => {
    listExpenses.mockResolvedValue([
      {
        id: 'e2',
        propertyId: 'property-1',
        tenantId: 'tenant-1',
        category: 'INSURANCE',
        label: 'Assurance annuelle',
        amount: 120000,
        currency: 'XOF',
        paidAt: '2026-03-01T00:00:00.000Z',
        isCapitalized: false,
        recurrence: 'ANNUAL',
        recurrenceEndDate: null
      }
    ]);
    mount();
    expect(await screen.findByText('Assurance annuelle')).toBeInTheDocument();
    expect(screen.getByText('Annuelle')).toBeInTheDocument();
  });
});
