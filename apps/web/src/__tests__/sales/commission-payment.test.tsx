import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SaleCommissions } from '../../pages/sales/SaleCommissions';

/**
 * Commissions de vente — encaissement (lot 9, PRD §5.5 et §3 `SaleCommission`).
 *
 * `SaleCommissions.tsx` importe quatre exports de `sales-service` et, via
 * `<TreasuryAccountSelector>`, `listTreasuryAccounts` de `treasury-service` :
 * les cinq sont mockés (AGENTS.md).
 */

const listSaleCommissions = vi.fn();
const getSaleCommission = vi.fn();
const createSaleCommissionPayment = vi.fn();
const voidSaleCommissionPayment = vi.fn();

vi.mock('../../services/sales-service', () => ({
  listSaleCommissions: (...a: unknown[]) => listSaleCommissions(...a),
  getSaleCommission: (...a: unknown[]) => getSaleCommission(...a),
  createSaleCommissionPayment: (...a: unknown[]) => createSaleCommissionPayment(...a),
  voidSaleCommissionPayment: (...a: unknown[]) => voidSaleCommissionPayment(...a)
}));

const listTreasuryAccounts = vi.fn();
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function commission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'commission-1',
    number: 'HT-2026-0001',
    agreementId: 'agreement-1',
    agreementNumber: 'CV-2026-0001',
    mandateId: 'mandate-1',
    propertyLabel: 'REF-001 · Villa Cocody',
    payer: 'SELLER',
    payerName: 'Aissatou Barry',
    baseAmount: 48_000_000,
    amountExclTax: 2_400_000,
    vatRate: 18,
    vatAmount: 432_000,
    amountInclTax: 2_832_000,
    paidAmount: 0,
    remainingAmount: 2_832_000,
    status: 'DUE',
    agentUserId: null,
    agentName: null,
    agentSharePercent: null,
    agentShareEarned: 0,
    issuedAt: '2026-11-05',
    ...overrides
  };
}

async function optionParLibelle(libelle: string): Promise<HTMLElement> {
  return waitFor(() => {
    const candidat = screen.getAllByText(libelle).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option de menu déroulant introuvable : « ${libelle} »`);
    return candidat;
  });
}

function mount(url = '/tenant/agence-1/sales/commissions') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
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
  listTreasuryAccounts.mockResolvedValue([
    {
      id: 'compte-1',
      label: 'Wave Business',
      accountNumber: '07 00 00 00',
      kind: 'MOBILE_MONEY',
      isActive: true,
      mmOperator: 'Wave'
    }
  ]);
});

describe('Commissions de vente — liste', () => {
  it('affiche les totaux et une ligne par commission', async () => {
    listSaleCommissions.mockResolvedValue({
      items: [commission()],
      totals: { amountInclTax: 2_832_000, paidAmount: 0, remainingAmount: 2_832_000 }
    });
    mount();

    expect(await screen.findByText('HT-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Total TTC')).toBeInTheDocument();
    expect(screen.getAllByText(/2\s832\s000/).length).toBeGreaterThan(0);
  });
});

describe('Commissions de vente — encaissement', () => {
  it('encaisse un règlement partiel avec le compte de trésorerie choisi', async () => {
    listSaleCommissions.mockResolvedValue({
      items: [commission()],
      totals: { amountInclTax: 2_832_000, paidAmount: 0, remainingAmount: 2_832_000 }
    });
    createSaleCommissionPayment.mockResolvedValue({
      id: 'payment-1',
      number: 'RC-2026-0001',
      amount: 1_000_000,
      paidAt: '2026-11-10',
      paymentMethod: 'MOBILE_MONEY',
      treasuryAccountId: 'compte-1',
      treasuryAccountLabel: 'Wave Business · 07 00 00 00 · Wave',
      reference: null,
      status: 'POSTED',
      voidReason: null,
      voidedAt: null,
      createdByName: 'Fatou',
      createdAt: '2026-11-10'
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    mount();

    await user.click(await screen.findByText('Encaisser', {}, { timeout: 8000 }));

    const champMontant = await screen.findByLabelText('Montant', {}, { timeout: 8000 });
    await user.clear(champMontant);
    await user.type(champMontant, '1000000');

    const dialogue = screen.getByRole('dialog');
    const comboboxes = await within(dialogue).findAllByRole('combobox', {}, { timeout: 8000 });
    // Moyen de paiement, puis compte de trésorerie.
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await optionParLibelle('Mobile Money'));

    fireEvent.mouseDown(within(dialogue).getAllByRole('combobox')[1]);
    fireEvent.click(await optionParLibelle('Wave Business · 07 00 00 00 · Wave'));

    await user.click(within(dialogue).getByRole('button', { name: 'Encaisser' }));

    await waitFor(() =>
      expect(createSaleCommissionPayment).toHaveBeenCalledWith(
        'agence-1',
        'commission-1',
        expect.objectContaining({ amount: 1_000_000, paymentMethod: 'MOBILE_MONEY', treasuryAccountId: 'compte-1' })
      )
    );
  });
});
