import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeclarationsList } from '../../components/coowner-portal/declared-payment/DeclarationsList';
import type { CoOwnerDeclaration } from '../../services/coowner-portal-service';

/** Spec 047, « Mes déclarations » : statuts, détails et annulation. */

const cancelDeclaration = vi.fn();
const feedbackSuccess = vi.fn();
const feedbackError = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return { ...actual, cancelDeclaration: (...a: unknown[]) => cancelDeclaration(...a) };
});

vi.mock('../../lib/feedback', () => ({
  feedback: {
    success: (...a: unknown[]) => feedbackSuccess(...a),
    error: (...a: unknown[]) => feedbackError(...a),
    warning: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function declaration(overrides: Partial<CoOwnerDeclaration> = {}): CoOwnerDeclaration {
  return {
    id: 'decl-1',
    status: 'PENDING',
    syndicate: { id: 's1', name: 'Résidence Les Palmiers' },
    receivingNumber: { operator: 'ORANGE', phoneNumber: '+2250707070707', holderName: 'Syndic' },
    payerPhone: '+2250101010101',
    amount: 50000,
    acceptedAmount: null,
    paidAt: '2026-10-10T09:30:00.000Z',
    transactionReference: 'MP261010.ABCD',
    lines: [
      { lot: { id: 'l1', lotNumber: 'A1' }, amount: 30000, acceptedAmount: null, chargeCallIds: [] },
      { lot: { id: 'l2', lotNumber: 'B2' }, amount: 20000, acceptedAmount: null, chargeCallIds: [] }
    ],
    documents: [],
    rejectReason: null,
    reviewNote: null,
    canCancel: true,
    createdAt: '2026-10-10T10:00:00.000Z',
    reviewedAt: null,
    ...overrides
  };
}

function mount(items: CoOwnerDeclaration[], onChanged?: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <DeclarationsList items={items} onChanged={onChanged} />
    </QueryClientProvider>
  );
  return { invalidate };
}

describe('DeclarationsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche une déclaration en vérification avec son bouton d'annulation", () => {
    mount([declaration()]);
    expect(screen.getAllByText('En vérification').length).toBeGreaterThan(0);
    expect(screen.getByText('Lot A1, Lot B2')).toBeInTheDocument();
    expect(screen.getByText('MP261010.ABCD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Annuler la déclaration/ })).toBeInTheDocument();
  });

  it('annule après confirmation puis rafraîchit la liste', async () => {
    cancelDeclaration.mockResolvedValue(declaration({ status: 'CANCELED', canCancel: false }));
    const onChanged = vi.fn();
    const { invalidate } = mount([declaration()], onChanged);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Annuler la déclaration/ }));
    await user.click(await screen.findByRole('button', { name: /Oui, l'annuler/ }));
    await waitFor(() => expect(cancelDeclaration).toHaveBeenCalledWith('decl-1'));
    await waitFor(() => expect(feedbackSuccess).toHaveBeenCalledWith('Déclaration annulée.'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coowner-portal', 'declarations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coowner-portal', 'charge-calls'] });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("montre le motif et la note d'une déclaration rejetée, sans annulation", () => {
    mount([
      declaration({
        status: 'REJECTED',
        canCancel: false,
        rejectReason: 'AMOUNT_MISMATCH',
        reviewNote: 'Le montant reçu est de 40 000.\nMerci de redéclarer.'
      })
    ]);
    expect(screen.getByText('Rejetée')).toBeInTheDocument();
    expect(screen.getByText(/Montant ne correspondant pas/)).toBeInTheDocument();
    expect(screen.getByText(/Merci de redéclarer\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annuler la déclaration/ })).not.toBeInTheDocument();
  });

  it("montre les montants déclaré et retenu, la note et les documents d'une validation corrigée", () => {
    mount([
      declaration({
        status: 'APPROVED',
        canCancel: false,
        amount: 50000,
        acceptedAmount: 40000,
        reviewNote: 'Montant corrigé selon le relevé.',
        documents: [{ id: 'd1', kind: 'QUITTANCE', number: 'Q-2026-001' }]
      })
    ]);
    expect(screen.getByText('Validée')).toBeInTheDocument();
    expect(screen.getByText(/Montant retenu/)).toBeInTheDocument();
    expect(screen.getByText(/Montant corrigé selon le relevé\./)).toBeInTheDocument();
    expect(screen.getByText(/Quittance Q-2026-001/)).toBeInTheDocument();
    expect(screen.getByText(/Retrouvez-les dans « Mes quittances »/)).toBeInTheDocument();
  });

  it("n'affiche pas de bouton quand canCancel est faux", () => {
    mount([declaration({ canCancel: false })]);
    expect(screen.queryByRole('button', { name: /Annuler la déclaration/ })).not.toBeInTheDocument();
  });

  it("affiche le message du serveur quand l'annulation échoue, sans exception", async () => {
    cancelDeclaration.mockRejectedValue({
      response: { status: 409, data: { message: 'Déjà traitée.', code: 'DECLARATION_NOT_PENDING' } }
    });
    const { invalidate } = mount([declaration()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Annuler la déclaration/ }));
    await user.click(await screen.findByRole('button', { name: /Oui, l'annuler/ }));
    await waitFor(() => expect(feedbackError).toHaveBeenCalledWith('Déjà traitée.'));
    expect(feedbackSuccess).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coowner-portal', 'declarations'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coowner-portal', 'charge-calls'] });
  });

  it("affiche l'état vide", () => {
    mount([]);
    expect(screen.getByText("Vous n'avez fait aucune déclaration de paiement.")).toBeInTheDocument();
  });
});
