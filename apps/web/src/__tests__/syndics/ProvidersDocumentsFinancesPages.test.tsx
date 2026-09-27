import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicProviders } from '../../pages/syndics/SyndicProviders';
import { SyndicDocuments } from '../../pages/syndics/SyndicDocuments';
import apiClient from '../../utils/api-client';

// SyndicFinances a son propre test dédié (`SyndicFinances.test.tsx`) : depuis
// son passage à `<DataView>`/`<StatCard>` (composants/primitives), la page
// s'appuie sur une bien plus large surface d'antd (Skeleton, Pagination,
// Empty, Result…) que le mock volontairement minimal ci-dessous ne couvre
// pas, et n'a donc plus sa place dans ce fichier partagé avec les pages
// Prestataires et Documents.

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
  // SyndicProviders and SyndicDocuments call Form.useForm() at render time, so
  // the mock must expose the full antd surface these pages import, not just the
  // layout primitives.
  //
  // `<SyndicProviders>` mounts TWO forms (contrat, prestataire) : chaque appel
  // de `Form.useForm()` recoit sa PROPRE instance espionnable (au lieu d'un
  // seul stub statique partage), pour piloter `validateFields` independamment
  // dans un test qui cree/edite un prestataire depuis la modale de contrat.
  // `formInstances` est expose via `__mocks` et reinitialise a chaque test
  // (voir `beforeEach` plus bas) : sans ca l'ordre des instances derive au fil
  // des montages/demontages successifs des memes routes.
  let formInstances: any[] = [];
  let formCallIndex = 0;
  let formIndexResetScheduled = false;
  const Form: any = passthrough('form');
  Form.useForm = () => {
    const index = formCallIndex++;
    // Chaque rendu du composant appelle `Form.useForm()` dans le meme ordre
    // (contractForm puis providerForm pour `<SyndicProviders>`) : l'index doit
    // donc revenir a 0 apres chaque passe de rendu synchrone, sinon un second
    // rendu (declenche par `loadData` qui resout) creerait de NOUVELLES
    // instances au lieu de reutiliser celles deja capturees par le test.
    if (!formIndexResetScheduled) {
      formIndexResetScheduled = true;
      queueMicrotask(() => {
        formCallIndex = 0;
        formIndexResetScheduled = false;
      });
    }
    if (!formInstances[index]) {
      formInstances[index] = {
        resetFields: () => {},
        setFieldsValue: () => {},
        validateFields: async () => ({})
      };
    }
    return [formInstances[index]];
  };
  Form.Item = ({ children, label, extra }: any) => (
    <div>
      {label}
      {children}
      {extra}
    </div>
  );

  const Upload: any = passthrough();
  Upload.Dragger = passthrough();

  const Modal: any = ({ children, open, onOk, okText, onCancel, cancelText }: any) =>
    open ? (
      <div>
        {children}
        <button onClick={onOk}>{okText || 'OK'}</button>
        <button onClick={onCancel}>{cancelText || 'Cancel'}</button>
      </div>
    ) : null;

  // Rend chaque colonne pour chaque ligne, au lieu d'un simple dump JSON :
  // necessaire pour que les boutons « Modifier »/« Supprimer » qu'une colonne
  // `render` produit (SyndicProviders) apparaissent reellement dans le DOM.
  const Table: any = ({ dataSource, columns, rowKey }: any) => (
    <table>
      <tbody>
        {(dataSource || []).map((row: any, rowIndex: number) => (
          <tr key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey as string] ?? rowIndex}>
            {(columns || []).map((column: any, columnIndex: number) => (
              <td key={column.key || column.dataIndex || columnIndex}>
                {column.render
                  ? column.render(row[column.dataIndex], row, rowIndex)
                  : String(row[column.dataIndex] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const Select: any = ({ options, value, onChange, placeholder }: any) => (
    <select value={value ?? ''} onChange={event => onChange?.(event.target.value || undefined)}>
      <option value="">{placeholder || ''}</option>
      {(options || []).map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: ({ children, onClick, disabled, loading, icon }: any) => (
      <button onClick={onClick} disabled={disabled || loading}>
        {icon}
        {children}
      </button>
    ),
    Card: passthrough(),
    Col: passthrough(),
    Row: passthrough(),
    DatePicker: passthrough('input'),
    Form,
    Input: passthrough('input'),
    InputNumber: passthrough('input'),
    Modal,
    Select,
    Space: passthrough(),
    Spin: passthrough(),
    Statistic: ({ title, value }: any) => (
      <div>
        {title}:{value}
      </div>
    ),
    Table,
    Tag: passthrough('span'),
    Upload,
    message: { success() {}, error() {}, warning() {}, info() {} },
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span'),
      Link: ({ children, onClick }: any) => <a onClick={onClick}>{children}</a>
    },
    __mocks: {
      get formInstances() {
        return formInstances;
      },
      resetForms() {
        formInstances = [];
        formCallIndex = 0;
      }
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
// already yields the mock, so a plain dynamic import is the equivalent (see
// `SyndicDetailEdit.test.tsx`).
const { __mocks } = (await import('antd')) as unknown as {
  __mocks: { formInstances: any[]; resetForms: () => void };
};

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

function renderWithRoute(route: string) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/prestataires" element={<SyndicProviders />} />
          <Route path="/tenant/:tenantId/syndics/:syndicId/documents" element={<SyndicDocuments />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Providers/Documents pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __mocks.resetForms();
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

  it('cree un prestataire via le bouton « Nouveau prestataire » (ecart recette #2, FR-010)', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: { providers: [], contracts: [], commonAssets: [] } }
    } as never);
    mockApiClient.post.mockResolvedValueOnce({
      data: { success: true, data: { id: 'p-new', name: 'Ascenseurs Pro', specialty: 'Ascenseur' } }
    } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/prestataires');
    await screen.findByText('Prestataires et contrats');

    fireEvent.click(screen.getByText('Nouveau prestataire'));

    // Le formulaire de creation est la 2e instance montee (contractForm puis
    // providerForm, voir SyndicProviders.tsx) : on force ses valeurs pour ce
    // test, comme `SyndicDetailEdit.test.tsx` le fait pour son propre form.
    __mocks.formInstances[1].validateFields = async () => ({
      name: 'Ascenseurs Pro',
      specialty: 'Ascenseur',
      email: 'contact@ascenseurspro.test',
      phone: undefined
    });

    fireEvent.click(screen.getByText('Créer'));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/prestataires',
        expect.objectContaining({ name: 'Ascenseurs Pro', specialty: 'Ascenseur', email: 'contact@ascenseurspro.test' })
      );
    });
  });

  it('modifie un prestataire existant via l’action « Modifier » de la liste', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          providers: [{ id: 'p1', name: 'Nettoyage Plus', specialty: 'Nettoyage', email: null, phone: null }],
          contracts: [],
          commonAssets: []
        }
      }
    } as never);
    mockApiClient.patch.mockResolvedValueOnce({
      data: { success: true, data: { id: 'p1', name: 'Nettoyage Plus SARL' } }
    } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/prestataires');
    await screen.findByText(/Nettoyage Plus/);

    fireEvent.click(screen.getByText('Modifier'));

    __mocks.formInstances[1].validateFields = async () => ({
      name: 'Nettoyage Plus SARL',
      specialty: 'Nettoyage',
      email: undefined,
      phone: undefined
    });

    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/prestataires/p1',
        expect.objectContaining({ name: 'Nettoyage Plus SARL' })
      );
    });
  });

  it('propose de creer un prestataire a la volee depuis la modale de nouveau contrat', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: { providers: [], contracts: [], commonAssets: [] } }
    } as never);

    renderWithRoute('/tenant/tenant-1/syndics/syndic-1/prestataires');
    await screen.findByText('Prestataires et contrats');

    fireEvent.click(screen.getByText('Nouveau contrat'));
    expect(await screen.findByText('Pas de prestataire ? Créer un prestataire')).toBeTruthy();
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
    // Titre ET type affichent tous deux « Reglement » depuis que le mock de
    // `Table` rend chaque colonne (au lieu d'un simple dump JSON) : plusieurs
    // correspondances sont attendues.
    expect((await screen.findAllByText(/Reglement/)).length).toBeGreaterThan(0);
  });
});
