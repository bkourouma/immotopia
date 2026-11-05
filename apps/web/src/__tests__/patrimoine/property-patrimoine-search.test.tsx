import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import { DocumentVault } from '../../components/patrimoine/DocumentVault';
import * as patrimoineService from '../../services/patrimoine-service';
import * as propertyService from '../../services/property-service';

/**
 * Onglet Patrimoine d'un bien : rubriques paresseuses et recherche locale.
 * Chaque `vi.mock` de service couvre CHAQUE export utilisé (Vitest refuse un
 * import non déclaré).
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

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

vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({ YieldProjectionChart: () => null }));
vi.mock('../../components/patrimoine/YieldCalculator', () => ({ YieldCalculator: () => null }));
vi.mock('../../components/patrimoine/WorkProgramTimeline', () => ({ WorkProgramTimeline: () => null }));

const T = { timeout: 8000 };

const depense = (id: string, label: string, category = 'OTHER', amount = 10_000) => ({
  id,
  propertyId: 'property-1',
  tenantId: 'tenant-1',
  category,
  label,
  amount,
  currency: 'XOF',
  paidAt: '2026-03-05T10:00:00.000Z',
  isCapitalized: false
});

const document = (id: string, fileName: string, documentType = 'OTHER', expirationDate?: string) => ({
  id,
  propertyId: 'property-1',
  documentType,
  fileName,
  isRequired: false,
  isValid: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...(expirationDate ? { expirationDate } : {})
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(
  initial: string,
  element: React.ReactElement = <PropertyPatrimoineTab tenantId="tenant-1" propertyId="property-1" />
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/biens/:propertyId" element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(patrimoineService.listValuations).mockResolvedValue([] as never);
  vi.mocked(patrimoineService.listExpenses).mockResolvedValue([
    depense('e1', 'Assurance multirisque', 'INSURANCE', 120_000),
    depense('e2', 'Peinture façade', 'RENOVATION', 800_000)
  ] as never);
  vi.mocked(patrimoineService.listLoans).mockResolvedValue([] as never);
  vi.mocked(patrimoineService.listWorkPrograms).mockResolvedValue([] as never);
  vi.mocked(propertyService.listPropertyDocuments).mockResolvedValue([
    document('d1', 'titre-foncier.pdf', 'TITLE_DEED'),
    document('d2', 'assurance-2024.pdf', 'INSURANCE', '2020-01-01T00:00:00.000Z')
  ] as never);
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
});

describe('Onglet Patrimoine — rubriques paresseuses', () => {
  it('au montage, seule la synthèse appelle son service', async () => {
    mount('/biens/property-1');
    await waitFor(() => expect(patrimoineService.getPropertyYield).toHaveBeenCalled(), T);
    expect(patrimoineService.listValuations).not.toHaveBeenCalled();
    expect(patrimoineService.listExpenses).not.toHaveBeenCalled();
    expect(patrimoineService.listLoans).not.toHaveBeenCalled();
    expect(patrimoineService.listWorkPrograms).not.toHaveBeenCalled();
    expect(propertyService.listPropertyDocuments).not.toHaveBeenCalled();
  });

  it('?rubrique=depenses appelle listExpenses et pas listValuations', async () => {
    mount('/biens/property-1?rubrique=depenses');
    expect(await screen.findByText('Assurance multirisque', undefined, T)).toBeInTheDocument();
    expect(patrimoineService.listExpenses).toHaveBeenCalledWith('tenant-1', 'property-1');
    expect(patrimoineService.listValuations).not.toHaveBeenCalled();
    expect(patrimoineService.getPropertyYield).not.toHaveBeenCalled();
    // L'alerte du total annuel appartient à cette rubrique.
    expect(screen.getByText(/Total des charges de l'année en cours/)).toBeInTheDocument();
  });
});

describe('Onglet Patrimoine — recherche locale des dépenses', () => {
  it('filtre les lignes à la saisie et écrit dep.q dans l’URL', async () => {
    const user = userEvent.setup();
    mount('/biens/property-1?rubrique=depenses');
    await screen.findByText('Peinture façade', undefined, T);

    // Les intervalles de dates et de montants sont aussi des champs texte : on vise le champ libre par son indication.
    const barre = screen.getByRole('search', { name: 'Rechercher dans les dépenses' });
    await user.type(within(barre).getByPlaceholderText('Libellé, notes, fournisseur, catégorie…'), 'ASSURANCE');

    await waitFor(() => expect(screen.queryByText('Peinture façade')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Assurance multirisque')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('dep.q=ASSURANCE');
    expect(screen.getByTestId('url').textContent).toContain('rubrique=depenses');
  });

  it('« Effacer les critères » rétablit la liste complète', async () => {
    const user = userEvent.setup();
    mount('/biens/property-1?rubrique=depenses&dep.q=introuvable');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();

    // Deux boutons du même nom : la barre et le bloc d'état.
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Peinture façade', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Assurance multirisque')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('dep.q');
    expect(screen.getByTestId('url').textContent).toContain('rubrique=depenses');
  });
});

describe('Coffre-fort documentaire — barre opt-in', () => {
  it('avec searchPrefix, filtre localement par nom de fichier', async () => {
    const user = userEvent.setup();
    mount('/biens/property-1?rubrique=documents');
    await screen.findByText('titre-foncier.pdf', undefined, T);

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les documents' })).getByRole('textbox'),
      'titre'
    );

    await waitFor(() => expect(screen.queryByText('assurance-2024.pdf')).not.toBeInTheDocument(), T);
    expect(screen.getByText('titre-foncier.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('doc.q=titre');
  });

  it('le critère d’expiration applique la règle « expiré »', async () => {
    mount('/biens/property-1?rubrique=documents&doc.expiration=expired');
    expect(await screen.findByText('assurance-2024.pdf', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('titre-foncier.pdf')).not.toBeInTheDocument();
  });

  it('sans searchPrefix, aucune barre de recherche (rendu historique)', async () => {
    mount(
      '/biens/property-1',
      <DocumentVault
        documents={[document('d1', 'titre-foncier.pdf')] as never}
        tenantId="tenant-1"
        propertyId="property-1"
      />
    );
    expect(await screen.findByText('titre-foncier.pdf', undefined, T)).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });
});

describe('Onglet Patrimoine — changement de rubrique', () => {
  it('retire les critères des autres rubriques et garde onglet', async () => {
    const user = userEvent.setup();
    mount('/biens/property-1?onglet=patrimoine&rubrique=depenses&dep.q=loyer');
    await screen.findByRole('tab', { name: /Crédits/ }, T);

    await user.click(screen.getByRole('tab', { name: /Crédits/ }));

    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('rubrique=credits'), T);
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).not.toContain('dep.q');
    expect(url).toContain('onglet=patrimoine');
  });
});
