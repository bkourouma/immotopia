import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyApartments } from '../../components/properties/PropertyApartments';
import { PropertyMaintenanceTab } from '../../components/properties/PropertyMaintenanceTab';
import { PropertyVisitsList } from '../../components/properties/PropertyVisitsList';
import type { Property } from '../../types/property-types';

/**
 * Recherche locale des trois listes d'un bien : lots d'un immeuble (préfixe
 * `lot`), historique de maintenance (`mnt`) et visites (`vis`). Chaque API rend
 * la liste complète du bien : le filtrage se fait dans le navigateur, sans
 * accent ni casse, et l'état vit dans l'URL.
 */

const get = vi.fn();
const getHistory = vi.fn();
const getPropertyVisits = vi.fn();

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn() }
}));
vi.mock('../../services/maintenance-service', () => ({
  __esModule: true,
  propertyMaintenanceService: { getHistory: (...a: unknown[]) => getHistory(...a) }
}));
vi.mock('../../services/property-service', () => ({
  __esModule: true,
  uploadMedia: vi.fn(),
  getPropertyVisits: (...a: unknown[]) => getPropertyVisits(...a),
  updateVisitStatus: vi.fn(),
  completePropertyVisit: vi.fn()
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xl', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function monter(ui: React.ReactElement, url = '/fiche') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Url />
        {ui}
      </MemoryRouter>
    </AntApp>
  );
}

const IMMEUBLE = {
  id: 'imm-1',
  propertyType: 'IMMEUBLE',
  title: 'Immeuble R+3',
  address: 'Route d’Akandjé',
  currency: 'FCFA',
  ownershipType: 'TENANT',
  transactionModes: ['RENTAL']
} as unknown as Property;

const lot = (id: string, title: string, status: string) =>
  ({ id, propertyType: 'APPARTEMENT', title, rooms: 3, price: 150000, status }) as unknown as Property;

beforeEach(() => {
  get.mockReset();
  getHistory.mockReset();
  getPropertyVisits.mockReset();
});

describe('Lots d’un immeuble : recherche locale', () => {
  beforeEach(() => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [lot('1', 'Appartement Étage 1', 'AVAILABLE'), lot('2', 'Appartement Rez-de-chaussée', 'RENTED')]
      }
    });
  });

  it('filtre sans accent ni casse et écrit lot.q dans l’URL', async () => {
    const user = userEvent.setup();
    monter(<PropertyApartments propertyId="imm-1" tenantId="t1" property={IMMEUBLE} />);
    await screen.findAllByText('Appartement Étage 1', undefined, T);

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les lots' })).getByRole('textbox'),
      'ETAGE'
    );
    await waitFor(() => expect(screen.queryAllByText('Appartement Rez-de-chaussée')).toHaveLength(0), T);
    expect(screen.getAllByText('Appartement Étage 1').length).toBeGreaterThan(0);
    expect(screen.getByTestId('url').textContent).toContain('lot.q=ETAGE');
  });

  it('applique le statut d’une URL partagée', async () => {
    monter(<PropertyApartments propertyId="imm-1" tenantId="t1" property={IMMEUBLE} />, '/fiche?lot.status=RENTED');
    await screen.findAllByText('Appartement Rez-de-chaussée', undefined, T);
    expect(screen.queryAllByText('Appartement Étage 1')).toHaveLength(0);
  });
});

describe('Maintenance d’un bien : recherche locale', () => {
  const ticket = (id: string, title: string, status: string, category: string) => ({
    id,
    title,
    description: '',
    status,
    category,
    priority: 'LOW',
    createdAt: '2026-10-01T10:00:00Z'
  });

  beforeEach(() => {
    getHistory.mockResolvedValue({
      success: true,
      data: [
        ticket('a', 'Fuite sous évier', 'DECLARED', 'PLUMBING'),
        ticket('b', 'Prise défectueuse', 'RESOLVED', 'ELECTRICITY')
      ]
    });
  });

  it('charge tout l’historique sans filtre serveur', async () => {
    monter(<PropertyMaintenanceTab propertyId="p1" tenantId="t1" />);
    await screen.findByText('Fuite sous évier', undefined, T);
    expect(getHistory).toHaveBeenCalledWith('t1', 'p1');
    expect(screen.getByRole('search', { name: 'Rechercher dans la maintenance' })).toBeInTheDocument();
  });

  it('filtre par saisie (mnt.q)', async () => {
    const user = userEvent.setup();
    monter(<PropertyMaintenanceTab propertyId="p1" tenantId="t1" />);
    await screen.findByText('Fuite sous évier', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'prise');
    await waitFor(() => expect(screen.queryByText('Fuite sous évier')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Prise défectueuse')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('mnt.q=prise');
  });

  it('applique la catégorie d’une URL partagée', async () => {
    monter(<PropertyMaintenanceTab propertyId="p1" tenantId="t1" />, '/fiche?mnt.category=PLUMBING');
    await screen.findByText('Fuite sous évier', undefined, T);
    expect(screen.queryByText('Prise défectueuse')).not.toBeInTheDocument();
  });
});

describe('Visites d’un bien : recherche locale', () => {
  const visite = (id: string, prenom: string, status: string) => ({
    id,
    propertyId: 'p1',
    visitType: 'IN_PERSON',
    scheduledAt: '2026-10-05T09:00:00Z',
    status,
    contact: { id: `c${id}`, firstName: prenom, lastName: 'Kouassi' },
    createdAt: '',
    updatedAt: ''
  });

  beforeEach(() => {
    getPropertyVisits.mockResolvedValue([visite('1', 'Awa', 'DONE'), visite('2', 'Yao', 'CANCELED')]);
  });

  it('filtre par saisie (vis.q)', async () => {
    const user = userEvent.setup();
    monter(<PropertyVisitsList propertyId="p1" tenantId="t1" />);
    await screen.findByText('Awa Kouassi', undefined, T);
    await user.type(screen.getByPlaceholderText('Contact, assigné à, notes…'), 'yao');
    await waitFor(() => expect(screen.queryByText('Awa Kouassi')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Yao Kouassi')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('vis.q=yao');
  });

  it('applique le statut d’une URL partagée', async () => {
    monter(<PropertyVisitsList propertyId="p1" tenantId="t1" />, '/fiche?vis.status=DONE');
    await screen.findByText('Awa Kouassi', undefined, T);
    expect(screen.queryByText('Yao Kouassi')).not.toBeInTheDocument();
  });
});
