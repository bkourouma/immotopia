import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseDetailPage } from '../../pages/rental/LeaseDetailPage';

/**
 * Détail d'un bail — BUG-2026-11-03-017 (taux de pénalité 0,5 affiché 50.00 %)
 * et BUG-2026-11-03-019 (un changement de statut refusé remplaçait toute la
 * fiche par un bloc « Erreur »).
 */

let penaltyRate = 0.5;
const updateLeaseStatus = vi.fn();

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
        penalty_rate: penaltyRate,
        penalty_fixed_amount: 0,
        billing_frequency: 'MONTHLY',
        due_day_of_month: 5,
        property: { transactionModes: ['RENTAL'] }
      }
    }),
  updateLeaseStatus: (...args: unknown[]) => updateLeaseStatus(...args),
  RentalLeaseStatus: {}
}));
vi.mock('../../services/crm-service', () => ({ getContact: vi.fn() }));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions: null, ready: true })
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

beforeEach(() => {
  penaltyRate = 0.5;
  updateLeaseStatus.mockReset();
});

describe('Détail du bail — taux de pénalité (BUG-2026-11-03-017)', () => {
  it.each([
    [0.5, '0.50%'],
    [2, '2.00%'],
    [0.05, '0.05%']
  ])("le taux stocké %s (un pourcentage) s'affiche %s", async (taux, attendu) => {
    penaltyRate = taux;
    monter();
    const libelle = await screen.findByText('Taux de pénalité', undefined, { timeout: 8000 });
    const ligne = libelle.closest('tr') as HTMLElement;
    expect(within(ligne).getByText(attendu, { exact: false })).toBeTruthy();
  });
});

describe('Détail du bail — changement de statut refusé (BUG-2026-11-03-019)', () => {
  it("garde la fiche affichée et montre le message de l'API", async () => {
    const user = userEvent.setup({ delay: null });
    updateLeaseStatus.mockRejectedValue({ response: { data: { message: 'Changement de statut invalide' } } });
    monter();
    await screen.findByText('Taux de pénalité', undefined, { timeout: 8000 });

    const liste = screen.getAllByRole('combobox')[0];
    await user.click(liste);
    await user.click(await screen.findByTitle('Brouillon'));

    expect((await screen.findAllByText('Changement de statut invalide')).length).toBeGreaterThan(0);
    expect(screen.getByText('Taux de pénalité')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Paiements/ })).toBeTruthy();
  });
});
