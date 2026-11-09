import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ApproveModal } from '../../../components/rental/declared-payment/ApproveModal';
import type { RentalPaymentDeclarationDto } from '../../../types/rental-declared-payment';

const approveRentalDeclaration = vi.fn();

vi.mock('../../../services/rental-declared-payment-service', () => ({
  approveRentalDeclaration: (...args: unknown[]) => approveRentalDeclaration(...args)
}));

vi.mock('../../../components/finance/TreasuryAccountSelector', () => ({
  TreasuryAccountSelector: ({ onChange }: { onChange?: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange?.('acc-9')}>
      choisir-compte
    </button>
  )
}));

const declaration = (overrides: Partial<RentalPaymentDeclarationDto> = {}): RentalPaymentDeclarationDto => ({
  id: 'decl-1',
  status: 'PENDING',
  leaseId: 'lease-1',
  leaseNumber: 'BAIL-001',
  declaredBy: { type: 'TENANT', clientId: 'c1', name: 'Awa Traoré' },
  installment: {
    id: 'inst-1',
    periodYear: 2026,
    periodMonth: 11,
    dueDate: '2026-11-05T00:00:00.000Z',
    remainingDue: 150000
  },
  receivingNumber: { id: 'rn-1', operator: 'ORANGE', phone: '+2250707070707' },
  operator: 'ORANGE',
  payerPhone: null,
  amount: 150000,
  acceptedAmount: null,
  paidAt: '2026-11-06T10:00:00.000Z',
  reference: 'TXN12345',
  hasProof: false,
  aiPrefilled: false,
  aiEditedFields: [],
  duplicateSuspected: false,
  overdue: false,
  alerts: [{ kind: 'AMOUNT_DIFFERS_FROM_DUE', due: 120000 }],
  notes: null,
  rejectReason: null,
  reviewNote: null,
  reviewedAt: null,
  reviewedByName: null,
  paymentId: null,
  createdAt: '2026-11-06T10:05:00.000Z',
  ...overrides
});

const renderModal = (props: Partial<React.ComponentProps<typeof ApproveModal>> = {}) => {
  const onClose = vi.fn();
  const onApproved = vi.fn();
  const onStale = vi.fn();
  render(
    <AntApp>
      <ApproveModal
        tenantId="t1"
        declaration={declaration()}
        onClose={onClose}
        onApproved={onApproved}
        onStale={onStale}
        {...props}
      />
    </AntApp>
  );
  return { onClose, onApproved, onStale };
};

const okButton = () => screen.getByRole('button', { name: /Valider (telle que déclarée|avec correction)/ });

describe('ApproveModal (locatif)', () => {
  beforeEach(() => {
    approveRentalDeclaration.mockReset();
  });

  it('rappelle la déclaration et propose le montant déclaré par défaut', () => {
    renderModal();
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(screen.getByText('BAIL-001')).toBeInTheDocument();
    expect(screen.getByText('TXN12345')).toBeInTheDocument();
    expect(screen.getByLabelText('Montant retenu')).toHaveValue('150000');
    expect(screen.getByText(/Par défaut : le compte de trésorerie du numéro de réception/)).toBeInTheDocument();
    expect(screen.getByText(/Le montant déclaré diffère du reste dû/)).toBeInTheDocument();
  });

  it('valide telle que déclarée sans note : corps réduit au minimum', async () => {
    approveRentalDeclaration.mockResolvedValue({ declaration: declaration(), corrected: false });
    const { onApproved } = renderModal();
    fireEvent.click(okButton());
    await waitFor(() => expect(approveRentalDeclaration).toHaveBeenCalledTimes(1));
    expect(approveRentalDeclaration).toHaveBeenCalledWith('t1', 'decl-1', {});
    await waitFor(() => expect(onApproved).toHaveBeenCalled());
  });

  it('exige une note seulement si le montant retenu diffère, puis envoie acceptedAmount et note', async () => {
    approveRentalDeclaration.mockResolvedValue({ declaration: declaration(), corrected: true });
    renderModal();
    fireEvent.change(screen.getByLabelText('Montant retenu'), { target: { value: '100000' } });
    await waitFor(() => expect(okButton()).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Valider avec correction' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Note de correction (obligatoire)'), { target: { value: 'court' } });
    expect(okButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note de correction (obligatoire)'), {
      target: { value: 'Montant réellement reçu : 100 000' }
    });
    await waitFor(() => expect(okButton()).toBeEnabled());
    fireEvent.click(okButton());
    await waitFor(() => expect(approveRentalDeclaration).toHaveBeenCalledTimes(1));
    expect(approveRentalDeclaration).toHaveBeenCalledWith('t1', 'decl-1', {
      acceptedAmount: 100000,
      note: 'Montant réellement reçu : 100 000'
    });
  });

  it('n’envoie treasuryAccountId que si le gestionnaire choisit un compte', async () => {
    approveRentalDeclaration.mockResolvedValue({ declaration: declaration(), corrected: false });
    renderModal();
    fireEvent.click(screen.getByText('choisir-compte'));
    fireEvent.click(okButton());
    await waitFor(() => expect(approveRentalDeclaration).toHaveBeenCalledTimes(1));
    expect(approveRentalDeclaration).toHaveBeenCalledWith('t1', 'decl-1', { treasuryAccountId: 'acc-9' });
  });

  it('déclaration déjà traitée : message et onStale', async () => {
    approveRentalDeclaration.mockRejectedValue({
      response: { data: { code: 'RENTAL_DECLARATION_ALREADY_REVIEWED', message: 'déjà traitée' } }
    });
    const { onStale, onApproved } = renderModal();
    fireEvent.click(okButton());
    await waitFor(() => expect(onStale).toHaveBeenCalled());
    expect(onApproved).not.toHaveBeenCalled();
  });

  it('autre erreur : message du serveur affiché dans la modale', async () => {
    approveRentalDeclaration.mockRejectedValue({ response: { data: { code: 'X', message: 'Échec serveur' } } });
    const { onStale } = renderModal();
    fireEvent.click(okButton());
    expect(await screen.findByText('Échec serveur')).toBeInTheDocument();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('ne rend rien quand la déclaration est null', () => {
    renderModal({ declaration: null });
    expect(screen.queryByText('Valider la déclaration de paiement')).not.toBeInTheDocument();
  });
});
