import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicOwnerAccount } from '../../pages/syndics/SyndicOwnerAccount';
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
  const formInstance = {
    validateFields: vi.fn(),
    resetFields: vi.fn()
  };
  const Form: any = passthrough('form');
  Form.useForm = () => [formInstance];
  Form.Item = passthrough();
  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    Form,
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
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/lots/lot-1/compte']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte" element={<SyndicOwnerAccount />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Syndics owner account page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/compte')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'acc-1',
              lotId: 'lot-1',
              balance: 35000,
              currency: 'XOF',
              lot: { id: 'lot-1', lotNumber: 'A-01' },
              contact: { id: 'contact-1', firstName: 'Awa', lastName: 'Diop' }
            }
          }
        });
      }
      if (url.endsWith('/compte/transactions')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'tx-1',
                transactionDate: '2026-01-10T00:00:00.000Z',
                type: 'CHARGE_CALL',
                label: 'Appel',
                debit: 10000,
                credit: null,
                balanceAfter: 45000
              },
              {
                id: 'tx-2',
                transactionDate: '2026-01-20T00:00:00.000Z',
                type: 'PAYMENT',
                label: 'Paiement',
                debit: null,
                credit: 10000,
                balanceAfter: 35000
              }
            ]
          }
        });
      }
      if (url.endsWith('/compte/releve')) {
        return Promise.resolve({ data: new Blob(['pdf'], { type: 'application/pdf' }) });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('renders lot account and transactions', async () => {
    renderWithRoute();
    expect(await screen.findByText(/Compte du lot/)).toBeTruthy();
    expect(await screen.findByText(/A-01/)).toBeTruthy();
  });

  it('downloads statement', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    (window.URL as any).createObjectURL = createObjectURL;
    (window.URL as any).revokeObjectURL = revokeObjectURL;
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: any, options?: any) => {
      if (String(tagName).toLowerCase() === 'a') {
        return { click } as any;
      }
      return originalCreateElement(tagName, options);
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Télécharger le relevé'));

    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/lots/lot-1/compte/releve',
        expect.objectContaining({ responseType: 'blob' })
      );
    });

    createElement.mockRestore();
  });
});
