import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * BUG-2026-09-30-047 : les cartes « Montant appelé », « Dossiers en attente » et
 * « Dossiers en retard » viennent de la synthèse calculée par l'API sur TOUS
 * les appels filtrés, jamais d'une somme faite sur les lignes chargées.
 */

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const createChargeCall = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listChargeCallsPage: async (...args: unknown[]) => {
    const page = await listChargeCalls(...args);
    return page && { pagination: { page: 1, limit: 20, total: page.items.length, totalPages: 1 }, ...page };
  },
  createChargeCall: (...args: unknown[]) => createChargeCall(...args),
  // Fonds de la copropriete : aucun ici, le champ « Fonds alimente » reste masque.
  listSyndicateFunds: vi.fn(async () => []),
  assignChargeCallFund: vi.fn()
}));

vi.mock('../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: vi.fn(async () => []),
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' })),
  previewLotPayment: vi.fn(),
  recordLotPayment: vi.fn()
}));

vi.mock('../../services/syndic-receipt-service', () => ({
  downloadReceiptFile: vi.fn()
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn()
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

const SUMMARY = { totalCount: 45, totalAmount: 9250000, pendingCount: 31, overdueCount: 14 };

function renderPage(search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges' + search]}>
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('SyndicCharges — cartes de synthèse (BUG-047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([]);
  });

  it('affiche les totaux de l’API même quand les lignes chargées ne les reproduisent pas', async () => {
    listChargeCalls.mockResolvedValue({ items: [], summary: SUMMARY });
    renderPage();

    const amountCard = (await screen.findByText('Montant appelé')).closest('div')!.parentElement!;
    await waitFor(() => expect(amountCard.textContent).toMatch(/9\D250\D000/));
    expect(screen.getByText('Dossiers en attente').parentElement!.textContent).toContain('31');
    expect(screen.getByText('Dossiers en retard').parentElement!.textContent).toContain('14');
  });

  it('demande la première page de 20 appels au montage, puis la page 2 au changement de page', async () => {
    listChargeCalls.mockResolvedValue({
      items: [],
      summary: SUMMARY,
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 }
    });
    renderPage();
    await waitFor(() => expect(listChargeCalls).toHaveBeenCalled());
    expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
      page: 1,
      limit: 20
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Page 2' }));
    await waitFor(() =>
      expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
        page: 2,
        limit: 20
      })
    );
  });

  it('envoie la recherche, les statuts et le lot de l’URL à l’API, sans filtrer la page reçue', async () => {
    listChargeCalls.mockResolvedValue({ items: [], summary: SUMMARY });
    renderPage('?status=PENDING,OVERDUE&q=2026-T1&lotId=lot-9&page=2&limit=50');
    await waitFor(() => expect(listChargeCalls).toHaveBeenCalled());
    expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
      page: 2,
      limit: 50,
      status: 'PENDING,OVERDUE',
      search: '2026-T1',
      lotId: 'lot-9'
    });
  });
});
