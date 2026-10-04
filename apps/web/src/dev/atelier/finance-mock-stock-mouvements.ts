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
 * - **CIM-42 au Magasin central** et **CIM-42 au Dépôt de la Riviera** : le même
 *   article, dans deux lieux, à **deux coûts moyens différents** (4 750 et
 *   5 100 le sac). Le coût moyen est par (article, LIEU) — un coût global ne
 *   saurait pas dire ce que vaut le stock d'un dépôt.
 * - **FER-12 au Magasin central**, quantité **nulle** et valeur nulle : la
 *   ligne qui doit disparaître quand on coche « masquer les lignes à zéro », et
 *   qui rappelle qu'une quantité nulle emporte la valeur avec elle.
 * - **SAB-00 au Magasin central**, `18,75 m³` : la ligne qui prouve que les
 *   quantités portent **quatre décimales**. Affichée « 19 » ou « 0 », elle
 *   serait fausse.
 * - **TOL-BA au Dépôt de la Riviera** : un article **désactivé** qui garde son
 *   stock. Désactiver n'est pas supprimer — la marchandise est toujours là.
 *
 * **Mouvements** — sept, mêlant les quatre natures :
 *
 * - **deux RECEIPT du même jour, même facture** : la réception multi-lignes,
 *   qui écrit un mouvement PAR LIGNE et non un mouvement fourre-tout ;
 * - **une RECEIPT au Dépôt de la Riviera, plus chère** : c'est elle qui explique
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
 * **Lot 040.** Les lectures rendent `{ data, meta }` (valeurs visibles,
 * aucun lieu masqué) ; le journal porte bons, motifs, délais de saisie et
 * pièces jointes, plus un rebut et un retour au fournisseur ; la réception
 * rend son bon et ses contrôles, la sortie son bon multi-lignes ; les bons,
 * les factures réceptionnables et leurs réceptions sont servis ici. Le
 * contexte terrain et le carnet des preneurs sont servis par
 * `finance-mock-stock-controle.ts`.
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
import type {
  StockBalanceView,
  StockInvoiceReceiptsView,
  StockMeta,
  StockMovementAuthor,
  StockMovementView,
  StockReceivableInvoice,
  StockSlipView
} from '../../types/finance-stock-controle-types';
import type { Scenario } from './mock-api';

// ---------------------------------------------------------------------------
// Les identifiants, repris tels quels du sous-lot du référentiel
// ---------------------------------------------------------------------------

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const TOLE = 'article-tole-04';

const MAGASIN = 'lieu-magasin-01';
const DEPOT_RIVIERA = 'lieu-riviera-02';

const RIVIERA = 'chantier-riviera';
const COCODY = 'chantier-cocody';

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
  { id: MAGASIN, kind: 'WAREHOUSE', label: "Magasin central d'Angré", siteId: null, siteLabel: null, isActive: true },
  {
    id: DEPOT_RIVIERA,
    kind: 'SITE',
    label: 'Dépôt de la Villa Riviera',
    siteId: RIVIERA,
    siteLabel: 'Villa de la Riviera',
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
    locationLabel: "Magasin central d'Angré",
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
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
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
    locationLabel: "Magasin central d'Angré",
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
    locationLabel: "Magasin central d'Angré",
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
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
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
    locationLabel: "Magasin central d'Angré",
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
    createdByLabel: 'Aissatou Brou',
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
    locationLabel: "Magasin central d'Angré",
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
    createdByLabel: 'Aissatou Brou',
    createdAt: '2026-09-02T08:12:00.000Z'
  },
  // --- Réception plus chère ailleurs : d'où le coût moyen différent ---------
  {
    id: 'mvt-receipt-ciment-riviera',
    type: 'RECEIPT',
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
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
    createdByLabel: 'Aissatou Brou',
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
    locationLabel: "Magasin central d'Angré",
    movementDate: '2026-09-08T00:00:00.000Z',
    quantity: 80,
    isDecrease: true,
    // Valorisée au coût moyen du lieu AVANT la sortie, jamais saisie.
    unitCost: 4_700,
    totalValue: 376_000,
    currency: DEVISE,
    quantityAfter: 320,
    valueAfter: 1_504_000,
    siteId: RIVIERA,
    siteLabel: 'Villa de la Riviera',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Mamadou Kouassi, chef de chantier',
    supplierInvoiceReference: null,
    createdByLabel: 'Ibrahima Yao',
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
    locationLabel: "Magasin central d'Angré",
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
    siteId: COCODY,
    siteLabel: 'Résidence Cocody',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Fatoumata Kouadio, conductrice de travaux',
    supplierInvoiceReference: null,
    createdByLabel: 'Ibrahima Yao',
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
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
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
    createdByLabel: 'Aissatou Brou',
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
    locationLabel: "Magasin central d'Angré",
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
    createdByLabel: 'Aissatou Brou',
    createdAt: '2026-09-16T17:30:00.000Z'
  }
];

// ---------------------------------------------------------------------------
// Lot 040 — les formes du contrôle du stock : `{ data, meta }`, bons, factures
// ---------------------------------------------------------------------------

/**
 * Le `meta` des lectures. L'atelier montre l'écran d'une comptable : valeurs
 * visibles, aucun lieu masqué. Le magasinier sans valeurs a sa propre scène
 * (banc du contrôle, `finance-mock-stock-controle.ts`).
 */
const META: StockMeta = { valuesVisible: true, blindLocationIds: [], nextCursor: null };

const FACTURE_0142 = 'facture-0142';
const FACTURE_0151 = 'facture-0151';
const BON_RECEPTION = 'bon-br-2026-00042';
const BON_SORTIE = 'bon-bs-2026-00057';

/** Un solde du lot 5, dans la forme du lot 040 (champs de valeur `number | null`). */
function versSolde(solde: StockBalance): StockBalanceView {
  return { ...solde };
}

/**
 * Un mouvement du lot 5, complété des champs du lot 040 : bon, preneur,
 * motif, délai de saisie, pièces jointes. Les réceptions de la facture 0142
 * portent le bon BR-2026-00042 ; les sorties, le bon BS-2026-00057.
 */
function versMouvement(mouvement: StockMovement): StockMovementView {
  const jourSaisie = mouvement.createdAt.slice(0, 10);
  const jourDeclare = mouvement.movementDate.slice(0, 10);
  const delai = Math.round((Date.parse(jourSaisie) - Date.parse(jourDeclare)) / 86_400_000);
  const reception = mouvement.type === 'RECEIPT';
  const sortie = mouvement.type === 'ISSUE';
  return {
    ...mouvement,
    takerId: sortie ? 'preneur-kone' : null,
    takerLabel: sortie ? mouvement.requestedBy : null,
    supplierInvoiceId:
      mouvement.supplierInvoiceReference === 'F-2026-0142'
        ? FACTURE_0142
        : mouvement.supplierInvoiceReference
          ? FACTURE_0151
          : null,
    transferGroupId: mouvement.transferGroupId ?? null,
    stockCountId: null,
    slipId:
      reception && mouvement.supplierInvoiceReference === 'F-2026-0142' ? BON_RECEPTION : sortie ? BON_SORTIE : null,
    slipNumber:
      reception && mouvement.supplierInvoiceReference === 'F-2026-0142'
        ? 'BR-2026-00042'
        : sortie
          ? 'BS-2026-00057'
          : null,
    reasonCode:
      mouvement.type === 'ADJUSTMENT' ? 'COUNTING_ERROR' : mouvement.type === 'TRANSFER' ? 'SITE_SUPPLY' : null,
    reason: null,
    valuationSource: reception ? 'INVOICE_LINE' : null,
    supplierCreditValue: null,
    createdByUserId: mouvement.createdByLabel === 'Ibrahima Yao' ? 'u2' : 'u1',
    // Le délai entre la date déclarée et la saisie : la pastille « +n j ».
    entryLagDays: Math.max(0, delai),
    attachmentsCount: reception ? 2 : sortie ? 1 : 0
  };
}

/** Un rebut, pour que le journal montre les six natures. */
const REBUT: StockMovementView = {
  ...versMouvement(MOUVEMENTS[0]),
  id: 'mvt-scrap-ciment',
  type: 'SCRAP',
  movementDate: '2026-09-18T00:00:00.000Z',
  createdAt: '2026-09-22T09:40:00.000Z',
  quantity: 6,
  isDecrease: true,
  unitCost: 4_750,
  totalValue: 28_500,
  quantityAfter: 314,
  valueAfter: 1_491_500,
  supplierInvoiceId: null,
  supplierInvoiceReference: null,
  slipId: null,
  slipNumber: null,
  reasonCode: 'BREAKAGE',
  reason: 'Sacs éventrés par la pluie',
  valuationSource: null,
  // Saisi quatre jours après la date déclarée : pastille d'avertissement.
  entryLagDays: 4,
  attachmentsCount: 1
};

/** Un retour au fournisseur : la valeur sortie du stock et le montant porté au fournisseur. */
const RETOUR: StockMovementView = {
  ...versMouvement(MOUVEMENTS[0]),
  id: 'mvt-return-ciment',
  type: 'SUPPLIER_RETURN',
  movementDate: '2026-09-19T00:00:00.000Z',
  createdAt: '2026-09-19T15:10:00.000Z',
  quantity: 10,
  isDecrease: true,
  unitCost: 4_750,
  totalValue: 47_500,
  quantityAfter: 304,
  valueAfter: 1_444_000,
  slipId: null,
  slipNumber: null,
  reasonCode: 'DAMAGED_ON_DELIVERY',
  reason: null,
  valuationSource: null,
  supplierCreditValue: 47_000,
  entryLagDays: 0,
  attachmentsCount: 0
};

const JOURNAL: StockMovementView[] = [...MOUVEMENTS.map(versMouvement), REBUT, RETOUR];

const AUTEURS: StockMovementAuthor[] = [
  { userId: 'u1', label: 'Aissatou Brou' },
  { userId: 'u2', label: 'Ibrahima Yao' }
];

/** Les factures réceptionnables : l'une déjà reçue, l'autre jamais. */
const FACTURES: StockReceivableInvoice[] = [
  {
    id: FACTURE_0142,
    reference: 'F-2026-0142',
    supplierName: 'Quincaillerie du Niger',
    invoiceDate: '2026-09-01',
    siteId: null,
    siteName: null,
    receiptCount: 1,
    lastReceiptAt: '2026-09-02T08:12:00.000Z',
    amount: 2_198_500
  },
  {
    id: FACTURE_0151,
    reference: 'F-2026-0151',
    supplierName: 'Ciments d’Abidjan',
    invoiceDate: '2026-09-05',
    siteId: RIVIERA,
    siteName: 'Villa de la Riviera',
    receiptCount: 0,
    lastReceiptAt: null,
    amount: 408_000
  }
];

const RECEPTIONS_0142: StockInvoiceReceiptsView = {
  invoice: {
    id: FACTURE_0142,
    reference: 'F-2026-0142',
    supplierName: 'Quincaillerie du Niger',
    invoiceDate: '2026-09-01',
    status: 'VALIDATED',
    amount: 2_198_500,
    lines: [
      {
        id: 'ligne-0142-1',
        label: 'Ciment CPJ 42,5 — 400 sacs',
        quantity: 400,
        unitPrice: 4_700,
        amount: 1_880_000,
        hasUnitPrice: true
      },
      {
        id: 'ligne-0142-2',
        label: 'Fer à béton HA 12 — 170 barres',
        quantity: 170,
        unitPrice: 1_875,
        amount: 318_500,
        hasUnitPrice: true
      }
    ]
  },
  byItem: [
    {
      itemId: CIMENT,
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      receivedQuantity: 400,
      returnedQuantity: 10,
      returnableQuantity: 390,
      returnNeedsInvoiceLine: false,
      valuationSources: ['INVOICE_LINE']
    }
  ],
  receipts: [
    {
      slipId: BON_RECEPTION,
      slipNumber: 'BR-2026-00042',
      receiptDate: '2026-09-02',
      createdAt: '2026-09-02T08:12:00.000Z',
      createdByLabel: 'Aissatou Brou',
      locationLabel: "Magasin central d'Angré",
      lines: [
        {
          itemId: CIMENT,
          itemLabel: 'Ciment CPJ 42,5',
          itemUnit: 'sac',
          quantity: 400,
          unitCost: 4_700,
          totalValue: 1_880_000
        }
      ]
    }
  ],
  returns: [RETOUR],
  receivedValue: 1_880_000,
  returnedValue: 47_500
};

function receptionsDe(invoiceId: string): StockInvoiceReceiptsView {
  if (invoiceId === FACTURE_0142) return RECEPTIONS_0142;
  const facture = FACTURES.find(f => f.id === invoiceId) ?? FACTURES[1];
  return {
    invoice: {
      id: facture.id,
      reference: facture.reference,
      supplierName: facture.supplierName,
      invoiceDate: facture.invoiceDate,
      status: 'VALIDATED',
      amount: facture.amount,
      lines: [
        {
          id: `ligne-${facture.id}-1`,
          label: 'Ciment CPJ 42,5 — 80 sacs',
          quantity: 80,
          unitPrice: 5_100,
          amount: 408_000,
          hasUnitPrice: true
        }
      ]
    },
    byItem: [],
    receipts: [],
    returns: [],
    receivedValue: 0,
    returnedValue: 0
  };
}

function bonDe(slipId: string): StockSlipView {
  const sortie = slipId === BON_SORTIE;
  const mouvements = JOURNAL.filter(m => m.slipId === (sortie ? BON_SORTIE : BON_RECEPTION));
  return {
    id: sortie ? BON_SORTIE : BON_RECEPTION,
    kind: sortie ? 'ISSUE' : 'RECEIPT',
    number: sortie ? 'BS-2026-00057' : 'BR-2026-00042',
    documentDate: sortie ? '2026-09-11' : '2026-09-02',
    createdAt: sortie ? '2026-09-11T16:20:00.000Z' : '2026-09-02T08:12:00.000Z',
    location: { id: MAGASIN, label: "Magasin central d'Angré" },
    site: sortie ? { id: COCODY, name: 'Résidence Cocody' } : null,
    taker: sortie ? { id: 'preneur-kone', label: 'Fatoumata Kouadio, conductrice de travaux' } : null,
    requestedBy: sortie ? 'Fatoumata Kouadio, conductrice de travaux' : null,
    supplierInvoice: sortie
      ? null
      : { id: FACTURE_0142, reference: 'F-2026-0142', supplierName: 'Quincaillerie du Niger' },
    stockCountId: null,
    createdByLabel: sortie ? 'Ibrahima Yao' : 'Aissatou Brou',
    totalValue: mouvements.reduce((total, m) => total + (m.totalValue ?? 0), 0),
    currency: DEVISE,
    movements: mouvements,
    attachments: []
  };
}

export function repondreStockMouvements(chemin: string, scenario: Scenario): unknown | null {
  // --- Route C. L'état du stock -------------------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/balances$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : SOLDES.map(versSolde), meta: META };
  }

  // --- Le journal : auteurs (littéral, avant la liste) --------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/movements\/authors$/.test(chemin)) {
    return { success: true, data: AUTEURS };
  }

  // --- Route D. Le journal des mouvements, paginé par curseur -------------
  if (/\/tenants\/[^/]+\/finance\/stock\/movements$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : JOURNAL, meta: META };
  }

  // --- Route A. La réception : bon, mouvements et contrôles ---------------
  if (/\/tenants\/[^/]+\/finance\/stock\/receipts$/.test(chemin)) {
    return {
      success: true,
      data: {
        slip: {
          id: BON_RECEPTION,
          kind: 'RECEIPT',
          number: 'BR-2026-00042',
          documentDate: '2026-09-02',
          createdAt: '2026-09-02T08:12:00.000Z'
        },
        movements: [JOURNAL[0], JOURNAL[1]],
        controls: [
          {
            code: 'RECEIPT_REPEATED',
            severity: 'INFO',
            message:
              'Cette facture avait déjà une réception : vérifiez que cette marchandise n’a pas été saisie deux fois.',
            itemIds: [],
            amount: null,
            threshold: null,
            alertId: 'alerte-receipt-repeated-01'
          }
        ]
      },
      meta: META
    };
  }

  // --- Route B. La sortie multi-lignes : un bon, ses mouvements -----------
  if (/\/tenants\/[^/]+\/finance\/stock\/issues$/.test(chemin)) {
    return {
      success: true,
      data: {
        slip: {
          id: BON_SORTIE,
          kind: 'ISSUE',
          number: 'BS-2026-00057',
          documentDate: '2026-09-11',
          createdAt: '2026-09-11T16:20:00.000Z'
        },
        movements: JOURNAL.filter(m => m.slipId === BON_SORTIE)
      },
      meta: META
    };
  }

  // --- Rebut et retour au fournisseur -------------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/scraps$/.test(chemin)) {
    return { success: true, data: REBUT, meta: META };
  }
  if (/\/tenants\/[^/]+\/finance\/stock\/supplier-returns$/.test(chemin)) {
    return { success: true, data: RETOUR, meta: META };
  }

  // --- Les bons ------------------------------------------------------------
  const bonMatch = /\/tenants\/[^/]+\/finance\/stock\/slips\/([^/]+)$/.exec(chemin);
  if (bonMatch) {
    return { success: true, data: bonDe(bonMatch[1]), meta: META };
  }

  // --- Les factures réceptionnables et leurs réceptions -------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/receivable-invoices$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : FACTURES, meta: META };
  }
  const factureMatch = /\/tenants\/[^/]+\/finance\/stock\/supplier-invoices\/([^/]+)\/receipts$/.exec(chemin);
  if (factureMatch) {
    return { success: true, data: receptionsDe(factureMatch[1]), meta: META };
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
