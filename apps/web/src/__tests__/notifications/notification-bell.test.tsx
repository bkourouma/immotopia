import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from '../../components/notifications/NotificationBell';
import type { NotificationItem, NotificationScope } from '../../services/notifications-service';

const service = vi.hoisted(() => ({
  getUnreadCount: vi.fn(),
  listMyNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn()
}));

vi.mock('../../services/notifications-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/notifications-service')>()),
  ...service
}));

const scope: NotificationScope = { kind: 'agency', tenantId: 'tenant-1' };

function item(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'n1',
    key: 'MAINTENANCE_TICKET_CREATED_TENANT',
    title: 'Nouveau ticket',
    body: 'Fuite dans la cuisine',
    link: null,
    status: 'SENT',
    failureReason: null,
    readAt: null,
    sentAt: null,
    createdAt: new Date(0).toISOString(),
    deliveries: [{ channel: 'IN_APP', status: 'SENT', failureReason: null }],
    ...over
  };
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell scope={scope} />
    </MemoryRouter>
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    Object.values(service).forEach(mock => mock.mockReset());
    service.getUnreadCount.mockResolvedValue(3);
    service.listMyNotifications.mockResolvedValue({ items: [item({})], total: 1, page: 1, pageSize: 20 });
    service.markRead.mockResolvedValue({ id: 'n1', readAt: new Date(1).toISOString() });
  });

  it('affiche le compteur de non-lus dans la pastille et le nom accessible', async () => {
    renderBell();

    expect(await screen.findByRole('button', { name: /3 non lues/ })).toBeInTheDocument();
    expect(service.getUnreadCount).toHaveBeenCalledWith(scope);
  });

  it('ouvre le tiroir au clic et liste les notifications', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: /non lues/ }));

    expect(await screen.findByText('Nouveau ticket')).toBeInTheDocument();
    expect(service.listMyNotifications).toHaveBeenCalledWith(scope, { unreadOnly: false, page: 1, pageSize: 20 });
  });

  it('marque une notification comme lue et décrémente le compteur', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: /non lues/ }));
    await screen.findByText('Nouveau ticket');

    fireEvent.click(screen.getAllByRole('button', { name: 'Marquer comme lue' })[0]);

    await waitFor(() => expect(service.markRead).toHaveBeenCalledWith(scope, 'n1'));
    expect(await screen.findByRole('button', { name: /2 non lues/ })).toBeInTheDocument();
  });

  it('garde le compteur précédent quand la lecture échoue', async () => {
    service.getUnreadCount.mockResolvedValueOnce(2).mockRejectedValue(new Error('réseau'));
    renderBell();

    expect(await screen.findByRole('button', { name: /2 non lues/ })).toBeInTheDocument();
  });
});

describe('NotificationBell en portail', () => {
  it('interroge le scope du portail', async () => {
    Object.values(service).forEach(mock => mock.mockReset());
    service.getUnreadCount.mockResolvedValue(2);
    const portalScope: NotificationScope = { kind: 'portal', portal: 'tenant' };
    render(
      <MemoryRouter>
        <NotificationBell scope={portalScope} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: /2 non lues/ })).toBeInTheDocument();
    expect(service.getUnreadCount).toHaveBeenCalledWith(portalScope);
  });
});
