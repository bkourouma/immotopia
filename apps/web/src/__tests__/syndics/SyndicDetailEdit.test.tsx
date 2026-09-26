import type { Mock } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicDetail } from '../../pages/syndics/SyndicDetail';
import apiClient from '../../utils/api-client';

/**
 * Recette Syndic E.2 : le bouton « Modifier » d'une copropriété, son
 * formulaire (dont le N° d'immatriculation, absent jusqu'ici de l'écran) et
 * son rapport d'erreur. Colocalisé avec `SyndicsPages.test.tsx`, qui couvre
 * déjà l'affichage de `<SyndicDetail>` sans ce formulaire.
 */

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
  const mockValidateFields = vi.fn();
  const mockResetFields = vi.fn();
  const mockSetFieldsValue = vi.fn();
  const mockSetFields = vi.fn();
  const mockMessageSuccess = vi.fn();
  const mockMessageError = vi.fn();

  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  // `<Card extra={...}>` porte le bouton « Modifier » (voir `<SyndicDetail>`) :
  // un simple passthrough qui ne rendrait que `children` le ferait disparaître.
  const CardComp: any = ({ children, title, extra, cover }: any) => (
    <div>
      {title}
      {extra}
      {cover}
      {children}
    </div>
  );

  const FormComp: any = ({ children }: any) => <form>{children}</form>;
  FormComp.useForm = () => [
    {
      validateFields: mockValidateFields,
      resetFields: mockResetFields,
      setFieldsValue: mockSetFieldsValue,
      setFields: mockSetFields
    }
  ];
  FormComp.Item = passthrough();
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');
  const DescriptionsComp: any = passthrough();
  DescriptionsComp.Item = passthrough();
  const Typography = {
    Title: passthrough('h1'),
    Paragraph: passthrough('p'),
    Text: passthrough('span')
  };
  const SkeletonComp: any = passthrough('div');
  SkeletonComp.Input = passthrough('span');
  SkeletonComp.Button = passthrough('span');
  const Table = ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>;

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: ({ children, onClick, disabled, icon }: any) => (
      <button onClick={onClick} disabled={disabled}>
        {icon}
        {children}
      </button>
    ),
    Card: CardComp,
    Col: passthrough(),
    DatePicker: passthrough('input'),
    Descriptions: DescriptionsComp,
    Dropdown: passthrough(),
    Empty: ({ description, children, ...props }: any) => React.createElement('div', props, description, children),
    Form: FormComp,
    Input: InputComp,
    InputNumber: passthrough('input'),
    Modal: ({ children, onOk, okText, onCancel, cancelText }: any) => (
      <div>
        {children}
        <button onClick={onOk}>{okText || 'OK'}</button>
        <button onClick={onCancel}>{cancelText || 'Cancel'}</button>
      </div>
    ),
    Pagination: passthrough(),
    Result: passthrough(),
    Row: passthrough(),
    Select: passthrough('select'),
    Skeleton: SkeletonComp,
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
    Typography,
    message: {
      success: mockMessageSuccess,
      error: mockMessageError
    },
    __mocks: {
      mockValidateFields,
      mockResetFields,
      mockSetFieldsValue,
      mockSetFields,
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
    // Aucun palier actif : le rendu par defaut des tests est le mobile.
    Grid: { useBreakpoint: () => ({}) }
  };
});

// Vitest has no `requireMock`; importing the module inside a mocked test file
// already yields the mock, so a plain dynamic import is the equivalent.
const { __mocks } = (await import('antd')) as unknown as {
  __mocks: {
    mockValidateFields: Mock;
    mockResetFields: Mock;
    mockSetFieldsValue: Mock;
    mockSetFields: Mock;
    mockMessageSuccess: Mock;
    mockMessageError: Mock;
  };
};
const mockValidateFields = __mocks.mockValidateFields;
const mockSetFieldsValue = __mocks.mockSetFieldsValue;
const mockSetFields = __mocks.mockSetFields;
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
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1']}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId" element={<SyndicDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const baseSyndicate = {
  id: 'syndic-1',
  tenantId: 'tenant-1',
  name: 'Résidence Test',
  address: 'Dakar',
  registrationNo: 'RC-2024-001',
  fiscalYear: 3,
  syndicManagerId: 'contact-1',
  cadastralReference: null,
  totalLots: 2,
  totalBuildings: 1,
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  property: null,
  lots: [],
  chargeCalls: [],
  funds: []
};

function mockGetHandlers() {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url === '/tenants/tenant-1/syndics/syndic-1') {
      return Promise.resolve({ data: { success: true, data: baseSyndicate } });
    }
    if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    if (url === '/tenants/tenant-1/crm/contacts') {
      return Promise.resolve({
        data: {
          contacts: [{ id: 'contact-1', firstName: 'Awa', lastName: 'Diallo', email: 'awa@example.com' }]
        }
      });
    }
    return Promise.reject(new Error(`Unhandled GET ${url}`));
  });
}

describe('SyndicDetail — modification de la copropriété', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le N° d'immatriculation et ouvre le formulaire pré-rempli au clic sur Modifier", async () => {
    mockGetHandlers();

    renderWithRoute();

    expect(await screen.findByText('RC-2024-001')).toBeTruthy();

    const editButton = await screen.findByText('Modifier');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(mockSetFieldsValue).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Résidence Test',
          address: 'Dakar',
          registrationNo: 'RC-2024-001',
          fiscalYear: 3,
          syndicManagerId: 'contact-1'
        })
      );
    });
  });

  it('enregistre les modifications et appelle updateSyndicate avec le bon contenu', async () => {
    mockGetHandlers();
    mockApiClient.patch.mockResolvedValue({
      data: { success: true, data: { ...baseSyndicate, registrationNo: 'RC-2024-002', fiscalYear: 4 } }
    } as never);
    mockValidateFields.mockResolvedValue({
      name: 'Résidence Test',
      address: 'Dakar',
      registrationNo: 'RC-2024-002',
      cadastralReference: undefined,
      fiscalYear: 4,
      syndicManagerId: 'contact-1'
    });

    renderWithRoute();

    fireEvent.click(await screen.findByText('Modifier'));
    fireEvent.click(await screen.findByText('Enregistrer'));

    await waitFor(() => {
      expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1', {
        name: 'Résidence Test',
        address: 'Dakar',
        registrationNo: 'RC-2024-002',
        cadastralReference: null,
        fiscalYear: 4,
        syndicManagerId: 'contact-1'
      });
    });
    expect(mockMessageSuccess).toHaveBeenCalled();
  });

  it("affiche le message d'erreur de l'API quand l'enregistrement échoue (dont un refus d'abonnement)", async () => {
    mockGetHandlers();
    mockApiClient.patch.mockRejectedValue({
      response: {
        status: 403,
        data: { success: false, code: 'SUBSCRIPTION_READ_ONLY', error: "L'abonnement de votre agence n'est plus actif" }
      }
    } as never);
    mockValidateFields.mockResolvedValue({
      name: 'Résidence Test',
      address: 'Dakar',
      registrationNo: 'RC-2024-002',
      fiscalYear: 4,
      syndicManagerId: 'contact-1'
    });

    renderWithRoute();

    fireEvent.click(await screen.findByText('Modifier'));
    fireEvent.click(await screen.findByText('Enregistrer'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith("L'abonnement de votre agence n'est plus actif");
    });
  });

  it('reporte une erreur de validation par champ sur le formulaire', async () => {
    mockGetHandlers();
    mockApiClient.patch.mockRejectedValue({
      response: {
        status: 400,
        data: {
          success: false,
          errors: [{ field: 'registrationNo', message: "Le n° d'immatriculation est invalide" }]
        }
      }
    } as never);
    mockValidateFields.mockResolvedValue({
      name: 'Résidence Test',
      address: 'Dakar',
      registrationNo: 'invalide',
      fiscalYear: 4,
      syndicManagerId: 'contact-1'
    });

    renderWithRoute();

    fireEvent.click(await screen.findByText('Modifier'));
    fireEvent.click(await screen.findByText('Enregistrer'));

    await waitFor(() => {
      expect(mockSetFields).toHaveBeenCalledWith([
        { name: 'registrationNo', errors: ["Le n° d'immatriculation est invalide"] }
      ]);
    });
  });
});
