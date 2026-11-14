import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { HelpContext, INERT_HELP } from '../../help/help-context';
import { PaymentAccountsCard } from '../../components/payment/PaymentAccountsCard';
import { ReceivingAccountsManagerCard } from '../../components/payment/ReceivingAccountsManagerCard';
import type { ReceivingAccountAdmin } from '../../services/receiving-account-service';

/**
 * Le « ? » des deux cartes de comptes de réception n'apparaît que si l'écran
 * passe `helpId` (contexte syndic) : les écrans du locatif, qui partagent ces
 * composants, restent inchangés.
 */

const listReceivingAccounts = vi.fn();

vi.mock('../../services/receiving-account-service', () => ({
  RECEIVING_ACCOUNT_LIMIT: 10,
  RECEIVING_ACCOUNT_QR_MAX_BYTES: 2 * 1024 * 1024,
  RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  listReceivingAccounts: (...a: unknown[]) => listReceivingAccounts(...a),
  createReceivingAccount: vi.fn(),
  updateReceivingAccount: vi.fn(),
  deleteReceivingAccount: vi.fn(),
  fetchReceivingAccountQr: vi.fn()
}));

vi.mock('../../help/registry', () => ({
  useHelpEntry: (id: string | null | undefined) =>
    id
      ? { entry: { id, kind: 'section', title: 'Fiche', summary: 'x' }, status: 'ready', fallback: false }
      : { entry: null, status: 'idle', fallback: false },
  resolvePageHelpId: () => null,
  getHelpEntry: async () => null
}));

const account = {
  id: 'a1',
  institution: 'Wave',
  scannableWith: null,
  alias: 'agence-soleil',
  holderName: 'Agence Soleil',
  instructions: null,
  hasQr: false,
  qrPath: null
};

const adminRow: ReceivingAccountAdmin = {
  ...account,
  isActive: true,
  sortOrder: 0,
  updatedAt: '2026-11-01T00:00:00.000Z'
};

function withHelp(ui: React.ReactElement) {
  return render(
    <HelpContext.Provider value={{ ...INERT_HELP, available: true }}>
      <AntApp>{ui}</AntApp>
    </HelpContext.Provider>
  );
}

beforeEach(() => {
  listReceivingAccounts.mockReset();
  listReceivingAccounts.mockResolvedValue([adminRow]);
});

describe('« ? » des cartes de comptes de réception', () => {
  it('PaymentAccountsCard : un bouton d’aide avec helpId, aucun sans', () => {
    const { container, unmount } = withHelp(
      <PaymentAccountsCard accounts={[account]} helpId="syndic.portail.appels.payer-agence" />
    );
    expect(container.querySelector('[data-help-id="syndic.portail.appels.payer-agence"]')).not.toBeNull();
    unmount();

    const without = withHelp(<PaymentAccountsCard accounts={[account]} />);
    expect(without.container.querySelector('[data-help-id]')).toBeNull();
  });

  it('ReceivingAccountsManagerCard : un bouton d’aide avec helpId, aucun sans', async () => {
    const scope = { kind: 'syndicate' as const, tenantId: 't1', syndicId: 's1' };
    const { container, unmount } = withHelp(
      <ReceivingAccountsManagerCard scope={scope} helpId="syndic.paiements.comptes-reception" />
    );
    await waitFor(() => expect(screen.getByText('Wave')).toBeInTheDocument());
    expect(container.querySelector('[data-help-id="syndic.paiements.comptes-reception"]')).not.toBeNull();
    unmount();

    const without = withHelp(<ReceivingAccountsManagerCard scope={scope} />);
    await waitFor(() => expect(screen.getByText('Wave')).toBeInTheDocument());
    expect(without.container.querySelector('[data-help-id]')).toBeNull();
  });
});
