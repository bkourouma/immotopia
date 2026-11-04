import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseDetailPage } from '../../pages/rental/LeaseDetailPage';

/**
 * Détail d'un bail — BUG-2026-11-03-010 (le filtre Statut de l'onglet Échéances
 * était repris par l'onglet Paiements) et BUG-2026-11-03-011 (Modifier visible
 * pour un profil en lecture seule).
 */

let permissions: Set<string> | null = null;

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
        penalty_mode: 'FIXED_AMOUNT',
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
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions, ready: true })
}));

function Onglet({ nom }: { nom: string }) {
  const [params] = useSearchParams();
  return <div>{`${nom} status=${params.get('status') ?? 'aucun'}`}</div>;
}
vi.mock('../../pages/rental/Installments', () => ({ Installments: () => <Onglet nom="echeances" /> }));
vi.mock('../../pages/rental/Payments', () => ({ Payments: () => <Onglet nom="paiements" /> }));
vi.mock('../../pages/rental/Penalties', () => ({ Penalties: () => null }));
vi.mock('../../pages/rental/Deposits', () => ({ Deposits: () => null }));
vi.mock('../../pages/rental/Documents', () => ({ Documents: () => null }));
vi.mock('../../components/rental/LeaseManagementTermsCard', () => ({ LeaseManagementTermsCard: () => null }));
vi.mock('../../components/rental/LeaseLifecyclePanel', () => ({ LeaseLifecyclePanel: () => null }));
vi.mock('../../components/rental/inspections/LeaseInspectionsPanel', () => ({ LeaseInspectionsPanel: () => null }));
vi.mock('../../components/signature/SignaturesPanel', () => ({ SignaturesPanel: () => null }));
vi.mock('../../components/rental/direct-debit/LeaseDirectDebitPanel', () => ({ LeaseDirectDebitPanel: () => null }));

function monter(url: string) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<LeaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  permissions = null;
});

describe('Détail du bail — onglets', () => {
  it("l'onglet Paiements n'hérite pas du filtre Statut de l'onglet Échéances", async () => {
    const user = userEvent.setup({ delay: null });
    monter('/tenant/agence-1/rental/leases/bail-1?status=OVERDUE');
    await screen.findByText('echeances status=OVERDUE', undefined, { timeout: 8000 });

    await user.click(screen.getByRole('tab', { name: /Paiements/ }));

    expect(await screen.findByText('paiements status=aucun')).toBeTruthy();
  });

  it("BUG-2026-11-04-035 : l'onglet s'active dès l'appui, avant que la barre défile sous le pointeur", async () => {
    monter('/tenant/agence-1/rental/leases/bail-1');
    await screen.findByText('echeances status=aucun', undefined, { timeout: 8000 });

    // À 375 px le focus de l'appui fait défiler la barre ; le relâchement (donc
    // le clic) ne tombe plus sur l'onglet. Seul l'appui est simulé ici.
    fireEvent.mouseDown(screen.getByText('Paiements'));

    expect(await screen.findByText('paiements status=aucun')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Paiements/ }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Détail du bail — profil en lecture seule', () => {
  it('masque Modifier sans RENTAL_LEASES_EDIT', async () => {
    permissions = new Set(['RENTAL_LEASES_VIEW']);
    monter('/tenant/agence-1/rental/leases/bail-1');
    await screen.findByText('echeances status=aucun', undefined, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull();
  });

  it('affiche Modifier avec RENTAL_LEASES_EDIT', async () => {
    permissions = new Set(['RENTAL_LEASES_VIEW', 'RENTAL_LEASES_EDIT']);
    monter('/tenant/agence-1/rental/leases/bail-1');
    await screen.findByText('echeances status=aucun', undefined, { timeout: 8000 });
    expect(screen.getByRole('button', { name: /Modifier/ })).toBeTruthy();
  });
});
