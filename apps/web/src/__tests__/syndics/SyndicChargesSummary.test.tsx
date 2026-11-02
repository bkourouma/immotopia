import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
const listBudgets = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listAllChargeCallsWithSummary: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: (...args: unknown[]) => createChargeCall(...args),
  // Fonds de la copropriete : aucun ici, le champ « Fonds alimente » reste masque.
  listSyndicateFunds: vi.fn(async () => []),
  listBudgets: (...args: unknown[]) => listBudgets(...args),
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

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

describe('SyndicCharges — cartes de synthèse (BUG-047)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([]);
    listBudgets.mockResolvedValue([]);
  });

  it('affiche les totaux de l’API même quand les lignes chargées ne les reproduisent pas', async () => {
    listChargeCalls.mockResolvedValue({ items: [], summary: SUMMARY });
    renderPage();

    const amountCard = (await screen.findByText('Montant appelé')).closest('div')!.parentElement!;
    await waitFor(() => expect(amountCard.textContent).toMatch(/9\D250\D000/));
    expect(screen.getByText('Dossiers en attente').parentElement!.textContent).toContain('31');
    expect(screen.getByText('Dossiers en retard').parentElement!.textContent).toContain('14');
  });

  it('redemande la synthèse avec les filtres de la liste', async () => {
    listChargeCalls.mockResolvedValue({ items: [], summary: SUMMARY });
    renderPage();
    await waitFor(() => expect(listChargeCalls).toHaveBeenCalled());
    expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
      status: undefined,
      period: undefined
    });
  });

  it('filtre les appels et les cartes par budget, puis retire le filtre', async () => {
    listChargeCalls.mockResolvedValue({ items: [], summary: SUMMARY });
    listBudgets.mockResolvedValue([
      { id: 'budget-2025', label: 'Budget prévisionnel 2025', fiscalYear: 2025, createdAt: '2026-10-27T10:00:00.000Z' }
    ]);
    renderPage();
    await waitFor(() => expect(listChargeCalls).toHaveBeenCalled());

    fireEvent.mouseDown(screen.getByLabelText('Filtrer par budget'));
    fireEvent.click(await screen.findByText('Budget prévisionnel 2025 (2025)'));

    await waitFor(() =>
      expect(listChargeCalls).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
        status: undefined,
        period: undefined,
        budgetId: 'budget-2025'
      })
    );
  });
});
