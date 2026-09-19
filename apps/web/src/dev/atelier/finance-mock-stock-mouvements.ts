/**
 * Atelier — fausse API du lot 5, deuxième sous-lot : réceptions, sorties et
 * valorisation.
 *
 * Modèle exact de `finance-mock-stock-referentiel.ts` : ce fichier appartient
 * en entier à l'agent qui construit `pages/finance/Stock.tsx`, jeux d'essai ET
 * réponses. Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts`
 * passe alors au gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Ce registre est réservé au superviseur.
 * `repondreStockMouvements` est prêt à y être ajouté :
 *
 * ```ts
 * import { repondreStockMouvements } from './finance-mock-stock-mouvements';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockMouvements
 * ```
 *
 * ---------------------------------------------------------------------------
 * Les identifiants sont ceux du sous-lot voisin, et c'est délibéré
 * ---------------------------------------------------------------------------
 *
 * `GET /stock/items` et `GET /stock/locations` appartiennent au **premier**
 * sous-lot du lot 5, et `finance-mock-stock-referentiel.ts` y répond déjà. Les
 * deux gestionnaires se recouvrent donc sur ces deux chemins, et c'est le
 * premier inscrit dans `mock-api.ts` qui l'emporte.
 *
 * Plutôt que d'inventer d'autres articles, ce fichier **reprend exactement les
 * identifiants, références et libellés** de celui du référentiel : quel que
 * soit l'ordre d'inscription, l'écran reste cohérent, et les soldes ci-dessous
 * désignent toujours les mêmes articles que les listes déroulantes. Le jour où
 * un seul des deux fichiers servira ces routes, rien ne bougera à l'écran.
 *
 * Les chantiers, postes, fournisseurs et factures ne sont **pas** servis ici :
 * `finance-mock-chantiers.ts` et `finance-mock-fournisseurs.ts` y répondent
 * déjà, et sont inscrits avant dans `mock-api.ts`.
 *
 * ---------------------------------------------------------------------------
 * Les cas montrés, et pourquoi chacun est là
 * ---------------------------------------------------------------------------
 *
 * **Soldes** — cinq lignes, choisies pour exercer chaque règle de l'écran :
 *
 * - **CIM-42 au Magasin central** et **CIM-42 au Dépôt de Nongo** : le même
 *   article, dans deux lieux, à **deux coûts moyens différents** (4 750 et
 *   5 100 le sac). Le coût moyen est par (article, LIEU) — un coût global ne
 *   saurait pas dire ce que vaut le stock d'un dépôt.
 * - **FER-12 au Magasin central**, quantité **nulle** et valeur nulle : la
 *   ligne qui doit disparaître quand on coche « masquer les lignes à zéro », et
 *   qui rappelle qu'une quantité nulle emporte la valeur avec elle.
 * - **SAB-00 au Magasin central**, `18,75 m³` : la ligne qui prouve que les
 *   quantités portent **quatre décimales**. Affichée « 19 » ou « 0 », elle
 *   serait fausse.
 * - **TOL-BA au Dépôt de Nongo** : un article **désactivé** qui garde son
 *   stock. Désactiver n'est pas supprimer — la marchandise est toujours là.
 *
 * **Mouvements** — sept, mêlant les quatre natures :
 *
 * - **deux RECEIPT du même jour, même facture** : la réception multi-lignes,
 *   qui écrit un mouvement PAR LIGNE et non un mouvement fourre-tout ;
 * - **une RECEIPT au Dépôt de Nongo, plus chère** : c'est elle qui explique
 *   que le coût moyen y soit différent ;
 * - **deux ISSUE vers des chantiers**, avec demandeur et poste. La seconde
 *   **vide l'emplacement** : `quantity × unitCost` y vaut 47 500 alors que
 *   `totalValue` vaut 47 503 — la valeur résiduelle partie avec la dernière
 *   sortie. C'est exactement le cas que l'écran ne doit jamais « corriger » en
 *   recalculant le total ;
 * - **un TRANSFER** entre deux lieux, et **un ADJUSTMENT** d'inventaire : deux
 *   natures qui n'imputent aucun chantier, et dont la colonne « Chantier
 *   imputé » doit dire « Aucune imputation » plutôt que rester vide.
 *
 * **Limite assumée, identique à celle des autres fichiers de l'atelier.**
 * `mock-api.ts` route par le seul CHEMIN, jamais par la méthode, et ne
 * transmet pas les paramètres de requête : ni `onlyInStock`, ni les filtres du
 * journal ne sont honorés ici, et `POST /stock/receipts` comme
 * `POST /stock/issues` rendent une réponse toute faite. Les filtres et les
 * corps envoyés sont couverts par les tests d'écran, service réel et
 * `apiClient` simulé (`__tests__/finance/stock.test.tsx`).
 */

import type {
  StockBalance,
  StockItemRef,
  StockLocationRef,
  StockMovement
} from '../../types/finance-stock-mouvements-types';
import type { Scenario } from './mock-api';

// ---------------------------------------------------------------------------
// Les identifiants, repris tels quels du sous-lot du référentiel
// ---------------------------------------------------------------------------

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const TOLE = 'article-tole-04';

const MAGASIN = 'lieu-magasin-01';
const DEPOT_NONGO = 'lieu-nongo-02';

const NONGO = 'chantier-nongo';
const RATOMA = 'chantier-ratoma';

const DEVISE = 'XOF';

// ---------------------------------------------------------------------------
// Le référentiel, vu d'ici — miroir de lecture (voir l'en-tête)
// ---------------------------------------------------------------------------

const ARTICLES: StockItemRef[] = [
  {
    id: CIMENT,
    reference: 'CIM-42',
    label: 'Ciment CPJ 42,5',
    unit: 'sac',
    category: 'Gros œuvre',
    // Un poste PROPOSÉ : pré-sélectionné à la sortie, et modifiable là.
    defaultCostCategoryId: 'poste-gros-oeuvre',
    defaultCostCategoryLabel: 'Gros œuvre',
    isActive: true
  },
  {
    id: FER,
    reference: 'FER-12',
    label: 'Fer à béton HA 12',
    unit: 'barre',
    category: 'Gros œuvre',
    // AUCUN poste proposé, et c'est un cas normal : la sortie demandera le
    // sien, comme pour tout article.
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true
  },
  {
    id: SABLE,
    reference: 'SAB-00',
    label: 'Sable lavé',
    unit: 'm³',
    category: null,
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true
  },
  {
    id: TOLE,
    reference: 'TOL-BA',
    label: 'Tôle bac alu 6 m',
    unit: 'tôle',
    category: 'Couverture',
    defaultCostCategoryId: 'poste-couverture',
    defaultCostCategoryLabel: 'Couverture',
    // Désactivé, et pourtant en stock : désactiver n'est pas supprimer.
    isActive: false
  }
];

const LIEUX: StockLocationRef[] = [
  { id: MAGASIN, kind: 'WAREHOUSE', label: 'Magasin central de Kipé', siteId: null, siteLabel: null, isActive: true },
  {
    id: DEPOT_NONGO,
    kind: 'SITE',
    label: 'Dépôt de la Villa de Nongo',
    siteId: NONGO,
    siteLabel: 'Villa de Nongo',
    isActive: true
  }
];

// ---------------------------------------------------------------------------
// Les soldes — ce qu'il reste, et ce que ça vaut (besoin S4)
// ---------------------------------------------------------------------------

const SOLDES: StockBalance[] = [
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 320,
    value: 1_520_000,
    // 1 520 000 / 320. Déduit par le serveur, jamais stocké.
    averageUnitCost: 4_750,
    currency: DEVISE
  },
  {
    // LE MÊME ARTICLE, dans un autre lieu, à un coût moyen DIFFÉRENT : on y a
    // reçu plus cher. Un coût moyen global ne saurait pas le dire.
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: DEPOT_NONGO,
    locationLabel: 'Dépôt de la Villa de Nongo',
    quantity: 80,
    value: 408_000,
    averageUnitCost: 5_100,
    currency: DEVISE
  },
  {
    // QUANTITÉ NULLE, et valeur nulle avec elle : la dernière sortie a emporté
    // la valeur résiduelle. Le coût moyen vaut zéro, et non `null` — la
    // quantité dit déjà qu'il n'y a rien.
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 0,
    value: 0,
    averageUnitCost: 0,
    currency: DEVISE
  },
  {
    // QUATRE DÉCIMALES : « 18,75 m³ », jamais « 19 » ni « 0 ».
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    quantity: 18.75,
    value: 243_750,
    averageUnitCost: 13_000,
    currency: DEVISE
  },
  {
    // Article désactivé, stock intact.
    itemId: TOLE,
    itemReference: 'TOL-BA',
    itemLabel: 'Tôle bac alu 6 m',
    itemUnit: 'tôle',
    locationId: DEPOT_NONGO,
    locationLabel: 'Dépôt de la Villa de Nongo',
    quantity: 42,
    value: 1_260_000,
    averageUnitCost: 30_000,
    currency: DEVISE
  }
];

// ---------------------------------------------------------------------------
// Le journal — les quatre natures mêlées
// ---------------------------------------------------------------------------

const MOUVEMENTS: StockMovement[] = [
  // --- Réception à deux lignes : UN MOUVEMENT PAR LIGNE, même facture -------
  {
    id: 'mvt-receipt-ciment',
    type: 'RECEIPT',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-02T00:00:00.000Z',
    quantity: 400,
    isDecrease: false,
    unitCost: 4_700,
    totalValue: 1_880_000,
    currency: DEVISE,
    quantityAfter: 400,
    valueAfter: 1_880_000,
    // Une réception n'impute AUCUN chantier : la facture a déjà porté la
    // valeur, et c'est la sortie qui imputera.
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: 'F-2026-0142',
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-02T08:12:00.000Z'
  },
  {
    id: 'mvt-receipt-sable',
    type: 'RECEIPT',
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-02T00:00:00.000Z',
    // Quatre décimales dès la réception.
    quantity: 24.5,
    isDecrease: false,
    unitCost: 13_000,
    totalValue: 318_500,
    currency: DEVISE,
    quantityAfter: 24.5,
    valueAfter: 318_500,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    // MÊME facture que la ligne précédente : une réception, deux lignes.
    supplierInvoiceReference: 'F-2026-0142',
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-02T08:12:00.000Z'
  },
  // --- Réception plus chère ailleurs : d'où le coût moyen différent ---------
  {
    id: 'mvt-receipt-ciment-nongo',
    type: 'RECEIPT',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: DEPOT_NONGO,
    locationLabel: 'Dépôt de la Villa de Nongo',
    movementDate: '2026-09-05T00:00:00.000Z',
    quantity: 80,
    isDecrease: false,
    // Livré sur place, transport compris : plus cher qu'au magasin, et c'est
    // pourquoi le coût moyen y est de 5 100 et non de 4 750.
    unitCost: 5_100,
    totalValue: 408_000,
    currency: DEVISE,
    quantityAfter: 80,
    valueAfter: 408_000,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: 'F-2026-0151',
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-05T09:40:00.000Z'
  },
  // --- Sorties : le geste qui impute ---------------------------------------
  {
    id: 'mvt-issue-ciment',
    type: 'ISSUE',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-08T00:00:00.000Z',
    quantity: 80,
    isDecrease: true,
    // Valorisée au coût moyen du lieu AVANT la sortie, jamais saisie.
    unitCost: 4_700,
    totalValue: 376_000,
    currency: DEVISE,
    quantityAfter: 320,
    valueAfter: 1_504_000,
    siteId: NONGO,
    siteLabel: 'Villa de Nongo',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Mamadou Diallo, chef de chantier',
    supplierInvoiceReference: null,
    createdByLabel: 'Ibrahima Sow',
    createdAt: '2026-09-08T07:55:00.000Z'
  },
  {
    // LA SORTIE QUI VIDE L'EMPLACEMENT. `quantity × unitCost` vaut 47 500,
    // mais `totalValue` vaut 47 503 : la dernière sortie emporte la valeur
    // résiduelle, et l'écart d'arrondi est logé ici, où on peut le voir. Un
    // écran qui recalculerait le total afficherait 47 500 et mentirait de
    // trois francs — chaque mois un peu plus.
    id: 'mvt-issue-fer',
    type: 'ISSUE',
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-11T00:00:00.000Z',
    quantity: 25,
    isDecrease: true,
    unitCost: 1_900,
    totalValue: 47_503,
    currency: DEVISE,
    quantityAfter: 0,
    // La quantité tombe à zéro, la valeur aussi : sans cette règle, un
    // résidu resterait sur un stock inexistant.
    valueAfter: 0,
    siteId: RATOMA,
    siteLabel: 'Résidence Ratoma',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Fatoumata Camara, conductrice de travaux',
    supplierInvoiceReference: null,
    createdByLabel: 'Ibrahima Sow',
    createdAt: '2026-09-11T16:20:00.000Z'
  },
  // --- Transfert : aucune imputation ---------------------------------------
  {
    id: 'mvt-transfer-tole',
    type: 'TRANSFER',
    itemId: TOLE,
    itemReference: 'TOL-BA',
    itemLabel: 'Tôle bac alu 6 m',
    itemUnit: 'tôle',
    locationId: DEPOT_NONGO,
    locationLabel: 'Dépôt de la Villa de Nongo',
    movementDate: '2026-09-14T00:00:00.000Z',
    quantity: 42,
    isDecrease: false,
    unitCost: 30_000,
    totalValue: 1_260_000,
    currency: DEVISE,
    quantityAfter: 42,
    valueAfter: 1_260_000,
    // Déplacer n'impute rien : la matière change de place, pas de
    // propriétaire ni de coût.
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: null,
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-14T11:05:00.000Z'
  },
  // --- Ajustement d'inventaire : la réponse juste à un écart ---------------
  {
    id: 'mvt-adjustment-sable',
    type: 'ADJUSTMENT',
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: 'Magasin central de Kipé',
    movementDate: '2026-09-16T00:00:00.000Z',
    // Un quart de mètre cube : la valeur qui s'afficherait « 0 » si on la
    // passait au formateur monétaire.
    quantity: 0.25,
    isDecrease: true,
    unitCost: 13_000,
    totalValue: 3_250,
    currency: DEVISE,
    quantityAfter: 18.75,
    valueAfter: 243_750,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: null,
    createdByLabel: 'Aissatou Barry',
    createdAt: '2026-09-16T17:30:00.000Z'
  }
];

/** La réponse d'une réception : un mouvement PAR LIGNE, jamais un seul objet. */
const RECEPTION_CREEE: StockMovement[] = [MOUVEMENTS[0], MOUVEMENTS[1]];

/** La réponse d'une sortie : un seul mouvement, valorisé par le serveur. */
const SORTIE_CREEE: StockMovement = MOUVEMENTS[3];

export function repondreStockMouvements(chemin: string, scenario: Scenario): unknown | null {
  // --- Route C. L'état du stock -------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/balances$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : SOLDES };
  }

  // --- Route D. Le journal des mouvements ---------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/movements$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : MOUVEMENTS };
  }

  // --- Route A. La réception ----------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/receipts$/.test(chemin)) {
    return { success: true, data: RECEPTION_CREEE };
  }

  // --- Route B. La sortie --------------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/issues$/.test(chemin)) {
    return { success: true, data: SORTIE_CREEE };
  }

  // --- Le référentiel, appelé directement. Voir l'en-tête : ces deux
  //     branches font doublon avec `finance-mock-stock-referentiel.ts`, et les
  //     identifiants sont volontairement les mêmes des deux côtés.
  if (/\/tenants\/[^/]+\/finance\/stock\/items$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : ARTICLES };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/locations$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : LIEUX };
  }

  return null;
}
