import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TenantPayments from '../../pages/TenantPortal/Payments';

/**
 * Portail locataire — déclarations de paiement mobile money (spec 049) dans la
 * page Paiements : pastille « Déclaration en attente de validation », section
 * « Mes déclarations » et refus 409 du paiement en ligne tant qu'une
 * déclaration est en attente.
 */

const getInstallments = vi.fn();
const getPaymentHistory = vi.fn();

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getInstallments: (...a: unknown[]) => getInstallments(...a),
      getPaymentHistory: (...a: unknown[]) => getPaymentHistory(...a),
      getLeases: () => Promise.resolve({ data: { data: [] } })
    }
  };
});

const getOnlinePaymentAvailability = vi.fn();
const createOnlinePaymentCheckout = vi.fn();

vi.mock('../../services/payment-gateway-service', () => ({
  getOnlinePaymentAvailability: (...a: unknown[]) => getOnlinePaymentAvailability(...a),
  createOnlinePaymentCheckout: (...a: unknown[]) => createOnlinePaymentCheckout(...a),
  getOnlinePaymentCheckout: vi.fn()
}));

const listMyDeclarations = vi.fn();
vi.mock('../../services/tenant-portal-declared-payment-service', async importOriginal => {
  const original = await importOriginal<typeof import('../../services/tenant-portal-declared-payment-service')>();
  return {
    ...original,
    listMyDeclarations: (...a: unknown[]) => listMyDeclarations(...a),
    cancelMyDeclaration: vi.fn(),
    getDeclaredPaymentAvailability: vi.fn().mockRejectedValue(new Error('non utilisé'))
  };
});

const assignMock = vi.fn();
vi.mock('../../utils/external-redirect', () => ({
  redirectToExternalUrl: (url: string) => assignMock(url)
}));

const DELAI = { timeout: 8000 };

function installment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ech-1',
    period: '05/2026',
    dueDate: '2026-05-05',
    amount: 50_000,
    paid: 0,
    balance: 50_000,
    status: 'DUE',
    items: [],
    payments: [],
    ...overrides
  };
}

function chargerEcheances(items: unknown[]) {
  getInstallments.mockResolvedValue({
    data: {
      success: true,
      data: {
        installments: items,
        summary: { total: items.length, paid: 0, due: items.length, overdue: 0, partial: 0 },
        pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }
      }
    }
  });
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/payments']}>
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
  chargerEcheances([installment()]);
  getPaymentHistory.mockResolvedValue({
    data: {
      success: true,
      data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, totalPaid: 0 }
    }
  });
  getOnlinePaymentAvailability.mockResolvedValue({ available: false, mode: null, feesPaidBy: null });
  listMyDeclarations.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

describe('Portail locataire — déclarations en attente', () => {
  it('affiche la pastille sur l’échéance qui porte une déclaration en attente, pas sur les autres', async () => {
    chargerEcheances([
      installment({
        id: 'ech-1',
        period: '05/2026',
        pendingDeclaration: { id: 'd1', amount: 50_000, declaredAt: '2026-05-06T09:00:00Z', reference: 'MP1' }
      }),
      installment({ id: 'ech-2', period: '06/2026', pendingDeclaration: null })
    ]);
    mount();
    await screen.findByText('06/2026', {}, DELAI);
    expect(screen.getAllByText('Déclaration en attente de validation')).toHaveLength(1);
  });

  it('propose la section « Mes déclarations »', async () => {
    mount();
    await screen.findByText('05/2026', {}, DELAI);
    expect(screen.getByText('Mes déclarations')).toBeInTheDocument();
    // Fermée tant qu'aucune déclaration n'est en attente : aucune requête de liste.
    expect(listMyDeclarations).not.toHaveBeenCalled();
  });

  it('ouvre d’office « Mes déclarations » quand une déclaration est en attente', async () => {
    chargerEcheances([
      installment({
        pendingDeclaration: { id: 'd1', amount: 50_000, declaredAt: '2026-05-06T09:00:00Z', reference: 'MP1' }
      })
    ]);
    mount();
    await waitFor(() => expect(listMyDeclarations).toHaveBeenCalled(), DELAI);
    expect(await screen.findByText('Aucune déclaration de paiement pour le moment.', {}, DELAI)).toBeInTheDocument();
  });
});

describe('Portail locataire — paiement en ligne et déclaration en attente', () => {
  it('un 409 sans checkout en cours affiche le message d’indisponibilité et ne redirige pas', async () => {
    getOnlinePaymentAvailability.mockResolvedValue({ available: true, mode: 'LIVE', feesPaidBy: 'AGENCY' });
    createOnlinePaymentCheckout.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          code: 'RENTAL_ONLINE_PAYMENT_DECLARATION_PENDING',
          message: 'Une déclaration de paiement est en attente de validation pour cette échéance.'
        }
      }
    });
    mount();

    await screen.findByText('05/2026', {}, DELAI);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Payer en ligne' }));

    expect(
      await screen.findByText(
        /Une déclaration de paiement est en attente de validation pour cette échéance\./,
        {},
        DELAI
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Annulez-la dans « Mes déclarations »/)).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('une autre erreur du paiement en ligne est visible au-dessus du tableau', async () => {
    getOnlinePaymentAvailability.mockResolvedValue({ available: true, mode: 'LIVE', feesPaidBy: 'AGENCY' });
    createOnlinePaymentCheckout.mockRejectedValue({
      response: { status: 500, data: { success: false, message: 'Service indisponible' } }
    });
    mount();

    await screen.findByText('05/2026', {}, DELAI);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sélectionner 05/2026' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Payer en ligne' }));

    expect(await screen.findByText('Service indisponible', {}, DELAI)).toBeInTheDocument();
  });
});
