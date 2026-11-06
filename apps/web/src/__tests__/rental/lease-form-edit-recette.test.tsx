import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseForm } from '../../components/rental/LeaseForm';

/**
 * Modification d'un bail — BUG-2026-11-03-021 (locataire affiché comme un
 * identifiant), -022 (date de fin impossible à retirer) et -023 (jour
 * d'échéance et devise modifiables mais jamais enregistrés).
 */

vi.mock('../../services/rental-service', () => ({
  RentalBillingFrequency: { MONTHLY: 'MONTHLY', QUARTERLY: 'QUARTERLY', SEMIANNUAL: 'SEMIANNUAL', ANNUAL: 'ANNUAL' }
}));
vi.mock('../../services/property-service', () => ({
  listProperties: () => Promise.resolve({ properties: [] }),
  getProperty: vi.fn()
}));
// Les contacts de l'agence ne contiennent pas l'identifiant du client locatif.
vi.mock('../../services/crm-service', () => ({
  listContacts: () => Promise.resolve({ success: true, contacts: [] })
}));

const RENTER_ID = 'e27b7cca-a677-4886-983f-f7dd2ad24662';
const bail: any = {
  id: 'bail-1',
  property_id: 'bien-1',
  primary_renter_client_id: RENTER_ID,
  owner_client_id: null,
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2027-12-31T00:00:00.000Z',
  billing_frequency: 'MONTHLY',
  due_day_of_month: 5,
  currency: 'FCFA',
  rent_amount: 75000,
  service_charge_amount: 0,
  security_deposit_amount: 0,
  penalty_grace_days: 0,
  penalty_mode: 'PERCENT_OF_BALANCE',
  penalty_rate: 0,
  penalty_fixed_amount: 0,
  primaryRenter: { id: RENTER_ID, userId: 'u', clientType: 'RENTER', displayName: 'Aminata KONE' }
};

function monter(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AntApp>
      <MemoryRouter>
        <LeaseForm lease={bail} tenantId="agence-1" onSubmit={onSubmit} />
      </MemoryRouter>
    </AntApp>
  );
  return onSubmit;
}

describe('Modification du bail', () => {
  it('021 : le locataire principal affiche son nom, pas son identifiant', async () => {
    monter();
    expect(await screen.findByText('Aminata KONE', undefined, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByText(RENTER_ID)).toBeNull();
  });

  it("023 : le jour d'échéance et la devise ne sont pas modifiables", async () => {
    monter();
    await screen.findByText('Aminata KONE', undefined, { timeout: 8000 });
    const jour = screen.getByLabelText("Jour d'échéance (1-31)") as HTMLInputElement;
    expect(jour.disabled).toBe(true);
    const devise = screen.getByLabelText('Devise') as HTMLInputElement;
    expect(devise.disabled).toBe(true);
  });

  it('022 : une date de fin vidée est envoyée à null', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = monter();
    await screen.findByText('Aminata KONE', undefined, { timeout: 8000 });
    const fin = screen.getAllByRole('textbox').find(el => (el as HTMLInputElement).value === '31/12/2027');
    expect(fin).toBeTruthy();

    // Croix « effacer » du sélecteur de date.
    const picker = fin!.closest('.ant-picker') as HTMLElement;
    await user.hover(picker);
    const croix = picker.querySelector('.ant-picker-clear') as HTMLElement;
    expect(croix).toBeTruthy();
    fireEvent.mouseDown(croix);
    fireEvent.mouseUp(croix);
    fireEvent.click(croix);
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled(), { timeout: 8000 });
    expect(onSubmit.mock.calls[0][0].endDate).toBeNull();
  });
});
