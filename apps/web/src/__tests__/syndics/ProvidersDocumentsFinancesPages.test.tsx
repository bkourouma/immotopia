import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicProviders } from '../../pages/syndics/SyndicProviders';
import { SyndicDocuments } from '../../pages/syndics/SyndicDocuments';
import { SyndicFinances } from '../../pages/syndics/SyndicFinances';
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
  // SyndicProviders and SyndicDocuments call Form.useForm() at render time, so
  // the mock must expose the full antd surface these pages import, not just the
  // layout primitives.
  const Form: any = passthrough('form');
  Form.useForm = () => [{ resetFields() {}, setFieldsValue() {}, validateFields: async () => ({}) }];
  Form.Item = passthrough();

  const Upload: any = passthrough();
  Upload.Dragger = passthrough();

  const Modal: any = ({ children, open }: any) => (open ? React.createElement('div', null, children) : null);

  return {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    Row: passthrough(),
    DatePicker: passthrough('input'),
    Form,
    Input: passthrough('input'),
    InputNumber: passthrough('input'),
    Modal,
    Select: passthrough('select'),
    Space: passthrough(),
    Spin: passthrough(),
    Statistic: ({ title, value }: any) => <div>{title}:{value}</div>,
    Table: ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>,
    Tag: passthrough('span'),
    Upload,
    message: { success() {}, error() {}, warning() {}, info() {} },
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span'),
      Link: passthrough('a')
    }
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
          <Route path="/tenant/:tenantId/syndics/:syndicId/prestataires" element={<SyndicProviders />} />
          <Route path="/tenant/:tenantId/syndics/:syndicId/documents" element={<SyndicDocuments />} />
          <Route path="/tenant/:tenantId/syndics/:syndicId/finances" element={<SyndicFinances />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Providers/Documents/Finances pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders providers page', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          providers: [{ id: 'p1', name: 'Nettoyage Plus' }],
          contracts: [{ id: 'c1', nature: 'Entretien', status: 'ACTIVE' }],
          commonAssets: [{ id: 'a1', name: 'Ascenseur' }]
        }
      }
    } as never);
    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/prestataires');
    expect(await screen.findByText('Prestataires et contrats')).toBeTruthy();
    expect(await screen.findByText(/Nettoyage Plus/)).toBeTruthy();
  });

  it('renders documents page', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: 'd1', title: 'Reglement', type: 'REGULATION', fileUrl: 'https://example.com/reglement.pdf' }]
      }
    } as never);
    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/documents');
    expect(await screen.findByText('Coffre documentaire')).toBeTruthy();
    expect(await screen.findByText(/Reglement/)).toBeTruthy();
  });

  it('renders finances page', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          funds: [{ id: 'f1', name: 'Fonds travaux', balance: 1000000, currency: 'XOF' }],
          totals: {
            totalFundsBalance: 1000000,
            totalCalled: 350000,
            totalPaid: 300000,
            totalOutstanding: 50000,
            overdueCount: 1,
            overdueAmount: 50000
          }
        }
      }
    } as never);
    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/finances');
    expect(await screen.findByText('Finances copropriété')).toBeTruthy();
    expect(await screen.findByText(/Fonds travaux/)).toBeTruthy();
  });
});
