import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { TicketCard } from '../../components/maintenance/TicketCard';
import { TicketList } from '../../pages/tenant/maintenance/TicketList';
import { CreateTicket } from '../../pages/tenant/maintenance/CreateTicket';
import {
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus
} from '../../types/maintenance-types';
import type { Ticket } from '../../types/maintenance-types';

/**
 * Maintenance › « Mes demandes » : BUG-2026-09-29-009 (deux confirmations de
 * suppression) et BUG-2026-09-29-007 (un Agent, sans droit locatif, ne pouvait
 * pas créer de ticket : la lecture du bail répondait 403 et l'écran concluait
 * « pas de bail actif »).
 */

const listTickets = vi.fn();
const deleteTicket = vi.fn();
const createTicket = vi.fn();
const uploadAttachment = vi.fn();
const listActiveLeases = vi.fn();
vi.mock('../../services/maintenance-service', () => ({
  tenantMaintenanceService: {
    listTickets: (...a: unknown[]) => listTickets(...a),
    deleteTicket: (...a: unknown[]) => deleteTicket(...a),
    createTicket: (...a: unknown[]) => createTicket(...a),
    uploadAttachment: (...a: unknown[]) => uploadAttachment(...a),
    listActiveLeases: (...a: unknown[]) => listActiveLeases(...a)
  }
}));

const listProperties = vi.fn();
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' }, user: { id: 'user-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const ticket: Ticket = {
  id: 'ticket-1',
  tenantId: 'agence-1',
  propertyId: 'bien-1',
  title: 'Ticket de test à supprimer',
  category: MaintenanceTicketCategory.PLUMBING,
  priority: MaintenanceTicketPriority.MEDIUM,
  description: 'Description du ticket',
  status: MaintenanceTicketStatus.CANCELED,
  declaredAt: '2026-09-28T10:00:00.000Z',
  createdAt: '2026-09-28T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z'
};

function renderAt(path: string, ui: React.ReactNode, route: string) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={ui} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Suppression d’un ticket : une seule confirmation (BUG-009)', () => {
  it('la carte n’ouvre aucune bulle : « Supprimer » délègue tout de suite à l’écran', async () => {
    const onDelete = vi.fn();
    render(
      <AntApp>
        <TicketCard ticket={ticket} onEdit={vi.fn()} onDelete={onDelete} />
      </AntApp>
    );

    await userEvent.click(screen.getByRole('button', { name: /Supprimer/ }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('ticket-1');
    // Aucune bulle de confirmation propre à la carte.
    expect(screen.queryByText('Oui, supprimer')).not.toBeInTheDocument();
  });

  it('depuis la liste : une seule fenêtre de confirmation, puis une seule suppression', async () => {
    listTickets.mockResolvedValue({
      success: true,
      data: [ticket],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    deleteTicket.mockResolvedValue({ success: true });

    renderAt('/tenant/agence-1/maintenance', <TicketList />, '/tenant/:tenantId/maintenance');

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer/ }));

    // Exactement une question de confirmation à l'écran.
    await screen.findAllByText('Supprimer définitivement le ticket');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(deleteTicket).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }));

    await waitFor(() => expect(deleteTicket).toHaveBeenCalledTimes(1));
    expect(deleteTicket).toHaveBeenCalledWith('agence-1', 'ticket-1');
  });
});

describe('Nouveau ticket par un Agent sans droit locatif (BUG-007)', () => {
  const property = {
    id: 'bien-1',
    internalReference: 'REF-1',
    title: 'Palmiers A2',
    owner: { fullName: 'Awa Konaté' }
  };

  async function remplirEtEnvoyer() {
    await userEvent.click(await screen.findByRole('combobox', { name: /Propriété/ }));
    await userEvent.click(await screen.findByText('Awa Konaté - Palmiers A2'));

    await userEvent.type(screen.getByLabelText('Titre'), 'Fuite sous évier');
    await userEvent.click(screen.getByRole('combobox', { name: /Catégorie/ }));
    await userEvent.click(await screen.findByText('Plomberie'));
    await userEvent.click(screen.getByRole('combobox', { name: /Priorité/ }));
    await userEvent.click(await screen.findByText('Élevée'));
    await userEvent.type(screen.getByLabelText('Description'), 'Le robinet fuit depuis ce matin');

    await userEvent.click(screen.getByRole('button', { name: /Créer le ticket/ }));
  }

  beforeEach(() => {
    listProperties.mockResolvedValue({ properties: [property], pagination: {} });
    createTicket.mockResolvedValue({ success: true, data: { id: 'nouveau-ticket' } });
  });

  it('propose tous les biens accessibles (pas seulement les biens « loués ») et lit le bail sous la permission maintenance', async () => {
    listActiveLeases.mockResolvedValue([
      { id: 'bail-1', leaseNumber: 'BAIL-2026-0001', startDate: '2026-01-01T00:00:00.000Z' }
    ]);

    renderAt('/tenant/agence-1/maintenance/new', <CreateTicket />, '/tenant/:tenantId/maintenance/new');
    await remplirEtEnvoyer();

    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(1));
    // Aucun filtre de statut : le statut d'un bien ne reflète pas toujours son bail.
    expect(listProperties.mock.calls[0][1]).not.toHaveProperty('status');
    expect(listActiveLeases).toHaveBeenCalledWith('agence-1', 'bien-1');
    expect(createTicket.mock.calls[0][1]).toMatchObject({ propertyId: 'bien-1', leaseId: 'bail-1' });
  });

  it('si la lecture du bail échoue (403), l’écran ne conclut pas « pas de bail actif » : le serveur tranche', async () => {
    listActiveLeases.mockRejectedValue({ response: { status: 403 } });

    renderAt('/tenant/agence-1/maintenance/new', <CreateTicket />, '/tenant/:tenantId/maintenance/new');
    await remplirEtEnvoyer();

    await waitFor(() => expect(createTicket).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/n'a pas de bail actif/)).not.toBeInTheDocument();
  });

  it('un bien sans aucun bail actif est signalé et le formulaire ne part pas', async () => {
    listActiveLeases.mockResolvedValue([]);

    renderAt('/tenant/agence-1/maintenance/new', <CreateTicket />, '/tenant/:tenantId/maintenance/new');
    await remplirEtEnvoyer();

    expect(await screen.findAllByText(/n'a pas de bail actif/)).not.toHaveLength(0);
    expect(createTicket).not.toHaveBeenCalled();
  });
});
