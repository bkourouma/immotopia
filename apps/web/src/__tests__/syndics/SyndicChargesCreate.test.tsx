import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * BUG-2026-09-27-008 : création d'un appel de charges.
 *   (a) un formulaire invalide ne laisse plus de rejet « Uncaught (in promise) » ;
 *   (b) une échéance passée est autorisée (saisie d'arriérés), avec un
 *       avertissement non bloquant sous le champ.
 */

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const createChargeCall = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listAllChargeCallsWithSummary: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: (...args: unknown[]) => createChargeCall(...args),
  // Fonds de la copropriete : aucun ici, le champ « Fonds alimente » reste masque.
  listSyndicateFunds: vi.fn(async () => []),
  assignChargeCallFund: vi.fn()
}));

const getLotTypeRates = vi.fn();

vi.mock('../../services/syndic-lot-type-rates-service', () => ({
  getLotTypeRates: (...args: unknown[]) => getLotTypeRates(...args),
  updateLotTypeRates: vi.fn()
}));

vi.mock('../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: vi.fn(async () => []),
  getLotAdvance: vi.fn(async () => ({ advance: 0, currency: 'XOF' })),
  previewLotPayment: vi.fn(),
  recordLotPayment: vi.fn()
}));

vi.mock('../../services/syndic-receipt-service', () => ({
  downloadReceiptFile: vi.fn()
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn()
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

function renderWithRoute() {
  return render(
    <AuthContext.Provider value={authValue}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/tenant-1/syndics/syndic-1/charges']}>
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/charges" element={<SyndicCharges />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </AuthContext.Provider>
  );
}

async function openCreateModal() {
  renderWithRoute();
  const openButton = await screen.findByRole('button', { name: /Nouvel appel de charges/ });
  await waitFor(() => expect((openButton as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(openButton);
  return screen.findByRole('dialog');
}

const WARNING = "Échéance passée : l'appel sera immédiatement en retard.";

describe('SyndicCharges — création d’un appel de charges (BUG-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([
      { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 }
    ]);
    listChargeCalls.mockResolvedValue({
      items: [],
      summary: { totalCount: 0, totalAmount: 0, pendingCount: 0, overdueCount: 0 }
    });
  });

  it('intercepte le rejet de validation : message sous le champ, aucun appel API', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    try {
      const dialog = await openCreateModal();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));

      expect(await within(dialog).findByText('La date est obligatoire')).toBeTruthy();
      expect(createChargeCall).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', unhandled);
    }
  });

  it('accepte une échéance passée et affiche un avertissement non bloquant', async () => {
    const dialog = await openCreateModal();
    expect(within(dialog).queryByText(WARNING)).toBeNull();

    const dateInput = within(dialog).getByLabelText("Date d'échéance") as HTMLInputElement;
    fireEvent.mouseDown(dateInput);
    fireEvent.change(dateInput, { target: { value: '15/01/2020' } });
    fireEvent.keyDown(dateInput, { key: 'Enter', code: 'Enter', keyCode: 13 });

    expect(await within(dialog).findByText(WARNING)).toBeTruthy();
  });
});

describe('SyndicCharges — mode de répartition (menu lot 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({ id: 'syndic-1', tenantId: 'tenant-1', name: 'Residence Test', status: 'ACTIVE' });
    listSyndicateLots.mockResolvedValue([
      { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 },
      { id: 'lot-2', syndicateId: 'syndic-1', lotNumber: 'A-02', lotType: 'APARTMENT', generalShares: 300 },
      { id: 'lot-3', syndicateId: 'syndic-1', lotNumber: 'P-01', lotType: 'PARKING', generalShares: 100 }
    ]);
    listChargeCalls.mockResolvedValue({
      items: [],
      summary: { totalCount: 0, totalAmount: 0, pendingCount: 0, overdueCount: 0 }
    });
    getLotTypeRates.mockResolvedValue({
      rates: { APARTMENT: 25000, PARKING: 5000 },
      lotTypesPresent: [
        { lotType: 'APARTMENT', count: 2 },
        { lotType: 'PARKING', count: 1 }
      ],
      missingTypes: [],
      isEmpty: false,
      updatedAt: null
    });
    createChargeCall.mockResolvedValue({ chargeCalls: [], generatedLots: 3, occurrences: 1, totalCreated: 3 });
  });

  async function chooseTarget(dialog: HTMLElement, optionTitle: string) {
    fireEvent.mouseDown(within(dialog).getByLabelText('Cible'));
    fireEvent.click(await screen.findByTitle(optionTitle));
  }

  async function fillRequired(dialog: HTMLElement) {
    fireEvent.change(within(dialog).getByLabelText('Libellé de la période'), { target: { value: '2026-T1' } });
    const dateInput = within(dialog).getByLabelText("Date d'échéance") as HTMLInputElement;
    fireEvent.mouseDown(dateInput);
    fireEvent.change(dateInput, { target: { value: '15/01/2030' } });
    fireEvent.keyDown(dateInput, { key: 'Enter', code: 'Enter', keyCode: 13 });
  }

  it('un seul lot : pas de sélecteur de mode, montant simple, comportement historique', async () => {
    const dialog = await openCreateModal();
    expect(within(dialog).queryByText('Par type de lot')).toBeNull();
    expect(within(dialog).getByLabelText('Montant')).toBeTruthy();
    expect(getLotTypeRates).not.toHaveBeenCalled();
  });

  it('tous les lots : sélecteur visible, montant total et aperçu par tantièmes', async () => {
    const dialog = await openCreateModal();
    await chooseTarget(dialog, 'Tous les lots');

    expect(await within(dialog).findByText('Par tantièmes')).toBeTruthy();
    expect(within(dialog).getByText('Équitablement')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Montant total à répartir'), { target: { value: '500000' } });

    // 100 + 300 + 100 tantièmes : 100 000 / 300 000 / 100 000.
    expect(await within(dialog).findByText('A-01')).toBeTruthy();
    expect(within(dialog).getByText('P-01')).toBeTruthy();
    expect(within(dialog).getAllByText(/300\s000/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/Total à répartir/)).toBeTruthy();
    expect(getLotTypeRates).not.toHaveBeenCalled();
  });

  it('tous les lots, équitable : envoie allocationMethod EQUAL avec le total', async () => {
    const dialog = await openCreateModal();
    await chooseTarget(dialog, 'Tous les lots');
    fireEvent.click(await within(dialog).findByText('Équitablement'));
    fireEvent.change(within(dialog).getByLabelText('Montant total à répartir'), { target: { value: '300000' } });
    await fillRequired(dialog);
    await waitFor(() => expect(within(dialog).getAllByText(/100\s000/).length).toBeGreaterThan(0));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(createChargeCall).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        expect.objectContaining({ applyToAllLots: true, allocationMethod: 'EQUAL', amount: 300000 })
      )
    );
  });

  it('par type de lot : champ montant masqué, aperçu du barème, total calculé, envoi sans montant', async () => {
    const dialog = await openCreateModal();
    await chooseTarget(dialog, 'Tous les lots');
    fireEvent.click(await within(dialog).findByText('Par type de lot'));

    await waitFor(() => expect(getLotTypeRates).toHaveBeenCalledWith('tenant-1', 'syndic-1'));
    expect(within(dialog).queryByLabelText('Montant total à répartir')).toBeNull();
    // 2 x 25 000 + 5 000 = 55 000.
    expect(await within(dialog).findByText(/Total de l'appel/)).toBeTruthy();
    expect(within(dialog).getAllByText(/55\s000/).length).toBeGreaterThan(0);

    await fillRequired(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(createChargeCall).toHaveBeenCalledTimes(1));
    const payload = createChargeCall.mock.calls[0][2];
    expect(payload.allocationMethod).toBe('BY_LOT_TYPE');
    expect(payload.amount).toBeUndefined();
    expect(payload.applyToAllLots).toBe(true);
  });

  it('par type de lot avec un barème incomplet : avertissement, lien de paramétrage, soumission bloquée', async () => {
    getLotTypeRates.mockResolvedValue({
      rates: { APARTMENT: 25000 },
      lotTypesPresent: [
        { lotType: 'APARTMENT', count: 2 },
        { lotType: 'PARKING', count: 1 }
      ],
      missingTypes: ['PARKING'],
      isEmpty: false,
      updatedAt: null
    });
    const dialog = await openCreateModal();
    await chooseTarget(dialog, 'Tous les lots');
    fireEvent.click(await within(dialog).findByText('Par type de lot'));

    expect(await within(dialog).findByText(/aucun montant pour PARKING/)).toBeTruthy();
    const link = within(dialog).getByText('Paramétrer le barème de la copropriété').closest('a');
    expect(link?.getAttribute('href')).toBe('/tenant/tenant-1/syndics/syndic-1');

    await fillRequired(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(createChargeCall).not.toHaveBeenCalled();
  });

  it('barème indisponible : avertissement, soumission bloquée', async () => {
    getLotTypeRates.mockRejectedValue(new Error('boom'));
    const dialog = await openCreateModal();
    await chooseTarget(dialog, 'Tous les lots');
    fireEvent.click(await within(dialog).findByText('Par type de lot'));

    expect(await within(dialog).findByText(/barème par type de lot est indisponible/)).toBeTruthy();
    await fillRequired(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(createChargeCall).not.toHaveBeenCalled();
  });
});
