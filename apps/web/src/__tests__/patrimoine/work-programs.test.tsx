import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

vi.mock('../../services/patrimoine-service', () => ({
  listTenantWorkPrograms: (...a: unknown[]) => listTenantWorkPrograms(...a),
  getPatrimoineOverview: (...a: unknown[]) => getPatrimoineOverview(...a),
  listWorkPrograms: (...a: unknown[]) => listWorkPrograms(...a)
}));

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
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

function monter(ui: React.ReactNode, chemin: string, url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
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
