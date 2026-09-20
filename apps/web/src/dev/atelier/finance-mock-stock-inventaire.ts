/**
 * Atelier — fausse API du lot 5, troisième sous-lot : les transferts entre
 * lieux et l'inventaire physique.
 *
 * Modèle exact de `finance-mock-stock-referentiel.ts` : ce fichier appartient
 * en entier à l'agent qui construit cet écran, jeux d'essai ET réponses. Il
 * renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — est un fichier-registre réservé au
 * superviseur. `repondreStockInventaire` est prêt à y être ajouté :
 *
 * ```ts
 * import { repondreStockInventaire } from './finance-mock-stock-inventaire';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockInventaire
 * ```
 *
 * **Attention à l'ordre de cette liste.** Ce fichier et
 * `finance-mock-stock-referentiel.ts` répondent tous deux à
 * `/stock/items`, `/stock/locations` — les deux écrans lisent le même
 * référentiel. Le premier inscrit gagne, et les deux rendent la même forme :
 * l'ordre est sans conséquence ici, mais il est signalé pour que l'ajout d'un
 * troisième ne se fasse pas à l'aveugle.
 *
 * ---------------------------------------------------------------------------
 * Les cas montrés, et pourquoi chacun est là
 * ---------------------------------------------------------------------------
 *
 * **Un comptage en BROUILLON**, sur le magasin central, avec quatre lignes qui
 * exercent chacune une règle :
 *
 * - **CIM-42, ciment** — comptage conforme, écart nul. Le cas qui ne produira
 *   aucun ajustement à la validation, et qui ne réclame aucun motif.
 * - **FER-12, fer à béton** — il MANQUE 12 barres, et le motif est là (« vol
 *   constaté »). L'écart justifié : la validation l'accepte.
 * - **SAB-00, sable lavé** — il manque 0,25 m³, et **aucun motif**. C'est la
 *   ligne qui doit BLOQUER la validation (besoin S6), et c'est aussi celle qui
 *   prouve qu'une quantité s'affiche avec ses décimales : un quart de mètre
 *   cube n'est pas « 0 ».
 * - **TOL-BA, tôle** — on a trouvé PLUS que ce que le système disait (+3), avec
 *   son motif. L'écart va dans les deux sens, et l'écran doit le montrer signé.
 *
 * `varianceValue` y est **négative** : l'agence a perdu plus qu'elle n'a
 * retrouvé. Les nombres sont volontairement incohérents avec toute formule —
 * un écran qui recalculerait au lieu d'afficher ce que le serveur envoie
 * tomberait ici.
 *
 * **Un comptage VALIDÉ**, sur le dépôt du chantier de la Riviera, avec sa date de
 * validation et une ligne en écart justifiée. Il montre l'état où plus aucun
 * geste n'est offert : aucune route ne défait un inventaire validé, et l'écran
 * n'en propose aucun bouton.
 *
 * **Un transfert** du magasin central vers le lieu du chantier de la Riviera : le
 * cas exact du piège de ce sous-lot. Les deux mouvements sont là, liés par leur
 * `transferGroupId`, la sortie d'abord et l'entrée ensuite, et la valeur
 * déplacée vaut la même chose des deux côtés — transférer ne crée ni ne détruit
 * de valeur, et **n'impute aucun chantier**.
 *
 * Les articles et les lieux sont redonnés ici, avec les mêmes identifiants que
 * `finance-mock-stock-referentiel.ts`, plutôt qu'importés de lui : ce fichier
 * appartient à un autre agent, même raison qu'aux sous-lots précédents.
 *
 * **Limite assumée, identique à celle des autres mocks.** `mock-api.ts` route
 * par le seul CHEMIN, jamais par la méthode, et ne transmet pas les paramètres
 * de requête : `GET /stock/counts` (liste) et `POST /stock/counts` (ouverture)
 * retombent sur la même branche, qui rend la forme de la LISTE quel que soit le
 * verbe, sans filtrer sur `locationId` ni `status`. Les créations, les saisies
 * de ligne et la validation sont couvertes par le test d'écran, service réel et
 * `apiClient` simulé (`__tests__/finance/stock-inventaire.test.tsx`).
 */

import type {
  StockBalanceRef,
  StockCount,
  StockItemRef,
  StockLocationRef,
  StockTransfer
} from '../../types/finance-stock-inventaire-types';
import type { Scenario } from './mock-api';

const DEVISE = 'XOF';

// ---------------------------------------------------------------------------
// Le référentiel lu chez les voisins — mêmes identifiants que le sous-lot 1
// ---------------------------------------------------------------------------

const CIMENT = 'article-ciment-01';
const FER = 'article-fer-02';
const SABLE = 'article-sable-03';
const TOLE = 'article-tole-04';

const ARTICLES: StockItemRef[] = [
  { id: CIMENT, reference: 'CIM-42', label: 'Ciment CPJ 42,5', unit: 'sac', isActive: true },
  { id: FER, reference: 'FER-12', label: 'Fer à béton HA 12', unit: 'barre', isActive: true },
  // Le PRD donne « m³ » en exemple : c'est l'article aux décimales.
  { id: SABLE, reference: 'SAB-00', label: 'Sable lavé', unit: 'm³', isActive: true },
  { id: TOLE, reference: 'TOL-BA', label: 'Tôle bac alu 6 m', unit: 'tôle', isActive: true }
];

const MAGASIN = 'lieu-magasin-01';
const DEPOT_RIVIERA = 'lieu-riviera-02';

const LIEUX: StockLocationRef[] = [
  {
    id: MAGASIN,
    kind: 'WAREHOUSE',
    label: "Magasin central d'Angré",
    siteId: null,
    siteLabel: null,
    isActive: true
  },
  {
    id: DEPOT_RIVIERA,
    kind: 'SITE',
    label: 'Dépôt de la Villa Riviera',
    siteId: 'chantier-riviera',
    siteLabel: 'Villa de la Riviera',
    isActive: true
  }
];

/**
 * Ce qu'il reste, par (article, lieu).
 *
 * Sert à deux choses à l'écran : annoncer le stock du lieu d'origine avant un
 * transfert, et dire ce que le système croit au moment de saisir une ligne de
 * comptage. Ni l'un ni l'autre n'est une autorité — c'est le serveur qui fige
 * l'attendu, et c'est lui qui refuse une quantité trop grande.
 */
const SOLDES: StockBalanceRef[] = [
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    quantity: 420,
    value: 33_600_000,
    averageUnitCost: 80_000,
    currency: DEVISE
  },
  {
    itemId: FER,
    itemReference: 'FER-12',
    itemLabel: 'Fer à béton HA 12',
    itemUnit: 'barre',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    quantity: 188,
    value: 13_160_000,
    averageUnitCost: 70_000,
    currency: DEVISE
  },
  {
    itemId: SABLE,
    itemReference: 'SAB-00',
    itemLabel: 'Sable lavé',
    itemUnit: 'm³',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    // Un quart de mètre cube : la valeur qui s'afficherait « 12 » si quelqu'un
    // rendait cette quantité avec le formateur monétaire.
    quantity: 12.25,
    value: 3_675_000,
    averageUnitCost: 300_000,
    currency: DEVISE
  },
  {
    itemId: TOLE,
    itemReference: 'TOL-BA',
    itemLabel: 'Tôle bac alu 6 m',
    itemUnit: 'tôle',
    locationId: MAGASIN,
    locationLabel: "Magasin central d'Angré",
    quantity: 60,
    value: 7_200_000,
    averageUnitCost: 120_000,
    currency: DEVISE
  },
  {
    itemId: CIMENT,
    itemReference: 'CIM-42',
    itemLabel: 'Ciment CPJ 42,5',
    itemUnit: 'sac',
    locationId: DEPOT_RIVIERA,
    locationLabel: 'Dépôt de la Villa Riviera',
    quantity: 75,
    value: 6_000_000,
    averageUnitCost: 80_000,
    currency: DEVISE
  }
];

// ---------------------------------------------------------------------------
// Le comptage en brouillon — quatre lignes, quatre règles
// ---------------------------------------------------------------------------

const COMPTAGE_BROUILLON: StockCount = {
  id: 'comptage-brouillon-01',
  tenantId: 'agence-1',
  locationId: MAGASIN,
  locationLabel: "Magasin central d'Angré",
  countedAt: '2026-09-18T00:00:00.000Z',
  status: 'DRAFT',
  lines: [
    {
      // Conforme : aucun écart, aucun motif à donner, aucun ajustement à venir.
      id: 'ligne-ciment',
      itemId: CIMENT,
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      expectedQuantity: 420,
      countedQuantity: 420,
      variance: 0,
      reason: null
    },
    {
      // Il MANQUE, et c'est justifié : la validation acceptera cette ligne.
      id: 'ligne-fer',
      itemId: FER,
      itemReference: 'FER-12',
      itemLabel: 'Fer à béton HA 12',
      itemUnit: 'barre',
      expectedQuantity: 200,
      countedQuantity: 188,
      variance: -12,
      reason: 'Vol constaté sur le dépôt, plainte déposée le 17 septembre.'
    },
    {
      // Écart SANS motif : c'est cette ligne qui bloque la validation (S6).
      // Et c'est aussi le quart de mètre cube qui ne doit pas s'afficher « 0 ».
      id: 'ligne-sable',
      itemId: SABLE,
      itemReference: 'SAB-00',
      itemLabel: 'Sable lavé',
      itemUnit: 'm³',
      expectedQuantity: 12.5,
      countedQuantity: 12.25,
      variance: -0.25,
      reason: null
    },
    {
      // On a trouvé PLUS : l'écart va dans les deux sens.
      id: 'ligne-tole',
      itemId: TOLE,
      itemReference: 'TOL-BA',
      itemLabel: 'Tôle bac alu 6 m',
      itemUnit: 'tôle',
      expectedQuantity: 57,
      countedQuantity: 60,
      variance: 3,
      reason: 'Trois tôles retrouvées derrière la réserve, jamais sorties du magasin.'
    }
  ],
  // Calculés par le serveur. Volontairement pas déductibles des lignes
  // ci-dessus : un écran qui recalculerait tomberait ici.
  varianceCount: 3,
  varianceValue: -827_500,
  currency: DEVISE,
  createdByLabel: 'Mariama Kouassi',
  validatedAt: null
};

// ---------------------------------------------------------------------------
// Le comptage validé — plus aucun geste n'est offert
// ---------------------------------------------------------------------------

const COMPTAGE_VALIDE: StockCount = {
  id: 'comptage-valide-02',
  tenantId: 'agence-1',
  locationId: DEPOT_RIVIERA,
  locationLabel: 'Dépôt de la Villa Riviera',
  countedAt: '2026-08-31T00:00:00.000Z',
  status: 'VALIDATED',
  lines: [
    {
      id: 'ligne-valide-ciment',
      itemId: CIMENT,
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      expectedQuantity: 80,
      countedQuantity: 75,
      variance: -5,
      reason: 'Casse au déchargement : cinq sacs éventrés.'
    },
    {
      id: 'ligne-valide-fer',
      itemId: FER,
      itemReference: 'FER-12',
      itemLabel: 'Fer à béton HA 12',
      itemUnit: 'barre',
      expectedQuantity: 40,
      countedQuantity: 40,
      variance: 0,
      reason: null
    }
  ],
  varianceCount: 1,
  varianceValue: -400_000,
  currency: DEVISE,
  createdByLabel: 'Ibrahima Kouadio',
  validatedAt: '2026-09-01T09:15:00.000Z'
};

const COMPTAGES: StockCount[] = [COMPTAGE_BROUILLON, COMPTAGE_VALIDE];

// ---------------------------------------------------------------------------
// Le transfert — du magasin vers le lieu d'un chantier
//
// Le cas exact du piège : cela RESSEMBLE à une livraison qu'on facturerait au
// chantier, et cela n'impute rien. Aucune écriture, aucun coût de chantier.
// ---------------------------------------------------------------------------

const TRANSFERT: StockTransfer = {
  transferGroupId: 'transfert-01',
  movements: [
    {
      id: 'mouvement-sortie-01',
      type: 'TRANSFER_OUT',
      itemId: CIMENT,
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      locationId: MAGASIN,
      locationLabel: "Magasin central d'Angré",
      movementDate: '2026-09-19T00:00:00.000Z',
      // Toujours positive : c'est `isDecrease` qui dit le sens.
      quantity: 50,
      isDecrease: true,
      unitCost: 80_000,
      totalValue: 4_000_000,
      currency: DEVISE,
      quantityAfter: 370,
      valueAfter: 29_600_000
    },
    {
      id: 'mouvement-entree-01',
      type: 'TRANSFER_IN',
      itemId: CIMENT,
      itemReference: 'CIM-42',
      itemLabel: 'Ciment CPJ 42,5',
      itemUnit: 'sac',
      locationId: DEPOT_RIVIERA,
      locationLabel: 'Dépôt de la Villa Riviera',
      movementDate: '2026-09-19T00:00:00.000Z',
      quantity: 50,
      isDecrease: false,
      // La valeur part au coût moyen du lieu d'ORIGINE : la somme des deux
      // lieux ne bouge pas d'un franc.
      unitCost: 80_000,
      totalValue: 4_000_000,
      currency: DEVISE,
      quantityAfter: 125,
      valueAfter: 10_000_000
    }
  ],
  fromLocationLabel: "Magasin central d'Angré",
  toLocationLabel: 'Dépôt de la Villa Riviera',
  quantity: 50,
  // La valeur DÉPLACÉE. Pas une dépense, et l'écran ne doit pas la présenter
  // comme telle.
  value: 4_000_000,
  currency: DEVISE
};

export function repondreStockInventaire(chemin: string, scenario: Scenario): unknown | null {
  // --- Le transfert. Chemin littéral, monté en premier. -------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/transfers$/.test(chemin)) {
    return { success: true, data: TRANSFERT };
  }

  // --- Validation d'un comptage. AVANT le détail paramétré, sans quoi
  //     `:countId` avalerait le segment `validate` — l'ordre tenu côté
  //     serveur, tenu ici aussi.
  const validation = /\/tenants\/[^/]+\/finance\/stock\/counts\/([^/]+)\/validate$/.exec(chemin);
  if (validation) {
    const source = COMPTAGES.find(candidat => candidat.id === validation[1]) ?? COMPTAGE_BROUILLON;
    // Ce que le serveur rend après validation : l'état bascule, et la date de
    // validation apparaît. Les lignes ne bougent pas — ce sont des MOUVEMENTS
    // que la validation écrit, pas des lignes de comptage.
    return {
      success: true,
      data: { ...source, status: 'VALIDATED', validatedAt: '2026-09-19T12:00:00.000Z' }
    };
  }

  // --- Saisie et retrait d'une ligne. Les deux chemins finissent par un
  //     segment fixe ou par l'article ; tous deux rendent le comptage entier.
  const ligne = /\/tenants\/[^/]+\/finance\/stock\/counts\/([^/]+)\/lines(\/[^/]+)?$/.exec(chemin);
  if (ligne) {
    const source = COMPTAGES.find(candidat => candidat.id === ligne[1]) ?? COMPTAGE_BROUILLON;
    return { success: true, data: source };
  }

  // --- Liste des comptages ET ouverture partagent leur chemin -------------
  if (/\/tenants\/[^/]+\/finance\/stock\/counts$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : COMPTAGES };
  }

  // --- Détail d'un comptage. EN DERNIER sous `/stock/counts/`. ------------
  const detail = /\/tenants\/[^/]+\/finance\/stock\/counts\/([^/]+)$/.exec(chemin);
  if (detail) {
    const trouve = COMPTAGES.find(candidat => candidat.id === detail[1]) ?? COMPTAGE_BROUILLON;
    return { success: true, data: trouve };
  }

  // --- Le référentiel lu chez les voisins ---------------------------------
  if (/\/tenants\/[^/]+\/finance\/stock\/items$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : ARTICLES };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/locations$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : LIEUX };
  }

  if (/\/tenants\/[^/]+\/finance\/stock\/balances$/.test(chemin)) {
    return { success: true, data: scenario === 'vide' ? [] : SOLDES };
  }

  return null;
}
