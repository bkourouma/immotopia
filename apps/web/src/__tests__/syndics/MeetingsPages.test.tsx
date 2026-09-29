import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import dayjs from 'dayjs';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';
import { SyndicMeetingDetail } from '../../pages/syndics/SyndicMeetingDetail';
import apiClient from '../../utils/api-client';

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
  // Vitest resolves named imports against the keys of this object, so the mock
  // must expose the real export names — a Proxy over {} declares none.
  const actual = await vi.importActual<Record<string, unknown>>('@ant-design/icons');
  const Icon = () => <span />;
  return Object.fromEntries(Object.keys(actual).map(name => [name, Icon]));
});

vi.mock('antd', async () => {
  // importActual reaches the real module from inside a hoisted mock factory;
  // a plain dynamic import here deadlocks the module graph.
  const React = await vi.importActual<typeof import('react')>('react');
  const mockValidateFields = vi.fn();
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);
  const FormComp: any = ({ children }: any) => <form>{children}</form>;
  // SyndicMeetingDetail calls setFieldsValue when the meeting loads; a form
  // instance missing it throws and aborts the render before resolutions appear.
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
  FormComp.Item = passthrough();
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');
  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    DatePicker: passthrough('input'),
    TimePicker: passthrough('input'),
    Form: FormComp,
    Input: InputComp,
    // Un passthrough n'aurait rendu aucun bouton OK : la validation du
    // formulaire « Créer une assemblée générale » se teste en cliquant dessus.
    Modal: ({ children, onOk, okText }: any) => (
      <div>
        {children}
        <button onClick={onOk}>{okText || 'OK'}</button>
      </div>
    ),
    // Les actions de statut et de pouvoir passent par une confirmation.
    Popconfirm: ({ children }: any) => <>{children}</>,
    Progress: passthrough(),
    Row: passthrough(),
    Select: passthrough('select'),
    Space: passthrough(),
    Spin: passthrough(),
    Statistic: ({ title, value }: any) => (
      <div>
        {title}:{value}
      </div>
    ),
    Table: ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>,
    Tag: passthrough('span'),
    Empty: passthrough(),
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span')
    },
    message: {
      success: vi.fn(),
      error: vi.fn()
    },
    __mocks: { mockValidateFields }
  };
  const appApi = {
    message: antdMock.message ?? { success() {}, error() {}, warning() {}, info() {}, loading() {} },
    modal: { confirm() {}, info() {}, warning() {}, error() {}, success() {} },
    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} }
  };
  return {
    ...antdMock,
    App: { useApp: () => appApi },
    // Aucun palier actif : le rendu par defaut des tests est le mobile.
    Grid: { useBreakpoint: () => ({}) }
  };
});

// Vitest has no `requireMock`; importing the module inside a mocked test file
// already yields the mock, so a plain dynamic import is the equivalent.
const antdModule = (await import('antd')) as unknown as { __mocks: { mockValidateFields: any }; message: any };
const mockValidateFields = antdModule.__mocks.mockValidateFields;
const mockMessage = antdModule.message;

const mockApiClient = apiClient as any;

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

function renderWithRoute(route: string) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/assemblees" element={<SyndicMeetings />} />
          <Route path="/tenant/:tenantId/syndics/:syndicId/assemblees/:meetingId" element={<SyndicMeetingDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Meetings pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders meetings list', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 'meeting-1',
            syndicateId: 'syndic-1',
            type: 'ORDINARY',
            scheduledAt: '2026-06-20T09:00:00.000Z',
            status: 'PLANNED',
            quorum: 0,
            createdAt: '',
            updatedAt: ''
          }
        ]
      }
    } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/assemblees');

    expect(await screen.findByText('Assemblées générales')).toBeTruthy();
    expect(await screen.findByText(/meeting-1|ORDINARY/)).toBeTruthy();
  });

  it('renders meeting detail with quorum and resolutions', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 'meeting-1',
          syndicateId: 'syndic-1',
          type: 'ORDINARY',
          scheduledAt: '2026-06-20T09:00:00.000Z',
          status: 'PLANNED',
          quorum: 66.67,
          createdAt: '',
          updatedAt: '',
          resolutions: [
            {
              id: 'res-1',
              meetingId: 'meeting-1',
              title: 'Validation budget',
              votesFor: 2,
              votesAgainst: 1,
              votesAbstain: 0,
              sharesFor: 200,
              result: 'APPROVED',
              createdAt: '',
              updatedAt: ''
            }
          ],
          syndicate: {
            lots: [
              { id: 'lot-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100, createdAt: '', updatedAt: '' }
            ]
          }
        }
      }
    } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/assemblees/meeting-1');

    expect(await screen.findByText('Détail assemblée générale')).toBeTruthy();
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/assemblees/meeting-1');
    });
    const titles = await screen.findAllByText(/Validation budget/);
    expect(titles.length).toBeGreaterThan(0);
  });

  // Écart recette #1 : le DatePicker showTime unique dépassait de la fenêtre
  // sur mobile, bouton OK masqué. La modale sépare désormais Date et Heure
  // de début (obligatoire) — handleCreate les recombine en `scheduledAt`.
  it('crée une assemblée en combinant la date et l’heure de début', async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } } as never);
    mockApiClient.post.mockResolvedValueOnce({
      data: { success: true, data: { id: 'meeting-2' } }
    } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/assemblees');
    fireEvent.click(await screen.findByText('Nouvelle assemblée'));

    mockValidateFields.mockResolvedValueOnce({
      type: 'ORDINARY',
      // Composants naïfs (heure locale, sans « Z ») : seuls .hour()/.minute()
      // sont lus sur startTime/endTime, la date vient uniquement de `date`.
      date: dayjs('2026-10-15'),
      startTime: dayjs('2000-01-01 09:30'),
      endTime: dayjs('2000-01-01 11:00'),
      location: 'Salle commune'
    });

    fireEvent.click(await screen.findByText('Créer'));

    await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());
    const [, payload] = mockApiClient.post.mock.calls[0];
    expect(payload.scheduledAt).toBe(payload.startTime);
    expect(dayjs(payload.scheduledAt).format('YYYY-MM-DD HH:mm')).toBe('2026-10-15 09:30');
    expect(dayjs(payload.endTime).format('YYYY-MM-DD HH:mm')).toBe('2026-10-15 11:00');
  });

  it("refuse une heure de fin antérieure ou égale à l'heure de début", async () => {
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/assemblees');
    fireEvent.click(await screen.findByText('Nouvelle assemblée'));

    mockValidateFields.mockResolvedValueOnce({
      type: 'ORDINARY',
      date: dayjs('2026-10-15'),
      startTime: dayjs('2000-01-01 11:00'),
      endTime: dayjs('2000-01-01 09:30'),
      location: 'Salle commune'
    });

    fireEvent.click(await screen.findByText('Créer'));

    await waitFor(() => expect(mockMessage.error).toHaveBeenCalledWith("L'heure de fin doit suivre l'heure de début"));
    expect(mockApiClient.post).not.toHaveBeenCalled();
  });
});
