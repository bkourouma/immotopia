import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantPayments from '../../pages/TenantPortal/Payments';

/**
 * Portail locataire — paiements : recherche multicritères de chaque onglet.
 * Échéances (`ech.`) et historique (`his.`) sont paginés par le serveur ; le
 * relevé (`rel.`) est reçu en entier et filtré localement.
 */

const getInstallments = vi.fn();
const getPaymentHistory = vi.fn();
const getMyStatement = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../hooks/useAuth', async importOriginal => {
  const actual = await importOriginal<typeof import('../../hooks/useAuth')>();
  return { ...actual, useAuth: () => ({ tenantClient: { tenantId: 'tenant-1' } }) };
});

vi.mock('../../services/finance-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/finance-service')>();
  return { ...actual, getMyStatement: (...a: unknown[]) => getMyStatement(...a) };
});

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getInstallments: (...a: unknown[]) => getInstallments(...a),
      getPaymentHistory: (...a: unknown[]) => getPaymentHistory(...a)
    }
  };
});

vi.mock('../../services/payment-gateway-service', () => ({
  getOnlinePaymentAvailability: vi.fn().mockResolvedValue({ available: false, mode: null, feesPaidBy: null }),
  createOnlinePaymentCheckout: vi.fn(),
  getOnlinePaymentCheckout: vi.fn()
}));

vi.mock('../../utils/external-redirect', () => ({ redirectToExternalUrl: vi.fn() }));

const T = { timeout: 8000 };

function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{`${location.pathname}${location.search}`}</span>;
}

function mount(url = '/tenant/payments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/payments" element={<TenantPayments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const adresse = () => decodeURIComponent(screen.getByTestId('adresse').textContent ?? '');

/** Zone de recherche portant ce nom accessible (une par onglet). */
const barre = (nom: string) => within(screen.getByRole('search', { name: nom }));

const reponseEcheances = (periods: string[]) => ({
  data: {
    success: true,
    data: {
      installments: periods.map((period, i) => ({
        id: `ech-${i}`,
        period,
        dueDate: '2026-05-05',
        amount: 50_000,
        paid: 0,
        balance: 50_000,
        status: 'DUE',
        items: [],
        payments: []
      })),
      summary: { total: periods.length, paid: 0, due: periods.length, overdue: 0, partial: 0 },
      pagination: { page: 1, limit: 20, total: periods.length, totalPages: 1 }
    }
  }
});

const reponseHistorique = (references: string[]) => ({
  data: {
    success: true,
    data: {
      payments: references.map((reference, i) => ({
        id: `pay-${i}`,
        amount: 50_000,
        method: 'CASH',
        reference,
        status: 'SUCCESS',
        succeededAt: '2026-05-06T09:00:00.000Z',
        allocatedAmount: 50_000,
        unallocatedAmount: 0,
        allocations: []
      })),
      pagination: { page: 1, limit: 20, total: references.length, totalPages: 1 },
      totalPaid: 50_000 * references.length
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  getInstallments.mockResolvedValue(reponseEcheances(['05/2026']));
  getPaymentHistory.mockResolvedValue(reponseHistorique(['REF-001']));
  getMyStatement.mockResolvedValue({
    label: 'Compte locataire',
    openingBalance: 0,
    closingBalance: 0,
    total: 2,
    movements: [
      {
        id: 'm1',
        movementDate: '2026-05-01T00:00:00.000Z',
        type: 'INSTALLMENT',
        label: 'Loyer de mai',
        amountBilled: 50_000,
        amountSettled: null,
        balanceAfter: 50_000,
        currency: 'XOF',
        leaseId: 'l1'
      },
      {
        id: 'm2',
        movementDate: '2026-06-10T00:00:00.000Z',
        type: 'PENALTY',
        label: 'Retard de juin',
        amountBilled: 5_000,
        amountSettled: null,
        balanceAfter: 55_000,
        currency: 'XOF',
        leaseId: 'l1'
      }
    ]
  });
});

describe('Portail locataire — recherche des échéances', () => {
  it('envoie la saisie après le debounce et la met dans l’adresse avec son préfixe', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('05/2026', {}, T);
    expect(getInstallments).toHaveBeenLastCalledWith({ page: 1, limit: 20 });

    await user.type(barre('Rechercher dans les échéances').getByPlaceholderText('Période, libellé…'), 'octobre');

    await vi.waitFor(
      () => expect(getInstallments).toHaveBeenLastCalledWith({ search: 'octobre', page: 1, limit: 20 }),
      T
    );
    expect(adresse()).toContain('ech.q=octobre');
  });

  it('applique les critères d’une adresse partagée', async () => {
    mount('/tenant/payments?ech.status=PAID,DUE&ech.dueFrom=2026-01-01&ech.dueTo=2026-03-31');
    await screen.findByText('05/2026', {}, T);
    expect(getInstallments).toHaveBeenCalledWith({
      status: 'PAID,DUE',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getInstallments.mockImplementation(async (params: Record<string, unknown>) =>
      reponseEcheances(params.search ? [] : ['05/2026'])
    );
    mount('/tenant/payments?ech.q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('05/2026', {}, T)).toBeInTheDocument();
    expect(getInstallments).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(adresse()).not.toContain('ech.q');
  });
});

describe('Portail locataire — recherche de l’historique', () => {
  it('envoie `search` et ne touche pas à la recherche des échéances', async () => {
    const user = userEvent.setup();
    mount('/tenant/payments?ech.q=abc&tab=historique');
    await screen.findByText('REF-001', {}, T);
    expect(getPaymentHistory).toHaveBeenLastCalledWith({ page: 1, limit: 20 });

    await user.type(
      barre("Rechercher dans l'historique des paiements").getByPlaceholderText('Référence, notes…'),
      'REF-0'
    );

    await vi.waitFor(
      () => expect(getPaymentHistory).toHaveBeenLastCalledWith({ search: 'REF-0', page: 1, limit: 20 }),
      T
    );
    expect(adresse()).toContain('his.q=REF-0');
    expect(adresse()).toContain('ech.q=abc');
    expect(adresse()).toContain('tab=historique');
  });

  it('applique la méthode et la période d’une adresse partagée', async () => {
    mount('/tenant/payments?tab=historique&his.method=CASH,CHECK&his.dateFrom=2026-02-01');
    await screen.findByText('REF-001', {}, T);
    expect(getPaymentHistory).toHaveBeenCalledWith({
      method: 'CASH,CHECK',
      startDate: '2026-02-01',
      page: 1,
      limit: 20
    });
  });
});

describe('Portail locataire — recherche du relevé', () => {
  it('filtre les mouvements en local, sans appel supplémentaire, et l’efface', async () => {
    const user = userEvent.setup();
    mount('/tenant/payments?tab=releve');
    await screen.findByText('Loyer de mai', {}, T);
    expect(screen.getByText('Retard de juin')).toBeInTheDocument();

    await user.type(barre('Rechercher dans le relevé').getByPlaceholderText('Libellé, nature…'), 'RETARD');

    await vi.waitFor(() => expect(screen.queryByText('Loyer de mai')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Retard de juin')).toBeInTheDocument();
    expect(adresse()).toContain('rel.q=RETARD');
    expect(getMyStatement).toHaveBeenCalledTimes(1);

    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[0]);
    expect(await screen.findByText('Loyer de mai', {}, T)).toBeInTheDocument();
    expect(adresse()).not.toContain('rel.q');
  });

  it('applique l’adresse initiale', async () => {
    mount('/tenant/payments?tab=releve&rel.q=loyer');
    await screen.findByText('Loyer de mai', {}, T);
    expect(screen.queryByText('Retard de juin')).not.toBeInTheDocument();
  });
});
