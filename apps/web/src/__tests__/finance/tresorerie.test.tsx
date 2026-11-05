import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tresorerie } from '../../pages/finance/Tresorerie';
import type { TreasuryAccountDto, TreasuryTransferDto, TaxRemittanceDto } from '../../services/treasury-service';

/**
 * Trésorerie — Lot 10, conformité SYSCOHADA (`LOT10-CONTRAT.md`, section
 * « Trésorerie (agent B) »).
 *
 * Suit le modèle de `__tests__/finance/caisse.test.tsx` : un
 * `<QueryClientProvider>` avec `retry: false`, un `<MemoryRouter>` posé sur la
 * route paramétrée. Le mock de `services/treasury-service` couvre TOUTES les
 * fonctions que l'écran utilise : Vitest refuse tout import qu'un `vi.mock`
 * ne déclare pas explicitement, là où Jest renvoyait `undefined` en silence
 * (AGENTS.md).
 */

const listTreasuryAccounts = vi.fn();
const createTreasuryAccount = vi.fn();
const updateTreasuryAccount = vi.fn();
const listTreasuryTransfers = vi.fn();
const createTreasuryTransfer = vi.fn();
const voidTreasuryTransfer = vi.fn();
const getWithholdingSummary = vi.fn();
const listTaxRemittances = vi.fn();
const createTaxRemittance = vi.fn();
const voidTaxRemittance = vi.fn();

vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: (...a: unknown[]) => listTreasuryAccounts(...a),
  createTreasuryAccount: (...a: unknown[]) => createTreasuryAccount(...a),
  updateTreasuryAccount: (...a: unknown[]) => updateTreasuryAccount(...a),
  listTreasuryTransfers: (...a: unknown[]) => listTreasuryTransfers(...a),
  createTreasuryTransfer: (...a: unknown[]) => createTreasuryTransfer(...a),
  voidTreasuryTransfer: (...a: unknown[]) => voidTreasuryTransfer(...a),
  getWithholdingSummary: (...a: unknown[]) => getWithholdingSummary(...a),
  listTaxRemittances: (...a: unknown[]) => listTaxRemittances(...a),
  createTaxRemittance: (...a: unknown[]) => createTaxRemittance(...a),
  voidTaxRemittance: (...a: unknown[]) => voidTaxRemittance(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function compteCaisse(overrides: Partial<TreasuryAccountDto> = {}): TreasuryAccountDto {
  return {
    id: 'compte-caisse-1',
    kind: 'CASH',
    label: 'Caisse agence Cocody',
    accountNumber: '5711',
    mmOperator: null,
    bankName: null,
    bankAccountRef: null,
    isDefault: true,
    isActive: true,
    balance: 250_000,
    ...overrides
  };
}

function compteBanque(overrides: Partial<TreasuryAccountDto> = {}): TreasuryAccountDto {
  return {
    id: 'compte-banque-1',
    kind: 'BANK',
    label: 'Ecobank agence',
    accountNumber: '5211',
    mmOperator: null,
    bankName: 'Ecobank',
    bankAccountRef: 'CI0123456789',
    isDefault: true,
    isActive: true,
    balance: 1_500_000,
    ...overrides
  };
}

function virement(overrides: Partial<TreasuryTransferDto> = {}): TreasuryTransferDto {
  return {
    id: 'vir-1',
    number: 'VIR-2026-0001',
    fromTreasuryAccountId: 'compte-caisse-1',
    fromLabel: 'Caisse agence Cocody',
    toTreasuryAccountId: 'compte-banque-1',
    toLabel: 'Ecobank agence',
    amount: 100_000,
    transferredAt: '2026-09-20',
    reference: null,
    notes: null,
    status: 'VALIDATED',
    voidReason: null,
    voidedAt: null,
    createdByName: 'Awa Koné',
    ...overrides
  };
}

function versementDgi(overrides: Partial<TaxRemittanceDto> = {}): TaxRemittanceDto {
  return {
    id: 'dgi-1',
    number: 'DGI-2026-0001',
    amount: 60_000,
    paidAt: '2026-09-15',
    periodLabel: 'Août 2026',
    treasuryAccountId: 'compte-banque-1',
    treasuryLabel: 'Ecobank agence',
    reference: null,
    status: 'VALIDATED',
    voidReason: null,
    voidedAt: null,
    createdByName: 'Awa Koné',
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/finance/tresorerie') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/tresorerie" element={<Tresorerie />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listTreasuryAccounts.mockResolvedValue([compteCaisse(), compteBanque()]);
  listTreasuryTransfers.mockResolvedValue([]);
  listTaxRemittances.mockResolvedValue([]);
  getWithholdingSummary.mockResolvedValue({ enabled: true, accountNumber: '4478', collected: 0, remitted: 0, due: 0 });
});

describe('Trésorerie — onglet Comptes', () => {
  it('affiche la liste des comptes de trésorerie', async () => {
    mount();

    expect(await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Ecobank agence')).toBeInTheDocument();
    expect(screen.getByText('5711')).toBeInTheDocument();
    expect(screen.getByText('5211')).toBeInTheDocument();
  });

  it('crée un compte de trésorerie', async () => {
    listTreasuryAccounts.mockResolvedValue([compteCaisse()]);
    createTreasuryAccount.mockResolvedValue(compteBanque());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Nouveau compte/ }));

    await user.click(within(screen.getByRole('dialog')).getByLabelText('Nature'));
    await user.click(await screen.findByText('Mobile Money'));

    await user.type(screen.getByLabelText('Libellé'), 'Wave agence');
    await user.type(screen.getByLabelText('Numéro de compte'), '5521');
    // Une liste de l'opérateur, aux libellés français : la saisie libre était
    // refusée en 400 par l'API (« Orange » ne passait pas, seul « ORANGE »).
    await user.click(screen.getByLabelText('Opérateur Mobile Money'));
    await user.click(await screen.findByText('Wave'));

    await user.click(screen.getByRole('button', { name: 'Créer' }));

    await waitFor(() => expect(createTreasuryAccount).toHaveBeenCalled());
    expect(createTreasuryAccount).toHaveBeenCalledWith('agence-1', {
      kind: 'MOBILE_MONEY',
      label: 'Wave agence',
      accountNumber: '5521',
      mmOperator: 'WAVE',
      bankName: undefined,
      bankAccountRef: undefined,
      isDefault: undefined
    });
  }, 90000);
});

describe('Trésorerie — onglet Virements internes', () => {
  it('crée un virement interne entre deux comptes', async () => {
    createTreasuryTransfer.mockResolvedValue(virement());
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Virements internes' }));
    await screen.findByText('Aucun virement interne.', {}, { timeout: 8000 });

    await user.click(screen.getAllByRole('button', { name: /Nouveau virement/ })[0]);

    await user.click(screen.getByLabelText('Compte de départ'));
    await user.click(await screen.findByText('Caisse agence Cocody (5711)'));
    await user.click(screen.getByLabelText("Compte d'arrivée"));
    await user.click((await screen.findAllByText('Ecobank agence (5211)')).at(-1) as HTMLElement);

    await user.type(screen.getByLabelText('Montant (FCFA)'), '100000');

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(createTreasuryTransfer).toHaveBeenCalled());
    const appel = createTreasuryTransfer.mock.calls[0];
    expect(appel[0]).toBe('agence-1');
    expect(appel[1]).toMatchObject({
      fromTreasuryAccountId: 'compte-caisse-1',
      toTreasuryAccountId: 'compte-banque-1',
      amount: 100_000
    });
  }, 90000);

  it('annule un virement avec un motif obligatoire', async () => {
    listTreasuryTransfers.mockResolvedValue([virement()]);
    voidTreasuryTransfer.mockResolvedValue({ ...virement(), status: 'VOIDED' });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Virements internes' }));
    await screen.findByText('VIR-2026-0001', {}, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Annuler le virement' }));
    // Aucun motif saisi : l'annulation ne part pas.
    expect(voidTreasuryTransfer).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Motif de l'annulation"), 'Erreur de saisie du montant');
    await user.click(screen.getByRole('button', { name: 'Annuler le virement' }));

    await waitFor(() =>
      expect(voidTreasuryTransfer).toHaveBeenCalledWith('agence-1', 'vir-1', { reason: 'Erreur de saisie du montant' })
    );
  }, 90000);
});

describe('Trésorerie — onglet Retenues à la source', () => {
  it('affiche le résumé et la liste des versements quand la retenue est activée', async () => {
    getWithholdingSummary.mockResolvedValue({
      enabled: true,
      accountNumber: '4478',
      collected: 120_000,
      remitted: 60_000,
      due: 60_000
    });
    listTaxRemittances.mockResolvedValue([versementDgi()]);
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Retenues à la source' }));

    expect(await screen.findByText('DGI-2026-0001', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nouveau versement/ })).toBeInTheDocument();
  });

  it('affiche un message clair quand la retenue est désactivée, sans formulaire de création', async () => {
    getWithholdingSummary.mockResolvedValue({
      enabled: false,
      accountNumber: '4478',
      collected: 0,
      remitted: 0,
      due: 0
    });
    listTaxRemittances.mockResolvedValue([versementDgi()]);
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Retenues à la source' }));

    expect(
      await screen.findByText(
        "La retenue à la source est désactivée dans les paramètres financiers de l'agence. Aucun nouveau versement ne peut être enregistré tant qu'elle n'est pas réactivée.",
        {},
        { timeout: 8000 }
      )
    ).toBeInTheDocument();
    // Le résumé et l'historique restent visibles.
    expect(screen.getByText('DGI-2026-0001')).toBeInTheDocument();
    // Mais aucun bouton de création n'est proposé.
    expect(screen.queryByRole('button', { name: /Nouveau versement/ })).not.toBeInTheDocument();
  });
});

describe('Trésorerie — recherche multicritères', () => {
  it('filtre les comptes par texte (liste locale) : lignes et compteur', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    expect(screen.getByText('2 résultats')).toBeInTheDocument();

    const barre = screen.getByRole('search', { name: 'Rechercher dans les comptes de trésorerie' });
    await user.type(within(barre).getByRole('textbox'), 'CI0123');

    await waitFor(() => expect(screen.queryByText('Caisse agence Cocody')).not.toBeInTheDocument(), {
      timeout: 8000
    });
    expect(screen.getByText('Ecobank agence')).toBeInTheDocument();
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
  });

  it('envoie le statut, la période et le compte des virements au serveur, dans l’appel du service', async () => {
    const user = userEvent.setup({ delay: null });
    mount(
      '/tenant/agence-1/finance/tresorerie?vir.status=VOIDED&vir.dateFrom=2026-09-01&vir.dateTo=2026-09-30&vir.compte=compte-banque-1&vir.q=chèque'
    );

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Virements internes' }));

    await waitFor(() => expect(listTreasuryTransfers).toHaveBeenCalled(), { timeout: 8000 });
    expect(listTreasuryTransfers).toHaveBeenLastCalledWith('agence-1', {
      search: 'chèque',
      status: 'VOIDED',
      from: '2026-09-01',
      to: '2026-09-30',
      accountId: 'compte-banque-1',
      page: 1,
      limit: 20
    });
  });

  it('envoie le montant minimal des virements au serveur', async () => {
    listTreasuryTransfers.mockResolvedValue({
      items: [virement({ id: 'v-gros', number: 'VIR-2026-0002', amount: 500_000 })],
      total: 1,
      page: 1,
      pageSize: 20
    });
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/finance/tresorerie?vir.montantMin=100000');

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Virements internes' }));

    expect(await screen.findByText('VIR-2026-0002', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('VIR-2026-0001')).not.toBeInTheDocument();
    expect(listTreasuryTransfers).toHaveBeenLastCalledWith('agence-1', { minAmount: 100000, page: 1, limit: 20 });
  });

  it('envoie le statut et le compte des versements au serveur', async () => {
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/finance/tresorerie?ret.status=VALIDATED&ret.compte=compte-banque-1');

    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Retenues à la source' }));

    await waitFor(() => expect(listTaxRemittances).toHaveBeenCalled(), { timeout: 8000 });
    expect(listTaxRemittances).toHaveBeenLastCalledWith('agence-1', {
      status: 'VALIDATED',
      treasuryAccountId: 'compte-banque-1',
      page: 1,
      limit: 20
    });
  });

  it('ouvre la page 26 d’un historique au-delà de 500 virements', async () => {
    listTreasuryTransfers.mockResolvedValue({
      items: [virement({ id: 'v-501', number: 'VIR-501' })],
      total: 501,
      page: 26,
      pageSize: 20
    });
    const user = userEvent.setup({ delay: null });
    mount('/tenant/agence-1/finance/tresorerie?vir.page=26');
    await screen.findByText('Caisse agence Cocody', {}, { timeout: 8000 });
    await user.click(screen.getByRole('tab', { name: 'Virements internes' }));
    expect(await screen.findByText('VIR-501', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(listTreasuryTransfers).toHaveBeenLastCalledWith('agence-1', { page: 26, limit: 20 });
  }, 30000);
});
