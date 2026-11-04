import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Tickets } from '../../pages/admin/maintenance/Tickets';
import { Vendors } from '../../pages/admin/maintenance/Vendors';
import { TicketList } from '../../pages/tenant/maintenance/TicketList';

/**
 * Recherche multicritères de la maintenance (lot DIV-C) : tickets de l'agence,
 * prestataires, mes tickets. Critères dans l'URL, requête rejouée au service.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 't1' } })
}));

const managerListTickets = vi.hoisted(() => vi.fn());
const tenantListTickets = vi.hoisted(() => vi.fn());
const listVendors = vi.hoisted(() => vi.fn());
const getVendor = vi.hoisted(() => vi.fn());
vi.mock('../../services/maintenance-service', () => ({
  managerMaintenanceService: { listTickets: (...a: unknown[]) => managerListTickets(...a) },
  tenantMaintenanceService: { listTickets: (...a: unknown[]) => tenantListTickets(...a), deleteTicket: vi.fn() },
  vendorMaintenanceService: {
    listVendors: (...a: unknown[]) => listVendors(...a),
    getVendor: (...a: unknown[]) => getVendor(...a),
    createVendor: vi.fn(),
    updateVendor: vi.fn(),
    deleteVendor: vi.fn()
  }
}));
const listProperties = vi.hoisted(() => vi.fn());
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a),
  getProperty: vi.fn(async () => ({ id: 'p1', internalReference: 'REF-1', title: 'Villa' }))
}));

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(path: string, route: string, element: React.ReactElement) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[path]}>
        <Url />
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const TICKET = {
  id: 'k1',
  title: 'Fuite sous évier',
  category: 'PLUMBING',
  priority: 'HIGH',
  status: 'DECLARED',
  property: { address: 'Rue des Jardins' },
  createdAt: '2026-10-01T10:00:00.000Z'
};
const reponseTickets = (data: unknown[]) => ({
  success: true,
  data,
  pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 }
});

beforeEach(() => {
  managerListTickets.mockReset().mockResolvedValue(reponseTickets([TICKET]));
  tenantListTickets.mockReset().mockResolvedValue(reponseTickets([{ ...TICKET, property: { title: 'Villa' } }]));
  listVendors.mockReset().mockResolvedValue({
    success: true,
    data: [{ id: 'v1', name: 'Plomberie Express', isActive: true }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
  getVendor.mockReset();
  listProperties.mockReset().mockResolvedValue({ properties: [], pagination: {} });
});

describe('admin/maintenance/Tickets — recherche', () => {
  it('relit les critères de l’URL et les envoie au service', async () => {
    mount(
      '/tenant/t1/admin/maintenance/tickets?status=DECLARED&createdFrom=2026-10-01',
      '/tenant/:tenantId/admin/maintenance/tickets',
      <Tickets />
    );
    await screen.findByText('Fuite sous évier', undefined, T);
    expect(managerListTickets).toHaveBeenCalledWith('t1', {
      status: 'DECLARED',
      dateFrom: '2026-10-01',
      page: 1,
      limit: 20
    });
  });

  it('envoie la saisie libre après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    mount('/tenant/t1/admin/maintenance/tickets', '/tenant/:tenantId/admin/maintenance/tickets', <Tickets />);
    await screen.findByText('Fuite sous évier', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'fuite');
    await vi.waitFor(
      () => expect(managerListTickets).toHaveBeenLastCalledWith('t1', { search: 'fuite', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=fuite');
  });

  it('garde la barre et propose d’effacer quand rien ne correspond', async () => {
    const user = userEvent.setup();
    managerListTickets.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponseTickets(params.search ? [] : [TICKET])
    );
    mount('/tenant/t1/admin/maintenance/tickets?q=zzz', '/tenant/:tenantId/admin/maintenance/tickets', <Tickets />);
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(boutons[boutons.length - 1]);
    expect(await screen.findByText('Fuite sous évier', undefined, T)).toBeInTheDocument();
    expect(managerListTickets).toHaveBeenLastCalledWith('t1', { page: 1, limit: 20 });
  });
});

describe('admin/maintenance/Vendors — recherche', () => {
  it('envoie la recherche et le statut au service', async () => {
    mount(
      '/tenant/t1/admin/maintenance/vendors?q=plomb&active=1',
      '/tenant/:tenantId/admin/maintenance/vendors',
      <Vendors />
    );
    await screen.findByText('Plomberie Express', undefined, T);
    expect(listVendors).toHaveBeenCalledWith('t1', { search: 'plomb', isActive: true, page: 1, limit: 20 });
  });

  it('affiche « Aucun prestataire » sans critère', async () => {
    listVendors.mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    });
    mount('/tenant/t1/admin/maintenance/vendors', '/tenant/:tenantId/admin/maintenance/vendors', <Vendors />);
    expect(await screen.findByText('Aucun prestataire', undefined, T)).toBeInTheDocument();
  });
});

describe('tenant/maintenance/TicketList — recherche', () => {
  it('envoie statut, bien et période de l’URL au service', async () => {
    mount(
      '/tenant/t1/maintenance?status=RESOLVED&propertyId=p1&createdTo=2026-10-31',
      '/tenant/:tenantId/maintenance',
      <TicketList />
    );
    await screen.findByText('Fuite sous évier', undefined, T);
    expect(tenantListTickets).toHaveBeenCalledWith('t1', {
      status: 'RESOLVED',
      propertyId: 'p1',
      dateTo: '2026-10-31',
      page: 1,
      limit: 20
    });
  });

  it('affiche l’état « aucun résultat » avec Effacer sous critère', async () => {
    tenantListTickets.mockResolvedValue(reponseTickets([]));
    mount('/tenant/t1/maintenance?q=zzz', '/tenant/:tenantId/maintenance', <TicketList />);
    expect(await screen.findByText('Aucun ticket ne correspond aux critères', undefined, T)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Effacer les critères' }).length).toBeGreaterThan(0);
  });
});
