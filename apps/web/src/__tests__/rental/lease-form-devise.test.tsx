import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseForm } from '../../components/rental/LeaseForm';

/**
 * Modification d'un bail enregistré en « XOF » ou « CFA » : la devise, figée à
 * la création, s'affichait avec son code brut dans le sélecteur désactivé.
 */

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

function bail(currency: string): any {
  return {
    id: 'bail-1',
    property_id: 'bien-1',
    primary_renter_client_id: 'client-1',
    owner_client_id: null,
    start_date: '2026-01-01T00:00:00.000Z',
    end_date: '2027-12-31T00:00:00.000Z',
    billing_frequency: 'MONTHLY',
    due_day_of_month: 5,
    currency,
    rent_amount: 75000,
    service_charge_amount: 0,
    security_deposit_amount: 0,
    penalty_grace_days: 0,
    penalty_mode: 'PERCENT_OF_BALANCE',
    penalty_rate: 0,
    penalty_fixed_amount: 0,
    primaryRenter: { id: 'client-1', userId: 'u', clientType: 'RENTER', displayName: 'Aminata KONE' }
  };
}

async function deviseAffichee(currency: string): Promise<string> {
  render(
    <AntApp>
      <MemoryRouter>
        <LeaseForm lease={bail(currency)} tenantId="agence-1" onSubmit={vi.fn()} />
      </MemoryRouter>
    </AntApp>
  );
  await screen.findByText('Aminata KONE', undefined, { timeout: 15000 });
  const champ = screen.getByLabelText('Devise').closest('.ant-form-item');
  // Ant Design 6 : `.ant-select-content` ; les versions précédentes : `.ant-select-selection-item`.
  return champ?.querySelector('.ant-select-content, .ant-select-selection-item')?.textContent ?? '';
}

describe('Modification du bail — devise affichée', () => {
  it.each(['XOF', 'CFA'])('affiche « FCFA » pour un bail enregistré « %s »', async code => {
    expect(await deviseAffichee(code)).toBe('FCFA');
  });

  it('affiche « EUR » pour un bail en euros', async () => {
    expect(await deviseAffichee('EUR')).toBe('EUR');
  });
});
