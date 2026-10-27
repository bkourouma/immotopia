import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { NotificationJournal } from '../../components/notifications/NotificationJournal';
import type { AdminNotificationItem } from '../../services/notifications-service';

const service = vi.hoisted(() => ({
  listAdminNotifications: vi.fn(),
  listPlatformNotifications: vi.fn(),
  listNotificationRecipients: vi.fn(),
  resendNotification: vi.fn(),
  resendPlatformNotification: vi.fn()
}));

vi.mock('../../services/notifications-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/notifications-service')>()),
  ...service
}));

vi.mock('../../services/tenant-service', () => ({
  listTenants: vi.fn().mockResolvedValue({ success: true, data: { tenants: [], pagination: {} } })
}));

function row(over: Partial<AdminNotificationItem>): AdminNotificationItem {
  return {
    id: 'n1',
    key: 'K',
    title: 'Quittance disponible',
    body: 'Votre quittance est prête',
    link: null,
    status: 'FAILED',
    failureReason: 'Numéro invalide',
    readAt: null,
    sentAt: null,
    createdAt: new Date(0).toISOString(),
    recipient: { userId: 'u1', label: 'Awa Traoré' },
    sender: null,
    relatedEntity: null,
    deliveries: [
      {
        channel: 'WHATSAPP',
        status: 'FAILED',
        target: '+2250700000000',
        failureReason: 'Numéro invalide',
        attempts: 2,
        lastAttemptAt: new Date(0).toISOString(),
        sentAt: null
      }
    ],
    ...over
  };
}

function renderJournal() {
  return render(
    <AntApp>
      <NotificationJournal mode={{ kind: 'agency', tenantId: 'tenant-1' }} />
    </AntApp>
  );
}

describe('NotificationJournal', () => {
  beforeEach(() => {
    Object.values(service).forEach(mock => mock.mockReset());
    service.listAdminNotifications.mockResolvedValue({ items: [row({})], total: 1, page: 1, pageSize: 20 });
    service.listNotificationRecipients.mockResolvedValue([{ userId: 'u1', label: 'Awa Traoré' }]);
  });

  it("liste les envois de l'agence avec leur statut par canal", async () => {
    renderJournal();

    expect(await screen.findByText('Quittance disponible')).toBeInTheDocument();
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp · Échec/)).toBeInTheDocument();
    expect(service.listAdminNotifications).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ page: 1 }));
  });

  it('relance la lecture avec la recherche saisie', async () => {
    renderJournal();
    await screen.findByText('Quittance disponible');

    const input = screen.getByPlaceholderText('Rechercher');
    fireEvent.change(input, { target: { value: 'quittance' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

    await waitFor(() =>
      expect(service.listAdminNotifications).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ q: 'quittance', page: 1 })
      )
    );
  });

  it('renvoie un envoi en échec et affiche le résultat', async () => {
    service.resendNotification.mockResolvedValue(
      row({
        status: 'SENT',
        failureReason: null,
        deliveries: [
          {
            channel: 'WHATSAPP',
            status: 'SENT',
            target: '+2250700000000',
            failureReason: null,
            attempts: 3,
            lastAttemptAt: new Date(1).toISOString(),
            sentAt: new Date(1).toISOString()
          }
        ]
      })
    );
    renderJournal();
    await screen.findByText('Quittance disponible');

    fireEvent.click(screen.getByRole('button', { name: /Renvoyer/ }));

    await waitFor(() => expect(service.resendNotification).toHaveBeenCalledWith('tenant-1', 'n1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Renvoyer/ })).not.toBeInTheDocument());
  });

  it('montre le motif et le nombre de tentatives dans le détail', async () => {
    renderJournal();
    fireEvent.click(await screen.findByText('Quittance disponible'));

    expect(await screen.findByText("Échec de l'envoi")).toBeInTheDocument();
    expect(screen.getAllByText('Numéro invalide').length).toBeGreaterThan(0);
    expect(screen.getByText('Tentatives')).toBeInTheDocument();
  });
});
