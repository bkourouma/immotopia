import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Caisse } from '../../pages/finance/Caisse';
import type { CashSession } from '../../services/cash-sessions-service';

/**
 * Caisse d'agence — Lot 6, sessions de caisse (comptage, validation).
 *
 * Suit le modèle de `__tests__/finance/comptabilite.test.tsx` : un
 * `<QueryClientProvider>` avec `retry: false`, un `<MemoryRouter>` posé sur la
 * route paramétrée, et des délais explicites de 8 s sur les `findBy*`. Le mock
 * de `services/cash-sessions-service` couvre les SIX fonctions que l'écran
 * utilise : Vitest refuse tout import qu'un `vi.mock` ne déclare pas
 * explicitement, là où Jest renvoyait `undefined` en silence (AGENTS.md).
 */

const getCurrentCashSession = vi.fn();
const openCashSession = vi.fn();
const closeCashSession = vi.fn();
const validateCashSession = vi.fn();
const listCashSessions = vi.fn();
const getCashSession = vi.fn();

vi.mock('../../services/cash-sessions-service', () => ({
  getCurrentCashSession: (...a: unknown[]) => getCurrentCashSession(...a),
  openCashSession: (...a: unknown[]) => openCashSession(...a),
  closeCashSession: (...a: unknown[]) => closeCashSession(...a),
  validateCashSession: (...a: unknown[]) => validateCashSession(...a),
  listCashSessions: (...a: unknown[]) => listCashSessions(...a),
  getCashSession: (...a: unknown[]) => getCashSession(...a)
}));

// Permissions de la personne connectée : `null` = aucune restriction
// (administrateur d'agence). Un test les restreint pour le Comptable ou le
// Gestionnaire (BUG-2026-09-29-006).
let permissionsDetenues: Set<string> | null = null;
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ disabled: new Set<string>(), permissions: permissionsDetenues, ready: true })
}));

// Personne connectée : ni le caissier des sessions de test (`user-1`) par défaut.
let utilisateurId = 'user-99';
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: utilisateurId } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// `TreasuryAccountSelector` (lot 10) appelle `listTreasuryAccounts` : sans ce
// mock, Vitest laisserait partir une vraie requête réseau depuis le
// formulaire d'ouverture.
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

function sessionOuverte(overrides: Partial<CashSession> = {}): CashSession {
  return {
    id: 'sess-1',
    number: 'CAI-2026-0001',
    cashierUserId: 'user-1',
    cashierName: 'Awa Koné',
    status: 'OPEN',
    openedAt: '2026-09-23T08:00:00.000Z',
    openingFloat: 50_000,
    openingNote: null,
    treasuryAccountId: 'caisse-1',
    treasuryLabel: 'Caisse principale · 5711',
    closedAt: null,
    expected: {
      receipts: 120_000,
      disbursements: 20_000,
      amount: 150_000,
      lines: [
        { kind: 'RENT_PAYMENT', label: 'Loyer — BAIL-2026-0012', amount: 120_000, at: '2026-09-23T09:00:00.000Z' },
        { kind: 'CASH_VOUCHER', label: 'Pièce de caisse PC-2026-0004', amount: -20_000, at: '2026-09-23T10:00:00.000Z' }
      ]
    },
    countedAmount: null,
    denominations: null,
    difference: null,
    differenceReason: null,
    validatedAt: null,
    validatedByName: null,
    validationComment: null,
    ...overrides
  };
}

/** Session avec un attendu rond (31 000), pratique pour les calculs de billetage du contrat. */
function sessionAttendu31000(overrides: Partial<CashSession> = {}): CashSession {
  return sessionOuverte({
    expected: { receipts: 0, disbursements: 0, amount: 31_000, lines: [] },
    ...overrides
  });
}

function mount(url = '/tenant/agence-1/finance/caisse') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/caisse" element={<Caisse />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Le contrôle portant cet `id`, pour les compteurs de billetage qui n'ont pas de libellé texte simple. */
function champ(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Champ « ${id} » introuvable.`);
  return element;
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionsDetenues = null;
  utilisateurId = 'user-99';
  getCurrentCashSession.mockResolvedValue(null);
  listCashSessions.mockResolvedValue([]);
});

describe('Caisse — ouverture', () => {
  it('ouvre la caisse avec le fond de caisse et la note saisis', async () => {
    openCashSession.mockResolvedValue(sessionOuverte());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Ouvrir ma caisse', {}, { timeout: 8000 });

    const champFond = screen.getByLabelText('Fond de caisse (FCFA)');
    await user.clear(champFond);
    await user.type(champFond, '50000');
    await user.type(screen.getByLabelText('Note (facultatif)'), 'Fond remis par le régisseur');

    await user.click(screen.getByRole('button', { name: 'Ouvrir la caisse' }));

    await waitFor(() => expect(openCashSession).toHaveBeenCalled());
    expect(openCashSession).toHaveBeenCalledWith('agence-1', {
      openingFloat: 50_000,
      openingNote: 'Fond remis par le régisseur'
    });
  });
});

describe('Caisse — session ouverte', () => {
  it('affiche le numéro, l’attendu et les opérations', async () => {
    getCurrentCashSession.mockResolvedValue(sessionOuverte());
    mount();

    expect(await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Loyer — BAIL-2026-0012')).toBeInTheDocument();
    expect(screen.getByText('Pièce de caisse PC-2026-0004')).toBeInTheDocument();
    // Attendu = 50 000 + 120 000 − 20 000 = 150 000, affiché en grand.
    expect(screen.getAllByText(/150\s000/).length).toBeGreaterThan(0);
  });
});

describe('Caisse — clôture, billetage', () => {
  it('calcule le total compté en direct et un écart nul', async () => {
    getCurrentCashSession.mockResolvedValue(sessionAttendu31000());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Clôturer la caisse/ }));

    // 3 × 10 000 + 2 × 500 = 31 000, égal à l'attendu du contrat.
    await user.clear(champ('caisse-billet-10000'));
    await user.type(champ('caisse-billet-10000'), '3');
    await user.clear(champ('caisse-billet-500'));
    await user.type(champ('caisse-billet-500'), '2');

    await waitFor(() => {
      expect(screen.getAllByText(/31\s000/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Aucun écart')).toBeInTheDocument();
    // Écart nul : le bouton « Clôturer » n'exige aucun motif.
    expect(screen.getByRole('button', { name: 'Clôturer' })).not.toBeDisabled();
  });

  it('exige un motif quand l’écart n’est pas nul, puis l’accepte une fois saisi', async () => {
    getCurrentCashSession.mockResolvedValue(sessionAttendu31000());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Clôturer la caisse/ }));

    // 3 × 10 000 = 30 000, soit 1 000 de moins que l'attendu (31 000) : un manquant.
    await user.clear(champ('caisse-billet-10000'));
    await user.type(champ('caisse-billet-10000'), '3');

    expect(await screen.findByText(/Manquant/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clôturer' })).toBeDisabled();

    await user.type(screen.getByLabelText("Motif de l'écart"), 'Erreur de rendu monnaie');
    expect(screen.getByRole('button', { name: 'Clôturer' })).not.toBeDisabled();
  });

  it('clôture la caisse avec le billetage saisi', async () => {
    const session = sessionAttendu31000();
    getCurrentCashSession.mockResolvedValue(session);
    closeCashSession.mockResolvedValue({ ...session, status: 'CLOSED' });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Clôturer la caisse/ }));

    await user.clear(champ('caisse-billet-10000'));
    await user.type(champ('caisse-billet-10000'), '3');
    await user.clear(champ('caisse-billet-500'));
    await user.type(champ('caisse-billet-500'), '2');

    await user.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => expect(closeCashSession).toHaveBeenCalled());
    expect(closeCashSession).toHaveBeenCalledWith('agence-1', 'sess-1', {
      denominations: { '10000': 3, '500': 2 },
      differenceReason: undefined
    });
  });

  it('clôture la caisse avec un écart expliqué par un motif', async () => {
    const session = sessionAttendu31000();
    getCurrentCashSession.mockResolvedValue(session);
    closeCashSession.mockResolvedValue({ ...session, status: 'CLOSED' });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Clôturer la caisse/ }));

    await user.clear(champ('caisse-billet-10000'));
    await user.type(champ('caisse-billet-10000'), '3');
    await user.type(screen.getByLabelText("Motif de l'écart"), 'Erreur de rendu monnaie');

    await user.click(screen.getByRole('button', { name: 'Clôturer' }));

    await waitFor(() => expect(closeCashSession).toHaveBeenCalled());
    expect(closeCashSession).toHaveBeenCalledWith('agence-1', 'sess-1', {
      denominations: { '10000': 3 },
      differenceReason: 'Erreur de rendu monnaie'
    });
  });

  it('affiche le message 400 renvoyé par l’API tel quel', async () => {
    const session = sessionAttendu31000();
    getCurrentCashSession.mockResolvedValue(session);
    closeCashSession.mockRejectedValue({
      response: { status: 400, data: { message: "Expliquez l'écart de caisse (1 000 FCFA)." } }
    });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Clôturer la caisse/ }));

    await user.clear(champ('caisse-billet-10000'));
    await user.type(champ('caisse-billet-10000'), '3');
    await user.type(screen.getByLabelText("Motif de l'écart"), 'Erreur de rendu monnaie');
    await user.click(screen.getByRole('button', { name: 'Clôturer' }));

    expect(
      await screen.findByText("Expliquez l'écart de caisse (1 000 FCFA).", {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('remplace le billetage par un montant unique quand « sans billetage » est activé', async () => {
    getCurrentCashSession.mockResolvedValue(sessionAttendu31000());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText(/CAI-2026-0001/, {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Clôturer la caisse/ }));

    // Le libellé n'est pas cliquable : c'est l'interrupteur lui-même qui bascule le mode.
    await user.click(screen.getByRole('switch'));

    const champMontant = screen.getByLabelText('Montant compté');
    await user.clear(champMontant);
    await user.type(champMontant, '31000');

    expect(screen.getByText('Aucun écart')).toBeInTheDocument();
    // Le billetage a disparu : ses compteurs ne sont plus dans le document.
    expect(document.getElementById('caisse-billet-10000')).not.toBeInTheDocument();
  });
});

describe('Caisse — historique et validation', () => {
  it('valide une session clôturée avec un commentaire facultatif', async () => {
    const closed = sessionAttendu31000({
      status: 'CLOSED',
      closedAt: '2026-09-23T18:00:00.000Z',
      countedAmount: 31_000,
      difference: 0
    });
    listCashSessions.mockResolvedValue([closed]);
    getCashSession.mockResolvedValue(closed);
    validateCashSession.mockResolvedValue({ ...closed, status: 'VALIDATED', validatedByName: 'Responsable X' });

    const user = userEvent.setup({ delay: null });
    mount();

    await user.click(screen.getByRole('tab', { name: 'Historique' }));
    await screen.findByText('CAI-2026-0001', {}, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: 'Voir le détail' }));
    await screen.findByRole('button', { name: /Valider/ }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Valider/ }));

    await waitFor(() => expect(validateCashSession).toHaveBeenCalledWith('agence-1', 'sess-1', { comment: undefined }));
  });

  it('affiche un message clair quand le serveur refuse la validation faute de droit (403)', async () => {
    const closed = sessionAttendu31000({
      status: 'CLOSED',
      closedAt: '2026-09-23T18:00:00.000Z',
      countedAmount: 31_000,
      difference: 0
    });
    listCashSessions.mockResolvedValue([closed]);
    getCashSession.mockResolvedValue(closed);
    validateCashSession.mockRejectedValue({
      response: {
        status: 403,
        data: {
          message: "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
          requiredPermission: 'FINANCE_DOCUMENTS_VALIDATE'
        }
      }
    });

    const user = userEvent.setup({ delay: null });
    mount();

    await user.click(screen.getByRole('tab', { name: 'Historique' }));
    await screen.findByText('CAI-2026-0001', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Voir le détail' }));
    await screen.findByRole('button', { name: /Valider/ }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Valider/ }));

    expect(
      await screen.findByText("Vous n'avez pas le droit de valider une caisse.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  const sessionAValider = () =>
    sessionAttendu31000({
      status: 'CLOSED',
      closedAt: '2026-09-23T18:00:00.000Z',
      countedAmount: 31_000,
      difference: 0
    });

  async function ouvrirDetail() {
    const closed = sessionAValider();
    listCashSessions.mockResolvedValue([closed]);
    getCashSession.mockResolvedValue(closed);
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(screen.getByRole('tab', { name: 'Historique' }));
    await screen.findByText('CAI-2026-0001', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Voir le détail' }));
    await screen.findByText('Caissier :', {}, { timeout: 8000 });
  }

  it('ne propose pas « Valider » sans le droit de valider (Comptable)', async () => {
    permissionsDetenues = new Set(['FINANCE_DOCUMENTS_CREATE', 'FINANCE_ACCOUNTS_READ']);
    await ouvrirDetail();

    expect(screen.queryByRole('button', { name: /Valider/ })).not.toBeInTheDocument();
    expect(screen.getByText(/réservée aux responsables/)).toBeInTheDocument();
  });

  it('ne propose pas « Valider » au caissier de la session, même avec le droit', async () => {
    utilisateurId = 'user-1';
    await ouvrirDetail();

    expect(screen.queryByRole('button', { name: /Valider/ })).not.toBeInTheDocument();
    expect(screen.getByText(/un autre responsable doit la valider/)).toBeInTheDocument();
  });
});

describe('Caisse — rôle sans droit de tenir une caisse (Gestionnaire)', () => {
  it("s'ouvre sur l'historique, sans onglet « Ma caisse » ni appel à la caisse courante", async () => {
    permissionsDetenues = new Set(['FINANCE_ACCOUNTS_READ']);
    listCashSessions.mockResolvedValue([sessionOuverte({ status: 'CLOSED' })]);
    mount();

    expect(await screen.findByText('CAI-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Ma caisse' })).not.toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger votre caisse.')).not.toBeInTheDocument();
    expect(getCurrentCashSession).not.toHaveBeenCalled();
  });

  it("dit clairement que la caisse n'est pas accessible quand le serveur répond 403", async () => {
    getCurrentCashSession.mockRejectedValue({
      response: { status: 403, data: { requiredPermission: 'FINANCE_DOCUMENTS_CREATE' } }
    });
    mount();

    expect(
      await screen.findByText(/Vous n'avez pas le droit de tenir une caisse/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.queryByText('Impossible de charger votre caisse.')).not.toBeInTheDocument();
  });
});
