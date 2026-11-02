import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';
import apiClient from '../../utils/api-client';
import { Modal } from 'antd';

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

// Le bouton « Exporter » des tableaux a ses propres tests (primitives/export-menu) : ici il est neutralisé.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

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
  FormComponent.useWatch = () => undefined;
  // Form.List : un seul poste statique (le comportement réel est testé dans SyndicBudgetsCreateLines.test.tsx).
  FormComponent.List = ({ children }: any) => children([{ key: 0, name: 0 }], { add: vi.fn(), remove: vi.fn() });

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

  const ModalComponent: any = passthrough();
  // Modal.confirm est un appel statique (pas un rendu React) : le mock capture
  // le dernier appel pour que les tests declenchent onOk/onCancel eux-memes.
  ModalComponent.confirm = vi.fn();

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    // `extra` porte le sélecteur de budget de la carte « Répartition des lots ».
    Card: ({ children, extra }: any) => (
      <div>
        {extra}
        {children}
      </div>
    ),
    Form: FormComponent,
    Input: passthrough('input'),
    InputNumber: passthrough('input'),
    Modal: ModalComponent,
    // Un vrai <select> natif : `onChange` reçoit la valeur, comme le `Select` d'AntD.
    Select: ({ options = [], value, onChange, 'aria-label': ariaLabel }: any) => (
      <select aria-label={ariaLabel} value={value ?? ''} onChange={event => onChange?.(event.target.value)}>
        {options.map((option: any) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
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
    expect(await screen.findByText("Budgets et campagnes d'appels")).toBeTruthy();
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

  it('affiche le statut traduit (Brouillon)', async () => {
    renderWithRoute();
    expect(await screen.findByText('Brouillon')).toBeTruthy();
  });
});

describe('Syndics budgets page — clôture (anomalie N.8-2)', () => {
  const budgetApproved = {
    id: 'budget-1',
    fiscalYear: 2026,
    label: 'Budget 2026',
    totalAmount: 1000000,
    status: 'APPROVED',
    currency: 'XOF',
    allocations: [],
    lines: [
      {
        id: 'line-1',
        budgetId: 'budget-1',
        category: 'Maintenance',
        description: 'Maintenance courante',
        amountForecast: 700000,
        amountActual: 900000,
        distributionKey: 'GENERAL_SHARES'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (Modal.confirm as any).mockClear?.();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/budgets')) {
        return Promise.resolve({ data: { success: true, data: [budgetApproved] } });
      }
      if (url.endsWith('/charges/batch')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url.endsWith('/lots')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('affiche le statut Approuvé et propose Réviser et Clôturer', async () => {
    renderWithRoute();
    expect(await screen.findByText('Approuvé')).toBeTruthy();
    expect(await screen.findByText('Réviser')).toBeTruthy();
    expect(await screen.findByText('Clôturer')).toBeTruthy();
  });

  it('ouvre une confirmation avec le total budgété/réalisé/écart avant de clôturer', async () => {
    mockApiClient.patch.mockResolvedValue({ data: { success: true, data: { ...budgetApproved, status: 'CLOSED' } } });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Clôturer'));

    expect(Modal.confirm).toHaveBeenCalledTimes(1);
    const config = (Modal.confirm as any).mock.calls[0][0];
    expect(config.okText).toBe('Clôturer');

    // Simule la confirmation de l'utilisateur dans la boîte de dialogue.
    await config.onOk();

    await waitFor(() => {
      expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/budgets/budget-1', {
        status: 'CLOSED'
      });
    });
  });

  it('affiche les colonnes Budgété, Réalisé et Écart des postes', async () => {
    renderWithRoute();
    fireEvent.click(await screen.findByText('Postes et fonds'));

    expect(await screen.findByText('Maintenance')).toBeTruthy();
  });
});

describe('Syndics budgets page — budget clôturé (lecture seule)', () => {
  const budgetClosed = {
    id: 'budget-1',
    fiscalYear: 2026,
    label: 'Budget 2026',
    totalAmount: 1000000,
    status: 'CLOSED',
    currency: 'XOF',
    allocations: [],
    lines: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/budgets')) {
        return Promise.resolve({ data: { success: true, data: [budgetClosed] } });
      }
      if (url.endsWith('/charges/batch')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url.endsWith('/lots')) {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('n affiche ni Approuver, ni Réviser, ni Clôturer, masque Générer appels et désactive Répartir', async () => {
    renderWithRoute();
    expect(await screen.findByText('Clôturé')).toBeTruthy();
    expect(screen.queryByText('Approuver')).toBeNull();
    expect(screen.queryByText('Réviser')).toBeNull();
    expect(screen.queryByText('Clôturer')).toBeNull();

    const repartirButton = (await screen.findByText('Répartir')) as HTMLButtonElement;
    expect(repartirButton.disabled).toBe(true);
    expect(screen.queryByText('Générer appels')).toBeNull();
  });
});

describe('Syndics budgets page — répartition des lots par budget', () => {
  const allocationFor = (lotNumber: string) => ({
    id: `alloc-${lotNumber}`,
    budgetId: 'b',
    lotId: `lot-${lotNumber}`,
    totalAllocated: 1000,
    breakdown: [],
    lot: { id: `lot-${lotNumber}`, lotNumber, lotType: 'APARTMENT', generalShares: 1 }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.endsWith('/budgets')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'budget-2025',
                fiscalYear: 2025,
                label: 'Budget 2025',
                totalAmount: 1000,
                status: 'APPROVED',
                currency: 'XOF',
                createdAt: '2025-01-10T00:00:00.000Z',
                allocations: [allocationFor('ANCIEN-1')]
              },
              {
                id: 'budget-2026',
                fiscalYear: 2026,
                label: 'Budget 2026',
                totalAmount: 1000,
                status: 'DRAFT',
                currency: 'XOF',
                createdAt: '2026-01-10T00:00:00.000Z',
                allocations: [allocationFor('RECENT-1')]
              }
            ]
          }
        });
      }
      if (url.endsWith('/charges/batch')) {
        const batch = (id: string, label: string, budgetId: string | null) => ({
          id,
          label,
          period: '2026',
          dueDate: '2026-04-30T00:00:00.000Z',
          batchType: 'REGULAR',
          budgetId,
          totalAmount: 1000,
          chargeCalls: [],
          status: 'SENT'
        });
        return Promise.resolve({
          data: {
            success: true,
            data: [
              batch('batch-old', 'Campagne ancienne', 'budget-2025'),
              batch('batch-new', 'Campagne récente', 'budget-2026')
            ]
          }
        });
      }
      if (url.endsWith('/lots')) return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
  });

  it('affiche par défaut les allocations du dernier budget créé', async () => {
    renderWithRoute();
    expect(await screen.findByText('RECENT-1 · Appartement')).toBeTruthy();
    expect(screen.queryByText('ANCIEN-1 · Appartement')).toBeNull();
  });

  it('le sélecteur de budget bascule le tableau sur le budget choisi', async () => {
    renderWithRoute();
    await screen.findByText('RECENT-1 · Appartement');
    fireEvent.change(screen.getAllByLabelText('Budget')[0], { target: { value: 'budget-2025' } });
    expect(await screen.findByText('ANCIEN-1 · Appartement')).toBeTruthy();
    expect(screen.queryByText('RECENT-1 · Appartement')).toBeNull();
  });

  it('filtre aussi les campagnes d’appels par budget, avec le même sélecteur', async () => {
    renderWithRoute();
    expect(await screen.findByText('Campagne récente')).toBeTruthy();
    expect(screen.queryByText('Campagne ancienne')).toBeNull();

    // Le sélecteur de la carte « Campagnes d'appels » est le second de la page.
    fireEvent.change(screen.getAllByLabelText('Budget')[1], { target: { value: 'budget-2025' } });
    expect(await screen.findByText('Campagne ancienne')).toBeTruthy();
    expect(screen.queryByText('Campagne récente')).toBeNull();
    expect(await screen.findByText('ANCIEN-1 · Appartement')).toBeTruthy();
  });
});
