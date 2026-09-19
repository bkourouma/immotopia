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
import {
  createContractor,
  createContractorContract,
  createContractorPayment,
  createProgressStatement,
  listContractors
} from '../../services/finance-contractors-service';
import { createEmployee, createSalaryNote, createSalaryPayment } from '../../services/finance-salaries-service';
import {
  createRetention,
  getRetentionSummary,
  listRetentions,
  releaseRetention
} from '../../services/finance-retentions-service';
import {
  capitalizeSiteLot,
  closeSite,
  createSiteLot,
  reopenSite,
  setLotAllocationMethod
} from '../../services/finance-site-closing-service';
import { PropertyOwnershipType, PropertyType } from '../../types/finance-site-closing-types';

const TENANT = 'agence-1';
const SITE = 'chantier-1';
const BUDGET = 'budget-1';
const EMPLOYE = 'employe-1';

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

/**
 * Lot 4, sous-lot « salaires ». Trois créations, et les trois portent leur
 * employé dans le CHEMIN : les schémas Zod du serveur
 * (`packages/api/src/lib/finance/schemas-salaries.ts`) sont `.strict()` et
 * n'ont PAS de champ `employeeId` — un corps qui le répéterait échouerait en
 * 400, exactement comme les quatre créations des lots 2 et 3 ci-dessus.
 */
describe('Salaires — le corps ne répète jamais un identifiant que le chemin porte déjà', () => {
  it('salarié : le corps ne porte que le nom et le rôle', async () => {
    await createEmployee(TENANT, { fullName: 'Ibrahima Sylla', role: 'Maçon' });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees`);
    expect(Object.keys(corps).sort()).toEqual(['fullName', 'role']);
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('salarié sans rôle : le champ est omis, jamais envoyé vide (le serveur refuse la chaîne vide)', async () => {
    await createEmployee(TENANT, { fullName: 'Aïssatou Bangoura' });

    const { corps } = dernierAppel();
    expect(Object.keys(corps)).toEqual(['fullName']);
  });

  it("note de salaire : pas d'`employeeId` dans le corps", async () => {
    await createSalaryNote(TENANT, EMPLOYE, {
      periodYear: 2026,
      periodMonth: 9,
      amount: 450_000,
      siteId: SITE,
      costCategoryId: 'poste-1'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees/${EMPLOYE}/salary-notes`);
    expect(corps).not.toHaveProperty('employeeId');
    expect(Object.keys(corps).sort()).toEqual(['amount', 'costCategoryId', 'periodMonth', 'periodYear', 'siteId']);
  });

  it('note de salaire sans chantier : ni `siteId` ni `costCategoryId`, que le serveur refuserait seul', async () => {
    await createSalaryNote(TENANT, EMPLOYE, { periodYear: 2026, periodMonth: 9, amount: 180_000 });

    const { corps } = dernierAppel();
    expect(Object.keys(corps).sort()).toEqual(['amount', 'periodMonth', 'periodYear']);
  });

  it('règlement de salaire : ni `employeeId` ni `allocations` — on règle un salarié, pas une note', async () => {
    await createSalaryPayment(TENANT, EMPLOYE, { paymentDate: '2026-09-18', amount: 175_000 });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees/${EMPLOYE}/salary-payments`);
    expect(corps).not.toHaveProperty('employeeId');
    expect(corps).not.toHaveProperty('allocations');
    expect(Object.keys(corps).sort()).toEqual(['amount', 'paymentDate']);
  });
});

/**
 * Lot 4, sous-lot « tâcherons ». Trois créations sur quatre portent leur
 * identifiant de rattachement dans le CHEMIN : les schémas Zod du serveur
 * (`packages/api/src/lib/finance/schemas-contractors.ts`) sont `.strict()` et
 * ne déclarent NI `contractorId` (marché, règlement) NI `contractId`
 * (situation) — un corps qui les répéterait échouerait en 400, exactement
 * comme les quatre créations des lots 2 et 3 plus haut.
 */
describe('Tâcherons — le corps ne répète jamais un identifiant que le chemin porte déjà', () => {
  const TACHERON = 'tacheron-1';
  const MARCHE = 'marche-1';
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  it('tâcheron : le corps ne porte que le nom et le corps de métier', async () => {
    await createContractor(TENANT, { fullName: 'Sékou Camara', trade: 'Maçonnerie' });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractors`);
    expect(Object.keys(corps).sort()).toEqual(['fullName', 'trade']);
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('tâcheron sans métier : le champ est omis, jamais envoyé vide (le serveur refuse la chaîne vide)', async () => {
    await createContractor(TENANT, { fullName: 'Aïssatou Bah', trade: '' });

    const { corps } = dernierAppel();
    expect(Object.keys(corps)).toEqual(['fullName']);
  });

  it('marché : pas de `contractorId` dans le corps, et le poste de dépense y est bien exigé', async () => {
    await createContractorContract(TENANT, TACHERON, {
      siteId: SITE,
      costCategoryId: 'poste-1',
      reference: 'MAR-2026-030',
      agreedAmount: 4_500_000,
      signedDate: '2026-09-18'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractors/${TACHERON}/contracts`);
    expect(corps).not.toHaveProperty('contractorId');
    expect(Object.keys(corps).sort()).toEqual(['agreedAmount', 'costCategoryId', 'reference', 'signedDate', 'siteId']);
  });

  it("situation d'avancement : pas de `contractId` dans le corps, et la description en fait partie", async () => {
    await createProgressStatement(TENANT, MARCHE, {
      statementDate: '2026-09-18',
      amount: 2_500_000,
      description: 'Élévation des murs du premier niveau, 40 %'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractor-contracts/${MARCHE}/statements`);
    expect(corps).not.toHaveProperty('contractId');
    // La description est obligatoire côté serveur : elle voyage toujours.
    expect(Object.keys(corps).sort()).toEqual(['amount', 'description', 'statementDate']);
  });

  it('règlement : ni `contractorId` ni affectation à des situations — on règle un tâcheron, pas une situation', async () => {
    await createContractorPayment(TENANT, TACHERON, { paymentDate: '2026-09-18', amount: 900_000 });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractors/${TACHERON}/payments`);
    expect(corps).not.toHaveProperty('contractorId');
    expect(corps).not.toHaveProperty('allocations');
    expect(Object.keys(corps).sort()).toEqual(['amount', 'paymentDate']);
  });

  it('liste des tâcherons : le filtre `onlyActive` part en requête, jamais dans le chemin', async () => {
    await listContractors(TENANT, { onlyActive: true });

    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/contractors?onlyActive=true`);
  });
});

/**
 * Lot 4, sixième et dernier sous-lot : lots, coût de revient et clôture.
 *
 * Les schémas Zod du serveur
 * (`packages/api/src/lib/finance/schemas-site-closing.ts`) sont `.strict()` et
 * ne déclarent NI `tenantId`, NI `siteId`, NI `lotId` : tous trois viennent du
 * chemin. Un corps qui les répéterait échouerait en 400, exactement comme les
 * quatre créations des lots 2 et 3 plus haut.
 *
 * **Deux points valent plus que les autres ici.**
 *
 * `POST /close` et `POST /reopen` prennent un corps **VIDE**
 * (`z.object({}).strict()`). L'auteur de la clôture vient du jeton
 * d'authentification : un corps qui le porterait permettrait de clôturer au nom
 * de quelqu'un d'autre, en plus d'échouer en 400. C'est épinglé ici parce que
 * c'est exactement le genre de champ qu'on rajoute « pour bien faire ».
 *
 * La bascule au patrimoine n'accepte **pas** d'`acquisitionCost` : c'est le
 * coût de revient dérivé qui le fournit, et l'accepter en entrée permettrait
 * d'inscrire au patrimoine une valeur que rien ne justifie.
 */
describe('Clôture de chantier — le corps ne répète jamais un identifiant que le chemin porte déjà', () => {
  const LOT = 'lot-1';
  const putMock = apiClient.put as unknown as ReturnType<typeof vi.fn>;

  /** L'adresse et le corps du dernier `put`, calqué sur `dernierAppel()`. */
  function dernierPut(): { adresse: string; corps: Record<string, unknown> } {
    const [adresse, corps] = putMock.mock.calls[putMock.mock.calls.length - 1] as [string, Record<string, unknown>];
    return { adresse, corps };
  }

  it('lot de chantier : pas de `siteId` dans le corps, et les champs vides ne partent pas', async () => {
    await createSiteLot(TENANT, SITE, { name: 'Villa A3', surfaceArea: 150 });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/lots`);
    expect(corps).not.toHaveProperty('siteId');
    // La quote-part n'a pas été saisie : elle est OMISE, pas envoyée à zéro —
    // le serveur refuse zéro (`.positive()`).
    expect(Object.keys(corps).sort()).toEqual(['name', 'surfaceArea']);
  });

  it('clé de répartition : le corps ne porte que `method`', async () => {
    await setLotAllocationMethod(TENANT, SITE, 'MANUAL');

    const { adresse, corps } = dernierPut();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/lot-allocation-method`);
    expect(corps).toEqual({ method: 'MANUAL' });
    expect(corps).not.toHaveProperty('siteId');
  });

  it('clôture : corps VIDE — l’auteur vient du jeton, jamais du corps', async () => {
    await closeSite(TENANT, SITE);

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/close`);
    expect(corps).toEqual({});
    expect(corps).not.toHaveProperty('closedByUserId');
    expect(corps).not.toHaveProperty('siteId');
  });

  it('réouverture : corps VIDE, même raison', async () => {
    await reopenSite(TENANT, SITE);

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/reopen`);
    expect(corps).toEqual({});
  });

  it("bascule au patrimoine : les sept champs du bien, et pas d'`acquisitionCost`", async () => {
    await capitalizeSiteLot(TENANT, SITE, LOT, {
      internalReference: 'VIL-2026-014',
      propertyType: PropertyType.MAISON_VILLA,
      ownershipType: PropertyOwnershipType.TENANT,
      title: 'Villa A3 — Nongo',
      description: '',
      address: 'Quartier Nongo, Ratoma, Conakry',
      acquisitionDate: '2026-09-19'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/lots/${LOT}/capitalize`);
    expect(Object.keys(corps).sort()).toEqual([
      'acquisitionDate',
      'address',
      'description',
      'internalReference',
      'ownershipType',
      'propertyType',
      'title'
    ]);
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('lotId');
    expect(corps).not.toHaveProperty('acquisitionCost');
    // La description vide voyage : la colonne est NON NULLE en base, et le
    // schéma serveur accepte la chaîne vide plutôt que d'en faire inventer une.
    expect(corps.description).toBe('');
  });
});

/**
 * Lot 4, sous-lot « retenues de garantie ». Deux gestes, et chacun porte un
 * risque distinct contre les schémas `.strict()` du serveur
 * (`packages/api/src/lib/finance/schemas-retentions.ts`) :
 *
 * - **la pose** ne doit envoyer AUCUN montant. Le montant retenu se dérive du
 *   taux (principe P-4), `createRetentionSchema` ne déclare pas `amount`, et
 *   un corps qui en porterait un recevrait un 400 — bruyamment, plutôt que de
 *   laisser croire que le montant saisi a été pris en compte. `sourceId`, lui,
 *   EST attendu dans le corps : le chemin ne porte que `tenantId`, et la pièce
 *   change de table selon `sourceType`.
 * - **la libération** doit envoyer un corps VIDE. `releaseRetentionSchema` est
 *   `z.object({}).strict()` : `retentionId` est dans le chemin, et le répéter
 *   dans le corps est exactement le défaut qui cassait quatre créations des
 *   lots 2 et 3 plus haut.
 */
describe('Retenues de garantie — le corps ne répète jamais un identifiant, et ne porte jamais de montant', () => {
  const RETENUE = 'retenue-1';
  const PIECE = 'piece-1';
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  it('pose : les quatre champs du schéma, et AUCUN montant', async () => {
    await createRetention(TENANT, {
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: PIECE,
      ratePercent: 5,
      plannedReleaseDate: '2027-03-31'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/retentions`);
    expect(Object.keys(corps).sort()).toEqual(['plannedReleaseDate', 'ratePercent', 'sourceId', 'sourceType']);
    // Le montant est DÉRIVÉ du taux par le serveur, jamais transmis.
    expect(corps).not.toHaveProperty('amount');
    expect(corps).not.toHaveProperty('baseAmount');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('libération : le corps est VIDE — `retentionId` est dans le chemin', async () => {
    await releaseRetention(TENANT, RETENUE);

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/retentions/${RETENUE}/release`);
    expect(corps).toEqual({});
    expect(corps).not.toHaveProperty('retentionId');
    // Pas de libération partielle, et `releasedAt` est l'instant de l'acte :
    // ni montant ni date n'ont à voyager.
    expect(corps).not.toHaveProperty('amount');
    expect(corps).not.toHaveProperty('releasedAt');
  });

  it('liste : les filtres partent en requête, jamais dans le chemin', async () => {
    await listRetentions(TENANT, { status: 'HELD', siteId: SITE, dueBefore: '2026-09-19' });

    expect(getMock).toHaveBeenCalledWith(
      `/tenants/${TENANT}/finance/retentions?status=HELD&siteId=${SITE}&dueBefore=2026-09-19`
    );
  });

  it('résumé : un chemin propre, distinct du détail, et son filtre en requête', async () => {
    // Côté serveur, cette route est déclarée AVANT `retentions/:retentionId`,
    // sans quoi le paramètre capturerait la chaîne `summary`. Épinglé ici pour
    // que l'adresse ne soit jamais « simplifiée » en `retentions?summary=1`.
    await getRetentionSummary(TENANT, { siteId: SITE });

    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/retentions/summary?siteId=${SITE}`);
  });
});
