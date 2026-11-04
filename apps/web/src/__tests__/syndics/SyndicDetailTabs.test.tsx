import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicDetail } from '../../pages/syndics/SyndicDetail';

/**
 * Fiche copropriété : quatre onglets (`?tab=`), une requête par onglet lancée
 * à son affichage. Les appels de charges sont paginés et filtrés par le
 * serveur (préfixe `ap`) ; plus aucun chargement de tous les appels.
 */

const getSyndicate = vi.hoisted(() => vi.fn());
const listChargeCallsPage = vi.hoisted(() => vi.fn());
const listAllChargeCalls = vi.hoisted(() => vi.fn());
const listSyndicateLots = vi.hoisted(() => vi.fn());
const getLotTypeRates = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useMenuAccess', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../hooks/useMenuAccess');
  return { ...actual, useMyMenuAccess: () => ({ permissions: null, ready: true }) };
});
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/syndic-service');
  return {
    ...actual,
    getSyndicate: (...args: unknown[]) => getSyndicate(...args),
    listChargeCallsPage: (...args: unknown[]) => listChargeCallsPage(...args),
    listAllChargeCalls: (...args: unknown[]) => listAllChargeCalls(...args),
    listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
    updateSyndicate: vi.fn()
  };
});
vi.mock('../../services/syndic-lot-type-rates-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/syndic-lot-type-rates-service');
  return { ...actual, getLotTypeRates: (...args: unknown[]) => getLotTypeRates(...args), updateLotTypeRates: vi.fn() };
});
vi.mock('../../services/crm-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/crm-service');
  return { ...actual, listContacts: vi.fn().mockResolvedValue({ contacts: [] }) };
});
vi.mock('../../services/document-branding-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/document-branding-service');
  return {
    ...actual,
    listMandatingAgencies: vi.fn().mockResolvedValue([]),
    fetchSyndicateLogoBlob: vi.fn(),
    uploadSyndicateLogo: vi.fn(),
    removeSyndicateLogo: vi.fn()
  };
});

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function mount(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1${search}`]}>
            <Url />
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId" element={<SyndicDetail />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const SYNDICATE = {
  id: 'syndic-1',
  tenantId: 'tenant-1',
  name: 'Résidence Les Palmiers',
  address: 'Abidjan Cocody',
  totalLots: 2,
  totalBuildings: 1,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  property: {
    id: 'prop-1',
    title: 'Immeuble R+3',
    address: 'Cocody',
    typeSpecificData: { floors_count: 3, units_count: 12, parking_spaces: 6 }
  },
  lots: [
    {
      id: 'lot-1',
      syndicateId: 'syndic-1',
      lotNumber: 'A-101',
      lotType: 'APARTMENT',
      generalShares: 120,
      ownersLabel: 'Fabrice Aka',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'lot-2',
      syndicateId: 'syndic-1',
      lotNumber: 'P-02',
      lotType: 'PARKING',
      generalShares: 10,
      ownersLabel: 'Awa Koné',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
  ]
};

const CHARGE = {
  id: 'charge-aaaaaaaa1111',
  syndicateId: 'syndic-1',
  lotId: 'lot-1',
  period: '2026-T1',
  amount: 203450,
  currency: 'XOF',
  dueDate: '2026-03-15T00:00:00.000Z',
  status: 'PAID',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lot: { id: 'lot-1', lotNumber: 'A-101', property: null, owner: { id: 'o1', firstName: 'Fabrice', lastName: 'Aka' } },
  payments: []
};

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  getSyndicate.mockResolvedValue(SYNDICATE);
  listChargeCallsPage.mockResolvedValue({
    items: [CHARGE],
    summary: null,
    pagination: { page: 1, limit: 20, total: 37, totalPages: 2 }
  });
  listSyndicateLots.mockResolvedValue([{ id: 'lot-1', lotNumber: 'A-101' }]);
  getLotTypeRates.mockResolvedValue({ rates: {}, counts: {}, updatedAt: null });
});

describe('SyndicDetail : onglets et requêtes paresseuses', () => {
  it('à l’ouverture : onglet « lots », total des appels par une page d’une ligne, aucun chargement complet', async () => {
    mount();
    await screen.findByText('A-101', undefined, T);
    expect(screen.getByRole('tab', { name: 'Résumé des lots' })).toHaveAttribute('aria-selected', 'true');

    await vi.waitFor(
      () => expect(listChargeCallsPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 1 }),
      T
    );
    // La carte « Appels de charges » affiche le total du serveur.
    expect(await screen.findByText('37', undefined, T)).toBeInTheDocument();
    // Aucune page de détail des appels, aucun barème, aucun chargement de tous les appels.
    expect(listChargeCallsPage).not.toHaveBeenCalledWith(
      'tenant-1',
      'syndic-1',
      expect.objectContaining({ limit: 20 })
    );
    expect(listAllChargeCalls).not.toHaveBeenCalled();
    expect(getLotTypeRates).not.toHaveBeenCalled();
  });

  it('l’onglet « appels » met ?tab=appels dans l’URL et lance la requête paginée, puis la recherche part en « search »', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('A-101', undefined, T);

    await user.click(screen.getByRole('tab', { name: 'Détail des appels de charges' }));
    expect(screen.getByTestId('url').textContent).toContain('tab=appels');
    await vi.waitFor(
      () => expect(listChargeCallsPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      T
    );
    expect(await screen.findByText(/Fabrice Aka/, undefined, T)).toBeInTheDocument();

    const search = screen.getByRole('search', { name: 'Rechercher dans les appels de fonds' });
    await user.type(within(search).getByRole('textbox'), 'A-101');
    await vi.waitFor(
      () =>
        expect(listChargeCallsPage).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'A-101',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('ap.q=A-101');
    expect(listAllChargeCalls).not.toHaveBeenCalled();
  });

  it('?tab=appels ouvre directement l’onglet des appels sans monter le tableau des lots', async () => {
    mount('?tab=appels');
    await vi.waitFor(
      () => expect(listChargeCallsPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      T
    );
    expect(await screen.findByText(/Fabrice Aka/, undefined, T)).toBeInTheDocument();
    expect(screen.queryByRole('search', { name: 'Rechercher dans les lots' })).not.toBeInTheDocument();
  });

  it('l’onglet « tarifs » ne charge le barème qu’à son affichage', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('A-101', undefined, T);
    expect(getLotTypeRates).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Barème par type de lot' }));
    await vi.waitFor(() => expect(getLotTypeRates).toHaveBeenCalledWith('tenant-1', 'syndic-1'), T);
    expect(screen.getByTestId('url').textContent).toContain('tab=tarifs');
  });

  it('l’onglet « lots » : la recherche locale porte un préfixe d’URL (lo.)', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('A-101', undefined, T);
    expect(screen.getByText('P-02')).toBeInTheDocument();

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les lots' })).getByRole('textbox'),
      'kone'
    );
    await vi.waitFor(() => expect(screen.queryByText('A-101')).not.toBeInTheDocument(), T);
    expect(screen.getByText('P-02')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('lo.q=kone');
  });

  it('les cartes de synthèse ouvrent l’onglet correspondant', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('A-101', undefined, T);
    await user.click(screen.getByRole('link', { name: /Bâtiments/ }));
    expect(screen.getByTestId('url').textContent).toContain('tab=batiments');
  });
});
