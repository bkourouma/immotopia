import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicMeetings } from '../../pages/syndics/SyndicMeetings';
import { SyndicMeetingDetail } from '../../pages/syndics/SyndicMeetingDetail';
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
      resetFields: require('@jest/globals').jest.fn(),
      setFieldsValue: require('@jest/globals').jest.fn(),
      setFieldValue: require('@jest/globals').jest.fn(),
      getFieldsValue: () => ({}),
      getFieldValue: () => undefined
    }
  ];
  FormComp.Item = passthrough();
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');
  return {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    DatePicker: passthrough('input'),
    TimePicker: passthrough('input'),
    Form: FormComp,
    Input: InputComp,
    Modal: passthrough(),
    Progress: passthrough(),
    Row: passthrough(),
    Select: passthrough('select'),
    Space: passthrough(),
    Spin: passthrough(),
    Statistic: ({ title, value }: any) => <div>{title}:{value}</div>,
    Table: ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>,
    Tag: passthrough('span'),
    Empty: passthrough(),
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span')
    },
    message: {
      success: require('@jest/globals').jest.fn(),
      error: require('@jest/globals').jest.fn()
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
    jest.clearAllMocks();
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
            lots: [{ id: 'lot-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100, createdAt: '', updatedAt: '' }]
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
});
