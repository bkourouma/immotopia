import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Installments } from '../../pages/rental/Installments';
import { InstallmentDetailPage } from '../../pages/rental/InstallmentDetailPage';

/**
 * Revue fonctionnelle gestion locative (lot 3, territoire C) :
 * - une échéance annulée ne propose aucun encaissement (l'API refuse l'affectation) ;
 * - un reste de 5e-17 (virgule flottante) n'affiche pas « Encaisser » ;
 * - le détail montre les paiements affectés et le statut « Annulé » (et non « CANCELED »).
 */

const listInstallments = vi.fn();
const getInstallment = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return {
    ...actual,
    listInstallments: (...a: unknown[]) => listInstallments(...a),
    getInstallment: (...a: unknown[]) => getInstallment(...a),
    listLeases: vi
      .fn()
      .mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 500, total: 0, totalPages: 0 } })
  };
});
vi.mock('../../services/property-service', () => ({ listProperties: vi.fn(), getProperty: vi.fn() }));
vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => null }));
vi.mock('../../components/rental/InstallmentPaymentLinksPanel', () => ({
  InstallmentPaymentLinksPanel: () => <div>liens de paiement</div>
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function echeance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_year: 2026,
    period_month: 4,
    due_date: '2026-04-05T00:00:00.000Z',
    status: 'OVERDUE',
    currency: 'XOF',
    amount_rent: 100_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides
  };
}

function mountListe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/rental/leases/bail-1/installments']}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases/:leaseId/installments" element={<Installments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountDetail() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/rental/installments/ech-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/rental/installments/:installmentId" element={<InstallmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

function page(data: unknown[]) {
  return { success: true, data, pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Échéances — actions d’encaissement', () => {
  it('une échéance annulée ne propose pas « Encaisser »', async () => {
    listInstallments.mockResolvedValue(page([echeance({ status: 'CANCELED' })]));
    mountListe();
    expect(await screen.findByRole('button', { name: /Voir/ }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encaisser/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Paiement…/ })).not.toBeInTheDocument();
  });

  it('une échéance réglée au centime (0,1 + 0,2 payés 0,3) ne propose pas « Encaisser »', async () => {
    listInstallments.mockResolvedValue(
      page([echeance({ status: 'PAID', currency: 'EUR', amount_rent: 0.1, amount_service: 0.2, amount_paid: 0.3 })])
    );
    mountListe();
    expect(await screen.findByRole('button', { name: /Voir/ }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encaisser/ })).not.toBeInTheDocument();
  });

  it('une échéance en retard propose « Encaisser »', async () => {
    listInstallments.mockResolvedValue(page([echeance()]));
    mountListe();
    expect(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Détail d’une échéance', () => {
  it('une échéance annulée s’affiche « Annulé » avec un reste nul', async () => {
    getInstallment.mockResolvedValue({ success: true, data: echeance({ status: 'CANCELED' }) });
    mountDetail();
    expect((await screen.findAllByText('Annulé', {}, { timeout: 15000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText('CANCELED')).not.toBeInTheDocument();
    const reste = (await screen.findByText('Reste à payer')).closest('tr')?.textContent ?? '';
    expect(reste.replace(/\D/g, '')).toBe('0');
  });

  it('liste les paiements affectés (mode, statut, montant)', async () => {
    getInstallment.mockResolvedValue({
      success: true,
      data: echeance({
        status: 'PARTIAL',
        amount_paid: 40_000,
        payments: [
          {
            id: 'aff-1',
            amount: '40000',
            currency: 'XOF',
            created_at: '2026-04-06T10:00:00.000Z',
            payment: {
              id: 'pay-1',
              method: 'CASH',
              status: 'SUCCESS',
              currency: 'XOF',
              initiated_at: '2026-04-06T09:00:00.000Z',
              succeeded_at: '2026-04-06T09:30:00.000Z'
            }
          }
        ]
      })
    });
    mountDetail();
    expect(await screen.findByText('Paiements affectés', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(await screen.findByText('Espèces')).toBeInTheDocument();
    expect(screen.getByText('Réussi')).toBeInTheDocument();
  });

  it('sans affectation : message d’état vide', async () => {
    getInstallment.mockResolvedValue({ success: true, data: echeance() });
    mountDetail();
    expect(
      await screen.findByText('Aucun paiement affecté à cette échéance.', {}, { timeout: 15000 })
    ).toBeInTheDocument();
  });
});
