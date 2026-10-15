import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MeetingLiveConsole } from '../../components/syndics/MeetingLiveConsole';
import type { LiveMeetingAdminView, MeetingParticipantView } from '../../types/syndic-live-types';
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
  updateMeeting: vi.fn()
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
    updateMeeting: (...a: unknown[]) => api.updateMeeting(...a)
  };
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
        await vi.advanceTimersByTimeAsync(3100);
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
        await vi.advanceTimersByTimeAsync(3100);
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
        await vi.advanceTimersByTimeAsync(3100);
      });
      expect(onLiveChanged).not.toHaveBeenCalled();

      const changed = live();
      changed.resolutions[1] = { ...changed.resolutions[1], ballotCount: 2 };
      api.getLiveMeeting.mockResolvedValue(changed);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
      expect(onLiveChanged).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
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
