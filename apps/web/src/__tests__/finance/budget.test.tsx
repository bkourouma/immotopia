import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BudgetChantier } from '../../pages/finance/BudgetChantier';
import type { BudgetAmendment, SiteBudget, SiteEngagement } from '../../types/finance-lot3-types';
import type { ConstructionSite, CostCategory } from '../../types/finance-lot2-types';

/**
 * Budget de chantier — les garanties de `pages/finance/BudgetChantier.tsx`
 * (lot 3, specs/018-finance-budget-pilotage/data-model.md §5).
 *
 * Modèle exact de `__tests__/finance/chantiers.test.tsx` : `useBreakpoint`
 * figé en desktop pour un `<ConfirmAction>` déterministe (`Popconfirm`), un
 * mock de `finance-lot3-service` ET `finance-lot2-service` qui couvre CHAQUE
 * export utilisé par l'écran — Vitest refuse en silence un import non
 * déclaré (AGENTS.md) — et des délais `findBy*` de 8 s pour la charge
 * parallèle de la suite complète.
 */

const getSiteBudget = vi.fn();
const createSiteBudget = vi.fn();
const validateSiteBudget = vi.fn();
const listBudgetAmendments = vi.fn();
const createBudgetAmendment = vi.fn();
const validateBudgetAmendment = vi.fn();
const getSiteEngagement = vi.fn();

vi.mock('../../services/finance-lot3-service', () => ({
  getSiteBudget: (...a: unknown[]) => getSiteBudget(...a),
  createSiteBudget: (...a: unknown[]) => createSiteBudget(...a),
  validateSiteBudget: (...a: unknown[]) => validateSiteBudget(...a),
  listBudgetAmendments: (...a: unknown[]) => listBudgetAmendments(...a),
  createBudgetAmendment: (...a: unknown[]) => createBudgetAmendment(...a),
  validateBudgetAmendment: (...a: unknown[]) => validateBudgetAmendment(...a),
  getSiteEngagement: (...a: unknown[]) => getSiteEngagement(...a)
}));

const listConstructionSites = vi.fn();
const listCostCategories = vi.fn();

vi.mock('../../services/finance-lot2-service', () => ({
  listConstructionSites: (...a: unknown[]) => listConstructionSites(...a),
  listCostCategories: (...a: unknown[]) => listCostCategories(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function chantier(overrides: Partial<ConstructionSite> = {}): ConstructionSite {
  return {
    id: 'chantier-1',
    name: 'Villa duplex — Angré Centre',
    zone: 'Angré, Cocody',
    propertyId: 'bien-1',
    propertyLabel: 'Villa duplex — Angré Centre (en construction)',
    managerLabel: 'Mamadou Konan',
    // Aucun bail de terrain par defaut : c'est le cas courant.
    landLeaseId: null,
    status: 'IN_PROGRESS',
    startDate: '2026-04-01',
    plannedEndDate: '2026-11-30',
    progressPercent: 70,
    closedAt: null,
    finalCost: null,
    actualCost: 4_450_000,
    currency: 'XOF',
    stockEnabledAt: null,
    ...overrides
  };
}

function poste(overrides: Partial<CostCategory> = {}): CostCategory {
  return { id: 'poste-gros-oeuvre', label: 'Gros œuvre', position: 1, isActive: true, ...overrides };
}

function budget(overrides: Partial<SiteBudget> = {}): SiteBudget {
  return {
    id: 'budget-1',
    siteId: 'chantier-1',
    label: 'Budget initial 2026',
    status: 'VALIDATED',
    validatedAt: '2026-04-05T09:00:00.000Z',
    validatedByLabel: 'Mamadou Konan',
    currency: 'XOF',
    lines: [
      {
        id: 'ligne-1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        label: 'Fondations et murs',
        amountForecast: 8_000_000
      },
      {
        id: 'ligne-2',
        costCategoryId: 'poste-toiture',
        costCategoryLabel: 'Toiture',
        label: 'Charpente',
        amountForecast: 5_000_000
      }
    ],
    // Délibérément DIFFÉRENT de la somme des lignes ci-dessus (13 000 000) :
    // si l'écran additionnait les lignes lui-même plutôt que d'afficher ce
    // champ tel quel, ce test le verrait immédiatement.
    totalForecast: 25_500_000,
    // Par defaut, aucun avenant valide : le revise vaut l'initial. Les tests
    // qui en ont besoin le surchargent.
    revisedTotal: 25_500_000,
    ...overrides
  };
}

function avenant(overrides: Partial<BudgetAmendment> = {}): BudgetAmendment {
  return {
    id: 'avenant-1',
    budgetId: 'budget-1',
    amendmentDate: '2026-06-01',
    reason: 'Renchérissement du ciment',
    status: 'DRAFT',
    createdByLabel: 'Ibrahima Yao',
    validatedAt: null,
    lines: [
      {
        id: 'avenant-1-l1',
        costCategoryId: 'poste-gros-oeuvre',
        costCategoryLabel: 'Gros œuvre',
        amountDelta: 1_200_000
      }
    ],
    totalDelta: 1_200_000,
    ...overrides
  };
}

function engagement(overrides: Partial<SiteEngagement> = {}): SiteEngagement {
  return {
    siteId: 'chantier-1',
    actualCost: 19_500_000,
    openCommitments: 2_100_000,
    engagedAmount: 21_600_000,
    currency: 'XOF',
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Choisit une option de menu déroulant par son libellé.
 *
 * Une fois le budget affiché, ses lignes montrent déjà le même libellé de
 * poste (« Gros œuvre ») que celui qu'on choisit ensuite dans l'éditeur
 * d'avenant : `findByText` seul y verrait alors plusieurs éléments. Seule
 * l'option de la liste déroulante porte la classe `ant-select-item` d'AntD.
 */
async function optionParLibelle(libelle: string): Promise<HTMLElement> {
  return waitFor(() => {
    const candidat = screen.getAllByText(libelle).find(el => el.closest('.ant-select-item'));
    if (!candidat) throw new Error(`Option de menu déroulant introuvable : « ${libelle} »`);
    return candidat;
  });
}

function mountBudget(url = '/tenant/agence-1/finance/chantiers/chantier-1/budget') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId/budget" element={<BudgetChantier />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listConstructionSites.mockResolvedValue([chantier()]);
  listCostCategories.mockResolvedValue([
    poste(),
    poste({ id: 'poste-toiture', label: 'Toiture', position: 2 }),
    poste({ id: 'poste-divers', label: 'Divers', position: 7 })
  ]);
  getSiteEngagement.mockResolvedValue(engagement());
  listBudgetAmendments.mockResolvedValue([]);
});

describe('Budget — affichage sans aucun recalcul côté écran', () => {
  it('affiche le total du budget tel que le serveur le rend, jamais une somme des lignes', async () => {
    getSiteBudget.mockResolvedValue(budget());
    mountBudget();

    expect(await screen.findByRole('heading', { name: 'Budget initial 2026' }, { timeout: 8000 })).toBeInTheDocument();
    // Le total du serveur (25 500 000), jamais la somme des deux lignes (13 000 000).
    //
    // Il paraît DEUX fois depuis le 20 septembre 2026 : sur la carte « Budget
    // initial » et sur la carte « Budget révisé », qui lui est égale tant
    // qu'aucun avenant n'est validé. Les deux viennent du serveur, aucune
    // n'est recomposée à l'écran.
    expect(screen.getAllByText(/25\s500\s000/)).toHaveLength(2);
    expect(screen.queryByText(/13\s000\s000/)).not.toBeInTheDocument();
  });

  it('affiche un libellé de poste pour chaque ligne, jamais son identifiant', async () => {
    getSiteBudget.mockResolvedValue(budget());
    mountBudget();

    await screen.findByRole('heading', { name: 'Budget initial 2026' }, { timeout: 8000 });
    expect(screen.getByText('Gros œuvre')).toBeInTheDocument();
    expect(screen.getByText('Toiture')).toBeInTheDocument();
    expect(screen.queryByText('poste-gros-oeuvre')).not.toBeInTheDocument();
  });

  it('affiche qui a validé le budget, à côté de la date de validation', async () => {
    getSiteBudget.mockResolvedValue(budget());
    mountBudget();

    await screen.findByRole('heading', { name: 'Budget initial 2026' }, { timeout: 8000 });
    expect(screen.getByText(/Validé par Mamadou Konan/)).toBeInTheDocument();
  });

  it('affiche l’engagé et le réalisé du serveur, sans les recalculer', async () => {
    getSiteBudget.mockResolvedValue(budget());
    mountBudget();

    await screen.findByRole('heading', { name: 'Budget initial 2026' }, { timeout: 8000 });
    expect(screen.getByText(/21\s600\s000/)).toBeInTheDocument();
    expect(screen.getByText(/19\s500\s000/)).toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getSiteBudget.mockRejectedValue(new Error('panne'));
    mountBudget();

    expect(
      await screen.findByText('Impossible de charger le budget de ce chantier.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Budget — création, quand le chantier n’en a encore aucun', () => {
  it('propose un formulaire de création et envoie les lignes composées', async () => {
    getSiteBudget.mockResolvedValue(null);
    createSiteBudget.mockResolvedValue(budget());
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByText("Aucun budget n'est encore posé pour ce chantier", {}, { timeout: 8000 });

    await user.type(screen.getByLabelText('Nom du budget'), 'Budget initial 2026');

    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    await user.click(comboboxes[0]);
    await user.click(await screen.findByText('Gros œuvre'));
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Fondations et murs');
    await user.type(screen.getByLabelText('Montant prévu'), '8000000');

    await user.click(screen.getByRole('button', { name: 'Créer le budget' }));

    await waitFor(() => expect(createSiteBudget).toHaveBeenCalledTimes(1));
    expect(createSiteBudget.mock.calls[0][1]).toMatchObject({
      siteId: 'chantier-1',
      label: 'Budget initial 2026',
      lines: [{ costCategoryId: 'poste-gros-oeuvre', label: 'Fondations et murs', amountForecast: 8_000_000 }]
    });
  }, 30000);
});

describe('Budget et avenant — quantité et prix unitaire', () => {
  it('calcule le montant prévu d’une ligne de budget, et transmet les trois valeurs', async () => {
    getSiteBudget.mockResolvedValue(null);
    createSiteBudget.mockResolvedValue(budget());
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByText("Aucun budget n'est encore posé pour ce chantier", {}, { timeout: 8000 });

    await user.type(screen.getByLabelText('Nom du budget'), 'Budget initial 2026');
    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    await user.click(comboboxes[0]);
    await user.click(await optionParLibelle('Gros œuvre'));
    await user.type(screen.getByLabelText('Libellé de la ligne'), 'Ciment CPJ 45');
    await user.type(screen.getByLabelText('Quantité'), '100');
    await user.type(screen.getByLabelText('Prix unitaire'), '80000');

    // 100 × 80 000 = 8 000 000, et le montant prévu passe en lecture seule.
    const champMontant = screen.getByLabelText('Montant prévu');
    await waitFor(() => expect(champMontant).toBeDisabled());
    // Le champ regroupe les milliers pendant la frappe (espace insécable
    // étroite, comme `<MoneyValue>`) : 8000000 s'affiche « 8 000 000 ».
    await waitFor(() => expect(champMontant).toHaveValue('8 000 000'));

    await user.click(screen.getByRole('button', { name: 'Créer le budget' }));

    await waitFor(() => expect(createSiteBudget).toHaveBeenCalledTimes(1));
    expect(createSiteBudget.mock.calls[0][1]).toMatchObject({
      lines: [
        {
          costCategoryId: 'poste-gros-oeuvre',
          label: 'Ciment CPJ 45',
          amountForecast: 8_000_000,
          quantity: 100,
          unitPrice: 80_000
        }
      ]
    });
  }, 30000);

  it('laisse le montant prévu saisissable sans quantité ni prix unitaire', async () => {
    getSiteBudget.mockResolvedValue(null);
    mountBudget();

    await screen.findByText("Aucun budget n'est encore posé pour ce chantier", {}, { timeout: 8000 });
    // Le cas d'une enveloppe forfaitaire : rien à multiplier.
    expect(screen.getByLabelText('Montant prévu')).not.toBeDisabled();
  }, 30000);

  it('accepte un prix unitaire négatif sur un avenant, la quantité restant positive', async () => {
    getSiteBudget.mockResolvedValue(budget());
    listBudgetAmendments.mockResolvedValue([]);
    createBudgetAmendment.mockResolvedValue(avenant());
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByText('Nouvel avenant', {}, { timeout: 8000 });

    await user.type(screen.getByLabelText('Motif'), 'Reprise de deux tonnes non livrées');
    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    await user.click(comboboxes[0]);
    await user.click(await optionParLibelle('Gros œuvre'));
    await user.type(screen.getByLabelText('Quantité'), '2');
    await user.type(screen.getByLabelText('Prix unitaire'), '-95000');

    // 2 × (−95 000) = −190 000 : l'écart est négatif sans qu'aucune quantité
    // ne l'ait été. C'est la décision prise pour l'avenant.
    const champEcart = screen.getByLabelText('Écart');
    await waitFor(() => expect(champEcart).toBeDisabled());
    // Le champ regroupe les milliers pendant la frappe, signe compris :
    // -190000 s'affiche « -190 000 ».
    await waitFor(() => expect(champEcart).toHaveValue('-190 000'));

    await waitFor(() => expect(screen.getByRole('button', { name: "Enregistrer l'avenant" })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: "Enregistrer l'avenant" }));

    await waitFor(() => expect(createBudgetAmendment).toHaveBeenCalledTimes(1));
    expect(createBudgetAmendment.mock.calls[0][1]).toMatchObject({
      lines: [{ costCategoryId: 'poste-gros-oeuvre', amountDelta: -190_000, quantity: 2, unitPrice: -95_000 }]
    });
  }, 30000);

  it('affiche la quantité et le prix unitaire des lignes du budget quand elles en portent', async () => {
    getSiteBudget.mockResolvedValue(
      budget({
        lines: [
          {
            id: 'ligne-1',
            costCategoryId: 'poste-gros-oeuvre',
            costCategoryLabel: 'Gros œuvre',
            label: 'Fondations et murs',
            amountForecast: 8_000_000,
            quantity: 100,
            unitPrice: 80_000
          }
        ]
      })
    );
    mountBudget();

    await screen.findByText('Lignes du budget', {}, { timeout: 8000 });
    expect(screen.getByRole('columnheader', { name: 'Quantité' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Prix unitaire' })).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText(/80\s000/)).toBeInTheDocument();
  }, 30000);
});

describe('Budget — validation, irréversible et dite avant', () => {
  it('avertit avant de valider, puis appelle le service seulement après confirmation', async () => {
    getSiteBudget.mockResolvedValue(budget({ status: 'DRAFT', validatedAt: null, validatedByLabel: null }));
    validateSiteBudget.mockResolvedValue(budget());
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByRole('button', { name: 'Valider le budget' }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Valider le budget' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(validateSiteBudget).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(validateSiteBudget).toHaveBeenCalledWith('agence-1', 'budget-1'));
  });
});

describe('Avenants', () => {
  it('affiche le motif, l’auteur et l’écart signé de chaque avenant', async () => {
    getSiteBudget.mockResolvedValue(budget());
    listBudgetAmendments.mockResolvedValue([avenant()]);
    mountBudget();

    expect(await screen.findByText('Renchérissement du ciment', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Ibrahima Yao')).toBeInTheDocument();
    expect(screen.getByText(/1\s200\s000/)).toBeInTheDocument();
  });

  it('exige un motif et au moins une ligne pour enregistrer un avenant', async () => {
    getSiteBudget.mockResolvedValue(budget());
    listBudgetAmendments.mockResolvedValue([]);
    createBudgetAmendment.mockResolvedValue(avenant());
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByText('Nouvel avenant', {}, { timeout: 8000 });
    expect(screen.getByRole('button', { name: "Enregistrer l'avenant" })).toBeDisabled();

    await user.type(screen.getByLabelText('Motif'), 'Renchérissement du ciment');
    const comboboxes = await screen.findAllByRole('combobox', {}, { timeout: 8000 });
    // Le premier menu déroulant est celui de la ligne d'avenant (aucun autre
    // combobox ne précède, le budget étant déjà validé et sans éditeur de
    // lignes propre).
    await user.click(comboboxes[0]);
    await user.click(await optionParLibelle('Gros œuvre'));
    await user.type(screen.getByLabelText('Écart'), '1200000');

    await waitFor(() => expect(screen.getByRole('button', { name: "Enregistrer l'avenant" })).not.toBeDisabled());

    await user.click(screen.getByRole('button', { name: "Enregistrer l'avenant" }));

    await waitFor(() => expect(createBudgetAmendment).toHaveBeenCalledTimes(1));
    expect(createBudgetAmendment.mock.calls[0][1]).toMatchObject({
      budgetId: 'budget-1',
      reason: 'Renchérissement du ciment',
      lines: [{ costCategoryId: 'poste-gros-oeuvre', amountDelta: 1_200_000 }]
    });
  }, 30000);

  it('avertit avant de valider un avenant, puis appelle le service seulement après confirmation', async () => {
    getSiteBudget.mockResolvedValue(budget());
    listBudgetAmendments.mockResolvedValue([avenant()]);
    validateBudgetAmendment.mockResolvedValue(
      avenant({ status: 'VALIDATED', validatedAt: '2026-06-02T00:00:00.000Z' })
    );
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByText('Renchérissement du ciment', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(validateBudgetAmendment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(validateBudgetAmendment).toHaveBeenCalledWith('agence-1', 'avenant-1'));
  });

  // BUG-2026-09-29-026 : le budget révisé n'était mis à jour qu'au rechargement.
  it('rafraîchit le budget révisé et l’engagé dès que l’avenant est validé', async () => {
    getSiteBudget.mockResolvedValueOnce(budget()).mockResolvedValue(budget({ revisedTotal: 26_700_000 }));
    listBudgetAmendments.mockResolvedValue([avenant()]);
    validateBudgetAmendment.mockResolvedValue(
      avenant({ status: 'VALIDATED', validatedAt: '2026-06-02T00:00:00.000Z' })
    );
    const user = userEvent.setup({ delay: null });
    mountBudget();

    await screen.findByText('Renchérissement du ciment', {}, { timeout: 8000 });
    expect(screen.queryByText(/26\s700\s000/)).not.toBeInTheDocument();
    const appelsBudget = getSiteBudget.mock.calls.length;
    const appelsEngage = getSiteEngagement.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() => expect(getSiteBudget.mock.calls.length).toBeGreaterThan(appelsBudget));
    await waitFor(() => expect(getSiteEngagement.mock.calls.length).toBeGreaterThan(appelsEngage));
    expect(await screen.findByText(/26\s700\s000/, {}, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('n’affiche jamais « débit » ni « crédit »', async () => {
    getSiteBudget.mockResolvedValue(budget());
    listBudgetAmendments.mockResolvedValue([avenant()]);
    mountBudget();

    await screen.findByRole('heading', { name: 'Budget initial 2026' }, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });
});
