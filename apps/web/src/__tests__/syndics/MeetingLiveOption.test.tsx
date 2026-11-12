import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MeetingLiveConsole } from '../../components/syndics/MeetingLiveConsole';

const api = {
  getLiveMeeting: vi.fn(),
  listMeetingParticipants: vi.fn(),
  getMeetingVisio: vi.fn(),
  getMeetingRecordings: vi.fn(),
  getMeetingDiscussion: vi.fn()
};
const getMenuEntitlements = vi.fn();

vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: (...a: unknown[]) => getMenuEntitlements(...a)
}));

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    getLiveMeeting: (...a: unknown[]) => api.getLiveMeeting(...a),
    listMeetingParticipants: (...a: unknown[]) => api.listMeetingParticipants(...a),
    getMeetingVisio: (...a: unknown[]) => api.getMeetingVisio(...a),
    getMeetingRecordings: (...a: unknown[]) => api.getMeetingRecordings(...a),
    getMeetingDiscussion: (...a: unknown[]) => api.getMeetingDiscussion(...a)
  };
});

const liveView = {
  meeting: {
    id: 'm1',
    type: 'ORDINARY',
    status: 'IN_PROGRESS',
    scheduledAt: '2026-10-20T09:00:00.000Z',
    startTime: null,
    endTime: null,
    location: null,
    videoConferenceUrl: null,
    syndicate: { id: 's1', name: 'Résidence Les Acacias' }
  },
  attendance: {
    totalLots: 3,
    totalShares: 300,
    presentLots: 1,
    presentShares: 100,
    representedOnlyLots: 0,
    representedOnlyShares: 0,
    representedLots: 1,
    representedShares: 100,
    onlineLots: 0,
    quorumPercent: 33.3
  },
  lots: [],
  resolutions: [],
  participants: { invited: 3, joined: 0, online: 0 },
  serverTime: '2026-10-20T10:02:00.000Z'
};

const TITLE = 'AG en direct et visio — option non souscrite';

function mount() {
  return render(
    <MemoryRouter>
      <App>
        <MeetingLiveConsole tenantId="t1" syndicId="s1" meetingId="m1" meetingStatus="IN_PROGRESS" />
      </App>
    </MemoryRouter>
  );
}

function ent(enforcement: 'off' | 'warn' | 'enforce', features: string[]) {
  getMenuEntitlements.mockResolvedValue({ moduleAccess: {}, readOnly: false, phase: 'ACTIVE', enforcement, features });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getLiveMeeting.mockResolvedValue(liveView);
  api.listMeetingParticipants.mockResolvedValue([]);
  api.getMeetingVisio.mockRejectedValue({ response: { status: 409 } });
  api.getMeetingRecordings.mockResolvedValue([]);
  api.getMeetingDiscussion.mockRejectedValue({ response: { status: 404 } });
});

describe('Console AG en direct — option payante', () => {
  it('sans l’option en mode enforce : état « option non souscrite », aucune route en direct appelée', async () => {
    ent('enforce', ['CORE', 'SYNDIC']);
    mount();
    expect(await screen.findByText(TITLE, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Demander l'option" })).toBeTruthy();
    expect(api.getLiveMeeting).not.toHaveBeenCalled();
    expect(api.listMeetingParticipants).not.toHaveBeenCalled();
    expect(api.getMeetingVisio).not.toHaveBeenCalled();
    expect(api.getMeetingRecordings).not.toHaveBeenCalled();
    expect(api.getMeetingDiscussion).not.toHaveBeenCalled();
  });

  it('avec l’option en mode enforce : console habituelle', async () => {
    ent('enforce', ['CORE', 'SYNDIC', 'SYNDIC_LIVE']);
    mount();
    await waitFor(() => expect(api.getLiveMeeting).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('en mode warn sans l’option : console habituelle', async () => {
    ent('warn', ['CORE', 'SYNDIC']);
    mount();
    await waitFor(() => expect(api.getLiveMeeting).toHaveBeenCalled());
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('un 403 OPTION_NOT_INCLUDED affiche l’état dédié, pas un accès refusé', async () => {
    ent('enforce', ['CORE', 'SYNDIC', 'SYNDIC_LIVE']);
    api.getLiveMeeting.mockRejectedValue({
      response: { status: 403, data: { code: 'OPTION_NOT_INCLUDED', data: { option: 'SYNDIC_LIVE' } } }
    });
    mount();
    expect(await screen.findByText(TITLE, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('Accès non autorisé')).toBeNull();
  });
});
