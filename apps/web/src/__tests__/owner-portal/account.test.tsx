import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Account from '../../pages/OwnerPortal/Account';
import type { OwnerAccountDetail } from '../../services/owner-portal-account-service';

/**
 * « Mon compte » — portail propriétaire, lot 3 de la gestion locative.
 *
 * Modèle de `__tests__/finance/balances.test.tsx` : un `<QueryClientProvider>`
 * avec `retry: false`, `useBreakpoint` figé en desktop pour obtenir le
 * tableau plutôt que les cartes, et des délais explicites sur les `findBy*`.
 *
 * Vitest refuse tout import qu'un `vi.mock` ne déclare pas explicitement, là
 * où Jest renvoyait `undefined` en silence (AGENTS.md) : le mock du service
 * couvre donc le seul export que l'écran utilise, `getOwnerAccount`.
 */

const getOwnerAccount = vi.fn();

vi.mock('../../services/owner-portal-account-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/owner-portal-account-service')>(
    '../../services/owner-portal-account-service'
  );
  return {
    ...actual,
    getOwnerAccount: (...a: unknown[]) => getOwnerAccount(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function compte(overrides: Partial<OwnerAccountDetail> = {}): OwnerAccountDetail {
  return {
    ownerClientId: 'owner-1',
    ownerName: 'Awa Konan',
    email: 'awa@example.com',
    balance: 0,
    totals: { rentCollected: 0, fees: 0, vat: 0, expenses: 0, payouts: 0 },
    movements: [],
    payouts: [],
    ...overrides
  };
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Account />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Mon compte — la phrase de solde', () => {
  it("annonce que l'agence doit de l'argent quand le solde est positif", async () => {
    getOwnerAccount.mockResolvedValue(compte({ balance: 250_000 }));

    mount();

    expect(await screen.findByText("L'agence vous doit", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/250\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.queryByText("Vous devez à l'agence")).not.toBeInTheDocument();
    expect(screen.queryByText('Votre compte est à jour')).not.toBeInTheDocument();
  });

  it("annonce que le propriétaire doit à l'agence quand le solde est négatif, en valeur positive", async () => {
    getOwnerAccount.mockResolvedValue(compte({ balance: -80_000 }));

    mount();

    expect(await screen.findByText("Vous devez à l'agence", {}, { timeout: 8000 })).toBeInTheDocument();
    // Affiché en valeur absolue : le signe est déjà porté par la phrase.
    expect(screen.getByText(/80\s000\sFCFA/)).toBeInTheDocument();
  });

  it('annonce un compte à jour, sans montant, quand le solde est nul', async () => {
    getOwnerAccount.mockResolvedValue(compte({ balance: 0 }));

    mount();

    expect(await screen.findByText('Votre compte est à jour', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Mon compte — reversements reçus', () => {
  it('affiche un reversement annulé, marqué « Annulé », toujours visible', async () => {
    getOwnerAccount.mockResolvedValue(
      compte({
        balance: 100_000,
        payouts: [
          {
            id: 'payout-1',
            number: 'REV-2026-0001',
            amount: 150_000,
            paidAt: '2026-02-10',
            method: 'BANK_TRANSFER',
            reference: 'VIR-778',
            notes: null,
            statementId: null,
            status: 'VOIDED',
            voidReason: 'Erreur de montant',
            voidedAt: '2026-02-11',
            createdAt: '2026-02-10',
            createdByName: 'Gestionnaire'
          }
        ]
      })
    );

    mount();

    expect(await screen.findByText('REV-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Annulé')).toBeInTheDocument();
  });
});

describe('Mon compte — état d’erreur', () => {
  it('affiche une erreur avec un moyen de réessayer', async () => {
    getOwnerAccount.mockRejectedValue(new Error('boom'));

    mount();

    expect(await screen.findByText('Impossible de charger votre compte.', {}, { timeout: 8000 })).toBeInTheDocument();
    const bouton = screen.getByText('Réessayer');
    expect(bouton).toBeInTheDocument();

    getOwnerAccount.mockResolvedValueOnce(compte({ balance: 0 }));
    await userEvent.click(bouton);
    expect(await screen.findByText('Votre compte est à jour', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
