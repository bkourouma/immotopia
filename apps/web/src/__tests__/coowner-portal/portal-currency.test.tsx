import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CoOwnerPayments from '../../pages/CoOwnerPortal/Payments';
import CoOwnerReceipts from '../../pages/CoOwnerPortal/Receipts';
import CoOwnerMonthlyTracking from '../../pages/CoOwnerPortal/MonthlyTracking';
import type {
  CoOwnerLot,
  CoOwnerLotMonthlyTracking,
  CoOwnerPaymentsResult,
  CoOwnerReceiptsResult
} from '../../services/coowner-portal-service';

/**
 * Devise affichée sur le portail copropriétaire : le franc CFA se lit « FCFA »,
 * jamais son code ISO « XOF » (BUG-2026-09-30-088). Même montage que
 * `finance-pages.test.tsx` : le service réel, sauf les fonctions réseau.
 */

const listMyLots = vi.fn();
const listMyPayments = vi.fn();
const listMyDeclarations = vi.fn();
const listMyReceipts = vi.fn();
const getCoOwnerLotMonthlyTracking = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyLots: (...a: unknown[]) => listMyLots(...a),
    listMyPayments: (...a: unknown[]) => listMyPayments(...a),
    listMyDeclarations: (...a: unknown[]) => listMyDeclarations(...a),
    listMyReceipts: (...a: unknown[]) => listMyReceipts(...a),
    getCoOwnerLotMonthlyTracking: (...a: unknown[]) => getCoOwnerLotMonthlyTracking(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function mount(path: string, element: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const WAIT = { timeout: 8000 };

/** Le HTML rendu (attributs `aria-label` compris) montre « FCFA » et jamais « XOF ». */
function expectFcfaNotXof() {
  const html = document.body.innerHTML;
  expect(html).toContain('FCFA');
  expect(html).not.toContain('XOF');
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

beforeEach(() => {
  vi.clearAllMocks();
  listMyDeclarations.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 1 }
  });
});

describe('Devise du portail copropriétaire', () => {
  it('Mes paiements : montants, avance et détail en FCFA, jamais XOF', async () => {
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
          documents: []
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
    listMyLots.mockResolvedValue([lot()]);
    listMyPayments.mockResolvedValue(payments);

    mount('/copropriete/paiements', <CoOwnerPayments />);

    expect(await screen.findByText('Virement', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/Avance disponible/)).toBeInTheDocument();
    expectFcfaNotXof();

    // Le détail affiche l'avance restante après affectation, en devise lisible.
    await userEvent.click(screen.getByRole('button', { name: /Détail/ }));
    expect(await screen.findByText(/Avance restante après affectation/, {}, WAIT)).toBeInTheDocument();
    expectFcfaNotXof();
  });

  it('Mes quittances : montants en FCFA, jamais XOF', async () => {
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
    listMyLots.mockResolvedValue([lot()]);
    listMyReceipts.mockResolvedValue(receipts);

    mount('/copropriete/quittances', <CoOwnerReceipts />);

    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    expect((await screen.findAllByText(/FCFA/, {}, WAIT)).length).toBeGreaterThan(0);
    expectFcfaNotXof();
  });

  it('Suivi mensuel : totaux, avance et infobulles en FCFA, jamais XOF', async () => {
    const tracking: CoOwnerLotMonthlyTracking = {
      year: 2026,
      currency: 'XOF',
      lot: { id: 'lot-1', lotNumber: 'A1' },
      syndicate: { id: 's1', name: 'Résidence Les Acacias' },
      ownedSince: '2025-06-01',
      visibleSince: null,
      advance: 5000,
      totals: { due: 300000, paid: 100000, outstanding: 200000 },
      months: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        due: 25000,
        paid: index === 0 ? 25000 : 0,
        status: index === 0 ? 'PAID' : index < 3 ? 'OVERDUE' : 'NONE'
      }))
    };
    listMyLots.mockResolvedValue([lot()]);
    getCoOwnerLotMonthlyTracking.mockResolvedValue(tracking);

    mount('/copropriete/suivi-mensuel', <CoOwnerMonthlyTracking />);

    expect((await screen.findAllByText('Réglé', {}, WAIT)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/FCFA/, {}, WAIT)).length).toBeGreaterThan(0);
    // Les cases de mois portent le montant dans leur `aria-label` : il doit aussi être en FCFA.
    expect(screen.getAllByLabelText(/FCFA/).length).toBeGreaterThan(0);
    expectFcfaNotXof();
  });
});
