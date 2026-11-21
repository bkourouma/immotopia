import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseFormWizard } from '../../components/rental/LeaseFormWizard';

/** Assistant de bail : durée, total loyer + charges et récapitulatif avant création. */

vi.mock('../../services/rental-service', () => ({
  RentalBillingFrequency: { MONTHLY: 'MONTHLY', QUARTERLY: 'QUARTERLY', SEMIANNUAL: 'SEMIANNUAL', ANNUAL: 'ANNUAL' }
}));
vi.mock('../../services/property-service', () => ({
  listProperties: () => Promise.resolve({ properties: [] }),
  getProperty: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({
  listContacts: () => Promise.resolve({ success: true, contacts: [] })
}));
vi.mock('../../hooks/useMenuAccess', () => ({ useOwnAssetsOnly: () => false }));

const bail: any = {
  id: 'bail-1',
  property_id: 'bien-1',
  primary_renter_client_id: 'client-1',
  owner_client_id: null,
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2027-12-31T00:00:00.000Z',
  billing_frequency: 'MONTHLY',
  due_day_of_month: 5,
  currency: 'FCFA',
  rent_amount: 75000,
  service_charge_amount: 10000,
  security_deposit_amount: 150000,
  penalty_grace_days: 0,
  penalty_mode: 'PERCENT_OF_BALANCE',
  penalty_rate: 0,
  penalty_fixed_amount: 0
};

const OPTIONS = { timeout: 8000 };
const sansEspaces = (texte: string) => texte.replace(/[\s\u202f\u00a0]/g, '');

async function suivant(user: ReturnType<typeof userEvent.setup>) {
  const bouton = await screen.findByRole('button', { name: 'Suivant' });
  await waitFor(() => expect((bouton as HTMLButtonElement).disabled).toBe(false), OPTIONS);
  await user.click(bouton);
}

function monter() {
  render(
    <AntApp>
      <MemoryRouter>
        <LeaseFormWizard lease={bail} tenantId="agence-1" onSubmit={vi.fn().mockResolvedValue(undefined)} />
      </MemoryRouter>
    </AntApp>
  );
}

describe('Assistant de bail — repères de lecture', () => {
  it('affiche la durée du bail sous les dates', async () => {
    monter();
    const duree = await screen.findByTestId('lease-duration', undefined, OPTIONS);
    expect(duree.textContent).toContain('24 mois');
  });

  it('affiche le total loyer + charges à l’étape financière', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    await suivant(user);
    await suivant(user);
    const total = await screen.findByTestId('lease-rent-total', undefined, OPTIONS);
    expect(sansEspaces(total.textContent ?? '')).toContain('85000FCFA');
  });

  it('propose un récapitulatif à la dernière étape', async () => {
    const user = userEvent.setup({ delay: null });
    monter();
    for (let i = 0; i < 4; i += 1) await suivant(user);
    const recap = await screen.findByTestId('lease-recap', undefined, OPTIONS);
    expect(within(recap).getByText('Récapitulatif avant création')).toBeTruthy();
    expect(sansEspaces(recap.textContent ?? '')).toContain('85000FCFA');
    expect(sansEspaces(recap.textContent ?? '')).toContain('150000FCFA');
  });
});
