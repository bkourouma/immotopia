import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tresorerie } from '../../pages/finance/Tresorerie';
import type { TreasuryTransferDto } from '../../services/treasury-service';

/** Trésorerie — les onglets sont paresseux et les virements paginés localement (20 par page). */

const listTreasuryAccounts = vi.fn();
const listTreasuryTransfers = vi.fn();
const getWithholdingSummary = vi.fn();
const listTaxRemittances = vi.fn();

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a),
  createTreasuryAccount: vi.fn(),
  updateTreasuryAccount: vi.fn(),
  listTreasuryTransfers: (...a: unknown[]) => listTreasuryTransfers(...a),
  createTreasuryTransfer: vi.fn(),
  voidTreasuryTransfer: vi.fn(),
  getWithholdingSummary: (...a: unknown[]) => getWithholdingSummary(...a),
  listTaxRemittances: (...a: unknown[]) => listTaxRemittances(...a),
  createTaxRemittance: vi.fn(),
  voidTaxRemittance: vi.fn()
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function virement(i: number): TreasuryTransferDto {
  return {
    id: `vir-${i}`,
    number: `VIR-2026-${String(i).padStart(4, '0')}`,
    fromTreasuryAccountId: 'compte-caisse-1',
    fromLabel: 'Caisse agence Cocody',
    toTreasuryAccountId: 'compte-banque-1',
    toLabel: 'Ecobank agence',
    amount: 100_000,
    transferredAt: '2026-09-20',
    reference: null,
    notes: null,
    status: 'VALIDATED',
    voidReason: null,
    voidedAt: null,
    createdByName: 'Awa Koné'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listTreasuryAccounts.mockResolvedValue([]);
  listTreasuryTransfers.mockResolvedValue(Array.from({ length: 25 }, (_, i) => virement(i + 1)));
  listTaxRemittances.mockResolvedValue([]);
  getWithholdingSummary.mockResolvedValue({ enabled: true, accountNumber: '4478', collected: 0, remitted: 0, due: 0 });
});

describe('Trésorerie — sections paresseuses et pagination locale', () => {
  it('ne charge les virements qu’à l’ouverture de l’onglet, puis en affiche 20 sur 25', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/finance/tresorerie']}>
            <Routes>
              <Route path="/tenant/:tenantId/finance/tresorerie" element={<Tresorerie />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );

    await screen.findByRole('tab', { name: 'Virements internes' }, { timeout: 8000 });
    expect(listTreasuryTransfers).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: 'Virements internes' }));
    await screen.findByText('VIR-2026-0001', {}, { timeout: 8000 });

    expect(listTreasuryTransfers).toHaveBeenCalledTimes(1);
    expect(listTaxRemittances).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^VIR-2026-\d{4}$/)).toHaveLength(20);
    expect(screen.queryByText('VIR-2026-0021')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
  });
});
