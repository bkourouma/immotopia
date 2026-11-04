import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';
import { PaymentDetailPage } from '../../pages/rental/PaymentDetailPage';

/**
 * Lot D24 (recette gestion locative) : détail et liste des paiements.
 *  - 050 : la date d'annulation ne s'affiche que pour un paiement Annulé ;
 *  - 051 : l'opérateur Mobile Money est libellé, jamais « ORANGE » ;
 *  - 053 : période de l'échéance sur deux chiffres ;
 *  - 046 : le compteur « N paiements » passe par t().
 */

const listPayments = vi.fn();
const getPayment = vi.fn();
const listLeases = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    listPayments: (...a: unknown[]) => listPayments(...a),
    getPayment: (...a: unknown[]) => getPayment(...a),
    listLeases: (...a: unknown[]) => listLeases(...a)
  };
});

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => <div>formulaire de saisie</div> }));
vi.mock('../../components/rental/AllocatePaymentForm', () => ({
  AllocatePaymentForm: () => <div>formulaire d’affectation</div>
}));
vi.mock('../../components/rental/PaymentDeclarationsList', () => ({
  PaymentDeclarationsList: () => <div>liste des déclarations</div>
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

const WAIT = { timeout: 15000 };

function paiement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 200_000,
    currency: 'XOF',
    method: 'MOBILE_MONEY',
    mm_operator: 'ORANGE',
    status: 'SUCCESS',
    initiated_at: '2026-05-20T12:00:00.000Z',
    succeeded_at: '2026-05-20T12:00:00.000Z',
    canceled_at: '2026-11-04T05:58:52.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function mountDetail(data: unknown) {
  getPayment.mockResolvedValue({ success: true, data });
  return render(
    <QueryClientProvider client={client()}>
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

beforeEach(() => {
  vi.clearAllMocks();
  listLeases.mockResolvedValue({
    success: true,
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 1 }
  });
});

describe('Détail d’un paiement — lot D24', () => {
  it('050 : un paiement Réussi réactivé n’affiche pas de date d’annulation', async () => {
    mountDetail(paiement());
    expect(await screen.findByText('Date du règlement', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText("Date d'annulation")).not.toBeInTheDocument();
  });

  it('050 : un paiement Annulé affiche sa date d’annulation', async () => {
    mountDetail(paiement({ status: 'CANCELED' }));
    expect(await screen.findByText("Date d'annulation", {}, WAIT)).toBeInTheDocument();
  });

  it('051 : l’opérateur Mobile Money est libellé, pas en code brut', async () => {
    mountDetail(paiement({ status: 'SUCCESS' }));
    expect(await screen.findByText('Orange Money', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('ORANGE')).not.toBeInTheDocument();
  });

  it('053 : la période de l’échéance affectée a un mois sur deux chiffres', async () => {
    mountDetail(
      paiement({
        allocations: [
          {
            id: 'al-1',
            installment_id: 'inst-1',
            amount: 200_000,
            currency: 'XOF',
            installment: { id: 'inst-1', period_month: 9, period_year: 2026, due_date: '2026-09-05T00:00:00.000Z' }
          }
        ]
      })
    );
    expect(await screen.findByText(/Échéance 09\/2026/, {}, WAIT)).toBeInTheDocument();
  });
});

describe('Liste des paiements — compteur', () => {
  it('046 : « 1076 paiements » vient d’une clé de traduction avec pluriel', async () => {
    listPayments.mockResolvedValue({
      success: true,
      data: [paiement()],
      pagination: { page: 1, limit: 50, total: 1076, totalPages: 22 }
    });
    render(
      <QueryClientProvider client={client()}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/rental/payments']}>
            <Routes>
              <Route path="/tenant/:tenantId/rental/payments" element={<Payments />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('1076 paiements')).toBeInTheDocument(), WAIT);
  });
});
