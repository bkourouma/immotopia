import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';

/**
 * Lot SYN-A, phase 2 : recherche locale des trois tableaux de « Budgets »
 * (préfixes d'URL `bud`, `rep`, `cam`). Listes reçues en entier : le filtrage
 * se fait dans l'écran, rien ne part à l'API.
 */

configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 60000 });

const listBudgets = vi.fn();
const listChargeCallBatches = vi.fn();
const listSyndicateLots = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listChargeCallBatches: (...args: unknown[]) => listChargeCallBatches(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  recomputeBudgetAllocations: vi.fn(),
  generateBudgetChargeCalls: vi.fn(),
  createChargeCallBatch: vi.fn(),
  listSyndicateFunds: vi.fn(async () => []),
  assignBudgetLineFund: vi.fn()
}));

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const budget = (overrides: Record<string, unknown>) => ({
  id: 'b1',
  syndicateId: 'syndic-1',
  fiscalYear: 2026,
  label: 'Budget courant',
  totalAmount: 1000000,
  currency: 'XOF',
  status: 'DRAFT',
  allocations: [],
  lines: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

const BUDGETS = [
  budget({ id: 'b1', label: 'Budget courant', fiscalYear: 2026, status: 'DRAFT' }),
  budget({ id: 'b2', label: 'Travaux de toiture', fiscalYear: 2025, status: 'APPROVED' })
];

const batch = (overrides: Record<string, unknown>) => ({
  id: 'c1',
  syndicateId: 'syndic-1',
  label: 'Appel T1',
  period: '2026-T1',
  dueDate: '2026-02-15T00:00:00.000Z',
  batchType: 'REGULAR',
  totalAmount: 500000,
  currency: 'XOF',
  status: 'SENT',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  chargeCalls: [],
  ...overrides
});

const BATCHES = [
  batch({ id: 'c1', label: 'Appel T1', period: '2026-T1', batchType: 'REGULAR', status: 'SENT' }),
  batch({
    id: 'c2',
    label: 'Ravalement façade',
    period: '2026',
    batchType: 'EXCEPTIONAL',
    status: 'DRAFT',
    dueDate: '2026-06-30T00:00:00.000Z'
  })
];

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(search = '') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/budgets' + search]}>
        <Url />
        <Routes>
          <Route path="/tenant/:tenantId/syndics/:syndicId/budgets" element={<SyndicBudgets />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const searchBox = (name: RegExp) => within(screen.getByRole('search', { name })).getAllByRole('textbox')[0];

beforeEach(() => {
  vi.clearAllMocks();
  listBudgets.mockResolvedValue(BUDGETS);
  listChargeCallBatches.mockResolvedValue(BATCHES);
  listSyndicateLots.mockResolvedValue([]);
});

describe('SyndicBudgets : recherche locale', () => {
  it('filtre les budgets sur le libellé, sans appel supplémentaire à l’API, et garde la saisie dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Travaux de toiture')).toBeInTheDocument();
    expect(screen.getByText('Budget courant')).toBeInTheDocument();
    const calls = listBudgets.mock.calls.length;

    await user.type(searchBox(/budgets/i), 'toiture');
    await waitFor(() => expect(screen.queryByText('Budget courant')).not.toBeInTheDocument());
    expect(screen.getByText('Travaux de toiture')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('bud.q=toiture');
    expect(listBudgets.mock.calls.length).toBe(calls);
  });

  it('applique le statut d’une URL partagée', async () => {
    renderPage('?bud.status=DRAFT');
    expect(await screen.findByText('Budget courant')).toBeInTheDocument();
    expect(screen.queryByText('Travaux de toiture')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    renderPage('?bud.q=zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.')).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Budget courant')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('bud.q=');
  });

  it('campagnes d’appels : filtre par type et par libellé, avec un préfixe distinct', async () => {
    const user = userEvent.setup();
    renderPage('?tab=campagnes&cam.batchType=EXCEPTIONAL');
    expect(await screen.findByText('Ravalement façade')).toBeInTheDocument();
    expect(screen.queryByText('Appel T1')).not.toBeInTheDocument();

    await user.type(searchBox(/campagnes/i), 'zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('cam.q=zzz');
    expect(screen.getByTestId('url').textContent).toContain('tab=campagnes');
  });
});
