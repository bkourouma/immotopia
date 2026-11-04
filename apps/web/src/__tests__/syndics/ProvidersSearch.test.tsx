import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { SyndicProviders } from '../../pages/syndics/SyndicProviders';

/**
 * Prestataires et contrats : la liste arrive en entier (bornée par la copropriété), la
 * recherche et la pagination sont LOCALES (préfixes d'URL « pr » et « ct »). L'onglet actif
 * est porté par `?tab=` ; les factures ne se chargent qu'à l'affichage de leur onglet.
 */

const listProvidersContracts = vi.hoisted(() => vi.fn());
const listProviderInvoices = vi.hoisted(() => vi.fn());
const listProviderBalances = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

vi.mock('../../services/syndic-service', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../../services/syndic-service')),
  listProvidersContracts: (...args: unknown[]) => listProvidersContracts(...args),
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

const HYDRO = { id: 'p1', tenantId: 't1', name: 'Hydro-Tech Plomberie', specialty: 'Plomberie', phone: '0102030405' };
const ASCENSEURS = {
  id: 'p2',
  tenantId: 't1',
  name: 'Ascenseurs Pro',
  specialty: 'Ascenseur',
  email: 'contact@asc.test'
};
const NETTOYAGE = { id: 'p3', tenantId: 't1', name: 'Nettoyage Plus', specialty: 'Nettoyage' };

const CONTRACT_ACTIVE = {
  id: 'c1',
  syndicateId: 'syndic-1',
  providerId: 'p1',
  nature: 'Entretien des colonnes',
  startDate: '2026-01-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
  currency: 'XOF',
  renewalAlertDays: 30,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  provider: HYDRO
};
const CONTRACT_EXPIRED = {
  ...CONTRACT_ACTIVE,
  id: 'c2',
  providerId: 'p2',
  nature: 'Maintenance cabine',
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2025-01-01T00:00:00.000Z',
  status: 'EXPIRED',
  provider: ASCENSEURS
};

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function mount(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1/prestataires${search}`]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/prestataires" element={<SyndicProviders />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const providersBar = () => screen.getByRole('search', { name: 'Rechercher dans les prestataires' });
const contractsBar = () => screen.getByRole('search', { name: 'Rechercher dans les contrats' });

beforeEach(() => {
  vi.clearAllMocks();
  listProvidersContracts.mockResolvedValue({
    providers: [
      { ...HYDRO, contracts: [CONTRACT_ACTIVE] },
      { ...ASCENSEURS, contracts: [CONTRACT_EXPIRED] },
      NETTOYAGE
    ],
    contracts: [CONTRACT_ACTIVE, CONTRACT_EXPIRED],
    commonAssets: []
  });
  listProviderInvoices.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  listProviderBalances.mockResolvedValue([]);
});

describe('SyndicProviders : recherche des tableaux', () => {
  it('prestataires : la saisie filtre la liste en local, sans accent ni casse', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Nettoyage Plus', undefined, T);

    await user.type(within(providersBar()).getByRole('textbox'), 'PLOMBERIE');
    await vi.waitFor(() => expect(screen.queryByText('Nettoyage Plus')).not.toBeInTheDocument(), T);
    expect(screen.getAllByText('Hydro-Tech Plomberie').length).toBeGreaterThan(0);
    expect(screen.getByTestId('url').textContent).toContain('pr.q=PLOMBERIE');
    // Les données (prestataires et contrats) ne sont chargées qu'une fois : tout se filtre en local.
    expect(listProvidersContracts).toHaveBeenCalledTimes(1);
  });

  it('prestataires : le critère « Aucun contrat » de l’URL garde les prestataires sans contrat', async () => {
    mount('?pr.contract=NONE');
    await screen.findByText('Nettoyage Plus', undefined, T);
    expect(
      screen.queryByText('Ascenseurs Pro', { selector: 'strong, span.ant-typography-strong' })
    ).not.toBeInTheDocument();
  });

  it('prestataires : propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    mount('?pr.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('pr.q='), T);
    expect(await screen.findByText('Nettoyage Plus', undefined, T)).toBeInTheDocument();
  });

  it('contrats : la saisie filtre en local sur la nature ou le prestataire', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Entretien des colonnes', undefined, T);
    expect(screen.getByText('Maintenance cabine')).toBeInTheDocument();

    await user.type(within(contractsBar()).getByRole('textbox'), 'cabine');
    await vi.waitFor(() => expect(screen.queryByText('Entretien des colonnes')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Maintenance cabine')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('ct.q=cabine');
  });

  it('contrats : le statut de l’URL filtre les lignes', async () => {
    mount('?ct.status=EXPIRED');
    await screen.findByText('Maintenance cabine', undefined, T);
    expect(screen.queryByText('Entretien des colonnes')).not.toBeInTheDocument();
  });

  it('contrats : l’échéance « du… au… » de l’URL filtre sur la date de fin', async () => {
    mount('?ct.endFrom=2026-06-01&ct.endTo=2026-12-31');
    await screen.findByText('Entretien des colonnes', undefined, T);
    expect(screen.queryByText('Maintenance cabine')).not.toBeInTheDocument();
  });
});

describe('SyndicProviders : onglets', () => {
  it('ne charge pas les factures tant que leur onglet n’est pas affiché', async () => {
    mount();
    await screen.findByText('Nettoyage Plus', undefined, T);
    expect(listProviderInvoices).not.toHaveBeenCalled();
  });

  it('l’onglet « factures » de l’URL monte les factures et leur barre de recherche', async () => {
    mount('?tab=factures');
    await vi.waitFor(() => expect(listProviderInvoices).toHaveBeenCalled(), T);
    expect(await screen.findByRole('search', { name: 'Rechercher dans les factures' }, T)).toBeInTheDocument();
    expect(screen.queryByRole('search', { name: 'Rechercher dans les prestataires' })).not.toBeInTheDocument();
  });

  it('le clic sur « Factures » écrit l’onglet dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Nettoyage Plus', undefined, T);
    await user.click(screen.getByRole('tab', { name: 'Factures' }));
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).toContain('tab=factures'), T);
  });
});
