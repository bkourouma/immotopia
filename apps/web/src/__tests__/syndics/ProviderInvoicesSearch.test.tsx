import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { ProviderInvoicesTab } from '../../components/syndics/ProviderInvoicesTab';

/**
 * Factures des prestataires : liste paginée et filtrée par le SERVEUR (préfixe d'URL « fa »),
 * soldes par prestataire filtrés en LOCAL (préfixe « so »).
 */

const listProviderInvoices = vi.hoisted(() => vi.fn());
const listProviderBalances = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/syndic-service', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../../services/syndic-service')),
  listSyndicIncidents: vi.fn().mockResolvedValue([]),
  listSyndicateFunds: vi.fn().mockResolvedValue([]),
  listBudgets: vi.fn().mockResolvedValue([])
}));

vi.mock('../../services/syndic-provider-invoice-service', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../../services/syndic-provider-invoice-service')),
  listProviderInvoices: (...args: unknown[]) => listProviderInvoices(...args),
  listProviderBalances: (...args: unknown[]) => listProviderBalances(...args)
}));

vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const T = { timeout: 8000 };

const PROVIDERS = [
  { id: 'p1', tenantId: 't1', name: 'Ascenseurs Pro' },
  { id: 'p2', tenantId: 't1', name: 'Hydro-Tech Plomberie' }
];

const invoice = (id: string, number: string, label: string, providerName: string) => ({
  id,
  provider: { id: 'p1', name: providerName },
  number,
  label,
  invoiceDate: '2026-01-05T00:00:00.000Z',
  amountTTC: 118000,
  amountPaid: 0,
  amountDue: 118000,
  currency: 'XOF',
  hasFile: false,
  status: 'RECORDED'
});

const BALANCES = [
  {
    providerId: 'p1',
    providerName: 'Ascenseurs Pro',
    currency: 'XOF',
    invoicesCount: 2,
    totalInvoiced: 200000,
    totalPaid: 0,
    totalDue: 200000,
    overdueDue: 50000
  },
  {
    providerId: 'p2',
    providerName: 'Hydro-Tech Plomberie',
    currency: 'XOF',
    invoicesCount: 1,
    totalInvoiced: 90000,
    totalPaid: 90000,
    totalDue: 0,
    overdueDue: 0
  }
];

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function mount(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[`/factures${search}`]}>
          <Url />
          <Routes>
            <Route
              path="/factures"
              element={
                <ProviderInvoicesTab tenantId="tenant-1" syndicId="syndic-1" providers={PROVIDERS} contracts={[]} />
              }
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const invoicesBar = () => screen.getByRole('search', { name: 'Rechercher dans les factures' });
const balancesBar = () => screen.getByRole('search', { name: 'Rechercher dans les soldes' });

beforeEach(() => {
  vi.clearAllMocks();
  listProviderInvoices.mockResolvedValue({
    items: [invoice('i1', 'F-2026-001', 'Entretien ascenseur', 'Elec Générale')],
    total: 1,
    page: 1,
    limit: 20
  });
  listProviderBalances.mockResolvedValue(BALANCES);
});

describe('ProviderInvoicesTab : recherche des factures (serveur)', () => {
  it('charge la liste sans critère, page 1, 20 par page', async () => {
    mount();
    await vi.waitFor(
      () => expect(listProviderInvoices).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      T
    );
    expect(await screen.findByText('F-2026-001', undefined, T)).toBeInTheDocument();
  });

  it('la saisie part au serveur en « search » et se retrouve dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('F-2026-001', undefined, T);

    await user.type(within(invoicesBar()).getByRole('textbox'), 'ascenseur');
    await vi.waitFor(
      () =>
        expect(listProviderInvoices).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'ascenseur',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('fa.q=ascenseur');
  });

  it('le statut choisi part au serveur en « status »', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('F-2026-001', undefined, T);

    await user.click(within(invoicesBar()).getByRole('combobox', { name: /Statut/ }));
    await user.click(await screen.findByTitle('Payée'));
    await vi.waitFor(
      () =>
        expect(listProviderInvoices).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          status: 'PAID',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('fa.status=PAID');
  });

  it('prestataire, période et statuts multiples d’une URL partagée partent à l’API en jours aaaa-mm-jj', async () => {
    mount('?fa.providerId=p1&fa.status=RECORDED,PAID&fa.periodFrom=2026-01-01&fa.periodTo=2026-01-31&fa.page=2');
    await vi.waitFor(
      () =>
        expect(listProviderInvoices).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          providerId: 'p1',
          status: 'RECORDED,PAID',
          from: '2026-01-01',
          to: '2026-01-31',
          page: 2,
          limit: 20
        }),
      T
    );
  });

  it('propose d’effacer les critères quand aucune facture ne correspond', async () => {
    const user = userEvent.setup();
    listProviderInvoices.mockImplementation(async (_t: string, _s: string, params: Record<string, unknown>) => ({
      items: params.search ? [] : [invoice('i1', 'F-2026-001', 'Entretien ascenseur', 'Elec Générale')],
      total: params.search ? 0 : 1,
      page: 1,
      limit: 20
    }));
    mount('?fa.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('fa.q='), T);
    expect(await screen.findByText('F-2026-001', undefined, T)).toBeInTheDocument();
  });
});

describe('ProviderInvoicesTab : soldes par prestataire (local)', () => {
  it('la saisie filtre les soldes sans nouvel appel serveur', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Hydro-Tech Plomberie', undefined, T);

    await user.type(within(balancesBar()).getByRole('textbox'), 'hydro');
    await vi.waitFor(() => expect(screen.queryByText('Ascenseurs Pro')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Hydro-Tech Plomberie')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('so.q=hydro');
    expect(listProviderBalances).toHaveBeenCalledTimes(1);
  });

  it('le critère « Avec retard » de l’URL garde les prestataires en retard', async () => {
    mount('?so.overdue=1');
    await screen.findByText('Ascenseurs Pro', undefined, T);
    expect(screen.queryByText('Hydro-Tech Plomberie')).not.toBeInTheDocument();
  });
});
