import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MeetingLivePage, MEETING_TOKEN_STORAGE_KEY } from '../../pages/public/MeetingLivePage';
import type { LiveMeetingPublicView } from '../../types/syndic-live-types';

const fetchState = vi.fn();
const join = vi.fn();
const vote = vi.fn();

vi.mock('../../services/public-meeting-live-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/public-meeting-live-service')>(
    '../../services/public-meeting-live-service'
  );
  return {
    ...actual,
    fetchPublicMeetingState: (...a: unknown[]) => fetchState(...a),
    joinPublicMeeting: (...a: unknown[]) => join(...a),
    votePublicMeeting: (...a: unknown[]) => vote(...a)
  };
});

const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789';
const POLL = 5000;

type ResolutionOverride = Partial<LiveMeetingPublicView['resolutions'][number]>;

function resolution(overrides: ResolutionOverride = {}): LiveMeetingPublicView['resolutions'][number] {
  return {
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
    result: null,
    ...overrides
  };
}

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
      videoConferenceUrl: null,
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
    resolutions: [resolution()],
    canVote: true,
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

let hidden = false;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  window.sessionStorage.clear();
  window.history.replaceState(null, '', `/ag-direct#${TOKEN}`);
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('MeetingLivePage', () => {
  it('lit le jeton du fragment, le retire de la barre et le poste dans le corps', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();

    expect(fetchState).toHaveBeenCalledWith(TOKEN);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.sessionStorage.getItem(MEETING_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(screen.getByText('Résidence Les Acacias')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });

  it('reprend le jeton mémorisé après un rechargement (sans fragment)', async () => {
    window.history.replaceState(null, '', '/ag-direct');
    window.sessionStorage.setItem(MEETING_TOKEN_STORAGE_KEY, TOKEN);
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    expect(fetchState).toHaveBeenCalledWith(TOKEN);
  });

  it('affiche le message neutre sans jeton, sans appeler le serveur', async () => {
    window.history.replaceState(null, '', '/ag-direct');
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText('Lien invalide ou expiré')).toBeTruthy();
    expect(fetchState).not.toHaveBeenCalled();
  });

  it('arrête l’interrogation et efface le jeton quand le lien est invalide', async () => {
    fetchState.mockResolvedValue({ status: 'invalid' });
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText('Lien invalide ou expiré')).toBeTruthy();
    expect(window.sessionStorage.getItem(MEETING_TOKEN_STORAGE_KEY)).toBeNull();
    const calls = fetchState.mock.calls.length;
    await tick();
    await tick();
    expect(fetchState).toHaveBeenCalledTimes(calls);
  });

  it('interroge toutes les 3 s puis s’arrête quand l’AG est clôturée', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    expect(fetchState).toHaveBeenCalledTimes(1);
    await tick();
    expect(fetchState).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(MEETING_TOKEN_STORAGE_KEY)).toBe(TOKEN);

    fetchState.mockResolvedValue(
      ok(
        view({
          meeting: { ...view().meeting, status: 'COMPLETED' },
          canVote: false,
          serverTime: '2026-10-20T11:00:00.000Z'
        })
      )
    );
    await tick();
    expect(screen.getByText('Assemblée terminée')).toBeTruthy();
    // Le jeton n'a plus d'usage une fois l'AG terminée : il quitte le sessionStorage.
    expect(window.sessionStorage.getItem(MEETING_TOKEN_STORAGE_KEY)).toBeNull();
    const calls = fetchState.mock.calls.length;
    await tick();
    await tick();
    expect(fetchState).toHaveBeenCalledTimes(calls);
  });

  it('se met en pause quand l’onglet est masqué et reprend au retour', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    hidden = true;
    await tick();
    await tick();
    expect(fetchState).toHaveBeenCalledTimes(1);

    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchState).toHaveBeenCalledTimes(2);
  });

  it('garde l’écran affiché lors d’un échec réseau temporaire', async () => {
    fetchState.mockResolvedValueOnce(ok(view()));
    fetchState.mockResolvedValue({ status: 'unavailable' });
    render(<MeetingLivePage />);
    await flush();
    await tick();
    expect(screen.getByText('Résidence Les Acacias')).toBeTruthy();
    expect(screen.getByText(/Connexion instable/)).toBeTruthy();
    expect(screen.queryByText('Lien invalide ou expiré')).toBeNull();
  });

  it('rejoint l’assemblée avec le jeton puis affiche l’état rendu par le serveur', async () => {
    fetchState.mockResolvedValue(
      ok(view({ me: { contactId: 'c1', name: 'Awa Traoré', joined: false, joinedAt: null }, canVote: false }))
    );
    join.mockResolvedValue(ok(view({ serverTime: '2026-10-20T10:00:05.000Z' })));
    render(<MeetingLivePage />);
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Rejoindre l'assemblée" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(join).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/Vous avez rejoint l'assemblée/)).toBeTruthy();
  });

  it('vote Pour pour tous mes lots et confirme', async () => {
    fetchState.mockResolvedValue(ok(view()));
    vote.mockResolvedValue(
      ok(
        view({
          resolutions: [resolution({ myVotes: [{ lotId: 'l1', vote: 'FOR', source: 'CO_OWNER' }], ballotCount: 4 })],
          serverTime: '2026-10-20T10:00:05.000Z'
        })
      )
    );
    render(<MeetingLivePage />);
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vote).toHaveBeenCalledWith(TOKEN, 'r1', [{ lotId: 'l1', vote: 'FOR' }]);
    expect(screen.getByText('Vote enregistré : Pour')).toBeTruthy();
    expect(screen.getByText('Lot A1 : Pour')).toBeTruthy();
  });

  it('affiche la raison donnée par le serveur quand le vote est refusé (409)', async () => {
    fetchState.mockResolvedValue(ok(view()));
    vote.mockResolvedValue({
      status: 'conflict',
      message: 'Le vote de ce lot a été enregistré par le syndic : adressez-vous à lui pour le modifier.'
    });
    render(<MeetingLivePage />);
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      screen.getByText('Le vote de ce lot a été enregistré par le syndic : adressez-vous à lui pour le modifier.')
    ).toBeTruthy();
    expect(screen.queryByText('Vote enregistré : Pour')).toBeNull();
  });

  it('vote lot par lot quand plusieurs lots sont représentés', async () => {
    fetchState.mockResolvedValue(
      ok(
        view({
          myLots: [
            {
              lotId: 'l1',
              lotNumber: 'A1',
              generalShares: 100,
              role: 'OWNER',
              grantorName: null,
              attendanceStatus: 'PRESENT'
            },
            {
              lotId: 'l2',
              lotNumber: 'B2',
              generalShares: 50,
              role: 'PROXY',
              grantorName: 'Ibrahim Koné',
              attendanceStatus: 'REPRESENTED'
            }
          ]
        })
      )
    );
    vote.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();

    expect(screen.getByText('Représente Ibrahim Koné')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lot B2 : Contre' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vote).toHaveBeenCalledWith(TOKEN, 'r1', [{ lotId: 'l2', vote: 'AGAINST' }]);
  });

  it('n’affiche aucun résultat tant que le vote est ouvert, seulement la participation', async () => {
    fetchState.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText('3 lot(s) sur 10 ont voté')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Résultat du vote' })).toBeNull();
  });

  it('affiche le résultat quand le vote est clos', async () => {
    fetchState.mockResolvedValue(
      ok(
        view({
          resolutions: [
            resolution({
              voteStatus: 'CLOSED',
              result: {
                result: 'APPROVED',
                sharesFor: 600,
                sharesAgainst: 200,
                sharesAbstain: 50,
                totalShares: 1000,
                votesFor: 6,
                votesAgainst: 2,
                votesAbstain: 1
              }
            })
          ]
        })
      )
    );
    render(<MeetingLivePage />);
    await flush();
    const group = screen.getByRole('group', { name: 'Résultat du vote' });
    expect(group.textContent).toContain('Approuvée');
    expect(group.textContent).toContain('Pour 600');
    expect(screen.queryByRole('button', { name: 'Contre' })).toBeNull();
  });

  it('propose le bouton visio seulement pour une URL https, en lien externe sûr', async () => {
    fetchState.mockResolvedValue(
      ok(view({ meeting: { ...view().meeting, videoConferenceUrl: 'https://meet.example.com/abc' } }))
    );
    const { unmount } = render(<MeetingLivePage />);
    await flush();
    const link = screen.getByRole('link', { name: /Rejoindre la visioconférence/ });
    expect(link.getAttribute('href')).toBe('https://meet.example.com/abc');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    unmount();

    fetchState.mockResolvedValue(
      ok(view({ meeting: { ...view().meeting, videoConferenceUrl: 'javascript:alert(1)' } }))
    );
    window.history.replaceState(null, '', '/ag-direct');
    render(<MeetingLivePage />);
    await flush();
    expect(screen.queryByRole('link', { name: /visioconférence/ })).toBeNull();
  });

  it('affiche l’écran d’attente quand l’AG est planifiée', async () => {
    fetchState.mockResolvedValue(
      ok(view({ meeting: { ...view().meeting, status: 'PLANNED' }, canVote: false, resolutions: [] }))
    );
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText("L'assemblée n'a pas encore commencé")).toBeTruthy();
    expect(screen.getByText('Comptes 2025')).toBeTruthy();
  });

  it('liste les résolutions avant l’ouverture de la séance, sans bouton de vote', async () => {
    fetchState.mockResolvedValue(
      ok(
        view({
          meeting: { ...view().meeting, status: 'PLANNED' },
          canVote: false,
          resolutions: [
            resolution({ voteStatus: 'PENDING', voteOpenedAt: null, description: 'Quitus au syndic', ballotCount: 0 }),
            resolution({ id: 'r2', title: 'Travaux de toiture', voteStatus: 'PENDING', majorityRule: 'ARTICLE_25' })
          ]
        })
      )
    );
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText('Approbation des comptes')).toBeTruthy();
    expect(screen.getByText('Quitus au syndic')).toBeTruthy();
    expect(screen.getByText('Travaux de toiture')).toBeTruthy();
    expect(screen.getAllByText('Vote pas encore ouvert')).toHaveLength(2);
    expect(screen.getByText(/Article 25/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pour' })).toBeNull();
  });

  it('masque la visioconférence quand l’AG est terminée', async () => {
    fetchState.mockResolvedValue(
      ok(
        view({
          meeting: { ...view().meeting, status: 'COMPLETED', videoConferenceUrl: 'https://meet.example.com/abc' },
          canVote: false
        })
      )
    );
    render(<MeetingLivePage />);
    await flush();
    expect(screen.queryByRole('link', { name: /Rejoindre la visioconférence/ })).toBeNull();
  });

  it('retire la confirmation périmée quand le syndic écrase le vote, et verrouille le lot', async () => {
    fetchState.mockResolvedValue(ok(view()));
    vote.mockResolvedValue(
      ok(
        view({
          resolutions: [resolution({ myVotes: [{ lotId: 'l1', vote: 'FOR', source: 'CO_OWNER' }] })],
          serverTime: '2026-10-20T10:00:05.000Z'
        })
      )
    );
    render(<MeetingLivePage />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Vote enregistré : Pour')).toBeTruthy();

    fetchState.mockResolvedValue(
      ok(
        view({
          resolutions: [resolution({ myVotes: [{ lotId: 'l1', vote: 'AGAINST', source: 'MANAGER' }] })],
          serverTime: '2026-10-20T10:00:10.000Z'
        })
      )
    );
    await tick();
    expect(screen.queryByText('Vote enregistré : Pour')).toBeNull();
    expect(screen.getByText('Lot A1 : Contre — Saisi par le gestionnaire')).toBeTruthy();
    expect(screen.getByText(/a été saisi par le syndic/)).toBeTruthy();
    expect(screen.queryByText('Vous pouvez modifier votre vote tant que le vote est ouvert.')).toBeNull();
    for (const name of ['Pour', 'Contre', 'Abstention']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('désactive le lot saisi par le syndic en vote lot par lot, l’autre lot reste votable', async () => {
    const lots = [
      {
        lotId: 'l1',
        lotNumber: 'A1',
        generalShares: 100,
        role: 'OWNER' as const,
        grantorName: null,
        attendanceStatus: 'PRESENT' as const
      },
      {
        lotId: 'l2',
        lotNumber: 'B2',
        generalShares: 50,
        role: 'OWNER' as const,
        grantorName: null,
        attendanceStatus: 'PRESENT' as const
      }
    ];
    fetchState.mockResolvedValue(
      ok(
        view({
          myLots: lots,
          resolutions: [resolution({ myVotes: [{ lotId: 'l1', vote: 'AGAINST', source: 'MANAGER' }] })]
        })
      )
    );
    vote.mockResolvedValue(ok(view()));
    render(<MeetingLivePage />);
    await flush();
    expect((screen.getByRole('button', { name: 'Lot A1 : Pour' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Lot B2 : Pour' }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Pour' })[0]);
      await vi.advanceTimersByTimeAsync(0);
    });
    // « Pour tous mes lots » n'envoie que le lot encore votable.
    expect(vote).toHaveBeenCalledWith(TOKEN, 'r1', [{ lotId: 'l2', vote: 'FOR' }]);
  });

  it('n’empile pas « Vous avez rejoint » avec une erreur d’action', async () => {
    fetchState.mockResolvedValue(ok(view()));
    vote.mockResolvedValue({ status: 'conflict', message: 'Le vote est clos.' });
    render(<MeetingLivePage />);
    await flush();
    expect(screen.getByText(/Vous avez rejoint l'assemblée/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pour' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Le vote est clos.')).toBeTruthy();
    expect(screen.queryByText(/Vous avez rejoint l'assemblée/)).toBeNull();
  });
});
