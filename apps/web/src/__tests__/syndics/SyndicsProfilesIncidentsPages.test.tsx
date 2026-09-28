import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicProfilesIncidents } from '../../pages/syndics/SyndicProfilesIncidents';
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
    DatePicker: passthrough('input'),
    Form: FormComponent,
    Input: Object.assign(passthrough('input'), { TextArea: passthrough('textarea') }),
    InputNumber: passthrough('input'),
    // Un passthrough n'aurait rendu aucun bouton OK : la validation de la
    // modale « Modifier l'incident » se teste en cliquant dessus.
    Modal: ({ children, onOk, onCancel, okText, cancelText }: any) => (
      <div>
        {children}
        <button onClick={onOk}>{okText || 'OK'}</button>
        <button onClick={onCancel}>{cancelText || 'Annuler'}</button>
      </div>
    ),
    Select: passthrough('select'),
    // `Space.Compact` : le résultat d'invitation au portail y pose le lien et « Copier ».
    Space: Object.assign(passthrough(), { Compact: passthrough() }),
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
    },
    __mocks: { formInstance }
  };
  const appApi = {
    message: antdMock.message ?? { success() {}, error() {}, warning() {}, info() {}, loading() {} },
    // La confirmation de révocation est acceptée d'office : le test porte sur
    // l'appel qui suit, pas sur la boîte de dialogue d'AntD.
    modal: {
      confirm: (options: any) => options?.onOk?.(),
      info() {},
      warning() {},
      error() {},
      success() {}
    },
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
const antdModule = (await import('antd')) as unknown as { __mocks: { formInstance: { validateFields: any } } };
const formValidateFields = antdModule.__mocks.formInstance.validateFields;

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
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.includes('/profils/proprietaires')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'op-1',
                lotId: 'lot-1',
                contactId: 'c-1',
                ownershipPercentage: 100,
                ownedSince: '2026-01-01T00:00:00.000Z',
                portalAccessEnabled: true
              }
            ]
          }
        });
      }
      if (url.includes('/profils/locataires')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'tp-1',
                lotId: 'lot-1',
                contactId: 'c-2',
                tenantSince: '2026-01-01T00:00:00.000Z',
                chargesBilledToTenant: false,
                isCurrent: true
              }
            ]
          }
        });
      }
      if (url.includes('/incidents')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'i-1',
                incidentType: 'LEAK',
                urgency: 'HIGH',
                description: 'Fuite',
                status: 'REPORTED',
                imputations: []
              }
            ]
          }
        });
      }
      // The page loads lots, CRM contacts and properties in the same
      // Promise.all; any unhandled branch rejects the whole load and the page
      // renders its error state instead of the data asserted below.
      if (url.endsWith('/lots')) {
        return Promise.resolve({
          data: { success: true, data: [{ id: 'lot-1', lotNumber: 'A-01', lotType: 'APARTMENT' }] }
        });
      }
      if (url.includes('/crm/contacts')) {
        return Promise.resolve({ data: { success: true, data: [], pagination: { total: 0 } } });
      }
      if (url.includes('/properties')) {
        return Promise.resolve({ data: { success: true, data: [], pagination: { total: 0 } } });
      }
      if (url.includes('/prestataires')) {
        return Promise.resolve({
          data: { success: true, data: { providers: [], contracts: [], commonAssets: [] } }
        });
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

  it('« Inviter au portail » affiche le lien d’invitation et le bouton « Copier », e-mail envoyé ou non', async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          email: 'awa@example.com',
          contactName: 'Awa Konan',
          accountStatus: 'NEW_ACCOUNT',
          invitationUrl: 'http://localhost:3000/reset-password?token=abc',
          expiresAt: '2026-10-04T00:00:00.000Z',
          emailSent: false,
          openedLots: 2
        }
      }
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Inviter au portail'));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/profils/proprietaires/op-1/invitation-portail'
      )
    );
    const link = (await screen.findByDisplayValue(
      'http://localhost:3000/reset-password?token=abc'
    )) as HTMLInputElement;
    expect(link.readOnly).toBe(true);
    // E-mail non parti : l'avertissement remplace la confirmation d'envoi (le
    // mock d'AntD ne rend pas la prop `message` d'<Alert>, d'où ce contrôle).
    expect(screen.queryByText("E-mail d'invitation envoyé.")).toBeNull();

    fireEvent.click(screen.getByText('Copier'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://localhost:3000/reset-password?token=abc'));
  });

  it('un compte existant reçoit un lien de connexion, présenté comme tel', async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        success: true,
        data: {
          email: 'awa@example.com',
          contactName: 'Awa Konan',
          accountStatus: 'EXISTING_ACCOUNT',
          invitationUrl: 'http://localhost:3000/login?redirect=%2Fcopropriete',
          expiresAt: null,
          emailSent: true,
          openedLots: 1
        }
      }
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Inviter au portail'));

    expect(await screen.findByText('Lien de connexion')).toBeTruthy();
    expect(screen.getByText('Compte existant')).toBeTruthy();
    expect(screen.getByText("E-mail d'invitation envoyé.")).toBeTruthy();
  });

  it('« Révoquer l’accès » appelle la révocation après confirmation', async () => {
    mockApiClient.delete.mockResolvedValue({ data: { success: true, data: { closedLots: 1, unlinkedAccounts: 1 } } });

    renderWithRoute();
    fireEvent.click(await screen.findByText("Révoquer l'accès"));

    await waitFor(() =>
      expect(mockApiClient.delete).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/profils/proprietaires/op-1/invitation-portail'
      )
    );
  });

  it('shows imputation action for incidents', async () => {
    renderWithRoute();
    const button = await screen.findByText('Ajouter imputation');
    fireEvent.click(button);
    expect(button).toBeTruthy();
  });

  // Écart recette #2 : la colonne Statut était un Tag en lecture seule, sans
  // aucun moyen de faire avancer l'incident (En cours → Résolu → Clôturé).
  it("« Modifier l'incident » choisit En cours et appelle la mise à jour", async () => {
    mockApiClient.patch.mockResolvedValueOnce({
      data: { success: true, data: { id: 'i-1', status: 'IN_PROGRESS' } }
    });

    renderWithRoute();
    fireEvent.click(await screen.findByText("Modifier l'incident"));

    formValidateFields.mockResolvedValueOnce({
      status: 'IN_PROGRESS',
      providerId: undefined,
      description: 'Fuite',
      resolvedAt: undefined
    });
    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() =>
      expect(mockApiClient.patch).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/incidents/i-1', {
        status: 'IN_PROGRESS'
      })
    );
  });
});
