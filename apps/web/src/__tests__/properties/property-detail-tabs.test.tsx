import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyDetail } from '../../pages/properties/PropertyDetail';
import { switchPropertyTab } from '../../pages/properties/property-detail-tabs';

/**
 * Fiche d'un bien : un seul onglet est monté à la fois (`destroyOnHidden`).
 * Les requêtes des onglets lourds ne partent qu'à l'affichage de l'onglet, et
 * quitter un onglet le démonte.
 */

const getProperty = vi.fn();
vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getProperty: (...a: unknown[]) => getProperty(...a)
}));
vi.mock('../../hooks/useMenuAccess', () => ({ __esModule: true, useOwnAssetsOnly: () => false }));
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

vi.mock('../../components/properties/PropertyDocumentsTab', () => ({
  PropertyDocumentsTab: () => <div data-testid="onglet-documents" />
}));
vi.mock('../../components/properties/PropertyMaintenanceTab', () => ({
  PropertyMaintenanceTab: () => <div data-testid="onglet-maintenance" />
}));
vi.mock('../../components/properties/PropertyMandatesTab', () => ({ PropertyMandatesTab: () => null }));
vi.mock('../../components/properties/PropertyVisitScheduler', () => ({
  PropertyVisitScheduler: () => {
    const [saisie, setSaisie] = React.useState('');
    return <input aria-label="saisie-visite" value={saisie} onChange={e => setSaisie(e.target.value)} />;
  }
}));
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
  title: 'Appartement Riviera',
  description: 'Bel appartement',
  address: 'Cocody',
  status: 'AVAILABLE',
  availability: 'AVAILABLE',
  transactionModes: ['RENTAL'],
  currency: 'CFA',
  isPublished: false
};

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function monter(url = '/tenant/agence-1/properties/bien-1') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Url />
        <Routes>
          <Route path="/tenant/:tenantId/properties/:id" element={<PropertyDetail />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  getProperty.mockReset().mockResolvedValue(BIEN);
});

describe('Fiche d’un bien : onglets paresseux', () => {
  it('ne monte aucun onglet lourd tant qu’il n’est pas affiché', async () => {
    monter();
    await screen.findByText('Appartement Riviera');
    expect(screen.queryByTestId('onglet-documents')).toBeNull();
    expect(screen.queryByTestId('onglet-maintenance')).toBeNull();
  });

  it('ouvre directement l’onglet de l’URL, sans monter les autres', async () => {
    monter('/tenant/agence-1/properties/bien-1?onglet=documents');
    expect(await screen.findByTestId('onglet-documents')).toBeTruthy();
    expect(screen.queryByTestId('onglet-maintenance')).toBeNull();
  });

  it('démonte l’onglet quitté : un seul onglet est monté', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Appartement Riviera');

    await user.click(screen.getByRole('tab', { name: /Documents/ }));
    await waitFor(() => expect(screen.getByTestId('onglet-documents')).toBeTruthy());

    await user.click(screen.getByRole('tab', { name: /Maintenance/ }));
    await waitFor(() => expect(screen.getByTestId('onglet-maintenance')).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId('onglet-documents')).toBeNull());
  });
});

describe('switchPropertyTab', () => {
  it('retire les clés des autres onglets, garde le reste et pose le nouvel onglet', () => {
    const suivant = switchPropertyTab(
      new URLSearchParams(
        'onglet=lots&lot.q=a&mnt.page=2&vis.q=x&sin.q=1&val.q=1&dep.q=1&cre.q=1&trv.q=1&doc.q=1&pdoc.q=1&rubrique=x&autre=1'
      ),
      'maintenance'
    );
    expect(suivant.toString()).toBe('onglet=maintenance&autre=1');
  });
});

describe('Fiche d’un bien : cycle de vie et URL', () => {
  it('l’onglet visites garde sa saisie après un changement d’onglet', async () => {
    const user = userEvent.setup();
    monter('/tenant/agence-1/properties/bien-1?onglet=visites');
    await user.type(await screen.findByLabelText('saisie-visite'), 'abc');
    await user.click(screen.getByRole('tab', { name: /Documents/ }));
    await waitFor(() => expect(screen.getByTestId('onglet-documents')).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId('onglet-maintenance')).toBeNull());
    await user.click(screen.getByRole('tab', { name: /Visites/ }));
    expect(await screen.findByLabelText('saisie-visite')).toHaveValue('abc');
  });

  it('changer d’onglet retire de l’URL les clés des autres onglets', async () => {
    const user = userEvent.setup();
    monter('/tenant/agence-1/properties/bien-1?onglet=apercu&lot.q=a&rubrique=x&autre=1');
    await screen.findByText('Appartement Riviera');
    await user.click(screen.getByRole('tab', { name: /Maintenance/ }));
    await waitFor(() => expect(screen.getByTestId('onglet-maintenance')).toBeTruthy());
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).toContain('onglet=maintenance');
    expect(url).toContain('autre=1');
    expect(url).not.toContain('lot.q');
    expect(url).not.toContain('rubrique');
  });
});
