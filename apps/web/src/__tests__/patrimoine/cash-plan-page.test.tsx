import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CashPlanPage } from '../../pages/patrimoine/CashPlanPage';
import type { CashPlanData } from '../../types/cash-plan-types';

/**
 * Plan de trésorerie prévisionnel (spec 030) — le mock se pose à la frontière
 * réseau (`utils/api-client`) : les vrais services et composants tournent par-dessus.
 */

const get = vi.fn();
const put = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a)
  }
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const ZERO_CATEGORIES = {
  RENT: 0,
  RENT_ARREARS: 0,
  LOAN: 0,
  WORKS: 0,
  RECURRING_EXPENSE: 0,
  PROPERTY_TAX: 0
};

function makePlan(overrides: Partial<CashPlanData> = {}): CashPlanData {
  const base: CashPlanData = {
    currency: 'XOF',
    generatedAt: '2026-10-01T08:00:00.000Z',
    startMonth: '2026-10',
    months: 12,
    openingBalance: 0,
    openingBalanceProvided: false,
    propertyId: null,
    scope: { propertyCount: 2, excluded: [] },
    periods: [
      {
        month: '2026-10',
        inflows: 300_000,
        outflows: 500_000,
        net: -200_000,
        cumulative: -200_000,
        byCategory: { ...ZERO_CATEGORIES, RENT: 300_000, LOAN: 500_000 },
        lines: [
          {
            id: 'l1',
            month: '2026-10',
            category: 'RENT',
            direction: 'IN',
            amount: 300_000,
            propertyId: 'p1',
            propertyTitle: 'Villa Angré',
            source: { kind: 'LEASE_SCHEDULE', id: 'bail-1' },
            indicative: false,
            note: null,
            label: null
          },
          {
            id: 'l2',
            month: '2026-10',
            category: 'LOAN',
            direction: 'OUT',
            amount: 500_000,
            propertyId: 'p1',
            propertyTitle: 'Villa Angré',
            source: { kind: 'LOAN', id: 'pret-1' },
            indicative: false,
            note: null,
            label: 'Banque Atlantique'
          },
          {
            id: 'l3',
            month: '2026-10',
            category: 'PROPERTY_TAX',
            direction: 'OUT',
            amount: 80_000,
            propertyId: 'p1',
            propertyTitle: 'Villa Angré',
            source: { kind: 'TAX_ESTIMATE', id: null },
            indicative: true,
            note: null,
            label: null
          }
        ]
      },
      {
        month: '2026-11',
        inflows: 300_000,
        outflows: 0,
        net: 300_000,
        cumulative: 100_000,
        byCategory: { ...ZERO_CATEGORIES, RENT: 300_000 },
        lines: []
      }
    ],
    totals: { inflows: 600_000, outflows: 500_000, net: 100_000 },
    shortfall: { firstMonth: '2026-10', firstMonthBalance: -200_000, deepestMonth: '2026-10', depth: 200_000 },
    sources: [
      { source: 'RENT', status: 'INCLUDED', reason: null, count: null },
      { source: 'LOANS', status: 'INCLUDED', reason: null, count: null },
      { source: 'WORKS', status: 'NO_DATA', reason: 'NO_PLANNED_WORK', count: null },
      { source: 'RECURRING_EXPENSES', status: 'NO_DATA', reason: 'NO_RECURRING_EXPENSE', count: null },
      { source: 'PROPERTY_TAX', status: 'NOT_CONFIGURED', reason: 'TAX_DUE_DATE_NOT_SET', count: null }
    ],
    settings: { propertyTaxDueMonth: null, propertyTaxDueDay: null },
    warnings: []
  };
  return { ...base, ...overrides };
}

let currentPlan: CashPlanData;

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/plan-tresorerie']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/plan-tresorerie" element={<CashPlanPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function planCalls(): Array<{ params: Record<string, unknown> }> {
  return get.mock.calls
    .filter(call => String(call[0]).includes('/patrimoine/cash-plan'))
    .map(call => ({
      params: ((call[1] as { params?: Record<string, unknown> })?.params ?? {}) as Record<string, unknown>
    }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentPlan = makePlan();
  get.mockImplementation(async (url: string) => {
    if (String(url).includes('/patrimoine/cash-plan')) return { data: { success: true, data: currentPlan } };
    return {
      data: {
        success: true,
        data: [
          { id: 'p1', title: 'Villa Angré' },
          { id: 'p2', title: 'Résidence Cocody' }
        ],
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 }
      }
    };
  });
  put.mockResolvedValue({
    data: {
      success: true,
      data: { propertyTaxDueMonth: 10, propertyTaxDueDay: 15, updatedAt: '2026-10-01T09:00:00.000Z' }
    }
  });
});

describe('Plan de trésorerie prévisionnel', () => {
  it('affiche le bandeau de creux, le tableau mensuel et le détail avec la source de chaque ligne', async () => {
    const { container } = monter();

    const alerte = (await screen.findByText(/Creux de trésorerie prévu dès/)).closest('.ant-alert') as HTMLElement;
    expect(alerte).toHaveTextContent(/Creux de trésorerie prévu dès/);
    expect(alerte).toHaveTextContent(/200\s?000/);
    expect(screen.getByText(/Estimation indicative : le plan repose/)).toBeInTheDocument();
    // Premier appel : 12 mois, aucun solde de départ envoyé.
    expect(planCalls()[0].params).toEqual({ months: 12 });
    expect(screen.getByText('Calculé sans solde de départ')).toBeInTheDocument();

    const tableau = await screen.findByRole('table', { name: 'Plan de trésorerie mensuel' }).catch(() => null);
    expect(tableau ?? container.querySelector('.ant-table')).toBeTruthy();

    const deplier = container.querySelector('.ant-table-row-expand-icon') as HTMLElement;
    await userEvent.click(deplier);
    expect(await screen.findByText('Échéancier du bail')).toBeInTheDocument();
    expect(screen.getByText('Taxe foncière estimée')).toBeInTheDocument();
    expect(screen.getByText('Estimation indicative')).toBeInTheDocument();
    expect(screen.getByText('Mensualité d’emprunt — Banque Atlantique'.replace('’', "'"))).toBeInTheDocument();
  });

  it('affiche « aucun creux prévu » quand le cumul reste positif', async () => {
    currentPlan = makePlan({ shortfall: null, openingBalanceProvided: true, openingBalance: 1_000_000 });
    monter();
    expect(await screen.findByText('Aucun creux de trésorerie prévu sur la période.')).toBeInTheDocument();
    expect(screen.queryByText('Calculé sans solde de départ')).not.toBeInTheDocument();
  });

  it("signale la taxe foncière sans date d'exigibilité et enregistre le mois et le jour", async () => {
    monter();
    expect(await screen.findByText(/Date d'exigibilité de la taxe foncière non renseignée/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Mois'), '10');
    await userEvent.type(screen.getByLabelText('Jour'), '15');
    await userEvent.click(screen.getByRole('button', { name: "Enregistrer la date d'exigibilité" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/tenants/agence-1/patrimoine/cash-plan/settings', {
        propertyTaxDueMonth: 10,
        propertyTaxDueDay: 15
      })
    );
  });

  it("refuse un jour qui n'existe pas dans le mois sans appeler l'API", async () => {
    monter();
    await screen.findByText(/Date d'exigibilité de la taxe foncière non renseignée/);
    await userEvent.selectOptions(screen.getByLabelText('Mois'), '4');
    await userEvent.type(screen.getByLabelText('Jour'), '31');
    await userEvent.click(screen.getByRole('button', { name: "Enregistrer la date d'exigibilité" }));
    expect(await screen.findByText("Ce jour n'existe pas dans ce mois.")).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('bascule sur 24 mois et redemande le plan avec months=24', async () => {
    monter();
    await screen.findByText(/Creux de trésorerie prévu dès/);
    await userEvent.click(screen.getByText('24 mois'));
    await waitFor(() => expect(planCalls().some(call => call.params.months === 24)).toBe(true));
  });

  it("envoie le solde de départ à l'API une fois saisi", async () => {
    monter();
    await screen.findByText(/Creux de trésorerie prévu dès/);
    const champ = screen.getByLabelText('Solde de départ (XOF)');
    await userEvent.type(champ, '500000');
    await userEvent.tab();
    await waitFor(() => expect(planCalls().some(call => call.params.openingBalance === 500000)).toBe(true));
  });

  it("filtre par bien et envoie propertyId à l'API", async () => {
    monter();
    await screen.findByText(/Creux de trésorerie prévu dès/);
    await userEvent.click(screen.getByLabelText('Bien'));
    await userEvent.click(await screen.findByText('Résidence Cocody'));
    await waitFor(() => expect(planCalls().some(call => call.params.propertyId === 'p2')).toBe(true));
  });

  it('affiche les avertissements de devise écartée et les biens exclus', async () => {
    currentPlan = makePlan({
      warnings: [{ code: 'FOREIGN_CURRENCY_SKIPPED', count: 2 }],
      scope: { propertyCount: 2, excluded: [{ propertyId: 'p9', title: 'Terrain Bingerville', reason: 'FOR_SALE' }] }
    });
    monter();
    expect(await screen.findByText(/2 montants en devise étrangère ont été écartés/)).toBeInTheDocument();
    expect(screen.getByText('Terrain Bingerville')).toBeInTheDocument();
    expect(screen.getByText('En vente')).toBeInTheDocument();
  });

  it("montre un état d'erreur avec une relance quand le plan ne charge pas", async () => {
    get.mockImplementation(async (url: string) => {
      if (String(url).includes('/patrimoine/cash-plan')) throw new Error('boom');
      return { data: { success: true, data: [], pagination: {} } };
    });
    monter();
    expect(await screen.findByText('Impossible de charger le plan de trésorerie.')).toBeInTheDocument();
    const relancer = screen.getByRole('button', { name: 'Réessayer' });
    get.mockImplementation(async (url: string) => {
      if (String(url).includes('/patrimoine/cash-plan')) return { data: { success: true, data: currentPlan } };
      return { data: { success: true, data: [], pagination: {} } };
    });
    await userEvent.click(relancer);
    expect(await screen.findByText(/Creux de trésorerie prévu dès/)).toBeInTheDocument();
  });

  it("affiche un état vide quand aucun bien n'est retenu", async () => {
    currentPlan = makePlan({ scope: { propertyCount: 0, excluded: [] }, periods: [], shortfall: null });
    monter();
    expect(await screen.findByText('Aucun bien dans le périmètre du plan')).toBeInTheDocument();
    expect(within(document.body).getAllByText(/Sources du plan/).length).toBeGreaterThan(0);
  });
});
