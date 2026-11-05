import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LiveLotsTable } from '../../components/syndics/live/LiveLotsTable';
import { LiveParticipantsTable } from '../../components/syndics/live/LiveParticipantsTable';
import { MeetingVisioCard } from '../../components/syndics/visio/MeetingVisioCard';
import type {
  LiveLotRow,
  MeetingParticipantView,
  MeetingVisioAdminView,
  MeetingVisioParticipant
} from '../../types/syndic-live-types';

/**
 * Recherche LOCALE des tableaux de la console en direct : lots de la séance (« ll »), participants
 * et liens (« lp »), participants à la visio (« vp »). Aucune requête : le filtre ne change que
 * l'affichage, et son état (URL) survit au rafraîchissement périodique des données.
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function Wrapper({ children, search = '' }: { children?: React.ReactNode; search?: string }) {
  return (
    <MemoryRouter initialEntries={[`/ag${search}`]}>
      <Url />
      {children}
    </MemoryRouter>
  );
}

/** `render` avec un routeur dont l'URL de départ est choisie ; `rerender` conserve le routeur. */
function mount(ui: React.ReactElement, search = '') {
  const wrapper = ({ children }: { children?: React.ReactNode }) => <Wrapper search={search}>{children}</Wrapper>;
  return render(ui, { wrapper });
}

/* ------------------------------------------------------------------------ lots */

function lot(overrides: Partial<LiveLotRow> & { lotId: string; lotNumber: string }): LiveLotRow {
  return {
    generalShares: 100,
    voters: [],
    attendance: null,
    online: false,
    ...overrides
  };
}

const attendance = (
  status: 'PRESENT' | 'REPRESENTED' | 'ABSENT',
  representedByName: string | null = null
): NonNullable<LiveLotRow['attendance']> => ({
  status,
  mode: 'IN_PERSON',
  recordedBy: 'MANAGER',
  attendeeContactId: null,
  attendeeName: null,
  representedByContactId: representedByName ? 'cx' : null,
  representedByName,
  updatedAt: '2026-10-20T10:00:00.000Z'
});

const LOTS: LiveLotRow[] = [
  lot({
    lotId: 'l1',
    lotNumber: 'A1',
    voters: [{ contactId: 'c1', name: 'Awa Traoré' }],
    attendance: attendance('PRESENT'),
    online: true
  }),
  lot({
    lotId: 'l2',
    lotNumber: 'B2',
    voters: [{ contactId: 'c2', name: 'Ibrahim Koné' }],
    attendance: attendance('REPRESENTED', 'Moussa Sylla')
  }),
  lot({ lotId: 'l3', lotNumber: 'C3', voters: [{ contactId: 'c3', name: 'Fanta Diallo' }] })
];

function lotsTable(lots: LiveLotRow[], onBulk = vi.fn()) {
  return <LiveLotsTable lots={lots} contacts={[]} readOnly={false} onSetLot={vi.fn()} onBulk={onBulk} />;
}

describe('LiveLotsTable : recherche locale', () => {
  it('le champ libre trouve un lot par son copropriétaire, sans accent ni casse', async () => {
    const user = userEvent.setup();
    mount(lotsTable(LOTS));
    expect(screen.getByRole('combobox', { name: 'Émargement du lot A1' })).toBeInTheDocument();
    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les lots de la séance' })).getByRole('textbox'),
      'KONE'
    );
    await vi.waitFor(
      () => expect(screen.queryByRole('combobox', { name: 'Émargement du lot A1' })).not.toBeInTheDocument(),
      T
    );
    expect(screen.getByRole('combobox', { name: 'Émargement du lot B2' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot C3' })).not.toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('ll.q=KONE');
  });

  it('le champ libre trouve un lot par son mandataire', async () => {
    const user = userEvent.setup();
    mount(lotsTable(LOTS));
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'sylla');
    await vi.waitFor(
      () => expect(screen.queryByRole('combobox', { name: 'Émargement du lot A1' })).not.toBeInTheDocument(),
      T
    );
    expect(screen.getByRole('combobox', { name: 'Émargement du lot B2' })).toBeInTheDocument();
  });

  it('le critère « Présence » filtre les lots (absent par défaut quand rien n’est émargé)', () => {
    mount(lotsTable(LOTS), '?ll.presence=ABSENT');
    expect(screen.getByRole('combobox', { name: 'Émargement du lot C3' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot A1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot B2' })).not.toBeInTheDocument();
  });

  it('le critère « Présence » accepte plusieurs valeurs', () => {
    mount(lotsTable(LOTS), '?ll.presence=PRESENT,REPRESENTED');
    expect(screen.getByRole('combobox', { name: 'Émargement du lot A1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Émargement du lot B2' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot C3' })).not.toBeInTheDocument();
  });

  it('le critère « En ligne » sépare les lots en ligne et hors ligne', () => {
    mount(lotsTable(LOTS), '?ll.online=1');
    expect(screen.getByRole('combobox', { name: 'Émargement du lot A1' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot B2' })).not.toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mount(lotsTable(LOTS), '?ll.q=introuvable');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByRole('combobox', { name: 'Émargement du lot A1' }, T)).toBeInTheDocument();
  });

  it('la saisie et la page survivent à un nouveau rendu avec des données rafraîchies', async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      lot({
        lotId: `m${index}`,
        lotNumber: `L${String(index + 1).padStart(3, '0')}`,
        voters: [{ contactId: `v${index}`, name: index % 2 === 0 ? 'Awa Traoré' : 'Ibrahim Koné' }]
      })
    );
    const view = mount(lotsTable(many), '?ll.page=2');
    // Page 2 : lots 26 à 40.
    expect(screen.getByRole('combobox', { name: 'Émargement du lot L026' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot L001' })).not.toBeInTheDocument();

    // Rafraîchissement : nouvelle référence de tableau, nouvelles lignes, mêmes contenus.
    view.rerender(lotsTable(many.map(row => ({ ...row }))));
    expect(screen.getByRole('combobox', { name: 'Émargement du lot L026' })).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('ll.page=2');

    // La saisie survit aussi : filtre, puis rafraîchissement.
    const user = userEvent.setup();
    const box = within(screen.getByRole('search')).getByRole('textbox') as HTMLInputElement;
    await user.type(box, 'koné');
    // Le champ libre s'applique après sa temporisation : la page revient alors à 1.
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).toContain('ll.q=koné'), T);
    expect(await screen.findByRole('combobox', { name: 'Émargement du lot L002' }, T)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot L001' })).not.toBeInTheDocument();
    view.rerender(lotsTable(many.map(row => ({ ...row }))));
    expect((within(screen.getByRole('search')).getByRole('textbox') as HTMLInputElement).value).toBe('koné');
    expect(screen.getByRole('combobox', { name: 'Émargement du lot L002' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Émargement du lot L001' })).not.toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('ll.q=koné');
  });

  it('l’émargement en masse agit sur les lots cochés, pas sur la liste filtrée', () => {
    const onBulk = vi.fn();
    mount(lotsTable(LOTS, onBulk), '?ll.q=traore');
    // Un seul lot visible (A1) : on le coche puis on marque présents.
    const rowBoxes = screen.getAllByRole('checkbox');
    fireEvent.click(rowBoxes[rowBoxes.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Marquer présents en salle' }));
    expect(onBulk).toHaveBeenCalledWith(['l1'], 'PRESENT');
  });
});

/* ------------------------------------------------------------------ participants */

function participant(overrides: Partial<MeetingParticipantView> & { contactId: string; name: string }) {
  return {
    email: null,
    phone: null,
    lotNumbers: [],
    joinedAt: null,
    lastSeenAt: null,
    online: false,
    activeLinks: 1,
    ...overrides
  } as MeetingParticipantView;
}

const PARTICIPANTS: MeetingParticipantView[] = [
  participant({
    contactId: 'c1',
    name: 'Awa Traoré',
    email: 'awa@exemple.ci',
    phone: '+22507000001',
    lotNumbers: ['A1'],
    joinedAt: '2026-10-20T09:00:00.000Z',
    online: true
  }),
  participant({
    contactId: 'c2',
    name: 'Ibrahim Koné',
    email: 'ibrahim@exemple.ci',
    lotNumbers: ['B2'],
    activeLinks: 0
  }),
  participant({ contactId: 'c3', name: 'Fanta Diallo', phone: '+22507000003', lotNumbers: ['C3'] })
];

function participantsTable(list: MeetingParticipantView[], inVisio?: ReadonlySet<string>) {
  return (
    <LiveParticipantsTable
      participants={list}
      inVisioContactIds={inVisio}
      readOnly={false}
      busyContactId={null}
      onCopyLink={vi.fn()}
      onRevoke={vi.fn()}
    />
  );
}

describe('LiveParticipantsTable : recherche locale', () => {
  it('le champ libre trouve un participant par son e-mail, son téléphone ou son lot', async () => {
    const user = userEvent.setup();
    mount(participantsTable(PARTICIPANTS));
    const box = () =>
      within(screen.getByRole('search', { name: 'Rechercher dans les participants' })).getByRole('textbox');

    await user.type(box(), 'ibrahim@');
    await vi.waitFor(() => expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Ibrahim Koné')).toBeInTheDocument();

    await user.clear(box());
    await user.type(box(), '0700000');
    await vi.waitFor(() => expect(screen.queryByText('Ibrahim Koné')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(screen.getByText('Fanta Diallo')).toBeInTheDocument();

    await user.clear(box());
    await user.type(box(), 'C3');
    await vi.waitFor(() => expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Fanta Diallo')).toBeInTheDocument();
  });

  it('le critère « A rejoint » filtre les participants', () => {
    mount(participantsTable(PARTICIPANTS), '?lp.joined=1');
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(screen.queryByText('Ibrahim Koné')).not.toBeInTheDocument();
    expect(screen.queryByText('Fanta Diallo')).not.toBeInTheDocument();
  });

  it('le critère « Liens actifs » distingue les participants sans lien actif', () => {
    mount(participantsTable(PARTICIPANTS), '?lp.links=0');
    expect(screen.getByText('Ibrahim Koné')).toBeInTheDocument();
    expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument();
  });

  it('le critère « En visio » n’existe que si la visio est activée', () => {
    mount(participantsTable(PARTICIPANTS, new Set(['c3'])), '?lp.visio=1');
    expect(screen.getByText('Fanta Diallo')).toBeInTheDocument();
    expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mount(participantsTable(PARTICIPANTS), '?lp.q=introuvable');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
  });

  it('sans participant : message d’état vide, pas de « Aucun résultat »', () => {
    mount(participantsTable([]));
    expect(screen.getByText('Aucun participant pour le moment')).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ visio */

function visioParticipant(
  overrides: Partial<MeetingVisioParticipant> & { identity: string; name: string }
): MeetingVisioParticipant {
  return {
    kind: 'COOWNER',
    participantId: overrides.identity,
    contactId: null,
    handRaisedAt: null,
    canSpeak: true,
    joinedAt: null,
    ...overrides
  };
}

const VISIO: MeetingVisioAdminView = {
  roomName: 'room',
  roomActive: true,
  participants: [
    visioParticipant({
      identity: 'p1',
      name: 'Awa Traoré',
      handRaisedAt: '2026-10-20T10:00:00.000Z',
      mic: { published: true, muted: true }
    }),
    visioParticipant({ identity: 'p2', name: 'Ibrahim Koné', mic: { published: true, muted: false } }),
    visioParticipant({ identity: 'gestionnaire-u1', name: 'Marie Gestion', kind: 'MANAGER', participantId: null })
  ]
} as MeetingVisioAdminView;

function visioCard(visio: MeetingVisioAdminView) {
  return (
    <MeetingVisioCard
      visio={visio}
      frozen={false}
      roomOpen={false}
      onToggleRoom={vi.fn()}
      getToken={vi.fn()}
      busyParticipantId={null}
      onSpeak={vi.fn()}
      onRemove={vi.fn()}
    />
  );
}

describe('MeetingVisioCard : recherche locale des participants', () => {
  it('le champ libre trouve un participant par son nom ou son rôle', async () => {
    const user = userEvent.setup();
    mount(visioCard(VISIO));
    const box = () =>
      within(screen.getByRole('search', { name: 'Rechercher dans les participants à la visio' })).getByRole('textbox');

    await user.type(box(), 'koné');
    await vi.waitFor(() => expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Ibrahim Koné')).toBeInTheDocument();

    await user.clear(box());
    await user.type(box(), 'gestionnaire');
    await vi.waitFor(() => expect(screen.queryByText('Ibrahim Koné')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Marie Gestion')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('vp.q=gestionnaire');
  });

  it('le critère « Rôle » filtre les participants', () => {
    mount(visioCard(VISIO), '?vp.role=MANAGER');
    expect(screen.getByText('Marie Gestion')).toBeInTheDocument();
    expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument();
  });

  it('le critère « Main levée » ne garde que les mains levées', () => {
    mount(visioCard(VISIO), '?vp.hand=1');
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(screen.queryByText('Ibrahim Koné')).not.toBeInTheDocument();
  });

  it('le critère « Micro » filtre sur l’état affiché (coupé)', () => {
    mount(visioCard(VISIO), '?vp.mic=MUTED');
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(screen.queryByText('Ibrahim Koné')).not.toBeInTheDocument();
  });

  it('la saisie survit à une relecture de la salle (nouvelle liste de participants)', async () => {
    const user = userEvent.setup();
    const view = mount(visioCard(VISIO));
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'koné');
    await vi.waitFor(() => expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument(), T);
    view.rerender(visioCard({ ...VISIO, participants: VISIO.participants.map(row => ({ ...row })) }));
    expect((within(screen.getByRole('search')).getByRole('textbox') as HTMLInputElement).value).toBe('koné');
    expect(screen.getByText('Ibrahim Koné')).toBeInTheDocument();
    expect(screen.queryByText('Awa Traoré')).not.toBeInTheDocument();
  });

  it('aucun résultat : la barre propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mount(visioCard(VISIO), '?vp.q=introuvable');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('Awa Traoré', undefined, T)).toBeInTheDocument();
  });

  it('personne en visio : message d’état vide, pas de « Aucun résultat »', () => {
    mount(visioCard({ ...VISIO, participants: [] }));
    expect(screen.getByText("Personne n'est en visio pour le moment")).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat')).not.toBeInTheDocument();
  });
});
