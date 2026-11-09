import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { RentalPayoutModal } from '../../../components/rental/online-payment/PayoutModal';

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const createRentalCollectionPayout = vi.fn();
const getRentalCollectionAccount = vi.fn();
const listRentalCollectionPayouts = vi.fn();
const listTreasuryAccounts = vi.fn();

vi.mock('../../../services/rental-online-payment-service', () => ({
  createRentalCollectionPayout: (...a: unknown[]) => createRentalCollectionPayout(...a),
  getRentalCollectionAccount: (...a: unknown[]) => getRentalCollectionAccount(...a),
  listRentalCollectionPayouts: (...a: unknown[]) => listRentalCollectionPayouts(...a)
}));

vi.mock('../../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a)
}));

function account(id: string, label: string, accountNumber: string, isActive = true) {
  return {
    id,
    kind: 'BANK',
    label,
    accountNumber,
    mmOperator: null,
    bankName: null,
    bankAccountRef: null,
    isDefault: false,
    isActive,
    balance: 0
  };
}

const ACCOUNTS = [
  account('a1', 'Banque principale', '5211'),
  account('a2', 'Caisse agence', '5711'),
  account('a3', 'Ancienne banque', '5212', false),
  account('a4', 'PaySecureHub', '5525'),
  account('a5', 'Mobile money', '5721')
];

const RESULT = {
  payout: { transferId: 't1', number: 'VIR-2026-0001', amount: 50000 },
  ledgerBalanceAfter: 50000
};

function renderModal(props: Partial<React.ComponentProps<typeof RentalPayoutModal>> = {}) {
  const onRecorded = vi.fn();
  const onClose = vi.fn();
  render(
    <AntApp>
      <RentalPayoutModal
        tenantId="ten-1"
        open
        ledgerBalance={100000}
        onClose={onClose}
        onRecorded={onRecorded}
        {...props}
      />
    </AntApp>
  );
  return { onRecorded, onClose };
}

async function openAccounts() {
  await waitFor(() => expect(listTreasuryAccounts).toHaveBeenCalledWith('ten-1'));
  const select = screen.getByLabelText('Compte de destination');
  fireEvent.mouseDown(select);
}

function okButton() {
  return screen.getByRole('button', { name: 'Enregistrer' });
}

describe('RentalPayoutModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTreasuryAccounts.mockResolvedValue(ACCOUNTS);
    createRentalCollectionPayout.mockResolvedValue(RESULT);
  });

  it('rappelle que rien n’est viré chez PaySecureHub', async () => {
    renderModal();
    expect(
      await screen.findByText(
        "Enregistrement comptable seulement : aucun virement réel n'est déclenché chez PaySecureHub."
      )
    ).toBeInTheDocument();
  });

  it('ne propose que les comptes 521/571 actifs, jamais le 5525', async () => {
    renderModal();
    await openAccounts();
    expect(await screen.findByText('Banque principale (5211)')).toBeInTheDocument();
    expect(screen.getByText('Caisse agence (5711)')).toBeInTheDocument();
    expect(screen.queryByText('Ancienne banque (5212)')).not.toBeInTheDocument();
    expect(screen.queryByText('PaySecureHub (5525)')).not.toBeInTheDocument();
    expect(screen.queryByText('Mobile money (5721)')).not.toBeInTheDocument();
  });

  it('bloque un montant supérieur au solde', async () => {
    renderModal({ ledgerBalance: 1000 });
    await openAccounts();
    fireEvent.click(await screen.findByText('Banque principale (5211)'));
    const input = screen.getByLabelText('Montant reversé');
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input);
    // InputNumber plafonne à max ; on vérifie surtout qu'aucun montant > solde ne peut être soumis.
    await waitFor(() =>
      expect(Number((input as HTMLInputElement).value.replace(/\D/g, '') || 0)).toBeLessThanOrEqual(1000)
    );
  });

  it('désactive l’enregistrement quand le solde est nul', async () => {
    renderModal({ ledgerBalance: 0 });
    await openAccounts();
    fireEvent.click(await screen.findByText('Banque principale (5211)'));
    expect(okButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tout reverser' })).toBeDisabled();
  });

  it('soumet avec les bons champs (Tout reverser)', async () => {
    const { onRecorded } = renderModal({ ledgerBalance: 100000 });
    await openAccounts();
    fireEvent.click(await screen.findByText('Banque principale (5211)'));
    expect(okButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tout reverser' }));
    await waitFor(() => expect(okButton()).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Note (facultative)'), { target: { value: '  Octobre  ' } });
    fireEvent.click(okButton());
    await waitFor(() => expect(createRentalCollectionPayout).toHaveBeenCalledTimes(1));
    const [tenantId, body] = createRentalCollectionPayout.mock.calls[0];
    expect(tenantId).toBe('ten-1');
    expect(body).toEqual({
      toTreasuryAccountId: 'a1',
      amount: 100000,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      note: 'Octobre'
    });
    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith(RESULT));
  });

  it('affiche l’erreur de l’API', async () => {
    createRentalCollectionPayout.mockRejectedValue({
      response: { data: { code: 'RENTAL_COLLECTION_PAYOUT_INVALID', message: 'Montant supérieur au solde du 5525.' } }
    });
    const { onRecorded } = renderModal();
    await openAccounts();
    fireEvent.click(await screen.findByText('Banque principale (5211)'));
    fireEvent.click(screen.getByRole('button', { name: 'Tout reverser' }));
    await waitFor(() => expect(okButton()).toBeEnabled());
    fireEvent.click(okButton());
    expect(await screen.findByText('Montant supérieur au solde du 5525.')).toBeInTheDocument();
    expect(onRecorded).not.toHaveBeenCalled();
  });
});
