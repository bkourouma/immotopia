/**
 * Contrat gelé de la frontière réseau — lot 4, sixième et dernier sous-lot :
 * les lots d'un chantier, leur coût de revient, et la clôture (PRD E6,
 * besoins P16 et P17).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot4-closing.ts`, gelé côté
 * serveur. Comme aux sous-lots précédents, **chaque champ porte ici le nom que
 * le serveur émet** — c'est la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE
 * perdent le suffixe `Record` du contrat serveur (`SiteLotRecord` -> `SiteLot`),
 * convention déjà suivie par `finance-lot4-types.ts` et
 * `finance-partnerships-types.ts`.
 *
 * Les champs `Date` du contrat serveur deviennent ici des chaînes ISO : c'est
 * ce que JSON transporte réellement, et annoncer `Date` ferait écrire
 * `closure.closedAt.getFullYear()` dans un écran, sur une chaîne.
 *
 * **Aucun « débit » ni « crédit » ici** (principe P-1 du PRD). On *ajoute* un
 * lot, on *répartit* un coût, on *clôture* un chantier, on *bascule* un lot au
 * patrimoine.
 *
 * ---------------------------------------------------------------------------
 * Le seul point qui, mal lu, coûte de l'argent
 * ---------------------------------------------------------------------------
 *
 * `SiteLot.costPrice` n'a pas le même sens selon `SiteCostBreakdown.isClosed` :
 *
 * - chantier OUVERT : une **estimation**, la part du coût réel à l'instant de
 *   la lecture. Une facture qui arrive demain la fera bouger.
 * - chantier CLOS : la part du coût **figé** (`finalCost`), et elle ne bougera
 *   plus.
 *
 * Les deux arrivent dans le même champ, sans rien qui les distingue autrement
 * que `isClosed`. Quelqu'un qui fixe un prix de vente sur une estimation en la
 * croyant définitive perd de l'argent — l'écran doit donc l'écrire en toutes
 * lettres, et `pages/finance/ClotureChantier.tsx` le fait.
 *
 * ---------------------------------------------------------------------------
 * Rien n'est calculé côté écran
 * ---------------------------------------------------------------------------
 *
 * `sharePercent`, `costPrice`, `totalCost` et `unallocatedCost` arrivent tout
 * faits, exactement comme le coût réel d'un chantier au lot 2 (principe P-4) :
 * une seule source de vérité. La SEULE exception tolérée à l'écran est la
 * somme des quotes-parts **saisies** dans le formulaire en cours, qui n'est pas
 * encore une donnée du serveur — voir l'en-tête de l'écran.
 */

import { PropertyOwnershipType, PropertyType } from './property-types';
import { t } from '../i18n/t';

// ---------------------------------------------------------------------------
// La clé de répartition
// ---------------------------------------------------------------------------

/**
 * Énumération Prisma `SiteLotAllocationMethod`, transcrite telle quelle.
 *
 * Elle est **nulle** tant qu'aucune clé n'a été posée : le chantier a peut-être
 * des lots, mais leur `sharePercent` vaut alors zéro et aucun coût de revient
 * n'est réparti. C'est un état réel, pas une anomalie.
 */
export type SiteLotAllocationMethod = 'SURFACE' | 'EQUAL' | 'MANUAL';

/** Libellés français des trois clés. Jamais la valeur brute à l'écran. */
export const ALLOCATION_METHOD_LABELS: Record<SiteLotAllocationMethod, string> = {
  SURFACE: t('Au prorata des surfaces'),
  EQUAL: t('Parts égales'),
  MANUAL: t('Quotes-parts saisies')
};

/**
 * Ce que chaque clé EXIGE des lots, dit avant d'essayer de la poser.
 *
 * Le serveur refuse une clé que les lots ne supportent pas plutôt que de
 * répartir à moitié (contrat gelé, `SetLotAllocationMethodTx`). L'écran affiche
 * donc l'exigence à côté du choix, pour que le refus ne soit pas une surprise.
 */
export const ALLOCATION_METHOD_REQUIREMENTS: Record<SiteLotAllocationMethod, string> = {
  SURFACE: t('Chaque lot doit porter une surface strictement positive.'),
  EQUAL: t('Aucune donnée supplémentaire à saisir sur les lots.'),
  MANUAL: t('Les quotes-parts saisies doivent totaliser exactement cent pour cent.')
};

// ---------------------------------------------------------------------------
// Les lots
// ---------------------------------------------------------------------------

export interface SiteLot {
  id: string;
  siteId: string;
  name: string;
  surfaceArea: number | null;
  manualSharePercent: number | null;
  /**
   * La part de ce lot dans le coût du chantier, en pourcentage. **Dérivée** de
   * la clé côté serveur, jamais stockée et jamais recalculée ici.
   *
   * Vaut zéro quand le chantier n'a pas encore de clé.
   */
  sharePercent: number;
  /**
   * Le coût de revient du lot. Estimation sur un chantier ouvert, définitif sur
   * un chantier clos — voir l'en-tête de ce fichier.
   */
  costPrice: number;
  currency: string;
  /**
   * Le bien créé à la bascule, s'il y en a un. Sa présence interdit à la fois
   * la correction du lot, sa suppression, et la réouverture du chantier.
   */
  propertyId: string | null;
  /** Référence interne du bien. L'écran ne montre jamais `propertyId`. */
  propertyLabel: string | null;
}

/**
 * Corps de l'ajout d'un lot.
 *
 * `siteId` n'y figure PAS : le chantier voyage dans le CHEMIN
 * (`sites/{siteId}/lots`). Le schéma serveur est `.strict()` et un corps qui le
 * répéterait échouerait en 400 — c'est le défaut qui cassait quatre créations
 * des lots 2 et 3 (`__tests__/finance/corps-des-requetes.test.ts`).
 */
export interface CreateSiteLotInput {
  name: string;
  /** Exigée par la clé `SURFACE`, inutile pour les deux autres. */
  surfaceArea?: number | null;
  /** Exigée par la clé `MANUAL`, inutile pour les deux autres. */
  manualSharePercent?: number | null;
}

/**
 * Corps de la correction d'un lot. Ni `siteId` ni `lotId` : les deux viennent
 * du chemin.
 *
 * Les trois champs sont facultatifs, mais un corps entièrement vide est refusé
 * par le serveur. Une clé ABSENTE veut dire « ne touche pas à ce champ » ;
 * `null` veut dire « efface-le ». Les deux se distinguent, et le service ne
 * recopie jamais `undefined` dans le corps.
 */
export interface UpdateSiteLotInput {
  name?: string;
  surfaceArea?: number | null;
  manualSharePercent?: number | null;
}

// ---------------------------------------------------------------------------
// Le coût de revient, vu du chantier
// ---------------------------------------------------------------------------

export interface SiteCostBreakdown {
  siteId: string;
  siteLabel: string;
  /**
   * Décide du sens de `totalCost` et de `costPrice` — voir l'en-tête. C'est le
   * champ le plus important de cet écran.
   */
  isClosed: boolean;
  /**
   * Le coût qui sert de base à la répartition : le coût figé si le chantier est
   * clos, le coût réel courant sinon. Calculé côté serveur.
   */
  totalCost: number;
  /** La clé en vigueur. Nulle tant qu'aucune n'a été choisie. */
  allocationMethod: SiteLotAllocationMethod | null;
  lots: SiteLot[];
  /**
   * Ce qui n'est réparti sur aucun lot.
   *
   * Vaut `totalCost` quand le chantier n'a pas de lot, et **zéro** dès qu'il en
   * a un — la répartition est exhaustive par construction, reliquat d'arrondi
   * compris. Un chantier qui coûte et ne produit aucun lot est un cas réel, et
   * l'écran le montre plutôt que d'afficher un tableau vide sous un total.
   */
  unallocatedCost: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// La clôture
// ---------------------------------------------------------------------------

/**
 * Ce qui empêche de clôturer, listé AVANT d'essayer.
 *
 * Le serveur applique exactement les mêmes à la clôture (contrat gelé) : ce
 * serait cruel de les lister puis d'en appliquer d'autres. `message` est
 * destiné à être lu tel quel, jamais réécrit côté écran.
 */
export interface SiteClosureBlocker {
  message: string;
  /** Combien de pièces sont concernées. */
  count: number;
}

/**
 * Ce que rendent la clôture et la réouverture.
 *
 * **Il n'existe aucune lecture de cet enregistrement** : seules les deux
 * mutations le rendent. L'écran ne peut donc afficher « clôturé le … par … »
 * qu'immédiatement après le geste, pas au rechargement — consigné dans la
 * rubrique « Hypothèses » du rapport de cet agent.
 */
export interface SiteClosure {
  siteId: string;
  siteLabel: string;
  /** ISO 8601. Après une réouverture, le serveur rend l'instant de l'opération. */
  closedAt: string;
  closedByLabel: string;
  /** Le coût figé. C'est `finalCost`, et il ne bougera plus. */
  finalCost: number;
  currency: string;
  lots: SiteLot[];
}

// ---------------------------------------------------------------------------
// La bascule au patrimoine
// ---------------------------------------------------------------------------

/**
 * Corps de la bascule d'un lot au patrimoine.
 *
 * **Tous ces champs sont saisis par l'utilisateur, aucun n'est deviné depuis le
 * chantier** (contrat gelé). Un chantier a une zone, pas une adresse postale ;
 * une villa et un terrain nu ne sont pas le même type de bien. Deviner
 * produirait des fiches à corriger une par une.
 *
 * Ni `siteId` ni `lotId` ici : ils sont dans le chemin. Pas non plus
 * d'`acquisitionCost` : c'est le coût de revient dérivé qui le fournit, et
 * l'accepter en entrée permettrait d'inscrire au patrimoine une valeur que rien
 * ne justifie.
 */
export interface CapitalizeSiteLotInput {
  internalReference: string;
  /** Énumération Prisma. Jamais un champ libre à l'écran. */
  propertyType: PropertyType;
  /** Énumération Prisma. Jamais un champ libre à l'écran. */
  ownershipType: PropertyOwnershipType;
  title: string;
  /**
   * Obligatoire mais possiblement vide : la colonne `Property.description` est
   * un `Text` NON NUL en base, et le schéma serveur accepte la chaîne vide.
   * Exiger une phrase ferait inventer une description pour passer l'écran.
   */
  description: string;
  address: string;
  /** `YYYY-MM-DD`. Le serveur la coerce en date. */
  acquisitionDate: string;
}

export interface CapitalizedLot {
  lotId: string;
  lotName: string;
  propertyId: string;
  propertyInternalReference: string;
  /** La valeur d'acquisition portée au patrimoine : le coût de revient du lot. */
  acquisitionCost: number;
  /** ISO 8601. */
  acquisitionDate: string;
  currency: string;
}

// ---------------------------------------------------------------------------
// Les deux énumérations du bien, en libellés français
// ---------------------------------------------------------------------------

/**
 * `propertyType` et `ownershipType` sont des énumérations Postgres, validées
 * côté serveur par `z.nativeEnum` contre les VRAIES valeurs générées
 * (`packages/api/src/lib/finance/schemas-site-closing.ts`). Une valeur inconnue
 * produit un 400.
 *
 * Elles sont donc présentées en liste de choix, jamais en champ libre. Les
 * valeurs sont reprises de `types/property-types.ts`, lui-même aligné sur
 * `packages/api/prisma/schema.prisma` — pas réécrites ici, pour qu'un ajout
 * d'énumération fasse échouer la compilation de ces deux tables plutôt que de
 * passer inaperçu.
 *
 * Les libellés sont ceux déjà employés par le module biens
 * (`pages/properties/Properties.tsx` et `components/properties/PropertyForm.tsx`) :
 * un même type de bien ne doit pas s'appeler autrement selon l'écran.
 */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  [PropertyType.APPARTEMENT]: 'Appartement',
  [PropertyType.MAISON_VILLA]: t('Maison / Villa'),
  [PropertyType.STUDIO]: 'Studio',
  [PropertyType.DUPLEX_TRIPLEX]: t('Duplex / Triplex'),
  [PropertyType.CHAMBRE_COLOCATION]: t('Chambre / Colocation'),
  [PropertyType.BUREAU]: 'Bureau',
  [PropertyType.BOUTIQUE_COMMERCIAL]: t('Boutique / Commercial'),
  [PropertyType.ENTREPOT_INDUSTRIEL]: t('Entrepôt / Industriel'),
  [PropertyType.TERRAIN]: 'Terrain',
  [PropertyType.IMMEUBLE]: 'Immeuble',
  [PropertyType.PARKING_BOX]: t('Parking / Box'),
  [PropertyType.LOT_PROGRAMME_NEUF]: t('Lot programme neuf')
};

export const OWNERSHIP_TYPE_LABELS: Record<PropertyOwnershipType, string> = {
  [PropertyOwnershipType.TENANT]: t("Propriété de l'agence"),
  [PropertyOwnershipType.PUBLIC]: t('Propriété privée'),
  [PropertyOwnershipType.CLIENT]: t('Mandat de gestion')
};

export { PropertyOwnershipType, PropertyType };
