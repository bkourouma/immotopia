import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import TenantMaintenance from '../../pages/TenantPortal/Maintenance';

/** Portail locataire — tickets : recherche multicritères paginée par le serveur. */

const getMaintenanceTickets = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getMaintenanceTickets: (...a: unknown[]) => getMaintenanceTickets(...a)
    }
  };
});

const T = { timeout: 8000 };

function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{`${location.pathname}${location.search}`}</span>;
}

function mount(url = '/tenant/maintenance') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Adresse />
        <Routes>
          <Route path="/tenant/maintenance" element={<TenantMaintenance />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const adresse = () => decodeURIComponent(screen.getByTestId('adresse').textContent ?? '');

const reponse = (titres: string[]) => ({
  data: {
    success: true,
    data: {
      tickets: titres.map((title, i) => ({
        id: `t-${i}`,
        title,
        category: 'PLUMBING',
        priority: 'HIGH',
        status: 'DECLARED',
        description: 'Description',
        location_details: null,
        created_at: '2026-05-05T10:00:00.000Z',
        property: { id: 'p1', address: '1 rue des Lilas' },
        assignedVendor: null
      })),
      summary: { total: titres.length, open: titres.length, inProgress: 0, resolved: 0 },
      pagination: { page: 1, limit: 20, total: titres.length, totalPages: 1 }
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  getMaintenanceTickets.mockResolvedValue(reponse(['Fuite sous l’évier']));
});

describe('Portail locataire — recherche des tickets', () => {
  it('envoie la saisie après le debounce et la met dans l’adresse', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Fuite sous l’évier', {}, T);
    expect(getMaintenanceTickets).toHaveBeenLastCalledWith({ page: 1, limit: 20 });

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'fuite');

    await vi.waitFor(
      () => expect(getMaintenanceTickets).toHaveBeenLastCalledWith({ search: 'fuite', page: 1, limit: 20 }),
      T
    );
    expect(adresse()).toContain('q=fuite');
  });

  it('applique les critères d’une adresse partagée', async () => {
    mount('/tenant/maintenance?status=DECLARED,ASSIGNED&priority=URGENT&category=AC');
    await screen.findByText('Fuite sous l’évier', {}, T);
    expect(getMaintenanceTickets).toHaveBeenCalledWith({
      status: 'DECLARED,ASSIGNED',
      priority: 'URGENT',
      category: 'AC',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getMaintenanceTickets.mockImplementation(async (params: Record<string, unknown>) =>
      reponse(params.search ? [] : ['Fuite sous l’évier'])
    );
    mount('/tenant/maintenance?q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Fuite sous l’évier', {}, T)).toBeInTheDocument();
    expect(getMaintenanceTickets).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(adresse()).not.toContain('q=');
  });
});
