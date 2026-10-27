import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { LotTable } from '../../components/syndics/LotTable';
import { SyndicLots } from '../../pages/syndics/SyndicLots';
import { SyndicateLot } from '../../types/syndic-types';
import apiClient from '../../utils/api-client';

// Ce fichier vérifie deux retouches d'affichage qui n'avaient pas encore de
// test : (a) la colonne « Bien lié » de `<LotTable>` n'affiche plus le
// propriétaire, (b) le formulaire de lot de `<SyndicLots>` propose « Bien
// lié » avant « Numéro de lot » et son sélecteur n'affiche que le bien.

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
  // Vitest résout les imports nommés d'après les clés de cet objet : un Proxy
  // vide n'en déclarerait aucune.
  const actual = await vi.importActual<Record<string, unknown>>('@ant-design/icons');
  const Icon = () => <span />;
  return Object.fromEntries(Object.keys(actual).map(name => [name, Icon]));
});

// Le bouton « Exporter » des tableaux a ses propres tests (primitives/export-menu) : ici il est neutralisé.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

vi.mock('antd', async () => {
  // importActual doit être atteint depuis l'intérieur de la factory hoistée ;
  // un import dynamique classique ici bloque le graphe de modules.
  const React = await vi.importActual<typeof import('react')>('react');
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  // Rend chaque colonne via son `render`/`dataIndex`, comme dans
  // SyndicsProfilesIncidentsPages.test.tsx.
  const Table = ({ dataSource, columns }: any) => (
    <table>
      <tbody>
        {(dataSource || []).map((row: any, index: number) => (
          <tr key={row.id || index}>
            {(columns || []).map((column: any, colIndex: number) => {
              const value = column.dataIndex ? row[column.dataIndex] : undefined;
              const content = column.render ? column.render(value, row, index) : value;
              return <td key={colIndex}>{content}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Le label du `Form.Item` doit rester un texte visible (et dans l'ordre du
  // DOM) pour vérifier l'ordre des champs sans dépendre du câblage réel
  // d'AntD Form (contexte interne, non reproduit ici).
  const FormItem = ({ label, children }: any) => (
    <div>
      {label ? <label>{label}</label> : null}
      {children}
    </div>
  );
  const formInstance = {
    validateFields: vi.fn(),
    resetFields: vi.fn(),
    setFieldsValue: vi.fn(),
    getFieldValue: vi.fn()
  };
  const FormComponent: any = passthrough('form');
  FormComponent.useForm = () => [formInstance];
  FormComponent.Item = FormItem;

  // `options` porte les libellés testés ; un `<select>` natif suffit, pas
  // besoin du vrai menu déroulant AntD.
  const SelectComp: any = ({ options, placeholder, mode }: any) => (
    <select data-placeholder={placeholder} multiple={mode === 'multiple'}>
      {(options || []).map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  // Ne rend son contenu que si `open` : comme AntD, qui ne monte la modale
  // qu'à la première ouverture.
  const ModalComp: any = ({ open, title, children }: any) =>
    open ? (
      <div role="dialog">
        <div>{title}</div>
        {children}
      </div>
    ) : null;

  const antdMock: Record<string, unknown> = {
    Alert: ({ message, description }: any) => (
      <div>
        {message}
        {description}
      </div>
    ),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    DatePicker: passthrough('input'),
    Form: FormComponent,
    Input: Object.assign(passthrough('input'), { TextArea: passthrough('textarea') }),
    InputNumber: passthrough('input'),
    Modal: ModalComp,
    Row: passthrough(),
    Select: SelectComp,
    Space: passthrough(),
    Switch: ({ checked, onChange, ...props }: any) => (
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange?.(e.target.checked)} {...props} />
    ),
    // Affiche la confirmation comme un bouton « ok : titre » pour pouvoir la valider dans le test.
    Popconfirm: ({ children, title, onConfirm }: any) => (
      <span>
        {children}
        <button type="button" onClick={onConfirm}>
          {`ok : ${title}`}
        </button>
      </span>
    ),
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
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    }
  };
  const appApi = {
    message: antdMock.message,
    modal: { confirm() {}, info() {}, warning() {}, error() {}, success() {} },
    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} }
  };
  return {
    ...antdMock,
    App: { useApp: () => appApi }
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

describe('LotTable — bien lié sans propriétaire', () => {
  it("n'affiche que le libellé du bien dans la colonne « Bien lié », pas le propriétaire", () => {
    const lot: SyndicateLot = {
      id: 'lot-1',
      syndicateId: 'syndic-1',
      propertyId: 'prop-1',
      property: {
        id: 'prop-1',
        internalReference: 'REF-1',
        title: 'Appartement 12B',
        address: 'Abidjan',
        owner: { id: 'owner-1', email: 'fabrice@example.com', fullName: 'Fabrice Aka' }
      },
      ownerContactId: null,
      coowner: null,
      lotNumber: 'A-101',
      lotType: 'APARTMENT',
      generalShares: 100,
      specialShares: null,
      ownerSince: null,
      tenantAssignments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as unknown as SyndicateLot;

    render(<LotTable lots={[lot]} />);

    // Le bien seul.
    expect(screen.getByText('Appartement 12B')).toBeTruthy();
    // Jamais préfixé par le propriétaire (nomenclature réservée à l'import).
    expect(screen.queryByText(/Fabrice Aka.*Appartement 12B/)).not.toBeInTheDocument();
  });
});

describe('SyndicLots — formulaire de lot', () => {
  function renderPage() {
    return render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/lots']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/lots" element={<SyndicLots />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.get.mockImplementation((url: string) => {
      if (url === '/tenants/tenant-1/syndics/syndic-1') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'syndic-1',
              tenantId: 'tenant-1',
              name: 'Résidence Les Palmiers',
              status: 'ACTIVE',
              totalLots: 0,
              totalBuildings: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          }
        });
      }
      if (url === '/tenants/tenant-1/syndics/syndic-1/lots') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      if (url.startsWith('/tenants/tenant-1/properties')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'prop-1',
                internalReference: 'REF-9',
                title: 'Villa Bel Air',
                propertyType: 'MAISON_VILLA',
                ownershipType: 'PRIVATE',
                owner: { id: 'owner-1', email: 'awa@example.com', fullName: 'Awa Traoré' }
              }
            ],
            pagination: { page: 1, limit: 200, total: 1, totalPages: 1 }
          }
        });
      }
      if (url.includes('/crm/contacts')) {
        return Promise.resolve({
          data: { success: true, contacts: [], pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } }
        });
      }
      return Promise.reject(new Error(`GET non prévu par le test : ${url}`));
    });
  });

  it('place « Bien lié » avant « Numéro de lot » et son sélecteur ne montre que le bien', async () => {
    renderPage();

    const newLotButton = await screen.findByText('Nouveau lot');
    fireEvent.click(newLotButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    // Ordre des champs : « Bien lié » précède « Numéro de lot » dans le DOM.
    const labels = Array.from(document.querySelectorAll('label')).map(node => node.textContent);
    const propertyFieldIndex = labels.indexOf('Bien lié');
    const lotNumberFieldIndex = labels.indexOf('Numéro de lot');
    expect(propertyFieldIndex).toBeGreaterThanOrEqual(0);
    expect(lotNumberFieldIndex).toBeGreaterThan(propertyFieldIndex);

    // Le sélecteur « Bien lié » affiche le bien seul, jamais préfixé par son
    // propriétaire (contrairement au sélecteur de l'import).
    const propertySelect = document.querySelector('select[data-placeholder="Sélectionner un bien existant"]');
    expect(propertySelect).toBeTruthy();
    expect(propertySelect?.textContent).toContain('Villa Bel Air');
    expect(propertySelect?.textContent).not.toContain('Awa Traoré');
  });
});

describe('LotTable — désactiver, réactiver, locataires', () => {
  const baseLot = (overrides: Partial<SyndicateLot>): SyndicateLot =>
    ({
      id: 'lot-1',
      syndicateId: 'syndic-1',
      propertyId: null,
      ownerContactId: null,
      coowner: null,
      lotNumber: 'A-101',
      lotType: 'APARTMENT',
      generalShares: 100,
      specialShares: null,
      ownerSince: null,
      tenantAssignments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides
    }) as unknown as SyndicateLot;

  it('propose « Désactiver » sur un lot actif et confirme avant d’appeler le rappel', () => {
    const onDeactivate = vi.fn();
    const onReactivate = vi.fn();
    render(<LotTable lots={[baseLot({})]} onDeactivate={onDeactivate} onReactivate={onReactivate} />);

    expect(screen.queryByText('Réactiver')).toBeNull();
    fireEvent.click(screen.getByText('ok : Désactiver ce lot ?'));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    expect(onReactivate).not.toHaveBeenCalled();
  });

  it('propose « Réactiver » sur un lot inactif (tantièmes à 0), sans « Désactiver »', () => {
    const onDeactivate = vi.fn();
    const onReactivate = vi.fn();
    const lot = baseLot({ generalShares: 0 });
    render(<LotTable lots={[lot]} onDeactivate={onDeactivate} onReactivate={onReactivate} />);

    expect(screen.queryByText('ok : Désactiver ce lot ?')).toBeNull();
    fireEvent.click(screen.getByText('Réactiver'));
    expect(onReactivate).toHaveBeenCalledWith(lot);
  });

  it('fusionne affectations et profils locataires sans doublon et permet de mettre fin à une affectation', () => {
    const onEnd = vi.fn();
    const assignment = {
      id: 'ta-1',
      tenantId: 'c-1',
      startDate: '2026-01-01',
      isActive: true,
      contact: { id: 'c-1', firstName: 'Awa', lastName: 'Koné' }
    };
    const lot = baseLot({
      tenantAssignments: [assignment],
      tenantProfiles: [
        {
          id: 'tp-1',
          contactId: 'c-1',
          isCurrent: true,
          tenantSince: '2026-01-01',
          contact: { id: 'c-1', firstName: 'Awa', lastName: 'Koné' }
        },
        {
          id: 'tp-2',
          contactId: 'c-2',
          isCurrent: true,
          tenantSince: '2026-02-01',
          contact: { id: 'c-2', firstName: 'Ibrahim', lastName: 'Sy' }
        }
      ]
    });
    render(<LotTable lots={[lot]} onEndTenantAssignment={onEnd} />);

    expect(screen.getAllByText('Awa Koné')).toHaveLength(1);
    expect(screen.getByText('Ibrahim Sy')).toBeTruthy();
    // Un seul « Mettre fin » : l'affectation, pas le profil.
    fireEvent.click(screen.getByText("ok : Mettre fin à l'affectation de ce locataire ?"));
    expect(onEnd).toHaveBeenCalledWith(lot, assignment);
  });

  it('affiche « Non renseigné » dans la colonne Locataire sans affectation ni profil', () => {
    render(<LotTable lots={[baseLot({})]} />);
    expect(screen.getAllByText('Non renseigné').length).toBeGreaterThan(0);
  });
});

describe('SyndicLots — total de référence des tantièmes', () => {
  function mockApi(reference: number | null, shares: number[]) {
    mockApiClient.get.mockImplementation((url: string) => {
      if (url === '/tenants/tenant-1/syndics/syndic-1') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'syndic-1',
              tenantId: 'tenant-1',
              name: 'Résidence Les Palmiers',
              status: 'ACTIVE',
              totalLots: shares.length,
              totalBuildings: 0,
              totalGeneralShares: reference,
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
            data: shares.map((generalShares, index) => ({
              id: `lot-${index}`,
              syndicateId: 'syndic-1',
              lotNumber: `L${index}`,
              lotType: 'APARTMENT',
              generalShares,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }))
          }
        });
      }
      if (url.startsWith('/tenants/tenant-1/properties')) {
        return Promise.resolve({
          data: { success: true, data: [], pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } }
        });
      }
      if (url.includes('/crm/contacts')) {
        return Promise.resolve({
          data: { success: true, contacts: [], pagination: { page: 1, limit: 200, total: 0, totalPages: 0 } }
        });
      }
      return Promise.reject(new Error(`GET non prévu par le test : ${url}`));
    });
  }

  function renderPage() {
    return render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/lots']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/lots" element={<SyndicLots />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }

  beforeEach(() => vi.clearAllMocks());

  it('avertit, sans bloquer, quand la somme des tantièmes diffère du total de référence', async () => {
    mockApi(1000, [400, 500]);
    renderPage();
    expect(await screen.findByText('La somme des tantièmes (900) diffère du total de référence (1000).')).toBeTruthy();
    expect(screen.getByText('Total de référence des tantièmes')).toBeTruthy();
  });

  it("n'affiche aucune alerte sans total de référence ou quand la somme correspond", async () => {
    mockApi(null, [400, 500]);
    const first = renderPage();
    await screen.findByText('Nombre de lots');
    expect(screen.queryByText(/diffère du total de référence/)).toBeNull();
    expect(screen.queryByText('Total de référence des tantièmes')).toBeNull();
    first.unmount();

    mockApi(900, [400, 500]);
    renderPage();
    await screen.findByText('Total de référence des tantièmes');
    expect(screen.queryByText(/diffère du total de référence/)).toBeNull();
  });
});
