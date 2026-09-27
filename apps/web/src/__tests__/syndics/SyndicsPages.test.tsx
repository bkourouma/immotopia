import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicsList } from '../../pages/syndics/SyndicsList';
import { SyndicDetail } from '../../pages/syndics/SyndicDetail';
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
  const jestObject = vi;
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  const Table = ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>;
  const UploadComp: any = ({ children }: any) => <div>{children}</div>;
  UploadComp.LIST_IGNORE = 'ignore';
  const FormComp: any = ({ children }: any) => <form>{children}</form>;
  FormComp.useForm = () => [
    { validateFields: jestObject.fn(), resetFields: jestObject.fn(), setFieldsValue: jestObject.fn() }
  ];
  FormComp.Item = passthrough();
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');
  const DescriptionsComp: any = passthrough();
  DescriptionsComp.Item = passthrough();
  const Typography = {
    Title: passthrough('h1'),
    Paragraph: passthrough('p'),
    Text: passthrough('span')
  };

  const SkeletonComp: any = passthrough('div');
  SkeletonComp.Input = passthrough('span');
  SkeletonComp.Button = passthrough('span');

  // `<SyndicateCard>` passe son bouton « Supprimer » via `actions` (et non
  // `children`) : un simple passthrough le perdrait, comme pour `extra` dans
  // `SyndicDetailEdit.test.tsx`.
  const CardComp: any = ({ children, title, extra, actions }: any) => (
    <div>
      {title}
      {extra}
      {children}
      {actions}
    </div>
  );

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: CardComp,
    Col: passthrough(),
    DatePicker: passthrough('input'),
    Descriptions: DescriptionsComp,
    Dropdown: passthrough(),
    // La vraie `<Empty>` rend `description` (pas seulement `children`) : la
    // recopier ici, sinon l'état vide de `<StateBlock>` (§ primitives) perd
    // son texte « Aucune donnée » sous ce mock.
    Empty: ({ description, children, ...props }: any) => React.createElement('div', props, description, children),
    Form: FormComp,
    Input: InputComp,
    InputNumber: passthrough('input'),
    Modal: passthrough(),
    Pagination: passthrough(),
    Result: passthrough(),
    Row: passthrough(),
    Select: passthrough('select'),
    Skeleton: SkeletonComp,
    Space: passthrough(),
    Spin: passthrough(),
    Statistic: ({ title, value }: any) => (
      <div>
        <span>{title}</span>
        <span>{value}</span>
      </div>
    ),
    Table,
    Tag: passthrough('span'),
    // Passthrough minimal : le `title` (texte d'infobulle) atterrit comme
    // attribut DOM sur le `<span>`, suffisant pour l'assertion du bouton
    // « Supprimer » desactive (ecart recette #8) sans simuler le survol reel.
    Tooltip: passthrough('span'),
    Typography,
    Upload: UploadComp,
    message: {
      success: jestObject.fn(),
      error: jestObject.fn()
    }
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
    tenant: {
      id: 'tenant-1',
      name: 'Tenant Demo',
      slug: 'tenant-demo'
    },
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

function renderWithAuthAndRoute(route: string, element: React.ReactElement) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics" element={<SyndicsList />} />
          <Route path="/tenant/:tenantId/syndics/:syndicId" element={<SyndicDetail />} />
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Syndics pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders syndics list from API', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 'syndic-1',
            tenantId: 'tenant-1',
            name: 'Résidence Les Palmiers',
            address: 'Abidjan Cocody',
            totalLots: 12,
            totalBuildings: 2,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _count: { lots: 12, chargeCalls: 0 }
          }
        ]
      }
    } as never);

    renderWithAuthAndRoute('/tenant/tenant-1/syndics', <SyndicsList />);

    expect(await screen.findByText('Copropriétés')).toBeTruthy();
    expect(await screen.findByText('Résidence Les Palmiers')).toBeTruthy();
    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics');
  });

  it('désactive « Supprimer » quand la liste sait déjà que la copropriété n’est pas vide (écart recette #8)', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 'syndic-pleine',
            tenantId: 'tenant-1',
            name: 'Résidence Pleine',
            address: 'Abidjan Cocody',
            totalLots: 4,
            totalBuildings: 1,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _count: {
              lots: 4,
              chargeCalls: 0,
              budgets: 0,
              generalMeetings: 0,
              documents: 0,
              serviceContracts: 0,
              incidents: 0
            }
          },
          {
            id: 'syndic-vide',
            tenantId: 'tenant-1',
            name: 'Résidence Vide',
            address: 'Abidjan Cocody',
            totalLots: 0,
            totalBuildings: 1,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            _count: {
              lots: 0,
              chargeCalls: 0,
              budgets: 0,
              generalMeetings: 0,
              documents: 0,
              serviceContracts: 0,
              incidents: 0
            }
          }
        ]
      }
    } as never);

    renderWithAuthAndRoute('/tenant/tenant-1/syndics', <SyndicsList />);

    await screen.findByText('Résidence Pleine');
    const deleteButtons = screen.getAllByText('Supprimer').map(node => node.closest('button')) as HTMLButtonElement[];

    // Résidence Pleine (4 lots) : bouton désactivé, une seule copropriété vide
    // active le sien.
    expect(deleteButtons.some(button => button.disabled)).toBe(true);
    expect(deleteButtons.some(button => !button.disabled)).toBe(true);
  });

  it('renders syndicate detail with lots, its building and its charge calls', async () => {
    // `<SyndicDetail>` charge désormais la copropriété ET la liste complète des
    // appels de charges (`listAllChargeCalls`, même service que la Trésorerie),
    // en parallèle : deux appels HTTP distincts, routés par URL plutôt que par
    // ordre pour ne pas dépendre de la façon dont `Promise.all` les déclenche.
    mockApiClient.get.mockImplementation((url: string) => {
      if (url === '/tenants/tenant-1/syndics/syndic-1') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'syndic-1',
              tenantId: 'tenant-1',
              name: 'Résidence Les Palmiers',
              address: 'Abidjan Cocody',
              totalLots: 12,
              totalBuildings: 1,
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              // Le bien IMMEUBLE lié au syndic — vérifié par appel direct à
              // l'API réelle, absent du type `Syndicate` avant ce lot.
              property: {
                id: 'prop-1',
                title: 'Immeuble R+3 Les Palmiers',
                address: 'Abidjan Cocody, rue des Palmiers',
                typeSpecificData: { floors_count: 3, units_count: 12, parking_spaces: 6 }
              },
              lots: [
                {
                  id: 'lot-1',
                  syndicateId: 'syndic-1',
                  lotNumber: 'A-101',
                  lotType: 'APARTMENT',
                  generalShares: 120,
                  specialShares: null,
                  ownerContactId: null,
                  propertyId: null,
                  ownerSince: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }
              ],
              chargeCalls: [{ id: 'charge-1' }],
              funds: []
            }
          }
        } as never);
      }
      if (url === '/tenants/tenant-1/syndic-mandating-agencies') {
        return Promise.resolve({ data: { success: true, data: [] } } as never);
      }
      if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'charge-aaaaaaaa1111',
                syndicateId: 'syndic-1',
                lotId: 'lot-1',
                period: '2026-T1',
                amount: 203450,
                currency: 'XOF',
                dueDate: '2026-03-15T00:00:00.000Z',
                status: 'PAID',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                lot: {
                  id: 'lot-1',
                  lotNumber: 'A-101',
                  property: null,
                  owner: { id: 'owner-1', firstName: 'Fabrice', lastName: 'Aka' }
                },
                payments: [
                  {
                    id: 'pay-1',
                    chargeCallId: 'charge-aaaaaaaa1111',
                    amount: 203450,
                    paidAt: '2026-03-10T00:00:00.000Z',
                    method: 'Wave'
                  }
                ]
              }
            ]
          }
        } as never);
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    const { container } = renderWithAuthAndRoute('/tenant/tenant-1/syndics/syndic-1', <SyndicDetail />);

    const names = await screen.findAllByText('Résidence Les Palmiers');
    expect(names.length).toBeGreaterThan(0);
    // « A-101 » apparaît deux fois : dans le tableau des lots (LotTable) et
    // dans la carte du tableau des appels de charges qui cite ce même lot.
    expect((await screen.findAllByText(/A-101/)).length).toBeGreaterThan(0);

    // Tableau « Détail des bâtiments » : le bien IMMEUBLE du syndic, avec ses
    // caractéristiques déclarées (typeSpecificData).
    expect(await screen.findByText('Immeuble R+3 Les Palmiers')).toBeTruthy();

    // Tableau « Détail des appels de charges » : montant en FCFA, jamais XOF —
    // `<MoneyValue>` est seul responsable de l'affichage de la devise.
    expect(await screen.findByText(/Fabrice Aka/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/XOF/);
    // Le montant appelé ET le payé valent 203 450 (charge soldée) : deux
    // occurrences du même texte formaté.
    expect((await screen.findAllByText(/203\s450\sFCFA/)).length).toBeGreaterThan(0);

    // Les boutons de navigation vers les autres écrans Syndic ont disparu : la
    // barre d'onglets de `<SyndicWorkspaceLayout>` les remplace.
    expect(screen.queryByText('Retour à la liste')).not.toBeInTheDocument();
    expect(screen.queryByText('Gérer les lots')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1');
    });
  });

  it('shows an empty state for the buildings table when the syndicate has no linked property', async () => {
    mockApiClient.get.mockImplementation((url: string) => {
      if (url === '/tenants/tenant-1/syndics/syndic-1') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'syndic-1',
              tenantId: 'tenant-1',
              name: 'Résidence Les Rôniers',
              address: 'Bingerville',
              totalLots: 8,
              totalBuildings: 1,
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              property: null,
              lots: [],
              chargeCalls: [],
              funds: []
            }
          }
        } as never);
      }
      if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
        return Promise.resolve({ data: { success: true, data: [] } } as never);
      }
      if (url === '/tenants/tenant-1/syndic-mandating-agencies') {
        return Promise.resolve({ data: { success: true, data: [] } } as never);
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    renderWithAuthAndRoute('/tenant/tenant-1/syndics/syndic-1', <SyndicDetail />);

    expect(await screen.findAllByText('Résidence Les Rôniers')).toBeTruthy();
    expect((await screen.findAllByText('Aucune donnée')).length).toBeGreaterThan(0);
  });
});
