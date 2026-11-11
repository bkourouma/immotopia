import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { RentalReviewDecisionModal } from '../../../components/rental/online-payment/ReviewDecisionModal';
import type { RentalOnlinePaymentRowDto } from '../../../types/rental-online-payment';

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const resolveRentalOnlinePayment = vi.fn();

vi.mock('../../../services/rental-online-payment-service', () => ({
  resolveRentalOnlinePayment: (...a: unknown[]) => resolveRentalOnlinePayment(...a)
}));

function review(
  kind: RentalOnlinePaymentRowDto['reviewKind'],
  over: Partial<RentalOnlinePaymentRowDto> = {}
): RentalOnlinePaymentRowDto {
  return {
    id: 'co-1',
    codePaiement: 'IMT-ABCDEFGHIJ0123456789',
    status: 'REVIEW',
    origin: 'PORTAL',
    mode: 'LIVE',
    amount: 150000,
    receivedAmount: 100000,
    currency: 'XOF',
    leaseId: 'l1',
    leaseReference: 'BAIL-1',
    propertyLabel: 'Villa Cocody',
    renter: { clientId: 'c1', name: 'Awa Koné' },
    installments: [{ id: 'i1', periodYear: 2026, periodMonth: 3, dueDate: '2026-03-05', amountDue: 150000 }],
    providerServiceName: 'Wave',
    providerTransactionId: 'TX-1',
    providerFees: null,
    failureMessage: null,
    reviewKind: kind,
    reviewReason: 'Motif serveur',
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

function setup(checkout: RentalOnlinePaymentRowDto) {
  const onClose = vi.fn();
  const onDecided = vi.fn();
  render(
    <AntApp>
      <RentalReviewDecisionModal tenantId="t1" checkout={checkout} onClose={onClose} onDecided={onDecided} />
    </AntApp>
  );
  return { onClose, onDecided };
}

const okButton = () => screen.getByRole('button', { name: /Enregistrer la décision/ });

describe('RentalReviewDecisionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRentalOnlinePayment.mockResolvedValue({ checkout: review('AMOUNT_MISMATCH'), payment: null });
  });

  it('explique un écart de montant', () => {
    setup(review('AMOUNT_MISMATCH'));
    expect(screen.getByText(/Le locataire a payé .* au lieu de/)).toBeInTheDocument();
  });

  it('REJECT sans note reste bloqué', () => {
    setup(review('AMOUNT_MISMATCH'));
    fireEvent.click(screen.getByLabelText(/Refuser/));
    expect(okButton()).toBeDisabled();
    expect(resolveRentalOnlinePayment).not.toHaveBeenCalled();
  });

  it('REJECT avec note appelle resolve sans paidAt', async () => {
    const { onDecided } = setup(review('AMOUNT_MISMATCH'));
    fireEvent.click(screen.getByLabelText(/Refuser/));
    expect(screen.getByText(/aucun remboursement n’est fait ici/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Paiement contesté' } });
    fireEvent.click(okButton());
    await waitFor(() => expect(resolveRentalOnlinePayment).toHaveBeenCalledTimes(1));
    const body = resolveRentalOnlinePayment.mock.calls[0][2];
    expect(body).toEqual({ decision: 'REJECT', note: 'Paiement contesté' });
    expect(body).not.toHaveProperty('paidAt');
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
  });

  it('ACCEPT envoie paidAt (aujourd’hui par défaut)', async () => {
    setup(review('AMOUNT_MISMATCH'));
    fireEvent.click(screen.getByLabelText(/Accepter/));
    fireEvent.click(okButton());
    await waitFor(() => expect(resolveRentalOnlinePayment).toHaveBeenCalledTimes(1));
    const body = resolveRentalOnlinePayment.mock.calls[0][2];
    expect(body.decision).toBe('ACCEPT');
    expect(body.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty('note');
  });

  it('DUPLICATE_TRANSACTION désactive Accepter', () => {
    setup(review('DUPLICATE_TRANSACTION'));
    expect(screen.getByLabelText(/Accepter/)).toBeDisabled();
    expect(screen.getByLabelText(/Refuser/)).not.toBeDisabled();
  });

  it('CONTRARY_STATE déjà encaissé désactive Refuser', () => {
    setup(review('CONTRARY_STATE', { collected: true }));
    expect(screen.getByLabelText(/Refuser/)).toBeDisabled();
    expect(screen.getByLabelText(/Accepter/)).not.toBeDisabled();
    expect(screen.getByText(/déjà encaissé dans ImmoTopia/)).toBeInTheDocument();
  });

  it('affiche le message d’erreur du serveur', async () => {
    resolveRentalOnlinePayment.mockRejectedValue({
      response: { data: { code: 'RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW', message: 'Déjà tranché' } }
    });
    setup(review('AMOUNT_MISMATCH'));
    fireEvent.click(screen.getByLabelText(/Accepter/));
    fireEvent.click(okButton());
    expect(await screen.findByText('Déjà tranché')).toBeInTheDocument();
  });
});
