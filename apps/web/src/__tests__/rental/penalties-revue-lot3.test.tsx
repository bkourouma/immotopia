import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Penalties } from '../../pages/rental/Penalties';
import { isPenaltyAdjusted, penaltyRetainedAmount } from '../../pages/rental/penalty-search';

/**
 * Revue fonctionnelle gestion locative (lot 3, territoire C).
 *
 * L'API renvoie `amount` en chaîne décimale (« 3200 ») et `calculated_amount` en
 * nombre : `3200 !== '3200'` faisait passer toute pénalité calculée pour
 * « ajustée » (carte mobile : « Montant calculé » et « Raison — » sur chaque ligne).
 */

const listPenalties = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listPenalties: (...a: unknown[]) => listPenalties(...a),
  updatePenalty: vi.fn(),
  deletePenalty: vi.fn(),
  calculatePenalties: vi.fn(),
  uploadPenaltyJustification: vi.fn(),
  downloadPenaltyJustification: vi.fn()
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set(), enabled: new Set(), permissions: null, ready: true })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const penaliteApi = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'pen-1',
    tenant_id: 'agence-1',
    installment_id: 'ech-1',
    amount: '3200',
    calculated_amount: 3200,
    adjusted_amount: null,
    adjustment_reason: null,
    currency: 'FCFA',
    days_late: 12,
    calculated_at: '2026-10-15T00:00:00.000Z',
    ...overrides
  }) as never;

beforeEach(() => vi.clearAllMocks());

describe('Pénalités — montants décimaux renvoyés en chaîne', () => {
  it('une pénalité calculée (amount « 3200 », calculated_amount 3200) n’est pas « ajustée »', () => {
    expect(isPenaltyAdjusted(penaliteApi())).toBe(false);
    expect(penaltyRetainedAmount(penaliteApi())).toBe(3200);
  });

  it('une pénalité ajustée à la baisse l’est', () => {
    expect(isPenaltyAdjusted(penaliteApi({ amount: '1000', adjusted_amount: 1000 }))).toBe(true);
  });
});

describe('Pénalités — colonne Échéance', () => {
  it('affiche la période de l’échéance pénalisée', async () => {
    listPenalties.mockResolvedValue({
      success: true,
      data: [penaliteApi({ installment: { id: 'ech-1', period_month: 9, period_year: 2026 } })],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 }
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/rental/penalties']}>
            <Routes>
              <Route path="/tenant/:tenantId/rental/penalties" element={<Penalties />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
    expect(await screen.findByText('09/2026', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
