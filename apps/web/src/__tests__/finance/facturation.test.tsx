import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Facturation } from '../../pages/finance/Facturation';
import type { BillingRun } from '../../types/finance-types';

/**
 * Facturation — les garanties de l'écran « lancer la campagne » (récit B3,
 * PLAN §5.3 tâche 1.14).
 *
 * Modelé sur `__tests__/rental/installments.test.tsx` : mêmes délais
 * `findBy*` de 8 s pour tenir sous la charge parallèle de la suite complète,
 * même palier desktop forcé pour rendre `<ConfirmAction>` déterministe
 * (`Popconfirm`, pas le tiroir mobile).
 *
 * Le test le plus important n'est pas celui qui vérifie qu'une exclusion
 * s'affiche — c'est celui qui vérifie qu'une relance idempotente NE
 * s'affiche PAS comme un échec. C'est tout le point de conception de cet
 * écran (§ de tête de `Facturation.tsx`).
 */

const listBillingRuns = vi.fn();
const getBillingRun = vi.fn();
const runBilling = vi.fn();

vi.mock('../../services/finance-service', () => ({
  listBillingRuns: (...a: unknown[]) => listBillingRuns(...a),
  getBillingRun: (...a: unknown[]) => getBillingRun(...a),
  runBilling: (...a: unknown[]) => runBilling(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function run(overrides: Partial<BillingRun> = {}): BillingRun {
  return {
    id: 'run-1',
    periodYear: 2026,
    periodMonth: 9,
    label: 'Loyer de septembre 2026',
    status: 'DONE',
    startedAt: '2026-09-01T07:00:00.000Z',
    finishedAt: '2026-09-01T07:00:05.000Z',
    summary: {
      billed: [
        {
          leaseId: 'BAIL-2026-0001',
          leaseLabel: 'Fatoumata Kouassi — Villa Angré 12',
          installmentId: 'ech-1',
          amount: 1_250_000
        }
      ],
      excluded: [
        { leaseId: 'BAIL-2026-0002', leaseLabel: 'Ousmane Touré — Local Abobo 9', reason: 'LEASE_NOT_ACTIVE' }
      ],
      advancesApplied: [
        {
          tenantClientId: 'CLI-2026-0009',
          tenantLabel: 'Aïssatou Brou',
          installmentId: 'ech-1',
          amount: 100_000,
          sourcePaymentId: 'paiement-1'
        }
      ]
    },
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/finance/facturation') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/facturation" element={<Facturation />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const ANNEE_COURANTE = new Date().getFullYear();
const MOIS_COURANT = new Date().getMonth() + 1;

beforeEach(() => {
  vi.clearAllMocks();
  listBillingRuns.mockResolvedValue([]);
  getBillingRun.mockResolvedValue(run());
  runBilling.mockResolvedValue(run());
});

describe('Facturation — lancement d’une campagne', () => {
  it('lance la campagne pour la période par défaut, sans historique existant', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    const declencheur = await screen.findByRole('button', { name: /Lancer la campagne/ }, { timeout: 8000 });
    await user.click(declencheur);

    // Le bouton de confirmation du Popconfirm porte exactement l'okText,
    // distinct du texte du déclencheur (« Lancer la campagne »).
    const confirmer = await screen.findByRole('button', { name: 'Lancer' }, { timeout: 8000 });
    await user.click(confirmer);

    await waitFor(() => expect(runBilling).toHaveBeenCalledTimes(1));
    expect(runBilling.mock.calls[0][1]).toMatchObject({ periodYear: ANNEE_COURANTE, periodMonth: MOIS_COURANT });
  });

  it('affiche « Relancer » — jamais en bouton dangereux — quand la période a déjà une campagne', async () => {
    listBillingRuns.mockResolvedValue([run({ id: 'deja-la', periodYear: ANNEE_COURANTE, periodMonth: MOIS_COURANT })]);
    const user = userEvent.setup({ delay: null });
    mount();

    const declencheur = await screen.findByRole('button', { name: /Relancer la campagne/ }, { timeout: 8000 });
    // Le bouton n'est jamais présenté comme une action destructive : AntD
    // marque un bouton `danger` par la classe `ant-btn-dangerous`.
    expect(declencheur.className).not.toMatch(/dangerous/);

    await user.click(declencheur);
    const confirmer = await screen.findByRole('button', { name: 'Relancer' }, { timeout: 8000 });
    expect(confirmer.className).not.toMatch(/dangerous/);

    // La confirmation ne parle d'aucune irréversibilité : ce n'est pas le
    // vocabulaire d'une suppression.
    expect(screen.queryByText(/irréversible/i)).not.toBeInTheDocument();

    await user.click(confirmer);
    await waitFor(() => expect(runBilling).toHaveBeenCalledTimes(1));
  });

  it('affiche le compte rendu immédiatement après le lancement, sans second aller-retour', async () => {
    runBilling.mockResolvedValue(run({ id: 'tout-neuf', label: 'Loyer de septembre 2026' }));
    const user = userEvent.setup({ delay: null });
    mount();

    await user.click(await screen.findByRole('button', { name: /Lancer la campagne/ }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: 'Lancer' }, { timeout: 8000 }));

    expect(
      await screen.findByText('Compte rendu — Loyer de septembre 2026', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    // Le compte rendu vient du résultat déjà en main, pas d'un refetch.
    expect(getBillingRun).not.toHaveBeenCalled();
  });
});

describe('Facturation — le compte rendu', () => {
  it('rend les trois sections : baux facturés, exclus, avances imputées', async () => {
    getBillingRun.mockResolvedValue(run());
    mount('/tenant/agence-1/finance/facturation?campagne=run-1');

    expect(
      await screen.findByText('Compte rendu — Loyer de septembre 2026', {}, { timeout: 8000 })
    ).toBeInTheDocument();

    expect(screen.getByText('Baux facturés')).toBeInTheDocument();
    // Le compte rendu nomme le bail, il n'affiche pas son identifiant : une
    // gestionnaire qui lit « BAIL-2026-0001 » ne peut rien en faire. Les deux
    // assertions vont ensemble — la seconde est celle qui empêche une
    // regression silencieuse vers l'identifiant brut.
    expect(screen.getByText('Fatoumata Kouassi — Villa Angré 12')).toBeInTheDocument();
    expect(screen.queryByText('BAIL-2026-0001')).not.toBeInTheDocument();

    expect(screen.getByText('Baux exclus')).toBeInTheDocument();
    expect(screen.getByText('Ousmane Touré — Local Abobo 9')).toBeInTheDocument();
    expect(screen.queryByText('BAIL-2026-0002')).not.toBeInTheDocument();
    expect(screen.getByText("Le bail n'est pas actif")).toBeInTheDocument();

    expect(screen.getByText('Avances imputées')).toBeInTheDocument();
    expect(screen.getByText('Aïssatou Brou')).toBeInTheDocument();
    expect(screen.queryByText('CLI-2026-0009')).not.toBeInTheDocument();
  });

  it('affiche chacun des six motifs d’exclusion en français, jamais sous sa forme brute', async () => {
    getBillingRun.mockResolvedValue(
      run({
        id: 'six-motifs',
        summary: {
          billed: [],
          excluded: [
            { leaseId: 'B-1', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', reason: 'PERIOD_BEFORE_LEASE_START' },
            { leaseId: 'B-2', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', reason: 'PERIOD_AFTER_LEASE_END' },
            { leaseId: 'B-3', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', reason: 'PERIOD_OFF_BILLING_CYCLE' },
            { leaseId: 'B-4', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', reason: 'LEASE_NOT_ACTIVE' },
            { leaseId: 'B-5', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', reason: 'INSTALLMENT_ALREADY_EXISTS' },
            { leaseId: 'B-6', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', reason: 'LEASE_WITHOUT_AMOUNT' }
          ],
          advancesApplied: []
        }
      })
    );
    mount('/tenant/agence-1/finance/facturation?campagne=six-motifs');

    await screen.findByText('Baux exclus', {}, { timeout: 8000 });

    expect(screen.getByText('La période précède le début du bail')).toBeInTheDocument();
    expect(screen.getByText('La période suit la fin du bail')).toBeInTheDocument();
    expect(screen.getByText('Le bail ne se facture pas sur ce mois')).toBeInTheDocument();
    expect(screen.getByText("Le bail n'est pas actif")).toBeInTheDocument();
    expect(screen.getByText('Une échéance existe déjà pour cette période')).toBeInTheDocument();
    expect(screen.getByText('Le bail ne porte aucun montant')).toBeInTheDocument();

    // Aucun code brut du contrat (`finance-types.ts`) ne doit fuiter à l'écran.
    expect(screen.queryByText('PERIOD_BEFORE_LEASE_START')).not.toBeInTheDocument();
    expect(screen.queryByText('INSTALLMENT_ALREADY_EXISTS')).not.toBeInTheDocument();
  });

  it('montre l’exclusion pour échéance déjà existante sans la présenter comme un échec', async () => {
    getBillingRun.mockResolvedValue(
      run({
        id: 'relance-idempotente',
        status: 'DONE',
        summary: {
          billed: [],
          excluded: [
            {
              leaseId: 'BAIL-2026-0001',
              leaseLabel: 'Fatoumata Kouassi — Villa Angré 12',
              reason: 'INSTALLMENT_ALREADY_EXISTS'
            },
            {
              leaseId: 'BAIL-2026-0002',
              leaseLabel: 'Ousmane Touré — Local Abobo 9',
              reason: 'INSTALLMENT_ALREADY_EXISTS'
            }
          ],
          advancesApplied: []
        }
      })
    );
    mount('/tenant/agence-1/finance/facturation?campagne=relance-idempotente');

    expect(
      await screen.findAllByText('Une échéance existe déjà pour cette période', {}, { timeout: 8000 })
    ).toHaveLength(2);

    // Le statut de la campagne reste « Exécutée », pas « Échouée » : une
    // relance entièrement faite d'exclusions « déjà existante » est un
    // succès, pas une panne.
    expect(screen.getByText('Exécutée')).toBeInTheDocument();
    expect(screen.queryByText('Échouée')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/échec/i)).not.toBeInTheDocument();
  });

  it('dit qu’une campagne sans exclusion est une bonne campagne', async () => {
    getBillingRun.mockResolvedValue(
      run({
        id: 'sans-exclusion',
        summary: {
          billed: [
            { leaseId: 'B-1', leaseLabel: 'Fatoumata Kouassi — Villa Angré 12', installmentId: 'e-1', amount: 500_000 }
          ],
          excluded: [],
          advancesApplied: []
        }
      })
    );
    mount('/tenant/agence-1/finance/facturation?campagne=sans-exclusion');

    expect(
      await screen.findByText(
        "Aucun bail exclu : la campagne a facturé l'ensemble des baux éligibles.",
        {},
        { timeout: 8000 }
      )
    ).toBeInTheDocument();
  });
});

describe('Facturation — historique', () => {
  it('liste les campagnes passées et ouvre leur compte rendu au clic', async () => {
    listBillingRuns.mockResolvedValue([
      run({ id: 'run-recent', label: 'Loyer de septembre 2026', periodMonth: 9, periodYear: 2026 }),
      run({
        id: 'run-ancien',
        label: "Loyer d'août 2026",
        periodMonth: 8,
        periodYear: 2026,
        status: 'FAILED',
        summary: null
      })
    ]);
    getBillingRun.mockResolvedValue(run({ id: 'run-recent', label: 'Loyer de septembre 2026' }));

    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByText('Loyer de septembre 2026', {}, { timeout: 8000 });
    expect(screen.getByText("Loyer d'août 2026")).toBeInTheDocument();
    expect(screen.getByText('Échouée')).toBeInTheDocument();

    const lignes = screen.getAllByRole('button', { name: 'Voir le compte rendu' });
    await user.click(lignes[0]);

    await waitFor(() => expect(getBillingRun).toHaveBeenCalledWith('agence-1', 'run-recent'));
    expect(
      await screen.findByText('Compte rendu — Loyer de septembre 2026', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });
});

describe('Facturation — états de la liste', () => {
  it('affiche un état vide non alarmant quand aucune campagne n’a tourné', async () => {
    listBillingRuns.mockResolvedValue([]);
    mount();
    expect(
      await screen.findByText("Aucune campagne n'a encore été exécutée.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    listBillingRuns.mockRejectedValue(new Error('réseau coupé'));
    mount();
    expect(
      await screen.findByText("Impossible de charger l'historique des campagnes.", {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Facturation — vocabulaire (P-1 du PRD)', () => {
  it('ne montre jamais « débit » ni « crédit », casse et accents indifférents', async () => {
    listBillingRuns.mockResolvedValue([run()]);
    getBillingRun.mockResolvedValue(run());
    mount('/tenant/agence-1/finance/facturation?campagne=run-1');

    expect(await screen.findByText('Baux facturés', {}, { timeout: 8000 })).toBeInTheDocument();
    await screen.findByText('Avances imputées');

    const texte = document.body.textContent ?? '';
    const normalise = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    expect(normalise).not.toMatch(/\bdebit/);
    expect(normalise).not.toMatch(/\bcredit/);
  });
});
