import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyDetail } from '../../pages/properties/PropertyDetail';

/**
 * Lot B2 : la fiche d'un terrain propose un lien vers sa régularisation
 * foncière, pré-filtrée sur le bien. Aucun autre type de bien n'en a.
 */

let featurePatrimoine = true;
const getProperty = vi.fn();
vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getProperty: (...a: unknown[]) => getProperty(...a)
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  __esModule: true,
  useOwnAssetsOnly: () => false
}));
vi.mock('../../hooks/useAgencyFeatures', () => ({
  __esModule: true,
  useAgencyFeatures: () => ({ ready: true, access: null, has: () => featurePatrimoine })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(async () => ({ data: { success: true, data: [] } })) }
}));
vi.mock('../../components/properties/PropertyDocumentsTab', () => ({ PropertyDocumentsTab: () => null }));
vi.mock('../../components/properties/PropertyMandatesTab', () => ({ PropertyMandatesTab: () => null }));
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
  propertyType: 'TERRAIN',
  ownershipType: 'TENANT',
  title: 'Terrain de Bingerville',
  description: 'Terrain nu',
  address: 'Bingerville',
  status: 'AVAILABLE',
  availability: 'AVAILABLE',
  transactionModes: ['SALE'],
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
  featurePatrimoine = true;
  getProperty.mockReset().mockResolvedValue(BIEN);
});

describe('Fiche d’un bien — lien « Régularisation foncière »', () => {
  it('un terrain propose le lien, pré-filtré sur le bien', async () => {
    monter();
    await screen.findAllByText('Terrain de Bingerville');

    const lien = await screen.findByRole('link', { name: 'Régularisation foncière' });
    expect(lien).toHaveAttribute('href', '/tenant/agence-1/patrimoine/land?propertyId=bien-1');
  });

  it('un terrain sans la fonctionnalité PATRIMOINE n’a pas ce lien', async () => {
    featurePatrimoine = false;
    monter();
    await screen.findAllByText('Terrain de Bingerville');

    expect(screen.queryByRole('link', { name: 'Régularisation foncière' })).toBeNull();
  });

  it('un autre type de bien n’a pas ce lien', async () => {
    getProperty.mockResolvedValue({ ...BIEN, propertyType: 'APPARTEMENT', title: 'Appartement Riviera' });
    monter();
    await screen.findAllByText('Appartement Riviera');

    expect(screen.queryByRole('link', { name: 'Régularisation foncière' })).toBeNull();
  });
});
