/**
 * Atelier — fausse API du lot 4, sixième et dernier sous-lot : les lots d'un
 * chantier, leur coût de revient, et la clôture.
 *
 * Modèle exact de `finance-mock-salaries.ts` : ce fichier appartient en entier
 * à l'agent qui construit cet écran, jeux d'essai ET réponses. Il renvoie
 * `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors au
 * gestionnaire suivant.
 *
 * **Non câblé dans `mock-api.ts`.** Cet agent ne modifie que les fichiers de
 * son périmètre ; `mock-api.ts` — le registre qui ajoute chaque `repondreXxx`
 * à la liste consultée par l'adaptateur — n'en fait pas partie.
 * `repondreSiteClosing` est prêt à y être ajouté, sur le même modèle que
 * `repondreSalaries` :
 *
 * ```ts
 * import { repondreSiteClosing } from './finance-mock-site-closing';
 * // dans la liste `for (const repondre of [...])` :
 * repondreSiteClosing
 * ```
 *
 * ---------------------------------------------------------------------------
 * Cinq chantiers, cinq états que l'écran doit distinguer
 * ---------------------------------------------------------------------------
 *
 * Le cas heureux seul ne prouve rien : un écran qui n'a jamais vu un chantier
 * sans clé affiche des parts à zéro sans s'en apercevoir.
 *
 * - `chantier-ouvert-01` — **ouvert, avec des lots, réparti à la surface.**
 *   Le coût de revient y est une ESTIMATION, et c'est la mention que l'écran
 *   doit afficher. Aucun bloqueur : la clôture est possible.
 * - `chantier-clos-01` — **clos**, réparti par quotes-parts saisies, et l'un
 *   de ses trois lots (`lot-clos-a`) a DÉJÀ BASCULÉ au patrimoine. Deux choses
 *   à la fois : le coût y est définitif, et la réouverture est refusée. C'est
 *   la scène la plus dense, et volontairement.
 * - `chantier-bloque-01` — **ouvert, avec deux bloqueurs** (une facture
 *   fournisseur et trois pièces de caisse en brouillon). Le geste de clôture
 *   doit être désactivé et les deux raisons listées, avec leur nombre.
 * - `chantier-sans-cle-01` — **aucune clé posée.** Les lots existent, mais
 *   leur part vaut zéro et leur coût de revient aussi, si bien que
 *   `unallocatedCost` vaut le coût ENTIER. Le commentaire du contrat gelé
 *   annonce le contraire (« zéro dès qu'il en a un ») ; c'est l'implémentation
 *   qui a raison — `unallocatedCost = totalCost − somme des coûts de revient`
 *   — et cette scène existe pour que l'écran soit lu contre le comportement
 *   réel, pas contre la phrase du contrat.
 * - `chantier-sans-lot-01` — **aucun lot.** `unallocatedCost` vaut alors le
 *   coût entier : un chantier qui coûte et ne produit rien est un cas réel, et
 *   l'écran doit le montrer plutôt qu'un tableau vide sous un total.
 *
 * **Les messages de bloqueurs sont ceux du serveur, mot pour mot**
 * (`blockerMessage` dans `packages/api/src/lib/finance/site-closing.ts`) :
 * l'écran les affiche tels quels, et un faux message qui ne leur ressemblerait
 * pas ferait paraître lisible un rendu qui ne l'est pas.
 *
 * **Aucun montant n'est recalculé ici**, pas plus qu'à l'écran : les parts et
 * les coûts de revient sont posés à la main, comme le serveur les émettrait.
 * Ils sont d'ailleurs volontairement cohérents entre eux (somme des
 * `costPrice` = `totalCost`) sans qu'aucune formule ne les produise — c'est le
 * serveur qui répartit le reliquat d'arrondi sur le premier lot, pas ce
 * fichier.
 *
 * ---------------------------------------------------------------------------
 * Deux limites assumées, héritées de `mock-api.ts`
 * ---------------------------------------------------------------------------
 *
 * **Le verbe est ignoré.** `mock-api.ts` route par le seul CHEMIN : la paire
 * GET liste / POST création qui partage `sites/{id}/lots` retombe sur la même
 * branche et rend la forme de la LISTE quel que soit le verbe, et la paire
 * PATCH correction / DELETE suppression sur `sites/{id}/lots/{lotId}` rend la
 * forme du LOT. L'ajout et la suppression d'un lot ne sont donc pas
 * démontrables de bout en bout ici ; ils sont couverts par les tests unitaires
 * de l'écran (`__tests__/finance/cloture-chantier.test.tsx`), `apiClient`
 * simulé.
 *
 * **La fausse API n'a pas d'état.** Clôturer dans l'atelier rend bien un
 * enregistrement de clôture, mais la lecture suivante du chantier ouvert le
 * redonne ouvert. Pour VOIR un chantier clos, on ouvre la scène
 * `chantier-clos-01`. Une fausse API à état ferait diverger l'atelier du
 * serveur sans que rien ne le signale.
 */

import type {
  CapitalizedLot,
  SiteClosure,
  SiteClosureBlocker,
  SiteCostBreakdown,
  SiteLot
} from '../../types/finance-site-closing-types';
import type { Scenario } from './mock-api';

const DEVISE = 'XOF';

function lot(partiel: Partial<SiteLot> & Pick<SiteLot, 'id' | 'siteId' | 'name'>): SiteLot {
  return {
    surfaceArea: null,
    manualSharePercent: null,
    sharePercent: 0,
    costPrice: 0,
    currency: DEVISE,
    propertyId: null,
    propertyLabel: null,
    ...partiel
  };
}

// ---------------------------------------------------------------------------
// 1. Chantier OUVERT, réparti à la surface — le coût est une estimation
// ---------------------------------------------------------------------------

const SITE_OUVERT = 'chantier-ouvert-01';

const REPARTITION_OUVERT: SiteCostBreakdown = {
  siteId: SITE_OUVERT,
  siteLabel: 'Résidence de Nongo — trois villas',
  isClosed: false,
  // Le coût réel à cet instant, dérivé des imputations validées. Il bougera.
  totalCost: 186_400_000,
  allocationMethod: 'SURFACE',
  lots: [
    lot({
      id: 'lot-ouvert-a',
      siteId: SITE_OUVERT,
      name: 'Villa A1',
      surfaceArea: 240,
      sharePercent: 40,
      // Le premier lot par ordre de création porte le reliquat d'arrondi :
      // 74 560 000 au lieu de 74 559 999,99 (contrat gelé).
      costPrice: 74_560_000
    }),
    lot({
      id: 'lot-ouvert-b',
      siteId: SITE_OUVERT,
      name: 'Villa A2',
      surfaceArea: 210,
      sharePercent: 35,
      costPrice: 65_240_000
    }),
    lot({
      id: 'lot-ouvert-c',
      siteId: SITE_OUVERT,
      name: 'Villa A3',
      surfaceArea: 150,
      sharePercent: 25,
      costPrice: 46_600_000
    })
  ],
  // Exhaustive dès qu'il y a un lot.
  unallocatedCost: 0,
  currency: DEVISE
};

// ---------------------------------------------------------------------------
// 2. Chantier CLOS, quotes-parts saisies, un lot déjà basculé
// ---------------------------------------------------------------------------

const SITE_CLOS = 'chantier-clos-01';

const REPARTITION_CLOS: SiteCostBreakdown = {
  siteId: SITE_CLOS,
  siteLabel: 'Immeuble de Kipé — six appartements',
  isClosed: true,
  // Le coût FIGÉ à la clôture. Il ne bougera plus.
  totalCost: 412_000_000,
  allocationMethod: 'MANUAL',
  lots: [
    lot({
      id: 'lot-clos-a',
      siteId: SITE_CLOS,
      name: 'Appartement R+1 gauche',
      manualSharePercent: 45,
      sharePercent: 45,
      costPrice: 185_400_000,
      // Déjà basculé : ce lot interdit la réouverture du chantier, ET fige la
      // répartition de tous les autres.
      propertyId: 'bien-kipe-r1g',
      propertyLabel: 'APP-2026-031'
    }),
    lot({
      id: 'lot-clos-b',
      siteId: SITE_CLOS,
      name: 'Appartement R+1 droite',
      manualSharePercent: 30,
      sharePercent: 30,
      costPrice: 123_600_000
    }),
    lot({
      id: 'lot-clos-c',
      siteId: SITE_CLOS,
      name: 'Appartement R+2',
      manualSharePercent: 25,
      sharePercent: 25,
      costPrice: 103_000_000
    })
  ],
  unallocatedCost: 0,
  currency: DEVISE
};

const CLOTURE_CLOS: SiteClosure = {
  siteId: SITE_CLOS,
  siteLabel: REPARTITION_CLOS.siteLabel,
  closedAt: '2026-08-31T16:40:00.000Z',
  closedByLabel: 'Aminata Sow',
  finalCost: REPARTITION_CLOS.totalCost,
  currency: DEVISE,
  lots: REPARTITION_CLOS.lots
};

// ---------------------------------------------------------------------------
// 3. Chantier OUVERT avec deux bloqueurs — la clôture doit être désactivée
// ---------------------------------------------------------------------------

const SITE_BLOQUE = 'chantier-bloque-01';

const REPARTITION_BLOQUE: SiteCostBreakdown = {
  siteId: SITE_BLOQUE,
  siteLabel: 'Duplex de Lambanyi — deux lots',
  isClosed: false,
  totalCost: 98_750_000,
  allocationMethod: 'EQUAL',
  lots: [
    lot({ id: 'lot-bloque-a', siteId: SITE_BLOQUE, name: 'Duplex gauche', sharePercent: 50, costPrice: 49_375_000 }),
    lot({ id: 'lot-bloque-b', siteId: SITE_BLOQUE, name: 'Duplex droite', sharePercent: 50, costPrice: 49_375_000 })
  ],
  unallocatedCost: 0,
  currency: DEVISE
};

/** Messages repris mot pour mot de `blockerMessage`, côté serveur. */
const BLOQUEURS_BLOQUE: SiteClosureBlocker[] = [
  {
    message:
      'Une facture fournisseur en brouillon vise encore ce chantier : validez-la ou supprimez-la avant de clôturer.',
    count: 1
  },
  {
    message:
      '3 pièces de caisse en brouillon visent encore ce chantier : validez-les ou supprimez-les avant de clôturer.',
    count: 3
  }
];

// ---------------------------------------------------------------------------
// 4. Chantier OUVERT sans clé de répartition — les parts valent zéro
// ---------------------------------------------------------------------------

const SITE_SANS_CLE = 'chantier-sans-cle-01';

const REPARTITION_SANS_CLE: SiteCostBreakdown = {
  siteId: SITE_SANS_CLE,
  siteLabel: 'Parcelles de Kagbelen — découpage en cours',
  isClosed: false,
  totalCost: 54_300_000,
  // Aucune clé : l'écran doit le dire, et dire ce que cela implique.
  allocationMethod: null,
  lots: [
    lot({ id: 'lot-sans-cle-a', siteId: SITE_SANS_CLE, name: 'Parcelle 1', surfaceArea: 600 }),
    lot({ id: 'lot-sans-cle-b', siteId: SITE_SANS_CLE, name: 'Parcelle 2', surfaceArea: 450 }),
    // Sans surface : la clé « Au prorata des surfaces » sera refusée par le
    // serveur tant que ce lot n'en a pas une. C'est le refus que l'écran doit
    // relayer sans le réécrire.
    lot({ id: 'lot-sans-cle-c', siteId: SITE_SANS_CLE, name: 'Parcelle 3' })
  ],
  // Aucun coût réparti, donc tout le coût reste non réparti — malgré les trois
  // lots. Voir l'en-tête : c'est le comportement réel du serveur.
  unallocatedCost: 54_300_000,
  currency: DEVISE
};

// ---------------------------------------------------------------------------
// 5. Chantier OUVERT sans aucun lot — tout le coût est non réparti
// ---------------------------------------------------------------------------

const SITE_SANS_LOT = 'chantier-sans-lot-01';

const REPARTITION_SANS_LOT: SiteCostBreakdown = {
  siteId: SITE_SANS_LOT,
  siteLabel: 'Voirie de Sonfonia — aucun lot produit',
  isClosed: false,
  totalCost: 31_900_000,
  allocationMethod: null,
  lots: [],
  // Aucun lot : le coût entier reste non réparti.
  unallocatedCost: 31_900_000,
  currency: DEVISE
};

const REPARTITIONS: Record<string, SiteCostBreakdown> = {
  [SITE_OUVERT]: REPARTITION_OUVERT,
  [SITE_CLOS]: REPARTITION_CLOS,
  [SITE_BLOQUE]: REPARTITION_BLOQUE,
  [SITE_SANS_CLE]: REPARTITION_SANS_CLE,
  [SITE_SANS_LOT]: REPARTITION_SANS_LOT
};

const BLOQUEURS: Record<string, SiteClosureBlocker[]> = {
  [SITE_BLOQUE]: BLOQUEURS_BLOQUE
};

function repartitionDe(siteId: string): SiteCostBreakdown {
  return REPARTITIONS[siteId] ?? REPARTITION_OUVERT;
}

/**
 * Enregistrement de clôture rendu par `POST /close` et `POST /reopen`.
 *
 * Pour le chantier déjà clos, c'est l'enregistrement réel ; pour les autres,
 * une clôture datée d'aujourd'hui, comme le serveur la produirait.
 */
function clotureDe(siteId: string): SiteClosure {
  if (siteId === SITE_CLOS) return CLOTURE_CLOS;
  const repartition = repartitionDe(siteId);
  return {
    siteId: repartition.siteId,
    siteLabel: repartition.siteLabel,
    closedAt: new Date().toISOString(),
    closedByLabel: 'Aminata Sow',
    finalCost: repartition.totalCost,
    currency: DEVISE,
    lots: repartition.lots
  };
}

/** Le bien créé par la bascule, avec le coût de revient du lot pour valeur. */
function bascule(siteId: string, lotId: string): CapitalizedLot {
  const repartition = repartitionDe(siteId);
  const concerne = repartition.lots.find(candidat => candidat.id === lotId) ?? repartition.lots[0];
  return {
    lotId: concerne?.id ?? lotId,
    lotName: concerne?.name ?? 'Lot',
    propertyId: `bien-${lotId}`,
    propertyInternalReference: 'BIEN-2026-099',
    // La valeur d'acquisition EST le coût de revient du lot : elle n'est ni
    // saisie ni arrondie autrement.
    acquisitionCost: concerne?.costPrice ?? 0,
    acquisitionDate: new Date().toISOString(),
    currency: DEVISE
  };
}

export function repondreSiteClosing(chemin: string, scenario: Scenario): unknown | null {
  // --- La bascule au patrimoine (littéral `capitalize`, testé en premier) ---
  const basculeMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/lots\/([^/]+)\/capitalize$/.exec(chemin);
  if (basculeMatch) {
    return { success: true, data: bascule(basculeMatch[1], basculeMatch[2]) };
  }

  // --- La clé de répartition : rend les lots recalculés --------------------
  const cleMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/lot-allocation-method$/.exec(chemin);
  if (cleMatch) {
    return { success: true, data: repartitionDe(cleMatch[1]).lots };
  }

  // --- Le coût de revient, vu du chantier ---------------------------------
  const repartitionMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/cost-breakdown$/.exec(chemin);
  if (repartitionMatch) {
    const repartition = repartitionDe(repartitionMatch[1]);
    // Le scénario « vide » montre le chantier qui ne produit aucun lot :
    // c'est l'état vide de CET écran, pas une liste vide de plus.
    return { success: true, data: scenario === 'vide' ? REPARTITION_SANS_LOT : repartition };
  }

  // --- Ce qui empêche de clôturer -----------------------------------------
  const bloqueursMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/closure-blockers$/.exec(chemin);
  if (bloqueursMatch) {
    return { success: true, data: BLOQUEURS[bloqueursMatch[1]] ?? [] };
  }

  // --- La clôture et la réouverture (corps vide côté appelant) ------------
  const clotureMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/(close|reopen)$/.exec(chemin);
  if (clotureMatch) {
    return { success: true, data: clotureDe(clotureMatch[1]) };
  }

  // --- Un lot : PATCH correction et DELETE suppression partagent ce chemin -
  const lotMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/lots\/([^/]+)$/.exec(chemin);
  if (lotMatch) {
    const repartition = repartitionDe(lotMatch[1]);
    const concerne = repartition.lots.find(candidat => candidat.id === lotMatch[2]) ?? repartition.lots[0] ?? null;
    return { success: true, data: concerne };
  }

  // --- La liste des lots ET leur création partagent ce chemin (en-tête) ----
  const lotsMatch = /\/tenants\/[^/]+\/finance\/sites\/([^/]+)\/lots$/.exec(chemin);
  if (lotsMatch) {
    return { success: true, data: repartitionDe(lotsMatch[1]).lots };
  }

  return null;
}
