import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';

/**
 * Détail d'une échéance : la ligne « Devise » affichait le code enregistré tel
 * quel (« XOF », « CFA »). Le franc CFA s'écrit « FCFA » partout.
 */

const getInstallment = vi.fn();
vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, getInstallment: (...a: unknown[]) => getInstallment(...a) };
});
vi.mock('../../components/rental/InstallmentPaymentLinksPanel', () => ({
  InstallmentPaymentLinksPanel: () => <div>liens de paiement</div>
}));

import { InstallmentDetailPage } from '../../pages/rental/InstallmentDetailPage';

function echeance(currency: string) {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_month: 9,
    period_year: 2026,
    due_date: '2026-09-05T12:00:00.000Z',
    status: 'DUE',
    amount_rent: 150_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    currency,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z'
  };
}

async function valeurDeLaDevise(currency: string): Promise<string> {
  getInstallment.mockResolvedValue({ success: true, data: echeance(currency) });
  render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/rental/installments/ech-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/rental/installments/:installmentId" element={<InstallmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
  const etiquette = await screen.findByText('Devise', {}, { timeout: 15000 });
  return (etiquette.closest('tr')?.textContent ?? '').replace('Devise', '');
}

beforeEach(() => {
  getInstallment.mockReset();
});

describe('Détail d’une échéance — devise', () => {
  it.each(['XOF', 'CFA', 'F CFA', 'FCFA'])('affiche « FCFA » pour la devise enregistrée « %s »', async code => {
    expect(await valeurDeLaDevise(code)).toBe('FCFA');
  });

  it('laisse une autre devise inchangée', async () => {
    expect(await valeurDeLaDevise('EUR')).toBe('EUR');
  });
});
