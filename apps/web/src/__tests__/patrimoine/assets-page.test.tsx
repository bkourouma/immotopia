import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetsPage } from '../../pages/patrimoine/AssetsPage';
import { formatDay, isValuationStale } from '../../components/patrimoine/actifs/asset-format';

/** `<AssetsPage>` — liste des actifs, filtre par classe, ancienneté de la valeur. */

const listAssets = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  listAssets: (...a: unknown[]) => listAssets(...a),
  listLinkedPropertyIds: vi.fn().mockResolvedValue([]),
  createAsset: vi.fn(),
  updateAsset: vi.fn()
}));

vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn().mockResolvedValue({ properties: [], pagination: {} })
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

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
    details: {},
    notes: null,
    currentValue: { amount: 6_000_000, currency: 'XOF', valuatedAt: '2020-01-15T00:00:00.000Z', valueXof: 6_000_000 },
    outstandingDebtXof: 0,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides
  };
}

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/actifs']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/actifs" element={<AssetsPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listAssets.mockResolvedValue([actif(), actif({ id: 'a2', name: 'Compte Wave', currentValue: null })]);
});

describe('<AssetsPage>', () => {
  it('liste les actifs avec leur valeur, l’ancienneté et « sans valeur »', async () => {
    monter();

    expect(await screen.findByText('Toyota Hilux')).toBeInTheDocument();
    expect(screen.getByText('Compte Wave')).toBeInTheDocument();
    expect(screen.getByText('valeur de plus de 12 mois')).toBeInTheDocument();
    expect(screen.getByText('Sans valeur')).toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledWith('agence-1', {
      assetClass: undefined,
      status: undefined,
      search: undefined
    });
  });

  it('filtre par classe côté serveur', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findByText('Toyota Hilux');
    await user.click(screen.getByLabelText('Filtrer par classe'));
    await user.click(await screen.findByTitle('Véhicules et équipements'));

    await waitFor(() =>
      expect(listAssets).toHaveBeenCalledWith('agence-1', {
        assetClass: 'VEHICLE_EQUIPMENT',
        status: undefined,
        search: undefined
      })
    );
  });

  it('affiche l’état vide avec le bouton d’ajout quand rien n’existe', async () => {
    listAssets.mockResolvedValue([]);
    monter();

    expect(await screen.findByText('Commencez par ajouter votre premier actif')).toBeInTheDocument();
  });

  it('signale une valeur de plus de 12 mois', () => {
    const now = new Date('2026-09-29T00:00:00Z');
    expect(isValuationStale('2025-08-01T00:00:00Z', now)).toBe(true);
    expect(isValuationStale('2026-03-01T00:00:00Z', now)).toBe(false);
  });

  it('affiche le jour UTC d’une date à minuit UTC, quel que soit le fuseau', () => {
    const rendu = formatDay('2026-09-29T00:00:00.000Z');
    expect(rendu).toContain('29');
    expect(rendu).not.toContain('28');
  });
});
