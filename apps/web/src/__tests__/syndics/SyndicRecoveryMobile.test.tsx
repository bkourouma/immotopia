import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicRecovery } from '../../pages/syndics/SyndicRecovery';

/**
 * Recouvrement sur téléphone : listes en cartes, « Réessayer » sur une panne de chargement,
 * cause d'échec d'envoi accompagnée du geste à faire.
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
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
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

const PAGE = { page: 1, limit: 20, total: 1, totalPages: 1 };

describe('SyndicRecovery — mobile', () => {
  it('relances : une relance en échec devient une carte avec sa cause et le geste à faire', async () => {
    listPaymentRemindersPage.mockResolvedValue({
      items: [
        {
          id: 'r-1',
          reminderLevel: 2,
          channel: 'EMAIL',
          status: 'FAILED',
          sentAt: '2026-03-01T10:00:00.000Z',
          failureCode: 'NO_EMAIL',
          lotId: 'lot-1',
          lot: { lotNumber: 'A-01', owner: { firstName: 'Awa', lastName: 'Diop', email: null } }
        }
      ],
      pagination: PAGE
    });
    mount('?tab=relances');
    const carte = await screen.findByRole('article', { name: /A-01/ }, { timeout: 8000 });
    expect(within(carte).getByText('Le copropriétaire n’a pas d’adresse e-mail')).toBeInTheDocument();
    expect(within(carte).getByText(/Ajoutez une adresse e-mail à la fiche du copropriétaire/)).toBeInTheDocument();
  });

  it('retards : les dossiers en retard sont des cartes avec le reste dû', async () => {
    getOverdueDashboard.mockResolvedValue({
      items: [
        {
          chargeCallId: 'c-1',
          lotId: 'lot-1',
          lotNumber: 'B-02',
          owner: { id: 'o-1', firstName: 'Moussa', lastName: 'Kone', email: 'm@example.com' },
          dueDate: '2026-02-01T00:00:00.000Z',
          status: 'OVERDUE',
          amount: 200000,
          paid: 50000,
          outstanding: 150000,
          daysLate: 20
        }
      ],
      totals: { overdueCount: 1, overdueAmount: 150000 }
    });
    mount();
    const carte = await screen.findByRole('article', { name: /B-02/ }, { timeout: 8000 });
    expect(within(carte).getByText(/Moussa Kone/)).toBeInTheDocument();
    expect(within(carte).getByText('20')).toBeInTheDocument();
  });

  it('retards : une panne de chargement propose « Réessayer » qui relance la requête', async () => {
    getOverdueDashboard.mockRejectedValueOnce({ response: { data: { error: 'Service indisponible' } } });
    mount();
    const retry = await screen.findByRole('button', { name: 'Réessayer' }, { timeout: 8000 });
    expect(screen.getByText('Service indisponible')).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(getOverdueDashboard).toHaveBeenCalledTimes(2), { timeout: 8000 });
  });
});
