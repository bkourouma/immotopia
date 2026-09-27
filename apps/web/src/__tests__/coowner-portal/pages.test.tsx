import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CoOwnerLots from '../../pages/CoOwnerPortal/Lots';
import CoOwnerLotAccount from '../../pages/CoOwnerPortal/LotAccount';
import CoOwnerChargeCalls from '../../pages/CoOwnerPortal/ChargeCalls';
import CoOwnerDocuments from '../../pages/CoOwnerPortal/Documents';
import CoOwnerMeetings from '../../pages/CoOwnerPortal/Meetings';
import type {
  CoOwnerChargeCall,
  CoOwnerDocument,
  CoOwnerLot,
  CoOwnerLotAccount as LotAccountData,
  CoOwnerMeeting
} from '../../services/coowner-portal-service';

/**
 * Portail copropriétaire — les cinq écrans, avec le service mocké.
 *
 * Vitest refuse tout import qu'un `vi.mock` ne déclare pas (AGENTS.md) : le
 * mock reprend donc le module réel (`importActual`) et ne remplace que les
 * six fonctions réseau qu'utilisent ces écrans.
 */

const listMyLots = vi.fn();
const getMyLotAccount = vi.fn();
const listMyChargeCalls = vi.fn();
const listMyDocuments = vi.fn();
const listMyMeetings = vi.fn();
const downloadCoOwnerDocument = vi.fn();

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
    downloadCoOwnerDocument: (...a: unknown[]) => downloadCoOwnerDocument(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function mount(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/copropriete" element={<CoOwnerLots />} />
          <Route path="/copropriete/lots/:lotId" element={<CoOwnerLotAccount />} />
          <Route path="/copropriete/appels" element={<CoOwnerChargeCalls />} />
          <Route path="/copropriete/documents" element={<CoOwnerDocuments />} />
          <Route path="/copropriete/assemblees" element={<CoOwnerMeetings />} />
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Mes lots', () => {
  it('affiche le solde en valeur absolue avec « Débiteur » ou « Créditeur », jamais un nombre signé', async () => {
    listMyLots.mockResolvedValue([
      lot(),
      lot({ id: 'lot-2', lotNumber: 'A2', balance: { amount: 20000, direction: 'CREDITEUR', currency: 'XOF' } }),
      lot({ id: 'lot-3', lotNumber: 'P1', balance: null })
    ]);

    mount('/copropriete');

    expect(await screen.findByText('Mes lots', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Résidence Les Acacias')).toBeInTheDocument();
    expect(screen.getByText('Lot A1')).toBeInTheDocument();
    expect(screen.getByText('Débiteur')).toBeInTheDocument();
    expect(screen.getByText('Créditeur')).toBeInTheDocument();
    expect(screen.getByText(/70\s000/)).toBeInTheDocument();
    expect(screen.getByText(/20\s000/)).toBeInTheDocument();
    expect(screen.queryByText(/-\s?20\s000/)).not.toBeInTheDocument();
    expect(screen.getByText('Aucun compte ouvert')).toBeInTheDocument();
  });

  it("montre le refus du serveur quand l'accès n'est pas ouvert", async () => {
    listMyLots.mockRejectedValue({
      response: { status: 403, data: { message: "Aucun lot de copropriété n'est ouvert à votre compte." } }
    });

    mount('/copropriete');

    expect(
      await screen.findByText("Aucun lot de copropriété n'est ouvert à votre compte.", {}, WAIT)
    ).toBeInTheDocument();
  });
});

describe('Compte d’un lot', () => {
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
    transactions: [
      {
        id: 'tx-2',
        transactionDate: '2026-01-20T00:00:00.000Z',
        type: 'PAYMENT',
        label: 'Virement janvier',
        reference: null,
        debit: null,
        credit: 30000,
        balanceAfter: 70000,
        balanceAfterDirection: 'DEBITEUR'
      }
    ]
  };

  it('affiche le solde, les mouvements et les appels du lot', async () => {
    getMyLotAccount.mockResolvedValue(account);
    listMyChargeCalls.mockResolvedValue([call()]);

    mount('/copropriete/lots/lot-1');

    expect(await screen.findByText('Lot A1', {}, WAIT)).toBeInTheDocument();
    expect(getMyLotAccount).toHaveBeenCalledWith('lot-1');
    expect(screen.getByText('Vous devez ce montant à la copropriété')).toBeInTheDocument();
    expect(screen.getByText('Virement janvier')).toBeInTheDocument();
    expect(await screen.findByText('En retard', {}, WAIT)).toBeInTheDocument();
    expect(listMyChargeCalls).toHaveBeenCalledWith('lot-1');
  });

  it("un lot qui n'est pas au copropriétaire (404) est dit introuvable, sans autre détail", async () => {
    getMyLotAccount.mockRejectedValue({ response: { status: 404, data: { message: 'Lot introuvable.' } } });

    mount('/copropriete/lots/lot-de-b');

    expect(await screen.findByText('Ce lot est introuvable dans votre espace.', {}, WAIT)).toBeInTheDocument();
    expect(listMyChargeCalls).not.toHaveBeenCalled();
  });
});

describe('Mes appels de charges', () => {
  it('montre montant, payé, reste, échéance et « En retard », sans aucun bouton de paiement', async () => {
    listMyChargeCalls.mockResolvedValue([
      call(),
      call({ id: 'call-2', period: '2026-T2', status: 'PAID', paid: 100000, outstanding: 0 })
    ]);

    mount('/copropriete/appels');

    expect(await screen.findByText('Mes appels de charges', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByText('Payé', { selector: '.ant-tag' })).toBeInTheDocument();
    expect(screen.getAllByText('10/01/2026').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /payer/i })).not.toBeInTheDocument();
  });
});

describe('Documents de copropriété', () => {
  const documents: CoOwnerDocument[] = [
    {
      id: 'doc-1',
      title: 'Règlement',
      type: 'REGULATION',
      createdAt: '2026-01-10T00:00:00.000Z',
      syndicate: 'Résidence Les Acacias',
      downloadable: true,
      externalUrl: null
    },
    {
      id: 'doc-2',
      title: 'PV AG 2025',
      type: 'GENERAL_MEETING_MINUTES',
      createdAt: '2026-01-10T00:00:00.000Z',
      syndicate: 'Résidence Les Acacias',
      downloadable: false,
      externalUrl: 'https://docs.example.com/pv.pdf'
    }
  ];

  it('télécharge un fichier déposé et ouvre un lien externe', async () => {
    listMyDocuments.mockResolvedValue(documents);
    downloadCoOwnerDocument.mockResolvedValue({ blob: new Blob(['x']), filename: 'Reglement.pdf' });
    const createObjectURL = vi.fn(() => 'blob:fichier');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    mount('/copropriete/documents');

    expect(await screen.findByText('Règlement', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Règlement de copropriété')).toBeInTheDocument();
    expect(screen.getByText("Procès-verbal d'assemblée générale")).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Ouvrir/ });
    expect(link).toHaveAttribute('href', 'https://docs.example.com/pv.pdf');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    expect(downloadCoOwnerDocument).toHaveBeenCalledWith('doc-1', 'Règlement');
    expect(createObjectURL).toHaveBeenCalled();
  });
});

describe('Assemblées générales', () => {
  const meetings: CoOwnerMeeting[] = [
    {
      id: 'm-planned',
      type: 'ORDINARY',
      scheduledAt: '2099-01-10T10:00:00.000Z',
      location: 'Salle B',
      status: 'PLANNED',
      syndicate: 'Résidence Les Acacias',
      agenda: [{ id: 'ag-1', orderIndex: 1, title: 'Budget 2027' }],
      resolutions: []
    },
    {
      id: 'm-done',
      type: 'EXTRAORDINARY',
      scheduledAt: '2026-01-10T10:00:00.000Z',
      location: 'Salle A',
      status: 'COMPLETED',
      syndicate: 'Résidence Les Acacias',
      agenda: [{ id: 'ag-2', orderIndex: 1, title: 'Ravalement' }],
      resolutions: [
        {
          id: 'r-1',
          title: 'Ravalement de façade',
          description: null,
          rule: 'ARTICLE_24',
          result: 'REJECTED',
          sharesFor: 400,
          sharesAgainst: 600,
          sharesAbstain: 0,
          totalShares: 1000,
          myVotes: [{ lotNumber: 'A1', vote: 'FOR' }]
        }
      ]
    }
  ];

  it("affiche date, lieu et ordre du jour ; les résultats seulement pour l'assemblée clôturée", async () => {
    listMyMeetings.mockResolvedValue(meetings);

    mount('/copropriete/assemblees');

    expect(await screen.findByText('Budget 2027', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Salle B')).toBeInTheDocument();
    expect(screen.getByText('Planifiée')).toBeInTheDocument();
    expect(screen.getByText('Clôturée')).toBeInTheDocument();
    expect(screen.getAllByText('Résultats des résolutions')).toHaveLength(1);

    const resolution = screen.getByText('Ravalement de façade').closest('li') as HTMLElement;
    expect(within(resolution).getByText('Rejetée')).toBeInTheDocument();
    expect(within(resolution).getByText('Article 24 — majorité simple des tantièmes exprimés')).toBeInTheDocument();
    expect(within(resolution).getByText('Pour 400 · Contre 600 · Abstention 0 — sur 1000')).toBeInTheDocument();
    expect(within(resolution).getByText('Lot A1 : Pour')).toBeInTheDocument();
  });
});
