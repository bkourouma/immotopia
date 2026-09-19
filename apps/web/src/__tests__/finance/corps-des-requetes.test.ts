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
import {
  createStockItem,
  createStockLocation,
  listStockItems,
  listStockLocations,
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
      requestedBy: 'Mamadou Diallo',
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
      requestedBy: '  Mamadou Diallo  ',
      issueDate: '2026-09-19'
    });

    const { corps } = dernierAppel();
    expect(corps.requestedBy).toBe('Mamadou Diallo');
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
  const CHANTIER = 'chantier-nongo';
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
    await createStockLocation(TENANT, { kind: 'WAREHOUSE', label: 'Magasin central de Kipé' });

    const { adresse, corps } = dernierAppel();
    expect(adresse).toBe(`/tenants/${TENANT}/finance/stock/locations`);
    expect(corps).toEqual({ kind: 'WAREHOUSE', label: 'Magasin central de Kipé' });
    // Le serveur REFUSE `siteId` pour un magasin, plutôt que de l'ignorer.
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('lieu de chantier : le chantier est dans le corps, et le corps ne porte rien d’autre', async () => {
    await createStockLocation(TENANT, { kind: 'SITE', label: 'Dépôt de la Villa de Nongo', siteId: CHANTIER });

    const { corps } = dernierAppel();
    expect(corps).toEqual({ kind: 'SITE', label: 'Dépôt de la Villa de Nongo', siteId: CHANTIER });
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

    await listStockItems(TENANT, { onlyActive: true, search: '  ciment  ' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items?onlyActive=true&search=ciment`);

    // Le serveur refuse la recherche VIDE (`.min(1)`) : la clé est omise.
    await listStockItems(TENANT, { search: '   ' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/items`);

    await listStockLocations(TENANT, { kind: 'SITE' });
    expect(getMock).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/stock/locations?kind=SITE`);
  });
});
