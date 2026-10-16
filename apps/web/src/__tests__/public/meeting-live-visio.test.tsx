import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MeetingLivePage } from '../../pages/public/MeetingLivePage';
import type { LiveMeetingPublicView } from '../../types/syndic-live-types';

const fetchState = vi.fn();
const join = vi.fn();
const vote = vi.fn();
const fetchVisioToken = vi.fn();
const raiseHand = vi.fn();

vi.mock('../../services/public-meeting-live-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/public-meeting-live-service')>(
    '../../services/public-meeting-live-service'
  );
  return {
    ...actual,
    fetchPublicMeetingState: (...a: unknown[]) => fetchState(...a),
    joinPublicMeeting: (...a: unknown[]) => join(...a),
    votePublicMeeting: (...a: unknown[]) => vote(...a),
    fetchPublicVisioToken: (...a: unknown[]) => fetchVisioToken(...a),
    setPublicHandRaised: (...a: unknown[]) => raiseHand(...a)
  };
});

// La salle (LiveKit) est chargée à la demande : un témoin la remplace et expose ses rappels.
const room = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock('../../components/syndics/visio/MeetingVisioRoom', () => ({
  default: (props: {
    role: string;
    getToken: () => Promise<unknown>;
    onRaiseHand?: (raised: boolean) => Promise<void>;
    onRefreshSignal?: () => void;
  }) => {
    React.useEffect(() => {
      room.mounts += 1;
      void props.getToken().catch(() => undefined);
      return () => {
        room.unmounts += 1;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="visio-room" data-role={props.role}>
        <button type="button" onClick={() => props.onRefreshSignal?.()}>
          signal-serveur
        </button>
        <button type="button" onClick={() => void props.onRaiseHand?.(true)}>
          lever-la-main
        </button>
      </div>
    );
  }
}));

const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789';
const POLL = 3000;
const JOIN_INFO = {
  serverUrl: 'wss://lk.example.com',
  token: 'jwt',
  identity: 'p-c1',
  roomName: 't1__ag_m1',
  expiresAt: '2026-10-20T10:10:00.000Z'
};

function view(overrides: Partial<LiveMeetingPublicView> = {}): LiveMeetingPublicView {
  return {
    meeting: {
      id: 'm1',
      type: 'ORDINARY',
      status: 'IN_PROGRESS',
      scheduledAt: '2026-10-20T09:00:00.000Z',
      startTime: null,
      endTime: null,
      location: 'Salle des fêtes',
      videoConferenceUrl: 'https://meet.example.com/ag',
      syndicateName: 'Résidence Les Acacias',
      agenda: [{ orderIndex: 1, title: 'Comptes 2025' }]
    },
    me: { contactId: 'c1', name: 'Awa Traoré', joined: true, joinedAt: '2026-10-20T09:05:00.000Z' },
    myLots: [
      {
        lotId: 'l1',
        lotNumber: 'A1',
        generalShares: 100,
        role: 'OWNER',
        grantorName: null,
        attendanceStatus: 'PRESENT'
      }
    ],
    attendance: { quorumPercent: 42, representedShares: 420, totalShares: 1000, representedLots: 4, totalLots: 10 },
    resolutions: [
      {
        id: 'r1',
        title: 'Approbation des comptes',
        description: null,
        majorityRule: 'ARTICLE_24',
        voteStatus: 'OPEN',
        voteOpenedAt: '2026-10-20T10:00:00.000Z',
        voteClosedAt: null,
        ballotCount: 3,
        totalLots: 10,
        myVotes: [],
        result: null
      }
    ],
    canVote: true,
    visio: { enabled: true },
    serverTime: '2026-10-20T10:00:00.000Z',
    ...overrides
  };
}

const ok = (v: LiveMeetingPublicView) => ({ status: 'ok' as const, view: v });

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL);
  });
}

function setWide(wide: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: wide,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  });
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  room.mounts = 0;
  room.unmounts = 0;
  setWide(false);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  window.sessionStorage.clear();
  window.history.replaceState(null, '', `/ag-direct#${TOKEN}`);
  fetchVisioToken.mockResolvedValue({ status: 'ok', data: JOIN_INFO });
  raiseHand.mockResolvedValue({ status: 'ok', data: { raised: true } });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: originalMatchMedia });
  window.history.replaceState(null, '', '/');
});

describe('MeetingLivePage : visio intégrée', () => {
  it('propose « Rejoindre la visio » quand la visio est activée, l’AG en cours et l’AG rejointe', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText("Visio de l'assemblée")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rejoindre la visio' })).toBeTruthy();
    // Le lien externe reste affiché en secours.
    expect(screen.getByRole('link', { name: 'Rejoindre la visioconférence' })).toBeTruthy();
    // Connexion sur clic seulement (V15) : rien n'est monté ni demandé avant.
    expect(screen.queryByTestId('visio-room')).toBeNull();
    expect(fetchVisioToken).not.toHaveBeenCalled();
  });

  it.each([
    ['sans le champ visio', { visio: undefined }],
    ['visio désactivée', { visio: { enabled: false } }],
    ['AG non rejointe', { me: { contactId: 'c1', name: 'Awa Traoré', joined: false, joinedAt: null } }]
  ])('ne propose pas la visio : %s', async (_label, overrides) => {
    fetchState.mockResolvedValue(ok(view(overrides as Partial<LiveMeetingPublicView>)));
    render(<MeetingLivePage />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Rejoindre la visio' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Rejoindre la visioconférence' })).toBeTruthy();
  });

  it('ne propose pas la visio avant l’ouverture de la séance', async () => {
    const planned = view();
    planned.meeting.status = 'PLANNED';
    fetchState.mockResolvedValue(ok(planned));
    render(<MeetingLivePage />);
    await flush();
    expect(screen.queryByRole('button', { name: 'Rejoindre la visio' })).toBeNull();
  });

  it('monte la salle au clic et lui fournit le jeton de la page', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    expect(screen.getByTestId('visio-room').getAttribute('data-role')).toBe('participant');
    expect(fetchVisioToken).toHaveBeenCalledWith(TOKEN);
    expect(screen.queryByRole('button', { name: 'Rejoindre la visio' })).toBeNull();
  });

  it('relit l’état dès que le serveur signale un vote', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    const before = fetchState.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'signal-serveur' }));
    await flush();
    expect(fetchState.mock.calls.length).toBe(before + 1);
  });

  it('lève la main avec le jeton de la page', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'lever-la-main' }));
    await flush();
    expect(raiseHand).toHaveBeenCalledWith(TOKEN, true);
  });

  it('sur mobile : onglets Visio et Votes, pastille sur Votes, vidéo toujours connectée', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();

    expect(screen.getByRole('tab', { name: 'Visio' })).toBeTruthy();
    const votesTab = screen.getByRole('tab', { name: 'Votes' });
    // Un vote est ouvert et mon lot n'a pas voté : pastille.
    expect(votesTab.querySelector('.ant-badge-dot')).not.toBeNull();

    fireEvent.click(votesTab);
    await flush();
    expect(screen.getByText('Approbation des comptes')).toBeTruthy();
    // La salle n'a été ni démontée ni remontée.
    expect(screen.getByTestId('visio-room')).toBeTruthy();
    expect(room.mounts).toBe(1);
    expect(room.unmounts).toBe(0);
  });

  it('sur mobile : pas de pastille quand mon lot a déjà voté', async () => {
    const voted = view();
    voted.resolutions[0].myVotes = [{ lotId: 'l1', vote: 'FOR', source: 'CO_OWNER' }];
    fetchState.mockResolvedValue(ok(voted));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    expect(screen.getByRole('tab', { name: 'Votes' }).querySelector('.ant-badge-dot')).toBeNull();
  });

  it('sur grand écran : vidéo et panneau de l’AG côte à côte, sans onglets', async () => {
    setWide(true);
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByTestId('visio-room')).toBeTruthy();
    expect(screen.getByText('Approbation des comptes')).toBeTruthy();
    expect(screen.getByText('Quorum')).toBeTruthy();
  });

  it('démonte la salle quand l’AG se termine', async () => {
    fetchState.mockResolvedValueOnce(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    expect(screen.getByTestId('visio-room')).toBeTruthy();

    const done = view({ serverTime: '2026-10-20T11:00:00.000Z' });
    done.meeting.status = 'COMPLETED';
    fetchState.mockResolvedValue(ok(done));
    await tick();
    expect(screen.queryByTestId('visio-room')).toBeNull();
    expect(room.unmounts).toBe(1);
    expect(screen.getByText('Assemblée terminée')).toBeTruthy();
  });
});
