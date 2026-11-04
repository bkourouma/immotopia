import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicRecovery } from '../../pages/syndics/SyndicRecovery';

/**
 * Recouvrement : quatre onglets paresseux (`?tab=`) ; relances, pénalités et
 * échéanciers sont paginés par le serveur, avec leurs filtres dans l'URL.
 * Le mock couvre chaque export de `syndic-service` utilisé par la page.
 */

const getOverdueDashboard = vi.fn();
const listPaymentRemindersPage = vi.fn();
const listLatePaymentPenaltiesPage = vi.fn();
const listPaymentSchedulesPage = vi.fn();
const listSyndicateLots = vi.fn();

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

function mount(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1/recouvrement${search}`]}>
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/recouvrement" element={<SyndicRecovery />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const emptyPage = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

beforeEach(() => {
  vi.clearAllMocks();
  getOverdueDashboard.mockResolvedValue({ items: [], totals: { overdueCount: 0, overdueAmount: 0 } });
  listPaymentRemindersPage.mockResolvedValue(emptyPage);
  listLatePaymentPenaltiesPage.mockResolvedValue(emptyPage);
  listPaymentSchedulesPage.mockResolvedValue(emptyPage);
  listSyndicateLots.mockResolvedValue([]);
});

describe('SyndicRecovery — onglets paresseux', () => {
  it('au montage, seul le tableau de bord est chargé (onglet retards)', async () => {
    mount();
    expect(await screen.findByText('Recouvrement des impayés', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(getOverdueDashboard).toHaveBeenCalledTimes(1));
    expect(listPaymentRemindersPage).not.toHaveBeenCalled();
    expect(listLatePaymentPenaltiesPage).not.toHaveBeenCalled();
    expect(listPaymentSchedulesPage).not.toHaveBeenCalled();
  });

  it('onglet relances : page et limite envoyées au serveur', async () => {
    mount('?tab=relances');
    await waitFor(
      () => expect(listPaymentRemindersPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 }),
      { timeout: 8000 }
    );
    expect(listLatePaymentPenaltiesPage).not.toHaveBeenCalled();
  });

  it('onglet relances : le critère canal de l’URL part en paramètre « channel »', async () => {
    mount('?tab=relances&re.channel=SMS,WHATSAPP&re.page=2');
    await waitFor(
      () =>
        expect(listPaymentRemindersPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          page: 2,
          limit: 20,
          channel: 'SMS,WHATSAPP'
        }),
      { timeout: 8000 }
    );
  });

  it('onglet pénalités : listLatePaymentPenaltiesPage, critère « remise » envoyé à l’API', async () => {
    mount('?tab=penalites&pe.waived=1');
    await waitFor(
      () =>
        expect(listLatePaymentPenaltiesPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          page: 1,
          limit: 20,
          waived: 'true'
        }),
      { timeout: 8000 }
    );
    expect(listPaymentRemindersPage).not.toHaveBeenCalled();
  });

  it('onglet échéanciers : listPaymentSchedulesPage avec le statut de l’URL', async () => {
    mount('?tab=echeanciers&ec.status=ACTIVE');
    await waitFor(
      () =>
        expect(listPaymentSchedulesPage).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          page: 1,
          limit: 20,
          status: 'ACTIVE'
        }),
      { timeout: 8000 }
    );
  });
});
