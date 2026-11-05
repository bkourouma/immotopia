import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SalesDashboard } from '../../pages/sales/SalesDashboard';

/** Tableau des ventes : la liste des mandats actifs a sa barre locale. */

const listSaleMandates = vi.fn();
const getSalesPipeline = vi.fn();
vi.mock('../../services/sales-service', () => ({
  listSaleMandates: (...a: unknown[]) => listSaleMandates(...a),
  getSalesPipeline: (...a: unknown[]) => getSalesPipeline(...a)
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };

function mandat(id: string, number: string, bien: string, type: string) {
  return {
    id,
    number,
    propertyLabel: bien,
    sellerName: 'Vendeur',
    mandateType: type,
    askingPrice: 10_000_000,
    endDate: '2027-03-01',
    status: 'ACTIVE',
    isExpired: false,
    offersCount: 0,
    agentName: null,
    startDate: '2026-09-01'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSalesPipeline.mockResolvedValue({});
  listSaleMandates.mockResolvedValue([
    mandat('1', 'MV-1', 'Villa Cocody', 'SIMPLE'),
    mandat('2', 'MV-2', 'Terrain Bingerville', 'EXCLUSIVE')
  ]);
});

describe('Tableau des ventes : mandats actifs', () => {
  it('demande les mandats actifs et filtre localement par le champ libre', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/sales']}>
            <Routes>
              <Route path="/tenant/:tenantId/sales" element={<SalesDashboard />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
    expect(await screen.findByText('MV-1', {}, T)).toBeInTheDocument();
    expect(listSaleMandates).toHaveBeenCalledWith('agence-1', { status: 'ACTIVE' });
    await user.type(screen.getByPlaceholderText('Numéro, bien, vendeur, négociateur…'), 'bingerville');
    await waitFor(() => expect(screen.queryByText('MV-1')).not.toBeInTheDocument(), T);
    expect(screen.getByText('MV-2')).toBeInTheDocument();
    expect(screen.queryByText(/La liste est limitée aux/)).not.toBeInTheDocument();
  });

  it('signale la troncature quand l’API renvoie 500 mandats', async () => {
    listSaleMandates.mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => mandat(`m${i}`, `MV-${i}`, 'Bien', 'SIMPLE'))
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/agence-1/sales']}>
            <Routes>
              <Route path="/tenant/:tenantId/sales" element={<SalesDashboard />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/La liste est limitée aux 500 mandats/, {}, T)).toBeInTheDocument();
  });
});
