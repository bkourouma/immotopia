import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Revenues from '../../pages/OwnerPortal/Revenues';

/**
 * Revenus du portail propriétaire : effacer la période (croix du sélecteur,
 * `onChange(null)`) remettait `dateRange` à `null`, la lecture de `dateRange[0]`
 * levait et la page entière passait en erreur, sans filtre pour s'en sortir.
 */

const getRevenueSummary = vi.hoisted(() => vi.fn());
const getRevenuesByProperty = vi.hoisted(() => vi.fn());
const getRevenuesByMonth = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getRevenueSummary: (...args: unknown[]) => getRevenueSummary(...args),
    getRevenuesByProperty: (...args: unknown[]) => getRevenuesByProperty(...args),
    getRevenuesByMonth: (...args: unknown[]) => getRevenuesByMonth(...args)
  }
}));
vi.mock('../../components/OwnerPortal/RevenueChart', () => ({ RevenueChart: () => <div>graphique</div> }));

// Le vrai sélecteur de période est lourd en jsdom : un double qui déclenche les deux `onChange`.
vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  const RangePicker = ({ onChange }: { onChange: (dates: unknown) => void }) => (
    <div>
      <button type="button" onClick={() => onChange([dayjs('2026-11-01'), dayjs('2026-11-20')])}>
        choisir-periode
      </button>
      <button type="button" onClick={() => onChange(null)}>
        effacer-periode
      </button>
    </div>
  );
  return { ...actual, DatePicker: Object.assign(actual.DatePicker, { RangePicker }) };
});

const ok = (data: unknown) => ({ data: { success: true, data } });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter>
          <Revenues />
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getRevenueSummary.mockResolvedValue(
    ok({ currentMonth: 0, lastMonth: 0, currentYear: 0, lastYear: 0, allTime: 0, averageMonthly: 0 })
  );
  getRevenuesByProperty.mockResolvedValue(ok([]));
  getRevenuesByMonth.mockResolvedValue(ok([]));
});

describe('Revenus du portail propriétaire : effacer la période', () => {
  it('recharge sans filtre et reste sur la page', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'choisir-periode' }));
    await waitFor(() =>
      expect(getRevenuesByProperty).toHaveBeenLastCalledWith({ startDate: '2026-11-01', endDate: '2026-11-20' })
    );

    await user.click(await screen.findByRole('button', { name: 'effacer-periode' }));
    await waitFor(() => expect(getRevenuesByProperty).toHaveBeenLastCalledWith({}));

    expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'effacer-periode' })).toBeInTheDocument();
  }, 20000);

  it("une erreur de chargement propose « Actualiser » au lieu d'une page sans issue", async () => {
    const user = userEvent.setup();
    getRevenueSummary.mockRejectedValueOnce({ response: { data: { message: 'Panne' } } });
    renderPage();

    expect(await screen.findByText('Panne')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Actualiser/ }));

    await waitFor(() => expect(screen.queryByText('Panne')).not.toBeInTheDocument());
    expect(getRevenueSummary).toHaveBeenCalledTimes(2);
  }, 20000);
});
