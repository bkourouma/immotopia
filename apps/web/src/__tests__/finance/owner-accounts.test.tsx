import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ComptesProprietaires } from '../../pages/finance/ComptesProprietaires';
import { CompteProprietaire } from '../../pages/finance/CompteProprietaire';

/**
 * Comptes propriétaires — lot 3 de la gestion locative (côté agence).
 *
 * Suit le modèle de `__tests__/finance/balances.test.tsx` et
 * `agent-commissions.test.tsx` : un `<QueryClientProvider>` avec
 * `retry: false`, un `<MemoryRouter>` posé sur la route paramétrée,
 * `useBreakpoint` figé en desktop pour obtenir le tableau plutôt que les
 * cartes, et des délais explicites de 8 s sur les `findBy*` pour survivre à
 * la charge parallèle de la suite complète.
 *
 * Le mock de `services/owner-accounts-service` couvre les quatre exports
 * utilisés par les deux écrans : Vitest refuse tout import qu'un `vi.mock`
 * ne déclare pas explicitement, là où Jest renvoyait `undefined` en silence
 * (AGENTS.md).
 */

const listOwnerAccounts = vi.fn();
const getOwnerAccount = vi.fn();
const createOwnerPayout = vi.fn();
const voidOwnerPayout = vi.fn();

vi.mock('../../services/owner-accounts-service', () => ({
  listOwnerAccounts: (...a: unknown[]) => listOwnerAccounts(...a),
  getOwnerAccount: (...a: unknown[]) => getOwnerAccount(...a),
  createOwnerPayout: (...a: unknown[]) => createOwnerPayout(...a),
  voidOwnerPayout: (...a: unknown[]) => voidOwnerPayout(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// `TreasuryAccountSelector` (lot 10) appelle `listTreasuryAccounts` depuis le
// formulaire de reversement : sans ce mock, Vitest laisserait partir une
// vraie requête réseau.
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

function compteResume(overrides: Record<string, unknown> = {}) {
  return {
    ownerClientId: 'owner-1',
    ownerName: 'Aissatou Barry',
    email: 'aissatou@example.com',
    balance: 450_000,
    lastMovementAt: '2026-09-10',
    lastPayout: { number: 'REV-2026-0001', amount: 200_000, paidAt: '2026-09-01' },
    ...overrides
  };
}

function listeComptes() {
  return [
    compteResume(),
    compteResume({
      ownerClientId: 'owner-2',
      ownerName: 'Mamadou Diallo',
      email: null,
      balance: -50_000,
      lastMovementAt: '2026-09-15',
      lastPayout: null
    })
  ];
}

function detailCompte(overrides: Record<string, unknown> = {}) {
  return {
    ownerClientId: 'owner-1',
    ownerName: 'Aissatou Barry',
    email: 'aissatou@example.com',
    balance: 450_000,
    totals: {
      rentCollected: 900_000,
      fees: 90_000,
      vat: 16_200,
      expenses: 143_800,
      payouts: 200_000
    },
    movements: [
      {
        id: 'mv-1',
        date: '2026-09-01',
        type: 'RENT_COLLECTED',
        label: 'Loyer Villa Cocody',
        debit: 0,
        credit: 900_000,
        balanceAfter: 900_000,
        leaseNumber: 'BAIL-001',
        propertyTitle: 'Villa Cocody'
      },
      {
        id: 'mv-2',
        date: '2026-09-08',
        type: 'PAYOUT',
        label: 'Reversement REV-2026-0001',
        debit: 200_000,
        credit: 0,
        balanceAfter: 450_000,
        leaseNumber: null,
        propertyTitle: null
      }
    ],
    payouts: [
      {
        id: 'payout-2',
        number: 'REV-2026-0002',
        amount: 100_000,
        paidAt: '2026-09-12',
        method: 'BANK_TRANSFER',
        reference: 'VIR-778',
        notes: null,
        statementId: null,
        status: 'VOIDED',
        voidReason: 'Erreur sur le montant',
        voidedAt: '2026-09-13',
        createdAt: '2026-09-12',
        createdByName: 'Fatou'
      },
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
    ],
    ...overrides
  };
}

function mountListe(url = '/tenant/agence-1/finance/owner-accounts') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/owner-accounts" element={<ComptesProprietaires />} />
            <Route
              path="/tenant/:tenantId/finance/owner-accounts/:ownerClientId"
              element={<span>compte du propriétaire</span>}
            />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountDetail(url = '/tenant/agence-1/finance/owner-accounts/owner-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/owner-accounts/:ownerClientId" element={<CompteProprietaire />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Comptes propriétaires — liste', () => {
  it('affiche une ligne par propriétaire et le total dû', async () => {
    listOwnerAccounts.mockResolvedValue(listeComptes());
    mountListe();

    expect(await screen.findByText('Aissatou Barry', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Mamadou Diallo')).toBeInTheDocument();

    expect(screen.getByText('Total dû aux propriétaires')).toBeInTheDocument();
    // Seul le solde positif (450 000) compte dans le total : le solde négatif
    // de Mamadou Diallo est une dette envers l'agence, pas un montant dû.
    expect(screen.getAllByText(/450\s000\sFCFA/).length).toBeGreaterThan(0);
  });

  it('mène au détail du propriétaire', async () => {
    listOwnerAccounts.mockResolvedValue(listeComptes());
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Aissatou Barry', {}, { timeout: 8000 });
    const boutons = screen.getAllByText('Voir le compte');
    await user.click(boutons[0]);

    expect(await screen.findByText('compte du propriétaire', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Compte propriétaire — détail', () => {
  it('affiche les cinq indicateurs et le solde dû', async () => {
    getOwnerAccount.mockResolvedValue(detailCompte());
    mountDetail();

    expect(await screen.findByText('Loyers encaissés', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Honoraires')).toBeInTheDocument();
    expect(screen.getByText('TVA')).toBeInTheDocument();
    expect(screen.getByText('Dépenses')).toBeInTheDocument();
    // « Reversements » nomme à la fois l'indicateur et le titre du tableau
    // qui le détaille plus bas : les deux doivent être présents.
    expect(screen.getAllByText('Reversements').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/450\s000\sFCFA/).length).toBeGreaterThan(0);
  });

  it('affiche les mouvements du compte avec leur étiquette', async () => {
    getOwnerAccount.mockResolvedValue(detailCompte());
    mountDetail();

    expect(await screen.findByText('Loyer Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Loyer encaissé')).toBeInTheDocument();
    expect(screen.getByText('Reversement')).toBeInTheDocument();
  });

  it('affiche un reversement annulé comme tel, avec son motif', async () => {
    getOwnerAccount.mockResolvedValue(detailCompte());
    mountDetail();

    await screen.findByText('REV-2026-0002', {}, { timeout: 8000 });
    const ligne = screen.getByText('REV-2026-0002').closest('tr') as HTMLElement;
    expect(ligne).not.toBeNull();
    expect(within(ligne).getByText('Annulé')).toBeInTheDocument();
    expect(within(ligne).getByText('Erreur sur le montant')).toBeInTheDocument();
    // Un reversement annulé ne propose plus l'action « Annuler ».
    expect(within(ligne).queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
  });
});

describe('Compte propriétaire — nouveau reversement', () => {
  it('pré-remplit le montant au solde dû et envoie la date au format YYYY-MM-DD', async () => {
    getOwnerAccount.mockResolvedValue(detailCompte());
    createOwnerPayout.mockResolvedValue({
      id: 'payout-3',
      number: 'REV-2026-0003',
      amount: 450_000,
      paidAt: dayjs().format('YYYY-MM-DD'),
      method: 'CASH',
      reference: null,
      notes: null,
      statementId: null,
      status: 'VALIDATED',
      voidReason: null,
      voidedAt: null,
      createdAt: dayjs().format('YYYY-MM-DD'),
      createdByName: 'Fatou'
    });
    const user = userEvent.setup({ delay: null });
    mountDetail();

    await user.click(await screen.findByText('Nouveau reversement', {}, { timeout: 8000 }));

    const champMontant = (await screen.findByLabelText('Montant', {}, { timeout: 8000 })) as HTMLInputElement;
    expect(champMontant.value).toMatch(/450\s000/);

    await user.click(screen.getByText('Enregistrer'));

    await waitFor(() => expect(createOwnerPayout).toHaveBeenCalled(), { timeout: 8000 });
    expect(createOwnerPayout).toHaveBeenCalledWith(
      'agence-1',
      'owner-1',
      expect.objectContaining({
        amount: 450_000,
        paidAt: dayjs().format('YYYY-MM-DD'),
        method: 'CASH'
      })
    );
  });

  it('affiche le message 409 renvoyé par l’API tel quel', async () => {
    getOwnerAccount.mockResolvedValue(detailCompte());
    createOwnerPayout.mockRejectedValue({
      response: { status: 409, data: { success: false, message: 'Le reversement dépasse le solde dû au propriétaire' } }
    });
    const user = userEvent.setup({ delay: null });
    mountDetail();

    await user.click(await screen.findByText('Nouveau reversement', {}, { timeout: 8000 }));
    await screen.findByLabelText('Montant', {}, { timeout: 8000 });

    await user.click(screen.getByText('Enregistrer'));

    expect(
      await screen.findByText('Le reversement dépasse le solde dû au propriétaire', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});

describe('Compte propriétaire — annulation d’un reversement', () => {
  it('exige un motif avant de confirmer', async () => {
    getOwnerAccount.mockResolvedValue(detailCompte());
    const user = userEvent.setup({ delay: null });
    mountDetail();

    await screen.findByText('REV-2026-0001', {}, { timeout: 8000 });
    const ligne = screen.getByText('REV-2026-0001').closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Annuler' }));

    const boutonConfirmer = await screen.findByRole('button', { name: "Confirmer l'annulation" }, { timeout: 8000 });
    expect(boutonConfirmer).toBeDisabled();

    await user.type(screen.getByLabelText("Motif de l'annulation"), 'Erreur de saisie');
    expect(boutonConfirmer).not.toBeDisabled();

    voidOwnerPayout.mockResolvedValue({
      id: 'payout-1',
      number: 'REV-2026-0001',
      amount: 200_000,
      paidAt: '2026-09-08',
      method: 'CASH',
      reference: null,
      notes: null,
      statementId: null,
      status: 'VOIDED',
      voidReason: 'Erreur de saisie',
      voidedAt: dayjs().format('YYYY-MM-DD'),
      createdAt: '2026-09-08',
      createdByName: 'Fatou'
    });

    await user.click(boutonConfirmer);

    await waitFor(
      () => expect(voidOwnerPayout).toHaveBeenCalledWith('agence-1', 'owner-1', 'payout-1', 'Erreur de saisie'),
      { timeout: 8000 }
    );
  });
});
