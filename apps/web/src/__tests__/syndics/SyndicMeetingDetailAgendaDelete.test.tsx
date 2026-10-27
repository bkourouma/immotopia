import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyndicMeetingDetail } from '../../pages/syndics/SyndicMeetingDetail';

const api = { getMeeting: vi.fn(), deleteMeetingAgendaItem: vi.fn() };

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    getMeeting: (...a: unknown[]) => api.getMeeting(...a),
    deleteMeetingAgendaItem: (...a: unknown[]) => api.deleteMeetingAgendaItem(...a)
  };
});

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: 'm1', lotId: undefined })
}));

// Blocs voisins, couverts par leurs propres tests.
vi.mock('../../components/syndics/MeetingLiveConsole', () => ({
  MANUAL_VOTE_ANCHOR_ID: 'meeting-vote-entry',
  MeetingLiveConsole: () => null,
  default: () => null
}));
vi.mock('../../components/syndics/MeetingProxies', () => ({ MeetingProxies: () => null }));
vi.mock('../../components/syndics/VoteBoard', () => ({ VoteBoard: () => null }));
vi.mock('../../components/syndics/MeetingAgenda', () => ({ MeetingAgenda: () => null }));
vi.mock('../../components/syndics/MeetingStatusActions', () => ({ MeetingStatusActions: () => null }));
vi.mock('../../components/syndics/MeetingConvocationWord', () => ({ MeetingConvocationWord: () => null }));

const meeting = {
  id: 'm1',
  syndicateId: 's1',
  type: 'ORDINARY',
  scheduledAt: '2026-10-20T09:00:00.000Z',
  status: 'PLANNED',
  quorum: 0,
  createdAt: '',
  updatedAt: '',
  resolutions: [],
  agendaItems: [
    {
      id: 'a1',
      meetingId: 'm1',
      orderIndex: 1,
      title: 'Approbation des comptes',
      discussions: [],
      createdAt: '',
      updatedAt: ''
    }
  ],
  syndicate: { lots: [] }
};

function mount() {
  render(
    <MemoryRouter>
      <App>
        <SyndicMeetingDetail />
      </App>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMeeting.mockResolvedValue(meeting);
  api.deleteMeetingAgendaItem.mockResolvedValue(undefined);
});

describe('SyndicMeetingDetail - suppression d un point d ordre du jour', () => {
  it('demande une confirmation et n appelle l API qu apres accord', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer/ }));
    expect(await screen.findByText("Supprimer ce point de l'ordre du jour ?")).toBeTruthy();
    expect(api.deleteMeetingAgendaItem).not.toHaveBeenCalled();

    const confirm = (await screen.findAllByRole('button', { name: /Supprimer/ })).pop() as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteMeetingAgendaItem).toHaveBeenCalledWith('t1', 's1', 'm1', 'a1'));
  });

  it('n appelle pas l API quand la confirmation est annulee', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(api.deleteMeetingAgendaItem).not.toHaveBeenCalled();
  });
});
