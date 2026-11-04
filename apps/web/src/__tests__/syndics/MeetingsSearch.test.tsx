import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'antd';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';
import { MeetingProxies } from '../../components/syndics/MeetingProxies';
import { VoteBoard } from '../../components/syndics/VoteBoard';
import type { GeneralMeeting, MeetingLot, MeetingProxy, MeetingResolution } from '../../types/syndic-types';

/**
 * Recherche multicritères LOCALE des tableaux de la liste des assemblées et de la fiche d'AG :
 * liste des AG, pouvoirs (préfixe « px ») et résolutions (préfixe « vb »).
 */

const api = { listMeetings: vi.fn() };

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/syndic-service')>('../../services/syndic-service');
  return {
    ...actual,
    listMeetings: (...a: unknown[]) => api.listMeetings(...a)
  };
});
vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 't1', syndicId: 's1', meetingId: undefined, lotId: undefined })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function withRouter(ui: React.ReactElement, search = '') {
  return render(
    <MemoryRouter initialEntries={[`/ag${search}`]}>
      <Url />
      <App>{ui}</App>
    </MemoryRouter>
  );
}

/* ------------------------------------------------------------------ liste des AG */

function meeting(overrides: Partial<GeneralMeeting> & { id: string }): GeneralMeeting {
  return {
    syndicateId: 's1',
    type: 'ORDINARY',
    scheduledAt: '2026-03-10T09:00:00.000Z',
    status: 'PLANNED',
    quorum: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as GeneralMeeting;
}

const MEETINGS: GeneralMeeting[] = [
  meeting({ id: 'm1', location: 'Salle des fêtes', status: 'PLANNED' }),
  meeting({
    id: 'm2',
    location: "Cour de l'immeuble",
    status: 'COMPLETED',
    type: 'EXTRAORDINARY',
    scheduledAt: '2026-08-20T09:00:00.000Z'
  }),
  meeting({ id: 'm3', location: 'Hall A', status: 'CANCELLED', scheduledAt: '2025-11-05T09:00:00.000Z' })
];

describe('SyndicMeetings : recherche multicritères locale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listMeetings.mockResolvedValue(MEETINGS);
  });

  it('le champ libre trouve une AG par son lieu, sans accent ni casse', async () => {
    const user = userEvent.setup();
    withRouter(<SyndicMeetings />);
    expect(await screen.findByText('Salle des fêtes')).toBeInTheDocument();
    expect(screen.getByText('Hall A')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Type, lieu, statut…'), 'SALLE DES FETES');
    await vi.waitFor(() => expect(screen.queryByText('Hall A')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Salle des fêtes')).toBeInTheDocument();
    expect(screen.queryByText("Cour de l'immeuble")).not.toBeInTheDocument();
    expect(new URLSearchParams(screen.getByTestId('url').textContent ?? '').get('q')).toBe('SALLE DES FETES');
  });

  it('le champ libre cherche aussi dans le type affiché', async () => {
    const user = userEvent.setup();
    withRouter(<SyndicMeetings />);
    await screen.findByText('Salle des fêtes');
    await user.type(screen.getByPlaceholderText('Type, lieu, statut…'), 'extraordinaire');
    await vi.waitFor(() => expect(screen.queryByText('Hall A')).not.toBeInTheDocument(), T);
    expect(screen.getByText("Cour de l'immeuble")).toBeInTheDocument();
  });

  it('le critère « Statut » filtre les lignes (plusieurs valeurs)', async () => {
    withRouter(<SyndicMeetings />, '?status=COMPLETED,CANCELLED');
    expect(await screen.findByText("Cour de l'immeuble")).toBeInTheDocument();
    expect(screen.getByText('Hall A')).toBeInTheDocument();
    expect(screen.queryByText('Salle des fêtes')).not.toBeInTheDocument();
  });

  it('le critère « Date » (du… au…) filtre sur le jour de l’assemblée', async () => {
    withRouter(<SyndicMeetings />, '?dateFrom=2026-06-01&dateTo=2026-12-31');
    expect(await screen.findByText("Cour de l'immeuble")).toBeInTheDocument();
    expect(screen.queryByText('Salle des fêtes')).not.toBeInTheDocument();
    expect(screen.queryByText('Hall A')).not.toBeInTheDocument();
  });

  it('le critère « Type » filtre les lignes', async () => {
    withRouter(<SyndicMeetings />, '?type=EXTRAORDINARY');
    expect(await screen.findByText("Cour de l'immeuble")).toBeInTheDocument();
    expect(screen.queryByText('Hall A')).not.toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    withRouter(<SyndicMeetings />, '?status=IN_PROGRESS');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('Salle des fêtes', undefined, T)).toBeInTheDocument();
  });

  it('sans aucune AG : invite à créer, pas de « Aucun résultat »', async () => {
    api.listMeetings.mockResolvedValue([]);
    withRouter(<SyndicMeetings />);
    expect(
      await screen.findByText('Aucune assemblée pour le moment : créez-en une avec « Nouvelle assemblée ».')
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat')).not.toBeInTheDocument();
  });

  it('pagine localement par 20', async () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      meeting({ id: `x${index}`, location: `Lieu-${String(index + 1).padStart(3, '0')}` })
    );
    api.listMeetings.mockResolvedValue(many);
    const user = userEvent.setup();
    withRouter(<SyndicMeetings />);
    expect(await screen.findByText('Lieu-020')).toBeInTheDocument();
    expect(screen.queryByText('Lieu-021')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('3'));
    expect(await screen.findByText('Lieu-045', undefined, T)).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------- pouvoirs */

const contact = (id: string, firstName: string, lastName: string) => ({
  id,
  firstName,
  lastName,
  legalName: null,
  email: null
});

const LOTS = [
  { id: 'l1', lotNumber: 'A1', generalShares: 100, owner: contact('c1', 'Awa', 'Koné'), ownerContactId: 'c1' },
  { id: 'l2', lotNumber: 'B2', generalShares: 100, owner: contact('c2', 'Ibrahim', 'Sylla'), ownerContactId: 'c2' },
  { id: 'l3', lotNumber: 'C3', generalShares: 100, owner: contact('c3', 'Fanta', 'Diallo'), ownerContactId: 'c3' }
] as unknown as MeetingLot[];

function proxy(id: string, grantor: ReturnType<typeof contact>, representative: ReturnType<typeof contact>) {
  return {
    id,
    meetingId: 'm1',
    grantorContactId: grantor.id,
    representativeContactId: representative.id,
    createdAt: '',
    grantor,
    representative
  } as MeetingProxy;
}

const PROXIES: MeetingProxy[] = [
  proxy('p1', contact('c1', 'Awa', 'Koné'), contact('c9', 'Moussa', 'Traoré')),
  proxy('p2', contact('c2', 'Ibrahim', 'Sylla'), contact('c8', 'Zeinab', 'Ouattara'))
];

function mountProxies(proxies: MeetingProxy[] = PROXIES, search = '') {
  return withRouter(
    <MeetingProxies tenantId="t1" syndicId="s1" meetingId="m1" proxies={proxies} lots={LOTS} onChanged={vi.fn()} />,
    search
  );
}

describe('MeetingProxies : recherche multicritères locale', () => {
  it('le champ libre trouve un pouvoir par son mandataire', async () => {
    const user = userEvent.setup();
    mountProxies();
    expect(screen.getByText('Moussa Traoré')).toBeInTheDocument();
    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les pouvoirs' })).getByRole('textbox'),
      'ouattara'
    );
    await vi.waitFor(() => expect(screen.queryByText('Moussa Traoré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Zeinab Ouattara')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('px.q=ouattara');
  });

  it('le champ libre trouve un pouvoir par le numéro de lot du mandant', async () => {
    const user = userEvent.setup();
    mountProxies();
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'B2');
    await vi.waitFor(() => expect(screen.queryByText('Moussa Traoré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Zeinab Ouattara')).toBeInTheDocument();
  });

  it('le critère « Lot » filtre sur les lots du mandant', () => {
    mountProxies(PROXIES, '?px.lot=l1');
    expect(screen.getByText('Moussa Traoré')).toBeInTheDocument();
    expect(screen.queryByText('Zeinab Ouattara')).not.toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mountProxies(PROXIES, '?px.q=introuvable');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('Moussa Traoré', undefined, T)).toBeInTheDocument();
  });

  it('sans pouvoir : message « Aucun pouvoir enregistré »', () => {
    mountProxies([]);
    expect(screen.getByText('Aucun pouvoir enregistré')).toBeInTheDocument();
  });

  it('pagine localement par 20', async () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      proxy(
        `q${index}`,
        contact(`g${index}`, 'Mandant', `N${String(index + 1).padStart(2, '0')}`),
        contact('c9', 'M', 'T')
      )
    );
    const user = userEvent.setup();
    mountProxies(many);
    expect(screen.getByText('Mandant N20')).toBeInTheDocument();
    expect(screen.queryByText('Mandant N21')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('2'));
    expect(await screen.findByText('Mandant N25', undefined, T)).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------- résolutions */

function resolution(id: string, title: string, overrides: Partial<MeetingResolution> = {}): MeetingResolution {
  return {
    id,
    meetingId: 'm1',
    title,
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    sharesFor: 0,
    result: null,
    voteStatus: 'PENDING',
    createdAt: '',
    updatedAt: '',
    votes: [],
    ...overrides
  } as MeetingResolution;
}

const RESOLUTIONS: MeetingResolution[] = [
  resolution('r1', 'Ravalement de la façade', { result: 'APPROVED', voteStatus: 'CLOSED' }),
  resolution('r2', 'Changement du syndic', { result: 'REJECTED', voteStatus: 'CLOSED' }),
  resolution('r3', 'Budget prévisionnel', { result: 'APPROVED', voteStatus: 'OPEN' })
];

describe('VoteBoard : recherche multicritères locale', () => {
  it('le champ libre trouve une résolution par son titre', async () => {
    const user = userEvent.setup();
    withRouter(<VoteBoard quorum={50} resolutions={RESOLUTIONS} />);
    expect(screen.getByText('Changement du syndic')).toBeInTheDocument();
    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les résolutions' })).getByRole('textbox'),
      'facade'
    );
    await vi.waitFor(() => expect(screen.queryByText('Changement du syndic')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Ravalement de la façade')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('vb.q=facade');
  });

  it('le critère « Résultat » porte sur la valeur affichée (vote ouvert : « Vote en cours »)', () => {
    withRouter(<VoteBoard quorum={50} resolutions={RESOLUTIONS} />, '?vb.result=APPROVED');
    expect(screen.getByText('Ravalement de la façade')).toBeInTheDocument();
    // « Budget prévisionnel » est approuvé en base mais masqué tant que le vote est ouvert.
    expect(screen.queryByText('Budget prévisionnel')).not.toBeInTheDocument();
  });

  it('le critère « Vote en cours » retrouve la résolution dont le vote est ouvert', () => {
    withRouter(<VoteBoard quorum={50} resolutions={RESOLUTIONS} />, '?vb.result=OPEN');
    expect(screen.getByText('Budget prévisionnel')).toBeInTheDocument();
    expect(screen.queryByText('Ravalement de la façade')).not.toBeInTheDocument();
  });

  it('une AG figée affiche la décision : « Budget prévisionnel » redevient « Approuvée »', () => {
    withRouter(<VoteBoard quorum={50} resolutions={RESOLUTIONS} frozen />, '?vb.result=APPROVED');
    expect(screen.getByText('Budget prévisionnel')).toBeInTheDocument();
    expect(screen.getByText('Ravalement de la façade')).toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    withRouter(<VoteBoard quorum={50} resolutions={RESOLUTIONS} />, '?vb.result=DEFERRED');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('Ravalement de la façade', undefined, T)).toBeInTheDocument();
  });
});
