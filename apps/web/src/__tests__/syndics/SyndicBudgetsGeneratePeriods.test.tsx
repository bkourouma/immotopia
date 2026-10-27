import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicBudgets, defaultChargeCallPeriod } from '../../pages/syndics/SyndicBudgets';

/**
 * Option « Répartir sur » (1/2/4/12 périodes) et « Période n° » de la
 * génération d'appels depuis un budget (lot S4, correctif de
 * `generateChargeCallsFromBudget`). Antd réel (comme `SyndicFinances.test.tsx`) :
 * `Select` est un composant natif dans `SyndicsBudgetsPages.test.tsx` (mock
 * complet d'antd), ce qui ne permet pas d'exercer un vrai changement
 * d'option — ce fichier teste donc ce champ séparément, avec la vraie
 * bibliothèque.
 */

const listBudgets = vi.fn();
const listChargeCallBatches = vi.fn();
const listSyndicateLots = vi.fn();
const createBudget = vi.fn();
const updateBudget = vi.fn();
const recomputeBudgetAllocations = vi.fn();
const generateBudgetChargeCalls = vi.fn();
const createChargeCallBatch = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listChargeCallBatches: (...args: unknown[]) => listChargeCallBatches(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  createBudget: (...args: unknown[]) => createBudget(...args),
  updateBudget: (...args: unknown[]) => updateBudget(...args),
  recomputeBudgetAllocations: (...args: unknown[]) => recomputeBudgetAllocations(...args),
  generateBudgetChargeCalls: (...args: unknown[]) => generateBudgetChargeCalls(...args),
  createChargeCallBatch: (...args: unknown[]) => createChargeCallBatch(...args),
  // Fonds de la copropriete : aucun ici, l'affectation des postes reste masquee.
  listSyndicateFunds: vi.fn(async () => []),
  assignBudgetLineFund: vi.fn()
}));

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

function mount() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/budgets']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/budgets" element={<SyndicBudgets />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listBudgets.mockResolvedValue([
    {
      id: 'budget-1',
      fiscalYear: 2026,
      label: 'Budget 2026',
      totalAmount: 1_200_000,
      currency: 'XOF',
      status: 'APPROVED',
      allocations: []
    }
  ]);
  listChargeCallBatches.mockResolvedValue([]);
  listSyndicateLots.mockResolvedValue([]);
  generateBudgetChargeCalls.mockResolvedValue({ id: 'batch-1' });
});

describe('SyndicBudgets — répartition du budget sur plusieurs périodes (lot S4)', () => {
  it('génère par défaut sur 1 période (comportement inchangé)', async () => {
    mount();

    fireEvent.click(await screen.findByText('Générer appels', {}, { timeout: 15000 }));
    fireEvent.change(await screen.findByLabelText('Date échéance', {}, { timeout: 15000 }), {
      target: { value: '2026-04-30' }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Générer' }, { timeout: 15000 }));

    await waitFor(
      () =>
        expect(generateBudgetChargeCalls).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          'budget-1',
          expect.objectContaining({ periodsPerYear: 1, periodIndex: 1 })
        ),
      { timeout: 15000 }
    );
  });

  it('permet de choisir 4 périodes et la période n°2', async () => {
    mount();

    fireEvent.click(await screen.findByText('Générer appels', {}, { timeout: 15000 }));
    fireEvent.change(await screen.findByLabelText('Date échéance', {}, { timeout: 15000 }), {
      target: { value: '2026-04-30' }
    });

    const periodsSelect = await screen.findByLabelText('Répartir sur', {}, { timeout: 15000 });
    fireEvent.mouseDown(periodsSelect);
    fireEvent.click(await screen.findByText('4 périodes (trimestriel)', {}, { timeout: 15000 }));

    const periodIndexInput = (await screen.findByLabelText('Période n°', {}, { timeout: 15000 })) as HTMLInputElement;
    fireEvent.change(periodIndexInput, { target: { value: '2' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Générer' }, { timeout: 15000 }));

    await waitFor(
      () =>
        expect(generateBudgetChargeCalls).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          'budget-1',
          expect.objectContaining({ periodsPerYear: 4, periodIndex: 2 })
        ),
      { timeout: 15000 }
    );
  });

  it('pré-remplit la période annuelle « 2026 » et la suit quand « Répartir sur » change', async () => {
    mount();

    fireEvent.click(await screen.findByText('Générer appels', {}, { timeout: 15000 }));
    const period = (await screen.findByLabelText('Période', {}, { timeout: 15000 })) as HTMLInputElement;
    expect(period.value).toBe('2026');

    fireEvent.mouseDown(await screen.findByLabelText('Répartir sur'));
    fireEvent.click(await screen.findByText('12 périodes (mensuel)', {}, { timeout: 15000 }));
    await waitFor(() => expect(period.value).toBe('2026-01'));

    fireEvent.change(await screen.findByLabelText('Période n°'), { target: { value: '3' } });
    await waitFor(() => expect(period.value).toBe('2026-03'));
  });

  it('conserve une période saisie à la main', async () => {
    mount();

    fireEvent.click(await screen.findByText('Générer appels', {}, { timeout: 15000 }));
    const period = (await screen.findByLabelText('Période', {}, { timeout: 15000 })) as HTMLInputElement;
    fireEvent.change(period, { target: { value: 'Perso' } });

    fireEvent.mouseDown(await screen.findByLabelText('Répartir sur'));
    fireEvent.click(await screen.findByText('4 périodes (trimestriel)', {}, { timeout: 15000 }));
    await screen.findByLabelText('Période n°');
    expect(period.value).toBe('Perso');
  });

  it('envoie les bornes explicites pour un semestre', async () => {
    mount();

    fireEvent.click(await screen.findByText('Générer appels', {}, { timeout: 15000 }));
    fireEvent.change(await screen.findByLabelText('Date échéance', {}, { timeout: 15000 }), {
      target: { value: '2999-04-30' }
    });
    fireEvent.mouseDown(await screen.findByLabelText('Répartir sur'));
    fireEvent.click(await screen.findByText('2 périodes (semestriel)', {}, { timeout: 15000 }));
    fireEvent.change(await screen.findByLabelText('Période n°'), { target: { value: '2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Générer' }, { timeout: 15000 }));

    await waitFor(
      () =>
        expect(generateBudgetChargeCalls).toHaveBeenCalledWith(
          'tenant-1',
          'syndic-1',
          'budget-1',
          expect.objectContaining({ period: '2026-S2', periodStart: '2026-07-01', periodEnd: '2026-12-31' })
        ),
      { timeout: 15000 }
    );
  });

  it("avertit (sans bloquer) quand l'échéance est déjà passée", async () => {
    mount();

    fireEvent.click(await screen.findByText('Générer appels', {}, { timeout: 15000 }));
    const due = await screen.findByLabelText('Date échéance', {}, { timeout: 15000 });
    expect(screen.queryByText(/déjà passée/)).toBeNull();
    fireEvent.change(due, { target: { value: '2020-01-31' } });
    expect(await screen.findByText(/L'échéance saisie est déjà passée/)).toBeTruthy();
    fireEvent.change(due, { target: { value: '2999-01-31' } });
    await waitFor(() => expect(screen.queryByText(/déjà passée/)).toBeNull());
  });
});

describe('defaultChargeCallPeriod', () => {
  it('suit le découpage choisi', () => {
    expect(defaultChargeCallPeriod(2026, 1, 1)).toBe('2026');
    expect(defaultChargeCallPeriod(2026, 12, 3)).toBe('2026-03');
    expect(defaultChargeCallPeriod(2026, 4, 2)).toBe('2026-T2');
    expect(defaultChargeCallPeriod(2026, 2, 2)).toBe('2026-S2');
  });
});
