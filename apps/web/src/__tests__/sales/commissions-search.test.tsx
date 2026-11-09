import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleCommissions } from '../../pages/sales/SaleCommissions';

/** Commissions de vente : recherche et totaux filtrés au serveur. */

const listSaleCommissions = vi.fn();
vi.mock('../../services/sales-service', () => ({
  listSaleCommissions: (...a: unknown[]) => listSaleCommissions(...a),
  getSaleCommission: vi.fn(),
  createSaleCommissionPayment: vi.fn(),
  voidSaleCommissionPayment: vi.fn()
}));
vi.mock('../../services/treasury-service', () => ({ listTreasuryAccounts: vi.fn().mockResolvedValue([]) }));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };
const PLACEHOLDER = 'Numéro, compromis, bien, payeur, négociateur…';

function commission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    number: 'HT-2026-0001',
    agreementId: 'a1',
    agreementNumber: 'CV-2026-0001',
    mandateId: 'm1',
    propertyLabel: 'REF-001 · Villa Cocody',
    payer: 'SELLER',
    payerName: 'Aissatou Barry',
    baseAmount: 1,
    amountExclTax: 1,
    vatRate: 18,
    vatAmount: 0,
    amountInclTax: 1_000_000,
    paidAmount: 0,
    remainingAmount: 1_000_000,
    status: 'DUE',
    agentUserId: null,
    agentName: null,
    agentSharePercent: null,
    agentShareEarned: 0,
    issuedAt: '2026-10-05',
    ...overrides
  };
}

function Adresse() {
  return <div data-testid="adresse">{useLocation().search}</div>;
}

function mount(url = '/tenant/agence-1/sales/commissions') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/sales/commissions" element={<SaleCommissions />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const all = [
    commission(),
    commission({
      id: 'c2',
      number: 'HT-2026-0002',
      agreementNumber: 'CV-2026-0002',
      payerName: 'Kouadio Yao',
      payer: 'BUYER',
      status: 'PAID',
      amountInclTax: 3_000_000,
      paidAmount: 3_000_000,
      remainingAmount: 0,
      issuedAt: '2026-11-01'
    })
  ];
  listSaleCommissions.mockImplementation(async (_tenant: string, params: Record<string, any>) => {
    const filtered = all.filter(
      c =>
        (!params.search ||
          [c.number, c.payerName, c.propertyLabel].some(v => v.toLowerCase().includes(params.search.toLowerCase()))) &&
        (!params.status || params.status.split(',').includes(c.status))
    );
    return {
      items: filtered.slice((params.page - 1) * params.limit, params.page * params.limit),
      total: filtered.length,
      page: params.page,
      pageSize: params.limit,
      totals: filtered.reduce(
        (acc, c) => ({
          amountInclTax: acc.amountInclTax + c.amountInclTax,
          paidAmount: acc.paidAmount + c.paidAmount,
          remainingAmount: acc.remainingAmount + c.remainingAmount
        }),
        { amountInclTax: 0, paidAmount: 0, remainingAmount: 0 }
      )
    };
  });
});

describe('Commissions de vente : recherche multicritères', () => {
  it('charge la première page avec paramètres serveur', async () => {
    mount();
    expect(await screen.findByText('HT-2026-0001', {}, T)).toBeInTheDocument();
    expect(listSaleCommissions).toHaveBeenCalledWith('agence-1', { page: 1, limit: 20 });
  });

  it('cherche dans le payeur et garde le terme dans l’URL', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.type(await screen.findByPlaceholderText(PLACEHOLDER, {}, T), 'kouadio');
    await waitFor(() => expect(screen.queryByText('HT-2026-0001')).not.toBeInTheDocument(), T);
    expect(screen.getByText('HT-2026-0002')).toBeInTheDocument();
    expect(screen.getByTestId('adresse')).toHaveTextContent('q=kouadio');
  });

  it('filtre par statut d’une URL partagée et recalcule les totaux sur la liste filtrée', async () => {
    mount('/tenant/agence-1/sales/commissions?status=PAID');
    expect(await screen.findByText('HT-2026-0002', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('HT-2026-0001')).not.toBeInTheDocument();
    // Total TTC = 3 000 000 (et non 4 000 000, total de la liste complète).
    expect(screen.queryByText(/4\s000\s000/)).not.toBeInTheDocument();
  });

  it('« Effacer les critères » ramène toute la liste', async () => {
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/sales/commissions?q=zzz');
    const barre = await screen.findByRole('search', {}, T);
    await user.click(await within(barre).findByRole('button', { name: 'Effacer les critères' }, T));
    expect(await screen.findByText('HT-2026-0001', {}, T)).toBeInTheDocument();
    expect(screen.getByText('HT-2026-0002')).toBeInTheDocument();
  });
});
