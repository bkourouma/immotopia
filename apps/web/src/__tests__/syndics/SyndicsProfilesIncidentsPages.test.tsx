import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicProfilesIncidents } from '../../pages/syndics/SyndicProfilesIncidents';
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

  const formInstance = {
    validateFields: require('@jest/globals').jest.fn(),
    resetFields: require('@jest/globals').jest.fn(),
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

  return {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Form: FormComponent,
    Input: Object.assign(passthrough('input'), { TextArea: passthrough('textarea') }),
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
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/profils-incidents']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/profils-incidents" element={<SyndicProfilesIncidents />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Syndics profiles/incidents page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.includes('/profils/proprietaires')) {
        return Promise.resolve({ data: { success: true, data: [{ id: 'op-1', lotId: 'lot-1', contactId: 'c-1', ownershipPercentage: 100, ownedSince: '2026-01-01T00:00:00.000Z', portalAccessEnabled: true }] } });
      }
      if (url.includes('/profils/locataires')) {
        return Promise.resolve({ data: { success: true, data: [{ id: 'tp-1', lotId: 'lot-1', contactId: 'c-2', tenantSince: '2026-01-01T00:00:00.000Z', chargesBilledToTenant: false, isCurrent: true }] } });
      }
      if (url.includes('/incidents')) {
        return Promise.resolve({ data: { success: true, data: [{ id: 'i-1', incidentType: 'LEAK', urgency: 'HIGH', description: 'Fuite', status: 'REPORTED', imputations: [] }] } });
      }
      // The page loads lots, CRM contacts and properties in the same
      // Promise.all; any unhandled branch rejects the whole load and the page
      // renders its error state instead of the data asserted below.
      if (url.endsWith('/lots')) {
        return Promise.resolve({ data: { success: true, data: [{ id: 'lot-1', lotNumber: 'A-01', lotType: 'APARTMENT' }] } });
      }
      if (url.includes('/crm/contacts')) {
        return Promise.resolve({ data: { success: true, data: [], pagination: { total: 0 } } });
      }
      if (url.includes('/properties')) {
        return Promise.resolve({ data: { success: true, data: [], pagination: { total: 0 } } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('renders profiles and incidents', async () => {
    renderWithRoute();
    expect(await screen.findByText('Profils lot et incidents')).toBeTruthy();
    // The description shows both in the incidents table and in the imputation
    // modal's incident selector, so match all occurrences.
    expect((await screen.findAllByText('Fuite')).length).toBeGreaterThan(0);
  });

  it('shows imputation action for incidents', async () => {
    renderWithRoute();
    const button = await screen.findByText('Ajouter imputation');
    fireEvent.click(button);
    expect(button).toBeTruthy();
  });
});
