import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicRecovery } from '../../pages/syndics/SyndicRecovery';
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
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  const mockForm = {
    validateFields: require('@jest/globals').jest.fn(),
    resetFields: require('@jest/globals').jest.fn(),
    setFieldsValue: require('@jest/globals').jest.fn(),
    getFieldValue: require('@jest/globals').jest.fn(),
  };

  const FormComponent: any = passthrough('form');
  FormComponent.useForm = () => [mockForm];
  FormComponent.Item = passthrough();
  FormComponent.List = ({ children }: any) =>
    children([], {
      add: require('@jest/globals').jest.fn(),
      remove: require('@jest/globals').jest.fn(),
    });

  return {
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
    Statistic: ({ title, value }: any) => <div>{title}:{value}</div>,
    Table: ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>,
    Tag: passthrough('span'),
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span'),
    },
    message: {
      success: require('@jest/globals').jest.fn(),
      error: require('@jest/globals').jest.fn(),
    },
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
    updatedAt: new Date().toISOString(),
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE',
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: jest.fn(),
  refreshMembership: async () => undefined,
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
    jest.clearAllMocks();
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
                  daysLate: 15,
                },
              ],
              totals: {
                overdueCount: 1,
                overdueAmount: 150000,
              },
            },
          },
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
        data: { processedCalls: 1, remindersCreated: 1, createdReminderIds: ['r-1'] },
      },
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Lancer batch relances'));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/relances/batch', {});
    });
  });
});
