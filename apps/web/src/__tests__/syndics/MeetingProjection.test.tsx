import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SyndicMeetingProjection } from '../../pages/syndics/SyndicMeetingProjection';
import type { LiveMeetingAdminView } from '../../types/syndic-live-types';

const getLiveMeeting = vi.fn();

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return { ...actual, getLiveMeeting: (...a: unknown[]) => getLiveMeeting(...a) };
});

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 't1' } }) }));

const tally = {
  rule: 'ARTICLE_24' as const,
  votesFor: 2,
  votesAgainst: 1,
  votesAbstain: 0,
  sharesFor: 200,
  sharesAgainst: 100,
  sharesAbstain: 0,
  totalShares: 400,
  totalLots: 4,
  referenceShares: 400,
  ownersFor: 2,
  totalOwners: 4,
  result: 'APPROVED' as const
};

function live(status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' = 'IN_PROGRESS'): LiveMeetingAdminView {
  return {
    meeting: {
      id: 'm1',
      type: 'ORDINARY',
      status,
      scheduledAt: '2026-10-20T09:00:00.000Z',
      startTime: null,
      endTime: null,
      location: null,
      videoConferenceUrl: null,
      syndicate: { id: 's1', name: 'Résidence Les Acacias' }
    },
    attendance: {
      totalLots: 4,
      totalShares: 400,
      presentLots: 2,
      presentShares: 200,
      representedOnlyLots: 1,
      representedOnlyShares: 100,
      representedLots: 3,
      representedShares: 300,
      onlineLots: 1,
      quorumPercent: 75
    },
    lots: [],
    resolutions: [
      {
        id: 'r1',
        title: 'Approbation des comptes',
        description: null,
        majorityRule: 'ARTICLE_24',
        voteStatus: 'CLOSED',
        voteOpenedAt: null,
        voteClosedAt: null,
        ballotCount: 3,
        tally,
        votes: []
      },
      {
        id: 'r2',
        title: 'Budget prévisionnel',
        description: null,
        majorityRule: 'ARTICLE_24',
        voteStatus: 'OPEN',
        voteOpenedAt: null,
        voteClosedAt: null,
        ballotCount: 2,
        tally: { ...tally, result: null },
        votes: []
      }
    ],
    participants: { invited: 4, joined: 3, online: 2 },
    serverTime: '2026-10-20T10:00:00.000Z'
  };
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/tenant/t1/syndics/s1/assemblees/m1/projection']}>
      <Routes>
        <Route
          path="/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId/projection"
          element={<SyndicMeetingProjection />}
        />
      </Routes>
    </MemoryRouter>
  );
}

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyndicMeetingProjection', () => {
  it('affiche quorum, résolution ouverte avec participation et résultat des votes clos', async () => {
    getLiveMeeting.mockResolvedValue(live());
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getLiveMeeting).toHaveBeenCalledWith('t1', 's1', 'm1');
    expect(screen.getByText('Résidence Les Acacias')).toBeTruthy();
    expect(screen.getByText('75 %')).toBeTruthy();
    expect(screen.getByText('300 / 400 tantièmes représentés · 3 / 4 lots')).toBeTruthy();
    expect(screen.getByText('Budget prévisionnel')).toBeTruthy();
    expect(screen.getByText('Participation : 2 lot(s) sur 4')).toBeTruthy();
    expect(screen.getByText('Approbation des comptes')).toBeTruthy();
    expect(screen.getByText('Approuvée')).toBeTruthy();
  });

  it('ne dévoile ni tantièmes ni sens des votes pendant un vote ouvert', async () => {
    const view = live();
    view.resolutions[1] = {
      ...view.resolutions[1],
      tally: { ...tally, result: null, sharesFor: 150, sharesAgainst: 0, sharesAbstain: 0 }
    };
    getLiveMeeting.mockResolvedValue(view);
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Participation : 2 lot(s) sur 4')).toBeTruthy();
    // Seul le vote clos montre le détail Pour / Contre / Abstention (une seule ligne : la résolution 1).
    expect(screen.queryByText(/Pour 150/)).toBeNull();
    expect(screen.getAllByText(/Pour [0-9]+ · Contre [0-9]+ · Abstention [0-9]+/)).toHaveLength(1);
    expect(screen.getByText('Pour 200 · Contre 100 · Abstention 0')).toBeTruthy();
  });

  it('interroge toutes les 3 s et s’arrête à la clôture de l’AG', async () => {
    getLiveMeeting.mockResolvedValue(live());
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick();
    expect(getLiveMeeting).toHaveBeenCalledTimes(2);

    getLiveMeeting.mockResolvedValue(live('COMPLETED'));
    await tick();
    expect(screen.getByText('Assemblée terminée')).toBeTruthy();
    const calls = getLiveMeeting.mock.calls.length;
    await tick();
    await tick();
    expect(getLiveMeeting).toHaveBeenCalledTimes(calls);
  });

  it('garde l’écran lors d’un échec de lecture', async () => {
    getLiveMeeting.mockResolvedValueOnce(live());
    getLiveMeeting.mockRejectedValue(new Error('réseau'));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await tick();
    expect(screen.getByText('Résidence Les Acacias')).toBeTruthy();
    expect(screen.getByText('Connexion instable')).toBeTruthy();
  });
});
