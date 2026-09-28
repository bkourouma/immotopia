import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicFinances } from '../../pages/syndics/SyndicFinances';

/**
 * Constat de recette (fonds) : sous 992 px, `<DataView>` bascule sur
 * `<DataCard>` (`renderCard`). BUG-2026-09-27-005 : la carte d'un fonds
 * n'offrait que « Ajuster le solde » — « Renommer » et « Historique des
 * mouvements » manquaient, alors que les trois actions existent bien dans
 * les colonnes du tableau desktop. Ce test force le mode carte (comme
 * `data-view.test.tsx` et `finance/stock-referentiel.test.tsx`) et vérifie
 * que les trois actions y sont bien atteignables.
 */

const isDesktop = vi.hoisted(() => ({ value: false }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

const getSyndicFinanceSummary = vi.fn();
const listAllChargeCalls = vi.fn();
const getOverdueDashboard = vi.fn();
const listPaymentReminders = vi.fn();
const createSyndicateFund = vi.fn();
const renameSyndicateFund = vi.fn();
const adjustSyndicateFundBalance = vi.fn();
const listFundMovements = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicFinanceSummary: (...args: unknown[]) => getSyndicFinanceSummary(...args),
  listAllChargeCalls: (...args: unknown[]) => listAllChargeCalls(...args),
  getOverdueDashboard: (...args: unknown[]) => getOverdueDashboard(...args),
  listPaymentReminders: (...args: unknown[]) => listPaymentReminders(...args),
  createSyndicateFund: (...args: unknown[]) => createSyndicateFund(...args),
  renameSyndicateFund: (...args: unknown[]) => renameSyndicateFund(...args),
  adjustSyndicateFundBalance: (...args: unknown[]) => adjustSyndicateFundBalance(...args)
}));

// `FundMovementsDrawer` (ouvert par l'action « Historique des mouvements »)
// appelle ce service, distinct de `syndic-service` : le mocker aussi, sinon
// l'import réel se glisse dans le composant sans que Vitest le signale.
vi.mock('../../services/syndic-provider-invoice-service', () => ({
  listFundMovements: (...args: unknown[]) => listFundMovements(...args)
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

function mount() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/finances']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/finances" element={<SyndicFinances />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSyndicFinanceSummary.mockResolvedValue({
    funds: [{ id: 'fund-1', name: 'Fonds de travaux', balance: 8_450_000, currency: 'XOF' }],
    totals: {
      totalFundsBalance: 8_450_000,
      totalCalled: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueCount: 0,
      overdueAmount: 0
    }
  });
  listAllChargeCalls.mockResolvedValue([]);
  getOverdueDashboard.mockResolvedValue({ items: [], totals: { overdueCount: 0, overdueAmount: 0 } });
  listPaymentReminders.mockResolvedValue([]);
  listFundMovements.mockResolvedValue({
    items: [],
    total: 0,
    fund: { id: 'fund-1', name: 'Fonds de travaux', currency: 'XOF' }
  });
});

describe('SyndicFinances — actions du fonds en vue carte (< 992 px)', () => {
  it("permet d'ajuster le solde depuis la carte (action primaire)", async () => {
    const user = userEvent.setup({ delay: null });
    adjustSyndicateFundBalance.mockResolvedValue({ id: 'fund-1', name: 'Fonds de travaux', balance: 8_460_000 });

    mount();

    const carte = await screen.findByRole('article', { name: 'Fonds de travaux' }, { timeout: 8000 });
    await user.click(within(carte).getByRole('button', { name: 'Ajuster le solde' }));

    // La modale d'ajustement s'ouvre : le champ Motif y est obligatoire.
    expect(await screen.findByText('Ajuster le solde du fonds')).toBeInTheDocument();
  });

  it('signale un solde devenu négatif après un débit (permis, mais visible)', async () => {
    const user = userEvent.setup({ delay: null });
    adjustSyndicateFundBalance.mockResolvedValue({
      id: 'fund-1',
      name: 'Fonds de travaux',
      balance: -5_000,
      negativeBalance: true
    });

    mount();

    const carte = await screen.findByRole('article', { name: 'Fonds de travaux' }, { timeout: 8000 });
    await user.click(within(carte).getByRole('button', { name: 'Ajuster le solde' }));
    await user.type(await screen.findByLabelText('Montant'), '10000');
    await user.type(screen.getByLabelText('Motif'), 'Avance de trésorerie');
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));

    await waitFor(() => expect(adjustSyndicateFundBalance).toHaveBeenCalled());
    expect(
      await screen.findByText('Attention : le solde du fonds est désormais négatif.', undefined, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('permet de renommer le fonds depuis la carte (action secondaire, derriere « Autres actions »)', async () => {
    const user = userEvent.setup({ delay: null });
    renameSyndicateFund.mockResolvedValue({ id: 'fund-1', name: 'Fonds travaux renomme' });

    mount();

    const carte = await screen.findByRole('article', { name: 'Fonds de travaux' }, { timeout: 8000 });
    await user.click(within(carte).getByRole('button', { name: 'Autres actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Renommer' }));

    expect(await screen.findByText('Renommer le fonds')).toBeInTheDocument();
  });

  it("permet d'ouvrir l'historique des mouvements depuis la carte (action secondaire, derriere « Autres actions »)", async () => {
    const user = userEvent.setup({ delay: null });

    mount();

    const carte = await screen.findByRole('article', { name: 'Fonds de travaux' }, { timeout: 8000 });
    await user.click(within(carte).getByRole('button', { name: 'Autres actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Historique des mouvements' }));

    await waitFor(() => expect(listFundMovements).toHaveBeenCalled());
    expect(await screen.findByText('Mouvements du fonds « Fonds de travaux »')).toBeInTheDocument();
  });
});
