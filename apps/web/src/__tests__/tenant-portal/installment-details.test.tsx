import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InstallmentDetails from '../../components/TenantPortal/InstallmentDetails';

/**
 * Détail d'échéance du portail locataire : l'écran lit les champs réels de la
 * réponse API (`label`, `charge_type`, `calculated_at`, `psp_reference`), pas
 * des champs imaginés (`description`, `type`, `reason`, `applied_at`,
 * `reference`) qui laissaient des colonnes vides.
 */

const getInstallmentDetails = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    getInstallmentDetails: (...a: unknown[]) => getInstallmentDetails(...a)
  }
}));

const reponse = {
  installment: {
    id: 'ech-1',
    period_year: 2026,
    period_month: 4,
    due_date: '2026-04-05T00:00:00.000Z',
    amount_rent: 100000,
    amount_service: 20000,
    amount_other_fees: 0,
    penalty_amount: 5000,
    amount_paid: 40000,
    status: 'PARTIAL',
    totalAmount: 125000,
    balance: 85000,
    items: [
      { id: 'i1', label: 'Loyer avril 2026', amount: 100000, charge_type: 'RENT' },
      { id: 'i2', label: 'Gardiennage', amount: 20000, charge_type: 'SERVICE_CHARGE' }
    ],
    payments: [
      {
        id: 'a1',
        amount: 40000,
        created_at: '2026-04-10T10:00:00.000Z',
        payment: {
          id: 'p1',
          amount: 40000,
          method: 'MOBILE_MONEY',
          status: 'SUCCESS',
          succeeded_at: '2026-04-10T10:00:00.000Z',
          psp_reference: 'REF-OM-123'
        }
      }
    ],
    penalties: [
      {
        id: 'pen1',
        amount: 5000,
        days_late: 12,
        calculated_at: '2026-04-17T08:30:00.000Z',
        created_at: '2026-04-17T08:30:00.000Z'
      }
    ],
    lease: { id: 'l1', lease_number: 'BAIL-1', property: { id: 'pr1', address: 'Cocody' } }
  },
  relatedPayments: []
};

describe('InstallmentDetails (portail locataire)', () => {
  it('affiche libellé, type traduit, date de pénalité et référence de paiement', async () => {
    getInstallmentDetails.mockResolvedValue({ data: { success: true, data: reponse } });
    render(<InstallmentDetails installmentId="ech-1" />);

    expect(await screen.findByText('Loyer avril 2026', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Gardiennage')).toBeInTheDocument();
    // Types : libellés traduits, jamais le code brut.
    expect(screen.queryByText('RENT')).not.toBeInTheDocument();
    expect(screen.queryByText('SERVICE_CHARGE')).not.toBeInTheDocument();
    expect(screen.getAllByText('Loyer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Charges de service').length).toBeGreaterThan(0);
    // Pénalité : date de calcul et jours de retard.
    expect(screen.getByText('17/04/2026', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    // Paiement : référence PSP.
    expect(screen.getByText('REF-OM-123')).toBeInTheDocument();
  }, 30000);
});
