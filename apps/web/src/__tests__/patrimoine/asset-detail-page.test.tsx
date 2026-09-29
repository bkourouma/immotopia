import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      notes: null,
      reliability: 'HIGH',
      reliabilityReasons: ['METHOD_EXPERT']
    }
  ]),
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
    currentValue: {
      amount: 6_000_000,
      currency: 'XOF',
      valuatedAt: '2026-06-01T00:00:00.000Z',
      valueXof: 6_000_000,
      reliability: 'HIGH'
    },
    stale: false,
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

  it('donne les raisons de la valeur courante en infobulle sur l’en-tête', async () => {
    const user = userEvent.setup();
    getAsset.mockResolvedValue(actif());
    monter();

    await screen.findByText('Cabinet Kouassi');
    const badges = screen.getAllByText('Élevée');
    await user.hover(badges[0]);

    expect(within(await screen.findByRole('tooltip')).getByText('Expertise')).toBeInTheDocument();
  });

  it('ne signale jamais « Valeur périmée » pour un actif archivé', async () => {
    getAsset.mockResolvedValue(actif({ status: 'ARCHIVED', stale: true }));
    monter();

    await screen.findByText('Cabinet Kouassi');
    expect(screen.queryByText('Valeur périmée')).not.toBeInTheDocument();
  });

  it('signale « Valeur périmée » pour un actif actif', async () => {
    getAsset.mockResolvedValue(actif({ stale: true }));
    monter();

    expect(await screen.findByText('Valeur périmée')).toBeInTheDocument();
  });

  it.each([
    [{ legalStatus: 'ATTESTATION_COUTUMIERE' }, 'Statut juridique fragile : la fiabilité de la valeur est plafonnée.'],
    [{}, 'Renseignez le statut juridique du bien pour fiabiliser sa valeur.']
  ])('rappelle le statut juridique d’un bien (%o) et ouvre l’édition', async (details, texte) => {
    const user = userEvent.setup();
    getAsset.mockResolvedValue(actif({ assetClass: 'REAL_ESTATE', propertyId: 'p1', details }));
    monter();

    expect(await screen.findByText(texte)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Modifier l'actif" }));
    expect(await screen.findByText('Modifier un actif')).toBeInTheDocument();
  });

  it('n’affiche aucun rappel pour un titre foncier ni hors immobilier', async () => {
    getAsset.mockResolvedValue(
      actif({ assetClass: 'REAL_ESTATE', propertyId: 'p1', details: { legalStatus: 'TITRE_FONCIER' } })
    );
    monter();

    await screen.findByText('Cabinet Kouassi');
    expect(screen.queryByRole('button', { name: "Modifier l'actif" })).not.toBeInTheDocument();
  });
});
