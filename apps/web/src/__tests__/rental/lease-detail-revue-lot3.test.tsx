import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseDetailPage } from '../../pages/rental/LeaseDetailPage';

/**
 * Fiche d'un bail — revue fonctionnelle (lot 3) : tant que les permissions de
 * la personne ne sont pas arrivées (`ready` faux, `permissions` nul), les actions
 * d'écriture ne s'affichent pas — sinon un utilisateur en lecture seule les voit
 * un instant, alors que le panneau « Vie du bail » les masque déjà.
 */

let ready = false;

vi.mock('../../services/rental-service', () => ({
  getLease: () =>
    Promise.resolve({
      success: true,
      data: {
        id: 'bail-1',
        lease_number: 'BAIL-1',
        status: 'ACTIVE',
        currency: 'XOF',
        rent_amount: 1,
        service_charge_amount: 0,
        security_deposit_amount: 0,
        penalty_grace_days: 0,
        penalty_mode: 'PERCENT_OF_BALANCE',
        penalty_rate: 1,
        penalty_fixed_amount: 0,
        billing_frequency: 'MONTHLY',
        due_day_of_month: 5,
        property: { transactionModes: ['RENTAL'] }
      }
    }),
  updateLeaseStatus: vi.fn(),
  RentalLeaseStatus: {}
}));
vi.mock('../../services/crm-service', () => ({ getContact: vi.fn() }));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions: null, ready })
}));
vi.mock('../../pages/rental/Installments', () => ({ Installments: () => null }));
vi.mock('../../pages/rental/Payments', () => ({ Payments: () => null }));
vi.mock('../../pages/rental/Penalties', () => ({ Penalties: () => null }));
vi.mock('../../pages/rental/Deposits', () => ({ Deposits: () => null }));
vi.mock('../../pages/rental/Documents', () => ({ Documents: () => null }));
vi.mock('../../components/rental/LeaseManagementTermsCard', () => ({ LeaseManagementTermsCard: () => null }));
vi.mock('../../components/rental/LeaseLifecyclePanel', () => ({ LeaseLifecyclePanel: () => null }));
vi.mock('../../components/rental/inspections/LeaseInspectionsPanel', () => ({ LeaseInspectionsPanel: () => null }));
vi.mock('../../components/signature/SignaturesPanel', () => ({ SignaturesPanel: () => null }));
vi.mock('../../components/rental/direct-debit/LeaseDirectDebitPanel', () => ({ LeaseDirectDebitPanel: () => null }));

function monter() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/rental/leases/bail-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<LeaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

describe('Fiche du bail — permissions pas encore chargées', () => {
  it('ne montre pas le bouton Modifier avant la réponse des permissions', async () => {
    ready = false;
    monter();
    await screen.findByText('Informations générales', undefined, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull();
  });

  it('le montre une fois les permissions arrivées (accès sans restriction)', async () => {
    ready = true;
    monter();
    expect(await screen.findByRole('button', { name: /Modifier/ }, { timeout: 8000 })).toBeTruthy();
  });
});
