import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CoOwnerPayments from '../../pages/CoOwnerPortal/Payments';
import CoOwnerReceipts from '../../pages/CoOwnerPortal/Receipts';
import type { CoOwnerDeclaration, CoOwnerReceipt } from '../../services/coowner-portal-service';

/**
 * Lot SYN-B : champ libre serveur des deux listes paginées du portail
 * copropriétaire. La saisie part à l'API sous le nom `search` (clé d'URL `q`).
 */

const listMyLots = vi.fn();
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
          <Route path="/copropriete/paiements" element={<CoOwnerPayments />} />
          <Route path="/copropriete/quittances" element={<CoOwnerReceipts />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const url = () => screen.getByTestId('url').textContent ?? '';

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

const declaration: CoOwnerDeclaration = {
  id: 'd1',
  status: 'PENDING',
  syndicate: { id: 's1', name: 'Résidence Les Acacias' },
  receivingNumber: { operator: 'ORANGE', phoneNumber: '+2250707070707', holderName: 'Syndic' },
  payerPhone: '+2250101010101',
  amount: 50000,
  acceptedAmount: null,
  paidAt: '2026-10-10T09:30:00.000Z',
  transactionReference: 'MP-ATTENTE',
  lines: [{ lot: { id: 'lot-1', lotNumber: 'A1' }, amount: 50000, acceptedAmount: null, chargeCallIds: [] }],
  documents: [],
  rejectReason: null,
  reviewNote: null,
  canCancel: false,
  createdAt: '2026-10-10T10:00:00.000Z',
  reviewedAt: null
};

const page = <T,>(items: T[]) => ({ items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } });

beforeEach(() => {
  vi.clearAllMocks();
  listMyLots.mockResolvedValue([]);
  listMyPayments.mockResolvedValue({ items: [], advances: [] });
  getOnlinePaymentAvailability.mockRejectedValue(new Error('indisponible'));
  getDeclaredAvailability.mockRejectedValue(new Error('indisponible'));
  listMyReceipts.mockResolvedValue(page([receipt]));
  listMyDeclarations.mockResolvedValue(page([declaration]));
});

describe('Quittances : champ libre serveur', () => {
  it('envoie la saisie sous le nom `search` et la garde dans l’URL (`q`)', async () => {
    mount('/copropriete/quittances');
    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();

    const box = within(screen.getByRole('search')).getByRole('textbox', { name: 'Rechercher' });
    expect(box).toHaveAttribute('placeholder', 'Numéro, lot, période…');
    await userEvent.type(box, 'QT-0');

    await waitFor(() => expect(listMyReceipts).toHaveBeenLastCalledWith({ search: 'QT-0', page: 1, limit: 20 }), WAIT);
    expect(url()).toContain('q=QT-0');
  });

  it('applique le `q` d’une URL partagée', async () => {
    mount('/copropriete/quittances?q=A1');
    expect(await screen.findByText('QT-001', {}, WAIT)).toBeInTheDocument();
    expect(listMyReceipts).toHaveBeenCalledWith({ search: 'A1', page: 1, limit: 20 });
  });
});

describe('Paiements déclarés : champ libre serveur', () => {
  it('envoie la saisie sous le nom `search` à listMyDeclarations', async () => {
    mount('/copropriete/paiements');
    expect(await screen.findByText('MP-ATTENTE', {}, WAIT)).toBeInTheDocument();

    const bar = screen.getByRole('search', { name: 'Rechercher dans les déclarations' });
    const box = within(bar).getByRole('textbox', { name: 'Rechercher' });
    expect(box).toHaveAttribute('placeholder', 'Référence de transaction, lot…');
    await userEvent.type(box, 'MP-A');

    await waitFor(
      () => expect(listMyDeclarations).toHaveBeenLastCalledWith({ search: 'MP-A', page: 1, limit: 20 }),
      WAIT
    );
    expect(url()).toContain('dec.q=MP-A');
  });

  it('applique le `dec.q` d’une URL partagée', async () => {
    mount('/copropriete/paiements?dec.q=A1');
    expect(await screen.findByText('MP-ATTENTE', {}, WAIT)).toBeInTheDocument();
    expect(listMyDeclarations).toHaveBeenCalledWith({ search: 'A1', page: 1, limit: 20 });
  });
});
