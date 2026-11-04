import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkProgramsPage } from '../../pages/patrimoine/work-programs/WorkProgramsPage';
import { PatrimoineOverviewPage } from '../../pages/patrimoine/PatrimoineOverviewPage';

/**
 * Écrans Patrimoine — la fin du pire N+1 de l'application (§8.4).
 *
 * Les deux écrans chargeaient jusqu'à 100 biens, puis lançaient une requête de
 * travaux **par bien** : jusqu'à 101 requêtes au montage, là où le §10.1 en
 * autorise trois. Ces tests comptent les appels, ce que rien d'autre ne fait.
 */

const listTenantWorkPrograms = vi.fn();
const getPatrimoineOverview = vi.fn();
const listWorkPrograms = vi.fn();
const listProperties = vi.fn();
const getProperty = vi.fn();

vi.mock('../../services/patrimoine-service', () => ({
  listTenantWorkPrograms: (...a: unknown[]) => listTenantWorkPrograms(...a),
  getPatrimoineOverview: (...a: unknown[]) => getPatrimoineOverview(...a),
  listWorkPrograms: (...a: unknown[]) => listWorkPrograms(...a)
}));

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a),
  getProperty: (...a: unknown[]) => getProperty(...a)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function programme(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-1',
    propertyId: 'prop-1',
    tenantId: 'agence-1',
    title: 'Réfection de la toiture',
    estimatedCost: 18_500_000,
    currency: 'XOF',
    plannedDate: '2026-06-15T00:00:00.000Z',
    status: 'PLANNED',
    isCapitalized: true,
    property: { id: 'prop-1', title: 'Villa Angré', internalReference: 'BIEN-0001' },
    ...overrides
  };
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function monter(ui: React.ReactNode, chemin: string, url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Url />
          <Routes>
            <Route path={chemin} element={ui} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listTenantWorkPrograms.mockResolvedValue({
    items: [programme()],
    total: 1,
    page: 1,
    limit: 25,
    totalPages: 1
  });
  getProperty.mockResolvedValue({ id: 'prop-1', title: 'Villa Angré', internalReference: 'BIEN-0001' });
  getPatrimoineOverview.mockResolvedValue({
    totalProperties: 57,
    occupiedProperties: 49,
    occupancyRate: 0.86,
    totalEstimatedValue: 4_820_000_000,
    totalLoanBalance: 1_150_000_000,
    totalExpensesThisYear: 96_400_000,
    totalAnnualRent: 412_000_000
  });
});

describe('Programmes de travaux — une requête, filtrée au serveur', () => {
  it('n’appelle jamais la liste des travaux bien par bien', async () => {
    // Le défaut d'origine : une requête par bien, jusqu'à 100.
    monter(
      <WorkProgramsPage />,
      '/tenant/:tenantId/patrimoine/work-programs',
      '/tenant/agence-1/patrimoine/work-programs'
    );

    await waitFor(() => expect(listTenantWorkPrograms).toHaveBeenCalled());
    expect(listWorkPrograms).not.toHaveBeenCalled();
    expect(listProperties).not.toHaveBeenCalled();
    expect(listTenantWorkPrograms).toHaveBeenCalledTimes(1);
  });

  it('transmet le statut de l’URL au serveur, sans filtrer en mémoire', async () => {
    monter(
      <WorkProgramsPage />,
      '/tenant/:tenantId/patrimoine/work-programs',
      '/tenant/agence-1/patrimoine/work-programs?status=IN_PROGRESS'
    );

    await waitFor(() => expect(listTenantWorkPrograms).toHaveBeenCalled());
    expect(listTenantWorkPrograms.mock.calls[0][1]).toMatchObject({ status: 'IN_PROGRESS', page: 1, limit: 25 });
  });

  it('plafonne à 100 la taille de page envoyée, sans erreur, pour un lien limit=500', async () => {
    monter(
      <WorkProgramsPage />,
      '/tenant/:tenantId/patrimoine/work-programs',
      '/tenant/agence-1/patrimoine/work-programs?limit=500'
    );

    await waitFor(() => expect(listTenantWorkPrograms).toHaveBeenCalled());
    expect(listTenantWorkPrograms.mock.calls[0][1]).toMatchObject({ limit: 100 });
    expect(await screen.findByText('Villa Angré', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(/Impossible de charger|Erreur/i)).not.toBeInTheDocument();
  });

  it('affiche le bien joint, sans appel supplémentaire', async () => {
    // La jointure serveur évite de charger les biens pour leurs seuls titres.
    monter(
      <WorkProgramsPage />,
      '/tenant/:tenantId/patrimoine/work-programs',
      '/tenant/agence-1/patrimoine/work-programs'
    );

    expect(await screen.findByText('Villa Angré', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(listProperties).not.toHaveBeenCalled();
  });
});

describe('Programmes de travaux — recherche multicritères', () => {
  const CHEMIN = '/tenant/:tenantId/patrimoine/work-programs';
  const URL_PAGE = '/tenant/agence-1/patrimoine/work-programs';
  const T = { timeout: 8000 };

  it('envoie la saisie au serveur après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    monter(<WorkProgramsPage />, CHEMIN, URL_PAGE);
    await screen.findByText('Villa Angré', {}, T);

    await user.type(within(screen.getByRole('search')).getByPlaceholderText('Programme, bien, référence…'), 'toiture');

    await waitFor(
      () =>
        expect(listTenantWorkPrograms).toHaveBeenLastCalledWith('agence-1', { search: 'toiture', page: 1, limit: 25 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=toiture');
  });

  it('applique les critères d’une URL partagée : statuts, bien, date prévue et coût estimé', async () => {
    monter(
      <WorkProgramsPage />,
      CHEMIN,
      `${URL_PAGE}?status=PLANNED,IN_PROGRESS&propertyId=prop-1&plannedFrom=2026-01-01&plannedTo=2026-12-31&costMin=1000000&costMax=20000000`
    );

    await screen.findByText('Villa Angré', {}, T);
    expect(listTenantWorkPrograms).toHaveBeenCalledWith('agence-1', {
      status: 'PLANNED,IN_PROGRESS',
      propertyId: 'prop-1',
      plannedFrom: '2026-01-01',
      plannedTo: '2026-12-31',
      minCost: 1000000,
      maxCost: 20000000,
      page: 1,
      limit: 25
    });
    // Le libellé de la puce du bien vient de la même source que la liste d’options.
    await waitFor(() => expect(getProperty).toHaveBeenCalledWith('agence-1', 'prop-1'), T);
  });

  it('n’envoie pas une borne de coût négative', async () => {
    monter(<WorkProgramsPage />, CHEMIN, `${URL_PAGE}?costMin=-5&costMax=100`);

    await screen.findByText('Villa Angré', {}, T);
    expect(listTenantWorkPrograms).toHaveBeenCalledWith('agence-1', { maxCost: 100, page: 1, limit: 25 });
    expect(listTenantWorkPrograms.mock.calls.every(([, params]) => !('minCost' in (params as object)))).toBe(true);
  });

  it('propose d’effacer les critères quand rien ne correspond, puis revient à la liste complète', async () => {
    const user = userEvent.setup();
    listTenantWorkPrograms.mockImplementation(async (_agence: string, params: Record<string, unknown>) => ({
      items: params.search ? [] : [programme()],
      total: params.search ? 0 : 1,
      page: 1,
      limit: 25,
      totalPages: 1
    }));
    monter(<WorkProgramsPage />, CHEMIN, `${URL_PAGE}?q=zzz`);

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Villa Angré', {}, T)).toBeInTheDocument();
    expect(listTenantWorkPrograms).toHaveBeenLastCalledWith('agence-1', { page: 1, limit: 25 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('le sous-titre annonce le total du serveur, pas la longueur de la page', async () => {
    listTenantWorkPrograms.mockResolvedValue({ items: [programme()], total: 42, page: 1, limit: 25, totalPages: 2 });
    monter(<WorkProgramsPage />, CHEMIN, URL_PAGE);

    expect(await screen.findByText('42 programmes', {}, T)).toBeInTheDocument();
  });
});

describe('Aperçu patrimoine — deux requêtes au montage', () => {
  it('ne charge ni les biens, ni les travaux bien par bien', async () => {
    monter(<PatrimoineOverviewPage />, '/tenant/:tenantId/patrimoine', '/tenant/agence-1/patrimoine');

    await waitFor(() => expect(getPatrimoineOverview).toHaveBeenCalled());
    await waitFor(() => expect(listTenantWorkPrograms).toHaveBeenCalled());

    expect(listProperties).not.toHaveBeenCalled();
    expect(listWorkPrograms).not.toHaveBeenCalled();
    // Deux appels au total : l'agrégat et les travaux. Le §10.1 en autorise
    // trois ; l'ancienne version en faisait jusqu'à 101.
    expect(getPatrimoineOverview.mock.calls.length + listTenantWorkPrograms.mock.calls.length).toBe(2);
  });

  it('n’expose plus l’adresse technique dans le libellé du bouton', async () => {
    // « Voir les biens (/properties) » : une route dans un bouton n'apprend
    // rien à qui le lit.
    monter(<PatrimoineOverviewPage />, '/tenant/:tenantId/patrimoine', '/tenant/agence-1/patrimoine');

    expect(await screen.findByRole('button', { name: 'Voir les biens' }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(/\/properties/)).not.toBeInTheDocument();
  });

  it('met les libellés en français, accentués', async () => {
    // « Valeur estimee totale », « Encours credits », « Charges annuelles »
    // étaient écrits sans accents (§3.5).
    monter(<PatrimoineOverviewPage />, '/tenant/:tenantId/patrimoine', '/tenant/agence-1/patrimoine');

    expect(await screen.findByText('Valeur estimée totale', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Encours de crédits')).toBeInTheDocument();
    expect(screen.queryByText('Valeur estimee totale')).not.toBeInTheDocument();
  });

  it('formate le taux d’occupation à la française', async () => {
    // « 86.00 % » avec un point décimal était rendu par `<Statistic>`.
    monter(<PatrimoineOverviewPage />, '/tenant/:tenantId/patrimoine', '/tenant/agence-1/patrimoine');

    const taux = await screen.findByText(/86,0/, {}, { timeout: 8000 });
    expect(taux).toBeInTheDocument();
  });
});
