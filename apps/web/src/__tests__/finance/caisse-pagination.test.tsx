import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Caisse } from '../../pages/finance/Caisse';
import type { CashSession } from '../../services/cash-sessions-service';

/** Caisse — l'historique est paginé localement (20 par page). */

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
  listCashSessions.mockResolvedValue(Array.from({ length: 25 }, (_, i) => session(i + 1)));
});

describe('Caisse — pagination locale de l’historique', () => {
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
  });
});
