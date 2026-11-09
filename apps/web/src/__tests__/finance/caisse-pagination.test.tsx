import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Caisse } from '../../pages/finance/Caisse';
import type { CashSession } from '../../services/cash-sessions-service';

/** Caisse — l'historique et ses facettes sont paginés côté serveur. */

const getCurrentCashSession = vi.fn();
const listCashSessions = vi.fn();

vi.mock('../../services/cash-sessions-service', () => ({
  getCurrentCashSession: (...a: unknown[]) => getCurrentCashSession(...a),
  openCashSession: vi.fn(),
  closeCashSession: vi.fn(),
  validateCashSession: vi.fn(),
  listCashSessions: (...a: unknown[]) => listCashSessions(...a),
  getCashSession: vi.fn()
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null, ready: true })
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-99' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

function session(i: number): CashSession {
  return {
    id: `sess-${i}`,
    number: `CAI-2026-${String(i).padStart(4, '0')}`,
    cashierUserId: 'user-1',
    cashierName: 'Awa Koné',
    status: 'VALIDATED',
    openedAt: '2026-09-23T08:00:00.000Z',
    openingFloat: 50_000,
    openingNote: null,
    treasuryAccountId: 'caisse-1',
    treasuryLabel: 'Caisse principale · 5711',
    closedAt: '2026-09-23T18:00:00.000Z',
    expected: { receipts: 0, disbursements: 0, amount: 50_000, lines: [] },
    countedAmount: 50_000,
    denominations: null,
    difference: 0,
    differenceReason: null,
    validatedAt: null,
    validatedByName: null,
    validationComment: null
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentCashSession.mockResolvedValue(null);
  listCashSessions.mockResolvedValue({
    items: Array.from({ length: 20 }, (_, i) => session(i + 1)),
    total: 25,
    page: 1,
    pageSize: 20,
    cashiers: [
      { userId: 'user-1', name: 'Awa Koné' },
      { userId: 'user-2', name: 'Fatou Diallo' }
    ]
  });
});

describe('Caisse — pagination serveur de l’historique', () => {
  it('affiche 20 sessions sur 25 et le compteur « 1–20 sur 25 »', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/finance/caisse']}>
            <Routes>
              <Route path="/tenant/:tenantId/finance/caisse" element={<Caisse />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );

    await user.click(await screen.findByRole('tab', { name: 'Historique' }, { timeout: 8000 }));
    await screen.findByText('CAI-2026-0001', {}, { timeout: 8000 });

    expect(screen.getAllByText(/^CAI-2026-\d{4}$/)).toHaveLength(20);
    expect(screen.queryByText('CAI-2026-0021')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();

    // Fatou ne figure dans aucune des 20 lignes affichées, mais reste proposée.
    await user.click(screen.getByRole('button', { name: /Plus de critères/ }));
    await user.click(screen.getByRole('combobox', { name: 'Caissier' }));
    expect(await screen.findByText('Fatou Diallo', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
