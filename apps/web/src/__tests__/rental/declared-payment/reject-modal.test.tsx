import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { RejectModal } from '../../../components/rental/declared-payment/RejectModal';
import type { RentalPaymentDeclarationDto } from '../../../types/rental-declared-payment';

const rejectRentalDeclaration = vi.fn();

vi.mock('../../../services/rental-declared-payment-service', () => ({
  rejectRentalDeclaration: (...args: unknown[]) => rejectRentalDeclaration(...args)
}));

const declaration = {
  id: 'decl-1',
  status: 'PENDING',
  leaseId: 'lease-1',
  leaseNumber: 'BAIL-001',
  declaredBy: { type: 'TENANT', clientId: 'c1', name: 'Awa Traoré' },
  installment: null,
  receivingNumber: null,
  operator: 'ORANGE',
  payerPhone: null,
  amount: 150000,
  acceptedAmount: null,
  paidAt: '2026-11-06T10:00:00.000Z',
  reference: 'TXN12345',
  alerts: []
} as unknown as RentalPaymentDeclarationDto;

const renderModal = () => {
  const onClose = vi.fn();
  const onRejected = vi.fn();
  const onStale = vi.fn();
  render(
    <AntApp>
      <RejectModal
        tenantId="t1"
        declaration={declaration}
        onClose={onClose}
        onRejected={onRejected}
        onStale={onStale}
      />
    </AntApp>
  );
  return { onClose, onRejected, onStale };
};

const okButton = () => screen.getByRole('button', { name: 'Rejeter la déclaration' });

const chooseReason = async (label: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }));
};

describe('RejectModal (locatif)', () => {
  beforeEach(() => {
    rejectRentalDeclaration.mockReset();
  });

  it('le motif est obligatoire', () => {
    renderModal();
    expect(okButton()).toBeDisabled();
  });

  it('motif hors « Autre » : note facultative, corps { rejectReason, note: null }', async () => {
    rejectRentalDeclaration.mockResolvedValue({ ...declaration, status: 'REJECTED' });
    const { onRejected } = renderModal();
    await chooseReason('Paiement introuvable');
    await waitFor(() => expect(okButton()).toBeEnabled());
    fireEvent.click(okButton());
    await waitFor(() => expect(rejectRentalDeclaration).toHaveBeenCalledTimes(1));
    expect(rejectRentalDeclaration).toHaveBeenCalledWith('t1', 'decl-1', { rejectReason: 'NOT_FOUND', note: null });
    await waitFor(() => expect(onRejected).toHaveBeenCalled());
  });

  it('motif hors « Autre » : une note fournie doit compter 10 à 500 caractères', async () => {
    renderModal();
    await chooseReason('Référence déjà utilisée');
    fireEvent.change(screen.getByLabelText('Texte (facultatif)'), { target: { value: 'court' } });
    await waitFor(() => expect(okButton()).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Texte (facultatif)'), { target: { value: 'Référence vue deux fois' } });
    await waitFor(() => expect(okButton()).toBeEnabled());
  });

  it('« Autre » exige une note de 10 caractères au moins', async () => {
    rejectRentalDeclaration.mockResolvedValue({ ...declaration, status: 'REJECTED' });
    renderModal();
    await chooseReason('Autre');
    await waitFor(() => expect(okButton()).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Texte (obligatoire)'), {
      target: { value: 'Capture illisible, merci de renvoyer' }
    });
    await waitFor(() => expect(okButton()).toBeEnabled());
    fireEvent.click(okButton());
    await waitFor(() => expect(rejectRentalDeclaration).toHaveBeenCalledTimes(1));
    expect(rejectRentalDeclaration).toHaveBeenCalledWith('t1', 'decl-1', {
      rejectReason: 'OTHER',
      note: 'Capture illisible, merci de renvoyer'
    });
  });

  it('déclaration déjà traitée : onStale', async () => {
    rejectRentalDeclaration.mockRejectedValue({
      response: { data: { code: 'RENTAL_DECLARATION_ALREADY_REVIEWED', message: 'déjà traitée' } }
    });
    const { onStale, onRejected } = renderModal();
    await chooseReason('Paiement introuvable');
    await waitFor(() => expect(okButton()).toBeEnabled());
    fireEvent.click(okButton());
    await waitFor(() => expect(onStale).toHaveBeenCalled());
    expect(onRejected).not.toHaveBeenCalled();
  });
});
