import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicProfilesIncidents } from '../../pages/syndics/SyndicProfilesIncidents';

/**
 * Profils lot et incidents : trois onglets paresseux (`?tab=`), chacun avec sa
 * barre de recherche LOCALE (listes reçues en entier) et son préfixe d’URL :
 * propriétaires (`po.`), locataires (`pl.`), incidents (`in.`).
 */

const isDesktop = vi.hoisted(() => ({ value: true }));
const listLotOwnerProfilesWithSummary = vi.hoisted(() => vi.fn());
const listLotTenantProfiles = vi.hoisted(() => vi.fn());
const listSyndicIncidents = vi.hoisted(() => vi.fn());
const listSyndicateLots = vi.hoisted(() => vi.fn());
const listProvidersContracts = vi.hoisted(() => vi.fn());
const listContacts = vi.hoisted(() => vi.fn());
const listProperties = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/syndic-service');
  return {
    ...actual,
    listLotOwnerProfilesWithSummary: (...args: unknown[]) => listLotOwnerProfilesWithSummary(...args),
    listLotTenantProfiles: (...args: unknown[]) => listLotTenantProfiles(...args),
    listSyndicIncidents: (...args: unknown[]) => listSyndicIncidents(...args),
    listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
    listProvidersContracts: (...args: unknown[]) => listProvidersContracts(...args)
  };
});

vi.mock('../../services/crm-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/crm-service');
  return { ...actual, listContacts: (...args: unknown[]) => listContacts(...args) };
});

vi.mock('../../services/property-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/property-service');
  return { ...actual, listProperties: (...args: unknown[]) => listProperties(...args) };
});

vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

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

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function mount(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={client}>
        <AntApp>
          <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1/profils-incidents${search}`]}>
            <Url />
            <Routes>
              <Route
                path="/tenant/:tenantId/syndics/:syndicId/profils-incidents"
                element={<SyndicProfilesIncidents />}
              />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

const LOTS = [
  { id: 'lot-1', lotNumber: 'A01' },
  { id: 'lot-2', lotNumber: 'B02' }
];

const OWNERS = [
  {
    id: 'op-1',
    lotId: 'lot-1',
    contactId: 'c-1',
    ownershipPercentage: 100,
    ownedSince: '2024-01-01T00:00:00.000Z',
    portalAccessEnabled: true,
    isActive: true,
    contact: { id: 'c-1', firstName: 'Awa', lastName: 'Koné', email: 'awa@example.com', phone: '0102030405' }
  },
  {
    id: 'op-2',
    lotId: 'lot-2',
    contactId: 'c-2',
    ownershipPercentage: 60,
    ownedSince: '2024-01-01T00:00:00.000Z',
    portalAccessEnabled: false,
    isActive: true,
    contact: { id: 'c-2', firstName: 'Fabrice', lastName: 'Aka', email: 'fabrice@example.com', phone: '0708091011' }
  },
  {
    id: 'op-3',
    lotId: 'lot-1',
    contactId: 'c-3',
    ownershipPercentage: 100,
    ownedSince: '2018-01-01T00:00:00.000Z',
    ownedUntil: '2020-01-01T00:00:00.000Z',
    portalAccessEnabled: false,
    isActive: true,
    contact: { id: 'c-3', firstName: 'Yao', lastName: 'Brou', email: 'yao@example.com', phone: null }
  }
];

const TENANTS = [
  {
    id: 'tp-1',
    lotId: 'lot-1',
    contactId: 'c-4',
    tenantSince: '2025-01-01T00:00:00.000Z',
    chargesBilledToTenant: true,
    isCurrent: true,
    contact: { id: 'c-4', firstName: 'Mariam', lastName: 'Diallo', email: 'mariam@example.com', phone: '0505050505' }
  },
  {
    id: 'tp-2',
    lotId: 'lot-2',
    contactId: 'c-5',
    tenantSince: '2022-01-01T00:00:00.000Z',
    tenantUntil: '2023-01-01T00:00:00.000Z',
    chargesBilledToTenant: false,
    isCurrent: false,
    contact: { id: 'c-5', firstName: 'Serge', lastName: 'Yapi', email: 'serge@example.com', phone: null }
  }
];

const INCIDENTS = [
  {
    id: 'i-1',
    lotId: 'lot-1',
    incidentType: 'LEAK',
    urgency: 'HIGH',
    description: 'Fuite colonne montante',
    status: 'REPORTED',
    reportedAt: '2026-01-10T10:00:00.000Z',
    providerId: 'prov-1',
    imputations: []
  },
  {
    id: 'i-2',
    lotId: 'lot-2',
    incidentType: 'BREAKDOWN',
    urgency: 'LOW',
    description: 'Ascenseur en panne',
    status: 'RESOLVED',
    reportedAt: '2026-03-05T10:00:00.000Z',
    providerId: 'prov-2',
    imputations: [
      {
        id: 'imp-1',
        incidentId: 'i-2',
        imputationType: 'SYNDICATE_BUDGET',
        amount: 5000,
        createdAt: '2026-03-06T10:00:00.000Z'
      }
    ]
  }
];

const T = { timeout: 8000 };
const FILTRES_SANS_RESULTAT = 'Aucun élément ne correspond aux filtres appliqués.';

beforeEach(() => {
  isDesktop.value = true;
  vi.clearAllMocks();
  listLotOwnerProfilesWithSummary.mockResolvedValue({
    items: OWNERS,
    incompleteLots: [{ lotId: 'lot-2', lotNumber: 'B02', totalPercentage: 60 }]
  });
  listLotTenantProfiles.mockResolvedValue(TENANTS);
  listSyndicIncidents.mockResolvedValue(INCIDENTS);
  listSyndicateLots.mockResolvedValue(LOTS);
  listProvidersContracts.mockResolvedValue({
    providers: [
      { id: 'prov-1', name: 'Hydro-Tech' },
      { id: 'prov-2', name: 'Ascenseurs Pro' }
    ],
    contracts: [],
    commonAssets: []
  });
  listContacts.mockResolvedValue({ contacts: [], pagination: { total: 0 } });
  listProperties.mockResolvedValue({ properties: [], pagination: { total: 0 } });
});

describe('SyndicProfilesIncidents : onglets paresseux', () => {
  it('seule la liste de l’onglet affiché est demandée : les locataires à l’ouverture de leur onglet', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Awa Koné', undefined, T);

    expect(listLotOwnerProfilesWithSummary).toHaveBeenCalledTimes(1);
    expect(listLotTenantProfiles).not.toHaveBeenCalled();
    expect(listSyndicIncidents).not.toHaveBeenCalled();
    // Ni prestataires ni contacts avant d’en avoir besoin.
    expect(listProvidersContracts).not.toHaveBeenCalled();
    expect(listContacts).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Profils locataires' }));
    await screen.findByText('Mariam Diallo', undefined, T);
    expect(listLotTenantProfiles).toHaveBeenCalledWith('tenant-1', 'syndic-1');
    expect(listSyndicIncidents).not.toHaveBeenCalled();
    expect(screen.getByTestId('url').textContent).toContain('tab=locataires');
  });

  it('?tab=incidents ouvre l’onglet des incidents sans charger les profils', async () => {
    mount('?tab=incidents');
    await screen.findByText('Fuite colonne montante', undefined, T);
    expect(screen.getByRole('search', { name: 'Rechercher dans les incidents' })).toBeInTheDocument();
    expect(listSyndicIncidents).toHaveBeenCalledTimes(1);
    expect(listProvidersContracts).toHaveBeenCalledTimes(1);
    expect(listLotOwnerProfilesWithSummary).not.toHaveBeenCalled();
    expect(listLotTenantProfiles).not.toHaveBeenCalled();
  });

  it('le bandeau des quotes-parts incomplètes reste visible dans l’onglet propriétaires', async () => {
    mount();
    expect(await screen.findByText('Quotes-parts incomplètes', undefined, T)).toBeInTheDocument();
    expect(screen.getByText(/Lot B02 : 60 % attribués/)).toBeInTheDocument();
  });
});

describe('SyndicProfilesIncidents : recherche des profils propriétaires', () => {
  it('la saisie filtre la liste locale sans accent ni casse, sans nouvel appel serveur', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Awa Koné', undefined, T);
    expect(screen.getByText('Fabrice Aka')).toBeInTheDocument();

    const bar = screen.getByRole('search', { name: 'Rechercher dans les profils propriétaires' });
    await user.type(within(bar).getByRole('textbox'), 'KONE');
    await vi.waitFor(() => expect(screen.queryByText('Fabrice Aka')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('po.q=KONE');
    expect(listLotOwnerProfilesWithSummary).toHaveBeenCalledTimes(1);
  });

  it('le champ libre trouve aussi un numéro de lot et un téléphone', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Awa Koné', undefined, T);
    const bar = screen.getByRole('search', { name: 'Rechercher dans les profils propriétaires' });

    await user.type(within(bar).getByRole('textbox'), 'B02');
    await vi.waitFor(() => expect(screen.queryByText('Awa Koné')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Fabrice Aka')).toBeInTheDocument();

    await user.clear(within(bar).getByRole('textbox'));
    await user.type(within(bar).getByRole('textbox'), '0102');
    await vi.waitFor(() => expect(screen.queryByText('Fabrice Aka')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
  });

  it('les critères de l’URL filtrent : accès au portail, ancien propriétaire, quote-part incomplète', async () => {
    const view = mount('?po.portal=0&po.situation=current');
    await screen.findByText('Fabrice Aka', undefined, T);
    expect(screen.queryByText('Awa Koné')).not.toBeInTheDocument();
    expect(screen.queryByText('Yao Brou')).not.toBeInTheDocument();
    view.unmount();

    const former = mount('?po.situation=former');
    await screen.findByText('Yao Brou', undefined, T);
    expect(screen.queryByText('Awa Koné')).not.toBeInTheDocument();
    former.unmount();

    mount('?po.incomplete=1');
    await screen.findByText('Fabrice Aka', undefined, T);
    expect(screen.queryByText('Awa Koné')).not.toBeInTheDocument();
  });

  it('aucun résultat : propose d’effacer les critères, puis la liste revient', async () => {
    const user = userEvent.setup();
    mount('?po.q=zzz');
    expect(await screen.findByText(FILTRES_SANS_RESULTAT, undefined, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('po.q='), T);
    expect(await screen.findByText('Awa Koné', undefined, T)).toBeInTheDocument();
  });
});

describe('SyndicProfilesIncidents : recherche des profils locataires', () => {
  it('la saisie filtre la liste locale', async () => {
    const user = userEvent.setup();
    mount('?tab=locataires');
    await screen.findByText('Mariam Diallo', undefined, T);
    expect(screen.getByText('Serge Yapi')).toBeInTheDocument();

    const bar = screen.getByRole('search', { name: 'Rechercher dans les profils locataires' });
    await user.type(within(bar).getByRole('textbox'), 'yapi');
    await vi.waitFor(() => expect(screen.queryByText('Mariam Diallo')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Serge Yapi')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('pl.q=yapi');
    expect(listLotTenantProfiles).toHaveBeenCalledTimes(1);
  });

  it('le critère « Statut » (actuel / terminé) de l’URL filtre les lignes', async () => {
    mount('?tab=locataires&pl.situation=former');
    await screen.findByText('Serge Yapi', undefined, T);
    expect(screen.queryByText('Mariam Diallo')).not.toBeInTheDocument();
  });

  it('aucun résultat : propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mount('?tab=locataires&pl.q=zzz');
    expect(await screen.findByText(FILTRES_SANS_RESULTAT, undefined, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Mariam Diallo', undefined, T)).toBeInTheDocument();
  });
});

describe('SyndicProfilesIncidents : recherche des incidents', () => {
  it('la saisie filtre la liste locale sur la description ou le prestataire', async () => {
    const user = userEvent.setup();
    mount('?tab=incidents');
    await screen.findByText('Fuite colonne montante', undefined, T);
    expect(screen.getByText('Ascenseur en panne')).toBeInTheDocument();

    const bar = screen.getByRole('search', { name: 'Rechercher dans les incidents' });
    await user.type(within(bar).getByRole('textbox'), 'ascenseurs pro');
    await vi.waitFor(() => expect(screen.queryByText('Fuite colonne montante')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Ascenseur en panne')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('in.q=ascenseurs+pro');
    expect(listSyndicIncidents).toHaveBeenCalledTimes(1);
  });

  it('les critères de l’URL filtrent : statut multiple, urgence, prestataire, imputation, période', async () => {
    const statut = mount('?tab=incidents&in.status=RESOLVED,CLOSED');
    await screen.findByText('Ascenseur en panne', undefined, T);
    expect(screen.queryByText('Fuite colonne montante')).not.toBeInTheDocument();
    statut.unmount();

    const urgence = mount('?tab=incidents&in.urgency=HIGH,CRITICAL');
    await screen.findByText('Fuite colonne montante', undefined, T);
    expect(screen.queryByText('Ascenseur en panne')).not.toBeInTheDocument();
    urgence.unmount();

    const prestataire = mount('?tab=incidents&in.provider=prov-2');
    await screen.findByText('Ascenseur en panne', undefined, T);
    expect(screen.queryByText('Fuite colonne montante')).not.toBeInTheDocument();
    prestataire.unmount();

    const sansImputation = mount('?tab=incidents&in.imputed=0');
    await screen.findByText('Fuite colonne montante', undefined, T);
    expect(screen.queryByText('Ascenseur en panne')).not.toBeInTheDocument();
    sansImputation.unmount();

    mount('?tab=incidents&in.reportedFrom=2026-02-01&in.reportedTo=2026-03-31');
    await screen.findByText('Ascenseur en panne', undefined, T);
    expect(screen.queryByText('Fuite colonne montante')).not.toBeInTheDocument();
  });

  it('aucun résultat : propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    mount('?tab=incidents&in.q=zzz');
    expect(await screen.findByText(FILTRES_SANS_RESULTAT, undefined, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('in.q='), T);
    expect(await screen.findByText('Fuite colonne montante', undefined, T)).toBeInTheDocument();
  });
});
