import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Payments } from '../../pages/rental/Payments';

/**
 * Paiements — recherche multicritères (serveur), sous-onglets dans l'URL,
 * onglet de bail préfixé `pai`, déclarations chargées à la demande.
 */

const listPayments = vi.hoisted(() => vi.fn());
const listLeases = vi.hoisted(() => vi.fn());
const declarationsMontees = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null })
}));

vi.mock('../../services/rental-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/rental-service')>()),
  listPayments: (...a: unknown[]) => listPayments(...a),
  listLeases: (...a: unknown[]) => listLeases(...a),
  createPayment: vi.fn(),
  allocatePayment: vi.fn()
}));

// rental-search-criteria importe le service des biens.
vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn().mockResolvedValue({ properties: [] }),
  getProperty: vi.fn()
}));

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => <div>formulaire</div> }));
vi.mock('../../components/rental/AllocatePaymentForm', () => ({ AllocatePaymentForm: () => <div>affectation</div> }));
vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => {
    React.useEffect(() => {
      declarationsMontees.count += 1;
    }, []);
    return <div>liste des déclarations</div>;
  }
}));

const T = { timeout: 8000 };

const PAIEMENT = {
  id: 'pay-1',
  tenant_id: 'agence-1',
  lease_id: 'bail-1',
  amount: 1_000_000,
  currency: 'XOF',
  method: 'CASH',
  status: 'SUCCESS',
  initiated_at: '2026-05-06T09:30:00.000Z',
  allocations: [],
  depositMovements: [],
  lease: { id: 'bail-1', lease_number: 'BAIL-2026-0001', property: { id: 'b1', title: 'Villa Angré' } },
  created_at: '',
  updated_at: ''
};

const reponse = (items: unknown[]) => ({
  success: true,
  data: items,
  pagination: { page: 1, limit: 50, total: items.length, totalPages: 1 }
});

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function renderPage(initial = '/tenant/agence-1/rental/payments', leaseId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/rental/payments" element={<Payments leaseId={leaseId} />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  declarationsMontees.count = 0;
  listPayments.mockReset();
  listPayments.mockResolvedValue(reponse([PAIEMENT]));
  listLeases.mockReset();
  listLeases.mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
  });
});

describe('Paiements : recherche multicritères', () => {
  it('charge la première page sans critère, sans télécharger 500 baux', async () => {
    renderPage();
    expect(await screen.findByText('BAIL-2026-0001', undefined, T)).toBeInTheDocument();
    expect(listPayments).toHaveBeenCalledWith('agence-1', { page: 1, limit: 50 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(listLeases).not.toHaveBeenCalledWith('agence-1', expect.objectContaining({ limit: 500 }));
  });

  it('envoie la saisie à l’API après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('BAIL-2026-0001', undefined, T);
    await user.type(
      within(screen.getByRole('search')).getByPlaceholderText('Référence, n° de bail, bien, locataire…'),
      'angré'
    );
    await vi.waitFor(
      () => expect(listPayments).toHaveBeenLastCalledWith('agence-1', { search: 'angré', page: 1, limit: 50 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=angré');
  });

  it('applique les critères d’une URL partagée', async () => {
    renderPage(
      '/tenant/agence-1/rental/payments?status=SUCCESS&method=CASH&periodeFrom=2026-01-01&periodeTo=2026-01-31&montantMin=1000&renterClientId=cli-2'
    );
    await screen.findByText('BAIL-2026-0001', undefined, T);
    expect(listPayments).toHaveBeenLastCalledWith('agence-1', {
      status: 'SUCCESS',
      method: 'CASH',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      minAmount: 1000,
      renterClientId: 'cli-2',
      page: 1,
      limit: 50
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listPayments.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [PAIEMENT])
    );
    renderPage('/tenant/agence-1/rental/payments?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('BAIL-2026-0001', undefined, T)).toBeInTheDocument();
    expect(listPayments).toHaveBeenLastCalledWith('agence-1', { page: 1, limit: 50 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});

describe('Paiements : sous-onglets', () => {
  it('ne charge la liste des déclarations qu’à l’ouverture de son onglet, et l’écrit dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('BAIL-2026-0001', undefined, T);
    expect(declarationsMontees.count).toBe(0);
    expect(screen.queryByText('liste des déclarations')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Déclarations en attente' }));
    expect(await screen.findByText('liste des déclarations', undefined, T)).toBeInTheDocument();
    expect(declarationsMontees.count).toBe(1);
    expect(screen.getByTestId('url').textContent).toContain('onglet=declarations');

    await user.click(screen.getByRole('tab', { name: 'Paiements' }));
    expect(await screen.findByText('BAIL-2026-0001', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('onglet=');
  });

  it('garde le lien existant ?onglet=declarations', async () => {
    renderPage('/tenant/agence-1/rental/payments?onglet=declarations');
    expect(await screen.findByText('liste des déclarations', undefined, T)).toBeInTheDocument();
  });
});

describe('Paiements : onglet d’un bail', () => {
  it('rouvre un ancien lien tab=payments&onglet=declarations puis migre le sous-onglet', async () => {
    const user = userEvent.setup();
    renderPage('/tenant/agence-1/rental/payments?tab=payments&onglet=declarations', 'bail-1');
    expect(await screen.findByText('liste des déclarations', undefined, T)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Paiements' }));
    expect(await screen.findAllByText(/1\s000\s000\sFCFA/, undefined, T)).not.toHaveLength(0);
    expect(screen.getByTestId('url').textContent).not.toContain('onglet=declarations');
    await user.click(screen.getByRole('tab', { name: 'Déclarations en attente' }));
    expect(await screen.findByText('liste des déclarations', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('pai.onglet=declarations');
  });

  it('préfixe les clés par pai, filtre sur le bail et n’offre pas de critère locataire', async () => {
    const user = userEvent.setup();
    renderPage('/tenant/agence-1/rental/payments?pai.q=angré&pai.status=SUCCESS', 'bail-1');
    // Dans l'onglet d'un bail, la colonne « Bail » est masquée : on attend le montant.
    await screen.findAllByText(/1\s000\s000\sFCFA/, undefined, T);
    expect(listPayments).toHaveBeenLastCalledWith('agence-1', {
      search: 'angré',
      status: 'SUCCESS',
      leaseId: 'bail-1',
      page: 1,
      limit: 50
    });
    expect(screen.getByRole('search', { name: 'Rechercher dans les paiements' })).toBeInTheDocument();
    expect(screen.queryByText('Locataire', { selector: 'label' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Déclarations en attente' }));
    await screen.findByText('liste des déclarations', undefined, T);
    expect(screen.getByTestId('url').textContent).toContain('pai.onglet=declarations');
    expect(screen.getByTestId('url').textContent).toContain('pai.q=angré');
  });
});
