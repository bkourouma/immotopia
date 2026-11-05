import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SyndicOwnerAccount } from '../../pages/syndics/SyndicOwnerAccount';

/**
 * Lot SYN-A, phase 2 : recherche serveur du compte d'un lot — transactions
 * (préfixe `tx`) et reçus / quittances (préfixe `re`). Les critères partent à
 * l'API ; le compteur du haut reste celui du compte entier.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 60000 });

const getLotOwnerAccount = vi.fn();
const listTransactions = vi.fn();
const listLotReceipts = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getLotOwnerAccount: (...a: unknown[]) => getLotOwnerAccount(...a),
  listLotOwnerAccountTransactionsWithTotal: (...a: unknown[]) => listTransactions(...a),
  createLotOwnerAccountAdjustment: vi.fn(),
  downloadLotOwnerAccountStatement: vi.fn()
}));

vi.mock('../../services/syndic-lot-payment-service', () => ({
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' }))
}));

vi.mock('../../services/syndic-receipt-service', () => ({
  downloadReceiptFile: vi.fn(),
  listLotReceipts: (...a: unknown[]) => listLotReceipts(...a)
}));

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1', lotId: 'lot-1' })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const ACCOUNT = {
  id: 'acc-1',
  lotId: 'lot-1',
  balance: 0,
  currency: 'XOF',
  lot: { id: 'lot-1', lotNumber: 'A-01' },
  contact: null
};

const TX = {
  id: 'tx-1',
  transactionDate: '2026-01-10T00:00:00.000Z',
  type: 'CHARGE_CALL',
  label: 'Appel du premier trimestre',
  debit: 10000,
  credit: null,
  balanceAfter: 10000
};

const RECEIPT = {
  id: 'r1',
  kind: 'QUITTANCE',
  number: 'QUI-2026-0001',
  lotId: 'lot-1',
  lotNumber: 'A-01',
  amount: 10000,
  currency: 'XOF',
  issuedAt: '2026-02-01T00:00:00.000Z',
  backfilled: false
};

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/lots/lot-1/compte' + search]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte" element={<SyndicOwnerAccount />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const lastParams = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls[mock.mock.calls.length - 1][3];

beforeEach(() => {
  vi.clearAllMocks();
  getLotOwnerAccount.mockResolvedValue(ACCOUNT);
  listTransactions.mockResolvedValue({ items: [TX], totalCount: 45 });
  listLotReceipts.mockResolvedValue({
    items: [RECEIPT],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  });
});

describe('SyndicOwnerAccount : recherche des transactions', () => {
  it('charge la première page sans critère', async () => {
    renderPage();
    expect(await screen.findByText('Appel du premier trimestre')).toBeInTheDocument();
    expect(lastParams(listTransactions)).toEqual({ page: 1, limit: 20 });
  });

  it('envoie la saisie à l’API (search) après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Appel du premier trimestre');
    await user.type(
      within(screen.getByRole('search', { name: /transactions/ })).getAllByRole('textbox')[0],
      'trimestre'
    );
    await waitFor(() => expect(lastParams(listTransactions)).toEqual({ search: 'trimestre', page: 1, limit: 20 }));
    expect(screen.getByTestId('url').textContent).toContain('tx.q=trimestre');
  });

  it('applique le type et la période d’une URL partagée', async () => {
    renderPage('?tx.type=PAYMENT,PENALTY&tx.periodFrom=2026-01-01&tx.periodTo=2026-03-31');
    await screen.findByText('Appel du premier trimestre');
    expect(lastParams(listTransactions)).toEqual({
      type: 'PAYMENT,PENALTY',
      from: '2026-01-01',
      to: '2026-03-31',
      page: 1,
      limit: 20
    });
  });

  it('un type inconnu dans l’URL n’est pas envoyé à l’API', async () => {
    renderPage('?tx.type=BOGUS');
    await screen.findByText('Appel du premier trimestre');
    expect(lastParams(listTransactions)).toEqual({ page: 1, limit: 20 });
  });

  it('le compteur du haut reste celui du compte entier quand la liste est filtrée', async () => {
    const user = userEvent.setup();
    listTransactions.mockImplementation(async (_t: string, _s: string, _l: string, params: { search?: string }) =>
      params.search ? { items: [], totalCount: 0 } : { items: [TX], totalCount: 45 }
    );
    renderPage();
    await screen.findByText('Appel du premier trimestre');
    expect(await screen.findByText('45')).toBeInTheDocument();
    await user.type(within(screen.getByRole('search', { name: /transactions/ })).getAllByRole('textbox')[0], 'zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    // « Effacer » ramène la liste complète.
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Appel du premier trimestre')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('tx.q=');
  });
});

describe('SyndicOwnerAccount : recherche des reçus et quittances', () => {
  it('envoie la saisie à l’API (search) avec le préfixe `re`', async () => {
    const user = userEvent.setup();
    renderPage('?tab=recus');
    expect(await screen.findByText('QUI-2026-0001')).toBeInTheDocument();
    expect(lastParams(listLotReceipts)).toEqual({ page: 1, limit: 20 });
    await user.type(within(screen.getByRole('search', { name: /reçus/ })).getAllByRole('textbox')[0], 'QUI-2026');
    await waitFor(() => expect(lastParams(listLotReceipts)).toEqual({ search: 'QUI-2026', page: 1, limit: 20 }));
    expect(screen.getByTestId('url').textContent).toContain('re.q=QUI-2026');
    expect(screen.getByTestId('url').textContent).toContain('tab=recus');
  });

  it('applique le type, la période et « rattrapés » d’une URL partagée', async () => {
    renderPage('?tab=recus&re.kind=RECEIPT&re.issuedFrom=2026-01-01&re.backfilled=0');
    await screen.findByText('QUI-2026-0001');
    expect(lastParams(listLotReceipts)).toEqual({
      kind: 'RECEIPT',
      from: '2026-01-01',
      backfilled: 'false',
      page: 1,
      limit: 20
    });
  });
});
