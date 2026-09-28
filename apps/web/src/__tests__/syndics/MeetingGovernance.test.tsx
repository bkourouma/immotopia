/**
 * AG : statut (ouvrir / clôturer), votes figés après clôture, résultat en
 * tantièmes et pouvoirs. Écrans SyndicMeetings et SyndicMeetingDetail.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';
import { SyndicMeetingDetail } from '../../pages/syndics/SyndicMeetingDetail';
import apiClient from '../../utils/api-client';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('@ant-design/icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ant-design/icons');
  const Icon = () => <span />;
  return Object.fromEntries(Object.keys(actual).map(name => [name, Icon]));
});

const mockValidateFields = vi.fn();
const mockMessage = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn() };

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  // Rend les enfants sans transmettre au DOM les props propres à Ant Design.
  const Wrap =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children }: any) =>
      React.createElement(Tag, null, children);
  const FormComp: any = ({ children }: any) => <form>{children}</form>;
  FormComp.useForm = () => [
    {
      validateFields: mockValidateFields,
      resetFields: vi.fn(),
      setFieldsValue: vi.fn(),
      setFieldValue: vi.fn(),
      getFieldsValue: () => ({}),
      getFieldValue: () => undefined
    }
  ];
  FormComp.Item = ({ label, children }: any) => (
    <div>
      {label ? <label>{label}</label> : null}
      {children}
    </div>
  );
  const InputComp: any = () => <input />;
  InputComp.TextArea = () => <textarea />;
  return {
    Alert: ({ message }: any) => <div role="alert">{message}</div>,
    Button: ({ children, onClick, disabled }: any) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Card: ({ title, extra, children }: any) => (
      <section>
        {title ? <h2>{title}</h2> : null}
        {extra}
        {children}
      </section>
    ),
    Col: Wrap(),
    DatePicker: () => <input />,
    TimePicker: () => <input />,
    Empty: ({ description }: any) => <div>{description}</div>,
    Form: FormComp,
    Input: InputComp,
    Modal: ({ open, title, children, onOk, okText }: any) =>
      open ? (
        <div role="dialog" aria-label={title}>
          {children}
          <button type="button" onClick={onOk}>
            {okText}
          </button>
        </div>
      ) : null,
    // Un clic sur l'élément confirme directement.
    Popconfirm: ({ children, onConfirm }: any) => <span onClickCapture={() => onConfirm?.()}>{children}</span>,
    Progress: () => <div />,
    Row: Wrap(),
    Select: ({ options = [] }: any) => (
      <select>
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    Space: Wrap(),
    Spin: () => <div>loading</div>,
    Statistic: ({ title, value }: any) => (
      <div>
        {title}:{value}
      </div>
    ),
    Table: ({ dataSource = [], columns = [], locale }: any) =>
      dataSource.length === 0 ? (
        <div>{locale?.emptyText}</div>
      ) : (
        <table>
          <tbody>
            {dataSource.map((row: any) => (
              <tr key={row.id}>
                {columns.map((column: any) => (
                  <td key={column.key}>
                    {column.render
                      ? column.render(column.dataIndex ? row[column.dataIndex] : undefined, row)
                      : row[column.dataIndex]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ),
    Tag: ({ children }: any) => <span>{children}</span>,
    // `title` (texte d'infobulle) atterrit comme attribut DOM sur le `<span>` :
    // suffisant pour verifier une action figee sans simuler le survol reel.
    Tooltip: ({ title, children }: any) => (
      <span title={typeof title === 'string' ? title : undefined}>{children}</span>
    ),
    Typography: {
      Title: ({ children }: any) => <h1>{children}</h1>,
      Paragraph: ({ children }: any) => <p>{children}</p>,
      Text: ({ children }: any) => <span>{children}</span>
    },
    App: {
      useApp: () => ({
        message: mockMessage,
        modal: { confirm() {} },
        notification: { open() {} }
      })
    },
    Grid: { useBreakpoint: () => ({}) }
  };
});

const mockApi = apiClient as any;

const contact = (id: string, firstName: string, lastName: string) => ({
  id,
  firstName,
  lastName,
  legalName: null,
  email: null
});
const LOTS = [
  {
    id: 'A1',
    lotNumber: 'ACA-A1',
    lotType: 'APARTMENT',
    generalShares: 100,
    ownerContactId: 'c1',
    owner: contact('c1', 'Awa', 'Kone')
  },
  {
    id: 'A2',
    lotNumber: 'ACA-A2',
    lotType: 'APARTMENT',
    generalShares: 200,
    ownerContactId: 'c2',
    owner: contact('c2', 'Bakary', 'Diallo')
  },
  {
    id: 'A3',
    lotNumber: 'ACA-A3',
    lotType: 'APARTMENT',
    generalShares: 300,
    ownerContactId: 'c3',
    owner: contact('c3', 'Chantal', 'Yao')
  },
  {
    id: 'A4',
    lotNumber: 'ACA-A4',
    lotType: 'APARTMENT',
    generalShares: 400,
    ownerContactId: 'c4',
    owner: contact('c4', 'Didier', 'Kouassi')
  }
];

function buildMeeting(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'meeting-1',
    syndicateId: 'syndic-1',
    type: 'ORDINARY',
    scheduledAt: '2026-10-10T18:00:00.000Z',
    status,
    quorum: '100',
    createdAt: '',
    updatedAt: '',
    agendaItems: [],
    syndicate: { lots: LOTS },
    attendance: { representedLots: 4, representedShares: 1000, totalLots: 4, totalShares: 1000, quorumPercent: 100 },
    proxies: [
      {
        id: 'proxy-1',
        meetingId: 'meeting-1',
        grantorContactId: 'c1',
        representativeContactId: 'c5',
        createdAt: '',
        grantor: contact('c1', 'Awa', 'Kone'),
        representative: contact('c5', 'Eric', 'Mandataire')
      }
    ],
    resolutions: [
      {
        id: 'res-1',
        meetingId: 'meeting-1',
        title: 'Budget 2026',
        majorityRule: 'Article 24',
        votesFor: 2,
        votesAgainst: 1,
        votesAbstain: 1,
        sharesFor: 300,
        result: 'REJECTED',
        createdAt: '',
        updatedAt: '',
        votes: [
          { id: 'v1', lotId: 'A1', vote: 'FOR' },
          { id: 'v2', lotId: 'A2', vote: 'FOR' },
          { id: 'v3', lotId: 'A3', vote: 'AGAINST' },
          { id: 'v4', lotId: 'A4', vote: 'ABSTAIN' }
        ],
        tally: {
          rule: 'ARTICLE_24',
          votesFor: 2,
          votesAgainst: 1,
          votesAbstain: 1,
          sharesFor: 300,
          sharesAgainst: 300,
          sharesAbstain: 400,
          totalShares: 1000,
          totalLots: 4,
          referenceShares: 600,
          ownersFor: 2,
          totalOwners: 4,
          result: 'REJECTED'
        }
      }
    ],
    ...overrides
  };
}

const DETAIL_URL = '/tenants/tenant-1/syndics/syndic-1/assemblees/meeting-1';

function mockDetail(status: string, overrides: Record<string, unknown> = {}) {
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === DETAIL_URL) return { data: { success: true, data: buildMeeting(status, overrides) } };
    if (url === '/tenants/tenant-1/crm/contacts') {
      return { data: { contacts: [contact('c5', 'Eric', 'Mandataire'), contact('c1', 'Awa', 'Kone')] } };
    }
    throw new Error(`GET inattendu : ${url}`);
  });
}

function renderRoute(route: string) {
  // Seul tenantMembership est lu (useSyndicRouteContext) ; le tenantId vient de l'URL.
  const auth = { tenantMembership: { tenantId: 'tenant-1' } } as unknown as AuthContextType;
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/assemblees" element={<SyndicMeetings />} />
          <Route path="/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId" element={<SyndicMeetingDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('AG - statut, majorité et pouvoirs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.patch.mockResolvedValue({ data: { success: true, data: {} } });
    mockApi.post.mockResolvedValue({ data: { success: true, data: {} } });
    mockApi.delete.mockResolvedValue({ data: { success: true, data: {} } });
  });

  it('ouvre une AG planifiée depuis la liste', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'meeting-1',
            syndicateId: 'syndic-1',
            type: 'ORDINARY',
            scheduledAt: '2026-10-10T18:00:00.000Z',
            status: 'PLANNED',
            quorum: 0,
            createdAt: '',
            updatedAt: ''
          }
        ]
      }
    });

    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees');
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la séance' }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith(DETAIL_URL, { status: 'IN_PROGRESS' }));
    expect(mockMessage.success).toHaveBeenCalledWith('Séance ouverte');
    // La liste est rechargée après la transition.
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2));
  });

  it('clôture une séance en cours depuis la fiche', async () => {
    mockDetail('IN_PROGRESS');
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    expect(await screen.findByText('En cours')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ouvrir la séance' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la séance' }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith(DETAIL_URL, { status: 'COMPLETED' }));
    expect(mockMessage.success).toHaveBeenCalledWith('Séance clôturée : les votes sont figés');
  });

  it('affiche le résultat en tantièmes avec la règle et le total de référence', async () => {
    mockDetail('IN_PROGRESS');
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    const board = (await screen.findByText('Resultats des resolutions')).closest('section') as HTMLElement;
    // Texte libre historique « Article 24 » : traité comme l'article 24.
    expect(within(board).getByText('Article 24 — majorité simple')).toBeTruthy();
    expect(within(board).getByText('2 lot(s) · 300 tantièmes')).toBeTruthy();
    expect(within(board).getByText('1 lot(s) · 300 tantièmes')).toBeTruthy();
    expect(within(board).getByText('1 lot(s) · 400 tantièmes')).toBeTruthy();
    expect(within(board).getByText('600 tantièmes')).toBeTruthy();
    expect(within(board).getByText('Rejetée')).toBeTruthy();
    expect(screen.getByText('1000 / 1000 tantièmes représentés')).toBeTruthy();
  });

  it('fige les votes et les résolutions une fois l AG clôturée', async () => {
    mockDetail('COMPLETED');
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    expect(await screen.findByText('Séance clôturée : les votes sont figés.')).toBeTruthy();
    expect(screen.getByText('Clôturée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pour' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter une résolution' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clôturer la séance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter un pouvoir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirer' })).toBeNull();
  });

  it.each([
    ['COMPLETED', "Séance clôturée : plus aucune modification n'est possible."],
    ['CANCELLED', "Assemblée annulée : plus aucune modification n'est possible."]
  ])(
    'desactive l ordre du jour et les infos de reunion sur une AG %s, avec l infobulle qui explique pourquoi',
    async (status, reason) => {
      mockDetail(status, { agendaItems: [{ id: 'agenda-1', title: 'Point 1', orderIndex: 1, discussions: [] }] });
      renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

      await screen.findByText('1. Point 1');

      // Ajout, modification et suppression d'un point d'ordre du jour : desactives.
      const addAgendaButton = screen.getByRole('button', { name: 'Ajouter un point' });
      expect(addAgendaButton).toBeDisabled();
      expect(addAgendaButton.closest('span')).toHaveAttribute('title', reason);

      const editAgendaButton = screen.getByRole('button', { name: 'Modifier' });
      expect(editAgendaButton).toBeDisabled();
      expect(editAgendaButton.closest('span')).toHaveAttribute('title', reason);

      const deleteAgendaButton = screen.getByRole('button', { name: 'Supprimer' });
      expect(deleteAgendaButton).toBeDisabled();
      expect(deleteAgendaButton.closest('span')).toHaveAttribute('title', reason);

      // Modification de la date/heure/lieu de la reunion : desactivee elle aussi.
      const saveMeetingMetaButton = screen.getByRole('button', { name: 'Enregistrer' });
      expect(saveMeetingMetaButton).toBeDisabled();
      expect(saveMeetingMetaButton.closest('span')).toHaveAttribute('title', reason);
    }
  );

  it('propose les règles de majorité à la création d une résolution', async () => {
    mockDetail('IN_PROGRESS');
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');
    await screen.findByText('Budget 2026', { selector: 'td' });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une résolution' }));

    for (const label of [
      'Article 24 — majorité simple',
      'Article 25 — majorité absolue',
      'Article 26 — double majorité',
      'Unanimité'
    ]) {
      expect(screen.getByRole('option', { name: label })).toBeTruthy();
    }

    mockValidateFields.mockResolvedValueOnce({ title: 'Ravalement', majorityRule: 'ARTICLE_25' });
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une resolution' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(`${DETAIL_URL}/resolutions`, {
        title: 'Ravalement',
        majorityRule: 'ARTICLE_25'
      })
    );
  });

  it('affiche les pouvoirs, signale le lot représenté et en crée un nouveau', async () => {
    mockDetail('IN_PROGRESS');
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    const proxiesCard = (await screen.findByRole('heading', { name: 'Pouvoirs' })).closest('section') as HTMLElement;
    const row = within(proxiesCard).getByText('Awa Kone').closest('tr') as HTMLElement;
    // Libellé canonique (formatLotLabel) : numéro de lot, type puis tantièmes.
    expect(within(row).getByText('ACA-A1 · Appartement · 100 tantièmes')).toBeTruthy();
    expect(within(row).getByText('Eric Mandataire')).toBeTruthy();

    // Saisie des votes : le lot du mandant est signalé comme représenté, avec
    // le nom du votant à la date de l'AG (repli sur l'owner ici, `voters` absent).
    expect(
      screen.getByText('ACA-A1 · Appartement · 100 tantièmes — Awa Kone · représenté par Eric Mandataire')
    ).toBeTruthy();
    expect(screen.getByText('Pouvoir : représenté par Eric Mandataire')).toBeTruthy();
    expect(screen.getByText(/ACA-A1 · Appartement · 100 tantièmes — Awa Kone : Pour \(représenté\)/)).toBeTruthy();

    fireEvent.click(within(proxiesCard).getByRole('button', { name: 'Ajouter un pouvoir' }));
    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith('/tenants/tenant-1/crm/contacts', { params: { page: 1, limit: 200 } })
    );
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un pouvoir' });
    const [grantorSelect, representativeSelect] = within(dialog).getAllByRole('combobox');
    // Mandants proposés : les copropriétaires des lots seulement, avec leur libellé de lot complet.
    expect(
      within(grantorSelect).getByRole('option', { name: 'Bakary Diallo (ACA-A2 · Appartement · 200 tantièmes)' })
    ).toBeTruthy();
    expect(within(grantorSelect).queryByRole('option', { name: 'Eric Mandataire' })).toBeNull();
    // Mandataires : tout contact de l'agence, y compris hors copropriété.
    expect(within(representativeSelect).getByRole('option', { name: 'Eric Mandataire' })).toBeTruthy();

    mockValidateFields.mockResolvedValueOnce({ grantorContactId: 'c2', representativeContactId: 'c5' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(`${DETAIL_URL}/pouvoirs`, {
        grantorContactId: 'c2',
        representativeContactId: 'c5'
      })
    );
    expect(mockMessage.success).toHaveBeenCalledWith('Pouvoir enregistré');
  });

  it('reprend formatLotLabel pour les votes : le titre du bien lié apparaît, comme sur les autres écrans du module syndic', async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === DETAIL_URL) {
        const meeting = buildMeeting('IN_PROGRESS');
        (meeting as any).syndicate = {
          lots: [{ ...LOTS[0], property: { title: 'Villa Les Cocotiers' } }, ...LOTS.slice(1)]
        };
        return { data: { success: true, data: meeting } };
      }
      if (url === '/tenants/tenant-1/crm/contacts') {
        return { data: { contacts: [] } };
      }
      throw new Error(`GET inattendu : ${url}`);
    });
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    // Avant ce correctif, le lot A1 n'affichait ni son type traduit ni le titre du bien lié dans les votes.
    expect(
      await screen.findByText(
        /ACA-A1 · Appartement · 100 tantièmes · Villa Les Cocotiers — Awa Kone : Pour \(représenté\)/
      )
    ).toBeTruthy();
  });

  it('retire un pouvoir et relaie le refus de l API', async () => {
    mockDetail('IN_PROGRESS');
    renderRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    const proxiesCard = (await screen.findByRole('heading', { name: 'Pouvoirs' })).closest('section') as HTMLElement;
    mockApi.delete.mockRejectedValueOnce({ response: { data: { error: 'Pouvoir introuvable ou inaccessible' } } });
    fireEvent.click(within(proxiesCard).getByRole('button', { name: 'Retirer' }));

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith(`${DETAIL_URL}/pouvoirs/proxy-1`));
    expect(mockMessage.error).toHaveBeenCalledWith('Pouvoir introuvable ou inaccessible');
  });
});
