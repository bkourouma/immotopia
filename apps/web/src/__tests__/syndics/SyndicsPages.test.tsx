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

vi.mock('../../components/dashboard/dashboard-layout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
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

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    DatePicker: passthrough('input'),
    Descriptions: DescriptionsComp,
    Empty: passthrough(),
    Form: FormComp,
    Input: InputComp,
    InputNumber: passthrough('input'),
    Modal: passthrough(),
    Row: passthrough(),
    Select: passthrough('select'),
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
    Typography,
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
  refreshMembership: async () => undefined
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

  it('renders syndicate detail with lots', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 'syndic-1',
          tenantId: 'tenant-1',
          name: 'Résidence Les Palmiers',
          address: 'Abidjan Cocody',
          totalLots: 12,
          totalBuildings: 2,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
          chargeCalls: [],
          funds: []
        }
      }
    } as never);

    renderWithAuthAndRoute('/tenant/tenant-1/syndics/syndic-1', <SyndicDetail />);

    const names = await screen.findAllByText('Résidence Les Palmiers');
    expect(names.length).toBeGreaterThan(0);
    expect(await screen.findByText(/A-101/)).toBeTruthy();

    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1');
    });
  });
});
