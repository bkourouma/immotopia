import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicAccounting } from '../../pages/syndics/SyndicAccounting';
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
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  const formInstance = {
    validateFields: vi.fn(),
    resetFields: vi.fn()
  };

  const FormComponent: any = passthrough('form');
  FormComponent.useForm = () => [formInstance];
  FormComponent.Item = passthrough();
  FormComponent.List = ({ children }: any) =>
    children([], {
      add: vi.fn(),
      remove: vi.fn()
    });

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
    Col: passthrough(),
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
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/comptabilite']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/comptabilite" element={<SyndicAccounting />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Syndics accounting page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/comptabilite/comptes')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'acc-1',
                accountNumber: '401',
                accountName: 'Fournisseurs',
                accountClass: 4,
                accountType: 'LIABILITY',
                isActive: true
              }
            ]
          }
        });
      }
      if (url.endsWith('/comptabilite/journaux')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [{ id: 'journal-1', code: 'JG', label: 'Journal general', fiscalYear: 2026 }]
          }
        });
      }
      if (url.endsWith('/comptabilite/ecritures')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'entry-1',
                journalId: 'journal-1',
                entryDate: '2026-03-01T00:00:00.000Z',
                reference: 'JE-001',
                description: 'Ecriture test',
                sourceType: 'MANUAL',
                isLocked: false,
                journal: { code: 'JG' }
              }
            ]
          }
        });
      }
      if (url.endsWith('/comptabilite/balance')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              items: [
                {
                  accountId: 'acc-1',
                  accountNumber: '401',
                  accountName: 'Fournisseurs',
                  totalDebit: 10000,
                  totalCredit: 10000,
                  balance: 0
                }
              ],
              totals: { totalDebit: 10000, totalCredit: 10000, isBalanced: true }
            }
          }
        });
      }
      if (url.endsWith('/comptabilite/grand-livre')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'line-1',
                debit: 10000,
                credit: 0,
                account: { accountNumber: '401' },
                entry: { reference: 'JE-001', entryDate: '2026-03-01T00:00:00.000Z' }
              }
            ]
          }
        });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('renders accounting dashboard', async () => {
    renderWithRoute();
    expect(await screen.findByText('Comptabilité syndic')).toBeTruthy();
    expect(await screen.findByText('401 - Fournisseurs')).toBeTruthy();
  });

  it('locks an entry', async () => {
    mockApiClient.patch.mockResolvedValue({
      data: {
        success: true,
        data: { id: 'entry-1', isLocked: true }
      }
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Verrouiller'));

    await waitFor(() => {
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/comptabilite/ecritures/entry-1/verrouiller',
        { lock: true }
      );
    });
  });
});
