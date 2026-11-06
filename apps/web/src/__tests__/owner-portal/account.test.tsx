import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
    totals: {
      rentCollected: 0,
      fees: 0,
      vat: 0,
      expenses: 0,
      payouts: 0,
      withholdingTax: 0,
      depositRetained: 0,
      otherMovements: 0
    },
    movements: [],
    payouts: [],
    ...overrides
  };
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/owner/account') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <Account />
      </MemoryRouter>
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

const T = { timeout: 8000 };

function versement(id: string, number: string, reference: string, method: 'CASH' | 'BANK_TRANSFER' = 'BANK_TRANSFER') {
  return {
    id,
    number,
    amount: 100_000,
    paidAt: '2026-02-10',
    method,
    reference,
    notes: null,
    statementId: null,
    status: 'VALIDATED' as const,
    voidReason: null,
    voidedAt: null,
    createdAt: '2026-02-10',
    createdByName: 'Gestionnaire'
  };
}

function mouvement(id: string, label: string, bien: string, date = '2026-03-05') {
  return {
    id,
    date,
    type: 'RENT_COLLECTED' as const,
    label,
    debit: 0,
    credit: 100_000,
    balanceAfter: 100_000,
    leaseNumber: null,
    propertyTitle: bien
  };
}

describe('Mon compte — recherche des reversements', () => {
  const payouts = [versement('p1', 'REV-2026-0001', 'VIR-111'), versement('p2', 'REV-2026-0002', 'ESP-222', 'CASH')];

  it('filtre les reversements en local et écrit la saisie dans l’URL', async () => {
    const user = userEvent.setup();
    getOwnerAccount.mockResolvedValue(compte({ payouts }));
    mount();
    expect(await screen.findByText('REV-2026-0001', {}, T)).toBeInTheDocument();
    expect(screen.getByText('REV-2026-0002')).toBeInTheDocument();

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les reversements' })).getByRole('textbox'),
      'ESP-222'
    );
    await vi.waitFor(() => expect(screen.queryByText('REV-2026-0001')).not.toBeInTheDocument(), T);
    expect(screen.getByText('REV-2026-0002')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('vs.q=ESP-222');
  });

  it('applique l’URL initiale et permet d’effacer les critères', async () => {
    const user = userEvent.setup();
    getOwnerAccount.mockResolvedValue(compte({ payouts }));
    mount('/owner/account?vs.q=zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('REV-2026-0001', {}, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('vs.q');
  });
});

describe('Mon compte — recherche des mouvements', () => {
  const movements = [
    mouvement('m1', 'Loyer octobre', 'Villa Angré'),
    mouvement('m2', 'Loyer novembre', 'Studio Plateau')
  ];

  it('affiche l’onglet des mouvements d’après l’URL et applique son critère', async () => {
    getOwnerAccount.mockResolvedValue(compte({ movements }));
    mount('/owner/account?tab=mouvements&mv.q=plateau');
    expect(await screen.findByText('Loyer novembre', {}, T)).toBeInTheDocument();
    expect(screen.queryByText('Loyer octobre')).not.toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Rechercher dans les mouvements' })).toBeInTheDocument();
  });
});
