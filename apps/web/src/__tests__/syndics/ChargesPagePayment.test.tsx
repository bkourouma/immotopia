import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import dayjs from 'dayjs';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';
import apiClient from '../../utils/api-client';

// FR-005 : l'ecran des appels de charges (SyndicCharges) doit permettre
// d'enregistrer un paiement contre un appel, ce qu'aucun ecran ne faisait
// auparavant (voir docs/recette/SCENARIO_SYNDIC_MODULES.md, annexe #1).
// `ChargeCallTable` est mocke ici pour exposer directement le callback
// `onRecordPayment` par un simple bouton : le mock partage d'antd `Table`
// (voir ChargesPage.test.tsx) se contente de serialiser `dataSource` et
// n'invoque jamais les fonctions `render` des colonnes, donc jamais le vrai
// bouton "Enregistrer un paiement" de la table.
vi.mock('../../components/syndics/ChargeCallTable', () => ({
  ChargeCallTable: ({ items, onRecordPayment }: any) => (
    <div>
      {items.map((item: any) => (
        <button key={item.id} onClick={() => onRecordPayment?.(item)}>
          Payer {item.id}
        </button>
      ))}
    </div>
  )
}));

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

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const mockValidateFields = vi.fn();
  const mockResetFields = vi.fn();
  const mockSetFieldsValue = vi.fn();
  const mockMessageSuccess = vi.fn();
  const mockMessageError = vi.fn();
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  const FormComp: any = ({ children }: any) => <form>{children}</form>;
  FormComp.useForm = () => [
    {
      validateFields: mockValidateFields,
      resetFields: mockResetFields,
      setFieldsValue: mockSetFieldsValue
    }
  ];
  FormComp.Item = passthrough();
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: ({ children, onClick, disabled }: any) => (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Card: passthrough(),
    Col: passthrough(),
    DatePicker: passthrough('input'),
    Form: FormComp,
    Input: InputComp,
    InputNumber: passthrough('input'),
    Modal: ({ children, onOk, okText }: any) => (
      <div>
        {children}
        <button onClick={onOk}>{okText || 'OK'}</button>
      </div>
    ),
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
    Table: ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>,
    Tag: passthrough('span'),
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span')
    },
    message: {
      success: mockMessageSuccess,
      error: mockMessageError
    },
    __mocks: {
      mockValidateFields,
      mockResetFields,
      mockSetFieldsValue,
      mockMessageSuccess,
      mockMessageError
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
    Grid: { useBreakpoint: () => ({}) }
  };
});

const { __mocks } = (await import('antd')) as unknown as {
  __mocks: {
    mockValidateFields: Mock;
    mockResetFields: Mock;
    mockSetFieldsValue: Mock;
    mockMessageSuccess: Mock;
    mockMessageError: Mock;
  };
};
const mockValidateFields = __mocks.mockValidateFields;
const mockMessageSuccess = __mocks.mockMessageSuccess;
const mockMessageError = __mocks.mockMessageError;

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

function renderWithRoute() {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

function mockBaseGets() {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url === '/tenants/tenant-1/syndics/syndic-1') {
      return Promise.resolve({
        data: {
          success: true,
          data: {
            id: 'syndic-1',
            tenantId: 'tenant-1',
            name: 'Residence Test',
            address: 'Dakar',
            totalLots: 1,
            totalBuildings: 1,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
    if (url === '/tenants/tenant-1/syndics/syndic-1/lots') {
      return Promise.resolve({
        data: {
          success: true,
          data: [
            {
              id: 'lot-1',
              syndicateId: 'syndic-1',
              lotNumber: 'A-01',
              lotType: 'APARTMENT',
              generalShares: 100,
              createdAt: '',
              updatedAt: ''
            }
          ]
        }
      });
    }
    if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
      return Promise.resolve({
        data: {
          success: true,
          data: [
            {
              id: 'charge-1',
              lotId: 'lot-1',
              syndicateId: 'syndic-1',
              period: '2026-Q2',
              amount: 100000,
              currency: 'XOF',
              dueDate: '2026-06-10T00:00:00.000Z',
              status: 'PARTIAL',
              payments: [{ id: 'payment-0', chargeCallId: 'charge-1', amount: 30000, paidAt: '2026-06-01T00:00:00.000Z' }],
              createdAt: '',
              updatedAt: ''
            }
          ]
        }
      });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

describe('SyndicCharges page — enregistrement de paiement (FR-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a payment against a charge call and refreshes the list', async () => {
    mockBaseGets();
    mockApiClient.post.mockResolvedValue({
      data: { success: true, data: { id: 'payment-1', chargeCallId: 'charge-1', amount: 50000 } }
    } as never);
    (mockValidateFields as any).mockResolvedValue({
      amount: 50000,
      paidAt: dayjs('2026-06-05T00:00:00.000Z'),
      method: 'VIREMENT',
      reference: 'REF-001'
    });

    renderWithRoute();

    const payButton = await screen.findByText('Payer charge-1');
    fireEvent.click(payButton);

    const submitButton = await screen.findByText('Enregistrer');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/charges/charge-1/pay',
        expect.objectContaining({
          amount: 50000,
          paidAt: '2026-06-05T00:00:00.000Z',
          method: 'VIREMENT',
          reference: 'REF-001'
        })
      );
    });
    expect(mockMessageSuccess).toHaveBeenCalled();
  });

  it('surfaces the API error message when the payment exceeds the outstanding balance', async () => {
    mockBaseGets();
    mockApiClient.post.mockRejectedValue({
      response: {
        data: { error: 'Le paiement (90000 XOF) depasse le reste a payer de cet appel de charges (70000 XOF)' }
      }
    } as never);
    (mockValidateFields as any).mockResolvedValue({
      amount: 90000,
      paidAt: dayjs('2026-06-05T00:00:00.000Z'),
      method: 'VIREMENT'
    });

    renderWithRoute();

    const payButton = await screen.findByText('Payer charge-1');
    fireEvent.click(payButton);

    const submitButton = await screen.findByText('Enregistrer');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith(
        expect.stringContaining('depasse le reste a payer')
      );
    });
  });
});
