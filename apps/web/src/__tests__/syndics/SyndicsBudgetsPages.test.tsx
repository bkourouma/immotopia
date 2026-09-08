import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';
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
    resetFields: vi.fn(),
    setFieldsValue: vi.fn()
  };

  const FormComponent: any = passthrough('form');
  FormComponent.useForm = () => [formInstance];
  FormComponent.Item = passthrough();

  const Table = ({ dataSource, columns }: any) => (
    <div>
      {(dataSource || []).map((row: any, index: number) => (
        <div key={row.id || index}>
          {(columns || []).map((column: any, colIndex: number) => {
            const value = column.dataIndex ? row[column.dataIndex] : undefined;
            const content = column.render ? column.render(value, row, index) : value;
            return <div key={colIndex}>{content}</div>;
          })}
        </div>
      ))}
    </div>
  );

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Form: FormComponent,
    Input: passthrough('input'),
    InputNumber: passthrough('input'),
    Modal: passthrough(),
    Select: passthrough('select'),
    Space: passthrough(),
    Spin: passthrough(),
    Table,
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
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/budgets']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/budgets" element={<SyndicBudgets />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Syndics budgets page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/budgets')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'budget-1',
                fiscalYear: 2026,
                label: 'Budget 2026',
                totalAmount: 1000000,
                status: 'DRAFT',
                allocations: [{ id: 'alloc-1' }],
                currency: 'XOF'
              }
            ]
          }
        });
      }
      if (url.endsWith('/charges/batch')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'batch-1',
                label: 'Batch Q2',
                period: '2026-Q2',
                dueDate: '2026-04-30T00:00:00.000Z',
                batchType: 'REGULAR',
                totalAmount: 1000000,
                chargeCalls: [{ id: 'c1' }],
                status: 'SENT'
              }
            ]
          }
        });
      }
      // The page also loads lots in the same Promise.all; without this branch
      // the mock rejects and the page renders its error state instead of data.
      if (url.endsWith('/lots')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('renders budgets and batches', async () => {
    renderWithRoute();
    expect(await screen.findByText("Budgets et batches d'appels")).toBeTruthy();
    expect(await screen.findByText('Budget 2026')).toBeTruthy();
  });

  it('approves a budget', async () => {
    mockApiClient.patch.mockResolvedValue({
      data: {
        success: true,
        data: { id: 'budget-1', status: 'APPROVED' }
      }
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Approuver'));

    await waitFor(() => {
      expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/budgets/budget-1', {
        status: 'APPROVED'
      });
    });
  });
});
