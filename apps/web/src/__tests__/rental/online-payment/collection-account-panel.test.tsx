import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { CollectionAccountPanel } from '../../../components/rental/online-payment/CollectionAccountPanel';

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const getRentalCollectionAccount = vi.fn();
const listRentalCollectionPayouts = vi.fn();
const createRentalCollectionPayout = vi.fn();
const listTreasuryAccounts = vi.fn();

vi.mock('../../../services/rental-online-payment-service', () => ({
  getRentalCollectionAccount: (...a: unknown[]) => getRentalCollectionAccount(...a),
  listRentalCollectionPayouts: (...a: unknown[]) => listRentalCollectionPayouts(...a),
  createRentalCollectionPayout: (...a: unknown[]) => createRentalCollectionPayout(...a)
}));

vi.mock('../../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a)
}));

function accountDto(overrides: Record<string, unknown> = {}, provider: Record<string, unknown> = {}) {
  return {
    accountNumber: '5525',
    treasuryAccountId: 'c1',
    ledgerBalance: 150000,
    currency: 'XOF',
    provider: {
      available: true,
      balance: { amount: 175000, currency: 'XOF', at: '2026-11-09T10:30:00.000Z' },
      unavailableReason: null,
      message: null,
      ...provider
    },
    recentPayouts: [],
    ...overrides
  };
}

const PAYOUT = {
  transferId: 't1',
  number: 'VIR-2026-0007',
  toTreasuryAccountId: 'a1',
  toLabel: 'Banque principale',
  amount: 40000,
  date: '2026-11-05T00:00:00.000Z',
  note: 'Reversement octobre',
  createdByName: 'Awa Traoré',
  createdAt: '2026-11-05T09:00:00.000Z'
};

function renderPanel(props: Partial<React.ComponentProps<typeof CollectionAccountPanel>> = {}) {
  return render(
    <AntApp>
      <CollectionAccountPanel tenantId="ten-1" refreshToken={0} canReverse {...props} />
    </AntApp>
  );
}

describe('CollectionAccountPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRentalCollectionAccount.mockResolvedValue(accountDto());
    listRentalCollectionPayouts.mockResolvedValue({ items: [PAYOUT], total: 1, page: 1, pageSize: 10 });
    listTreasuryAccounts.mockResolvedValue([]);
  });

  it('affiche le solde comptable, le solde PaySecureHub et l’historique', async () => {
    renderPanel();
    expect(await screen.findByText('Solde comptable (5525)')).toBeInTheDocument();
    expect(screen.getByText('Solde PaySecureHub')).toBeInTheDocument();
    expect(screen.getByText(/150\D?000/)).toBeInTheDocument();
    expect(screen.getByText(/175\D?000/)).toBeInTheDocument();
    expect(screen.getByText(/au 09\/11\/2026/)).toBeInTheDocument();
    expect(await screen.findByText('VIR-2026-0007')).toBeInTheDocument();
    expect(screen.getByText('Banque principale')).toBeInTheDocument();
    expect(screen.getByText('Reversement octobre')).toBeInTheDocument();
    expect(screen.getByText('Awa Traoré')).toBeInTheDocument();
    expect(listRentalCollectionPayouts).toHaveBeenCalledWith('ten-1', { page: 1, pageSize: 10 });
  });

  it.each([
    ['NOT_CONFIGURED', /pas configuré/],
    ['SIMULATOR', /simulateur/],
    ['NO_CREDENTIALS', /Identifiants PaySecureHub manquants/],
    ['UNREACHABLE', /injoignable/]
  ])('affiche un message discret quand le fournisseur est indisponible (%s)', async (reason, pattern) => {
    getRentalCollectionAccount.mockResolvedValue(
      accountDto({}, { available: false, balance: null, unavailableReason: reason, message: 'msg serveur' })
    );
    renderPanel();
    expect(await screen.findByText(pattern)).toBeInTheDocument();
    expect(screen.queryByText('Solde PaySecureHub')).not.toBeInTheDocument();
  });

  it('masque le bouton Reverser sans le droit', async () => {
    renderPanel({ canReverse: false });
    await screen.findByText('Solde comptable (5525)');
    expect(screen.queryByRole('button', { name: /Reverser vers la trésorerie/ })).not.toBeInTheDocument();
  });

  it('désactive le bouton Reverser quand le solde est nul', async () => {
    getRentalCollectionAccount.mockResolvedValue(accountDto({ ledgerBalance: 0 }));
    renderPanel();
    await screen.findByText('Solde comptable (5525)');
    expect(screen.getByRole('button', { name: /Reverser vers la trésorerie/ })).toBeDisabled();
  });

  it('ouvre la modale de reversement quand il y a un solde', async () => {
    renderPanel();
    await screen.findByText('Solde comptable (5525)');
    const button = screen.getByRole('button', { name: /Reverser vers la trésorerie/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('Compte de destination')).toBeInTheDocument();
    expect(listTreasuryAccounts).toHaveBeenCalledWith('ten-1');
  });

  it('affiche l’erreur de chargement avec un bouton Réessayer', async () => {
    getRentalCollectionAccount.mockRejectedValueOnce({ response: { data: { message: 'Panne serveur' } } });
    renderPanel();
    expect(await screen.findByText('Panne serveur')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Solde comptable (5525)')).toBeInTheDocument();
  });

  it('recharge quand refreshToken change', async () => {
    const view = renderPanel({ refreshToken: 0 });
    await screen.findByText('Solde comptable (5525)');
    const calls = getRentalCollectionAccount.mock.calls.length;
    view.rerender(
      <AntApp>
        <CollectionAccountPanel tenantId="ten-1" refreshToken={1} canReverse />
      </AntApp>
    );
    await waitFor(() => expect(getRentalCollectionAccount.mock.calls.length).toBeGreaterThan(calls));
  });
});
