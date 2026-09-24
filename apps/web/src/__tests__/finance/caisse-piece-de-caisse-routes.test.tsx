import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Caisse } from '../../pages/finance/Caisse';
import { PieceDeCaisse } from '../../pages/finance/PieceDeCaisse';
import type { ConstructionSite } from '../../types/finance-lot2-types';

/**
 * Régression : `/tenant/:tenantId/finance/caisse` et la pièce de caisse ont
 * longtemps partagé la MÊME adresse dans `App.tsx` — à égalité de route,
 * React Router garde la première déclarée (Caisse), si bien que
 * `PieceDeCaisse` n'était jamais rendue, quel que soit le lien visé (le
 * bouton « Nouvelle pièce de caisse » d'un chantier compris). Depuis le 24
 * septembre 2026, la pièce de caisse a sa propre adresse :
 * `/tenant/:tenantId/finance/pieces-de-caisse`.
 *
 * Ce test rejoue les DEUX adresses telles que déclarées dans `App.tsx` et
 * vérifie que chacune rend bien son propre écran, et que le `?chantierId=`
 * arrivant sur la nouvelle adresse préselectionne bien le chantier — comme
 * `ChantierDetail.tsx` le fait depuis son bouton.
 */

const getCurrentCashSession = vi.fn();
const openCashSession = vi.fn();
const closeCashSession = vi.fn();
const validateCashSession = vi.fn();
const listCashSessions = vi.fn();
const getCashSession = vi.fn();

vi.mock('../../services/cash-sessions-service', () => ({
  getCurrentCashSession: (...a: unknown[]) => getCurrentCashSession(...a),
  openCashSession: (...a: unknown[]) => openCashSession(...a),
  closeCashSession: (...a: unknown[]) => closeCashSession(...a),
  validateCashSession: (...a: unknown[]) => validateCashSession(...a),
  listCashSessions: (...a: unknown[]) => listCashSessions(...a),
  getCashSession: (...a: unknown[]) => getCashSession(...a)
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

const listConstructionSites = vi.fn();
const listCostCategories = vi.fn();
const createCashVoucher = vi.fn();
const validateCashVoucher = vi.fn();
const voidCashVoucher = vi.fn();
const deleteDraftCashVoucher = vi.fn();
const getCashVoucherPdfUrl = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a),
  createCashVoucher: (...a: unknown[]) => createCashVoucher(...a),
  validateCashVoucher: (...a: unknown[]) => validateCashVoucher(...a),
  voidCashVoucher: (...a: unknown[]) => voidCashVoucher(...a),
  deleteDraftCashVoucher: (...a: unknown[]) => deleteDraftCashVoucher(...a),
  getCashVoucherPdfUrl: (...a: unknown[]) => getCashVoucherPdfUrl(...a)
}));

function chantier(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-1',
    name: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    propertyId: 'bien-1',
    propertyLabel: 'Villa duplex — Angré Centre (en construction)',
    managerLabel: 'Mamadou Konan',
    landLeaseId: null,
    status: 'IN_PROGRESS',
    startDate: '2026-04-01',
    plannedEndDate: '2026-11-30',
    progressPercent: 70,
    closedAt: null,
    finalCost: null,
    actualCost: 4_450_000,
    currency: 'XOF',
    stockEnabledAt: null,
    ...overrides
  };
}

/** Les deux routes telles que déclarées dans `App.tsx`, côte à côte. */
function mount(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/caisse" element={<Caisse />} />
            <Route path="/tenant/:tenantId/finance/pieces-de-caisse" element={<PieceDeCaisse />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentCashSession.mockResolvedValue(null);
  listCashSessions.mockResolvedValue([]);
  listConstructionSites.mockResolvedValue([chantier()]);
  listCostCategories.mockResolvedValue([]);
});

describe('Caisse et pièce de caisse ne partagent plus leur adresse', () => {
  it('/tenant/:tenantId/finance/caisse rend l’écran Caisse (sessions de caisse), jamais la pièce de caisse', async () => {
    mount('/tenant/agence-1/finance/caisse');

    expect(await screen.findByRole('heading', { name: 'Caisse' }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pièce de caisse' })).not.toBeInTheDocument();
  });

  it('/tenant/:tenantId/finance/pieces-de-caisse rend le formulaire de pièce de caisse, jamais l’écran Caisse', async () => {
    mount('/tenant/agence-1/finance/pieces-de-caisse');

    expect(await screen.findByRole('heading', { name: 'Pièce de caisse' }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Caisse' })).not.toBeInTheDocument();
  });

  it('préselectionne le chantier passé en `?chantierId=` sur la nouvelle adresse, comme le bouton de la fiche chantier', async () => {
    mount('/tenant/agence-1/finance/pieces-de-caisse?chantierId=chantier-1');

    await screen.findByRole('heading', { name: 'Pièce de caisse' }, { timeout: 8000 });
    expect(await screen.findByText('Villa duplex — Angré Centre', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
