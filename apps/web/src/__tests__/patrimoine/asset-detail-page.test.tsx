import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetDetailPage } from '../../pages/patrimoine/AssetDetailPage';

/** `<AssetDetailPage>` — onglets selon la classe, lien vers le module Biens. */

const getAsset = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  getAsset: (...a: unknown[]) => getAsset(...a),
  listHoldingEntityOptions: vi.fn().mockResolvedValue([]),
  listAssetValuations: vi.fn().mockResolvedValue([
    {
      id: 'v1',
      assetId: 'a1',
      valuatedAt: '2026-06-01T00:00:00.000Z',
      estimatedValue: 6_000_000,
      currency: 'XOF',
      method: 'EXPERT_APPRAISAL',
      source: 'Cabinet Kouassi',
      notes: null
    }
  ]),
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
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } }) }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function actif(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
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
    details: { kind: 'Pick-up', brand: 'Toyota' },
    notes: null,
    currentValue: { amount: 6_000_000, currency: 'XOF', valuatedAt: '2026-06-01T00:00:00.000Z', valueXof: 6_000_000 },
    outstandingDebtXof: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/actifs/a1']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/actifs/:assetId" element={<AssetDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAsset.mockResolvedValue(actif());
});

describe('<AssetDetailPage>', () => {
  it('affiche valeurs (méthode et source) et détenteurs pour un actif non immobilier', async () => {
    monter();

    expect(await screen.findByRole('heading', { name: 'Toyota Hilux' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Détenteurs' })).toBeInTheDocument();
    expect(await screen.findByText('Expertise')).toBeInTheDocument();
    expect(screen.getByText('Cabinet Kouassi')).toBeInTheDocument();
    expect(screen.queryByText('Ouvrir la fiche du bien')).not.toBeInTheDocument();
  });

  it('renvoie vers la fiche du bien et sans onglet Détenteurs pour l’immobilier', async () => {
    getAsset.mockResolvedValue(
      actif({
        name: 'Villa Cocody',
        assetClass: 'REAL_ESTATE',
        propertyId: 'p1',
        property: { id: 'p1', internalReference: 'BIEN-001', title: 'Villa Cocody' },
        details: {}
      })
    );
    monter();

    const lien = await screen.findByRole('link', { name: 'Ouvrir la fiche du bien' });
    expect(lien).toHaveAttribute('href', '/tenant/agence-1/properties/p1');
    expect(screen.queryByRole('tab', { name: 'Détenteurs' })).not.toBeInTheDocument();
  });

  it('propose de réessayer quand le chargement échoue', async () => {
    getAsset.mockRejectedValue(new Error('boom'));
    monter();

    expect(await screen.findByText('Impossible de charger ces données')).toBeInTheDocument();
  });
});
