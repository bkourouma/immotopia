import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantPayments from '../../pages/TenantPortal/Payments';

/**
 * Portail locataire — paiements : l'onglet actif vit dans l'adresse
 * (`?tab=echeances|historique|releve`) et chaque liste ne se charge que
 * lorsque son onglet est affiché.
 */

const getInstallments = vi.fn();
const getPaymentHistory = vi.fn();

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

vi.mock('../../utils/external-redirect', () => ({
  redirectToExternalUrl: vi.fn()
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  getInstallments.mockResolvedValue({
    data: {
      success: true,
      data: {
        installments: [
          {
            id: 'ech-1',
            period: '05/2026',
            dueDate: '2026-05-05',
            amount: 50_000,
            paid: 0,
            balance: 50_000,
            status: 'DUE',
            items: [],
            payments: []
          }
        ],
        summary: { total: 1, paid: 0, due: 1, overdue: 0, partial: 0 },
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      }
    }
  });
  getPaymentHistory.mockResolvedValue({
    data: {
      success: true,
      data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, totalPaid: 0 }
    }
  });
});

describe('Portail locataire — onglets des paiements', () => {
  it("au montage, seules les échéances sont chargées ; l'historique part au clic sur son onglet", async () => {
    mount();

    await screen.findByText('05/2026', {}, { timeout: 8000 });
    expect(getInstallments).toHaveBeenCalledTimes(1);
    expect(getPaymentHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Historique des paiements' }));

    await waitFor(() => expect(getPaymentHistory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('adresse').textContent).toContain('tab=historique'));
  });

  it("une adresse ?tab=historique ne charge pas les échéances et ouvre l'historique", async () => {
    mount('/tenant/payments?tab=historique');

    await waitFor(() => expect(getPaymentHistory).toHaveBeenCalledTimes(1));
    expect(getInstallments).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Historique des paiements' })).toHaveAttribute('aria-selected', 'true');
  });

  it('une valeur d’onglet inconnue retombe sur les échéances', async () => {
    mount('/tenant/payments?tab=nimporte');

    await screen.findByText('05/2026', {}, { timeout: 8000 });
    expect(getInstallments).toHaveBeenCalledTimes(1);
    expect(getPaymentHistory).not.toHaveBeenCalled();
  });

  it("revenir sur les échéances les recharge à l'ouverture de l'onglet", async () => {
    mount('/tenant/payments?tab=historique');
    await waitFor(() => expect(getPaymentHistory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('tab', { name: 'Échéances' }));

    await waitFor(() => expect(getInstallments).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('05/2026', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
