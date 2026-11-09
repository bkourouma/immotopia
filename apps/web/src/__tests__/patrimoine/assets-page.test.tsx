import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetsPage } from '../../pages/patrimoine/AssetsPage';
import { formatDay } from '../../components/patrimoine/actifs/asset-format';

/** `<AssetsPage>` — liste des actifs, filtre par classe, pastille de valeur périmée et fiabilité. */

const listAssets = vi.fn();

const T = { timeout: 8000 };

vi.mock('../../services/patrimoine-assets-service', () => ({
  listAssets: (...a: unknown[]) => listAssets(...a),
  listAssetsPage: async (tenantId: string, filters: Record<string, unknown>) => {
    const all = (await listAssets(tenantId, filters)) as ReturnType<typeof actif>[];
    const text = String(filters.search ?? '').toLocaleLowerCase();
    const filtered = all.filter(
      asset =>
        (!text || asset.name.toLocaleLowerCase().includes(text)) &&
        (!filters.assetClasses || String(filters.assetClasses).split(',').includes(asset.assetClass)) &&
        (!filters.status || asset.status === filters.status) &&
        (filters.stale === undefined || asset.stale === (filters.stale === 'true'))
    );
    const page = Number(filters.page);
    const limit = Number(filters.limit);
    return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit };
  },
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
    currentValue: {
      amount: 6_000_000,
      currency: 'XOF',
      valuatedAt: '2020-01-15T00:00:00.000Z',
      valueXof: 6_000_000,
      reliability: 'LOW'
    },
    stale: true,
    outstandingDebtXof: 0,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides
  };
}

function monter(initial = '/tenant/agence-1/patrimoine/actifs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
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
  listAssets.mockResolvedValue([actif(), actif({ id: 'a2', name: 'Compte Wave', currentValue: null, stale: false })]);
});

describe('<AssetsPage>', () => {
  it('liste les actifs avec leur valeur, l’ancienneté et « sans valeur »', async () => {
    monter();

    expect(await screen.findByText('Toyota Hilux')).toBeInTheDocument();
    expect(screen.getByText('Compte Wave')).toBeInTheDocument();
    expect(screen.getByText('Valeur périmée')).toBeInTheDocument();
    expect(screen.getByText('Faible')).toBeInTheDocument();
    expect(screen.getByText('Sans valeur')).toBeInTheDocument();
    // Sans statut dans l'URL, rien d'autre ne part à l'API (le serveur exclut alors les archivés).
    expect(listAssets).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 1, limit: 25 }));
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('transmet la recherche au serveur', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findByText('Toyota Hilux', undefined, T);
    await user.type(within(screen.getByRole('search')).getByPlaceholderText(/Nom, bien lié/), 'WAVE');

    await waitFor(() => expect(screen.queryByText('Toyota Hilux')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Compte Wave')).toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledWith('agence-1', expect.objectContaining({ search: 'WAVE' }));
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
  });

  it('transmet les critères de l’URL (classe, valeur à actualiser)', async () => {
    monter('/tenant/agence-1/patrimoine/actifs?classe=VEHICLE_EQUIPMENT&stale=1');

    expect(await screen.findByText('Toyota Hilux', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Compte Wave')).not.toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledWith(
      'agence-1',
      expect.objectContaining({ assetClasses: 'VEHICLE_EQUIPMENT', stale: 'true' })
    );
  });

  it('envoie le statut à l’API (sans lui, les archivés sont exclus) et filtre le reste en local', async () => {
    listAssets.mockResolvedValue([
      actif({ id: 'a3', name: 'Ancienne remorque', status: 'ARCHIVED', stale: false }),
      actif({ id: 'a4', name: 'Compte épargne', status: 'ARCHIVED', assetClass: 'CASH', stale: false })
    ]);
    monter('/tenant/agence-1/patrimoine/actifs?status=ARCHIVED&classe=CASH');

    expect(await screen.findByText('Compte épargne', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Ancienne remorque')).not.toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledWith(
      'agence-1',
      expect.objectContaining({ status: 'ARCHIVED', assetClasses: 'CASH' })
    );
  });

  it('distingue « aucun résultat » de « aucun actif » et propose d’effacer les critères', async () => {
    const user = userEvent.setup();
    monter('/tenant/agence-1/patrimoine/actifs?q=zzzz');

    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    expect(screen.queryByText('Commencez par ajouter votre premier actif')).not.toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Toyota Hilux', undefined, T)).toBeInTheDocument();
  });

  it('affiche l’état vide avec le bouton d’ajout quand rien n’existe', async () => {
    listAssets.mockResolvedValue([]);
    monter();

    expect(await screen.findByText('Commencez par ajouter votre premier actif')).toBeInTheDocument();
  });

  it('ne signale jamais « Valeur périmée » pour un actif qui n’est pas actif', async () => {
    listAssets.mockResolvedValue([actif({ status: 'ARCHIVED', stale: true })]);
    monter();

    expect(await screen.findByText('Toyota Hilux')).toBeInTheDocument();
    expect(screen.queryByText('Valeur périmée')).not.toBeInTheDocument();
  });

  it('ne signale pas comme périmée une valeur que le serveur ne juge pas périmée', async () => {
    listAssets.mockResolvedValue([
      actif({
        stale: false,
        currentValue: {
          amount: 1_000_000,
          currency: 'XOF',
          valuatedAt: '2020-01-15T00:00:00.000Z',
          valueXof: 1_000_000,
          reliability: 'HIGH'
        }
      })
    ]);
    monter();

    expect(await screen.findByText('Élevée')).toBeInTheDocument();
    expect(screen.queryByText('Valeur périmée')).not.toBeInTheDocument();
  });

  it('affiche le jour UTC d’une date à minuit UTC, quel que soit le fuseau', () => {
    const rendu = formatDay('2026-09-29T00:00:00.000Z');
    expect(rendu).toContain('29');
    expect(rendu).not.toContain('28');
  });
});

describe('<AssetsPage> — pagination serveur', () => {
  it('affiche le total et ne demande que la première page', async () => {
    listAssets.mockResolvedValue(Array.from({ length: 501 }, (_, i) => actif({ id: `a${i}`, name: `Actif ${i}` })));
    monter();
    expect(await screen.findByText('Actif 0', undefined, T)).toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 1, limit: 25 }));
    expect(screen.getByText('501 résultats')).toBeInTheDocument();
  });
});
