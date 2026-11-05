import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * Recherche multicritères de la liste des appels de charges (paginée et filtrée
 * par le serveur) : la saisie et les critères partent à l’API en paramètres, et
 * l’URL porte l’état (`q`, `status`, `lotId`, `page`).
 */

const isDesktop = vi.hoisted(() => ({ value: true }));
const getSyndicate = vi.hoisted(() => vi.fn());
const listSyndicateLots = vi.hoisted(() => vi.fn());
const listChargeCalls = vi.hoisted(() => vi.fn());

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
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listChargeCallsPage: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: vi.fn(),
  listSyndicateFunds: vi.fn(async () => []),
  assignChargeCallFund: vi.fn()
}));

vi.mock('../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: vi.fn(async () => []),
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' })),
  previewLotPayment: vi.fn(),
  recordLotPayment: vi.fn()
}));

vi.mock('../../services/syndic-receipt-service', () => ({ downloadReceiptFile: vi.fn() }));
vi.mock('../../utils/save-blob', () => ({ saveBlob: vi.fn() }));

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

const SUMMARY = { totalCount: 1, totalAmount: 120000, pendingCount: 1, overdueCount: 0 };

const APPEL = {
  id: 'call-1',
  syndicateId: 'syndic-1',
  lotId: 'lot-1',
  period: '2026-T1',
  amount: 120000,
  currency: 'XOF',
  dueDate: '2099-03-15T00:00:00.000Z',
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lot: { id: 'lot-1', lotNumber: 'A01', property: null },
  payments: []
};

const reponse = (items: unknown[]) => ({
  items,
  summary: SUMMARY,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }
});

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function renderPage(search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges' + search]}>
            <Url />
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  isDesktop.value = true;
  vi.clearAllMocks();
  getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
  listSyndicateLots.mockResolvedValue([
    { id: 'lot-1', lotNumber: 'A01' },
    { id: 'lot-2', lotNumber: 'A02' }
  ]);
  listChargeCalls.mockResolvedValue(reponse([APPEL]));
});

describe('SyndicCharges : recherche multicritères', () => {
  it('charge la première page sans critère et pose la barre de recherche', async () => {
    renderPage();
    expect(await screen.findByRole('search', undefined, T)).toBeInTheDocument();
    await vi.waitFor(
      () => expect(listChargeCalls).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      T
    );
  });

  it('envoie la saisie à l’API en « search » après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(within(await screen.findByRole('search', undefined, T)).getByRole('textbox'), 'A01');
    await vi.waitFor(
      () =>
        expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'A01',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=A01');
  });

  it('envoie les statuts choisis en liste séparée par des virgules', async () => {
    const user = userEvent.setup();
    renderPage();
    const bar = await screen.findByRole('search', undefined, T);
    await user.click(within(bar).getByRole('combobox', { name: /Statut/ }));
    await user.click(await screen.findByTitle('En attente'));
    await user.click(await screen.findByTitle('En retard'));
    await vi.waitFor(
      () =>
        expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          status: 'PENDING,OVERDUE',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('status=PENDING,OVERDUE');
  });

  it('applique le lot d’une URL partagée et le montre dans les puces', async () => {
    renderPage('?lotId=lot-2');
    await vi.waitFor(
      () =>
        expect(listChargeCalls).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          lotId: 'lot-2',
          page: 1,
          limit: 20
        }),
      T
    );
    const bar = await screen.findByRole('search', undefined, T);
    expect((await within(bar).findAllByText(/A02/, undefined, T)).length).toBeGreaterThan(0);
  });

  it('propose d’effacer les critères quand rien ne correspond, puis revient à la liste', async () => {
    const user = userEvent.setup();
    listChargeCalls.mockImplementation(async (_t: string, _s: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [APPEL])
    );
    renderPage('?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(
      () => expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
