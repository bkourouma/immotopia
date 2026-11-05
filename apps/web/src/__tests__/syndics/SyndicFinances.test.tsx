import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicFinances } from '../../pages/syndics/SyndicFinances';

/**
 * Finances copropriété : cartes de synthèse + quatre onglets paresseux
 * (`?tab=`). Seul l'onglet affiché interroge l'API ; les appels de fonds sont
 * paginés et filtrés par le serveur (préfixe d’URL `ap.`), les paiements et
impayés par une recherche locale (`pa.`, `im.`).
 *
 * Le mock de `services/syndic-service` couvre TOUS les exports utilisés par la
 * page et ses onglets : Vitest refuse tout import qu'un `vi.mock` ne déclare
 * pas explicitement (AGENTS.md).
 */

const getSyndicFinanceSummary = vi.fn();
const listAllChargeCalls = vi.fn();
const listChargeCallsPage = vi.fn();
const getOverdueDashboard = vi.fn();
const listPaymentReminders = vi.fn();
const listSyndicateLots = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicFinanceSummary: (...args: unknown[]) => getSyndicFinanceSummary(...args),
  listAllChargeCalls: (...args: unknown[]) => listAllChargeCalls(...args),
  listChargeCallsPage: (...args: unknown[]) => listChargeCallsPage(...args),
  getOverdueDashboard: (...args: unknown[]) => getOverdueDashboard(...args),
  listPaymentReminders: (...args: unknown[]) => listPaymentReminders(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  createSyndicateFund: vi.fn(),
  renameSyndicateFund: vi.fn(),
  adjustSyndicateFundBalance: vi.fn()
}));

vi.mock('../../services/syndic-provider-invoice-service', () => ({
  listFundMovements: vi.fn()
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

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

function mount(url = '/tenant/tenant-1/syndics/syndic-1/finances') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter initialEntries={[url]}>
            <Url />
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/finances" element={<SyndicFinances />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const charges = [
  {
    id: 'charge-aaaaaaaa1111',
    syndicateId: 'syndic-1',
    lotId: 'lot-1',
    period: '2026-T1',
    amount: 200_000,
    currency: 'XOF',
    dueDate: '2026-03-15T00:00:00.000Z',
    status: 'PAID',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lot: {
      id: 'lot-1',
      lotNumber: 'A01',
      property: null,
      owner: { id: 'owner-1', firstName: 'Fabrice', lastName: 'Aka' }
    },
    payments: [
      {
        id: 'pay-1',
        chargeCallId: 'charge-aaaaaaaa1111',
        amount: 200_000,
        paidAt: '2026-03-10T00:00:00.000Z',
        method: 'MOBILE_MONEY',
        reference: 'REF1',
        createdAt: '2026-03-10T00:00:00.000Z'
      }
    ]
  },
  {
    id: 'charge-bbbbbbbb2222',
    syndicateId: 'syndic-1',
    lotId: 'lot-2',
    period: '2026-T1',
    amount: 150_000,
    currency: 'XOF',
    dueDate: '2026-03-15T00:00:00.000Z',
    status: 'PARTIAL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lot: {
      id: 'lot-2',
      lotNumber: 'A02',
      property: null,
      owner: { id: 'owner-2', firstName: 'Awa', lastName: 'Koné' }
    },
    payments: [
      {
        id: 'pay-2',
        chargeCallId: 'charge-bbbbbbbb2222',
        amount: 50_000,
        paidAt: '2026-03-12T00:00:00.000Z',
        method: 'VIREMENT',
        reference: 'REF2',
        createdAt: '2026-03-12T00:00:00.000Z'
      }
    ]
  }
];

function mockNonEmptyData(totalCharges = 2) {
  getSyndicFinanceSummary.mockResolvedValue({
    funds: [
      { id: 'fund-1', name: 'Fonds de roulement', balance: 3_600_000, currency: 'XOF' },
      { id: 'fund-2', name: 'Fonds de travaux', balance: 8_450_000, currency: 'XOF' }
    ],
    totals: {
      totalFundsBalance: 12_050_000,
      totalCalled: 350_000,
      totalPaid: 250_000,
      totalOutstanding: 100_000,
      // Volontairement différent du tableau de bord des retards : la carte suit le tableau de bord.
      overdueCount: 2,
      overdueAmount: 423_000
    }
  });
  listAllChargeCalls.mockResolvedValue(charges);
  listSyndicateLots.mockResolvedValue([
    { id: 'lot-1', lotNumber: 'A01' },
    { id: 'lot-2', lotNumber: 'A02' }
  ]);
  listChargeCallsPage.mockImplementation((_t: string, _s: string, query: { page: number; limit: number }) =>
    Promise.resolve({
      items: charges,
      summary: null,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: totalCharges,
        totalPages: Math.ceil(totalCharges / query.limit)
      }
    })
  );
  getOverdueDashboard.mockResolvedValue({
    items: [
      {
        chargeCallId: 'charge-bbbbbbbb2222',
        lotId: 'lot-2',
        lotNumber: 'A02',
        property: null,
        owner: { id: 'owner-2', firstName: 'Awa', lastName: 'Koné' },
        dueDate: '2026-03-15T00:00:00.000Z',
        status: 'PARTIAL',
        amount: 150_000,
        paid: 50_000,
        outstanding: 100_000,
        daysLate: 9,
        remindersCount: 1
      }
    ],
    totals: { overdueCount: 1, overdueAmount: 100_000 }
  });
  listPaymentReminders.mockResolvedValue([
    {
      id: 'rem-1',
      chargeCallId: 'charge-bbbbbbbb2222',
      lotId: 'lot-2',
      reminderLevel: 1,
      channel: 'EMAIL',
      sentAt: '2026-03-20T00:00:00.000Z',
      status: 'SENT',
      createdAt: '2026-03-20T00:00:00.000Z',
      updatedAt: '2026-03-20T00:00:00.000Z'
    }
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyndicFinances — onglets paresseux', () => {
  it('au montage, seul l’onglet actif (fonds) interroge l’API', async () => {
    mockNonEmptyData();
    const { container } = mount();

    expect(await screen.findByText('Fonds de roulement', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Fonds de travaux')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/XOF/);
    expect(await screen.findByText(/12\s050\s000\sFCFA/, {}, { timeout: 8000 })).toBeInTheDocument();

    // Les cartes suivent le tableau de bord des retards (1 dossier, 100 000), pas le résumé.
    const carte = screen.getByText('Dossiers en retard').closest('.ant-card') as HTMLElement;
    await waitFor(() => expect(within(carte).getByText('1')).toBeInTheDocument());
    expect(screen.queryByText(/423\s000/)).not.toBeInTheDocument();

    expect(getSyndicFinanceSummary).toHaveBeenCalledTimes(1);
    expect(getOverdueDashboard).toHaveBeenCalledTimes(1);
    expect(listChargeCallsPage).not.toHaveBeenCalled();
    expect(listAllChargeCalls).not.toHaveBeenCalled();
    expect(listPaymentReminders).not.toHaveBeenCalled();
  });

  it('onglet appels : page 1 serveur, puis page 2 au changement de page', async () => {
    mockNonEmptyData(45);
    const user = userEvent.setup({ delay: null });
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=appels');

    expect((await screen.findAllByText('APPEL-CHARGE-A', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(listChargeCallsPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 });
    expect(listAllChargeCalls).not.toHaveBeenCalled();

    await user.click(screen.getAllByTitle('2')[0]);
    await waitFor(() =>
      expect(listChargeCallsPage).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', { page: 2, limit: 20 })
    );
  });

  it('onglet appels : lit la page dans l’URL (ap.page / ap.limit)', async () => {
    mockNonEmptyData(45);
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=appels&ap.page=3&ap.limit=10');

    await waitFor(() =>
      expect(listChargeCallsPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 3, limit: 10 })
    );
  });

  it('onglet paiements : charge la liste complète des appels, modes de paiement en français', async () => {
    mockNonEmptyData();
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=paiements');

    expect((await screen.findAllByText('Mobile money', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Virement bancaire').length).toBeGreaterThan(0);
    expect(screen.queryByText('MOBILE_MONEY')).not.toBeInTheDocument();
    expect(listAllChargeCalls).toHaveBeenCalledTimes(1);
    expect(listChargeCallsPage).not.toHaveBeenCalled();
  });

  it('onglet impayés : jours de retard et relances lues sur le tableau de bord, sans appel aux relances', async () => {
    mockNonEmptyData();
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=impayes');

    expect(await screen.findByText('9', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(listPaymentReminders).not.toHaveBeenCalled();
  });

  it('affiche « Aucune donnée » quand l’onglet actif est vide', async () => {
    getSyndicFinanceSummary.mockResolvedValue({
      funds: [],
      totals: {
        totalFundsBalance: 0,
        totalCalled: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        overdueCount: 0,
        overdueAmount: 0
      }
    });
    getOverdueDashboard.mockResolvedValue({ items: [], totals: { overdueCount: 0, overdueAmount: 0 } });

    mount();

    expect((await screen.findAllByText('Aucune donnée', {}, { timeout: 8000 })).length).toBe(1);
  });

  it('affiche un état d’erreur avec « Réessayer » si le chargement de l’onglet échoue', async () => {
    getSyndicFinanceSummary.mockRejectedValue(new Error('boom'));
    getOverdueDashboard.mockRejectedValue(new Error('boom'));

    mount();

    expect(
      (await screen.findAllByText('Impossible de charger la synthèse financière', {}, { timeout: 8000 })).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Réessayer').length).toBeGreaterThan(0);
  });
});

describe('SyndicFinances — recherche des tableaux', () => {
  const T = { timeout: 8000 };

  it('onglet appels : la saisie part au serveur en « search » et se retrouve dans l’URL', async () => {
    mockNonEmptyData();
    const user = userEvent.setup({ delay: null });
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=appels');
    await screen.findAllByText('APPEL-CHARGE-A', {}, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'A01');
    await waitFor(
      () =>
        expect(listChargeCallsPage).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'A01',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('ap.q=A01');
  });

  it('onglet appels : le statut et le lot de l’URL partent à l’API (statut en liste séparée par des virgules)', async () => {
    mockNonEmptyData();
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=appels&ap.status=PARTIAL,OVERDUE&ap.lotId=lot-2');
    await waitFor(
      () =>
        expect(listChargeCallsPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          status: 'PARTIAL,OVERDUE',
          lotId: 'lot-2',
          page: 1,
          limit: 20
        }),
      T
    );
  });

  it('onglet paiements : la recherche filtre la liste locale sans accent ni casse', async () => {
    mockNonEmptyData();
    const user = userEvent.setup({ delay: null });
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=paiements');
    await screen.findByText('Fabrice Aka', {}, T);
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Lot, copropriétaire, appel concerné…'), 'KONE');
    await waitFor(() => expect(screen.queryByText('Fabrice Aka')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('pa.q=KONE');
    // Une recherche locale n’appelle pas le serveur une seconde fois.
    expect(listAllChargeCalls).toHaveBeenCalledTimes(1);
  });

  it('onglet impayés : le critère « jours de retard » de l’URL filtre le tableau de bord', async () => {
    mockNonEmptyData();
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=impayes&im.lateMin=30');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Awa Koné')).not.toBeInTheDocument();
  });
});

describe('SyndicFinances — plafond des paiements et relances serveur', () => {
  const T = { timeout: 8000 };
  const BANDEAU = /Seuls les 5 000 appels de fonds les plus anciens/;

  function appels(n: number) {
    return Array.from({ length: n }, (_, i) => ({ ...charges[0], id: `charge-${i}` }));
  }

  it('onglet paiements : bandeau d’avertissement quand 5 000 appels sont atteints', async () => {
    mockNonEmptyData();
    listAllChargeCalls.mockResolvedValue(appels(5000));
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=paiements');
    expect(await screen.findByText(BANDEAU, {}, T)).toBeInTheDocument();
  });

  it('onglet paiements : pas de bandeau sous le plafond', async () => {
    mockNonEmptyData();
    listAllChargeCalls.mockResolvedValue(appels(4999));
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=paiements');
    expect((await screen.findAllByText('Mobile money', {}, T)).length).toBeGreaterThan(0);
    expect(screen.queryByText(BANDEAU)).not.toBeInTheDocument();
  });

  function dashboardAvecRelances() {
    const base = {
      lotId: 'lot-2',
      property: null,
      dueDate: '2026-03-15T00:00:00.000Z',
      status: 'PARTIAL',
      amount: 150_000,
      paid: 50_000,
      outstanding: 100_000,
      daysLate: 9
    };
    getOverdueDashboard.mockResolvedValue({
      items: [
        {
          ...base,
          chargeCallId: 'c-relance',
          lotNumber: 'R01',
          owner: { id: 'o1', firstName: 'Awa', lastName: 'Relancée' },
          remindersCount: 3
        },
        {
          ...base,
          chargeCallId: 'c-vierge',
          lotNumber: 'V01',
          owner: { id: 'o2', firstName: 'Ali', lastName: 'Vierge' },
          remindersCount: 0
        }
      ],
      totals: { overdueCount: 2, overdueAmount: 200_000 }
    });
  }

  it('onglet impayés : « Déjà relancé » filtre selon remindersCount', async () => {
    mockNonEmptyData();
    dashboardAvecRelances();
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=impayes&im.reminded=1');
    expect(await screen.findByText('Awa Relancée', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Ali Vierge')).not.toBeInTheDocument();
    expect(listPaymentReminders).not.toHaveBeenCalled();
  });

  it('onglet impayés : « Jamais relancé » garde les lignes à 0 relance', async () => {
    mockNonEmptyData();
    dashboardAvecRelances();
    mount('/tenant/tenant-1/syndics/syndic-1/finances?tab=impayes&im.reminded=0');
    expect(await screen.findByText('Ali Vierge', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Awa Relancée')).not.toBeInTheDocument();
  });
});
