import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import * as patrimoineService from '../../services/patrimoine-service';
import * as propertyService from '../../services/property-service';

/**
 * Documents patrimoniaux = documents de bien (`PropertyDocument`) — routes
 * `.../properties/:id/documents` (`packages/api/src/routes/property-routes.ts`).
 * Chaque `vi.mock` couvre tous les exports utilisés par le composant
 * (AGENTS.md) : Vitest, à la différence de Jest, refuse en silence tout
 * import qu'il ne trouve pas dans la factory.
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
  listPropertyDocuments: vi.fn(),
  deletePropertyDocument: vi.fn(),
  downloadPropertyDocumentFile: vi.fn()
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn(async () => [])
}));

vi.mock('../../components/patrimoine/ValuationHistory', () => ({
  ValuationHistory: ({ valuations }: { valuations: Array<{ id: string }> }) => (
    <div data-testid="valuation-history">{valuations.length}</div>
  )
}));

vi.mock('../../components/patrimoine/ExpenseTracker', () => ({
  ExpenseTracker: ({ expenses }: { expenses: Array<{ id: string }> }) => (
    <div data-testid="expense-tracker">{expenses.length}</div>
  )
}));

vi.mock('../../components/patrimoine/LoanWidget', () => ({
  LoanWidget: ({ loans }: { loans: Array<{ id: string }> }) => <div data-testid="loan-widget">{loans.length}</div>
}));

vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({
  YieldProjectionChart: ({ data }: { data: Array<{ year: number }> }) => (
    <div data-testid="yield-projection">{data.length}</div>
  )
}));

vi.mock('../../components/patrimoine/WorkProgramTimeline', () => ({
  WorkProgramTimeline: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="work-program-timeline">{items.length}</div>
  )
}));

vi.mock('../../components/patrimoine/YieldCalculator', () => ({
  YieldCalculator: ({
    onRecalculate
  }: {
    onRecalculate?: (a: {
      years: number;
      valueGrowthRate: number;
      rentGrowthRate: number;
      expenseGrowthRate: number;
      vacancyRate: number;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onRecalculate?.({
          years: 5,
          valueGrowthRate: 0.03,
          rentGrowthRate: 0.02,
          expenseGrowthRate: 0.02,
          vacancyRate: 0.04
        })
      }
    >
      recalc-yield
    </button>
  )
}));

const baseValuation = {
  id: 'valuation-1',
  propertyId: 'property-1',
  tenantId: 'tenant-1',
  valuatedAt: new Date().toISOString(),
  estimatedValue: 100,
  currency: 'XOF',
  method: 'MANUAL' as const
};

const baseExpense = {
  id: 'expense-1',
  propertyId: 'property-1',
  tenantId: 'tenant-1',
  category: 'OTHER' as const,
  label: 'Test',
  amount: 10,
  currency: 'XOF',
  paidAt: new Date().toISOString(),
  isCapitalized: false
};

const baseLoan = {
  id: 'loan-1',
  propertyId: 'property-1',
  tenantId: 'tenant-1',
  lender: 'Bank',
  capitalAmount: 100,
  remainingCapital: 90,
  interestRate: 5,
  monthlyPayment: 2,
  currency: 'XOF',
  startDate: new Date().toISOString(),
  endDate: new Date().toISOString(),
  status: 'ACTIVE' as const
};

const baseYield = {
  grossYield: 10,
  netYield: 9,
  netNetYield: 8,
  latentCapitalGain: 1000,
  projection: []
};

const baseDocument = {
  id: 'doc-1',
  propertyId: 'property-1',
  documentType: 'OTHER',
  fileName: 'doc.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  isRequired: false
};

function mockLoadAll(overrides: { documents?: unknown[]; workPrograms?: unknown[] } = {}) {
  vi.mocked(patrimoineService.listValuations).mockResolvedValue([baseValuation] as never);
  vi.mocked(patrimoineService.listExpenses).mockResolvedValue([baseExpense] as never);
  vi.mocked(patrimoineService.listLoans).mockResolvedValue([baseLoan] as never);
  vi.mocked(patrimoineService.listWorkPrograms).mockResolvedValue((overrides.workPrograms ?? []) as never);
  vi.mocked(propertyService.listPropertyDocuments).mockResolvedValue((overrides.documents ?? [baseDocument]) as never);
  vi.mocked(patrimoineService.getPropertyYield).mockResolvedValue(baseYield as never);
}

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PropertyPatrimoineTab — chargement et rendement', () => {
  it('charge chaque section et déclenche le recalcul du rendement', async () => {
    mockLoadAll();

    mount();

    await waitFor(() => {
      expect(patrimoineService.listValuations).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(patrimoineService.listExpenses).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(patrimoineService.listLoans).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(patrimoineService.listWorkPrograms).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(propertyService.listPropertyDocuments).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(patrimoineService.getPropertyYield).toHaveBeenCalledWith('tenant-1', 'property-1');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'recalc-yield' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: 'recalc-yield' }));
    await waitFor(() => {
      expect(patrimoineService.getPropertyYield).toHaveBeenLastCalledWith('tenant-1', 'property-1', {
        years: 5,
        valueGrowthRate: 0.03,
        rentGrowthRate: 0.02,
        expenseGrowthRate: 0.02,
        vacancyRate: 0.04
      });
    });
  });

  it('conserve les hypothèses de projection après rechargement (BUG-033)', async () => {
    mockLoadAll();
    const premier = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'recalc-yield' }));
    await waitFor(() => expect(patrimoineService.getPropertyYield).toHaveBeenCalledTimes(2));
    premier.unmount();

    // « Rechargement » : nouveau montage, le chargement initial reprend les hypothèses.
    vi.mocked(patrimoineService.getPropertyYield).mockClear();
    mount();
    await waitFor(() => {
      expect(patrimoineService.getPropertyYield).toHaveBeenCalledWith('tenant-1', 'property-1', {
        years: 5,
        valueGrowthRate: 0.03,
        rentGrowthRate: 0.02,
        expenseGrowthRate: 0.02,
        vacancyRate: 0.04
      });
    });
  });

  it("isole l'échec d'une section : le rendement en erreur n'empêche pas d'afficher les documents", async () => {
    vi.mocked(patrimoineService.listValuations).mockResolvedValue([baseValuation] as never);
    vi.mocked(patrimoineService.listExpenses).mockResolvedValue([baseExpense] as never);
    vi.mocked(patrimoineService.listLoans).mockResolvedValue([baseLoan] as never);
    vi.mocked(patrimoineService.listWorkPrograms).mockResolvedValue([] as never);
    vi.mocked(propertyService.listPropertyDocuments).mockResolvedValue([baseDocument] as never);
    vi.mocked(patrimoineService.getPropertyYield).mockRejectedValue({
      response: { data: { error: 'Service de rendement indisponible' } }
    } as never);

    mount();

    await waitFor(() => {
      expect(screen.getByText('Service de rendement indisponible')).toBeInTheDocument();
    });
    // Les documents, non affectés par l'échec du rendement, sont bien affichés.
    expect(await screen.findByText('doc.pdf')).toBeInTheDocument();
  });
});

describe('PropertyPatrimoineTab — coffre-fort documentaire', () => {
  it('envoie un fichier réel en multipart avec le type et la date d’expiration choisis', async () => {
    mockLoadAll();
    vi.mocked(propertyService.uploadDocument).mockResolvedValue({} as never);

    mount();

    // Plusieurs cartes ont un bouton « Ajouter » : le coffre-fort documentaire
    // est le dernier de l'écran.
    const boutonsAjouter = await screen.findAllByRole('button', { name: 'Ajouter' });
    await userEvent.click(boutonsAjouter[boutonsAjouter.length - 1]);

    const modale = await screen.findByRole('dialog');

    const fichier = new File(['contenu'], 'titre-foncier.pdf', { type: 'application/pdf' });
    // `<Upload>` d'Ant Design pose son `<input type="file">` sans le relier au
    // `<label>` du `Form.Item` : on le cible par son type, pas par le libellé.
    const input = modale.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, fichier);

    // Type « Arrêté de concession définitive (ACD) » — un des types propres au
    // patrimoine, absent de l'ancienne liste à cinq entrées.
    const typeSelect = within(modale).getByLabelText('Type');
    await userEvent.click(typeSelect);
    await userEvent.click(await screen.findByText('Arrêté de concession définitive (ACD)'));

    const dateInput = within(modale).getByLabelText('Date expiration (optionnelle)');
    await userEvent.type(dateInput, '2030-01-01T00:00');

    await userEvent.click(within(modale).getByRole('button', { name: /ok/i }));

    await waitFor(() => {
      expect(propertyService.uploadDocument).toHaveBeenCalledWith(
        'tenant-1',
        'property-1',
        fichier,
        'LAND_CONCESSION',
        expect.stringContaining('2030-01-01')
      );
    });
  });

  it("affiche l'erreur du serveur quand l'envoi du document échoue", async () => {
    mockLoadAll();
    vi.mocked(propertyService.uploadDocument).mockRejectedValue({
      response: { data: { error: 'Fichier trop volumineux' } }
    });

    mount();

    const boutonsAjouter = await screen.findAllByRole('button', { name: 'Ajouter' });
    await userEvent.click(boutonsAjouter[boutonsAjouter.length - 1]);
    const modale = await screen.findByRole('dialog');

    const fichier = new File(['contenu'], 'plan.pdf', { type: 'application/pdf' });
    const input = modale.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, fichier);

    await userEvent.click(within(modale).getByRole('button', { name: /ok/i }));

    await waitFor(() => {
      expect(screen.getByText('Fichier trop volumineux')).toBeInTheDocument();
    });
  });

  it('supprime un document et affiche l’erreur du serveur en cas d’échec', async () => {
    mockLoadAll();
    vi.mocked(propertyService.deletePropertyDocument).mockRejectedValue({
      response: { data: { error: 'Suppression refusée' } }
    });

    mount();

    const titreCarte = await screen.findByText('Coffre-fort documentaire');
    const carte = titreCarte.closest('.ant-card') as HTMLElement;
    await within(carte).findByText('doc.pdf');
    await userEvent.click(within(carte).getByRole('button', { name: 'Supprimer' }));
    await userEvent.click(await screen.findByRole('button', { name: /ok/i }));

    await waitFor(() => {
      expect(propertyService.deletePropertyDocument).toHaveBeenCalledWith('tenant-1', 'property-1', 'doc-1');
      expect(screen.getByText('Suppression refusée')).toBeInTheDocument();
    });
  });
});

describe('PropertyPatrimoineTab — travaux rattachés à un chantier', () => {
  it('affiche le coût réel en lecture seule et ne l’envoie pas dans le payload', async () => {
    const programmeRattache = {
      id: 'work-1',
      propertyId: 'property-1',
      tenantId: 'tenant-1',
      title: 'Réfection toiture',
      estimatedCost: 5_000_000,
      actualCost: 4_800_000,
      currency: 'XOF',
      plannedDate: new Date().toISOString(),
      status: 'IN_PROGRESS' as const,
      isCapitalized: true,
      constructionSiteId: 'site-1',
      constructionSite: { id: 'site-1', name: 'Résidence Les Palmiers' }
    };
    mockLoadAll({ workPrograms: [programmeRattache] });
    vi.mocked(patrimoineService.updateWorkProgram).mockResolvedValue({} as never);

    mount();

    const titreCarte = await screen.findByText('Gérer les programmes de travaux');
    const carte = titreCarte.closest('.ant-card') as HTMLElement;
    await within(carte).findByText('Réfection toiture');
    await userEvent.click(within(carte).getByRole('button', { name: 'Modifier' }));

    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByText(/Coût réel alimenté par le chantier Résidence Les Palmiers/)).toBeInTheDocument();

    await userEvent.click(within(modale).getByRole('button', { name: /ok/i }));

    await waitFor(() => {
      expect(patrimoineService.updateWorkProgram).toHaveBeenCalled();
    });
    const [, , , payload] = vi.mocked(patrimoineService.updateWorkProgram).mock.calls[0];
    expect(payload).not.toHaveProperty('actualCost');
  });
});
