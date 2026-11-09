import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import type { RentalPaymentDeclarationDto } from '../../../types/rental-declared-payment';

/**
 * File des déclarations du locatif sur le contrat spec 049 : pastilles issues de `view`,
 * repli sans `view`, droits, tiroir de détail et capture par la route protégée.
 */

const listPaymentDeclarations = vi.fn();
vi.mock('../../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/rental-service')>();
  return { ...actual, listPaymentDeclarations: (...a: unknown[]) => listPaymentDeclarations(...a) };
});

const getRentalDeclaration = vi.fn();
const getRentalDeclarationProof = vi.fn();
vi.mock('../../../services/rental-declared-payment-service', () => ({
  getRentalDeclaration: (...a: unknown[]) => getRentalDeclaration(...a),
  getRentalDeclarationProof: (...a: unknown[]) => getRentalDeclarationProof(...a),
  getRentalPendingCount: vi.fn().mockResolvedValue({ pending: 0, overdue: 0 })
}));

const saveBlob = vi.fn();
vi.mock('../../../utils/save-blob', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../utils/save-blob')>()),
  saveBlob: (...a: unknown[]) => saveBlob(...a)
}));

vi.mock('../../../components/rental/declared-payment/ApproveModal', () => ({
  ApproveModal: ({ declaration }: { declaration: RentalPaymentDeclarationDto | null }) =>
    declaration ? <div>modale validation {declaration.id}</div> : null
}));
vi.mock('../../../components/rental/declared-payment/RejectModal', () => ({
  RejectModal: ({ declaration }: { declaration: RentalPaymentDeclarationDto | null }) =>
    declaration ? <div>modale rejet {declaration.id}</div> : null
}));
vi.mock('../../../components/rental/declared-payment/DeclareForThirdPartyModal', () => ({
  DeclareForThirdPartyModal: ({ open }: { open: boolean }) => (open ? <div>modale tiers</div> : null)
}));

import { PaymentDeclarationsList } from '../../../components/rental/PaymentDeclarationsList';
import { DeclarationDrawer } from '../../../components/rental/declared-payment/DeclarationDrawer';

const view = (overrides: Partial<RentalPaymentDeclarationDto> = {}): RentalPaymentDeclarationDto => ({
  id: 'decl-1',
  status: 'PENDING',
  leaseId: 'b',
  leaseNumber: 'BAIL-1',
  declaredBy: { type: 'TENANT', clientId: 'c1', name: 'Awa Koné' },
  installment: { id: 'e1', periodYear: 2026, periodMonth: 11, dueDate: '2026-11-05', remainingDue: 150000 },
  receivingNumber: { id: 'n1', operator: 'WAVE', phone: '+2250707070707' },
  operator: 'WAVE',
  payerPhone: '+2250505050505',
  amount: 150000,
  acceptedAmount: null,
  paidAt: '2026-11-04T10:00:00.000Z',
  reference: 'TX-REF-123',
  hasProof: false,
  aiPrefilled: false,
  aiEditedFields: [],
  duplicateSuspected: false,
  overdue: false,
  alerts: [],
  notes: null,
  rejectReason: null,
  reviewNote: null,
  reviewedAt: null,
  reviewedByName: null,
  paymentId: null,
  createdAt: '2026-11-04T10:05:00.000Z',
  ...overrides
});

const ligne = (id: string, withView?: RentalPaymentDeclarationDto) => ({
  id,
  tenant_id: 'a',
  lease_id: 'b',
  declared_by: 'u',
  amount: 150000,
  payment_date: '2026-11-04',
  payment_method: 'MOBILE_MONEY',
  status: 'PENDING',
  created_at: '2026-11-04T10:00:00Z',
  updated_at: '2026-11-04T10:00:00Z',
  lease: { id: 'b', lease_number: `BAIL-${id}` },
  ...(withView ? { view: withView } : {})
});

function mountList(rows: unknown[], props: Partial<React.ComponentProps<typeof PaymentDeclarationsList>> = {}) {
  listPaymentDeclarations.mockResolvedValue({
    success: true,
    data: rows,
    pagination: { page: 1, limit: 100, total: rows.length, totalPages: 1 }
  });
  return render(
    <MemoryRouter>
      <AntApp>
        <PaymentDeclarationsList tenantId="agence-1" {...props} />
      </AntApp>
    </MemoryRouter>
  );
}

const T = { timeout: 15000 };

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:capture');
  URL.revokeObjectURL = vi.fn();
});

describe('PaymentDeclarationsList — contrat 049', () => {
  it('affiche les pastilles issues de view', async () => {
    mountList([ligne('1', view({ duplicateSuspected: true, aiEditedFields: ['amount'], overdue: true }))]);
    expect(await screen.findByText('Doublon probable', {}, T)).toBeInTheDocument();
    expect(screen.getByText('Modifié après lecture IA')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByText('Wave')).toBeInTheDocument();
  });

  it('retombe sur les champs legacy sans view', async () => {
    mountList([ligne('2')]);
    expect(await screen.findByText('BAIL-2', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Doublon probable')).toBeNull();
    expect(screen.queryByText('Modifié après lecture IA')).toBeNull();
    expect(screen.queryByText('En retard')).toBeNull();
  });

  it('masque Approuver, Rejeter et Déclarer pour un tiers sans droits', async () => {
    mountList([ligne('3', view())], { canReview: false, canCreate: false });
    await screen.findByText('BAIL-3', {}, T);
    expect(screen.queryByRole('button', { name: /Approuver/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rejeter/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Déclarer pour un tiers/ })).toBeNull();
  });

  it('ouvre la modale de validation avec la view de la ligne', async () => {
    mountList([ligne('4', view({ id: 'decl-4' }))], { canReview: true });
    await userEvent.click(await screen.findByRole('button', { name: /Approuver/ }, T));
    expect(await screen.findByText('modale validation decl-4', {}, T)).toBeInTheDocument();
  });

  it('lit la déclaration quand la ligne n’a pas de view', async () => {
    getRentalDeclaration.mockResolvedValue(view({ id: 'decl-5' }));
    mountList([ligne('5')], { canReview: true });
    await userEvent.click(await screen.findByRole('button', { name: /Rejeter/ }, T));
    expect(await screen.findByText('modale rejet decl-5', {}, T)).toBeInTheDocument();
    expect(getRentalDeclaration).toHaveBeenCalledWith('agence-1', '5');
  });

  it('ouvre la modale « Déclarer pour un tiers » avec le droit de création', async () => {
    mountList([ligne('6', view())], { canCreate: true });
    await userEvent.click(await screen.findByRole('button', { name: /Déclarer pour un tiers/ }, T));
    expect(await screen.findByText('modale tiers')).toBeInTheDocument();
  });
});

describe('DeclarationDrawer', () => {
  const renderDrawer = (props: Partial<React.ComponentProps<typeof DeclarationDrawer>> = {}) =>
    render(
      <AntApp>
        <DeclarationDrawer
          tenantId="agence-1"
          declarationId="decl-1"
          canReview
          onClose={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          {...props}
        />
      </AntApp>
    );

  it('affiche le détail et les boutons Valider/Rejeter d’une déclaration en attente', async () => {
    getRentalDeclaration.mockResolvedValue(view({ alerts: [{ kind: 'OVERDUE', businessDays: 4 }] }));
    const onApprove = vi.fn();
    renderDrawer({ onApprove });
    expect(await screen.findByText('Awa Koné', {}, T)).toBeInTheDocument();
    expect(screen.getByText('TX-REF-123')).toBeInTheDocument();
    expect(screen.getByText(/En attente depuis 4 jours ouvrés/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Valider/ }));
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: 'decl-1' }));
    expect(screen.getByRole('button', { name: /Rejeter/ })).toBeInTheDocument();
  });

  it('masque Valider/Rejeter sans droit ou une fois traitée', async () => {
    getRentalDeclaration.mockResolvedValue(view());
    const { unmount } = renderDrawer({ canReview: false });
    await screen.findByText('Awa Koné', {}, T);
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
    unmount();

    getRentalDeclaration.mockResolvedValue(
      view({
        status: 'REJECTED',
        rejectReason: 'AMOUNT_MISMATCH',
        reviewNote: 'Montant faux',
        reviewedByName: 'Gestionnaire'
      })
    );
    renderDrawer({ canReview: true });
    expect(await screen.findByText('Montant ne correspondant pas', {}, T)).toBeInTheDocument();
    expect(screen.getByText('Montant faux')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rejeter/ })).toBeNull();
  });

  it('charge la capture par la route protégée et libère l’URL blob au démontage', async () => {
    getRentalDeclaration.mockResolvedValue(view({ hasProof: true }));
    getRentalDeclarationProof.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    const { unmount } = renderDrawer();
    await userEvent.click(await screen.findByRole('button', { name: /Voir la capture/ }, T));
    await waitFor(() => expect(getRentalDeclarationProof).toHaveBeenCalledWith('agence-1', 'decl-1'));
    const image = await screen.findByAltText('Capture du paiement déclaré');
    expect(image).toHaveAttribute('src', 'blob:capture');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:capture');
  });

  it('télécharge une capture qui n’est pas une image', async () => {
    getRentalDeclaration.mockResolvedValue(view({ hasProof: true }));
    getRentalDeclarationProof.mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }));
    renderDrawer();
    await userEvent.click(await screen.findByRole('button', { name: /Voir la capture/ }, T));
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(screen.queryByAltText('Capture du paiement déclaré')).toBeNull();
  });
});
