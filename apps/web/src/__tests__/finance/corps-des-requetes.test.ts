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
    put: vi.fn(async () => ({ data: { data: null } })),
    // `patch` et `delete` ajoutes a l'integration du lot 5. Deux agents ont
    // signale ne pas pouvoir epingler leurs gestes ici faute de ces deux
    // verbes, et avoir du le faire dans leur propre test d'ecran. Ce fichier
    // existe pour rassembler ces epinglages : lui manquer un verbe le prive
    // de sa raison d'etre.
    patch: vi.fn(async () => ({ data: { data: null } })),
    delete: vi.fn(async () => ({ data: { data: null } }))
  }
}));

import apiClient from '../../utils/api-client';
import { createCashVoucher, getSiteDetail, validateCashVoucher } from '../../services/finance-lot2-service';
import {
  createSiteBudget,
  createBudgetAmendment,
  getSiteBudget,
  getSitesDashboard,
  recordSiteProgress
} from '../../services/finance-lot3-service';
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
import {
  enableSiteStock,
  getSiteStockReconciliation,
  getSiteStockStatus
} from '../../services/finance-stock-rapprochement-service';
import {
  listStockBalances,
  listStockItems,
  listStockLocations,
  listStockMovements,
  listSupplierInvoicesForReceipt,
  recordStockIssue,
  recordStockReceipt
} from '../../services/finance-stock-mouvements-service';
import {
  createStockCount,
  createStockTransfer,
  getStockCount,
  listStockCounts,
  setStockCountLine,
  validateStockCount
} from '../../services/finance-stock-inventaire-service';
import { PropertyOwnershipType, PropertyType } from '../../types/finance-site-closing-types';
// Lot 5, premier sous-lot : le référentiel du stock (bloc en fin de fichier).
// Les deux listes sont renommées : le sous-lot des mouvements expose des
// fonctions de MÊME nom, sur les mêmes routes, avec ses propres types de
// lecture. Les deux frontières coexistent volontairement (chaque sous-lot
// recopie la sienne) ; ici, il faut les distinguer.
import {
  createStockItem,
  createStockLocation,
  listStockItems as listStockItemsReferentiel,
  listStockLocations as listStockLocationsReferentiel,
  setStockValuationMethod
} from '../../services/finance-stock-referentiel-service';

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
    await createEmployee(TENANT, { fullName: 'Ibrahima Koffi', role: 'Maçon' });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees`);
    expect(Object.keys(corps).sort()).toEqual(['fullName', 'role']);
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('salarié sans rôle : le champ est omis, jamais envoyé vide (le serveur refuse la chaîne vide)', async () => {
    await createEmployee(TENANT, { fullName: 'Aïssatou Bamba' });

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
    await createContractor(TENANT, { fullName: 'Sékou Kouadio', trade: 'Maçonnerie' });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractors`);
    expect(Object.keys(corps).sort()).toEqual(['fullName', 'trade']);
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('tâcheron sans métier : le champ est omis, jamais envoyé vide (le serveur refuse la chaîne vide)', async () => {
    await createContractor(TENANT, { fullName: 'Aïssatou Konan', trade: '' });

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
      title: 'Villa A3 — Riviera',
      description: '',
      address: 'Quartier Riviera, Cocody, Abidjan',
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

/**
 * Lot 5, deuxième sous-lot : réceptions, sorties et valorisation du stock.
 *
 * Les schémas Zod du serveur
 * (`packages/api/src/lib/finance/schemas-stock-mouvements.ts`) sont `.strict()`
 * et ne déclarent **pas** `tenantId` : il vient du chemin, et lui seul. Deux
 * risques distincts sont épinglés ici :
 *
 * - **la sortie ne doit envoyer AUCUN prix**, sous aucun nom. Le prix est
 *   dérivé du coût moyen du lieu avant la sortie (principe P-4), et
 *   `createStockIssueSchema` ne déclare ni `unitCost`, ni `totalValue`, ni
 *   `averageUnitCost`. Étant strict, il répond 400 à un corps qui en porterait
 *   un — bruyamment, plutôt que de laisser croire qu'un prix saisi a compté ;
 * - **la réception, elle, PORTE `supplierInvoiceId` dans son corps**, et ce
 *   n'est pas une répétition : le chemin ne le porte nulle part, et c'est lui
 *   qui valorise l'entrée (besoin S2, principe P-2). Un test qui l'interdirait
 *   « par symétrie » casserait la seule création correcte du lot.
 */
describe('Stock — aucun prix sur une sortie, et la facture reste dans le corps d’une réception', () => {
  const LIEU = 'lieu-magasin-01';
  const ARTICLE = 'article-ciment-01';
  const SABLE = 'article-sable-03';
  const FACTURE = 'facture-0142';
  const FOURNISSEUR = 'frs-1';
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  it('sortie : les sept champs du schéma, et AUCUN prix sous aucun nom', async () => {
    await recordStockIssue(TENANT, {
      locationId: LIEU,
      itemId: ARTICLE,
      quantity: 12,
      siteId: SITE,
      costCategoryId: 'poste-gros-oeuvre',
      requestedBy: 'Mamadou Kouassi',
      issueDate: '2026-09-19'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/issues`);
    expect(Object.keys(corps).sort()).toEqual([
      'costCategoryId',
      'issueDate',
      'itemId',
      'locationId',
      'quantity',
      'requestedBy',
      'siteId'
    ]);

    // Le prix est DÉRIVÉ du coût moyen du lieu, jamais transmis.
    expect(corps).not.toHaveProperty('unitCost');
    expect(corps).not.toHaveProperty('totalValue');
    expect(corps).not.toHaveProperty('averageUnitCost');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('sortie : le demandeur part sans ses espaces de bord, que le serveur refuserait', async () => {
    await recordStockIssue(TENANT, {
      locationId: LIEU,
      itemId: ARTICLE,
      quantity: 1,
      siteId: SITE,
      costCategoryId: 'poste-gros-oeuvre',
      requestedBy: '  Mamadou Kouassi  ',
      issueDate: '2026-09-19'
    });

    const { corps } = dernierAppel();
    expect(corps.requestedBy).toBe('Mamadou Kouassi');
  });

  it('réception : quatre champs, `supplierInvoiceId` compris — le chemin ne le porte pas', async () => {
    await recordStockReceipt(TENANT, {
      locationId: LIEU,
      supplierInvoiceId: FACTURE,
      receiptDate: '2026-09-02',
      lines: [
        { itemId: ARTICLE, quantity: 400, unitCost: 4_700 },
        // Le zéro est accepté : un don, une reprise, une chute récupérée
        // entrent en stock à valeur nulle. Seul le négatif est refusé.
        { itemId: SABLE, quantity: 24.5, unitCost: 0 }
      ]
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/receipts`);
    expect(Object.keys(corps).sort()).toEqual(['lines', 'locationId', 'receiptDate', 'supplierInvoiceId']);
    expect(corps).not.toHaveProperty('tenantId');
    // UNE LIGNE PAR ARTICLE, et chaque ligne ne porte que ses trois champs :
    // le schéma de ligne est lui aussi `.strict()`.
    expect(corps.lines).toEqual([
      { itemId: ARTICLE, quantity: 400, unitCost: 4_700 },
      { itemId: SABLE, quantity: 24.5, unitCost: 0 }
    ]);
  });

  it('soldes : les trois filtres partent en requête, et `onlyInStock` faux est OMIS', async () => {
    await listStockBalances(TENANT, { locationId: LIEU, itemId: ARTICLE, onlyInStock: true });
    expect(getMock).toHaveBeenCalledWith(
      `/tenants/${TENANT}/finance/stock/balances?locationId=${LIEU}&itemId=${ARTICLE}&onlyInStock=true`
    );

    // `onlyInStock: false` partirait « false », que `z.coerce.boolean()` aurait
    // lu comme vrai côté serveur : l'écran l'omet, et l'URL redevient celle du
    // premier chargement — même clé de cache.
    await listStockBalances(TENANT, { onlyInStock: undefined });
    expect(getMock).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/stock/balances`);
  });

  it('journal : les cinq filtres partent en requête, jamais dans le chemin', async () => {
    await listStockMovements(TENANT, {
      itemId: ARTICLE,
      locationId: LIEU,
      siteId: SITE,
      type: 'ISSUE',
      from: '2026-09-01',
      to: '2026-09-30'
    });

    expect(getMock).toHaveBeenCalledWith(
      `/tenants/${TENANT}/finance/stock/movements?itemId=${ARTICLE}&locationId=${LIEU}&siteId=${SITE}&type=ISSUE&from=2026-09-01&to=2026-09-30`
    );
  });

  it('référentiel appelé directement : les routes du sous-lot voisin, sans importer son service', async () => {
    await listStockItems(TENANT, { onlyActive: true });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items?onlyActive=true`);

    await listStockLocations(TENANT, { onlyActive: true, kind: 'WAREHOUSE' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/locations?onlyActive=true&kind=WAREHOUSE`);
  });

  it('factures réceptionnables : composées depuis les factures VALIDÉES du fournisseur', async () => {
    // Aucune route ne liste les factures « sans réception » : le détour est
    // isolé dans cette seule fonction, et il écarte ce que le serveur
    // refuserait plutôt que de le proposer.
    getMock.mockResolvedValueOnce({
      data: {
        data: [
          { id: FACTURE, reference: 'F-2026-0142', status: 'VALIDATED' },
          { id: 'facture-brouillon', reference: 'F-2026-0199', status: 'DRAFT' }
        ]
      }
    });

    const factures = await listSupplierInvoicesForReceipt(TENANT, FOURNISSEUR);

    expect(getMock).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/suppliers/${FOURNISSEUR}/invoices`);
    expect(factures.map(f => f.id)).toEqual([FACTURE]);
  });
});

/**
 * Lot 5, quatrième et dernier sous-lot : la bascule d'un chantier au stock et
 * le rapprochement acheté / consommé / restant.
 *
 * Les schémas Zod du serveur
 * (`packages/api/src/lib/finance/schemas-stock-rapprochement.ts`) sont
 * `.strict()` et **VIDES** — les trois : celui de la bascule comme ceux des
 * deux lectures. `tenantId` et `siteId` viennent du chemin, et rien d'autre
 * n'a le droit de voyager.
 *
 * **Le point qui vaut plus que les autres ici : la bascule n'accepte aucune
 * date.** `enableSiteStockSchema` est `z.object({}).strict()`, et un corps
 * portant `enabledAt` reçoit un 400. Ce n'est pas une économie de champ :
 * accepter une date choisie par l'appelant laisserait antidater la bascule,
 * c'est-à-dire reclasser après coup des factures déjà imputées. La date est
 * celle de l'instant de la décision, et le contrôleur la pose lui-même.
 *
 * C'est exactement le genre de champ qu'on rajoute « pour bien faire », comme
 * l'auteur de la clôture du lot 4 — d'où cette épingle.
 */
describe('Stock du chantier — la bascule ne porte AUCUN corps, et surtout pas de date', () => {
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  it('bascule : corps VIDE — la date vient du serveur, jamais de l’appelant', async () => {
    await enableSiteStock(TENANT, SITE);

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/stock/enable`);
    expect(corps).toEqual({});
    // Le schéma serveur refuse la moindre clé. Une date choisie permettrait
    // d'antidater la bascule.
    expect(corps).not.toHaveProperty('enabledAt');
    expect(corps).not.toHaveProperty('stockEnabledAt');
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('état du chantier : un chemin propre, sans aucun paramètre de requête', async () => {
    await getSiteStockStatus(TENANT, SITE);

    // `siteStockQuerySchema` est vide et strict : pas de borne de période
    // saisie de l'extérieur, et donc rien à mettre en requête.
    expect(getMock).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/stock/status`);
  });

  it('rapprochement : un chemin propre, distinct de l’état, et sans filtre', async () => {
    await getSiteStockReconciliation(TENANT, SITE);

    expect(getMock).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/stock/reconciliation`);
  });
});

/**
 * Lot 5, sous-lot « transferts et inventaire physique ». Quatre écritures, et
 * chacune porte un risque distinct contre les schémas `.strict()` du serveur
 * (`packages/api/src/lib/finance/schemas-stock-inventaire.ts`) :
 *
 * - **le transfert** porte ses DEUX lieux dans le corps, et ce n'est pas une
 *   répétition : le chemin ne porte que `tenantId`. Il ne porte en revanche
 *   aucun prix — la valeur part au coût moyen du lieu d'origine (principe P-4)
 *   — et aucun chantier : un transfert n'impute rien, seule la sortie impute
 *   (principe P-7). Un corps qui porterait l'un ou l'autre recevrait un 400.
 * - **la ligne de comptage** ne porte JAMAIS `expectedQuantity`. Le serveur la
 *   lit dans le stock au moment de la saisie et la fige ;
 *   `setStockCountLineSchema` ne la déclare pas, et la laisser entrer
 *   permettrait de fabriquer un écart nul — exactement ce que le besoin S6
 *   empêche. `variance` et `varianceValue`, tout aussi dérivées, sont refusées
 *   pour la même raison. `countId`, lui, est dans le CHEMIN.
 * - **le motif vide** est OMIS plutôt qu'envoyé en chaîne vide : le contrôleur
 *   pose `reason ?? null`, si bien que l'absence efface le motif. Une chaîne
 *   vide enregistrerait un motif qui n'en est pas un, et la validation le
 *   laisserait passer alors que le besoin S6 l'exige.
 * - **la validation** envoie un corps VIDE. Son schéma est
 *   `z.object({}).strict()` : `countId` est dans le chemin, et l'auteur vient
 *   du jeton d'authentification — un corps qui le porterait permettrait de
 *   valider une perte au nom de quelqu'un d'autre.
 */
describe('Transferts et inventaire — aucun identifiant répété, aucun attendu saisi', () => {
  const COMPTAGE = 'comptage-1';
  const ARTICLE = 'article-1';
  const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  it('transfert : les cinq champs du schéma, sans prix ni chantier', async () => {
    await createStockTransfer(TENANT, {
      fromLocationId: 'lieu-magasin-1',
      toLocationId: 'lieu-chantier-1',
      itemId: ARTICLE,
      quantity: 50,
      transferDate: '2026-09-19'
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/transfers`);
    expect(Object.keys(corps).sort()).toEqual(['fromLocationId', 'itemId', 'quantity', 'toLocationId', 'transferDate']);
    // Aucun prix : la valeur part au coût moyen du lieu d'origine.
    expect(corps).not.toHaveProperty('unitCost');
    expect(corps).not.toHaveProperty('value');
    // Aucun chantier : déplacer n'est pas consommer.
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('costCategoryId');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('ouverture d’un comptage : le lieu et la date, rien de plus', async () => {
    await createStockCount(TENANT, { locationId: 'lieu-magasin-1', countedAt: '2026-09-18' });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts`);
    expect(Object.keys(corps).sort()).toEqual(['countedAt', 'locationId']);
    expect(corps).not.toHaveProperty('tenantId');
    // Le comptage s'ouvre SANS ligne : on compte une allée après l'autre.
    expect(corps).not.toHaveProperty('lines');
  });

  it('ligne de comptage : ni `countId`, et surtout AUCUNE quantité attendue', async () => {
    const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;
    put.mockClear();
    put.mockResolvedValue({ data: { data: {} } });

    await setStockCountLine(TENANT, COMPTAGE, {
      itemId: ARTICLE,
      countedQuantity: 188,
      reason: '  Vol constaté  '
    });

    const [adresse, corps] = put.mock.calls[put.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts/${COMPTAGE}/lines`);
    expect(Object.keys(corps).sort()).toEqual(['countedQuantity', 'itemId', 'reason']);
    // Le motif part détouré : le serveur le `trim()` de son côté, et une
    // chaîne d'espaces n'est pas un motif.
    expect(corps.reason).toBe('Vol constaté');
    // Le cœur de ce sous-lot. Le serveur lit l'attendu et le FIGE ; l'envoyer
    // vaudrait un 400, et le laisser entrer permettrait de fabriquer un écart
    // nul — ce que le besoin S6 empêche.
    expect(corps).not.toHaveProperty('expectedQuantity');
    expect(corps).not.toHaveProperty('variance');
    expect(corps).not.toHaveProperty('varianceValue');
    expect(corps).not.toHaveProperty('countId');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('ligne de comptage : un motif vide est OMIS, jamais envoyé en chaîne vide', async () => {
    const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;
    put.mockClear();
    put.mockResolvedValue({ data: { data: {} } });

    await setStockCountLine(TENANT, COMPTAGE, { itemId: ARTICLE, countedQuantity: 0, reason: '   ' });

    const [, corps] = put.mock.calls[put.mock.calls.length - 1] as [string, Record<string, unknown>];
    // L'absence efface le motif ; la chaîne vide en enregistrerait un faux,
    // que la validation laisserait passer.
    expect(Object.keys(corps).sort()).toEqual(['countedQuantity', 'itemId']);
    // Le ZÉRO voyage : « on a compté, il n'y a rien » est un résultat.
    expect(corps.countedQuantity).toBe(0);
  });

  it('validation : le corps est VIDE — `countId` est dans le chemin, l’auteur dans le jeton', async () => {
    await validateStockCount(TENANT, COMPTAGE);

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/counts/${COMPTAGE}/validate`);
    expect(corps).toEqual({});
    expect(corps).not.toHaveProperty('countId');
    expect(corps).not.toHaveProperty('validatedByUserId');
    expect(corps).not.toHaveProperty('validatedAt');
  });

  it('liste des comptages : les filtres partent en requête, jamais dans le chemin', async () => {
    await listStockCounts(TENANT, { locationId: 'lieu-magasin-1', status: 'DRAFT' });

    expect(getMock).toHaveBeenLastCalledWith(
      `/tenants/${TENANT}/finance/stock/counts?locationId=lieu-magasin-1&status=DRAFT`
    );
  });

  it('détail d’un comptage : un chemin propre, et rien après lui sous `/stock/counts/`', async () => {
    // Côté serveur, `/stock/counts/:countId` est déclarée EN DERNIER : un
    // chemin littéral monté après elle serait avalé par le paramètre.
    await getStockCount(TENANT, COMPTAGE);

    expect(getMock).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/stock/counts/${COMPTAGE}`);
  });
});

/**
 * Lot 5, premier sous-lot : le référentiel du stock. Trois gestes d'écriture,
 * et chacun porte un risque distinct contre les schémas `.strict()` du serveur
 * (`packages/api/src/lib/finance/schemas-stock-referentiel.ts`) :
 *
 * - **l'article** ne doit envoyer ni `category` ni `defaultCostCategoryId`
 *   en chaîne VIDE. Le serveur les déclare `z.string().min(1)…optional()` et
 *   `z.string().uuid()…optional()` : une chaîne vide est un 400 dans les deux
 *   cas, alors que l'absence est le cas normal. Un article sans famille et
 *   sans poste proposé est parfaitement régulier.
 * - **le lieu de stockage** ne doit porter `siteId` QUE pour un lieu de
 *   chantier. Le serveur l'exige quand `kind` vaut `SITE` et le **refuse**
 *   sinon, plutôt que de l'ignorer : « accepter un champ qui ne servira à rien
 *   laisserait croire qu'il a servi » (contrat gelé).
 * - **la méthode de valorisation** part en `PUT`, méthode ET motif ensemble.
 *   Le motif est exigé — un motif sans méthode, ou l'inverse, ne serait pas
 *   une décision (besoin S5) — et il voyage `trim()`, pour que ce qui est
 *   enregistré soit exactement ce qui sera relu.
 *
 * Aucune route ne supprime ici, et aucune correction ne répète son identifiant :
 * `itemId` et `locationId` voyagent dans le CHEMIN.
 */
describe('Référentiel du stock — aucun identifiant du chemin dans le corps, aucune chaîne vide', () => {
  const putMock = apiClient.put as unknown as ReturnType<typeof vi.fn>;
  const CHANTIER = 'chantier-riviera';
  const POSTE = '3f1b1c2a-0000-4000-8000-000000000001';

  /** L'adresse et le corps du dernier `put`, calqué sur `dernierAppel()`. */
  function dernierPutStock(): { adresse: string; corps: Record<string, unknown> } {
    const [adresse, corps] = putMock.mock.calls[putMock.mock.calls.length - 1] as [string, Record<string, unknown>];
    return { adresse, corps };
  }

  it('article : les trois champs obligatoires, et rien de vide', async () => {
    await createStockItem(TENANT, {
      reference: 'FER-12',
      label: 'Fer à béton HA 12',
      unit: 'barre',
      category: '',
      defaultCostCategoryId: null
    });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/items`);
    expect(Object.keys(corps).sort()).toEqual(['label', 'reference', 'unit']);
    // Un article sans famille et sans poste proposé est un cas NORMAL : les
    // clés sont omises, jamais envoyées vides.
    expect(corps).not.toHaveProperty('category');
    expect(corps).not.toHaveProperty('defaultCostCategoryId');
    expect(corps).not.toHaveProperty('tenantId');
    expect(corps).not.toHaveProperty('isActive');
  });

  it('article : la famille et le poste PROPOSÉ voyagent quand ils sont renseignés', async () => {
    await createStockItem(TENANT, {
      reference: 'CIM-42',
      label: 'Ciment CPJ 42,5',
      unit: 'sac',
      category: '  Gros œuvre  ',
      defaultCostCategoryId: POSTE
    });

    const { corps } = dernierAppel();
    expect(Object.keys(corps).sort()).toEqual(['category', 'defaultCostCategoryId', 'label', 'reference', 'unit']);
    expect(corps.category).toBe('Gros œuvre');
    // Le poste n'a AUCUNE autorité sur la sortie à venir : il n'est ici qu'une
    // proposition, et c'est l'écran qui le dit.
    expect(corps.defaultCostCategoryId).toBe(POSTE);
  });

  it('magasin : le corps ne porte JAMAIS de chantier', async () => {
    await createStockLocation(TENANT, { kind: 'WAREHOUSE', label: "Magasin central d'Angré" });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/locations`);
    expect(corps).toEqual({ kind: 'WAREHOUSE', label: "Magasin central d'Angré" });
    // Le serveur REFUSE `siteId` pour un magasin, plutôt que de l'ignorer.
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('lieu de chantier : le chantier est dans le corps, et le corps ne porte rien d’autre', async () => {
    await createStockLocation(TENANT, { kind: 'SITE', label: 'Dépôt de la Villa Riviera', siteId: CHANTIER });

    const { corps } = dernierAppel();
    expect(corps).toEqual({ kind: 'SITE', label: 'Dépôt de la Villa Riviera', siteId: CHANTIER });
    expect(corps).not.toHaveProperty('locationId');
  });

  it('méthode de valorisation : la méthode ET son motif, ensemble et sans espaces parasites', async () => {
    await setStockValuationMethod(TENANT, {
      valuationMethod: 'WEIGHTED_AVERAGE',
      decisionNote: '  Décision du comité de gestion du 12 mars 2026.  '
    });

    const { adresse, corps } = dernierPutStock();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/settings`);
    expect(corps).toEqual({
      valuationMethod: 'WEIGHTED_AVERAGE',
      decisionNote: 'Décision du comité de gestion du 12 mars 2026.'
    });
    expect(corps).not.toHaveProperty('tenantId');
    // La date de la décision est posée par le serveur : la transmettre
    // permettrait d'antidater une décision.
    expect(corps).not.toHaveProperty('decidedAt');
  });

  it('les filtres des deux listes partent en requête, jamais dans le chemin', async () => {
    const getMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

    await listStockItemsReferentiel(TENANT, { onlyActive: true, search: '  ciment  ' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items?onlyActive=true&search=ciment`);

    // Le serveur refuse la recherche VIDE (`.min(1)`) : la clé est omise.
    await listStockItemsReferentiel(TENANT, { search: '   ' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items`);

    await listStockLocationsReferentiel(TENANT, { kind: 'SITE' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/locations?kind=SITE`);
  });
});

/**
 * Le pendant du reste du fichier : ce que le web **relit** de la réponse.
 *
 * Le 20 septembre 2026, un test de bout en bout a fait tomber la fiche d'un
 * chantier sur l'écran d'erreur global de l'application, sur un
 * `Cannot read properties of undefined`. Le service annonçait rendre un
 * `SiteDetail` et rendait la charge utile brute, dont la forme diffère :
 * l'écran lisait `site.name` sur un objet absent.
 *
 * Aucune des deux moitiés décrites en tête de ce fichier ne pouvait le voir.
 * Les tests d'écran remplacent le service par une doublure qui rend la forme
 * attendue par l'écran, et l'atelier de développement faisait la même chose :
 * tous deux imitaient le vœu du client, pas la réponse du serveur. Le
 * compilateur ne voyait rien non plus, le mensonge étant dans l'annotation de
 * type de la réponse.
 *
 * Ces cas épinglent donc la **lecture**, à partir d'une charge utile copiée du
 * contrat gelé.
 */
describe('Détail d’un chantier — ce que le service relit de la réponse du serveur', () => {
  const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  /** La charge utile telle que `ConstructionSiteDetailResponseWrapper` la décrit. */
  function chargeUtile(surcharge: Record<string, unknown> = {}) {
    return {
      data: {
        data: {
          siteId: SITE,
          site: {
            id: SITE,
            name: 'Villa de la Riviera',
            zone: 'Riviera, Cocody',
            propertyId: null,
            landLeaseId: null,
            managerId: null,
            status: 'PLANNED',
            startDate: '2026-03-01',
            plannedEndDate: '2026-08-31',
            progressPercent: 0,
            closedAt: null,
            finalCost: null,
            actualCost: 4_500_000,
            currency: 'XOF'
          },
          actualCost: 4_500_000,
          allocations: [
            {
              id: 'imputation-1',
              sourceType: 'SUPPLIER_INVOICE',
              sourceId: 'facture-1',
              sourceLabel: 'Facture FRS-2026-0142 — Matériaux du Sud',
              costCategoryId: 'poste-gros-oeuvre',
              costCategoryLabel: 'Gros œuvre',
              amount: 4_500_000,
              allocationDate: '2026-03-10T00:00:00.000Z'
            }
          ],
          // Le serveur nomme le montant `total`, l'écran l'appelle `amount`.
          subtotalsByCategory: [{ costCategoryId: 'poste-gros-oeuvre', label: 'Gros œuvre', total: 4_500_000 }],
          ...surcharge
        }
      }
    };
  }

  beforeEach(() => {
    get.mockReset();
  });

  it('rend le chantier lui-même, sans quoi l’en-tête de la fiche n’a rien à afficher', async () => {
    get.mockResolvedValue(chargeUtile());

    const detail = await getSiteDetail(TENANT, SITE);

    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/detail`);
    expect(detail.site).toBeDefined();
    expect(detail.site.name).toBe('Villa de la Riviera');
    expect(detail.site.status).toBe('PLANNED');
    expect(detail.site.actualCost).toBe(4_500_000);
  });

  it('traduit les sous-totaux : `subtotalsByCategory.total` devient `byCostCategory.amount`', async () => {
    get.mockResolvedValue(chargeUtile());

    const detail = await getSiteDetail(TENANT, SITE);

    expect(detail.byCostCategory).toEqual([
      { costCategoryId: 'poste-gros-oeuvre', label: 'Gros œuvre', amount: 4_500_000 }
    ]);
  });

  it('conserve le libellé lisible de la pièce d’origine, jamais son identifiant', async () => {
    get.mockResolvedValue(chargeUtile());

    const detail = await getSiteDetail(TENANT, SITE);

    expect(detail.allocations[0].sourceLabel).toBe('Facture FRS-2026-0142 — Matériaux du Sud');
  });

  it('refuse franchement une réponse sans chantier, au lieu de laisser l’écran tomber plus loin', async () => {
    get.mockResolvedValue(chargeUtile({ site: undefined }));

    await expect(getSiteDetail(TENANT, SITE)).rejects.toThrow(/ne porte pas le chantier/);
  });
});

/**
 * Le tableau de bord des chantiers, même famille de défaut que le détail
 * ci-dessus, découverte le même jour à l'étape suivante du test.
 *
 * Le contrat gelé (`SitesDashboard`, spec 018) veut que `data` porte un objet
 * `{ rows, currency }`. Le serveur mettait le tableau directement dans `data`
 * et hissait `currency` à côté : l'écran lisait `data.rows`, obtenait
 * `undefined`, le repliait sur une liste vide et annonçait « Aucun chantier ne
 * correspond à ces critères » alors que la réponse portait les lignes. Ni
 * exception, ni statut d'erreur — un écran vide qui ressemble à une base vide.
 */
describe('Tableau de bord des chantiers — ce que le service relit de la réponse', () => {
  const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  const ligne = {
    siteId: SITE,
    siteLabel: 'Villa de la Riviera',
    zone: 'Riviera, Cocody',
    status: 'PLANNED',
    initialBudget: null,
    revisedBudget: null,
    engagedAmount: 0,
    actualCost: 0,
    progressPercent: 0,
    variance: null,
    variancePercent: null,
    openAlert: null,
    currency: 'XOF'
  };

  beforeEach(() => {
    get.mockReset();
  });

  it('lit les lignes sous `data.rows`, et la devise avec elles', async () => {
    get.mockResolvedValue({ data: { data: { rows: [ligne], currency: 'XOF' } } });

    const tableau = await getSitesDashboard(TENANT);

    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/dashboard`);
    expect(tableau.rows).toHaveLength(1);
    expect(tableau.rows[0].siteLabel).toBe('Villa de la Riviera');
    expect(tableau.currency).toBe('XOF');
  });

  it('garde un chantier SANS budget : c’est lui qu’on vient créer', async () => {
    get.mockResolvedValue({ data: { data: { rows: [ligne], currency: 'XOF' } } });

    const tableau = await getSitesDashboard(TENANT);

    // `variance` nul se lit « Sans budget », jamais « à écarter » : un
    // chantier neuf est précisément celui pour lequel on ouvre cet écran.
    expect(tableau.rows[0].variance).toBeNull();
    expect(tableau.rows[0].initialBudget).toBeNull();
  });

  it('n’envoie le filtre de dépassement que lorsqu’il est coché', async () => {
    get.mockResolvedValue({ data: { data: { rows: [], currency: 'XOF' } } });

    await getSitesDashboard(TENANT, { onlyOverBudget: false });
    expect(get).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/sites/dashboard`);

    await getSitesDashboard(TENANT, { onlyOverBudget: true });
    expect(get).toHaveBeenLastCalledWith(`/tenants/${TENANT}/finance/sites/dashboard?onlyOverBudget=true`);
  });
});

/**
 * Le budget d'un chantier : quelle route l'écran interroge, et lequel des
 * budgets rendus il retient.
 *
 * Troisième défaut de la même veine, découvert à l'étape suivante du même
 * test. Deux routes voisines ne disent pas la même chose — `/budget` sert le
 * budget VALIDÉ et rend 404 sinon, `/budgets` sert l'historique complet — et
 * l'écran de gestion interrogeait la première. Un budget fraîchement créé,
 * donc en brouillon, restait invisible à l'écran qui venait de le créer.
 */
describe('Budget du chantier — quelle route, et quel budget retenu', () => {
  const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

  function budget(surcharge: Record<string, unknown> = {}) {
    return {
      id: BUDGET,
      siteId: SITE,
      label: 'Budget initial 2026',
      status: 'DRAFT',
      totalForecast: 150_000_000,
      currency: 'XOF',
      validatedAt: null,
      validatedByUserId: null,
      validatedByLabel: null,
      createdAt: '2026-09-20T10:00:00.000Z',
      lines: [],
      ...surcharge
    };
  }

  beforeEach(() => {
    get.mockReset();
  });

  it('interroge la liste, jamais le singulier qui ne sert que le budget validé', async () => {
    get.mockResolvedValue({ data: { data: [budget()] } });

    await getSiteBudget(TENANT, SITE);

    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/budgets`);
    expect(get).not.toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/budget`);
  });

  it('rend un budget en BROUILLON : c’est tout l’intérêt de l’étape de validation', async () => {
    get.mockResolvedValue({ data: { data: [budget()] } });

    const courant = await getSiteBudget(TENANT, SITE);

    expect(courant).not.toBeNull();
    expect(courant?.status).toBe('DRAFT');
    expect(courant?.totalForecast).toBe(150_000_000);
  });

  it('préfère le budget validé quand il en existe un, quel que soit son rang', async () => {
    const valide = budget({ id: 'budget-valide', status: 'VALIDATED' });
    get.mockResolvedValue({ data: { data: [budget({ id: 'brouillon-recent' }), valide] } });

    const courant = await getSiteBudget(TENANT, SITE);

    expect(courant?.id).toBe('budget-valide');
  });

  it('à défaut de validé, retient le plus récent — la liste arrive déjà triée', async () => {
    get.mockResolvedValue({
      data: { data: [budget({ id: 'brouillon-recent' }), budget({ id: 'brouillon-ancien' })] }
    });

    const courant = await getSiteBudget(TENANT, SITE);

    expect(courant?.id).toBe('brouillon-recent');
  });

  it('rend null sur une liste vide, ce que l’écran traduit par « aucun budget posé »', async () => {
    get.mockResolvedValue({ data: { data: [] } });

    await expect(getSiteBudget(TENANT, SITE)).resolves.toBeNull();
  });
});

/**
 * La pièce de caisse : ce que le service **relit** de la réponse.
 *
 * Le serveur nomme le bénéficiaire `beneficiaryName`, du nom de sa colonne et
 * de son contrat ; les écrans l'appellent `beneficiary`. L'aller était traduit
 * depuis le 19 septembre 2026, le retour ne l'était pas.
 *
 * Le champ valait donc `undefined`, et le défaut se voyait de deux façons : la
 * ligne « Bénéficiaire : » de la carte restait vide, et les titres interpolés
 * affichaient leur gabarit en clair — « Pièce à valider — {{beneficiary}} ».
 * i18next laisse en effet le motif intact quand la valeur manque, au lieu
 * d'écrire « undefined » : un gabarit visible à l'écran veut dire donnée
 * absente, pas faute de traduction.
 */
describe('Pièce de caisse — le bénéficiaire survit à l’aller-retour', () => {
  const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

  /** La charge utile du serveur, au vocabulaire du contrat. */
  function pieceDuServeur(surcharge: Record<string, unknown> = {}) {
    return {
      data: {
        data: {
          id: 'piece-1',
          number: null,
          siteId: SITE,
          siteLabel: 'Villa de Nongo',
          costCategoryId: 'poste-divers',
          costCategoryLabel: 'Divers',
          beneficiaryName: 'Mamadou Diallo, chef d’équipe',
          amount: 350_000,
          currency: 'XOF',
          voucherDate: '2026-03-12',
          reason: 'Petit outillage',
          status: 'DRAFT',
          validatedAt: null,
          ...surcharge
        }
      }
    };
  }

  it('rend le bénéficiaire à la création, sous le nom qu’attend l’écran', async () => {
    post.mockResolvedValue(pieceDuServeur());

    const piece = await createCashVoucher(TENANT, {
      siteId: SITE,
      costCategoryId: 'poste-divers',
      beneficiary: 'Mamadou Diallo, chef d’équipe',
      amount: 350_000,
      voucherDate: '2026-03-12',
      reason: 'Petit outillage'
    });

    expect(piece.beneficiary).toBe('Mamadou Diallo, chef d’équipe');
  });

  it('le rend aussi à la validation', async () => {
    post.mockResolvedValue(pieceDuServeur({ status: 'VALIDATED', number: '2026-0001' }));

    const piece = await validateCashVoucher(TENANT, 'piece-1');

    expect(piece.beneficiary).toBe('Mamadou Diallo, chef d’équipe');
    expect(piece.number).toBe('2026-0001');
  });
});
