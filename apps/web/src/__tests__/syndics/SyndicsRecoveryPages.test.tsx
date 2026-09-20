import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicRecovery } from '../../pages/syndics/SyndicRecovery';
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
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  const mockForm = {
    validateFields: vi.fn(),
    resetFields: vi.fn(),
    setFieldsValue: vi.fn(),
    getFieldValue: vi.fn()
  };

  const FormComponent: any = passthrough('form');
  FormComponent.useForm = () => [mockForm];
  FormComponent.Item = passthrough();
  FormComponent.List = ({ children }: any) =>
    children([], {
      add: vi.fn(),
      remove: vi.fn()
    });

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    DatePicker: passthrough('input'),
    Form: FormComponent,
    Input: Object.assign(passthrough('input'), { TextArea: passthrough('textarea') }),
    InputNumber: passthrough('input'),
    Modal: passthrough(),
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
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span')
    },
    message: {
      success: vi.fn(),
      error: vi.fn()
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
  refreshMembership: async () => undefined
};

function renderWithRoute() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/recouvrement']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/recouvrement" element={<SyndicRecovery />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Syndics recovery page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/retards')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              items: [
                {
                  chargeCallId: 'charge-1',
                  lotId: 'lot-1',
                  lotNumber: 'A-01',
                  owner: { id: 'owner-1', firstName: 'Awa', lastName: 'Diop', email: 'awa@example.com' },
                  dueDate: '2026-02-01T00:00:00.000Z',
                  status: 'OVERDUE',
                  amount: 200000,
                  paid: 50000,
                  outstanding: 150000,
                  daysLate: 15
                }
              ],
              totals: {
                overdueCount: 1,
                overdueAmount: 150000
              }
            }
          }
        });
      }

      if (url.endsWith('/relances')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }

      if (url.endsWith('/penalites')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }

      // Loaded in the same Promise.all as the dashboard; a missing branch makes
      // the whole load reject and nothing renders.
      if (url.endsWith('/echeanciers')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }

      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('renders recovery dashboard with overdue item', async () => {
    renderWithRoute();
    expect(await screen.findByText('Recouvrement des impayés')).toBeTruthy();
    expect(await screen.findByText(/A-01/)).toBeTruthy();
  });

  it('runs reminder batch', async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        success: true,
        data: { processedCalls: 1, remindersCreated: 1, createdReminderIds: ['r-1'] }
      }
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Lancer batch relances'));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/relances/batch', {});
    });
  });
});
