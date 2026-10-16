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
const fetchDiscussion = vi.fn();
const sendDiscussion = vi.fn();
const discussionOutput = vi.hoisted(() => ({ loaded: null as unknown, sent: null as unknown, error: null as unknown }));

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
    setPublicHandRaised: (...a: unknown[]) => raiseHand(...a),
    fetchPublicDiscussion: (...a: unknown[]) => fetchDiscussion(...a),
    sendPublicDiscussionMessage: (...a: unknown[]) => sendDiscussion(...a)
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
    discussion?: {
      load: () => Promise<unknown>;
      send: (body: string) => Promise<unknown>;
    };
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
        {props.discussion ? (
          <>
            <button
              type="button"
              onClick={() =>
                void props
                  .discussion!.load()
                  .then(value => (discussionOutput.loaded = value))
                  .catch(err => (discussionOutput.error = err))
              }
            >
              charger-discussion
            </button>
            <button
              type="button"
              onClick={() =>
                void props
                  .discussion!.send('Bonjour')
                  .then(value => (discussionOutput.sent = value))
                  .catch(err => (discussionOutput.error = err))
              }
            >
              envoyer-discussion
            </button>
          </>
        ) : null}
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

// Écran simulé : les requêtes `(min-width: N px)` / `(max-width: N px)` suivent la largeur courante,
// et un changement de largeur prévient les abonnés comme le ferait le navigateur.
const screenMock = {
  width: 500,
  listeners: new Set<{ query: string; listener: (event: { matches: boolean; media: string }) => void }>()
};

function queryMatches(query: string): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  return (!min || screenMock.width >= Number(min[1])) && (!max || screenMock.width <= Number(max[1]));
}

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const entry = (listener: (event: { matches: boolean; media: string }) => void) => ({ query, listener });
      const registered = new Map<unknown, { query: string; listener: (event: never) => void }>();
      const add = (listener: (event: { matches: boolean; media: string }) => void) => {
        const item = entry(listener);
        registered.set(listener, item as never);
        screenMock.listeners.add(item);
      };
      const remove = (listener: unknown) => {
        const item = registered.get(listener);
        if (item) screenMock.listeners.delete(item as never);
      };
      return {
        get matches() {
          return queryMatches(query);
        },
        media: query,
        onchange: null,
        addListener: add,
        removeListener: remove,
        addEventListener: (_type: string, listener: never) => add(listener),
        removeEventListener: (_type: string, listener: never) => remove(listener),
        dispatchEvent: () => false
      };
    }
  });
}

function setViewport(width: number) {
  screenMock.width = width;
  screenMock.listeners.forEach(({ query, listener }) => listener({ matches: queryMatches(query), media: query }));
}

function setWide(wide: boolean) {
  screenMock.width = wide ? 1200 : 500;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  room.mounts = 0;
  room.unmounts = 0;
  discussionOutput.loaded = null;
  discussionOutput.sent = null;
  discussionOutput.error = null;
  screenMock.listeners.clear();
  installMatchMedia();
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

  it('affiche l avis d enregistrement avant l entrée en visio puis pendant', async () => {
    fetchState.mockResolvedValue(ok(view({ visio: { enabled: true, recording: true } })));
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText('Cette assemblée est enregistrée.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    // Dans la salle, son propre bandeau prend le relais : l avis de la page ne fait pas doublon.
    expect(screen.queryAllByText('Cette assemblée est enregistrée.')).toHaveLength(0);
  });

  it('n affiche aucun avis quand la séance n est pas enregistrée', async () => {
    fetchState.mockResolvedValue(ok(view({ visio: { enabled: true, recording: false } })));
    render(<MeetingLivePage />);
    await flush();
    expect(screen.queryByText('Cette assemblée est enregistrée.')).toBeNull();
  });

  it('ne remonte jamais la salle quand la largeur franchit 992 px', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
    await flush();
    const roomNode = screen.getByTestId('visio-room');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(room.mounts).toBe(1);

    act(() => setViewport(1200));
    await flush();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByTestId('visio-room')).toBe(roomNode);

    act(() => setViewport(500));
    await flush();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByTestId('visio-room')).toBe(roomNode);
    expect(room.mounts).toBe(1);
    expect(room.unmounts).toBe(0);
  });

  describe('discussion écrite (spec 046)', () => {
    async function openRoom() {
      fetchState.mockResolvedValue(ok(view()));
      render(<MeetingLivePage />);
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Rejoindre la visio' }));
      await flush();
    }

    const message = {
      id: 'd1',
      authorKind: 'COOWNER',
      authorIdentity: 'p-c1',
      authorName: 'Awa Traoré',
      body: 'Bonjour',
      hidden: false,
      createdAt: '2026-10-20T10:00:00.000Z'
    };

    it('fournit à la salle un adaptateur qui lit l’historique avec le jeton du lien', async () => {
      fetchDiscussion.mockResolvedValue({
        status: 'ok',
        data: { open: true, muted: false, canWrite: true, maxLength: 500, messages: [message] }
      });
      await openRoom();
      fireEvent.click(screen.getByRole('button', { name: 'charger-discussion' }));
      await flush();
      expect(fetchDiscussion).toHaveBeenCalledWith(TOKEN);
      expect(discussionOutput.loaded).toEqual({ open: true, muted: false, maxLength: 500, messages: [message] });
    });

    it('envoie le message avec le jeton du lien et rend le message du serveur', async () => {
      sendDiscussion.mockResolvedValue({ status: 'ok', data: message });
      await openRoom();
      fireEvent.click(screen.getByRole('button', { name: 'envoyer-discussion' }));
      await flush();
      expect(sendDiscussion).toHaveBeenCalledWith(TOKEN, 'Bonjour');
      expect(discussionOutput.sent).toEqual(message);
    });

    it.each([
      [{ status: 'rate_limited' }, 'Vous écrivez trop vite, patientez un instant.'],
      [
        { status: 'conflict', message: 'La discussion est fermée par le gestionnaire' },
        'La discussion est fermée par le gestionnaire'
      ],
      [{ status: 'rejected', message: 'Message trop long' }, 'Message trop long'],
      [{ status: 'unavailable' }, 'Message non envoyé, réessayez.'],
      [{ status: 'invalid' }, "Accès à la discussion impossible. Votre lien n'est peut-être plus valide."]
    ])('traduit l’échec %j en un message affichable', async (result, expected) => {
      sendDiscussion.mockResolvedValue(result);
      await openRoom();
      fireEvent.click(screen.getByRole('button', { name: 'envoyer-discussion' }));
      await flush();
      expect((discussionOutput.error as Error).message).toBe(expected);
    });

    it('ne fournit pas d’adaptateur tant que la salle n’est pas affichée', async () => {
      fetchState.mockResolvedValue(ok(view()));
      render(<MeetingLivePage />);
      await flush();
      expect(screen.queryByRole('button', { name: 'charger-discussion' })).toBeNull();
      expect(fetchDiscussion).not.toHaveBeenCalled();
    });
  });
});
