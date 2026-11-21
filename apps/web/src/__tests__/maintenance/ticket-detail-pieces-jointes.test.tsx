import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicketDetail } from '../../pages/tenant/maintenance/TicketDetail';
import { tenantMaintenanceService } from '../../services/maintenance-service';
import {
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus,
  type TicketDetail as Ticket
} from '../../types/maintenance-types';

/**
 * Revue maintenance (lot 4) : l'écran de création promet « vous pouvez la rajouter
 * depuis le ticket », mais le détail n'offrait aucun moyen d'ajouter une pièce
 * jointe. Il l'offre désormais, sans dépasser les 10 pièces de l'API.
 */

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 't1' } }) }));
vi.mock('../../components/maintenance/AttachmentList', () => ({ AttachmentList: () => null }));
vi.mock('../../services/maintenance-service', () => ({
  tenantMaintenanceService: {
    getTicket: vi.fn(),
    uploadAttachment: vi.fn(),
    cancelTicket: vi.fn(),
    addComment: vi.fn()
  }
}));

const date = '2026-11-01';
const baseTicket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'ticket-1',
  tenantId: 't1',
  propertyId: 'p1',
  title: 'Fuite',
  category: MaintenanceTicketCategory.PLUMBING,
  status: MaintenanceTicketStatus.DECLARED,
  priority: MaintenanceTicketPriority.LOW,
  description: 'Fuite sous évier',
  declaredAt: date,
  createdAt: date,
  updatedAt: date,
  attachments: [],
  comments: [],
  statusHistory: [],
  ...over
});

function renderDetail() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/tenant/t1/maintenance/ticket-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/maintenance/:ticketId" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>
    </App>
  );
}

function pickFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('détail du ticket : ajout de pièces jointes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envoie le fichier choisi vers le ticket puis recharge le détail', async () => {
    vi.mocked(tenantMaintenanceService.getTicket).mockResolvedValue({ success: true, data: baseTicket() });
    vi.mocked(tenantMaintenanceService.uploadAttachment).mockResolvedValue({ success: true, data: {} as never });

    const { container } = renderDetail();
    const add = await screen.findByRole('button', { name: /Ajouter les pièces jointes/ });
    expect(add).toBeDisabled();

    pickFile(container, new File(['x'], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Ajouter les pièces jointes/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Ajouter les pièces jointes/ }));

    await waitFor(() => expect(tenantMaintenanceService.uploadAttachment).toHaveBeenCalledTimes(1));
    const [tenantId, ticketId, file] = vi.mocked(tenantMaintenanceService.uploadAttachment).mock.calls[0];
    expect([tenantId, ticketId, (file as File).name]).toEqual(['t1', 'ticket-1', 'photo.png']);
    await waitFor(() => expect(tenantMaintenanceService.getTicket).toHaveBeenCalledTimes(2));
  });

  it('un ticket annulé n’accepte plus de pièce jointe', async () => {
    vi.mocked(tenantMaintenanceService.getTicket).mockResolvedValue({
      success: true,
      data: baseTicket({ status: MaintenanceTicketStatus.CANCELED })
    });
    renderDetail();
    await screen.findByText('Fuite');
    expect(screen.queryByRole('button', { name: /Ajouter les pièces jointes/ })).toBeNull();
  });

  it('au plafond de 10 pièces, annonce la limite au lieu du sélecteur', async () => {
    const attachments = Array.from({ length: 10 }, (_, index) => ({
      id: `a${index}`,
      ticketId: 'ticket-1',
      fileUrl: '/x',
      fileName: `f${index}.pdf`,
      fileSize: 1,
      createdAt: date
    }));
    vi.mocked(tenantMaintenanceService.getTicket).mockResolvedValue({
      success: true,
      data: baseTicket({ attachments })
    });
    renderDetail();
    expect(await screen.findByText(/Nombre maximum de pièces jointes atteint/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Ajouter les pièces jointes/ })).toBeNull();
  });
});
