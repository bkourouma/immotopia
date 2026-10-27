import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MeetingLiveConsole } from '../../components/syndics/MeetingLiveConsole';
import type {
  LiveMeetingAdminView,
  MeetingParticipantView,
  MeetingRecordingView,
  ManagerDiscussionMessageView,
  ManagerDiscussionView,
  MeetingVisioAdminView
} from '../../types/syndic-live-types';
import type { MeetingStatus } from '../../types/syndic-types';

const api = {
  getLiveMeeting: vi.fn(),
  listMeetingParticipants: vi.fn(),
  setLotAttendance: vi.fn(),
  setBulkAttendance: vi.fn(),
  openResolutionVote: vi.fn(),
  closeResolutionVote: vi.fn(),
  issueParticipantLink: vi.fn(),
  revokeParticipantLinks: vi.fn(),
  updateMeeting: vi.fn(),
  getMeetingVisio: vi.fn(),
  issueMeetingVisioToken: vi.fn(),
  setVisioParticipantSpeaking: vi.fn(),
  muteVisioParticipant: vi.fn(),
  setVisioMediaLock: vi.fn(),
  removeVisioParticipant: vi.fn(),
  getMeetingRecordings: vi.fn(),
  startMeetingRecording: vi.fn(),
  stopMeetingRecording: vi.fn(),
  deleteMeetingRecording: vi.fn(),
  retryMeetingRecording: vi.fn(),
  downloadMeetingRecordingFile: vi.fn(),
  getMeetingDiscussion: vi.fn(),
  postMeetingDiscussionMessage: vi.fn(),
  setMeetingDiscussionMessageHidden: vi.fn(),
  setMeetingDiscussionOpen: vi.fn(),
  setVisioParticipantWriting: vi.fn()
};

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    getLiveMeeting: (...a: unknown[]) => api.getLiveMeeting(...a),
    listMeetingParticipants: (...a: unknown[]) => api.listMeetingParticipants(...a),
    setLotAttendance: (...a: unknown[]) => api.setLotAttendance(...a),
    setBulkAttendance: (...a: unknown[]) => api.setBulkAttendance(...a),
    openResolutionVote: (...a: unknown[]) => api.openResolutionVote(...a),
    closeResolutionVote: (...a: unknown[]) => api.closeResolutionVote(...a),
    issueParticipantLink: (...a: unknown[]) => api.issueParticipantLink(...a),
    revokeParticipantLinks: (...a: unknown[]) => api.revokeParticipantLinks(...a),
    updateMeeting: (...a: unknown[]) => api.updateMeeting(...a),
    getMeetingVisio: (...a: unknown[]) => api.getMeetingVisio(...a),
    issueMeetingVisioToken: (...a: unknown[]) => api.issueMeetingVisioToken(...a),
    setVisioParticipantSpeaking: (...a: unknown[]) => api.setVisioParticipantSpeaking(...a),
    muteVisioParticipant: (...a: unknown[]) => api.muteVisioParticipant(...a),
    setVisioMediaLock: (...a: unknown[]) => api.setVisioMediaLock(...a),
    removeVisioParticipant: (...a: unknown[]) => api.removeVisioParticipant(...a),
    getMeetingRecordings: (...a: unknown[]) => api.getMeetingRecordings(...a),
    startMeetingRecording: (...a: unknown[]) => api.startMeetingRecording(...a),
    stopMeetingRecording: (...a: unknown[]) => api.stopMeetingRecording(...a),
    deleteMeetingRecording: (...a: unknown[]) => api.deleteMeetingRecording(...a),
    retryMeetingRecording: (...a: unknown[]) => api.retryMeetingRecording(...a),
    downloadMeetingRecordingFile: (...a: unknown[]) => api.downloadMeetingRecordingFile(...a),
    getMeetingDiscussion: (...a: unknown[]) => api.getMeetingDiscussion(...a),
    postMeetingDiscussionMessage: (...a: unknown[]) => api.postMeetingDiscussionMessage(...a),
    setMeetingDiscussionMessageHidden: (...a: unknown[]) => api.setMeetingDiscussionMessageHidden(...a),
    setMeetingDiscussionOpen: (...a: unknown[]) => api.setMeetingDiscussionOpen(...a),
    setVisioParticipantWriting: (...a: unknown[]) => api.setVisioParticipantWriting(...a)
  };
});

// La salle (LiveKit) est chargée à la demande : on la remplace par un témoin qui demande son jeton.
vi.mock('../../components/syndics/visio/MeetingVisioRoom', () => {
  const VisioRoomStub = ({
    role,
    getToken,
    discussion
  }: {
    role: string;
    getToken: () => Promise<unknown>;
    discussion?: unknown;
  }) => {
    React.useEffect(() => {
      void getToken().catch(() => undefined);
    }, [getToken]);
    return <div data-testid="visio-room" data-role={role} data-discussion={discussion ? 'oui' : 'non'} />;
  };
  return { default: VisioRoomStub };
});

const tally = {
  rule: 'ARTICLE_24' as const,
  votesFor: 1,
  votesAgainst: 0,
  votesAbstain: 0,
  sharesFor: 100,
  sharesAgainst: 0,
  sharesAbstain: 0,
  totalShares: 300,
  totalLots: 3,
  referenceShares: 300,
  ownersFor: 1,
  totalOwners: 3,
  result: null
};

function live(
  overrides: Partial<LiveMeetingAdminView> = {},
  status: MeetingStatus = 'IN_PROGRESS'
): LiveMeetingAdminView {
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
      totalLots: 3,
      totalShares: 300,
      presentLots: 1,
      presentShares: 100,
      representedOnlyLots: 1,
      representedOnlyShares: 100,
      representedLots: 2,
      representedShares: 200,
      onlineLots: 1,
      quorumPercent: 66.67
    },
    lots: [
      {
        lotId: 'l1',
        lotNumber: 'A1',
        generalShares: 100,
        voters: [{ contactId: 'c1', name: 'Awa Traoré' }],
        attendance: {
          status: 'PRESENT',
          mode: 'ONLINE',
          recordedBy: 'SELF',
          attendeeContactId: 'c1',
          attendeeName: 'Awa Traoré',
          representedByContactId: null,
          representedByName: null,
          updatedAt: '2026-10-20T09:05:00.000Z'
        },
        online: true
      },
      {
        lotId: 'l2',
        lotNumber: 'B2',
        generalShares: 100,
        voters: [{ contactId: 'c2', name: 'Ibrahim Koné' }],
        attendance: null,
        online: false
      },
      {
        lotId: 'l3',
        lotNumber: 'C3',
        generalShares: 100,
        voters: [{ contactId: 'c3', name: 'Mariam Diallo' }],
        attendance: null,
        online: false
      }
    ],
    resolutions: [
      {
        id: 'r1',
        title: 'Approbation des comptes',
        description: null,
        majorityRule: 'ARTICLE_24',
        voteStatus: 'PENDING',
        voteOpenedAt: null,
        voteClosedAt: null,
        ballotCount: 0,
        tally: { ...tally, sharesFor: 0, votesFor: 0 },
        votes: []
      },
      {
        id: 'r2',
        title: 'Budget prévisionnel',
        description: null,
        majorityRule: 'ARTICLE_24',
        voteStatus: 'OPEN',
        voteOpenedAt: '2026-10-20T10:00:00.000Z',
        voteClosedAt: null,
        ballotCount: 1,
        tally,
        votes: [
          { lotId: 'l1', vote: 'FOR', source: 'CO_OWNER', castByContactId: 'c1', updatedAt: '2026-10-20T10:01:00.000Z' }
        ]
      }
    ],
    participants: { invited: 3, joined: 1, online: 1 },
    serverTime: '2026-10-20T10:02:00.000Z',
    ...overrides
  };
}

const participants: MeetingParticipantView[] = [
  {
    contactId: 'c1',
    name: 'Awa Traoré',
    email: 'awa@example.com',
    phone: null,
    lotNumbers: ['A1'],
    joinedAt: '2026-10-20T09:05:00.000Z',
    lastSeenAt: '2026-10-20T10:01:50.000Z',
    online: true,
    activeLinks: 1
  },
  {
    contactId: 'c2',
    name: 'Ibrahim Koné',
    email: null,
    phone: null,
    lotNumbers: ['B2'],
    joinedAt: null,
    lastSeenAt: null,
    online: false,
    activeLinks: 0
  }
];

function mount(
  status: MeetingStatus = 'IN_PROGRESS',
  props: Partial<React.ComponentProps<typeof MeetingLiveConsole>> = {}
) {
  return render(
    <App>
      <MeetingLiveConsole tenantId="t1" syndicId="s1" meetingId="m1" meetingStatus={status} {...props} />
    </App>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getLiveMeeting.mockResolvedValue(live());
  api.listMeetingParticipants.mockResolvedValue(participants);
  // Visio non configurée par défaut : l'API répond 409 et la console reste inchangée.
  api.getMeetingVisio.mockRejectedValue({ response: { status: 409 } });
  // Discussion absente par défaut (API plus ancienne ou droit manquant) : la console reste inchangée.
  api.getMeetingDiscussion.mockRejectedValue({ response: { status: 404 } });
});

describe('MeetingLiveConsole', () => {
  it('affiche quorum, compteurs, lots et participants', async () => {
    mount();
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    expect(document.querySelector('.ant-statistic-content-value')?.textContent).toBe('66.67');
    expect(screen.getByText('200 / 300 tantièmes représentés')).toBeTruthy();
    expect(screen.getAllByText('A1').length).toBeGreaterThan(0);
    expect(screen.getByText('1 / 3 ont rejoint · 1 en ligne')).toBeTruthy();
    expect(screen.getAllByText('Awa Traoré').length).toBeGreaterThan(0);
    expect(api.getLiveMeeting).toHaveBeenCalledWith('t1', 's1', 'm1');
  });

  it('émarge en masse les lots sélectionnés', async () => {
    api.setBulkAttendance.mockResolvedValue(live());
    mount();
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    const row = screen.getByRole('combobox', { name: 'Émargement du lot B2' }).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Marquer présents en salle' }));
    await waitFor(() =>
      expect(api.setBulkAttendance).toHaveBeenCalledWith('t1', 's1', 'm1', {
        lotIds: ['l2'],
        status: 'PRESENT',
        mode: 'IN_PERSON'
      })
    );
  });

  it('émarge un lot : présent en salle', async () => {
    api.setLotAttendance.mockResolvedValue(live());
    mount();
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    const select = screen.getByRole('combobox', { name: 'Émargement du lot B2' });
    fireEvent.mouseDown(select);
    const option = await screen.findByTitle('Présent en salle');
    fireEvent.click(option);
    await waitFor(() =>
      expect(api.setLotAttendance).toHaveBeenCalledWith('t1', 's1', 'm1', 'l2', {
        status: 'PRESENT',
        mode: 'IN_PERSON'
      })
    );
  });

  it('ouvre le vote d’une résolution en attente', async () => {
    api.openResolutionVote.mockResolvedValue(live());
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le vote' }));
    await waitFor(() => expect(api.openResolutionVote).toHaveBeenCalledWith('t1', 's1', 'm1', 'r1'));
  });

  it('clôt le vote après confirmation', async () => {
    api.closeResolutionVote.mockResolvedValue(live());
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Clore le vote' }));
    const confirm = (await screen.findAllByRole('button', { name: 'Clore le vote' })).pop() as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(api.closeResolutionVote).toHaveBeenCalledWith('t1', 's1', 'm1', 'r2'));
  });

  it('copie le lien : délivre le lien puis écrit dans le presse-papiers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    api.issueParticipantLink.mockResolvedValue({
      url: 'https://app.example.com/ag-direct#tok',
      expiresAt: '2026-10-27T00:00:00.000Z'
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Copier le lien de Awa Traoré' }));
    await waitFor(() => expect(api.issueParticipantLink).toHaveBeenCalledWith('t1', 's1', 'm1', 'c1'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.example.com/ag-direct#tok'));
    expect(screen.queryByLabelText('Lien personnel')).toBeNull();
  });

  it('affiche le lien à copier à la main quand le presse-papiers est refusé', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });
    api.issueParticipantLink.mockResolvedValue({
      url: 'https://app.example.com/ag-direct#tok2',
      expiresAt: '2026-10-27T00:00:00.000Z'
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Copier le lien de Ibrahim Koné' }));
    const field = (await screen.findByLabelText('Lien personnel')) as HTMLInputElement;
    expect(field.value).toBe('https://app.example.com/ag-direct#tok2');
  });

  it('révoque les liens après confirmation', async () => {
    api.revokeParticipantLinks.mockResolvedValue({ revoked: 1 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Révoquer les liens de Awa Traoré' }));
    const ok = (await screen.findAllByRole('button', { name: 'Révoquer' })).pop() as HTMLElement;
    fireEvent.click(ok);
    await waitFor(() => expect(api.revokeParticipantLinks).toHaveBeenCalledWith('t1', 's1', 'm1', 'c1'));
  });

  it('refuse une URL de visio en http et enregistre une URL https', async () => {
    api.updateMeeting.mockResolvedValue({});
    const onMeetingChanged = vi.fn();
    mount('PLANNED', { onMeetingChanged });
    const input = (await screen.findByLabelText('Lien de visioconférence')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'http://meet.example.com' } });
    expect(screen.getByText('Le lien doit commencer par https://')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'https://meet.example.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(api.updateMeeting).toHaveBeenCalledWith('t1', 's1', 'm1', {
        videoConferenceUrl: 'https://meet.example.com/x'
      })
    );
    await waitFor(() => expect(onMeetingChanged).toHaveBeenCalled());
  });

  it('propose la projection en lien externe', async () => {
    mount();
    const link = await screen.findByRole('link', { name: 'Projeter' });
    expect(link.getAttribute('href')).toBe('/tenant/t1/syndics/s1/assemblees/m1/projection');
  });

  it('est en lecture seule quand l’AG est clôturée', async () => {
    api.getLiveMeeting.mockResolvedValue(live({}, 'COMPLETED'));
    mount('COMPLETED');
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    expect(screen.queryByRole('button', { name: 'Marquer absents' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ouvrir le vote' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clore le vote' })).toBeNull();
  });

  it('garde les données affichées si une lecture échoue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount();
      await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
      api.getLiveMeeting.mockRejectedValue(new Error('réseau'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(screen.getByRole('combobox', { name: 'Émargement du lot B2' })).toBeTruthy();
      expect(screen.getByText('Impossible de charger la séance en direct')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('interroge aussi pendant la préparation (AG planifiée) et s’arrête à la clôture', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.getLiveMeeting.mockResolvedValue(live({}, 'PLANNED'));
      const view = mount('PLANNED');
      await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
      expect(api.getLiveMeeting).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(api.getLiveMeeting).toHaveBeenCalledTimes(2);

      api.getLiveMeeting.mockResolvedValue(live({}, 'COMPLETED'));
      view.rerender(
        <App>
          <MeetingLiveConsole tenantId="t1" syndicId="s1" meetingId="m1" meetingStatus="COMPLETED" />
        </App>
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      const calls = api.getLiveMeeting.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000);
      });
      expect(api.getLiveMeeting).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('signale un changement de la vue en direct, sans bruit quand rien ne change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onLiveChanged = vi.fn();
      mount('IN_PROGRESS', { onLiveChanged });
      await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
      expect(onLiveChanged).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(onLiveChanged).not.toHaveBeenCalled();

      const changed = live();
      changed.resolutions[1] = { ...changed.resolutions[1], ballotCount: 2 };
      api.getLiveMeeting.mockResolvedValue(changed);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(onLiveChanged).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(onLiveChanged).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('affiche l’origine des votes d’une résolution', async () => {
    const view = live();
    view.resolutions[1] = {
      ...view.resolutions[1],
      ballotCount: 3,
      votes: [
        { lotId: 'l1', vote: 'FOR', source: 'CO_OWNER', castByContactId: 'c1', updatedAt: '2026-10-20T10:01:00.000Z' },
        {
          lotId: 'l2',
          vote: 'FOR',
          source: 'PROXY_HOLDER',
          castByContactId: 'c1',
          updatedAt: '2026-10-20T10:01:00.000Z'
        },
        {
          lotId: 'l3',
          vote: 'AGAINST',
          source: 'MANAGER',
          castByContactId: null,
          updatedAt: '2026-10-20T10:01:00.000Z'
        }
      ]
    };
    api.getLiveMeeting.mockResolvedValue(view);
    mount();
    expect(
      await screen.findByText('Origine des votes : 1 en ligne · 1 mandataire · 1 saisi(s) par le gestionnaire')
    ).toBeTruthy();
  });

  it('affiche le lien dans une fenêtre quand le presse-papiers ne répond pas', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn(() => new Promise<void>(() => undefined)) }
      });
      api.issueParticipantLink.mockResolvedValue({
        url: 'https://app.example.com/ag-direct#tok3',
        expiresAt: '2026-10-27T00:00:00.000Z'
      });
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Copier le lien de Awa Traoré' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      const field = (await screen.findByLabelText('Lien personnel')) as HTMLInputElement;
      expect(field.value).toBe('https://app.example.com/ag-direct#tok3');
      expect(field.readOnly).toBe(true);
      expect(screen.getByRole('button', { name: 'Copier' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirme « Lien copié » quand la copie réussit', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
    api.issueParticipantLink.mockResolvedValue({
      url: 'https://app.example.com/ag-direct#tok4',
      expiresAt: '2026-10-27T00:00:00.000Z'
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Copier le lien de Awa Traoré' }));
    expect(await screen.findByText('Lien copié')).toBeTruthy();
  });
});

const visioView = (overrides: Partial<MeetingVisioAdminView> = {}): MeetingVisioAdminView => ({
  enabled: true,
  roomName: 't1__ag_m1',
  roomActive: true,
  participants: [
    {
      identity: 'gestionnaire-u1',
      kind: 'MANAGER',
      participantId: null,
      contactId: null,
      name: 'Syndic Dupont',
      handRaisedAt: null,
      canSpeak: true,
      joinedAt: '2026-10-20T09:50:00.000Z'
    },
    {
      identity: 'p-c2',
      kind: 'COOWNER',
      participantId: 'p2',
      contactId: 'c2',
      name: 'Ibrahim Koné',
      handRaisedAt: null,
      canSpeak: false,
      joinedAt: '2026-10-20T10:00:00.000Z'
    },
    {
      identity: 'p-c1',
      kind: 'COOWNER',
      participantId: 'p1',
      contactId: 'c1',
      name: 'Awa Traoré',
      handRaisedAt: '2026-10-20T10:05:00.000Z',
      canSpeak: false,
      joinedAt: '2026-10-20T10:01:00.000Z'
    }
  ],
  ...overrides
});

describe('MeetingLiveConsole : visio intégrée', () => {
  it('ne montre aucune carte de visio quand elle n est pas configurée', async () => {
    mount();
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    expect(api.getMeetingVisio).toHaveBeenCalledWith('t1', 's1', 'm1');
    expect(screen.queryByText('Visio intégrée')).toBeNull();
    expect(screen.queryByText('En visio')).toBeNull();
  });

  it('affiche la carte, les mains levées en tête et la marque En visio', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    mount();
    expect(await screen.findByText('Visio intégrée')).toBeTruthy();
    const card = screen.getByText('Visio intégrée').closest('.ant-card') as HTMLElement;
    const rows = Array.from(card.querySelectorAll('tbody tr.ant-table-row')).map(row => row.textContent ?? '');
    expect(rows[0]).toContain('Awa Traoré');
    expect(rows[0]).toContain('Main levée');
    expect(rows[1]).toContain('Ibrahim Koné');
    // Une marque par copropriétaire présent dans la salle, dans la liste des participants.
    await waitFor(() => expect(screen.getAllByText('En visio').length).toBe(2));
  });

  it('ouvre la salle en modérateur', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.issueMeetingVisioToken.mockResolvedValue({
      serverUrl: 'wss://lk.example.com',
      token: 'jwt',
      identity: 'gestionnaire-u1',
      roomName: 't1__ag_m1',
      expiresAt: '2026-10-20T10:10:00.000Z'
    });
    mount('PLANNED');
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la visio' }));
    const room = await screen.findByTestId('visio-room');
    expect(room.getAttribute('data-role')).toBe('moderator');
    await waitFor(() => expect(api.issueMeetingVisioToken).toHaveBeenCalledWith('t1', 's1', 'm1'));
  });

  it('autorise micro et caméra à un copropriétaire interdit', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.setVisioParticipantSpeaking.mockResolvedValue(visioView());
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Autoriser micro et caméra à Awa Traoré' }));
    await waitFor(() => expect(api.setVisioParticipantSpeaking).toHaveBeenCalledWith('t1', 's1', 'm1', 'p1', true));
    expect(await screen.findByText('Micro et caméra autorisés pour Awa Traoré')).toBeTruthy();
  });

  it('interdit micro et caméra à un copropriétaire autorisé', async () => {
    const speaking = visioView();
    speaking.participants[1] = {
      ...speaking.participants[1],
      canSpeak: true,
      mediaAllowed: true,
      mediaPolicy: 'DEFAULT'
    };
    api.getMeetingVisio.mockResolvedValue(speaking);
    api.setVisioParticipantSpeaking.mockResolvedValue(visioView());
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Interdire micro et caméra à Ibrahim Koné' }));
    await waitFor(() => expect(api.setVisioParticipantSpeaking).toHaveBeenCalledWith('t1', 's1', 'm1', 'p2', false));
    expect(await screen.findByText('Micro et caméra interdits à Ibrahim Koné')).toBeTruthy();
  });

  it('montre l état du micro et de la caméra : actif, coupé, interdit', async () => {
    const view = visioView();
    view.participants[1] = {
      ...view.participants[1],
      canSpeak: true,
      mediaAllowed: true,
      mic: { published: true, muted: false },
      camera: { published: true, muted: true }
    };
    view.participants[2] = {
      ...view.participants[2],
      canSpeak: false,
      mediaAllowed: false,
      mediaPolicy: 'BLOCKED',
      mic: { published: false, muted: false },
      camera: { published: false, muted: false }
    };
    api.getMeetingVisio.mockResolvedValue(view);
    mount();
    expect(await screen.findByText('Micro actif')).toBeTruthy();
    expect(screen.getByText('Caméra coupé')).toBeTruthy();
    expect(screen.getByText('Micro interdit')).toBeTruthy();
    expect(screen.getByText('Caméra interdit')).toBeTruthy();
  });

  it('coupe le micro puis la caméra d un participant qui diffuse, avec un retour', async () => {
    const view = visioView();
    view.participants[1] = {
      ...view.participants[1],
      canSpeak: true,
      mediaAllowed: true,
      mic: { published: true, muted: false },
      camera: { published: true, muted: false }
    };
    api.getMeetingVisio.mockResolvedValue(view);
    api.muteVisioParticipant.mockResolvedValue({ ...view, mutedTracks: 1 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Couper le micro de Ibrahim Koné' }));
    await waitFor(() => expect(api.muteVisioParticipant).toHaveBeenCalledWith('t1', 's1', 'm1', 'p2', ['MICROPHONE']));
    expect(await screen.findByText('Micro de Ibrahim Koné coupé')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Couper la caméra de Ibrahim Koné' }));
    await waitFor(() => expect(api.muteVisioParticipant).toHaveBeenCalledWith('t1', 's1', 'm1', 'p2', ['CAMERA']));
  });

  it('désactive « Couper » quand rien n est publié et signale l échec d une coupure', async () => {
    const view = visioView();
    view.participants[1] = {
      ...view.participants[1],
      mediaAllowed: true,
      mic: { published: true, muted: false },
      camera: { published: false, muted: false }
    };
    api.getMeetingVisio.mockResolvedValue(view);
    api.muteVisioParticipant.mockRejectedValue({
      response: { data: { error: 'Ce participant n’est pas dans la salle.' } }
    });
    mount();
    const cam = (await screen.findByRole('button', { name: 'Couper la caméra de Ibrahim Koné' })) as HTMLButtonElement;
    expect(cam.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Couper le micro de Ibrahim Koné' }));
    expect(await screen.findByText('Ce participant n’est pas dans la salle.')).toBeTruthy();
  });

  it('interdit les micros à tous après confirmation puis les rend', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.setVisioMediaLock.mockImplementationOnce(async () => {
      api.getMeetingVisio.mockResolvedValue(visioView({ mediaLocked: true }));
      return visioView({ mediaLocked: true });
    });
    mount();
    fireEvent.click(await screen.findByRole('switch', { name: 'Interdire les micros à tous' }));
    expect(api.setVisioMediaLock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Interdire' }));
    await waitFor(() => expect(api.setVisioMediaLock).toHaveBeenCalledWith('t1', 's1', 'm1', true));
    expect(await screen.findByText('Micros et caméras interdits à tous')).toBeTruthy();
    expect(await screen.findByText('Micros interdits à tous')).toBeTruthy();

    api.setVisioMediaLock.mockImplementationOnce(async () => {
      api.getMeetingVisio.mockResolvedValue(visioView({ mediaLocked: false }));
      return visioView({ mediaLocked: false });
    });
    fireEvent.click(await screen.findByRole('switch', { name: 'Rendre les micros' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rendre les micros' }));
    await waitFor(() => expect(api.setVisioMediaLock).toHaveBeenLastCalledWith('t1', 's1', 'm1', false));
    expect(await screen.findByText('Micros et caméras rendus à tous')).toBeTruthy();
  });

  it('exclut après confirmation avec révocation des liens et annonce le nombre de liens révoqués', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.removeVisioParticipant.mockResolvedValue({ ...visioView(), revokedLinks: 2 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Exclure Ibrahim Koné' }));
    fireEvent.click(await screen.findByLabelText('Révoquer aussi ses liens personnels'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exclure' }));
    await waitFor(() => expect(api.removeVisioParticipant).toHaveBeenCalledWith('t1', 's1', 'm1', 'p2', true));
    expect(await screen.findByText('Ibrahim Koné a été exclu — 2 lien(s) révoqué(s)')).toBeTruthy();
  });

  it('exclut sans révoquer les liens par défaut', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.removeVisioParticipant.mockResolvedValue({ ...visioView(), revokedLinks: 0 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Exclure Awa Traoré' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Exclure' }));
    await waitFor(() => expect(api.removeVisioParticipant).toHaveBeenCalledWith('t1', 's1', 'm1', 'p1', false));
  });
});

const recording = (overrides: Partial<MeetingRecordingView> = {}): MeetingRecordingView => ({
  id: 'rec1',
  status: 'AVAILABLE',
  startedAt: '2026-10-20T10:00:00.000Z',
  stoppedAt: '2026-10-20T11:00:00.000Z',
  endedAt: '2026-10-20T11:00:05.000Z',
  durationSeconds: 3725,
  fileSize: 52428800,
  failureReason: null,
  startedByName: 'Syndic Dupont',
  ...overrides
});

const withRecording = (active: MeetingRecordingView | null, enabled = true) =>
  visioView({ recording: { enabled, active } });

describe('MeetingLiveConsole : enregistrement', () => {
  beforeEach(() => {
    api.getMeetingRecordings.mockResolvedValue([]);
  });

  it('ne montre rien quand l enregistrement n est pas configuré', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null, false));
    mount();
    await screen.findByText('Visio intégrée');
    expect(screen.queryByRole('button', { name: 'Enregistrer la séance' })).toBeNull();
    expect(screen.queryByText('Enregistrements')).toBeNull();
  });

  it('démarre l enregistrement quand l AG est en cours', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.startMeetingRecording.mockResolvedValue(recording({ status: 'RECORDING' }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer la séance' }));
    await waitFor(() => expect(api.startMeetingRecording).toHaveBeenCalledWith('t1', 's1', 'm1'));
  });

  it('ne permet pas de démarrer avant l ouverture de la séance', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    mount('PLANNED');
    const button = await screen.findByRole('button', { name: 'Enregistrer la séance' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('montre le voyant et arrête l enregistrement en cours', async () => {
    const active = recording({
      status: 'RECORDING',
      stoppedAt: null,
      endedAt: null,
      durationSeconds: null,
      fileSize: null
    });
    api.getMeetingVisio.mockResolvedValue(withRecording(active));
    api.getMeetingRecordings.mockResolvedValue([active]);
    api.stopMeetingRecording.mockResolvedValue({ ...active, status: 'PROCESSING' });
    mount();
    expect(await screen.findByText('Enregistrement en cours')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer la séance' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Arrêter l'enregistrement" }));
    await waitFor(() => expect(api.stopMeetingRecording).toHaveBeenCalledWith('t1', 's1', 'm1'));
  });

  it('liste les enregistrements avec statut, durée et taille lisibles', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([
      recording(),
      recording({
        id: 'rec2',
        status: 'FAILED',
        failureReason: 'Stockage indisponible',
        durationSeconds: null,
        fileSize: null
      }),
      recording({ id: 'rec3', status: 'PROCESSING', durationSeconds: null, fileSize: null }),
      recording({ id: 'rec4', status: 'DELETED' })
    ]);
    mount();
    expect(await screen.findByText('Stockage indisponible')).toBeTruthy();
    const card = screen.getByText('Enregistrements').closest('.ant-card') as HTMLElement;
    const rows = Array.from(card.querySelectorAll('tbody tr.ant-table-row')).map(row => row.textContent ?? '');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain('Disponible');
    expect(rows[0]).toContain('1 h 02 min 05 s');
    expect(rows[0]).toContain('50 Mo');
    expect(rows[1]).toContain('Échec');
    expect(rows[2]).toContain('En traitement');
    expect(rows[3]).toContain('Supprimé');
  });

  it('lit l enregistrement dans une modale avec l URL authentifiée du flux', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([recording()]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Lire' }));
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toMatch(
      /\/tenants\/t1\/syndics\/s1\/assemblees\/m1\/enregistrements\/rec1\/fichier$/
    );
  });

  it('télécharge le MP4 par l API et annonce le nom du fichier', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([recording()]);
    api.downloadMeetingRecordingFile.mockResolvedValue({ blob: new Blob(['x']), filename: 'AG-2026-10-20.mp4' });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Télécharger l'enregistrement/ }));
    await waitFor(() =>
      expect(api.downloadMeetingRecordingFile).toHaveBeenCalledWith('t1', 's1', 'm1', 'rec1', 'AG-2026-10-20.mp4')
    );
    expect(await screen.findByText('Enregistrement téléchargé : AG-2026-10-20.mp4')).toBeTruthy();
  });

  it('annonce l échec du téléchargement', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([recording()]);
    api.downloadMeetingRecordingFile.mockRejectedValue({ response: { status: 404 } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Télécharger l'enregistrement/ }));
    expect(await screen.findByText('Document introuvable.')).toBeTruthy();
  });

  it('garde les cartes et l arrêt manuel quand la lecture de /visio échoue (503)', async () => {
    const active = recording({ status: 'RECORDING', stoppedAt: null, endedAt: null });
    api.getMeetingVisio.mockRejectedValue({ response: { status: 503 } });
    api.getMeetingRecordings.mockResolvedValue([active]);
    api.stopMeetingRecording.mockResolvedValue({ ...active, status: 'PROCESSING' });
    mount();
    expect(await screen.findByText('Visio intégrée : état indisponible pour le moment')).toBeTruthy();
    expect(screen.getByText('Enregistrements')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: "Arrêter l'enregistrement en cours" }));
    await waitFor(() => expect(api.stopMeetingRecording).toHaveBeenCalledWith('t1', 's1', 'm1'));
  });

  it('conserve la carte de visio quand une relecture échoue après un premier succès', async () => {
    api.getMeetingVisio.mockResolvedValueOnce(withRecording(null)).mockRejectedValue({ response: { status: 409 } });
    api.getMeetingRecordings.mockResolvedValue([]);
    mount();
    expect(await screen.findByText('Visio intégrée')).toBeTruthy();
    // La relecture suivante (5 s) échoue : la carte reste, avec l'alerte et « Réessayer ».
    expect(
      await screen.findByText('Visio intégrée : état indisponible pour le moment', {}, { timeout: 20000 })
    ).toBeTruthy();
    expect(screen.getByText('Visio intégrée')).toBeTruthy();
  }, 60000);

  it('n affiche plus « Enregistrement en cours » une fois l AG terminée, même avec un état périmé', async () => {
    const stale = recording({ status: 'RECORDING', stoppedAt: null, endedAt: null });
    api.getMeetingVisio.mockResolvedValue(withRecording(stale));
    api.getMeetingRecordings.mockResolvedValue([stale]);
    mount('COMPLETED');
    await screen.findByText('Visio intégrée');
    expect(screen.queryByText('Enregistrement en cours')).toBeNull();
    expect(screen.queryByRole('button', { name: "Arrêter l'enregistrement" })).toBeNull();
  });

  it('supprime après confirmation', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([recording()]);
    api.deleteMeetingRecording.mockResolvedValue(recording({ status: 'DELETED' }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer l'enregistrement du/ }));
    expect(api.deleteMeetingRecording).not.toHaveBeenCalled();
    const confirm = (await screen.findAllByRole('button', { name: 'Supprimer' })).pop() as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteMeetingRecording).toHaveBeenCalledWith('t1', 's1', 'm1', 'rec1'));
  });
});

describe('MeetingLiveConsole : correctifs de l enregistrement et de l exclusion', () => {
  beforeEach(() => {
    api.getMeetingRecordings.mockResolvedValue([]);
  });

  it('alerte durablement quand le dernier enregistrement a échoué et qu aucun n est actif', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([
      recording({ status: 'FAILED', failureReason: 'Egress interrompu', durationSeconds: null, fileSize: null })
    ]);
    mount();
    expect(await screen.findByText("L'enregistrement a échoué : cette séance n'est pas enregistrée.")).toBeTruthy();
    expect(screen.getAllByText('Egress interrompu').length).toBeGreaterThan(0);
  });

  it('n alerte pas quand un enregistrement est actif malgré un ancien échec', async () => {
    const active = recording({ id: 'rec9', status: 'RECORDING', stoppedAt: null, endedAt: null });
    api.getMeetingVisio.mockResolvedValue(withRecording(active));
    api.getMeetingRecordings.mockResolvedValue([
      active,
      recording({ id: 'old', status: 'FAILED', failureReason: 'x' })
    ]);
    mount();
    await screen.findByText('Enregistrement en cours');
    expect(screen.queryByText("L'enregistrement a échoué : cette séance n'est pas enregistrée.")).toBeNull();
  });

  it('relance le traitement d un enregistrement en échec', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([
      recording({ status: 'FAILED', failureReason: 'Rapatriement impossible' })
    ]);
    api.retryMeetingRecording.mockResolvedValue(recording({ status: 'PROCESSING' }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Réessayer le traitement de l'enregistrement/ }));
    await waitFor(() => expect(api.retryMeetingRecording).toHaveBeenCalledWith('t1', 's1', 'm1', 'rec1'));
  });

  it('précise que supprimer un enregistrement en échec efface aussi la copie du stockage de la visio', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    api.getMeetingRecordings.mockResolvedValue([recording({ status: 'FAILED', failureReason: 'x' })]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer l'enregistrement du/ }));
    expect(await screen.findByText(/ainsi que la copie conservée sur le stockage de la visio/)).toBeTruthy();
  });

  it('affiche « Arrêt en cours… » désactivé quand l arrêt est déjà demandé', async () => {
    const stopping = recording({ status: 'RECORDING', endedAt: null });
    api.getMeetingVisio.mockResolvedValue(withRecording(stopping));
    api.getMeetingRecordings.mockResolvedValue([stopping]);
    mount();
    const button = await screen.findByRole('button', { name: 'Arrêt en cours…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: "Arrêter l'enregistrement" })).toBeNull();
  });

  it('signale un traitement trop long et cesse d interroger', async () => {
    api.getMeetingVisio.mockResolvedValue(withRecording(null));
    const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    api.getMeetingRecordings.mockResolvedValue([
      recording({ status: 'PROCESSING', stoppedAt: old, endedAt: old, durationSeconds: null, fileSize: null })
    ]);
    mount();
    expect(await screen.findByText('Le traitement prend plus de temps que prévu')).toBeTruthy();
  });

  it('relit la liste quand l enregistrement actif change (autre session)', async () => {
    const started = recording({ id: 'recZ', status: 'RECORDING', stoppedAt: null, endedAt: null });
    api.getMeetingVisio.mockResolvedValueOnce(withRecording(null)).mockResolvedValue(withRecording(started));
    mount();
    await screen.findByText('Enregistrements');
    const before = api.getMeetingRecordings.mock.calls.length;
    await waitFor(() => expect(api.getMeetingRecordings.mock.calls.length).toBeGreaterThan(before), {
      timeout: 10000
    });
  }, 30000);

  it('garde la modale d exclusion ouverte avec l erreur quand l exclusion échoue', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.removeVisioParticipant.mockRejectedValue({ response: { data: { error: 'Participant absent de la salle' } } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Exclure Ibrahim Koné' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Exclure' }));
    expect(await screen.findByText('Participant absent de la salle')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

const chatMessage = (overrides: Partial<ManagerDiscussionMessageView> = {}): ManagerDiscussionMessageView => ({
  id: 'd1',
  authorKind: 'COOWNER',
  authorIdentity: 'p-c1',
  authorName: 'Awa Traoré',
  body: 'Bonjour à tous',
  hidden: false,
  createdAt: '2026-10-20T10:02:00.000Z',
  participantId: 'p1',
  hiddenAt: null,
  hiddenByName: null,
  ...overrides
});

const discussionView = (overrides: Partial<ManagerDiscussionView> = {}): ManagerDiscussionView => ({
  enabled: true,
  open: true,
  maxLength: 500,
  mutedParticipantIds: [],
  messages: [chatMessage()],
  ...overrides
});

describe('MeetingLiveConsole : discussion de la visio', () => {
  it('ne montre aucune carte quand la discussion est indisponible', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    mount();
    await screen.findByText('Visio intégrée');
    expect(screen.queryByText('Discussion ouverte aux copropriétaires')).toBeNull();
  });

  it("ne montre rien quand la visio n'est pas configurée et qu'aucun message n'existe", async () => {
    api.getMeetingDiscussion.mockResolvedValue(discussionView({ enabled: false, messages: [] }));
    mount();
    await waitFor(() => expect(api.getMeetingDiscussion).toHaveBeenCalledWith('t1', 's1', 'm1'));
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    expect(screen.queryByText('Discussion ouverte aux copropriétaires')).toBeNull();
  });

  it('liste les messages, masqués compris avec leur texte et la marque « masqué »', async () => {
    api.getMeetingDiscussion.mockResolvedValue(
      discussionView({
        messages: [
          chatMessage(),
          chatMessage({
            id: 'd2',
            authorName: 'Ibrahim Koné',
            body: 'texte caché',
            hidden: true,
            hiddenAt: '2026-10-20T10:03:00.000Z'
          })
        ]
      })
    );
    mount();
    expect(await screen.findByText('Bonjour à tous')).toBeTruthy();
    expect(screen.getByText('texte caché')).toBeTruthy();
    expect(screen.getByText('masqué')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rétablir le message de Ibrahim Koné' })).toBeTruthy();
  });

  it("affiche le HTML d'un message comme du texte", async () => {
    api.getMeetingDiscussion.mockResolvedValue(
      discussionView({ messages: [chatMessage({ body: '<img src=x onerror=alert(1)> https://exemple.test' })] })
    );
    mount();
    const text = await screen.findByText('<img src=x onerror=alert(1)> https://exemple.test');
    const log = text.closest('[role="log"]') as HTMLElement;
    expect(log.querySelector('img')).toBeNull();
    expect(log.querySelector('a')).toBeNull();
  });

  it('masque un message, puis le rétablit', async () => {
    // L'API garde l'état : la relecture périodique ne doit pas défaire l'action.
    let hidden = false;
    api.getMeetingDiscussion.mockImplementation(async () =>
      discussionView({ messages: [chatMessage({ hidden, hiddenAt: hidden ? '2026-10-20T10:03:00.000Z' : null })] })
    );
    api.setMeetingDiscussionMessageHidden.mockImplementation(async (_t, _s, _m, _id, value: boolean) => {
      hidden = value;
      return chatMessage({ hidden, hiddenAt: hidden ? '2026-10-20T10:03:00.000Z' : null });
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Masquer le message de Awa Traoré' }));
    await waitFor(() =>
      expect(api.setMeetingDiscussionMessageHidden).toHaveBeenCalledWith('t1', 's1', 'm1', 'd1', true)
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Rétablir le message de Awa Traoré' }));
    await waitFor(() =>
      expect(api.setMeetingDiscussionMessageHidden).toHaveBeenCalledWith('t1', 's1', 'm1', 'd1', false)
    );
    expect(await screen.findByRole('button', { name: 'Masquer le message de Awa Traoré' })).toBeTruthy();
  });

  it("ferme puis rouvre la discussion avec l'interrupteur", async () => {
    // L'API garde l'état : la relecture périodique ne doit pas défaire l'action.
    let open = true;
    api.getMeetingDiscussion.mockImplementation(async () => discussionView({ open }));
    api.setMeetingDiscussionOpen.mockImplementation(async (_t, _s, _m, value: boolean) => {
      open = value;
      return { open };
    });
    mount();
    const toggle = await screen.findByRole('switch', { name: 'Discussion ouverte aux copropriétaires' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(api.setMeetingDiscussionOpen).toHaveBeenCalledWith('t1', 's1', 'm1', false));
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Discussion ouverte aux copropriétaires' }).getAttribute('aria-checked')
      ).toBe('false')
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Discussion ouverte aux copropriétaires' }));
    await waitFor(() => expect(api.setMeetingDiscussionOpen).toHaveBeenLastCalledWith('t1', 's1', 'm1', true));
  });

  it("le gestionnaire écrit pendant la séance ; le texte est conservé si l'envoi échoue", async () => {
    api.getMeetingDiscussion.mockResolvedValue(discussionView());
    api.postMeetingDiscussionMessage
      .mockRejectedValueOnce({ response: { data: { error: "L'assemblée n'est pas en cours" } } })
      .mockResolvedValueOnce(
        chatMessage({ id: 'd9', authorKind: 'MANAGER', authorName: 'Syndic Dupont', body: 'Le vote va souvrir' })
      );
    mount();
    const input = (await screen.findByLabelText('Votre message')) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Le vote va souvrir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByText("L'assemblée n'est pas en cours")).toBeTruthy();
    expect(input.value).toBe('Le vote va souvrir');

    // Le pictogramme de chargement (animation de sortie) reste dans le nom accessible sous jsdom.
    fireEvent.click(await screen.findByRole('button', { name: /Envoyer/ }));
    await waitFor(() =>
      expect(api.postMeetingDiscussionMessage).toHaveBeenLastCalledWith('t1', 's1', 'm1', 'Le vote va souvrir')
    );
    await waitFor(() => expect(input.value).toBe(''));
    expect(await screen.findAllByText('Le vote va souvrir')).toHaveLength(1);
  });

  it('après la séance : lecture seule, sans interrupteur ni saisie ni bouton de modération', async () => {
    api.getMeetingDiscussion.mockResolvedValue(discussionView());
    mount('COMPLETED');
    expect(await screen.findByText('Bonjour à tous')).toBeTruthy();
    expect(screen.getByText('Séance terminée : la discussion est en lecture seule.')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByLabelText('Votre message')).toBeNull();
    expect(screen.queryByRole('button', { name: /Masquer le message/ })).toBeNull();
  });

  it('après la séance sans message : aucune carte', async () => {
    api.getMeetingDiscussion.mockResolvedValue(discussionView({ messages: [] }));
    mount('COMPLETED');
    await waitFor(() => expect(api.getMeetingDiscussion).toHaveBeenCalled());
    await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('donne à la salle du modérateur un adaptateur de discussion pendant la séance', async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.getMeetingDiscussion.mockResolvedValue(discussionView());
    api.issueMeetingVisioToken.mockResolvedValue({
      serverUrl: 'wss://lk',
      token: 'jwt',
      identity: 'g',
      roomName: 'r',
      expiresAt: ''
    });
    mount();
    await screen.findByRole('switch', { name: 'Discussion ouverte aux copropriétaires' });
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la visio' }));
    const room = await screen.findByTestId('visio-room');
    expect(room.getAttribute('data-discussion')).toBe('oui');
  });

  it("coupe l'écriture d'un copropriétaire, relit /visio et annonce le résultat", async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    api.setVisioParticipantWriting.mockResolvedValue({ participantId: 'p1', muted: true });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: "Couper l'écriture de Awa Traoré" }));
    await waitFor(() => expect(api.setVisioParticipantWriting).toHaveBeenCalledWith('t1', 's1', 'm1', 'p1', false));
    expect(await screen.findByText('Écriture coupée pour Awa Traoré')).toBeTruthy();
    await waitFor(() => expect(api.getMeetingVisio.mock.calls.length).toBeGreaterThan(1));
  });

  it('marque « écriture coupée » et propose de la rétablir', async () => {
    const muted = visioView();
    muted.participants[1] = { ...muted.participants[1], chatMuted: true };
    api.getMeetingVisio.mockResolvedValue(muted);
    api.setVisioParticipantWriting.mockResolvedValue({ participantId: 'p2', muted: false });
    mount();
    expect(await screen.findByText('écriture coupée')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "Rétablir l'écriture de Ibrahim Koné" }));
    await waitFor(() => expect(api.setVisioParticipantWriting).toHaveBeenCalledWith('t1', 's1', 'm1', 'p2', true));
    expect(await screen.findByText('Écriture rétablie pour Ibrahim Koné')).toBeTruthy();
  });

  it("désactive la coupure d'écriture quand l'AG est figée", async () => {
    api.getMeetingVisio.mockResolvedValue(visioView());
    mount('COMPLETED');
    const button = (await screen.findByRole('button', {
      name: "Couper l'écriture de Awa Traoré"
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe('MeetingLiveConsole - lectures périmées', () => {
  it('ignore une lecture lancée avant la clôture du vote et résolue après', async () => {
    const openView = live();
    const closedView = live({
      resolutions: live().resolutions.map(r => (r.id === 'r2' ? { ...r, voteStatus: 'CLOSED' as const } : r))
    });
    let releaseStale: (view: LiveMeetingAdminView) => void = () => undefined;
    let calls = 0;
    api.getLiveMeeting.mockImplementation(() => {
      calls += 1;
      if (calls === 2) return new Promise<LiveMeetingAdminView>(resolve => (releaseStale = resolve));
      // Lectures suivantes laissées en vol : seule la lecture périmée peut modifier l'écran.
      return calls === 1 ? Promise.resolve(openView) : new Promise<LiveMeetingAdminView>(() => undefined);
    });
    api.closeResolutionVote.mockResolvedValue(closedView);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Clore le vote' }));
      const confirm = (await screen.findAllByRole('button', { name: 'Clore le vote' })).pop() as HTMLElement;
      // Le sondage périodique lance une lecture (2e appel) qui reste en vol.
      await act(async () => {
        vi.advanceTimersByTime(5100);
      });
      await waitFor(() => expect(calls).toBe(2));
      fireEvent.click(confirm);
      await waitFor(() => expect(api.closeResolutionVote).toHaveBeenCalled());
      await screen.findAllByText('Vote clos');
      // La lecture périmée (vote encore ouvert) arrive après la clôture.
      await act(async () => {
        releaseStale(openView);
      });
      expect(screen.queryByText('Vote ouvert')).toBeNull();
      expect(screen.getAllByText('Vote clos').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MeetingLiveConsole : cadence, empreinte et ligne occupée', () => {
  const tick = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it('relit la liste des participants un cycle sur trois seulement (compteurs déjà dans /direct)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount();
      await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
      expect(api.getLiveMeeting).toHaveBeenCalledTimes(1);
      expect(api.listMeetingParticipants).toHaveBeenCalledTimes(1);
      await tick(5100);
      await tick(5100);
      expect(api.getLiveMeeting).toHaveBeenCalledTimes(3);
      expect(api.listMeetingParticipants).toHaveBeenCalledTimes(1);
      await tick(5100);
      expect(api.getLiveMeeting).toHaveBeenCalledTimes(4);
      expect(api.listMeetingParticipants).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne rend rien de nouveau quand une lecture rend les mêmes données (seule l’horloge serveur change)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onRender = vi.fn();
      render(
        <App>
          <React.Profiler id="console" onRender={onRender}>
            <MeetingLiveConsole tenantId="t1" syndicId="s1" meetingId="m1" meetingStatus="IN_PROGRESS" />
          </React.Profiler>
        </App>
      );
      await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
      await tick(100);
      const commits = onRender.mock.calls.length;
      let n = 0;
      api.getLiveMeeting.mockImplementation(() =>
        Promise.resolve(live({ serverTime: `2026-10-20T10:03:0${(n += 1)}.000Z` }))
      );
      await tick(5100);
      await tick(5100);
      expect(api.getLiveMeeting.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(onRender.mock.calls.length).toBe(commits);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suspend le rafraîchissement tant qu’un menu d’émargement est ouvert, puis relit aussitôt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.setLotAttendance.mockResolvedValue(live());
      mount();
      const select = await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
      const before = api.getLiveMeeting.mock.calls.length;
      fireEvent.mouseDown(select);
      const option = await screen.findByTitle('Présent en salle');
      await tick(20000);
      expect(api.getLiveMeeting.mock.calls.length).toBe(before);
      fireEvent.click(option);
      await waitFor(() => expect(api.setLotAttendance).toHaveBeenCalled());
      await tick(100);
      expect(api.getLiveMeeting.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne désactive que la ligne en cours d’émargement et ne relit pas derrière la réponse', async () => {
    let release: (view: LiveMeetingAdminView) => void = () => undefined;
    api.setLotAttendance.mockImplementation(() => new Promise<LiveMeetingAdminView>(resolve => (release = resolve)));
    mount();
    const select = await screen.findByRole('combobox', { name: 'Émargement du lot B2' });
    const reads = api.getLiveMeeting.mock.calls.length;
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByTitle('Présent en salle'));
    await waitFor(() => expect(api.setLotAttendance).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Émargement du lot B2' }) as HTMLInputElement).disabled).toBe(true)
    );
    expect((screen.getByRole('combobox', { name: 'Émargement du lot C3' }) as HTMLInputElement).disabled).toBe(false);
    await act(async () => {
      release(live());
    });
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Émargement du lot B2' }) as HTMLInputElement).disabled).toBe(false)
    );
    expect(api.getLiveMeeting.mock.calls.length).toBe(reads);
  });
});
