import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CoOwnerLots from '../../pages/CoOwnerPortal/Lots';
import CoOwnerLotAccount from '../../pages/CoOwnerPortal/LotAccount';
import CoOwnerChargeCalls from '../../pages/CoOwnerPortal/ChargeCalls';
import CoOwnerDocuments from '../../pages/CoOwnerPortal/Documents';
import CoOwnerMeetings from '../../pages/CoOwnerPortal/Meetings';
import CoOwnerPayments from '../../pages/CoOwnerPortal/Payments';
import CoOwnerReceipts from '../../pages/CoOwnerPortal/Receipts';
import type {
  CoOwnerChargeCall,
  CoOwnerDeclaration,
  CoOwnerDocument,
  CoOwnerLot,
  CoOwnerLotAccount as LotAccountData,
  CoOwnerMeeting,
  CoOwnerPayment,
  CoOwnerReceipt
} from '../../services/coowner-portal-service';

/**
 * Recherche multicritères (lot POR, tâche F4) sur les écrans du portail
 * copropriétaire : filtrage LOCAL des listes reçues en entier (appels, compte de
 * lot, documents, lots, assemblées, paiements) et critères envoyés au serveur pour
 * les deux listes paginées (quittances, déclarations).
 *
 * Le mock reprend le module réel (`importActual`) : Vitest refuse un import non
 * déclaré.
 */

const listMyLots = vi.fn();
const getMyLotAccount = vi.fn();
const listMyChargeCalls = vi.fn();
const listMyDocuments = vi.fn();
const listMyMeetings = vi.fn();
const listMyPayments = vi.fn();
const listMyDeclarations = vi.fn();
const listMyReceipts = vi.fn();
const getOnlinePaymentAvailability = vi.fn();
const getDeclaredAvailability = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyLots: (...a: unknown[]) => listMyLots(...a),
    getMyLotAccount: (...a: unknown[]) => getMyLotAccount(...a),
    listMyChargeCalls: (...a: unknown[]) => listMyChargeCalls(...a),
    listMyDocuments: (...a: unknown[]) => listMyDocuments(...a),
    listMyMeetings: (...a: unknown[]) => listMyMeetings(...a),
    listMyPayments: (...a: unknown[]) => listMyPayments(...a),
    listMyDeclarations: (...a: unknown[]) => listMyDeclarations(...a),
    listMyReceipts: (...a: unknown[]) => listMyReceipts(...a),
    getOnlinePaymentAvailability: (...a: unknown[]) => getOnlinePaymentAvailability(...a),
    getDeclaredAvailability: (...a: unknown[]) => getDeclaredAvailability(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const WAIT = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Url />
        <Routes>
          <Route path="/copropriete" element={<CoOwnerLots />} />
          <Route path="/copropriete/lots/:lotId" element={<CoOwnerLotAccount />} />
          <Route path="/copropriete/appels" element={<CoOwnerChargeCalls />} />
          <Route path="/copropriete/documents" element={<CoOwnerDocuments />} />
          <Route path="/copropriete/assemblees" element={<CoOwnerMeetings />} />
          <Route path="/copropriete/paiements" element={<CoOwnerPayments />} />
          <Route path="/copropriete/quittances" element={<CoOwnerReceipts />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const url = () => screen.getByTestId('url').textContent ?? '';

/** Champ libre de la barre (une seule barre à l'écran) ou de celle qui porte ce nom accessible. */
const searchBox = (name?: string) =>
  within(name ? screen.getByRole('search', { name }) : screen.getByRole('search')).getByRole('textbox', {
    name: 'Rechercher'
  });

/** « Effacer les critères » existe dans la barre et dans le bloc d'état : on prend le dernier. */
async function clearCriteria() {
  const buttons = screen.getAllByRole('button', { name: 'Effacer les critères' });
  await userEvent.click(buttons[buttons.length - 1]);
}

const syndicate = { id: 's1', name: 'Résidence Les Acacias', address: 'Plateau' };

function lot(overrides: Partial<CoOwnerLot> = {}): CoOwnerLot {
  return {
    id: 'lot-1',
    lotNumber: 'A1',
    lotType: 'APARTMENT',
    generalShares: 400,
    specialShares: null,
    ownershipPercentage: 100,
    syndicate,
    balance: { amount: 70000, direction: 'DEBITEUR', currency: 'XOF' },
    ...overrides
  };
}

function call(overrides: Partial<CoOwnerChargeCall> = {}): CoOwnerChargeCall {
  return {
    id: 'call-1',
    period: '2026-T1',
    amount: 100000,
    paid: 0,
    outstanding: 100000,
    currency: 'XOF',
    dueDate: '2026-01-10T00:00:00.000Z',
    status: 'OVERDUE',
    lot: { id: 'lot-1', lotNumber: 'A1', lotType: 'APARTMENT' },
    syndicate: 'Résidence Les Acacias',
    syndicateId: 's1',
    onlinePayable: false,
    onlineCheckout: 'NONE',
    onlineCheckoutCode: null,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listMyLots.mockResolvedValue([lot()]);
  getDeclaredAvailability.mockRejectedValue(new Error('indisponible'));
  getOnlinePaymentAvailability.mockRejectedValue({ response: { status: 403 } });
  listMyDeclarations.mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
});

describe('Appels de charges : recherche locale', () => {
  const calls = [
    call({ id: 'call-1', period: '2026-T1', status: 'OVERDUE' }),
    call({ id: 'call-2', period: '2026-T2', status: 'PAID', paid: 100000, outstanding: 0 }),
    call({
      id: 'call-3',
      period: '2026-T3',
      status: 'PENDING',
      lot: { id: 'lot-2', lotNumber: 'B2', lotType: 'PARKING' }
    })
  ];

  it('filtre les lignes avec le champ libre et met la saisie dans l’URL', async () => {
    listMyChargeCalls.mockResolvedValue(calls);
    mount('/copropriete/appels');

    expect(await screen.findByText('2026-T1', {}, WAIT)).toBeInTheDocument();
    await userEvent.type(searchBox(), 'T2');
    await waitFor(() => expect(screen.queryByText('2026-T1')).not.toBeInTheDocument(), WAIT);
    expect(screen.getByText('2026-T2')).toBeInTheDocument();
    expect(url()).toContain('q=T2');
  });

  it('applique le statut d’une URL partagée, puis « Effacer » rend toute la liste', async () => {
    listMyChargeCalls.mockResolvedValue(calls);
    mount('/copropriete/appels?status=PAID');

    expect(await screen.findByText('2026-T2', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('2026-T1')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-T3')).not.toBeInTheDocument();

    await clearCriteria();
    expect(await screen.findByText('2026-T1', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('2026-T3')).toBeInTheDocument();
    expect(url()).not.toContain('status=');
  });

  it('retire de la sélection l’appel qu’un filtre masque : le total payé suit les lignes affichées', async () => {
    listMyChargeCalls.mockResolvedValue([
      call({ id: 'call-1', period: '2026-T1', onlinePayable: true }),
      call({ id: 'call-2', period: '2026-T2', onlinePayable: true, amount: 50000, outstanding: 50000 })
    ]);
    getOnlinePaymentAvailability.mockResolvedValue({
      syndicates: [
        {
          syndicateId: 's1',
          name: 'Résidence Les Acacias',
          available: true,
          unavailableReason: null,
          mode: 'LIVE',
          simulated: false,
          feesPaidBy: 'CLIENT'
        }
      ],
      paymentMethods: ['WAVE']
    });
    mount('/copropriete/appels');

    await userEvent.click(await screen.findByRole('checkbox', { name: "Sélectionner l'appel 2026-T1" }, WAIT));
    await userEvent.click(screen.getByRole('checkbox', { name: "Sélectionner l'appel 2026-T2" }));
    expect(screen.getByText(/Total à payer/).textContent?.replace(/\s/g, '')).toContain('150000');

    await userEvent.type(searchBox(), 'T2');
    await waitFor(() => expect(screen.queryByText('2026-T1')).not.toBeInTheDocument(), WAIT);
    await waitFor(
      () => expect(screen.getByText(/Total à payer/).textContent?.replace(/\s/g, '')).toContain('50000'),
      WAIT
    );
    expect(screen.getByText(/Total à payer/).textContent?.replace(/\s/g, '')).not.toContain('150000');
    expect(screen.getByRole('checkbox', { name: "Sélectionner l'appel 2026-T2" })).toBeChecked();
  });
});

describe('Compte de lot : deux barres', () => {
  const account: LotAccountData = {
    lot: {
      id: 'lot-1',
      lotNumber: 'A1',
      lotType: 'APARTMENT',
      generalShares: 400,
      specialShares: null,
      ownershipPercentage: 100
    },
    syndicate,
    account: { amount: 70000, direction: 'DEBITEUR', currency: 'XOF', lastUpdatedAt: '2026-01-10T00:00:00.000Z' },
    transactions: [
      {
        id: 'tx-1',
        transactionDate: '2026-01-10T00:00:00.000Z',
        type: 'CHARGE_CALL',
        label: 'Appel T1 2026',
        reference: null,
        debit: 100000,
        credit: null,
        balanceAfter: 100000,
        balanceAfterDirection: 'DEBITEUR'
      },
      {
        id: 'tx-2',
        transactionDate: '2026-02-12T00:00:00.000Z',
        type: 'PAYMENT',
        label: 'Virement reçu',
        reference: null,
        debit: null,
        credit: 30000,
        balanceAfter: 70000,
        balanceAfterDirection: 'DEBITEUR'
      }
    ]
  };

  beforeEach(() => {
    getMyLotAccount.mockResolvedValue(account);
    listMyChargeCalls.mockResolvedValue([
      call({ id: 'call-1', period: '2026-T1' }),
      call({ id: 'call-2', period: '2026-T2', status: 'PAID' })
    ]);
  });

  it('filtre les mouvements avec le préfixe « mv » sans toucher aux appels de charges', async () => {
    mount('/copropriete/lots/lot-1');

    expect(await screen.findByText('Virement reçu', {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByText('2026-T2', {}, WAIT)).toBeInTheDocument();

    await userEvent.type(searchBox('Rechercher dans les mouvements'), 'virement');
    await waitFor(() => expect(screen.queryByText('Appel T1 2026')).not.toBeInTheDocument(), WAIT);
    expect(screen.getByText('Virement reçu')).toBeInTheDocument();
    expect(url()).toContain('mv.q=virement');
    // Le tableau des appels du lot garde toutes ses lignes.
    expect(screen.getByText('2026-T1')).toBeInTheDocument();
    expect(screen.getByText('2026-T2')).toBeInTheDocument();
  });

  it('filtre les appels de charges du lot avec le préfixe « ap » depuis l’URL', async () => {
    mount('/copropriete/lots/lot-1?ap.status=PAID');

    expect(await screen.findByText('2026-T2', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('2026-T1')).not.toBeInTheDocument();
    // Les mouvements ne sont pas filtrés par ce critère.
    expect(screen.getByText('Appel T1 2026')).toBeInTheDocument();
    expect(screen.getByText('Virement reçu')).toBeInTheDocument();
  });
});

describe('Documents : recherche locale', () => {
  const documents: CoOwnerDocument[] = [
    {
      id: 'd1',
      title: 'Règlement 2024',
      type: 'REGULATION',
      createdAt: '2026-01-01T00:00:00.000Z',
      syndicate: 'Résidence Les Acacias',
      downloadable: true,
      externalUrl: null
    },
    {
      id: 'd2',
      title: 'PV de l’AG de mars',
      type: 'GENERAL_MEETING_MINUTES',
      createdAt: '2026-03-20T00:00:00.000Z',
      syndicate: 'Résidence Les Palmiers',
      downloadable: true,
      externalUrl: null
    }
  ];

  it('filtre par champ libre (titre, copropriété) et met la saisie dans l’URL', async () => {
    listMyDocuments.mockResolvedValue(documents);
    mount('/copropriete/documents');

    expect(await screen.findByText('Règlement 2024', {}, WAIT)).toBeInTheDocument();
    await userEvent.type(searchBox(), 'palmiers');
    await waitFor(() => expect(screen.queryByText('Règlement 2024')).not.toBeInTheDocument(), WAIT);
    expect(screen.getByText('PV de l’AG de mars')).toBeInTheDocument();
    expect(url()).toContain('q=palmiers');
  });

  it('applique le type d’une URL partagée, puis « Effacer »', async () => {
    listMyDocuments.mockResolvedValue(documents);
    mount('/copropriete/documents?type=REGULATION');

    expect(await screen.findByText('Règlement 2024', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('PV de l’AG de mars')).not.toBeInTheDocument();

    await clearCriteria();
    expect(await screen.findByText('PV de l’AG de mars', {}, WAIT)).toBeInTheDocument();
    expect(url()).not.toContain('type=');
  });
});

describe('Mes lots : barre au-delà de six lots', () => {
  const manyLots = Array.from({ length: 7 }, (_, index) =>
    lot({ id: `lot-${index + 1}`, lotNumber: `Z${index + 1}`, balance: null })
  );

  it('n’affiche pas de barre jusqu’à six lots', async () => {
    listMyLots.mockResolvedValue(manyLots.slice(0, 6));
    mount('/copropriete');

    expect(await screen.findByText('Lot Z6', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('filtre les cartes par numéro au-delà de six lots, puis « Effacer »', async () => {
    listMyLots.mockResolvedValue(manyLots);
    mount('/copropriete');

    expect(await screen.findByText('Lot Z7', {}, WAIT)).toBeInTheDocument();
    await userEvent.type(searchBox(), 'z3');
    await waitFor(() => expect(screen.queryByText('Lot Z7')).not.toBeInTheDocument(), WAIT);
    expect(screen.getByText('Lot Z3')).toBeInTheDocument();
    expect(url()).toContain('q=z3');

    await userEvent.clear(searchBox());
    await userEvent.type(searchBox(), 'introuvable');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, WAIT)).toBeInTheDocument();
    await clearCriteria();
    expect(await screen.findByText('Lot Z7', {}, WAIT)).toBeInTheDocument();
  });

  it('ignore un critère d’URL quand la barre n’est pas affichée', async () => {
    listMyLots.mockResolvedValue(manyLots.slice(0, 3));
    mount('/copropriete?q=Z1');

    expect(await screen.findByText('Lot Z3', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Lot Z1')).toBeInTheDocument();
  });
});

describe('Assemblées : recherche locale', () => {
  const meeting = (overrides: Partial<CoOwnerMeeting>): CoOwnerMeeting => ({
    id: 'm1',
    type: 'ORDINARY',
    scheduledAt: '2026-03-20T09:00:00.000Z',
    location: 'Salle des fêtes',
    status: 'PLANNED',
    syndicate: 'Résidence Les Acacias',
    agenda: [],
    resolutions: [],
    ...overrides
  });
  const meetings = [
    meeting({ id: 'm1', syndicate: 'Résidence Les Acacias' }),
    meeting({
      id: 'm2',
      syndicate: 'Résidence Les Palmiers',
      status: 'COMPLETED',
      scheduledAt: '2025-06-10T09:00:00.000Z'
    })
  ];

  it('filtre par champ libre (copropriété) et met la saisie dans l’URL', async () => {
    listMyMeetings.mockResolvedValue(meetings);
    mount('/copropriete/assemblees');

    expect(await screen.findByText('Résidence Les Acacias', {}, WAIT)).toBeInTheDocument();
    await userEvent.type(searchBox(), 'palmiers');
    await waitFor(() => expect(screen.queryByText('Résidence Les Acacias')).not.toBeInTheDocument(), WAIT);
    expect(screen.getByText('Résidence Les Palmiers')).toBeInTheDocument();
    expect(url()).toContain('q=palmiers');
  });

  it('applique statut et période d’une URL partagée, puis « Effacer »', async () => {
    listMyMeetings.mockResolvedValue(meetings);
    mount('/copropriete/assemblees?status=COMPLETED&dateFrom=2025-01-01&dateTo=2025-12-31');

    expect(await screen.findByText('Résidence Les Palmiers', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('Résidence Les Acacias')).not.toBeInTheDocument();

    await clearCriteria();
    expect(await screen.findByText('Résidence Les Acacias', {}, WAIT)).toBeInTheDocument();
    expect(url()).not.toContain('status=');
  });
});

describe('Paiements et déclarations : préfixes « pa » et « dec »', () => {
  const payment = (overrides: Partial<CoOwnerPayment>): CoOwnerPayment => ({
    id: 'pay-1',
    paidAt: '2026-01-15T00:00:00.000Z',
    amount: 100000,
    currency: 'XOF',
    method: 'BANK_TRANSFER',
    methodLabel: 'Virement',
    reference: 'REF-ALPHA',
    lot: { id: 'lot-1', lotNumber: 'A1' },
    syndicate: { id: 's1', name: 'Résidence Les Acacias' },
    allocations: [],
    remainingAdvance: 0,
    documents: [],
    ...overrides
  });
  const payments = {
    items: [
      payment({ id: 'pay-1' }),
      payment({ id: 'pay-2', method: 'CASH', methodLabel: 'Espèces', reference: 'REF-BETA' })
    ],
    advances: []
  };
  const declaration = (id: string, status: CoOwnerDeclaration['status'], reference: string): CoOwnerDeclaration => ({
    id,
    status,
    syndicate: { id: 's1', name: 'Résidence Les Acacias' },
    receivingNumber: { operator: 'ORANGE', phoneNumber: '+2250707070707', holderName: 'Syndic' },
    payerPhone: '+2250101010101',
    amount: 50000,
    acceptedAmount: null,
    paidAt: '2026-10-10T09:30:00.000Z',
    transactionReference: reference,
    lines: [{ lot: { id: 'lot-1', lotNumber: 'A1' }, amount: 50000, acceptedAmount: null, chargeCallIds: [] }],
    documents: [],
    rejectReason: null,
    reviewNote: null,
    canCancel: false,
    createdAt: '2026-10-10T10:00:00.000Z',
    reviewedAt: null
  });

  beforeEach(() => {
    listMyPayments.mockResolvedValue(payments);
  });

  it('filtre les paiements localement (référence, mode) sans appeler le serveur à nouveau', async () => {
    mount('/copropriete/paiements');

    expect(await screen.findByText('REF-BETA', {}, WAIT)).toBeInTheDocument();
    const appelsAvant = listMyPayments.mock.calls.length;

    await userEvent.type(searchBox('Rechercher dans les paiements'), 'espèces');
    await waitFor(() => expect(screen.queryByText('REF-ALPHA')).not.toBeInTheDocument(), WAIT);
    expect(screen.getByText('REF-BETA')).toBeInTheDocument();
    expect(url()).toContain('pa.q=');
    expect(listMyPayments.mock.calls.length).toBe(appelsAvant);
  });

  it('envoie lot et exercice de l’URL à l’appel des paiements', async () => {
    mount('/copropriete/paiements?pa.lot=lot-1&pa.year=2026');

    expect(await screen.findByText('REF-ALPHA', {}, WAIT)).toBeInTheDocument();
    expect(listMyPayments).toHaveBeenCalledWith({ lotId: 'lot-1', year: 2026 });
  });

  it('envoie le statut des déclarations au serveur, sans filtrer côté client', async () => {
    listMyDeclarations.mockImplementation(async (params: { status?: string }) => ({
      items: params.status
        ? [declaration('d2', 'APPROVED', 'MP-VALIDEE')]
        : [declaration('d1', 'PENDING', 'MP-ATTENTE'), declaration('d2', 'APPROVED', 'MP-VALIDEE')],
      pagination: { page: 1, limit: 20, total: params.status ? 1 : 2, totalPages: 1 }
    }));
    mount('/copropriete/paiements?dec.status=APPROVED');

    expect(await screen.findByText('MP-VALIDEE', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByText('MP-ATTENTE')).not.toBeInTheDocument();
    expect(listMyDeclarations).toHaveBeenLastCalledWith({ status: 'APPROVED', page: 1, limit: 20 });
    // Deux barres, deux noms accessibles distincts.
    expect(screen.getByRole('search', { name: 'Rechercher dans les paiements' })).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Rechercher dans les déclarations' })).toBeInTheDocument();

    const bar = within(screen.getByRole('search', { name: 'Rechercher dans les déclarations' }));
    await userEvent.click(bar.getByRole('button', { name: 'Effacer les critères' }));
    expect(await screen.findByText('MP-ATTENTE', {}, WAIT)).toBeInTheDocument();
    expect(listMyDeclarations).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(url()).not.toContain('dec.status');
  });

  it('garde la section des déclarations quand le filtre ne laisse aucun résultat', async () => {
    listMyDeclarations.mockImplementation(async (params: { status?: string }) => ({
      items: params.status ? [] : [declaration('d1', 'PENDING', 'MP-ATTENTE')],
      pagination: { page: 1, limit: 20, total: params.status ? 0 : 1, totalPages: 1 }
    }));
    mount('/copropriete/paiements?dec.status=REJECTED');

    expect(await screen.findByText('Mes déclarations', {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, WAIT)).toBeInTheDocument();
  });

  it('garde la barre quand les paiements échouent, et « Effacer » relance sans le lot', async () => {
    listMyPayments.mockImplementation(async (params: { lotId?: string }) => {
      if (params.lotId) throw new Error('lot refusé');
      return payments;
    });
    mount('/copropriete/paiements?pa.lot=lot-1');

    expect(await screen.findByText('Impossible de charger vos paiements.', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Rechercher dans les paiements' })).toBeInTheDocument();

    await clearCriteria();
    expect(await screen.findByText('REF-BETA', {}, WAIT)).toBeInTheDocument();
    expect(listMyPayments).toHaveBeenLastCalledWith({ lotId: undefined, year: undefined });
    expect(url()).not.toContain('pa.lot');
  });

  it('garde les déclarations sous critère quand leur appel échoue, et « Effacer » relance sans statut', async () => {
    listMyDeclarations.mockImplementation(async (params: { status?: string }) => {
      if (params.status) throw new Error('statut invalide');
      return {
        items: [declaration('d1', 'PENDING', 'MP-ATTENTE')],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      };
    });
    mount('/copropriete/paiements?dec.status=REJECTED');

    expect(await screen.findByText('Impossible de charger vos déclarations.', {}, WAIT)).toBeInTheDocument();
    const bar = within(screen.getByRole('search', { name: 'Rechercher dans les déclarations' }));
    await userEvent.click(bar.getByRole('button', { name: 'Effacer les critères' }));
    expect(await screen.findByText('MP-ATTENTE', {}, WAIT)).toBeInTheDocument();
    expect(listMyDeclarations).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(url()).not.toContain('dec.status');
  });
});

describe('Quittances : critères envoyés au serveur', () => {
  const receipt: CoOwnerReceipt = {
    id: 'rec-1',
    kind: 'QUITTANCE',
    number: 'QT-001',
    lot: { id: 'lot-1', lotNumber: 'A1' },
    syndicate: { id: 's1', name: 'Résidence Les Acacias' },
    chargeCallId: 'call-1',
    chargePaymentId: 'pay-1',
    periodLabel: '2026-T1',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    amount: 90000,
    currency: 'XOF',
    issuedAt: '2026-01-16T00:00:00.000Z',
    emailedAt: null,
    downloadPath: '/portal/copropriete/quittances/rec-1/fichier'
  };
  const reponse = (items: CoOwnerReceipt[]) => ({
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }
  });

  beforeEach(() => {
    listMyReceipts.mockResolvedValue(reponse([receipt]));
  });

  it('charge la première page sans critère et n’offre aucun champ libre', async () => {
    mount('/copropriete/quittances');

    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    expect(listMyReceipts).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(within(screen.getByRole('search')).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('applique les critères d’une URL partagée aux paramètres envoyés au service', async () => {
    mount('/copropriete/quittances?lotId=lot-1&kind=QUITTANCE&periodFrom=2026-01-01&periodTo=2026-03-31');

    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    expect(listMyReceipts).toHaveBeenCalledWith({
      lotId: 'lot-1',
      kind: 'QUITTANCE',
      from: '2026-01-01',
      to: '2026-03-31',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond, puis relance sans critère', async () => {
    listMyReceipts.mockImplementation(async (params: { kind?: string }) => reponse(params.kind ? [] : [receipt]));
    mount('/copropriete/quittances?kind=RECEIPT');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, WAIT)).toBeInTheDocument();
    await clearCriteria();
    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    expect(listMyReceipts).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(url()).not.toContain('kind=');
  });

  it('garde la barre et ses critères quand l’appel échoue, et « Effacer » relance sans le critère', async () => {
    listMyReceipts.mockImplementation(async (params: { kind?: string }) => {
      if (params.kind) throw new Error('requête invalide');
      return reponse([receipt]);
    });
    mount('/copropriete/quittances?kind=RECEIPT');

    expect(await screen.findByText('Impossible de charger vos quittances.', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();

    await clearCriteria();
    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    expect(listMyReceipts).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(url()).not.toContain('kind=');
    expect(screen.queryByText('Impossible de charger vos quittances.')).not.toBeInTheDocument();
  });
});
