import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Maintenance from '../../pages/OwnerPortal/Maintenance';

/**
 * Tickets de maintenance du portail propriétaire : liste paginée par le
 * serveur, pilotée par la barre de recherche (état dans l'URL).
 */

const getMaintenanceTickets = vi.hoisted(() => vi.fn());
const getMaintenanceTicketDetails = vi.hoisted(() => vi.fn());
const getProperties = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getMaintenanceTickets: (...args: unknown[]) => getMaintenanceTickets(...args),
    getMaintenanceTicketDetails: (...args: unknown[]) => getMaintenanceTicketDetails(...args),
    getProperties: (...args: unknown[]) => getProperties(...args)
  }
}));

const TICKET = {
  id: 'tk1',
  propertyAddress: 'Villa Angré',
  category: 'PLUMBING',
  priority: 'HIGH',
  title: 'Fuite sous l’évier',
  status: 'DECLARED',
  createdAt: '2026-10-05T09:30:00.000Z'
};

const reponse = (tickets: unknown[]) => ({
  data: {
    success: true,
    data: {
      tickets,
      summary: { total: tickets.length, open: tickets.length, inProgress: 0, resolved: 0, totalCost: 0 },
      pagination: { page: 1, limit: 20, total: tickets.length, totalPages: 1 }
    }
  }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/owner/maintenance') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/owner/maintenance" element={<Maintenance />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  getMaintenanceTickets.mockReset();
  getMaintenanceTicketDetails.mockReset();
  getProperties.mockReset();
  getMaintenanceTickets.mockResolvedValue(reponse([TICKET]));
  getProperties.mockResolvedValue({
    data: { success: true, data: { properties: [{ id: 'p1', address: 'Villa Angré' }] } }
  });
});

describe('Maintenance propriétaire : recherche multicritères', () => {
  it('charge la première page sans critère et ne demande les biens qu’une fois', async () => {
    renderPage();
    expect(await screen.findByText('Fuite sous l’évier', undefined, T)).toBeInTheDocument();
    expect(getMaintenanceTickets).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(getProperties).toHaveBeenCalledTimes(1);
  });

  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Fuite sous l’évier', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'fuite');
    await vi.waitFor(
      () => expect(getMaintenanceTickets).toHaveBeenLastCalledWith({ search: 'fuite', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=fuite');
  });

  it('applique les critères d’une URL partagée', async () => {
    renderPage('/owner/maintenance?status=DECLARED,IN_PROGRESS&priority=URGENT&category=AC');
    await screen.findByText('Fuite sous l’évier', undefined, T);
    expect(getMaintenanceTickets).toHaveBeenCalledWith({
      status: 'DECLARED,IN_PROGRESS',
      priority: 'URGENT',
      category: 'AC',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getMaintenanceTickets.mockImplementation(async (params: Record<string, unknown>) =>
      reponse(params.search ? [] : [TICKET])
    );
    renderPage('/owner/maintenance?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Fuite sous l’évier', undefined, T)).toBeInTheDocument();
    expect(getMaintenanceTickets).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
