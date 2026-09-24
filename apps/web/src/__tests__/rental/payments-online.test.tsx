import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';
import { PaymentDetailPage } from '../../pages/rental/PaymentDetailPage';

/**
 * Paiement en ligne (Lot 7) côté agence : étiquette « En ligne » + statut du
 * checkout, et bouton « Vérifier le statut » quand `PENDING` ou `REVIEW`
 * (contrat `docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md` §3.2 et §5).
 */

const listPayments = vi.fn();
const getPayment = vi.fn();
const createPayment = vi.fn();
const allocatePayment = vi.fn();
const listLeases = vi.fn();
const updatePaymentStatus = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    listPayments: (...a: unknown[]) => listPayments(...a),
    getPayment: (...a: unknown[]) => getPayment(...a),
    listLeases: (...a: unknown[]) => listLeases(...a),
    createPayment: (...a: unknown[]) => createPayment(...a),
    allocatePayment: (...a: unknown[]) => allocatePayment(...a),
    updatePaymentStatus: (...a: unknown[]) => updatePaymentStatus(...a)
  };
});

const checkOnlinePaymentStatus = vi.fn();
vi.mock('../../services/payment-gateway-service', () => ({
  checkOnlinePaymentStatus: (...a: unknown[]) => checkOnlinePaymentStatus(...a)
}));

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => <div>formulaire de saisie</div> }));
vi.mock('../../components/rental/AllocatePaymentForm', () => ({
  AllocatePaymentForm: () => <div>formulaire d’affectation</div>
}));
vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => <div>liste des déclarations</div>
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

function paiement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 50_000,
    currency: 'XOF',
    method: 'MOBILE_MONEY',
    status: 'PENDING',
    initiated_at: '2026-05-06T09:30:00.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    onlineCheckout: null,
    ...overrides
  };
}

function checkoutSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'checkout-1',
    codePaiement: 'IMT-ABCDEFGHIJKLMNOPQRST',
    status: 'PENDING' as const,
    mode: 'SIMULATOR' as const,
    providerServiceName: 'Wave',
    providerTransactionId: null,
    providerFees: null,
    failureMessage: null,
    reviewReason: null,
    lastCheckedAt: null,
    ...overrides
  };
}

function mountListe(paiements: unknown[]) {
  listPayments.mockResolvedValue({
    success: true,
    data: paiements,
    pagination: { page: 1, limit: 50, total: paiements.length, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Paiements de l’agence — badge « En ligne »', () => {
  it('affiche le statut du checkout et permet de vérifier tant qu’il reste en attente', async () => {
    checkOnlinePaymentStatus.mockResolvedValue(checkoutSummary({ status: 'SUCCESS' }));

    mountListe([paiement({ onlineCheckout: checkoutSummary() })]);

    expect(await screen.findByText('En ligne', {}, { timeout: 8000 })).toBeInTheDocument();
    // Le paiement lui-même ET son checkout affichent chacun « En attente » :
    // l'un dans la colonne Statut, l'autre dans la colonne En ligne.
    expect(screen.getAllByText('En attente').length).toBeGreaterThan(0);

    const boutonVerifier = screen.getByRole('button', { name: /Vérifier le statut/ });
    fireEvent.click(boutonVerifier);

    await waitFor(() => expect(checkOnlinePaymentStatus).toHaveBeenCalledWith('agence-1', 'pay-1'));
  });

  it('ne propose pas de vérifier un checkout déjà réussi', async () => {
    mountListe([paiement({ onlineCheckout: checkoutSummary({ status: 'SUCCESS' }) })]);

    await screen.findByText('En ligne', {}, { timeout: 8000 });
    expect(screen.getByText('Réussi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vérifier le statut/ })).not.toBeInTheDocument();
  });

  it('n’affiche rien pour un paiement qui n’est pas passé par le portail', async () => {
    mountListe([paiement()]);
    await waitFor(() => expect(listPayments).toHaveBeenCalled());
    expect(screen.queryByText('En ligne')).not.toBeInTheDocument();
  });
});

describe('Détail d’un paiement — checkout en ligne', () => {
  function mountDetail() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments/pay-1']}>
            <Routes>
              <Route path="/tenant/:tenantId/rental/payments/:paymentId" element={<PaymentDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
  }

  it('affiche le motif de revue et permet de relancer la vérification', async () => {
    getPayment.mockResolvedValue({
      success: true,
      data: paiement({
        status: 'PENDING',
        onlineCheckout: checkoutSummary({ status: 'REVIEW', reviewReason: 'Montant différent de celui attendu' })
      })
    });
    checkOnlinePaymentStatus.mockResolvedValue(checkoutSummary({ status: 'REVIEW' }));

    mountDetail();

    expect(await screen.findByText('Montant différent de celui attendu', {}, { timeout: 8000 })).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: /Vérifier le statut/ });
    fireEvent.click(bouton);

    await waitFor(() => expect(checkOnlinePaymentStatus).toHaveBeenCalledWith('agence-1', 'pay-1'));
  });
});
