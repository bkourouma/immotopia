import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AllocatePaymentForm } from '../../components/rental/AllocatePaymentForm';

/**
 * Revue d'effectivité (lot 4) : le formulaire d'affectation ne propose pas une
 * échéance annulée — l'API la filtre (`status: { not: CANCELED }`) et répond
 * « Aucune échéance trouvée » si elle est la seule sélectionnée.
 */

const listInstallments = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, listInstallments: (...a: unknown[]) => listInstallments(...a) };
});

function echeance(id: string, month: number, status: string) {
  return {
    id,
    lease_id: 'bail-1',
    status,
    period_year: 2026,
    period_month: month,
    due_date: `2026-${String(month).padStart(2, '0')}-05T00:00:00.000Z`,
    amount_rent: 100_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    currency: 'XOF'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AllocatePaymentForm — échéances proposées', () => {
  it('écarte une échéance annulée et garde les échéances à payer', async () => {
    listInstallments.mockResolvedValue({
      success: true,
      data: [echeance('i-annulee', 3, 'CANCELED'), echeance('i-due', 4, 'DUE')],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 }
    });

    render(
      <AllocatePaymentForm
        tenantId="agence-1"
        payment={
          {
            id: 'pay-1',
            lease_id: 'bail-1',
            amount: 100_000,
            currency: 'XOF',
            status: 'SUCCESS',
            allocations: [],
            depositMovements: []
          } as never
        }
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByText(/04\/2026/, {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByText(/03\/2026/)).not.toBeInTheDocument();
  });
});
