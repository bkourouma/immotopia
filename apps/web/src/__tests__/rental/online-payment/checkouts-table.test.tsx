import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RentalOnlineCheckoutsTable } from '../../../components/rental/online-payment/CheckoutsTable';
import type { RentalOnlinePaymentRowDto } from '../../../types/rental-online-payment';

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const listRentalOnlinePayments = vi.fn();
const verifyRentalOnlinePayment = vi.fn();

vi.mock('../../../services/rental-online-payment-service', () => ({
  listRentalOnlinePayments: (...a: unknown[]) => listRentalOnlinePayments(...a),
  verifyRentalOnlinePayment: (...a: unknown[]) => verifyRentalOnlinePayment(...a)
}));

function row(over: Partial<RentalOnlinePaymentRowDto> = {}): RentalOnlinePaymentRowDto {
  return {
    id: 'co-1',
    codePaiement: 'IMT-ABCDEFGHIJ0123456789',
    status: 'PENDING',
    origin: 'PORTAL',
    mode: 'LIVE',
    amount: 150000,
    receivedAmount: null,
    currency: 'XOF',
    leaseId: 'l1',
    leaseReference: 'BAIL-2026-001',
    propertyLabel: 'Villa Cocody',
    renter: { clientId: 'c1', name: 'Awa Koné' },
    installments: [{ id: 'i1', periodYear: 2026, periodMonth: 3, dueDate: '2026-03-05', amountDue: 150000 }],
    providerServiceName: 'Wave',
    providerTransactionId: null,
    providerFees: null,
    failureMessage: null,
    reviewKind: null,
    reviewReason: null,
    resolution: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByName: null,
    paymentId: 'p1',
    collected: false,
    lastCheckedAt: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    completedAt: null,
    ...over
  };
}

function setup(props: Partial<React.ComponentProps<typeof RentalOnlineCheckoutsTable>> = {}) {
  const onDecide = vi.fn();
  const onChanged = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <AntApp>
        <RentalOnlineCheckoutsTable
          tenantId="t1"
          refreshToken={0}
          onDecide={onDecide}
          onChanged={onChanged}
          canDecide
          {...props}
        />
      </AntApp>
    </QueryClientProvider>
  );
  return { onDecide, onChanged, ...utils };
}

describe('RentalOnlineCheckoutsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRentalOnlinePayments.mockResolvedValue({ items: [row()], total: 1, page: 1, pageSize: 20 });
  });

  it('affiche la ligne : code, bail, locataire, échéance, montant', async () => {
    setup();
    expect(await screen.findByText('IMT-ABCDEFGHIJ0123456789')).toBeInTheDocument();
    expect(screen.getByText('BAIL-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Villa Cocody')).toBeInTheDocument();
    expect(screen.getByText('Awa Koné')).toBeInTheDocument();
    expect(screen.getByText('03/2026')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(listRentalOnlinePayments).toHaveBeenCalledWith('t1', expect.objectContaining({ page: 1, pageSize: 20 }));
  });

  it('affiche le motif et le montant reçu pour un paiement à trancher', async () => {
    listRentalOnlinePayments.mockResolvedValue({
      items: [row({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH', reviewReason: 'Écart', receivedAmount: 100000 })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    setup();
    expect(await screen.findByText('À trancher')).toBeInTheDocument();
    expect(screen.getByText('Montant payé différent du montant attendu')).toBeInTheDocument();
    expect(screen.getByText(/Reçu :/)).toBeInTheDocument();
  });

  it('transmet la recherche au service', async () => {
    setup();
    await screen.findByText('IMT-ABCDEFGHIJ0123456789');
    fireEvent.change(screen.getByLabelText('Rechercher dans les paiements en ligne'), {
      target: { value: 'Koné' }
    });
    await waitFor(() =>
      expect(listRentalOnlinePayments).toHaveBeenLastCalledWith(
        't1',
        expect.objectContaining({ search: 'Koné', page: 1 })
      )
    );
  });

  it('transmet le filtre de statut en liste séparée par des virgules', async () => {
    setup();
    await screen.findByText('IMT-ABCDEFGHIJ0123456789');
    const select = screen.getByRole('combobox', { name: 'Statut' });
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByTitle('À trancher'));
    await waitFor(() =>
      expect(listRentalOnlinePayments).toHaveBeenLastCalledWith('t1', expect.objectContaining({ status: 'REVIEW' }))
    );
  });

  it('pagine côté serveur', async () => {
    listRentalOnlinePayments.mockResolvedValue({ items: [row()], total: 45, page: 1, pageSize: 20 });
    setup();
    await screen.findByText('IMT-ABCDEFGHIJ0123456789');
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() =>
      expect(listRentalOnlinePayments).toHaveBeenLastCalledWith(
        't1',
        expect.objectContaining({ page: 2, pageSize: 20 })
      )
    );
  });

  it('« Vérifier » appelle le service puis onChanged', async () => {
    verifyRentalOnlinePayment.mockResolvedValue({ checkout: row({ status: 'SUCCESS' }), changed: true });
    const { onChanged } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Vérifier/ }));
    await waitFor(() => expect(verifyRentalOnlinePayment).toHaveBeenCalledWith('t1', 'co-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('« Vérifier » apparaît pour EXPIRED (succès tardif) mais pas pour FAILED', async () => {
    listRentalOnlinePayments.mockResolvedValue({
      items: [row({ id: 'co-exp', status: 'EXPIRED' }), row({ id: 'co-fail', status: 'FAILED' })],
      total: 2,
      page: 1,
      pageSize: 20
    });
    setup();
    expect(await screen.findAllByRole('button', { name: /Vérifier/ })).toHaveLength(1);
  });

  it('« Trancher » n’apparaît que pour un REVIEW non tranché et déclenche onDecide', async () => {
    const review = row({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' });
    listRentalOnlinePayments.mockResolvedValue({ items: [review], total: 1, page: 1, pageSize: 20 });
    const { onDecide } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Trancher/ }));
    expect(onDecide).toHaveBeenCalledWith(review);
  });

  it('une ligne tranchée affiche la décision sans bouton Trancher', async () => {
    listRentalOnlinePayments.mockResolvedValue({
      items: [row({ status: 'REVIEW', resolution: 'REJECT', resolutionNote: 'Doublon', resolvedByName: 'Marc' })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    setup();
    expect(await screen.findByText('Doublon')).toBeInTheDocument();
    expect(screen.getByText(/Refusé/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Trancher/ })).not.toBeInTheDocument();
  });

  it('masque Vérifier et Trancher sans droit', async () => {
    listRentalOnlinePayments.mockResolvedValue({
      items: [row({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    setup({ canDecide: false });
    await screen.findByText('IMT-ABCDEFGHIJ0123456789');
    expect(screen.queryByRole('button', { name: /Vérifier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Trancher/ })).not.toBeInTheDocument();
  });
});
