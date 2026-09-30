import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { PropertyMandatesTab } from '../../components/properties/PropertyMandatesTab';

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  createMandate: vi.fn(),
  getPropertyMandates: vi.fn(async () => []),
  revokeMandate: vi.fn(),
  updateProperty: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({
  __esModule: true,
  listContacts: vi.fn(async () => ({ success: true, contacts: [] }))
}));

describe('Onglet « Mandat de gestion »', () => {
  it('bien de l’agence : propose « Confier ce bien à un propriétaire »', async () => {
    render(
      <AntApp>
        <PropertyMandatesTab tenantId="a" propertyId="b" ownershipType="TENANT" />
      </AntApp>
    );
    expect(await screen.findByText('Confier ce bien à un propriétaire')).toBeTruthy();
  });

  it('bien de client : propose de créer le mandat', async () => {
    render(
      <AntApp>
        <PropertyMandatesTab tenantId="a" propertyId="b" ownershipType="CLIENT" />
      </AntApp>
    );
    await waitFor(() => expect(screen.getByText('Créer un mandat')).toBeTruthy());
  });
});
