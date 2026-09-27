import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicFinances } from '../../pages/syndics/SyndicFinances';

/**
 * La page Finances copropriété — six cartes de totaux, chacune adossée à un
 * tableau de détail cohérent (`<DataView>` + `<MoneyValue>`, comme les écrans
 * de `pages/finance`).
 *
 * Suit le modèle de `__tests__/finance/balances.test.tsx` : `useBreakpoint`
 * figé en desktop pour obtenir les tableaux plutôt que les cartes mobiles, et
 * un mock de `services/syndic-service` qui couvre TOUS les exports que la
 * page utilise (`getSyndicFinanceSummary`, `listAllChargeCalls`,
 * `getOverdueDashboard`, `listPaymentReminders`) — Vitest refuse tout import
 * qu'un `vi.mock` ne déclare pas explicitement (AGENTS.md).
 */

const getSyndicFinanceSummary = vi.fn();
const listAllChargeCalls = vi.fn();
const getOverdueDashboard = vi.fn();
const listPaymentReminders = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicFinanceSummary: (...args: unknown[]) => getSyndicFinanceSummary(...args),
  listAllChargeCalls: (...args: unknown[]) => listAllChargeCalls(...args),
  getOverdueDashboard: (...args: unknown[]) => getOverdueDashboard(...args),
  listPaymentReminders: (...args: unknown[]) => listPaymentReminders(...args)
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
    tenant: {
      id: 'tenant-1',
      name: 'Tenant Demo',
      slug: 'tenant-demo'
    },
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

function mount(url = '/tenant/tenant-1/syndics/syndic-1/finances') {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/finances" element={<SyndicFinances />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

function mockNonEmptyData() {
  getSyndicFinanceSummary.mockResolvedValue({
    funds: [
      { id: 'fund-1', name: 'Fonds de roulement', balance: 3_600_000, currency: 'XOF' },
      { id: 'fund-2', name: 'Fonds de travaux', balance: 8_450_000, currency: 'XOF' }
    ],
    totals: {
      totalFundsBalance: 12_050_000,
      // Choisis pour être EXACTEMENT la somme des deux appels ci-dessous
      // (200 000 + 150 000, 200 000 + 50 000) : la garantie « le total de la
      // carte == la somme du tableau » se lit directement sur les chiffres.
      totalCalled: 350_000,
      totalPaid: 250_000,
      totalOutstanding: 100_000,
      // Volontairement DIFFÉRENT du dashboard des retards ci-dessous : la page
      // doit afficher le total du dashboard (1 dossier, 100 000), pas celui-ci,
      // pour rester cohérente avec le tableau « Impayés / retards ».
      overdueCount: 2,
      overdueAmount: 423_000
    }
  });

  listAllChargeCalls.mockResolvedValue([
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
  ]);

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
        daysLate: 9
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

describe('SyndicFinances — indicateurs et tableaux de détail', () => {
  it('affiche les totaux en FCFA (jamais XOF) et des tableaux de détail dont la somme recoupe la carte', async () => {
    mockNonEmptyData();
    const { container } = mount();

    expect(await screen.findByText('Finances copropriété', {}, { timeout: 8000 })).toBeInTheDocument();

    // Le bouton « Retour » disparaît : la barre d'onglets d'un autre écran le
    // remplace.
    expect(screen.queryByText('Retour à la fiche syndic')).not.toBeInTheDocument();

    // FCFA partout, jamais XOF — l'utilitaire de formatage `<MoneyValue>` est
    // seul responsable de l'affichage de la devise.
    expect(container.textContent).not.toMatch(/XOF/);
    expect(await screen.findByText(/12\s050\s000\sFCFA/, {}, { timeout: 8000 })).toBeInTheDocument();

    // Total appelé / payé : les cartes affichent exactement la somme des deux
    // appels de charges renvoyés par `listAllChargeCalls`.
    expect(screen.getAllByText(/350\s000\sFCFA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/250\s000\sFCFA/).length).toBeGreaterThan(0);

    // Dossiers en retard / Montant en retard : la page suit le dashboard des
    // retards (1 dossier, 100 000), pas le résumé financier (2 / 423 000),
    // pour rester cohérente avec le tableau « Impayés / retards » juste en
    // dessous.
    const carteDossiersEnRetard = screen.getByText('Dossiers en retard').closest('.ant-card') as HTMLElement;
    expect(within(carteDossiersEnRetard).getByText('1')).toBeInTheDocument();
    expect(screen.queryByText(/423\s000/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/100\s000\sFCFA/).length).toBeGreaterThan(0);

    // Tableau « Détail des fonds ».
    expect(screen.getByText('Fonds de roulement')).toBeInTheDocument();
    expect(screen.getByText('Fonds de travaux')).toBeInTheDocument();

    // Tableau « Détail des appels de fonds » : référence, période, lot,
    // copropriétaire, statut. Ant Design duplique certaines cellules pour la
    // mesure du défilement horizontal (`scrollX`), d'où `getAllByText`.
    expect(screen.getAllByText('APPEL-CHARGE-A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fabrice Aka').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Awa Koné').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payé').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Partiel').length).toBeGreaterThan(0);

    // Tableau « Détail des paiements reçus » : mode de paiement affiché tel quel.
    expect(screen.getAllByText('MOBILE_MONEY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VIREMENT').length).toBeGreaterThan(0);

    // Tableau « Détail des impayés et retards » : jours de retard et nombre
    // de relances.
    const sectionRetards = document.getElementById('finances-retards') as HTMLElement;
    expect(within(sectionRetards).getByText('9')).toBeInTheDocument();
  });

  it('affiche « Aucune donnée » de façon identique sur les quatre tableaux quand rien n’existe', async () => {
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
    listAllChargeCalls.mockResolvedValue([]);
    getOverdueDashboard.mockResolvedValue({ items: [], totals: { overdueCount: 0, overdueAmount: 0 } });
    listPaymentReminders.mockResolvedValue([]);

    mount();

    expect(await screen.findByText('Finances copropriété', {}, { timeout: 8000 })).toBeInTheDocument();
    expect((await screen.findAllByText('Aucune donnée', {}, { timeout: 8000 })).length).toBe(4);
  });

  it('affiche un état d’erreur identique sur les quatre tableaux si le chargement échoue', async () => {
    getSyndicFinanceSummary.mockRejectedValue(new Error('boom'));
    listAllChargeCalls.mockRejectedValue(new Error('boom'));
    getOverdueDashboard.mockRejectedValue(new Error('boom'));
    listPaymentReminders.mockRejectedValue(new Error('boom'));

    mount();

    expect(
      (await screen.findAllByText('Impossible de charger la synthese financiere', {}, { timeout: 8000 })).length
    ).toBe(4);
    expect(screen.getAllByText('Réessayer').length).toBe(4);
  });
});
