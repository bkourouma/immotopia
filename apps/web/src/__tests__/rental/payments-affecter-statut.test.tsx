import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Payments } from '../../pages/rental/Payments';

/**
 * Revue d'effectivité (lot 4) : le bouton « Affecter » de la liste n'est proposé
 * que pour un paiement que l'API accepte d'affecter — encaissé (« Réussi ») et
 * rattaché à un bail. Un paiement en attente ou sans bail répondait 409 / 400.
 */

const listPayments = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, listPayments: (...a: unknown[]) => listPayments(...a) };
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
vi.mock('../../services/rental-declared-payment-service', () => ({
  getRentalPendingCount: vi.fn().mockResolvedValue({ pending: 0, overdue: 0 })
}));

const WAIT = { timeout: 15000 };

function paiement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    amount: 200_000,
    currency: 'XOF',
    method: 'CASH',
    status: 'SUCCESS',
    initiated_at: '2026-05-20T12:00:00.000Z',
    succeeded_at: '2026-05-20T12:00:00.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function monter(data: unknown[]) {
  listPayments.mockResolvedValue({
    success: true,
    data,
    pagination: { page: 1, limit: 50, total: data.length, totalPages: 1 }
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
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

describe('Liste des paiements — bouton « Affecter »', () => {
  it('est proposé pour un paiement réussi, rattaché à un bail, non affecté', async () => {
    monter([paiement()]);
    expect((await screen.findAllByRole('button', { name: 'Affecter' }, WAIT)).length).toBeGreaterThan(0);
  });

  it('n’est pas proposé pour un paiement en attente (l’API répond 409)', async () => {
    monter([paiement({ status: 'PENDING', succeeded_at: null })]);
    expect((await screen.findAllByRole('button', { name: 'Voir' }, WAIT)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Affecter' })).not.toBeInTheDocument();
  });

  it('n’est pas proposé pour un paiement sans bail (l’API répond 400)', async () => {
    monter([paiement({ lease_id: null })]);
    expect((await screen.findAllByRole('button', { name: 'Voir' }, WAIT)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Affecter' })).not.toBeInTheDocument();
  });

  it('n’est pas proposé quand un reste flottant de 1e-16 subsiste (0,1 + 0,7 affectés sur 0,8)', async () => {
    monter([
      paiement({
        amount: 0.8,
        allocations: [
          { id: 'a1', payment_id: 'pay-1', installment_id: 'i1', amount: 0.1, currency: 'XOF', created_at: '' },
          { id: 'a2', payment_id: 'pay-1', installment_id: 'i2', amount: 0.7, currency: 'XOF', created_at: '' }
        ]
      })
    ]);
    expect((await screen.findAllByRole('button', { name: 'Voir' }, WAIT)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Affecter' })).not.toBeInTheDocument();
  });
});
