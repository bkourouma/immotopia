import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComptesProprietaires } from '../../pages/finance/ComptesProprietaires';
import { CompteProprietaire } from '../../pages/finance/CompteProprietaire';

/**
 * Comptes propriétaires — lot FIN-B, phase 1 : onglets Mouvements /
 * Reversements (un seul appel `getOwnerAccount`) et pagination locale de 20.
 */

const listOwnerAccounts = vi.fn();
const getOwnerAccount = vi.fn();

vi.mock('../../services/owner-accounts-service', () => ({
  listOwnerAccounts: (...a: unknown[]) => listOwnerAccounts(...a),
  getOwnerAccount: (...a: unknown[]) => getOwnerAccount(...a),
  createOwnerPayout: vi.fn(),
  voidOwnerPayout: vi.fn()
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: null }),
  useOwnAssetsOnly: () => false
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

const numero = (i: number) => String(i).padStart(2, '0');

function detail(nombreMouvements: number) {
  return {
    ownerClientId: 'owner-1',
    ownerName: 'Aissatou Barry',
    email: null,
    balance: 1000,
    totals: { rentCollected: 1, fees: 1, vat: 1, expenses: 1, payouts: 1 },
    movements: Array.from({ length: nombreMouvements }, (_, i) => ({
      id: `mv-${i + 1}`,
      date: '2026-09-01',
      type: 'RENT_COLLECTED',
      label: `Mouvement ${numero(i + 1)}`,
      debit: 0,
      credit: 1000,
      balanceAfter: 1000,
      leaseNumber: null,
      propertyTitle: null
    })),
    payouts: [
      {
        id: 'payout-1',
        number: 'REV-2026-0001',
        amount: 200_000,
        paidAt: '2026-09-08',
        method: 'CASH',
        reference: null,
        notes: null,
        statementId: null,
        status: 'VALIDATED',
        voidReason: null,
        voidedAt: null,
        createdAt: '2026-09-08',
        createdByName: 'Fatou'
      }
    ]
  };
}

function monter(element: React.ReactElement, path: string, url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const DETAIL = '/tenant/:tenantId/finance/owner-accounts/:ownerClientId';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Compte propriétaire — onglets', () => {
  it('affiche 20 mouvements sur 25 avec le compteur, et ne monte pas les reversements', async () => {
    getOwnerAccount.mockResolvedValue(detail(25));
    monter(<CompteProprietaire />, DETAIL, '/tenant/agence-1/finance/owner-accounts/owner-1');

    expect(await screen.findByText('Mouvement 20', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Mouvement 21')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
    expect(screen.queryByText('REV-2026-0001')).not.toBeInTheDocument();
    expect(getOwnerAccount).toHaveBeenCalledTimes(1);
  }, 15000);

  it('montre les reversements une fois leur onglet choisi, sans nouvelle requête', async () => {
    getOwnerAccount.mockResolvedValue(detail(25));
    const user = userEvent.setup({ delay: null });
    monter(<CompteProprietaire />, DETAIL, '/tenant/agence-1/finance/owner-accounts/owner-1');

    await screen.findByText('Mouvement 01', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: /Reversements/ }));

    expect(await screen.findByText('REV-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Mouvement 01')).not.toBeInTheDocument();
    expect(getOwnerAccount).toHaveBeenCalledTimes(1);
  }, 15000);

  it('ouvre l’onglet demandé par l’adresse, et retombe sur Mouvements si la valeur est inconnue', async () => {
    getOwnerAccount.mockResolvedValue(detail(3));
    const premier = monter(
      <CompteProprietaire />,
      DETAIL,
      '/tenant/agence-1/finance/owner-accounts/owner-1?onglet=reversements'
    );
    expect(await screen.findByText('REV-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    premier.unmount();

    monter(<CompteProprietaire />, DETAIL, '/tenant/agence-1/finance/owner-accounts/owner-1?onglet=nimporte');
    expect(await screen.findByText('Mouvement 01', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);
});

describe('Comptes propriétaires — liste paginée localement', () => {
  it('affiche 20 comptes sur 25, avec le compteur', async () => {
    listOwnerAccounts.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({
        ownerClientId: `owner-${i + 1}`,
        ownerName: `Propriétaire ${numero(i + 1)}`,
        email: null,
        balance: 0,
        lastMovementAt: null,
        lastPayout: null
      }))
    );
    monter(
      <ComptesProprietaires />,
      '/tenant/:tenantId/finance/owner-accounts',
      '/tenant/agence-1/finance/owner-accounts'
    );

    expect(await screen.findByText('Propriétaire 20', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Propriétaire 21')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
  }, 15000);
});
