import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicBudgets } from '../../pages/syndics/SyndicBudgets';

/**
 * Création d'un budget à plusieurs postes (Form.List) et lecture seule d'un
 * budget clôturé. Antd réel (comme SyndicBudgetsGeneratePeriods.test.tsx).
 */

const T = { timeout: 15000 };

const listBudgets = vi.fn();
const listChargeCallBatches = vi.fn();
const listSyndicateLots = vi.fn();
const createBudget = vi.fn();
const listSyndicateFunds = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listBudgets: (...args: unknown[]) => listBudgets(...args),
  listChargeCallBatches: (...args: unknown[]) => listChargeCallBatches(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  createBudget: (...args: unknown[]) => createBudget(...args),
  updateBudget: vi.fn(),
  recomputeBudgetAllocations: vi.fn(),
  generateBudgetChargeCalls: vi.fn(),
  createChargeCallBatch: vi.fn(),
  listSyndicateFunds: (...args: unknown[]) => listSyndicateFunds(...args),
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

const closedBudget = {
  id: 'budget-closed',
  fiscalYear: 2025,
  label: 'Budget 2025',
  totalAmount: 500000,
  currency: 'XOF',
  status: 'CLOSED',
  allocations: [],
  lines: [
    {
      id: 'line-1',
      budgetId: 'budget-closed',
      category: 'Ascenseur',
      description: 'Contrat annuel',
      amountForecast: 500000,
      amountActual: 480000,
      distributionKey: 'GENERAL_SHARES',
      fundId: 'fund-1'
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  listBudgets.mockResolvedValue([]);
  listChargeCallBatches.mockResolvedValue([]);
  listSyndicateLots.mockResolvedValue([]);
  listSyndicateFunds.mockResolvedValue([]);
  createBudget.mockResolvedValue({ id: 'new-budget' });
});

async function openCreateModal() {
  fireEvent.click(await screen.findByRole('button', { name: /Nouveau budget/ }, T));
  await screen.findByText('Postes du budget', {}, T);
}

async function fillPoste(index: number, category: string, description: string, amount: string) {
  const categories = await screen.findAllByLabelText('Catégorie', {}, T);
  const descriptions = await screen.findAllByLabelText('Description', {}, T);
  const amounts = await screen.findAllByLabelText('Montant prévu', {}, T);
  fireEvent.change(categories[index], { target: { value: category } });
  fireEvent.change(descriptions[index], { target: { value: description } });
  fireEvent.change(amounts[index], { target: { value: amount } });
}

describe('SyndicBudgets — création avec plusieurs postes (M4)', () => {
  it('envoie 3 lignes et un total égal à leur somme', async () => {
    mount();
    await openCreateModal();
    fireEvent.change(await screen.findByLabelText('Libellé', {}, T), { target: { value: 'Budget 2027' } });

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un poste/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un poste/ }));
    await waitFor(() => expect(screen.getAllByLabelText('Montant prévu')).toHaveLength(3), T);

    await fillPoste(0, 'Entretien', 'Nettoyage', '100000');
    await fillPoste(1, 'Eau', 'Consommation commune', '250000');
    await fillPoste(2, 'Assurance', 'Prime annuelle', '50000');

    // Total en direct : 400 000, quel que soit le séparateur de milliers.
    await waitFor(() => {
      const totalRow = screen.getByText('Total du budget').closest('div') as HTMLElement;
      expect((totalRow.textContent || '').replace(/\D/g, '')).toBe('400000');
    }, T);

    fireEvent.click(screen.getByRole('button', { name: /Créer budget/ }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1), T);
    const [tenantId, syndicId, payload] = createBudget.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(syndicId).toBe('syndic-1');
    expect(payload.totalAmount).toBe(400000);
    expect(payload.label).toBe('Budget 2027');
    expect(payload.currency).toBe('XOF');
    expect(payload.lines).toEqual([
      {
        category: 'Entretien',
        description: 'Nettoyage',
        amountForecast: 100000,
        distributionKey: 'GENERAL_SHARES',
        fundId: undefined
      },
      {
        category: 'Eau',
        description: 'Consommation commune',
        amountForecast: 250000,
        distributionKey: 'GENERAL_SHARES',
        fundId: undefined
      },
      {
        category: 'Assurance',
        description: 'Prime annuelle',
        amountForecast: 50000,
        distributionKey: 'GENERAL_SHARES',
        fundId: undefined
      }
    ]);
  }, 30000);

  it('ne permet pas de retirer le dernier poste', async () => {
    mount();
    await openCreateModal();
    expect(screen.queryByRole('button', { name: /Retirer le poste/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un poste/ }));
    const removeButtons = await screen.findAllByRole('button', { name: /Retirer le poste/ }, T);
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[0]);
    await waitFor(() => expect(screen.getAllByLabelText('Montant prévu')).toHaveLength(1), T);
    expect(screen.queryByRole('button', { name: /Retirer le poste/ })).toBeNull();
  }, 30000);

  it.each([
    ['vide', ''],
    ['nul', '0'],
    ['négatif', '-5']
  ])(
    'refuse un montant %s sans appeler createBudget',
    async (_name, amount) => {
      mount();
      await openCreateModal();
      fireEvent.change(await screen.findByLabelText('Libellé', {}, T), { target: { value: 'Budget 2027' } });
      await fillPoste(0, 'Entretien', 'Nettoyage', amount);

      fireEvent.click(screen.getByRole('button', { name: /Créer budget/ }));

      expect(await screen.findByText('Montant supérieur à 0 obligatoire', {}, T)).toBeTruthy();
      expect(createBudget).not.toHaveBeenCalled();
    },
    30000
  );
});

describe('SyndicBudgets — budget clôturé (lecture seule)', () => {
  beforeEach(() => {
    listBudgets.mockResolvedValue([closedBudget]);
    listSyndicateFunds.mockResolvedValue([{ id: 'fund-1', name: 'Fonds travaux' }]);
  });

  it('masque Générer appels dans la ligne du budget', async () => {
    mount();
    expect(await screen.findByText('Budget 2025', {}, T)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Générer appels/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Répartir/ })).toHaveProperty('disabled', true);
  }, 30000);

  it('affiche les postes et fonds en texte, sans Select ni action d écriture', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Postes et fonds/ }, T));

    const dialog = await screen.findByRole('dialog', {}, T);
    expect(await within(dialog).findByText('Ascenseur', {}, T)).toBeTruthy();
    expect(await within(dialog).findByText('Fonds travaux', {}, T)).toBeTruthy();
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(dialog.querySelector('.ant-select')).toBeNull();
    expect(within(dialog).getByText(/lecture seule/)).toBeTruthy();
    // Seuls boutons du dialogue : fermeture et export du tableau (lecture).
    const names = within(dialog)
      .queryAllByRole('button')
      .map(button => button.getAttribute('aria-label') || button.textContent);
    expect(names).toEqual(['Close', 'Exporter le tableau']);
  }, 30000);
});
