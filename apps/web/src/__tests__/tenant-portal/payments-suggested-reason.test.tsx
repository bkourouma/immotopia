import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantPayments from '../../pages/TenantPortal/Payments';

/**
 * Portail locataire, « Payer l'agence » (spec 048, lot Q) : le motif suggéré
 * vient de TOUTES les échéances non soldées (requête dédiée), pas de la page
 * affichée, qui peut être filtrée ou paginée. Sans réponse fiable : motif
 * générique, sans période inventée.
 */

const getInstallments = vi.fn();
const getPaymentHistory = vi.fn();
const getUnpaidInstallments = vi.fn();
const getReceivingAccounts = vi.fn();

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getInstallments: (...a: unknown[]) => getInstallments(...a),
      getPaymentHistory: (...a: unknown[]) => getPaymentHistory(...a),
      getUnpaidInstallments: (...a: unknown[]) => getUnpaidInstallments(...a),
      getReceivingAccounts: (...a: unknown[]) => getReceivingAccounts(...a),
      getLeases: async () => ({ data: { success: true, data: [] } })
    }
  };
});

vi.mock('../../services/payment-gateway-service', () => ({
  getOnlinePaymentAvailability: async () => ({ available: false, mode: null, feesPaidBy: null }),
  createOnlinePaymentCheckout: vi.fn(),
  getOnlinePaymentCheckout: vi.fn()
}));

vi.mock('../../services/receiving-account-service', () => ({
  fetchReceivingAccountQr: vi.fn()
}));

function installment(id: string, period: string, dueDate: string, balance = 50_000) {
  return {
    id,
    period,
    dueDate,
    amount: 50_000,
    paid: 50_000 - balance,
    balance,
    status: 'DUE',
    items: [],
    payments: []
  };
}

function page(installments: ReturnType<typeof installment>[]) {
  return {
    data: {
      success: true,
      data: {
        installments,
        summary: { total: 3, paid: 0, due: 3, overdue: 0, partial: 0 },
        pagination: { page: 2, limit: 20, total: 21, totalPages: 2 }
      }
    }
  };
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/payments']}>
          <TenantPayments />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Texte du motif affiché dans la carte « Payer l'agence ». */
async function shownReason(): Promise<string | null> {
  const label = await screen.findByText('Motif suggéré à recopier', {}, { timeout: 8000 });
  return label.parentElement?.querySelector('strong')?.textContent ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  // La page affichée ne montre qu'une échéance récente (filtre ou pagination).
  getInstallments.mockResolvedValue(page([installment('e7', '07/2026', '2026-07-05')]));
  getPaymentHistory.mockResolvedValue({
    data: {
      success: true,
      data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, totalPaid: 0 }
    }
  });
  getReceivingAccounts.mockResolvedValue([
    {
      id: 'a1',
      institution: 'Wave',
      scannableWith: null,
      alias: 'agence-soleil',
      holderName: 'Agence Soleil',
      instructions: null,
      hasQr: false,
      qrPath: null
    }
  ]);
});

describe('Portail locataire — motif suggéré de « Payer l’agence »', () => {
  it('prend la plus ancienne échéance non soldée de toutes, triée par échéance', async () => {
    getUnpaidInstallments.mockResolvedValue(
      page([
        installment('e6', '06/2026', '2026-06-05'),
        installment('e3', '03/2026', '2026-03-05', 0),
        installment('e4', '04/2026', '2026-04-05')
      ])
    );
    mount();
    await waitFor(() => expect(getUnpaidInstallments).toHaveBeenCalled());
    await waitFor(async () => expect(await shownReason()).toBe('Loyer 04/2026'), { timeout: 8000 });
  });

  it('lecture en échec : motif générique, sans période', async () => {
    getUnpaidInstallments.mockRejectedValue(new Error('500'));
    mount();
    await waitFor(async () => expect(await shownReason()).toBe('Loyer'), { timeout: 8000 });
  });

  it('rien à payer : aucun motif', async () => {
    getUnpaidInstallments.mockResolvedValue(page([]));
    mount();
    await screen.findByText('Payer l’agence', {}, { timeout: 8000 });
    await waitFor(() => expect(getUnpaidInstallments).toHaveBeenCalled());
    expect(screen.queryByText('Motif suggéré à recopier')).not.toBeInTheDocument();
  });
});
