import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyDetail } from '../../pages/properties/PropertyDetail';

/**
 * BUG-2026-09-30-030 / 039 : la fiche du bien monte « Documents » (tous les
 * packs) et « Mandat de gestion » (bien CLIENT, hors compte « détenu en
 * propre »), et nomme le propriétaire au lieu d'afficher son e-mail.
 */

const getProperty = vi.fn();
vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getProperty: (...a: unknown[]) => getProperty(...a)
}));

let ownAssetsOnly = false;
vi.mock('../../hooks/useMenuAccess', () => ({
  __esModule: true,
  useOwnAssetsOnly: () => ownAssetsOnly
}));
vi.mock('../../hooks/useAgencyFeatures', () => ({
  __esModule: true,
  useAgencyFeatures: () => ({ ready: true, access: null, has: () => true })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(async () => ({ data: { success: true, data: [] } })) }
}));

// Les onglets lourds ne sont pas le sujet : marqueurs simples.
vi.mock('../../components/properties/PropertyDocumentsTab', () => ({
  PropertyDocumentsTab: () => <div data-testid="onglet-documents" />
}));
vi.mock('../../components/properties/PropertyMandatesTab', () => ({
  PropertyMandatesTab: () => <div data-testid="onglet-mandat" />
}));
vi.mock('../../components/properties/PropertyVisitScheduler', () => ({ PropertyVisitScheduler: () => null }));
vi.mock('../../components/properties/PropertyMaintenanceTab', () => ({ PropertyMaintenanceTab: () => null }));
vi.mock('../../components/properties/PropertyApartments', () => ({ PropertyApartments: () => null }));
vi.mock('../../components/properties/PropertyOwnershipCard', () => ({ PropertyOwnershipCard: () => null }));
vi.mock('../../components/properties/PropertySaleCard', () => ({ PropertySaleCard: () => null }));
vi.mock('../../components/newsletter/PropertyNewsletterCampaignModal', () => ({
  PropertyNewsletterCampaignModal: () => null
}));
vi.mock('../../components/patrimoine/PropertyPatrimoineTab', () => ({ PropertyPatrimoineTab: () => null }));
vi.mock('../../components/patrimoine/entities/PropertyHoldingTaxSection', () => ({
  PropertyHoldingTaxSection: () => null
}));

const BIEN = {
  id: 'bien-1',
  internalReference: 'REF-1',
  propertyType: 'APPARTEMENT',
  ownershipType: 'CLIENT',
  ownerUserId: 'u1',
  owner: { id: 'u1', email: 'awa.konan@exemple.test', fullName: 'Awa Konan' },
  title: 'Appartement Riviera',
  description: 'Bel appartement',
  address: 'Cocody',
  status: 'AVAILABLE',
  availability: 'AVAILABLE',
  transactionModes: ['RENTAL'],
  currency: 'CFA',
  isPublished: false
};

function monter() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/properties/bien-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/properties/:id" element={<PropertyDetail />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  ownAssetsOnly = false;
  getProperty.mockReset().mockResolvedValue(BIEN);
});

describe('Fiche d’un bien — documents, mandat et propriétaire', () => {
  it('nomme le propriétaire (pas son e-mail) dans « Propriété de »', async () => {
    monter();
    expect(await screen.findByText('Awa Konan')).toBeTruthy();
    expect(screen.queryByText('awa.konan@exemple.test')).toBeNull();
  });

  it('bien CLIENT : propose « Documents » et « Mandat de gestion »', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Appartement Riviera');

    await user.click(screen.getByRole('tab', { name: /Documents/ }));
    await waitFor(() => expect(screen.getByTestId('onglet-documents')).toBeTruthy());

    await user.click(screen.getByRole('tab', { name: /Mandat de gestion/ }));
    await waitFor(() => expect(screen.getByTestId('onglet-mandat')).toBeTruthy());
  });

  it('bien de l’agence (pack AGENCE) : « Mandat de gestion » propose de confier le bien', async () => {
    getProperty.mockResolvedValue({ ...BIEN, ownershipType: 'TENANT' });
    monter();
    await screen.findByText('Appartement Riviera');

    expect(screen.getByRole('tab', { name: /Documents/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Mandat de gestion/ })).toBeTruthy();
  });

  it('Patrimoine seul : pas de mandat, ni sur un bien CLIENT ni sur un bien de l’agence', async () => {
    ownAssetsOnly = true;
    monter();
    await screen.findByText('Appartement Riviera');

    expect(screen.getByRole('tab', { name: /Documents/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Mandat de gestion/ })).toBeNull();
  });
});
