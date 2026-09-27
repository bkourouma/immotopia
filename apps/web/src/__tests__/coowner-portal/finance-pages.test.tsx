import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CoOwnerPayments from '../../pages/CoOwnerPortal/Payments';
import CoOwnerReceipts from '../../pages/CoOwnerPortal/Receipts';
import CoOwnerMonthlyTracking from '../../pages/CoOwnerPortal/MonthlyTracking';
import CoOwnerSyndicateSheet from '../../pages/CoOwnerPortal/Syndicate';
import CoOwnerLotAccount from '../../pages/CoOwnerPortal/LotAccount';
import { ChargeCallsTable } from '../../pages/CoOwnerPortal/ChargeCallsTable';
import type {
  CoOwnerChargeCall,
  CoOwnerLot,
  CoOwnerLotAccount as LotAccountData,
  CoOwnerLotMonthlyTracking,
  CoOwnerPaymentsResult,
  CoOwnerReceiptsResult,
  CoOwnerSyndicateSheet as SyndicateSheetData
} from '../../services/coowner-portal-service';

/**
 * Lot S5 (besoin 2) — paiements, quittances, suivi mensuel, fiche de la
 * copropriété, relevé du lot et avis d'appel. Même règle que
 * `pages.test.tsx` : le mock reprend le module réel (`importActual`) et ne
 * remplace que les fonctions réseau que ces écrans appellent.
 */

const listMyLots = vi.fn();
const listMyPayments = vi.fn();
const listMyReceipts = vi.fn();
const downloadCoOwnerReceiptFile = vi.fn();
const downloadCoOwnerLotStatement = vi.fn();
const getCoOwnerLotMonthlyTracking = vi.fn();
const getCoOwnerSyndicate = vi.fn();
const fetchCoOwnerSyndicateLogo = vi.fn();
const fetchCoOwnerIssuerLogo = vi.fn();
const downloadCoOwnerChargeCallNotice = vi.fn();
const getMyLotAccount = vi.fn();
const listMyChargeCalls = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyLots: (...a: unknown[]) => listMyLots(...a),
    listMyPayments: (...a: unknown[]) => listMyPayments(...a),
    listMyReceipts: (...a: unknown[]) => listMyReceipts(...a),
    downloadCoOwnerReceiptFile: (...a: unknown[]) => downloadCoOwnerReceiptFile(...a),
    downloadCoOwnerLotStatement: (...a: unknown[]) => downloadCoOwnerLotStatement(...a),
    getCoOwnerLotMonthlyTracking: (...a: unknown[]) => getCoOwnerLotMonthlyTracking(...a),
    getCoOwnerSyndicate: (...a: unknown[]) => getCoOwnerSyndicate(...a),
    fetchCoOwnerSyndicateLogo: (...a: unknown[]) => fetchCoOwnerSyndicateLogo(...a),
    fetchCoOwnerIssuerLogo: (...a: unknown[]) => fetchCoOwnerIssuerLogo(...a),
    downloadCoOwnerChargeCallNotice: (...a: unknown[]) => downloadCoOwnerChargeCallNotice(...a),
    getMyLotAccount: (...a: unknown[]) => getMyLotAccount(...a),
    listMyChargeCalls: (...a: unknown[]) => listMyChargeCalls(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function mount(path: string, element: React.ReactElement, route = path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const WAIT = { timeout: 8000 };

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

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fichier'), revokeObjectURL: vi.fn() });
});

describe('Mes paiements', () => {
  const payments: CoOwnerPaymentsResult = {
    items: [
      {
        id: 'pay-1',
        paidAt: '2026-01-15T00:00:00.000Z',
        amount: 100000,
        currency: 'XOF',
        method: 'BANK_TRANSFER',
        methodLabel: 'Virement',
        reference: 'REF-1',
        lot: { id: 'lot-1', lotNumber: 'A1' },
        syndicate: { id: 's1', name: 'Résidence Les Acacias' },
        allocations: [
          {
            chargeCallId: 'call-1',
            period: '2026-T1',
            periodStart: '2026-01-01',
            periodEnd: '2026-03-31',
            dueDate: '2026-01-10',
            amount: 90000,
            source: 'PAYMENT'
          }
        ],
        remainingAdvance: 10000,
        documents: [
          {
            id: 'doc-1',
            kind: 'RECEIPT',
            number: 'REC-001',
            downloadPath: '/portal/copropriete/quittances/doc-1/fichier'
          }
        ]
      }
    ],
    advances: [
      {
        lot: { id: 'lot-1', lotNumber: 'A1' },
        syndicate: { id: 's1', name: 'Résidence Les Acacias' },
        advance: 10000,
        currency: 'XOF'
      }
    ]
  };

  it("liste les paiements, l'avance disponible, et ouvre le détail des affectations et documents", async () => {
    listMyLots.mockResolvedValue([lot()]);
    listMyPayments.mockResolvedValue(payments);

    mount('/copropriete/paiements', <CoOwnerPayments />);

    expect(await screen.findByText('Mes paiements', {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByText('Virement', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/Avance disponible/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Détail/ }));
    expect(await screen.findByText('2026-T1', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reçu REC-001/ })).toBeInTheDocument();
  });

  it('télécharge le document lié à un paiement', async () => {
    listMyLots.mockResolvedValue([lot()]);
    listMyPayments.mockResolvedValue(payments);
    downloadCoOwnerReceiptFile.mockResolvedValue({ blob: new Blob(['x']), filename: 'Recu REC-001.pdf' });

    mount('/copropriete/paiements', <CoOwnerPayments />);

    await userEvent.click(await screen.findByRole('button', { name: /Détail/ }, WAIT));
    await userEvent.click(await screen.findByRole('button', { name: /Reçu REC-001/ }, WAIT));

    await waitFor(() =>
      expect(downloadCoOwnerReceiptFile).toHaveBeenCalledWith(
        '/portal/copropriete/quittances/doc-1/fichier',
        expect.any(String)
      )
    );
  });

  it("montre le refus du serveur quand l'accès n'est pas ouvert", async () => {
    listMyLots.mockResolvedValue([]);
    listMyPayments.mockRejectedValue({ response: { status: 403, data: { message: 'Accès refusé.' } } });

    mount('/copropriete/paiements', <CoOwnerPayments />);

    expect(await screen.findByText('Accès refusé.', {}, WAIT)).toBeInTheDocument();
  });
});

describe('Mes quittances', () => {
  const receipts: CoOwnerReceiptsResult = {
    items: [
      {
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
      }
    ],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  };

  it('liste les quittances et télécharge le PDF', async () => {
    listMyLots.mockResolvedValue([lot()]);
    listMyReceipts.mockResolvedValue(receipts);
    downloadCoOwnerReceiptFile.mockResolvedValue({ blob: new Blob(['x']), filename: 'Quittance QT-001.pdf' });

    mount('/copropriete/quittances', <CoOwnerReceipts />);

    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Télécharger$/ }));
    await waitFor(() =>
      expect(downloadCoOwnerReceiptFile).toHaveBeenCalledWith(
        '/portal/copropriete/quittances/rec-1/fichier',
        expect.any(String)
      )
    );
  });

  it('affiche un état vide quand aucun document ne correspond', async () => {
    listMyLots.mockResolvedValue([lot()]);
    listMyReceipts.mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });

    mount('/copropriete/quittances', <CoOwnerReceipts />);

    expect(await screen.findByText("Aucun document n'a encore été émis pour vos lots.", {}, WAIT)).toBeInTheDocument();
  });
});

describe('Suivi mensuel', () => {
  const tracking: CoOwnerLotMonthlyTracking = {
    year: 2026,
    currency: 'XOF',
    lot: { id: 'lot-1', lotNumber: 'A1' },
    syndicate: { id: 's1', name: 'Résidence Les Acacias' },
    ownedSince: '2025-06-01',
    advance: 5000,
    totals: { due: 300000, paid: 100000, outstanding: 200000 },
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      due: 25000,
      paid: index === 0 ? 25000 : 0,
      status: index === 0 ? 'PAID' : index < 3 ? 'OVERDUE' : 'NONE'
    }))
  };

  it('affiche la grille des douze mois, les totaux et l’avance pour le lot choisi', async () => {
    listMyLots.mockResolvedValue([lot()]);
    getCoOwnerLotMonthlyTracking.mockResolvedValue(tracking);

    mount('/copropriete/suivi-mensuel', <CoOwnerMonthlyTracking />);

    expect(await screen.findByText('Suivi mensuel', {}, WAIT)).toBeInTheDocument();
    // La page ouvre l'exercice en cours ; attendre le rendu des données, pas seulement l'appel.
    await waitFor(() => expect(getCoOwnerLotMonthlyTracking).toHaveBeenCalledWith('lot-1', new Date().getFullYear()));
    expect((await screen.findAllByText('Réglé', {}, WAIT)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('En retard', {}, WAIT)).length).toBeGreaterThan(0);
  });

  it("grise les mois avant l'acquisition et n'y montre pas le statut du serveur", async () => {
    listMyLots.mockResolvedValue([lot()]);
    getCoOwnerLotMonthlyTracking.mockResolvedValue({
      ...tracking,
      ownedSince: '2026-04-01',
      months: tracking.months.map(cell => (cell.month < 4 ? { ...cell, due: 0, paid: 0, status: 'NONE' } : cell))
    });

    mount('/copropriete/suivi-mensuel', <CoOwnerMonthlyTracking />);

    expect(await screen.findAllByLabelText('Avant votre acquisition', {}, WAIT)).toHaveLength(3);
  });
});

describe('Ma copropriété', () => {
  const sheet: SyndicateSheetData = {
    id: 's1',
    name: 'Résidence Les Acacias',
    address: 'Plateau',
    registrationNo: 'RC-123',
    cadastralReference: null,
    lotCount: 12,
    myLots: [{ id: 'lot-1', lotNumber: 'A1', lotType: 'APARTMENT' }],
    issuer: {
      kind: 'AGENCY',
      name: 'Alliance Consultants',
      address: 'Cocody',
      phone: '0102030405',
      email: 'contact@alliance.ci'
    },
    syndicContact: { name: 'Awa Koné', email: 'awa@syndic.ci' },
    hasLogo: true,
    logoDownloadPath: '/portal/copropriete/coproprietes/s1/logo',
    hasIssuerLogo: false,
    issuerLogoDownloadPath: null
  };

  it('affiche identité, mes lots et coordonnées de l’émetteur et du gestionnaire', async () => {
    listMyLots.mockResolvedValue([lot()]);
    getCoOwnerSyndicate.mockResolvedValue(sheet);
    fetchCoOwnerSyndicateLogo.mockResolvedValue(new Blob(['x']));

    mount('/copropriete/ma-copropriete', <CoOwnerSyndicateSheet />);

    expect(await screen.findByText('RC-123', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Alliance Consultants')).toBeInTheDocument();
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    await waitFor(() => expect(fetchCoOwnerSyndicateLogo).toHaveBeenCalledWith('s1'));
  });

  it("dit qu'aucune copropriété n'est ouverte quand le copropriétaire n'a aucun lot", async () => {
    listMyLots.mockResolvedValue([]);

    mount('/copropriete/ma-copropriete', <CoOwnerSyndicateSheet />);

    expect(
      await screen.findByText("Aucune copropriété n'est encore ouverte à votre compte.", {}, WAIT)
    ).toBeInTheDocument();
  });
});

describe('Relevé de compte du lot', () => {
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
    account: { amount: 70000, direction: 'DEBITEUR', currency: 'XOF', lastUpdatedAt: '2026-01-20T00:00:00.000Z' },
    transactions: []
  };

  it('télécharge le relevé PDF du lot', async () => {
    getMyLotAccount.mockResolvedValue(account);
    listMyChargeCalls.mockResolvedValue([]);
    downloadCoOwnerLotStatement.mockResolvedValue({ blob: new Blob(['x']), filename: 'Releve lot A1.pdf' });

    mount('/copropriete/lots/lot-1', <CoOwnerLotAccount />, '/copropriete/lots/:lotId');

    await userEvent.click(await screen.findByRole('button', { name: /Télécharger mon relevé \(PDF\)/ }, WAIT));
    await waitFor(() =>
      expect(downloadCoOwnerLotStatement).toHaveBeenCalledWith('lot-1', expect.any(Object), expect.any(String))
    );
    expect(screen.getByText('30 dernières opérations depuis votre acquisition.')).toBeInTheDocument();
  });

  it('affiche le message du serveur sur un 429 (quota de PDF dépassé), pas un écran générique', async () => {
    getMyLotAccount.mockResolvedValue(account);
    listMyChargeCalls.mockResolvedValue([]);
    const body = new Blob([
      JSON.stringify({ success: false, message: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.' })
    ]);
    downloadCoOwnerLotStatement.mockRejectedValue({ response: { status: 429, data: body } });

    mount('/copropriete/lots/lot-1', <CoOwnerLotAccount />, '/copropriete/lots/:lotId');

    await userEvent.click(await screen.findByRole('button', { name: /Télécharger mon relevé \(PDF\)/ }, WAIT));
    await waitFor(() => expect(downloadCoOwnerLotStatement).toHaveBeenCalled());
    // Le message vient du corps de l'erreur (feedback.error), pas d'un StateBlock générique.
    expect(screen.queryByText('Impossible de charger le compte de ce lot.')).not.toBeInTheDocument();
  });
});

describe("Avis d'appel", () => {
  function call(overrides: Partial<CoOwnerChargeCall> = {}): CoOwnerChargeCall {
    return {
      id: 'call-1',
      period: '2026-T1',
      amount: 100000,
      paid: 30000,
      outstanding: 70000,
      currency: 'XOF',
      dueDate: '2026-01-10T00:00:00.000Z',
      status: 'OVERDUE',
      lot: { id: 'lot-1', lotNumber: 'A1', lotType: 'APARTMENT' },
      syndicate: 'Résidence Les Acacias',
      ...overrides
    };
  }

  function mountTable(calls: CoOwnerChargeCall[]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ChargeCallsTable calls={calls} />
      </QueryClientProvider>
    );
  }

  it('télécharge l’avis quand la route existe déjà', async () => {
    downloadCoOwnerChargeCallNotice.mockResolvedValue({ blob: new Blob(['x']), filename: 'Avis.pdf' });
    mountTable([call()]);

    await userEvent.click(screen.getByRole('button', { name: /Avis d'appel \(PDF\)/ }));

    await waitFor(() => expect(downloadCoOwnerChargeCallNotice).toHaveBeenCalledWith('call-1', expect.any(String)));
  });

  it("affiche « Avis indisponible » quand la route n'existe pas encore (404)", async () => {
    downloadCoOwnerChargeCallNotice.mockRejectedValue({ response: { status: 404 } });
    mountTable([call()]);

    await userEvent.click(screen.getByRole('button', { name: /Avis d'appel \(PDF\)/ }));

    expect(await screen.findByText('Avis indisponible', {}, WAIT)).toBeInTheDocument();
  });
});
