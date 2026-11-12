import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicsList } from '../../pages/syndics/SyndicsList';

/**
 * Liste des copropriétés : la liste arrive en entier (bornée par l'agence), la
 * recherche multicritères et la pagination (12 par page) se font en LOCAL. Les
 * copropriétés en liquidation restent exclues.
 */

const listSyndicates = vi.hoisted(() => vi.fn());
const listMandatingAgencies = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/syndic-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/syndic-service');
  return {
    ...actual,
    listSyndicates: (...args: unknown[]) => listSyndicates(...args),
    createSyndicate: vi.fn(),
    deleteSyndicate: vi.fn()
  };
});

vi.mock('../../services/document-branding-service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../services/document-branding-service');
  return { ...actual, listMandatingAgencies: (...args: unknown[]) => listMandatingAgencies(...args) };
});

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
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics${search}`]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/syndics" element={<SyndicsList />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

function syndicate(overrides: Record<string, unknown>) {
  return {
    id: 'syndic-x',
    tenantId: 'tenant-1',
    name: 'Résidence X',
    address: 'Abidjan',
    totalLots: 4,
    totalBuildings: 1,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

const T = { timeout: 8000 };

const PALMIERS = syndicate({
  id: 'syndic-1',
  name: 'Résidence Les Palmiers',
  address: 'Cocody, Abidjan',
  cadastralReference: 'CF-0042',
  mandatingAgencyId: 'agency-1',
  mandatingAgency: { id: 'agency-1', name: 'Agence Alpha' }
});
const RONIERS = syndicate({
  id: 'syndic-2',
  name: 'Résidence Les Rôniers',
  address: 'Bingerville',
  status: 'IN_DISPUTE',
  totalLots: 0
});
const LIQUIDEE = syndicate({ id: 'syndic-3', name: 'Résidence Liquidée', status: 'IN_LIQUIDATION' });

beforeEach(() => {
  vi.clearAllMocks();
  listSyndicates.mockResolvedValue([PALMIERS, RONIERS, LIQUIDEE]);
  listMandatingAgencies.mockResolvedValue([]);
});

describe('SyndicsList : recherche multicritères locale', () => {
  it('le champ libre filtre les cartes (adresse, mandant) sans accent ni casse, sans nouvel appel serveur', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Résidence Les Palmiers', undefined, T);
    expect(screen.getByText('Résidence Les Rôniers')).toBeInTheDocument();
    // Les copropriétés en liquidation restent exclues de la liste.
    expect(screen.queryByText('Résidence Liquidée')).not.toBeInTheDocument();

    const search = within(screen.getByRole('search', { name: 'Rechercher dans les copropriétés' }));
    await user.type(search.getByRole('textbox'), 'bingerville');
    await vi.waitFor(() => expect(screen.queryByText('Résidence Les Palmiers')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Résidence Les Rôniers')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=bingerville');

    // Le nom du mandant se cherche aussi.
    await user.clear(search.getByRole('textbox'));
    await user.type(search.getByRole('textbox'), 'alpha');
    await vi.waitFor(() => expect(screen.queryByText('Résidence Les Rôniers')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Résidence Les Palmiers')).toBeInTheDocument();
    expect(listSyndicates).toHaveBeenCalledTimes(1);
  });

  it('« aucun résultat » propose d’effacer les critères et rend la liste complète', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Résidence Les Palmiers', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'zzzzzz');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Résidence Les Palmiers')).not.toBeInTheDocument();

    const clear = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(clear[clear.length - 1]);
    expect(await screen.findByText('Résidence Les Palmiers', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Résidence Les Rôniers')).toBeInTheDocument();
  });

  it('le critère « Lots » de l’URL ne garde que les copropriétés sans lot', async () => {
    mount('?withLots=0');
    await screen.findByText('Résidence Les Rôniers', undefined, T);
    expect(screen.queryByText('Résidence Les Palmiers')).not.toBeInTheDocument();
  });

  it('le critère « Statut » de l’URL ne garde que les copropriétés en litige', async () => {
    mount('?status=IN_DISPUTE');
    await screen.findByText('Résidence Les Rôniers', undefined, T);
    expect(screen.queryByText('Résidence Les Palmiers')).not.toBeInTheDocument();
  });

  it('sans aucune copropriété : invite à créer, sans barre de recherche', async () => {
    listSyndicates.mockResolvedValue([]);
    mount();
    expect(await screen.findByText('Aucune copropriété trouvée', undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Créer une copropriété/ })).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('pagine localement par 12 et la recherche ramène à la page 1', async () => {
    const user = userEvent.setup();
    listSyndicates.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) =>
        syndicate({ id: `s-${index + 1}`, name: `Immeuble ${String(index + 1).padStart(2, '0')}` })
      )
    );
    mount();
    await screen.findByText('Immeuble 01', undefined, T);
    expect(screen.queryByText('Immeuble 25')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(await screen.findByText('Immeuble 25', undefined, T)).toBeInTheDocument();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'Immeuble 07');
    await vi.waitFor(() => expect(screen.queryByText('Immeuble 25')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Immeuble 07')).toBeInTheDocument();
  });
});
