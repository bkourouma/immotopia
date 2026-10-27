/**
 * Détail d'AG : ajout idempotent d'une résolution (anti-doublon), suppression d'une résolution sans
 * vote, et envoi / renvoi de la convocation selon `convocationSent`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SyndicMeetingDetail } from '../../pages/syndics/SyndicMeetingDetail';

const api = {
  getMeeting: vi.fn(),
  addMeetingResolution: vi.fn(),
  deleteMeetingResolution: vi.fn(),
  resendMeetingConvocation: vi.fn()
};

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    getMeeting: (...a: unknown[]) => api.getMeeting(...a),
    addMeetingResolution: (...a: unknown[]) => api.addMeetingResolution(...a),
    deleteMeetingResolution: (...a: unknown[]) => api.deleteMeetingResolution(...a),
    resendMeetingConvocation: (...a: unknown[]) => api.resendMeetingConvocation(...a)
  };
});

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: 'm1', lotId: undefined })
}));

// Blocs voisins, couverts par leurs propres tests (VoteBoard reste réel : il porte la suppression).
vi.mock('../../components/syndics/MeetingLiveConsole', () => ({
  MANUAL_VOTE_ANCHOR_ID: 'meeting-vote-entry',
  MeetingLiveConsole: () => null,
  default: () => null
}));
vi.mock('../../components/syndics/MeetingProxies', () => ({ MeetingProxies: () => null }));
vi.mock('../../components/syndics/MeetingAgenda', () => ({ MeetingAgenda: () => null }));
vi.mock('../../components/syndics/MeetingStatusActions', () => ({ MeetingStatusActions: () => null }));
vi.mock('../../components/syndics/MeetingConvocationWord', () => ({ MeetingConvocationWord: () => null }));

const baseResolution = {
  meetingId: 'm1',
  votesFor: 0,
  votesAgainst: 0,
  votesAbstain: 0,
  sharesFor: 0,
  result: null,
  voteStatus: 'PENDING',
  votes: [],
  createdAt: '',
  updatedAt: ''
};

function makeMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    syndicateId: 's1',
    type: 'ORDINARY',
    scheduledAt: '2026-10-20T09:00:00.000Z',
    status: 'PLANNED',
    quorum: 0,
    createdAt: '',
    updatedAt: '',
    resolutions: [],
    agendaItems: [],
    syndicate: { lots: [] },
    ...overrides
  };
}

function mount() {
  render(
    <MemoryRouter>
      <App>
        <SyndicMeetingDetail />
      </App>
    </MemoryRouter>
  );
}

async function openAddModalAndFill(title = 'Travaux de toiture') {
  fireEvent.click(await screen.findByRole('button', { name: /Ajouter une résolution/ }));
  const input = await screen.findByLabelText('Titre');
  fireEvent.change(input, { target: { value: title } });
}

const okButton = () => screen.getByRole('button', { name: /^(loading\s+)?Ajouter$/ });

beforeEach(() => {
  vi.clearAllMocks();
  api.getMeeting.mockResolvedValue(makeMeeting());
  api.addMeetingResolution.mockResolvedValue({ id: 'r-new' });
  api.deleteMeetingResolution.mockResolvedValue({ id: 'r1' });
  api.resendMeetingConvocation.mockResolvedValue({
    owners: 2,
    emailEnabled: true,
    emailSent: 2,
    emailFailed: 0,
    emailSkippedNoAddress: 0,
    whatsappSent: 0,
    failures: []
  });
});

describe('SyndicMeetingDetail - ajout d une résolution', () => {
  it('un double clic sur « Ajouter » n envoie qu une seule requête, avec une clé d idempotence', async () => {
    let resolve!: (v: unknown) => void;
    api.addMeetingResolution.mockReturnValue(new Promise(r => (resolve = r)));
    mount();
    await openAddModalAndFill();

    fireEvent.click(okButton());
    fireEvent.click(okButton());
    await waitFor(() => expect(api.addMeetingResolution).toHaveBeenCalledTimes(1));
    expect(api.addMeetingResolution.mock.calls[0][4]).toBeTruthy();

    resolve({ id: 'r-new' });
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2));
    expect(api.addMeetingResolution).toHaveBeenCalledTimes(1);
  });

  it('conserve la même clé au réessai après une erreur 5xx et recharge l AG en silence', async () => {
    api.addMeetingResolution
      .mockRejectedValueOnce({ response: { status: 503, data: '<html>503</html>' } })
      .mockResolvedValueOnce({ id: 'r-new' });
    mount();
    await openAddModalAndFill();

    fireEvent.click(okButton());
    await waitFor(() => expect(api.addMeetingResolution).toHaveBeenCalledTimes(1));
    // Rechargement silencieux : une 2e lecture, sans que le détail ne soit démonté.
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Détail assemblée générale')).toBeTruthy();

    await waitFor(() => expect((okButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(okButton());
    await waitFor(() => expect(api.addMeetingResolution).toHaveBeenCalledTimes(2));
    expect(api.addMeetingResolution.mock.calls[1][4]).toBe(api.addMeetingResolution.mock.calls[0][4]);
  });

  it('renouvelle la clé après un refus définitif (4xx)', async () => {
    api.addMeetingResolution
      .mockRejectedValueOnce({ response: { status: 400, data: { error: 'Titre refusé' } } })
      .mockResolvedValueOnce({ id: 'r-new' });
    mount();
    await openAddModalAndFill();

    fireEvent.click(okButton());
    await waitFor(() => expect(api.addMeetingResolution).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((okButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(okButton());
    await waitFor(() => expect(api.addMeetingResolution).toHaveBeenCalledTimes(2));
    expect(api.addMeetingResolution.mock.calls[1][4]).not.toBe(api.addMeetingResolution.mock.calls[0][4]);
  });
});

describe('SyndicMeetingDetail - suppression d une résolution', () => {
  const meetingWithResolutions = () =>
    makeMeeting({
      resolutions: [
        { ...baseResolution, id: 'r1', title: 'Sans vote' },
        {
          ...baseResolution,
          id: 'r2',
          title: 'Déjà votée',
          votesFor: 2,
          votes: [{ id: 'v', lotId: 'l', vote: 'FOR' }]
        },
        { ...baseResolution, id: 'r3', title: 'Vote ouvert', voteStatus: 'OPEN' }
      ]
    });

  it('propose la suppression seulement pour la résolution en attente et sans vote, après confirmation', async () => {
    api.getMeeting.mockResolvedValue(meetingWithResolutions());
    mount();

    const row = (await screen.findByText('Sans vote')).closest('tr') as HTMLElement;
    expect(within(row).getByRole('button', { name: /Supprimer/ })).toBeTruthy();
    expect(
      within((await screen.findByText('Déjà votée')).closest('tr') as HTMLElement).queryByRole('button')
    ).toBeNull();
    expect(
      within((await screen.findByText('Vote ouvert')).closest('tr') as HTMLElement).queryByRole('button')
    ).toBeNull();

    fireEvent.click(within(row).getByRole('button', { name: /Supprimer/ }));
    expect(await screen.findByText('Supprimer cette résolution ?')).toBeTruthy();
    expect(api.deleteMeetingResolution).not.toHaveBeenCalled();

    const confirm = (await screen.findAllByRole('button', { name: /Supprimer/ })).pop() as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteMeetingResolution).toHaveBeenCalledWith('t1', 's1', 'm1', 'r1'));
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2));
  });

  it('ne propose aucune suppression quand l AG est clôturée', async () => {
    api.getMeeting.mockResolvedValue({ ...meetingWithResolutions(), status: 'COMPLETED' });
    mount();
    const row = (await screen.findByText('Sans vote')).closest('tr') as HTMLElement;
    expect(within(row).queryByRole('button')).toBeNull();
  });
});

describe('SyndicMeetingDetail - convocations', () => {
  it('affiche « Envoyer les convocations » tant que la convocation n est pas partie', async () => {
    api.getMeeting.mockResolvedValue(makeMeeting({ convocationSent: false }));
    mount();
    expect(await screen.findByRole('button', { name: 'Envoyer les convocations' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Renvoyer la convocation' })).toBeNull();
  });

  it.each([true, undefined])('affiche « Renvoyer la convocation » quand convocationSent vaut %s', async value => {
    api.getMeeting.mockResolvedValue(makeMeeting({ convocationSent: value }));
    mount();
    expect(await screen.findByRole('button', { name: 'Renvoyer la convocation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Envoyer les convocations' })).toBeNull();
  });

  it('demande confirmation avec le nombre de points, puis envoie et recharge l AG', async () => {
    api.getMeeting.mockResolvedValue(
      makeMeeting({
        convocationSent: false,
        agendaItems: [
          { id: 'a1', meetingId: 'm1', orderIndex: 1, title: 'Comptes', discussions: [], createdAt: '', updatedAt: '' },
          { id: 'a2', meetingId: 'm1', orderIndex: 2, title: 'Budget', discussions: [], createdAt: '', updatedAt: '' }
        ]
      })
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer les convocations' }));
    expect(
      await screen.findByText("2 point(s) à l'ordre du jour sera/seront envoyé(s) dans la convocation.")
    ).toBeTruthy();
    expect(api.resendMeetingConvocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(api.resendMeetingConvocation).toHaveBeenCalledWith('t1', 's1', 'm1'));
    await waitFor(() => expect(api.getMeeting).toHaveBeenCalledTimes(2));
  });

  it('avertit explicitement quand aucun point n est inscrit à l ordre du jour', async () => {
    api.getMeeting.mockResolvedValue(makeMeeting({ convocationSent: false, agendaItems: [] }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer les convocations' }));
    expect(
      await screen.findByText(
        "Aucun point n'est inscrit à l'ordre du jour : les convocations partiront sans ordre du jour."
      )
    ).toBeTruthy();
  });
});
