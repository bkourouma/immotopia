import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Installments } from '../../pages/rental/Installments';

/** Relances de loyer : actions « Relancer » et « Relancer en lot » réservées à RENTAL_PAYMENTS_ALLOCATE. */

const listInstallments = vi.fn();
let permissions: Set<string> | null = null;

vi.mock('../../services/rental-service', () => ({
  listInstallments: (...a: unknown[]) => listInstallments(...a),
  listLeases: vi.fn(),
  createPayment: vi.fn(),
  allocatePayment: vi.fn(),
  recalculateInstallmentStatuses: vi.fn(),
  calculatePenalties: vi.fn(),
  generateInstallments: vi.fn(),
  deleteAllInstallments: vi.fn(),
  RentalPaymentMethod: { CASH: 'CASH' },
  RentalInstallmentStatus: {}
}));
vi.mock('../../services/rental-payment-reminder-service', () => ({
  previewPaymentReminders: vi.fn(),
  sendReminderBatch: vi.fn(),
  sendInstallmentReminder: vi.fn(),
  listInstallmentReminders: vi.fn().mockResolvedValue([]),
  listPaymentReminders: vi.fn()
}));
vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => null }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

function echeance(status: string, paid = 0) {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_year: 2026,
    period_month: 4,
    due_date: '2026-04-05T00:00:00.000Z',
    status,
    currency: 'XOF',
    amount_rent: 100000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: paid,
    created_at: '',
    updated_at: ''
  };
}

async function monter(status = 'OVERDUE', paid = 0) {
  listInstallments.mockResolvedValue({
    success: true,
    data: [echeance(status, paid)],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
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
  await screen.findByText('04/2026', undefined, { timeout: 8000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions = null;
});

describe('Échéances — relances', () => {
  it('propose « Relancer » et « Relancer en lot » avec RENTAL_PAYMENTS_ALLOCATE', async () => {
    permissions = new Set(['RENTAL_INSTALLMENTS_VIEW', 'RENTAL_PAYMENTS_ALLOCATE']);
    await monter('OVERDUE');
    expect(screen.getByRole('button', { name: /Relancer(?! en lot)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Relancer en lot/ })).toBeTruthy();
  });

  it('masque les deux sans ce droit', async () => {
    permissions = new Set(['RENTAL_INSTALLMENTS_VIEW', 'RENTAL_PAYMENTS_VIEW']);
    await monter('OVERDUE');
    expect(screen.queryByRole('button', { name: /Relancer(?! en lot)/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Relancer en lot/ })).toBeNull();
  });

  it("n'offre pas « Relancer » sur une échéance soldée", async () => {
    await monter('PAID', 100000);
    expect(screen.queryByRole('button', { name: /Relancer(?! en lot)/ })).toBeNull();
  });
});
