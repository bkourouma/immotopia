import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NotificationList } from '../../components/notifications/NotificationList';
import type { NotificationItem } from '../../services/notifications-service';

function item(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'n1',
    key: 'K',
    title: 'Loyer en retard',
    body: 'Le loyer de mars est impayé',
    link: '/tenant/t/rental/leases',
    status: 'SENT',
    failureReason: null,
    readAt: null,
    sentAt: null,
    createdAt: new Date(0).toISOString(),
    deliveries: [],
    ...over
  };
}

describe('NotificationList', () => {
  it('annonce une liste vide', () => {
    render(<NotificationList items={[]} onMarkRead={vi.fn()} />);

    expect(screen.getByText('Aucune notification')).toBeInTheDocument();
  });

  it('montre un canal en échec, avec une seule mention de l’échec', () => {
    render(
      <NotificationList
        items={[
          item({
            status: 'FAILED',
            // Motif tel que l'API le donne à un utilisateur : toujours générique.
            failureReason: "L'envoi a échoué.",
            deliveries: [
              { channel: 'IN_APP', status: 'SENT', failureReason: null },
              { channel: 'WHATSAPP', status: 'FAILED', failureReason: "L'envoi a échoué." }
            ]
          })
        ]}
        onMarkRead={vi.fn()}
      />
    );

    expect(screen.getAllByText('Un envoi a échoué')).toHaveLength(1);
    expect(screen.queryByText("L'envoi a échoué.")).not.toBeInTheDocument();
    expect(screen.getByText(/WhatsApp · Échec/)).toBeInTheDocument();
  });

  it("n'affiche aucune alerte d'échec quand tout est parti", () => {
    render(
      <NotificationList
        items={[item({ deliveries: [{ channel: 'EMAIL', status: 'DELIVERED', failureReason: null }] })]}
        onMarkRead={vi.fn()}
      />
    );

    expect(screen.queryByText('Un envoi a échoué')).not.toBeInTheDocument();
  });

  it('marque comme lue une notification non lue seulement', () => {
    const onMarkRead = vi.fn();
    render(
      <NotificationList
        items={[item({}), item({ id: 'n2', title: 'Déjà lue', readAt: new Date(1).toISOString() })]}
        onMarkRead={onMarkRead}
      />
    );

    const buttons = screen.getAllByRole('button', { name: 'Marquer comme lue' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onMarkRead).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
  });

  it('ouvre le lien de la notification', () => {
    const onOpen = vi.fn();
    render(<NotificationList items={[item({})]} onMarkRead={vi.fn()} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Loyer en retard' }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ link: '/tenant/t/rental/leases' }));
  });
});
