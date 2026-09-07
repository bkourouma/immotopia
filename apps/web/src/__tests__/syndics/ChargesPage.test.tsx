import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import dayjs from 'dayjs';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';
import apiClient from '../../utils/api-client';

jest.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: require('@jest/globals').jest.fn(),
    post: require('@jest/globals').jest.fn(),
    patch: require('@jest/globals').jest.fn(),
    delete: require('@jest/globals').jest.fn(),
  },
}));

jest.mock('../../components/dashboard/dashboard-layout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@ant-design/icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('antd', () => {
  const React = require('react');
  const mockValidateFields = require('@jest/globals').jest.fn();
  const mockResetFields = require('@jest/globals').jest.fn();
  const mockSetFieldsValue = require('@jest/globals').jest.fn();
  const mockMessageSuccess = require('@jest/globals').jest.fn();
  const mockMessageError = require('@jest/globals').jest.fn();
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

  const Table = ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>;

  return {
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
    Table,
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
    },
  };
});

const { __mocks } = jest.requireMock('antd') as {
  __mocks: {
    mockValidateFields: jest.Mock;
    mockResetFields: jest.Mock;
    mockSetFieldsValue: jest.Mock;
    mockMessageSuccess: jest.Mock;
    mockMessageError: jest.Mock;
  };
};
const mockValidateFields = __mocks.mockValidateFields;
const mockResetFields = __mocks.mockResetFields;
const mockSetFieldsValue = __mocks.mockSetFieldsValue;
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
  clearError: jest.fn(),
  refreshMembership: async () => undefined
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

describe('SyndicCharges page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders charge calls with statuses', async () => {
    mockApiClient.get.mockImplementation((url: string, config?: any) => {
      if (url === '/tenants/tenant-1/syndics/syndic-1') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'syndic-1',
              tenantId: 'tenant-1',
              name: 'Residence Test',
              address: 'Dakar',
              totalLots: 2,
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
          data: { success: true, data: [{ id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100, createdAt: '', updatedAt: '' }] }
        });
      }
      if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
        if (config?.params?.status === 'OVERDUE') {
          return Promise.resolve({
            data: {
              success: true,
              data: [{ id: 'charge-overdue', lotId: 'lot-1', syndicateId: 'syndic-1', period: '2026-Q1', amount: 70000, currency: 'XOF', dueDate: '2026-01-10T00:00:00.000Z', status: 'OVERDUE', createdAt: '', updatedAt: '' }]
            }
          });
        }
        return Promise.resolve({
          data: {
            success: true,
            data: [
              { id: 'charge-1', lotId: 'lot-1', syndicateId: 'syndic-1', period: '2026-Q2', amount: 100000, currency: 'XOF', dueDate: '2026-06-10T00:00:00.000Z', status: 'PENDING', createdAt: '', updatedAt: '' },
              { id: 'charge-2', lotId: 'lot-1', syndicateId: 'syndic-1', period: '2026-Q1', amount: 70000, currency: 'XOF', dueDate: '2026-01-10T00:00:00.000Z', status: 'OVERDUE', createdAt: '', updatedAt: '' }
            ]
          }
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    renderWithRoute();

    expect(await screen.findByText(/Charges de Residence Test/)).toBeTruthy();
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/charges', { params: { status: undefined, period: undefined } });
    });
    expect(await screen.findByText(/2026-Q2/)).toBeTruthy();
    expect(await screen.findByText(/PENDING/)).toBeTruthy();
    expect(await screen.findByText(/OVERDUE/)).toBeTruthy();
  });

  it('creates a new charge call from modal form', async () => {
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
              totalLots: 2,
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
          data: { success: true, data: [{ id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100, createdAt: '', updatedAt: '' }] }
        });
      }
      if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
    mockApiClient.post.mockResolvedValue({ data: { success: true, data: { id: 'charge-10' } } } as never);
    (mockValidateFields as any).mockResolvedValue({
      targetMode: 'single',
      lotId: 'lot-1',
      periodStart: dayjs('2026-07-01T00:00:00.000Z'),
      periodEnd: dayjs('2026-09-30T00:00:00.000Z'),
      amount: 85000,
      currency: 'XOF',
      dueDate: dayjs('2026-07-15T00:00:00.000Z')
    });

    renderWithRoute();

    const createButton = await screen.findByText('Créer');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/charges',
        expect.objectContaining({
          lotId: 'lot-1',
          period: '2026-07-01 au 2026-09-30',
          amount: 85000,
          currency: 'XOF',
          dueDate: '2026-07-15T00:00:00.000Z'
        })
      );
    });
    expect(mockMessageSuccess).toHaveBeenCalled();
  });
});
