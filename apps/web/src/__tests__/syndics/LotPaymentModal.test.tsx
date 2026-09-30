import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicCharges } from '../../pages/syndics/SyndicCharges';

/**
 * Lot S2 (besoins 4 et 5) : la modale « Enregistrer un paiement » travaille
 * PAR LOT — choix des appels à couvrir, aperçu en direct (route dédiée), et
 * enregistrement sur `POST .../lots/:lotId/paiements`. Vrai antd (pas de mock
 * léger) : les cases à cocher et l'aperçu debouncé ont besoin du rendu réel.
 */

const getSyndicate = vi.fn();
const listSyndicateLots = vi.fn();
const listChargeCalls = vi.fn();
const createChargeCall = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  getSyndicate: (...args: unknown[]) => getSyndicate(...args),
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args),
  listAllChargeCallsWithSummary: (...args: unknown[]) => listChargeCalls(...args),
  createChargeCall: (...args: unknown[]) => createChargeCall(...args)
}));

const listOpenLotCharges = vi.fn();
const getLotAdvance = vi.fn();
const previewLotPayment = vi.fn();
const recordLotPayment = vi.fn();

const downloadReceiptFile = vi.fn();

vi.mock('../../services/syndic-receipt-service', () => ({
  downloadReceiptFile: (...args: unknown[]) => downloadReceiptFile(...args)
}));

const saveBlob = vi.fn();

vi.mock('../../utils/save-blob', () => ({
  saveBlob: (...args: unknown[]) => saveBlob(...args)
}));

vi.mock('../../services/syndic-lot-payment-service', () => ({
  listOpenLotCharges: (...args: unknown[]) => listOpenLotCharges(...args),
  getLotAdvance: (...args: unknown[]) => getLotAdvance(...args),
  previewLotPayment: (...args: unknown[]) => previewLotPayment(...args),
  recordLotPayment: (...args: unknown[]) => recordLotPayment(...args)
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

const baseCharge = {
  id: 'charge-1',
  lotId: 'lot-1',
  syndicateId: 'syndic-1',
  period: '2026-Q2',
  amount: 200000,
  currency: 'XOF',
  dueDate: '2026-06-10T00:00:00.000Z',
  status: 'PENDING' as const,
  paidAmount: 0,
  outstandingAmount: 200000,
  createdAt: '',
  updatedAt: ''
};

const olderOpenCall = {
  id: 'charge-0',
  period: '2026-Q1',
  periodStart: '2026-01-01',
  periodEnd: '2026-03-31',
  dueDate: '2026-03-10T00:00:00.000Z',
  amount: 100000,
  paid: 0,
  outstanding: 100000,
  currency: 'XOF',
  status: 'OVERDUE' as const
};

const targetOpenCall = {
  id: 'charge-1',
  period: '2026-Q2',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  dueDate: '2026-06-10T00:00:00.000Z',
  amount: 200000,
  paid: 0,
  outstanding: 200000,
  currency: 'XOF',
  status: 'PENDING' as const
};

describe('LotPaymentModal — paiement par lot (lot S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSyndicate.mockResolvedValue({
      id: 'syndic-1',
      tenantId: 'tenant-1',
      name: 'Residence Test',
      address: 'Dakar',
      totalLots: 1,
      totalBuildings: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    listSyndicateLots.mockResolvedValue([
      {
        id: 'lot-1',
        syndicateId: 'syndic-1',
        lotNumber: 'A-01',
        lotType: 'APARTMENT',
        generalShares: 100,
        createdAt: '',
        updatedAt: ''
      }
    ]);
    listChargeCalls.mockResolvedValue({
      items: [baseCharge],
      summary: { totalCount: 1, totalAmount: 100000, pendingCount: 1, overdueCount: 0 }
    });
    listOpenLotCharges.mockResolvedValue([olderOpenCall, targetOpenCall]);
    getLotAdvance.mockResolvedValue({ advance: 0, currency: 'XOF' });
  });

  it('ouverte depuis un appel : pré-coche cet appel et affecte automatiquement du plus ancien au plus récent quand on décoche', async () => {
    previewLotPayment.mockResolvedValue({
      payment: { id: null, lotId: 'lot-1', chargeCallId: 'charge-0', amount: 250000, unallocatedAmount: 0 },
      allocations: [
        {
          paymentId: null,
          chargeCallId: 'charge-0',
          period: '2026-Q1',
          amount: 100000,
          source: 'PAYMENT',
          callStatusAfter: 'PAID'
        },
        {
          paymentId: null,
          chargeCallId: 'charge-1',
          period: '2026-Q2',
          amount: 150000,
          source: 'PAYMENT',
          callStatusAfter: 'PARTIAL'
        }
      ],
      advance: 0,
      lotAdvanceBalance: 0,
      currency: 'XOF'
    });

    renderWithRoute();

    // Le bouton de la ligne du tableau (pas celui, générique, de l'en-tête) :
    // il pré-sélectionne le lot ET l'appel de ce dossier.
    const periodCell = await screen.findByText('2026-Q2');
    const row = periodCell.closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Enregistrer un paiement' }));

    // Les appels ouverts du lot se chargent, avec l'appel du dossier pré-coché.
    await waitFor(() => expect(listOpenLotCharges).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'lot-1'));

    const amountInput = document.getElementById('lot-payment-amount') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '250000' } });
    fireEvent.blur(amountInput);

    // Aperçu debouncé : attend l'appel puis affiche le résultat.
    await waitFor(() => expect(previewLotPayment).toHaveBeenCalled(), { timeout: 2000 });
    expect(await screen.findByText(/Avance restante/)).toBeTruthy();

    const submitButton = await screen.findByText('Enregistrer');
    recordLotPayment.mockResolvedValue({
      payment: { id: 'payment-1', lotId: 'lot-1', chargeCallId: 'charge-0', amount: 250000, unallocatedAmount: 0 },
      allocations: [
        {
          paymentId: 'payment-1',
          chargeCallId: 'charge-0',
          period: '2026-Q1',
          amount: 100000,
          source: 'PAYMENT',
          callStatusAfter: 'PAID'
        },
        {
          paymentId: 'payment-1',
          chargeCallId: 'charge-1',
          period: '2026-Q2',
          amount: 150000,
          source: 'PAYMENT',
          callStatusAfter: 'PARTIAL'
        }
      ],
      advance: 0,
      lotAdvanceBalance: 0,
      currency: 'XOF'
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(recordLotPayment).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        'lot-1',
        expect.objectContaining({ amount: 250000, chargeCallIds: ['charge-1'] })
      );
    });
  });

  it('coche des mois précis et les envoie dans chargeCallIds', async () => {
    previewLotPayment.mockResolvedValue({
      payment: { id: null, lotId: 'lot-1', chargeCallId: 'charge-1', amount: 200000, unallocatedAmount: 0 },
      allocations: [
        {
          paymentId: null,
          chargeCallId: 'charge-1',
          period: '2026-Q2',
          amount: 200000,
          source: 'PAYMENT',
          callStatusAfter: 'PAID'
        }
      ],
      advance: 0,
      lotAdvanceBalance: 0,
      currency: 'XOF'
    });
    recordLotPayment.mockResolvedValue({
      payment: { id: 'payment-2', lotId: 'lot-1', chargeCallId: 'charge-1', amount: 200000, unallocatedAmount: 0 },
      allocations: [
        {
          paymentId: 'payment-2',
          chargeCallId: 'charge-1',
          period: '2026-Q2',
          amount: 200000,
          source: 'PAYMENT',
          callStatusAfter: 'PAID'
        }
      ],
      advance: 0,
      lotAdvanceBalance: 0,
      currency: 'XOF'
    });

    renderWithRoute();

    // Deux boutons portent ce libellé (l'en-tête générique et la ligne du
    // tableau) : le premier, dans l'en-tête, ouvre la modale sans présélection.
    const openButtons = await screen.findAllByRole('button', { name: 'Enregistrer un paiement' });
    fireEvent.click(openButtons[0]);

    const lotSelect = await screen.findByLabelText('Lot');
    fireEvent.mouseDown(lotSelect);
    const lotOption = await screen.findByText(/A-01/);
    fireEvent.click(lotOption);

    await waitFor(() => expect(listOpenLotCharges).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'lot-1'));

    // Coche uniquement l'appel du deuxième trimestre (2026-Q2), pas le premier.
    const row = (await screen.findByText('2026-Q2 (01/04/2026 – 30/06/2026)')).closest('tr');
    const checkbox = within(row as HTMLElement).getByRole('checkbox');
    // BUG-003 : statut traduit, cases et montant nommés en français.
    expect(within(row as HTMLElement).getByText('En attente')).toBeTruthy();
    expect(checkbox.getAttribute('aria-label')).toBe("Sélectionner l'appel 2026-Q2");
    expect(screen.getByRole('checkbox', { name: 'Sélectionner tous les appels' })).toBeTruthy();
    expect(screen.getAllByText('Période').length).toBeGreaterThan(0);
    fireEvent.click(checkbox);

    const amountInput = screen.getByRole('spinbutton', { name: 'Montant' }) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '200000' } });
    fireEvent.blur(amountInput);

    await waitFor(() => expect(previewLotPayment).toHaveBeenCalled(), { timeout: 2000 });
    // « Statut après » de l'aperçu : libellé, jamais le code brut.
    await waitFor(() => expect(screen.getAllByText('Payé').some(element => element.closest('.ant-tag'))).toBe(true));
    expect(screen.queryByText('PAID')).toBeNull();

    const submitButton = await screen.findByText('Enregistrer');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(recordLotPayment).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        'lot-1',
        expect.objectContaining({ amount: 200000, chargeCallIds: ['charge-1'] })
      );
    });
  });

  it('affiche la synthèse avec les documents émis (lot S3) et ne rafraîchit la liste qu’à la fermeture', async () => {
    previewLotPayment.mockResolvedValue({
      payment: { id: null, lotId: 'lot-1', chargeCallId: 'charge-1', amount: 200000, unallocatedAmount: 0 },
      allocations: [
        {
          paymentId: null,
          chargeCallId: 'charge-1',
          period: '2026-Q2',
          amount: 200000,
          source: 'PAYMENT',
          callStatusAfter: 'PAID'
        }
      ],
      advance: 0,
      lotAdvanceBalance: 0,
      currency: 'XOF'
    });
    recordLotPayment.mockResolvedValue({
      payment: { id: 'payment-3', lotId: 'lot-1', chargeCallId: 'charge-1', amount: 200000, unallocatedAmount: 0 },
      allocations: [
        {
          paymentId: 'payment-3',
          chargeCallId: 'charge-1',
          period: '2026-Q2',
          amount: 200000,
          source: 'PAYMENT',
          callStatusAfter: 'PAID'
        }
      ],
      advance: 0,
      lotAdvanceBalance: 0,
      currency: 'XOF',
      documents: [{ id: 'receipt-1', kind: 'QUITTANCE', number: 'Q-2026-000001' }]
    });

    renderWithRoute();

    const openButtons = await screen.findAllByRole('button', { name: 'Enregistrer un paiement' });
    fireEvent.click(openButtons[0]);

    const lotSelect = await screen.findByLabelText('Lot');
    fireEvent.mouseDown(lotSelect);
    fireEvent.click(await screen.findByText(/A-01/));

    await waitFor(() => expect(listOpenLotCharges).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'lot-1'));

    const amountInput = document.getElementById('lot-payment-amount') as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '200000' } });
    fireEvent.blur(amountInput);
    await waitFor(() => expect(previewLotPayment).toHaveBeenCalled(), { timeout: 2000 });

    fireEvent.click(await screen.findByText('Enregistrer'));
    await waitFor(() => expect(recordLotPayment).toHaveBeenCalled());

    // La synthèse remplace le formulaire : titre, numéro de document, action
    // de téléchargement — et `listChargeCalls` (rafraîchissement du parent)
    // n'a pas encore été rejoué.
    expect(await screen.findByText('Paiement enregistré')).toBeTruthy();
    expect(await screen.findByText('Q-2026-000001')).toBeTruthy();
    const callsBeforeClose = listChargeCalls.mock.calls.length;

    downloadReceiptFile.mockResolvedValue({ blob: new Blob(['%PDF-1.4']), filename: 'Quittance Q-2026-000001.pdf' });
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() =>
      expect(downloadReceiptFile).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        'receipt-1',
        'Quittance Q-2026-000001.pdf'
      )
    );
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    await waitFor(() => expect(listChargeCalls.mock.calls.length).toBeGreaterThan(callsBeforeClose));
    // BUG-003 : avance formatée comme les autres montants, avec la devise.
    expect(await screen.findByText('Paiement enregistré : 1 appel(s) soldé(s), avance de 0 FCFA')).toBeTruthy();
  });
});
