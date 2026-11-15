import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicketDetail } from '../../pages/admin/maintenance/TicketDetail';
import { managerMaintenanceService } from '../../services/maintenance-service';
import {
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus,
  type TicketDetail as Ticket
} from '../../types/maintenance-types';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 't1' } }) }));
vi.mock('../../components/maintenance/VendorSelect', () => ({ VendorSelect: () => null }));
vi.mock('../../services/maintenance-service', () => ({
  managerMaintenanceService: { getTicket: vi.fn(), updateTicket: vi.fn() }
}));

it('affiche le retard contractuel et envoie explicitement la suppression de son échéance', async () => {
  const date = '2026-10-01';
  const data: Ticket = {
    id: 'ticket-1',
    tenantId: 't1',
    propertyId: 'p1',
    title: 'Fuite',
    category: MaintenanceTicketCategory.PLUMBING,
    status: MaintenanceTicketStatus.DECLARED,
    priority: MaintenanceTicketPriority.LOW,
    description: 'Intervention de plomberie',
    contractDueDate: date,
    contractOverdue: true,
    declaredAt: date,
    createdAt: date,
    updatedAt: date,
    attachments: [],
    comments: [],
    statusHistory: []
  };
  const cleared = { success: true, data: { ...data, contractDueDate: null, contractOverdue: false } };
  vi.mocked(managerMaintenanceService.getTicket)
    .mockResolvedValueOnce({ success: true, data })
    .mockResolvedValue(cleared);
  vi.mocked(managerMaintenanceService.updateTicket).mockResolvedValue(cleared);

  render(
    <App>
      <MemoryRouter initialEntries={['/tenant/t1/admin/maintenance/tickets/ticket-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/admin/maintenance/tickets/:ticketId" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>
    </App>
  );

  const field = await screen.findByLabelText('Échéance contractuelle');
  expect(field).toHaveValue(date);
  expect(screen.getByText('Échéance contractuelle dépassée')).toBeVisible();
  fireEvent.change(field, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/ }));
  await waitFor(() =>
    expect(managerMaintenanceService.updateTicket).toHaveBeenCalledWith(
      't1',
      'ticket-1',
      expect.objectContaining({ contractDueDate: null })
    )
  );
  expect(await screen.findByLabelText('Échéance contractuelle')).toHaveValue('');
  expect(screen.queryByText('Échéance contractuelle dépassée')).not.toBeInTheDocument();
});
