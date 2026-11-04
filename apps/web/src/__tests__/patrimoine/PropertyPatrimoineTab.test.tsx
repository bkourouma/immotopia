import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
  listPropertyDocuments: vi.fn(),
  deletePropertyDocument: vi.fn(),
  downloadPropertyDocumentFile: vi.fn()
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn(async () => [])
}));

// Bureau : la barre de recherche des tableaux s'affiche en ligne.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
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
    onRecalculate,
    syncStatus
  }: {
    syncStatus?: string;
    onRecalculate?: (a: {
      years: number;
      valueGrowthRate: number;
      rentGrowthRate: number;
      expenseGrowthRate: number;
      vacancyRate: number;
    }) => void;
  }) => (
    <div>
      <span data-testid="sync-status">{syncStatus}</span>
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
    </div>
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

const defaultsServeur = {
  years: 10,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.025,
  vacancyRate: 0.05
};

const hypothesesRecalcul = {
  years: 5,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.02,
  vacancyRate: 0.04
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
  vi.mocked(patrimoineService.getYieldAssumptions).mockResolvedValue({
    assumptions: defaultsServeur,
    saved: false,
    updatedAt: null
  });
  vi.mocked(patrimoineService.saveYieldAssumptions).mockImplementation(async (_t, _p, assumptions) => ({
    assumptions,
    saved: true,
    updatedAt: '2026-10-01T00:00:00.000Z'
  }));
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

/** La rubrique affichée vient de l'URL (`?rubrique=…`), comme dans l'écran du bien. */
function mount(initial = '/biens/property-1?onglet=patrimoine') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <PropertyPatrimoineTab tenantId="tenant-1" propertyId="property-1" />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };
const ouvrirRubrique = (nom: string) => userEvent.click(screen.getByRole('tab', { name: nom }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('PropertyPatrimoineTab — chargement et rendement', () => {
  it('au montage, seule la synthèse charge sa donnée ; chaque autre rubrique charge à son affichage', async () => {
    mockLoadAll();

    mount();

    await waitFor(() => {
      expect(patrimoineService.getPropertyYield).toHaveBeenCalledWith('tenant-1', 'property-1');
    });
    expect(patrimoineService.listValuations).not.toHaveBeenCalled();
    expect(patrimoineService.listExpenses).not.toHaveBeenCalled();
    expect(patrimoineService.listLoans).not.toHaveBeenCalled();
    expect(patrimoineService.listWorkPrograms).not.toHaveBeenCalled();
    expect(propertyService.listPropertyDocuments).not.toHaveBeenCalled();

    await ouvrirRubrique('Valorisations');
    await waitFor(() => expect(patrimoineService.listValuations).toHaveBeenCalledWith('tenant-1', 'property-1'));
    expect(screen.getByTestId('url').textContent).toContain('rubrique=valorisations');
    expect(patrimoineService.listExpenses).not.toHaveBeenCalled();

    await ouvrirRubrique('Dépenses');
    await waitFor(() => expect(patrimoineService.listExpenses).toHaveBeenCalledWith('tenant-1', 'property-1'));
    await ouvrirRubrique('Crédits');
    await waitFor(() => expect(patrimoineService.listLoans).toHaveBeenCalledWith('tenant-1', 'property-1'));
    await ouvrirRubrique('Travaux');
    await waitFor(() => expect(patrimoineService.listWorkPrograms).toHaveBeenCalledWith('tenant-1', 'property-1'));
    await ouvrirRubrique('Documents');
    await waitFor(() => expect(propertyService.listPropertyDocuments).toHaveBeenCalledWith('tenant-1', 'property-1'));
  });

  it('ne recharge pas une rubrique déjà chargée quand on y revient', async () => {
    mockLoadAll();
    mount();
    await waitFor(() => expect(patrimoineService.getPropertyYield).toHaveBeenCalledTimes(1));

    await ouvrirRubrique('Valorisations');
    await waitFor(() => expect(patrimoineService.listValuations).toHaveBeenCalledTimes(1));
    await ouvrirRubrique('Synthèse');
    await ouvrirRubrique('Valorisations');
    await screen.findByText('Gérer les valorisations', undefined, T);

    expect(patrimoineService.listValuations).toHaveBeenCalledTimes(1);
    expect(patrimoineService.getPropertyYield).toHaveBeenCalledTimes(1);
  });

  it('applique la rubrique de l’URL et retombe sur la synthèse si elle est inconnue', async () => {
    mockLoadAll();
    mount('/biens/property-1?onglet=patrimoine&rubrique=n-importe-quoi');
    await waitFor(() => expect(patrimoineService.getPropertyYield).toHaveBeenCalled());
    expect(patrimoineService.listValuations).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Synthèse' })).toHaveAttribute('aria-selected', 'true');
  });

  it('change de rubrique sans toucher aux autres paramètres de l’URL', async () => {
    mockLoadAll();
    mount('/biens/property-1?onglet=patrimoine');
    await waitFor(() => expect(patrimoineService.getPropertyYield).toHaveBeenCalled());
    await ouvrirRubrique('Crédits');
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).toContain('onglet=patrimoine');
    expect(url).toContain('rubrique=credits');
  });

  it('charge le rendement et déclenche son recalcul', async () => {
    mockLoadAll();

    mount();

    await waitFor(() => {
      expect(patrimoineService.getPropertyYield).toHaveBeenCalledWith('tenant-1', 'property-1');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'recalc-yield' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: 'recalc-yield' }));
    await waitFor(() => {
      // Le calcul part avec les hypothèses saisies ET elles sont persistées sur le serveur.
      expect(patrimoineService.saveYieldAssumptions).toHaveBeenCalledWith('tenant-1', 'property-1', hypothesesRecalcul);
      expect(patrimoineService.getPropertyYield).toHaveBeenLastCalledWith('tenant-1', 'property-1', hypothesesRecalcul);
    });
    await waitFor(() => expect(screen.getByTestId('sync-status')).toHaveTextContent('synced'));
  });

  it('signale « non synchronisé » quand la persistance échoue, sans bloquer le calcul', async () => {
    mockLoadAll();
    vi.mocked(patrimoineService.saveYieldAssumptions).mockRejectedValue({ response: { status: 403 } });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'recalc-yield' }));
    await waitFor(() => expect(screen.getByTestId('sync-status')).toHaveTextContent('local'));
    expect(patrimoineService.getPropertyYield).toHaveBeenLastCalledWith('tenant-1', 'property-1', hypothesesRecalcul);
    expect(screen.getByTestId('yield-projection')).toBeInTheDocument();
  });

  it('migre au chargement une valeur locale valide quand le serveur n’a rien (un seul PUT)', async () => {
    mockLoadAll();
    window.localStorage.setItem(
      'patrimoine:performance:assumptions:tenant-1:property-1',
      JSON.stringify(hypothesesRecalcul)
    );
    mount();
    await waitFor(() => {
      expect(patrimoineService.getPropertyYield).toHaveBeenCalledWith('tenant-1', 'property-1', hypothesesRecalcul);
    });
    expect(patrimoineService.saveYieldAssumptions).toHaveBeenCalledTimes(1);
  });

  it('conserve les hypothèses de projection après rechargement (BUG-033)', async () => {
    mockLoadAll();
    const premier = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'recalc-yield' }));
    await waitFor(() => expect(patrimoineService.getPropertyYield).toHaveBeenCalledTimes(2));
    premier.unmount();

    // « Rechargement » : le serveur renvoie désormais la ligne enregistrée.
    vi.mocked(patrimoineService.getPropertyYield).mockClear();
    vi.mocked(patrimoineService.getYieldAssumptions).mockResolvedValue({
      assumptions: hypothesesRecalcul,
      saved: true,
      updatedAt: '2026-10-01T00:00:00.000Z'
    });
    mount();
    await waitFor(() => {
      expect(patrimoineService.getPropertyYield).toHaveBeenCalledWith('tenant-1', 'property-1', hypothesesRecalcul);
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
    // Les documents, non affectés par l'échec du rendement, sont bien affichés dans leur rubrique.
    await ouvrirRubrique('Documents');
    expect(await screen.findByText('doc.pdf', undefined, T)).toBeInTheDocument();
  });
});

describe('PropertyPatrimoineTab — coffre-fort documentaire', () => {
  it('envoie un fichier réel en multipart avec le type et la date d’expiration choisis', async () => {
    mockLoadAll();
    vi.mocked(propertyService.uploadDocument).mockResolvedValue({} as never);

    mount('/biens/property-1?rubrique=documents');

    // La rubrique Documents n'affiche que le coffre-fort documentaire.
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

    mount('/biens/property-1?rubrique=documents');

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

    mount('/biens/property-1?rubrique=documents');

    const titreCarte = await screen.findByText('Coffre-fort documentaire', undefined, T);
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

    mount('/biens/property-1?rubrique=travaux');

    const titreCarte = await screen.findByText('Gérer les programmes de travaux', undefined, T);
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
