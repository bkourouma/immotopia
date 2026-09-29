import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NetWorthPage } from '../../pages/patrimoine/NetWorthPage';
import { computeClassBreakdown, isNetWorthEmpty } from '../../components/patrimoine/actifs/net-worth-helpers';

/**
 * `<NetWorthPage>` — tableau de bord de la valeur nette : état vide pour un
 * nouvel utilisateur, répartition par classe, bandeau des exclusions, erreur.
 */

const getNetWorth = vi.fn();
const getNetWorthHistory = vi.fn();
const listAssets = vi.fn();
const listDebts = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  getNetWorth: (...a: unknown[]) => getNetWorth(...a),
  getNetWorthHistory: (...a: unknown[]) => getNetWorthHistory(...a),
  listAssets: (...a: unknown[]) => listAssets(...a),
  listDebts: (...a: unknown[]) => listDebts(...a),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  deleteDebt: vi.fn(),
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

const VIDE = {
  currency: 'XOF',
  asOf: '2026-09-29T00:00:00.000Z',
  totalAssets: 0,
  totalDebts: 0,
  netWorth: 0,
  byClass: [],
  assets: [],
  excluded: [],
  excludedLoans: []
};

const REMPLI = {
  currency: 'XOF',
  asOf: '2026-09-29T00:00:00.000Z',
  totalAssets: 86_400_000,
  totalDebts: 20_000_000,
  netWorth: 66_400_000,
  byClass: [
    { assetClass: 'CASH', value: 400_000, count: 1, share: 0.0046 },
    { assetClass: 'REAL_ESTATE', value: 80_000_000, count: 1, share: 0.9259 },
    { assetClass: 'VEHICLE_EQUIPMENT', value: 6_000_000, count: 1, share: 0.0694 }
  ],
  assets: [{ id: 'a1', valueXof: 80_000_000, valuatedAt: '2026-09-01T00:00:00.000Z' }],
  excluded: [{ assetId: 'a9', reason: 'NO_VALUATION' }],
  excludedLoans: []
};

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/valeur-nette']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/valeur-nette" element={<NetWorthPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getNetWorth.mockResolvedValue(VIDE);
  getNetWorthHistory.mockResolvedValue([]);
  listAssets.mockResolvedValue([{ id: 'a9', name: 'Stock de riz' }]);
  listDebts.mockResolvedValue([]);
});

describe('<NetWorthPage>', () => {
  it('invite un nouvel utilisateur à ajouter son premier actif, sans tableau de zéros', async () => {
    monter();

    expect(await screen.findByText('Commencez par ajouter votre premier actif')).toBeInTheDocument();
    expect(screen.queryByText('Total des actifs')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ajouter un actif/ }).length).toBeGreaterThan(0);
  });

  it('affiche totaux, répartition par classe avec parts et actifs exclus', async () => {
    getNetWorth.mockResolvedValue(REMPLI);
    monter();

    expect(await screen.findByText('Total des actifs')).toBeInTheDocument();
    expect(screen.getByText('Total des dettes')).toBeInTheDocument();
    expect(screen.getAllByText(/66\s400\s000/).length).toBeGreaterThan(0);
    expect(screen.getByText('Immobilier')).toBeInTheDocument();
    expect(screen.getByText('Véhicules et équipements')).toBeInTheDocument();
    expect(screen.getByText(/92,6/)).toBeInTheDocument();
    expect(await screen.findByText('Stock de riz')).toBeInTheDocument();
    expect(screen.getByText(/Sans valeur/)).toBeInTheDocument();
  });

  it('propose de réessayer quand le chargement échoue', async () => {
    const user = userEvent.setup();
    getNetWorth.mockRejectedValueOnce(new Error('boom'));
    monter();

    expect(await screen.findByText('Impossible de charger ces données')).toBeInTheDocument();
    getNetWorth.mockResolvedValue(REMPLI);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Total des actifs')).toBeInTheDocument();
  });
});

describe('répartition par classe — calcul d’affichage', () => {
  it('recalcule les parts depuis les valeurs et trie par valeur décroissante', () => {
    const rows = computeClassBreakdown({
      totalAssets: 100,
      byClass: [
        { assetClass: 'CASH', value: 25, count: 1, share: 25 },
        { assetClass: 'REAL_ESTATE', value: 75, count: 2, share: 75 },
        { assetClass: 'OTHER', value: 0, count: 0, share: 0 }
      ]
    });

    expect(rows.map(row => row.assetClass)).toEqual(['REAL_ESTATE', 'CASH']);
    expect(rows[0].share).toBeCloseTo(0.75);
    expect(rows[1].share).toBeCloseTo(0.25);
  });

  it('reconnaît l’état vide', () => {
    expect(isNetWorthEmpty(VIDE as never)).toBe(true);
    expect(isNetWorthEmpty({ ...VIDE, totalDebts: 5 } as never)).toBe(false);
  });
});
