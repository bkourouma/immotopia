import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { NotificationsPage } from '../../pages/notifications/NotificationsPage';

/** Mes notifications : recherche (titre, message), non lues, période — critères dans l'URL et envoyés à l'API. */

const service = vi.hoisted(() => ({
  listMyNotifications: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn()
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../components/notifications/useNotificationScope', () => ({ useNotificationScope: () => null }));
vi.mock('../../services/notifications-service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/notifications-service')>()),
  ...service
}));

const SCOPE = { kind: 'agency', tenantId: 't1' } as const;

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    key: 'K',
    title: 'Quittance disponible',
    body: 'Votre quittance est prête',
    link: null,
    status: 'SENT',
    failureReason: null,
    readAt: null,
    sentAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    deliveries: [],
    ...over
  };
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/notifications') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Url />
      <NotificationsPage scope={SCOPE} />
    </MemoryRouter>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  Object.values(service).forEach(mock => mock.mockReset());
  service.listMyNotifications.mockResolvedValue({ items: [item()], total: 1, page: 1, pageSize: 20 });
});

describe('NotificationsPage — recherche', () => {
  it('lit la première page sans critère', async () => {
    mount();
    await screen.findByText('Quittance disponible', undefined, T);
    expect(service.listMyNotifications).toHaveBeenCalledWith(SCOPE, { page: 1, pageSize: 20 });
  });

  it('envoie la saisie après la temporisation et la met dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Quittance disponible', undefined, T);

    await user.type(screen.getByPlaceholderText('Titre ou message…'), 'loyer');

    await vi.waitFor(
      () => expect(service.listMyNotifications).toHaveBeenLastCalledWith(SCOPE, { q: 'loyer', page: 1, pageSize: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=loyer');
  });

  it('applique non lues + période d’une URL partagée', async () => {
    mount('/notifications?unreadOnly=1&periodFrom=2026-10-01&periodTo=2026-10-31');
    await screen.findByText('Quittance disponible', undefined, T);
    expect(service.listMyNotifications).toHaveBeenCalledWith(SCOPE, {
      unreadOnly: 'true',
      from: '2026-10-01',
      to: '2026-10-31',
      page: 1,
      pageSize: 20
    });
  });

  it('sans résultat : message dédié et bouton Effacer', async () => {
    service.listMyNotifications.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    mount('/notifications?q=zzz');
    expect(
      await screen.findByText('Aucune notification ne correspond aux critères.', undefined, T)
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Effacer les critères' }).length).toBeGreaterThan(0);
  });
});
