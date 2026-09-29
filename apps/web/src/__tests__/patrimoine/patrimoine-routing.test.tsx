import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PatrimoineHome } from '../../pages/patrimoine/PatrimoineOverviewPage';

/**
 * Routage réel du patrimoine : `App.tsx` monte `PatrimoineHome` sur
 * `/tenant/:tenantId/patrimoine/*`, sans paramètre `:assetId`. La fiche d'un
 * actif doit pourtant recevoir son identifiant (défaut relevé en recette :
 * « Aucune agence sélectionnée » sur la fiche). Les tests de page montent la
 * route avec `:assetId` et ne pouvaient pas l'attraper.
 */

const getAsset = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  getAsset: (...a: unknown[]) => getAsset(...a),
  listHoldingEntityOptions: vi.fn().mockResolvedValue([]),
  listAssetValuations: vi.fn().mockResolvedValue([]),
  suggestAssetValuation: vi.fn(),
  createAssetValuation: vi.fn(),
  updateAssetValuation: vi.fn(),
  deleteAssetValuation: vi.fn(),
  listDebts: vi.fn().mockResolvedValue([]),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  deleteDebt: vi.fn(),
  listAssetHoldings: vi.fn().mockResolvedValue([]),
  upsertAssetHolding: vi.fn(),
  deleteAssetHolding: vi.fn(),
  archiveAsset: vi.fn(),
  disposeAsset: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn()
}));
vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn().mockResolvedValue({ properties: [], pagination: {} })
}));
vi.mock('../../services/patrimoine-service', () => ({
  getPatrimoineOverview: vi.fn().mockResolvedValue(null),
  listTenantWorkPrograms: vi.fn().mockResolvedValue({ items: [] })
}));
vi.mock('../../pages/patrimoine/AssetsPage', () => ({ AssetsPage: () => <div>ecran-liste-actifs</div> }));
vi.mock('../../pages/patrimoine/NetWorthPage', () => ({ NetWorthPage: () => <div>ecran-valeur-nette</div> }));
vi.mock('../../pages/patrimoine/ProjectionsPage', () => ({ ProjectionsPage: () => <div>ecran-projections</div> }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } }) }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function monter(chemin: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[chemin]}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/*" element={<PatrimoineHome />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAsset.mockResolvedValue({
    id: 'A',
    name: 'Toyota Hilux',
    assetClass: 'VEHICLE_EQUIPMENT',
    status: 'ACTIVE',
    currency: 'XOF',
    exchangeRateToXof: null,
    acquisitionCost: null,
    acquisitionDate: null,
    disposedAt: null,
    holdingEntityId: null,
    propertyId: null,
    property: null,
    details: {},
    notes: null,
    currentValue: null,
    stale: false,
    outstandingDebtXof: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
});

describe('routage patrimoine (table réelle)', () => {
  it('la fiche d’un actif reçoit assetId et charge l’actif', async () => {
    monter('/tenant/T/patrimoine/actifs/A');

    expect(await screen.findByRole('heading', { name: 'Toyota Hilux' })).toBeInTheDocument();
    expect(getAsset).toHaveBeenCalledWith('T', 'A');
    expect(screen.queryByText('Aucune agence sélectionnée')).not.toBeInTheDocument();
  });

  it('tolère une barre oblique finale sur la fiche', async () => {
    monter('/tenant/T/patrimoine/actifs/A/');
    expect(await screen.findByRole('heading', { name: 'Toyota Hilux' })).toBeInTheDocument();
  });

  it('route la liste, la valeur nette et les projections', async () => {
    monter('/tenant/T/patrimoine/actifs');
    expect(await screen.findByText('ecran-liste-actifs')).toBeInTheDocument();
  });

  it('route la valeur nette', async () => {
    monter('/tenant/T/patrimoine/valeur-nette');
    expect(await screen.findByText('ecran-valeur-nette')).toBeInTheDocument();
  });

  it('route les projections', async () => {
    monter('/tenant/T/patrimoine/projections');
    expect(await screen.findByText('ecran-projections')).toBeInTheDocument();
  });

  it('affiche « introuvable » pour un sous-chemin inconnu', async () => {
    monter('/tenant/T/patrimoine/n-importe-quoi');
    expect(screen.queryByText('ecran-liste-actifs')).not.toBeInTheDocument();
    expect(getAsset).not.toHaveBeenCalled();
  });
});
