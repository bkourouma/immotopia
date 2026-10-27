import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { LotTable } from '../../components/syndics/LotTable';
import { SyndicDetail } from '../../pages/syndics/SyndicDetail';
import { SyndicLots } from '../../pages/syndics/SyndicLots';
import type { LotPortalAccess, SyndicateLot } from '../../types/syndic-types';
import apiClient from '../../utils/api-client';

/**
 * Recette du 2026-10-16 : ni la fiche de la copropriété, ni son « Résumé des
 * lots », ni la page « Lots » n'indiquaient quels copropriétaires avaient un
 * accès au portail — l'information n'existait que dans « Profils et
 * incidents ». Un testeur a cru qu'un copropriétaire n'avait pas de compte
 * alors que son accès était actif. La colonne « Portail » de `<LotTable>`
 * (partagée par la fiche et la page « Lots ») lit `portalAccess`, calculé par
 * l'API, et renvoie vers « Profils et incidents » pour inviter ou révoquer.
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

// Le bouton « Exporter » des tableaux a ses propres tests (primitives/export-menu) : ici il est neutralisé.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const mockApiClient = apiClient as any;

const PROFILS_INCIDENTS_HREF = '/tenant/tenant-1/syndics/syndic-1/profils-incidents';

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

function makeLot(
  lotNumber: string,
  portalAccess: LotPortalAccess | undefined,
  owners: NonNullable<SyndicateLot['owners']> = []
): SyndicateLot {
  return {
    id: `lot-${lotNumber}`,
    syndicateId: 'syndic-1',
    propertyId: null,
    ownerContactId: null,
    lotNumber,
    lotType: 'APARTMENT',
    generalShares: 100,
    specialShares: null,
    ownerSince: null,
    owners,
    ownersLabel: owners.map(owner => owner.name).join(', '),
    portalAccess,
    tenantAssignments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as SyndicateLot;
}

const owner = (name: string, portalAccessEnabled: boolean, percentage = 100) => ({
  contactId: `c-${name}`,
  name,
  percentage,
  ownedSince: '2021-07-02T00:00:00.000Z',
  portalAccessEnabled
});

const LOTS: SyndicateLot[] = [
  makeLot('A-101', { status: 'ACTIVE', activeCount: 1, ownerCount: 1 }, [owner('Awa Kouadio', true)]),
  makeLot('A-102', { status: 'INACTIVE', activeCount: 0, ownerCount: 1 }, [owner('Moussa Bamba', false)]),
  makeLot('A-103', { status: 'PARTIAL', activeCount: 1, ownerCount: 2 }, [
    owner('Fanta Traoré', true, 60),
    owner('Ibrahim Coulibaly', false, 40)
  ]),
  makeLot('A-104', { status: 'NONE', activeCount: 0, ownerCount: 0 })
];

function rowOf(lotNumber: string): HTMLElement {
  const row = screen.getByText(lotNumber).closest('tr');
  if (!row) throw new Error(`Ligne introuvable pour le lot ${lotNumber}`);
  return row as HTMLElement;
}

describe('LotTable — colonne « Portail »', () => {
  function renderTable(props: Partial<React.ComponentProps<typeof LotTable>> = {}) {
    return render(
      <MemoryRouter>
        <LotTable lots={LOTS} {...props} />
      </MemoryRouter>
    );
  }

  it("affiche l'état d'accès au portail de chaque lot", () => {
    renderTable({ portalManageHref: PROFILS_INCIDENTS_HREF });

    expect(screen.getByRole('columnheader', { name: 'Portail' })).toBeTruthy();
    expect(within(rowOf('A-101')).getByText('Actif')).toBeTruthy();
    expect(within(rowOf('A-102')).getByText('Inactif')).toBeTruthy();
    // Indivision : un propriétaire sur deux y a accès.
    expect(within(rowOf('A-103')).getByText('Partiel (1/2)')).toBeTruthy();
    // Aucun profil propriétaire : rien à inviter tant qu'il n'est pas créé.
    expect(within(rowOf('A-104')).getByText('Sans profil')).toBeTruthy();
  });

  it('renvoie vers « Profils et incidents » pour inviter ou révoquer, lot par lot', () => {
    renderTable({ portalManageHref: PROFILS_INCIDENTS_HREF });

    const link = within(rowOf('A-101')).getByRole('link', { name: "Gérer l'accès au portail du lot A-101" });
    expect(link.getAttribute('href')).toBe(PROFILS_INCIDENTS_HREF);
    expect(link.textContent).toBe("Gérer l'accès");
    // Même un lot sans profil y renvoie : c'est là qu'on crée le profil propriétaire.
    expect(within(rowOf('A-104')).getByRole('link', { name: /A-104/ }).getAttribute('href')).toBe(
      PROFILS_INCIDENTS_HREF
    );
  });

  it("détaille l'indivision en infobulle, propriétaire par propriétaire", () => {
    renderTable({ portalManageHref: PROFILS_INCIDENTS_HREF });

    const tag = within(rowOf('A-103')).getByText('Partiel (1/2)');
    expect(tag.getAttribute('title')).toBe('Fanta Traoré : Actif\nIbrahim Coulibaly : Inactif');
    // Un propriétaire unique n'a pas besoin de détail.
    expect(within(rowOf('A-101')).getByText('Actif').getAttribute('title')).toBeNull();
    expect(within(rowOf('A-104')).getByText('Sans profil').getAttribute('title')).toContain('Profils et incidents');
  });

  it("n'affiche aucun lien sans destination, et un tiret quand l'API n'a pas renvoyé l'état", () => {
    renderTable({ lots: [LOTS[0], makeLot('A-105', undefined)] });

    expect(screen.queryByRole('link')).toBeNull();
    expect(within(rowOf('A-101')).getByText('Actif')).toBeTruthy();
    expect(within(rowOf('A-105')).queryByText('Actif')).toBeNull();
    expect(within(rowOf('A-105')).queryByText('Inactif')).toBeNull();
    expect(within(rowOf('A-105')).getAllByText('-').length).toBeGreaterThan(0);
  });
});

function routeApi(syndicLots: SyndicateLot[]) {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url === '/tenants/tenant-1/syndics/syndic-1') {
      return Promise.resolve({
        data: {
          success: true,
          data: {
            id: 'syndic-1',
            tenantId: 'tenant-1',
            name: 'Résidence Les Jacarandas',
            address: 'Abidjan Cocody',
            totalLots: syndicLots.length,
            totalBuildings: 1,
            status: 'ACTIVE',
            property: null,
            lots: syndicLots,
            chargeCalls: [],
            funds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      });
    }
    if (url === '/tenants/tenant-1/syndics/syndic-1/lots') {
      return Promise.resolve({ data: { success: true, data: syndicLots } });
    }
    if (url === '/tenants/tenant-1/syndics/syndic-1/charges') {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    if (url === '/tenants/tenant-1/syndic-mandating-agencies') {
      return Promise.resolve({ data: { success: true, data: [] } });
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

function renderRoute(path: string, element: React.ReactElement, route: string) {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

describe('Accès au portail visible sur la fiche et la page « Lots »', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeApi(LOTS);
  });

  it('la fiche de la copropriété montre l’accès au portail dans le « Résumé des lots »', async () => {
    renderRoute('/tenant/:tenantId/syndics/:syndicId', <SyndicDetail />, '/tenant/tenant-1/syndics/syndic-1');

    await screen.findByText('Résumé des lots');
    const row = await waitFor(() => rowOf('A-103'));

    expect(within(row).getByText('Partiel (1/2)')).toBeTruthy();
    expect(within(rowOf('A-101')).getByText('Actif')).toBeTruthy();
    expect(within(rowOf('A-102')).getByText('Inactif')).toBeTruthy();
    const link = within(row).getByRole('link', { name: "Gérer l'accès au portail du lot A-103" });
    expect(link.getAttribute('href')).toBe(PROFILS_INCIDENTS_HREF);
  });

  it('la page « Lots » montre la colonne, le lien et le nombre de lots avec accès au portail', async () => {
    renderRoute('/tenant/:tenantId/syndics/:syndicId/lots', <SyndicLots />, '/tenant/tenant-1/syndics/syndic-1/lots');

    await screen.findByText('Tableau des lots');
    const row = await waitFor(() => rowOf('A-101'));

    expect(within(row).getByText('Actif')).toBeTruthy();
    expect(within(row).getByRole('link', { name: "Gérer l'accès au portail du lot A-101" }).getAttribute('href')).toBe(
      PROFILS_INCIDENTS_HREF
    );

    // A-101 (actif) et A-103 (partiel) comptent ; A-102 (inactif) et A-104 (sans profil) non.
    const stat = screen.getByText('Lots avec accès au portail').closest('.ant-card') as HTMLElement;
    expect(within(stat).getByText('2')).toBeTruthy();
  });
});
