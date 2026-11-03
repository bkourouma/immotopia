import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseFormWizard } from '../../components/rental/LeaseFormWizard';

/**
 * Formulaire de bail — BUG-2026-11-03-012 : une date tapée en jj/mm/aaaa était
 * ignorée sans message (le champ n'acceptait que AAAA-MM-JJ), et une date de
 * fin perdue créait un bail sans fin.
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
vi.mock('../../hooks/useMenuAccess', () => ({ useOwnAssetsOnly: () => false }));

function monter() {
  return render(
    <AntApp>
      <MemoryRouter>
        <LeaseFormWizard tenantId="agence-1" onSubmit={vi.fn()} />
      </MemoryRouter>
    </AntApp>
  );
}

describe('Formulaire de bail — saisie des dates', () => {
  // Les champs de date de l'étape 1, dans l'ordre : début, fin, emménagement, déménagement.
  it.each([
    ['Date de début', 0],
    ['Date de fin', 1],
    ["Date d'emménagement", 2],
    ['Date de déménagement', 3]
  ])('comprend « 01/07/2026 » tapé dans « %s »', async (_libelle, rang) => {
    const user = userEvent.setup({ delay: null });
    const { container } = monter();
    await waitFor(() => expect(container.querySelectorAll('.ant-picker input').length).toBe(4));
    const champ = container.querySelectorAll('.ant-picker input')[rang as number] as HTMLInputElement;

    await user.click(champ);
    await user.type(champ, '01/07/2026{Enter}');
    await user.tab();

    expect(champ.value).toBe('01/07/2026');
  });
});
