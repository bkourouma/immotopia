import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicRecovery } from '../../pages/syndics/SyndicRecovery';

/**
 * Recouvrement : chaque onglet porte sa barre de recherche et son préfixe d’URL.
 * Tableau des retards (`rt.`) : liste reçue en entier, recherche LOCALE.
 * Relances (`re.`), pénalités (`pe.`), échéanciers (`ec.`) : critères envoyés au serveur.
 */

const isDesktop = vi.hoisted(() => ({ value: true }));
const getOverdueDashboard = vi.hoisted(() => vi.fn());
const listPaymentRemindersPage = vi.hoisted(() => vi.fn());
const listLatePaymentPenaltiesPage = vi.hoisted(() => vi.fn());
const listPaymentSchedulesPage = vi.hoisted(() => vi.fn());
const listSyndicateLots = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

vi.mock('../../services/syndic-service', () => ({
  getOverdueDashboard: (...args: unknown[]) => getOverdueDashboard(...args),
  listPaymentRemindersPage: (...args: unknown[]) => listPaymentRemindersPage(...args),
  listLatePaymentPenaltiesPage: (...args: unknown[]) => listLatePaymentPenaltiesPage(...args),
  listPaymentSchedulesPage: (...args: unknown[]) => listPaymentSchedulesPage(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  createLatePaymentPenalty: vi.fn(),
  createManualReminder: vi.fn(),
  createPaymentSchedule: vi.fn(),
  getReminderBatchPreview: vi.fn(),
  runReminderBatch: vi.fn(),
  waiveLatePaymentPenalty: vi.fn()
}));

vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

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
          <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1/recouvrement${search}`]}>
            <Url />
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/recouvrement" element={<SyndicRecovery />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const page = (items: unknown[] = []) => ({
  items,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }
});

const RETARDS = [
  {
    chargeCallId: 'call-1',
    lotId: 'lot-1',
    lotNumber: 'A01',
    property: null,
    owner: { id: 'o1', firstName: 'Fabrice', lastName: 'Aka', email: 'fabrice@example.com' },
    dueDate: '2026-02-01T00:00:00.000Z',
    status: 'OVERDUE',
    amount: 200000,
    paid: 0,
    outstanding: 200000,
    daysLate: 45
  },
  {
    chargeCallId: 'call-2',
    lotId: 'lot-2',
    lotNumber: 'B02',
    property: null,
    owner: { id: 'o2', firstName: 'Awa', lastName: 'Koné', email: 'awa@example.com' },
    dueDate: '2026-03-01T00:00:00.000Z',
    status: 'OVERDUE',
    amount: 150000,
    paid: 50000,
    outstanding: 100000,
    daysLate: 10
  }
];

const T = { timeout: 8000 };

beforeEach(() => {
  isDesktop.value = true;
  vi.clearAllMocks();
  getOverdueDashboard.mockResolvedValue({ items: RETARDS, totals: { overdueCount: 2, overdueAmount: 300000 } });
  listPaymentRemindersPage.mockResolvedValue(page());
  listLatePaymentPenaltiesPage.mockResolvedValue(page());
  listPaymentSchedulesPage.mockResolvedValue(page());
  listSyndicateLots.mockResolvedValue([
    { id: 'lot-1', lotNumber: 'A01' },
    { id: 'lot-2', lotNumber: 'B02' }
  ]);
});

describe('SyndicRecovery : recherche des tableaux', () => {
  it('tableau des retards : la recherche filtre la liste locale sans accent ni casse', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText(/Fabrice Aka/, undefined, T);
    expect(screen.getByText(/Awa Koné/)).toBeInTheDocument();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'KONE');
    await vi.waitFor(() => expect(screen.queryByText(/Fabrice Aka/)).not.toBeInTheDocument(), T);
    expect(screen.getByText(/Awa Koné/)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('rt.q=KONE');
    // Aucun appel serveur supplémentaire : le tableau de bord est filtré en local.
    expect(getOverdueDashboard).toHaveBeenCalledTimes(1);
  });

  it('tableau des retards : le critère « jours de retard » de l’URL filtre les lignes', async () => {
    mount('?rt.lateMin=30');
    await screen.findByText(/Fabrice Aka/, undefined, T);
    expect(screen.queryByText(/Awa Koné/)).not.toBeInTheDocument();
  });

  it('relances : la saisie part au serveur en « search » et se retrouve dans l’URL', async () => {
    const user = userEvent.setup();
    mount('?tab=relances');
    await vi.waitFor(
      () => expect(listPaymentRemindersPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      T
    );

    await user.type(within(await screen.findByRole('search')).getByRole('textbox'), 'A01');
    await vi.waitFor(
      () =>
        expect(listPaymentRemindersPage).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'A01',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('re.q=A01');
  });

  it('relances : le canal choisi part au serveur en « channel »', async () => {
    const user = userEvent.setup();
    mount('?tab=relances');
    const bar = await screen.findByRole('search', undefined, T);
    await user.click(within(bar).getByRole('combobox', { name: /Canal/ }));
    await user.click(await screen.findByTitle('SMS'));
    await vi.waitFor(
      () =>
        expect(listPaymentRemindersPage).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          channel: 'SMS',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('re.channel=SMS');
  });

  it('relances : statut, niveau et dates d’une URL partagée partent à l’API', async () => {
    mount('?tab=relances&re.status=FAILED&re.level=2&re.sentFrom=2026-01-01&re.sentTo=2026-01-31&re.page=2');
    await vi.waitFor(
      () =>
        expect(listPaymentRemindersPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          status: 'FAILED',
          level: '2',
          from: '2026-01-01',
          to: '2026-01-31',
          page: 2,
          limit: 20
        }),
      T
    );
  });

  it('pénalités : « remise » de l’URL part en waived=true', async () => {
    mount('?tab=penalites&pe.waived=1');
    await vi.waitFor(
      () =>
        expect(listLatePaymentPenaltiesPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          waived: 'true',
          page: 1,
          limit: 20
        }),
      T
    );
  });

  it('échéanciers : statut et lot de l’URL partent à l’API', async () => {
    mount('?tab=echeanciers&ec.status=ACTIVE,DEFAULTED&ec.lotId=lot-2');
    await vi.waitFor(
      () =>
        expect(listPaymentSchedulesPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          status: 'ACTIVE,DEFAULTED',
          lotId: 'lot-2',
          page: 1,
          limit: 20
        }),
      T
    );
  });

  it('relances : propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listPaymentRemindersPage.mockImplementation(async (_t: string, _s: string, params: Record<string, unknown>) =>
      page(params.search ? [] : [])
    );
    mount('?tab=relances&re.q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('re.q='), T);
    expect(await screen.findByText('Aucune relance envoyée pour cette copropriété.', undefined, T)).toBeInTheDocument();
  });
});
