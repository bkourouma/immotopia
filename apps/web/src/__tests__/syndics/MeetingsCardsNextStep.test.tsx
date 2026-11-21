/**
 * Liste des AG en cartes (mobile), erreur avec « Réessayer », et confirmation explicite
 * de l'ouverture / annulation / clôture d'une séance.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';
import { MeetingStatusActions } from '../../components/syndics/MeetingStatusActions';
import type { GeneralMeeting } from '../../types/syndic-types';

const api = { listMeetings: vi.fn() };

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    listMeetingsPage: async (...a: unknown[]) => {
      const items = await api.listMeetings(...a);
      return { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } };
    }
  };
});
vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: undefined, lotId: undefined })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xs', isMobile: true, isTablet: false, isDesktop: false })
}));
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const meeting = {
  id: 'm1',
  type: 'ORDINARY',
  status: 'PLANNED',
  scheduledAt: '2026-10-15T09:30:00.000Z',
  location: 'Salle commune',
  quorum: 0
} as unknown as GeneralMeeting;

function mount() {
  render(
    <MemoryRouter>
      <App>
        <SyndicMeetings />
      </App>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyndicMeetings - mobile', () => {
  it('affiche chaque assemblée en carte avec lieu et actions', async () => {
    api.listMeetings.mockResolvedValue([meeting]);
    mount();
    expect(await screen.findByText('Salle commune')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voir détails' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir la séance' })).toBeTruthy();
  });

  it('propose « Réessayer » quand le chargement échoue', async () => {
    api.listMeetings.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([meeting]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText('Salle commune')).toBeTruthy();
  });
});

describe('MeetingStatusActions - confirmations', () => {
  it("l'ouverture de séance demande une confirmation qui explique la conséquence", async () => {
    const onChange = vi.fn();
    render(
      <App>
        <MeetingStatusActions status="PLANNED" onChange={onChange} />
      </App>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la séance' }));
    expect(await screen.findByText('Ouvrir la séance ?')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    const confirm = screen.getAllByRole('button', { name: 'Ouvrir la séance' }).pop() as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('IN_PROGRESS'));
  });

  it('la clôture annonce que les votes sont figés et que l’action est définitive', async () => {
    render(
      <App>
        <MeetingStatusActions status="IN_PROGRESS" onChange={vi.fn()} />
      </App>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la séance' }));
    expect(await screen.findByText(/Cette action est définitive/)).toBeTruthy();
  });
});
