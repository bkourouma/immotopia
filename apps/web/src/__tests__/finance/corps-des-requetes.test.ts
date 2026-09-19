/**
 * Ce que les services financiers ENVOIENT réellement sur le fil.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce fichier existe
 * ---------------------------------------------------------------------------
 *
 * Le 19 septembre 2026, en transcrivant le contrat du lot 4, on a découvert que
 * **quatre chemins de création échouaient en 400 contre le vrai serveur** : la
 * pièce de caisse du lot 2, et les trois créations du lot 3 — budget, avenant,
 * point d'avancement.
 *
 * La cause était la même à chaque fois. Le service envoyait son objet d'entrée
 * en bloc, identifiant compris, alors que le chemin portait déjà cet
 * identifiant et que les schémas Zod du serveur sont en mode strict : un champ
 * inattendu fait échouer la requête. La pièce de caisse cumulait un second
 * écart, envoyant `beneficiary` là où le serveur attend `beneficiaryName`.
 *
 * **Rien ne pouvait le voir.** Les tests d'écran remplacent ces services par
 * une doublure. Les tests d'API postent des corps écrits côté serveur, donc
 * justes par construction. Et les parcours de bout en bout appellent les
 * fonctions de domaine sans jamais passer par HTTP. La frontière entre ce que
 * le web envoie et ce que le serveur accepte n'était éprouvée nulle part.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce fichier garantit, et ce qu'il ne garantit pas
 * ---------------------------------------------------------------------------
 *
 * Il épingle **ce que le web envoie** : l'adresse exacte, et le corps exact.
 * Les tests d'API, de leur côté, épinglent **ce que le serveur accepte**. Les
 * deux moitiés se répondent : si l'une dérive, l'autre tombe.
 *
 * Il ne remplace pas une vérification HTTP de bout en bout, qui reste la seule
 * preuve directe. Elle n'existe pas encore, et c'est consigné comme tel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(async () => ({ data: { data: null } })),
    post: vi.fn(async () => ({ data: { data: null } })),
    put: vi.fn(async () => ({ data: { data: null } }))
  }
}));

import apiClient from '../../utils/api-client';
import { createCashVoucher } from '../../services/finance-lot2-service';
import { createSiteBudget, createBudgetAmendment, recordSiteProgress } from '../../services/finance-lot3-service';

const TENANT = 'agence-1';
const SITE = 'chantier-1';
const BUDGET = 'budget-1';

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

/** L'adresse et le corps du dernier appel, pour se lire d'un coup d'œil. */
function dernierAppel(): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

beforeEach(() => {
  post.mockClear();
  post.mockResolvedValue({ data: { data: {} } });
});

describe('Le corps ne répète jamais un identifiant que le chemin porte déjà', () => {
  it('pièce de caisse : ni `siteId`, et le bénéficiaire sous le nom que le serveur attend', async () => {
    await createCashVoucher(TENANT, {
      siteId: SITE,
      costCategoryId: 'poste-1',
      beneficiary: 'Ousmane Touré',
      amount: 150_000,
      voucherDate: '2026-09-12',
      reason: 'Sable et gravier'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/cash-vouchers`);

    // Le chantier voyage dans le CHEMIN, jamais dans le corps.
    expect(corps).not.toHaveProperty('siteId');
    // Le serveur attend `beneficiaryName`, du nom de sa colonne — alors que la
    // REPONSE porte `beneficiary`. Les deux noms coexistent, et c'est cette
    // asymetrie qui avait ete manquee.
    expect(corps.beneficiaryName).toBe('Ousmane Touré');
    expect(corps).not.toHaveProperty('beneficiary');
  });

  it('budget de chantier : pas de `siteId` dans le corps', async () => {
    await createSiteBudget(TENANT, {
      siteId: SITE,
      label: 'Budget initial 2026',
      lines: [{ costCategoryId: 'poste-1', label: 'Fondations', amountForecast: 5_000_000 }]
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/budgets`);
    expect(corps).not.toHaveProperty('siteId');
    expect(Object.keys(corps).sort()).toEqual(['label', 'lines']);
  });

  it('avenant : pas de `budgetId` dans le corps', async () => {
    await createBudgetAmendment(TENANT, {
      budgetId: BUDGET,
      amendmentDate: '2026-06-01',
      reason: 'Surcoût fondations',
      lines: [{ costCategoryId: 'poste-1', amountDelta: 200_000 }]
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/site-budgets/${BUDGET}/amendments`);
    expect(corps).not.toHaveProperty('budgetId');
    expect(Object.keys(corps).sort()).toEqual(['amendmentDate', 'lines', 'reason']);
  });

  it("point d'avancement : pas de `siteId` dans le corps", async () => {
    await recordSiteProgress(TENANT, {
      siteId: SITE,
      entryDate: '2026-06-30',
      percent: 40,
      note: 'Fin du gros œuvre'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/progress`);
    expect(corps).not.toHaveProperty('siteId');
    expect(Object.keys(corps).sort()).toEqual(['entryDate', 'note', 'percent']);
  });
});
