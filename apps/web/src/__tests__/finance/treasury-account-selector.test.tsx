import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TreasuryAccountSelector } from '../../components/finance/TreasuryAccountSelector';
import type { TreasuryAccountDto } from '../../services/treasury-service';

/**
 * Sélecteur de compte de trésorerie — lot 10, conformité SYSCOHADA.
 *
 * Deux garanties : le filtrage des comptes proposés selon le moyen de
 * paiement (`kindsAcceptedFor`, non exporté — vérifié via le rendu), et
 * l'exclusion des comptes inactifs. `vi.mock` couvre le seul export utilisé
 * par le composant, `listTreasuryAccounts` (AGENTS.md — Vitest refuse tout
 * import qu'un `vi.mock` ne déclare pas explicitement).
 */

const listTreasuryAccounts = vi.fn();

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a)
}));

function compte(overrides: Partial<TreasuryAccountDto> = {}): TreasuryAccountDto {
  return {
    id: 'ta-1',
    kind: 'CASH',
    label: 'Caisse principale',
    accountNumber: '5711',
    mmOperator: null,
    bankName: null,
    bankAccountRef: null,
    isDefault: true,
    isActive: true,
    balance: 0,
    ...overrides
  };
}

function mount(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>{ui}</AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TreasuryAccountSelector — filtrage par moyen de paiement', () => {
  it('ne propose que les caisses pour un règlement en espèces', async () => {
    listTreasuryAccounts.mockResolvedValue([
      compte({ id: 'caisse-1', kind: 'CASH', label: 'Caisse principale', accountNumber: '5711' }),
      compte({ id: 'banque-1', kind: 'BANK', label: 'Compte BICICI', accountNumber: '5211' })
    ]);
    const user = userEvent.setup({ delay: null });
    mount(<TreasuryAccountSelector tenantId="agence-1" paymentMethod="CASH" value={null} onChange={() => undefined} />);

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(listTreasuryAccounts).toHaveBeenCalledWith('agence-1'));

    expect(await screen.findByText(/Caisse principale/)).toBeInTheDocument();
    expect(screen.queryByText(/Compte BICICI/)).not.toBeInTheDocument();
  });

  it('propose les comptes chèques et banque pour un règlement par chèque', async () => {
    listTreasuryAccounts.mockResolvedValue([
      compte({ id: 'cheques-1', kind: 'CHECKS_TO_CASH', label: 'Chèques à encaisser', accountNumber: '513' }),
      compte({ id: 'banque-1', kind: 'BANK', label: 'Compte BICICI', accountNumber: '5211' }),
      compte({ id: 'caisse-1', kind: 'CASH', label: 'Caisse principale', accountNumber: '5711' })
    ]);
    const user = userEvent.setup({ delay: null });
    mount(
      <TreasuryAccountSelector tenantId="agence-1" paymentMethod="CHECK" value={null} onChange={() => undefined} />
    );

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText(/Chèques à encaisser/)).toBeInTheDocument();
    expect(screen.getByText(/Compte BICICI/)).toBeInTheDocument();
    expect(screen.queryByText(/Caisse principale/)).not.toBeInTheDocument();
  });

  it('exclut les comptes inactifs', async () => {
    listTreasuryAccounts.mockResolvedValue([
      compte({ id: 'caisse-1', kind: 'CASH', label: 'Caisse principale', accountNumber: '5711', isActive: true }),
      compte({ id: 'caisse-2', kind: 'CASH', label: 'Ancienne caisse', accountNumber: '5712', isActive: false })
    ]);
    const user = userEvent.setup({ delay: null });
    mount(<TreasuryAccountSelector tenantId="agence-1" paymentMethod="CASH" value={null} onChange={() => undefined} />);

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText(/Caisse principale/)).toBeInTheDocument();
    expect(screen.queryByText(/Ancienne caisse/)).not.toBeInTheDocument();
  });

  it('affiche tous les comptes actifs pour le moyen « Autre »', async () => {
    listTreasuryAccounts.mockResolvedValue([
      compte({ id: 'caisse-1', kind: 'CASH', label: 'Caisse principale', accountNumber: '5711' }),
      compte({ id: 'banque-1', kind: 'BANK', label: 'Compte BICICI', accountNumber: '5211' }),
      compte({ id: 'mm-1', kind: 'MOBILE_MONEY', label: 'Wave Agence', accountNumber: '5521', mmOperator: 'WAVE' })
    ]);
    const user = userEvent.setup({ delay: null });
    mount(
      <TreasuryAccountSelector tenantId="agence-1" paymentMethod="OTHER" value={null} onChange={() => undefined} />
    );

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText(/Caisse principale/)).toBeInTheDocument();
    expect(screen.getByText(/Compte BICICI/)).toBeInTheDocument();
    expect(screen.getByText(/Wave Agence/)).toBeInTheDocument();
  });
});
