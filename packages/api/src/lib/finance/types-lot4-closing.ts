/**
 * Contrat gelé — lot 4, sixième et dernier sous-lot : lots, coût de revient et
 * clôture (PRD E6, besoins P16 et P17).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * Le besoin
 * ---------------------------------------------------------------------------
 *
 * Un chantier produit N lots — des villas, des appartements, des parcelles.
 * Le coût de revient d'un lot est sa quote-part du coût total du chantier.
 * Quand le chantier est fini, on le clôture, on fige son coût, et les lots
 * peuvent basculer au patrimoine avec leur coût de revient pour valeur
 * d'acquisition.
 *
 * ---------------------------------------------------------------------------
 * Le coût par lot ne se stocke pas
 * ---------------------------------------------------------------------------
 *
 * Il se dérive du coût du chantier et de la clé de répartition, exactement
 * comme le coût réel se dérive des imputations (principe P-4). Le stocker
 * créerait un deuxième chiffre à maintenir, et le jour où une facture arrive
 * en retard les deux se contrediraient.
 *
 * Ce qui se fige, c'est le coût du **chantier**, à la clôture, recopié dans
 * `finalCost`.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi figer suffit : un chantier clos n'accepte plus rien
 * ---------------------------------------------------------------------------
 *
 * C'est **la** garde qui rend `finalCost` vrai. Sans elle, une facture validée
 * le lendemain de la clôture ferait diverger le coût figé du coût réel, et les
 * deux chiffres se contrediraient sans que rien ne le signale.
 *
 * La garde a deux moitiés, et il faut les deux :
 *
 *  1. **Aucune imputation ne s'écrit sur un chantier clos.** `assertSiteOpenTx`
 *     est appelée par chaque point d'écriture d'imputation — validation de
 *     facture, de pièce de caisse, de note de salaire, de situation
 *     d'avancement, constatation de loyer de terrain. C'est un garde-fou
 *     transverse, posé par le superviseur hors de ce sous-lot ; ici on l'écrit
 *     et on la teste.
 *  2. **La clôture refuse tant qu'une pièce brouillon vise le chantier.**
 *     Sinon on clôturerait en laissant derrière des dépenses réelles qui ne
 *     pourraient plus jamais être constatées — l'utilisateur se retrouverait
 *     avec une facture qu'aucun écran n'accepte.
 *
 * ---------------------------------------------------------------------------
 * La clé de répartition
 * ---------------------------------------------------------------------------
 *
 *   SURFACE  — au prorata des surfaces. Chaque lot doit avoir la sienne.
 *   EQUAL    — parts égales. Aucune donnée supplémentaire.
 *   MANUAL   — quotes-parts saisies, qui doivent totaliser cent.
 *
 * Le reliquat d'arrondi va au **premier lot**, par ordre de création, sans quoi
 * la somme des coûts de revient ne vaudrait pas le coût du chantier. Même
 * règle qu'à la ventilation entre associés, et pour la même raison.
 *
 * La somme des quotes-parts manuelles se vérifie sur les valeurs **arrondies**,
 * celles qui sont stockées. C'est le défaut n°1 du moteur comptable, et il se
 * rejoue partout où l'on somme des parts.
 *
 * ---------------------------------------------------------------------------
 * La bascule au patrimoine
 * ---------------------------------------------------------------------------
 *
 * Elle crée un bien (`Property`) par lot, et une évaluation (`AssetValuation`)
 * qui porte `acquisitionCost` = le coût de revient du lot. Rien de neuf n'est
 * inventé : le module patrimoine range déjà la valeur d'acquisition là.
 *
 * **Un lot ne bascule qu'une fois**, l'unicité l'impose en base. Une double
 * bascule créerait deux biens portant chacun le coût entier, et le patrimoine
 * compterait deux fois le même ouvrage.
 *
 * Le chantier peut déjà porter un `propertyId` — le bien sur lequel on
 * construit. Les biens créés par la bascule sont **d'autres biens** : le
 * terrain d'origine n'est pas un des lots produits, et les confondre ferait
 * porter au terrain le coût de la villa qu'on a bâtie dessus.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce sous-lot ne fait pas
 * ---------------------------------------------------------------------------
 *
 * - **Aucune écriture comptable à la bascule.** Immobiliser un ouvrage produit
 *   (débit d'un compte d'immobilisation, crédit d'un compte de production
 *   immobilisée) est un geste comptable réel, mais le PRD demande une valeur
 *   d'acquisition au patrimoine, pas une immobilisation au bilan. L'inventer
 *   déséquilibrerait une balance que personne n'a demandé à tenir.
 * - **Pas de vente de lot.** Un lot a un coût de revient ; ce qu'on en tire
 *   est un autre sujet.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { SiteLotAllocationMethod } from '@prisma/client';

import { NotImplementedYetError } from './types';

export type { SiteLotAllocationMethod };

// ---------------------------------------------------------------------------
// La garde transverse
// ---------------------------------------------------------------------------

/**
 * Lève si le chantier est clos.
 *
 * Appelée par **tout** point d'écriture d'imputation, avant d'écrire. C'est ce
 * qui rend `finalCost` vrai : voir l'en-tête.
 *
 * **Lève aussi (`NotFoundError`) quand le chantier n'existe pas pour cette
 * agence** — audit multi-tenant du 24 septembre 2026, lot B1 :
 * `createSupplierInvoiceTx` (`suppliers.ts`) reçoit un `siteId` par
 * imputation directement du corps de la requête, sans l'avoir vérifié avant
 * d'appeler cette garde. La rendre silencieuse sur un chantier absent
 * revenait à laisser une facture de l'agence A s'imputer sur un chantier de
 * l'agence B sans qu'aucune erreur ne le dise. Les cinq autres appelants
 * (`cash.ts`, `contractors.ts`, `salaries.ts`, `stock-mouvements.ts`,
 * `stock-rapprochement.ts`) lisent déjà le chantier filtré par `tenantId`
 * avant d'appeler cette fonction : pour eux ce cas ne se produit jamais, et
 * ce changement ne change rien à leur comportement.
 */
export type AssertSiteOpenTx = (tx: PrismaTransactionClient, tenantId: string, siteId: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Les lots
// ---------------------------------------------------------------------------

export interface SiteLotRecord {
  id: string;
  siteId: string;
  name: string;
  surfaceArea: number | null;
  manualSharePercent: number | null;
  /**
   * La part de ce lot dans le coût du chantier, en pourcentage. **Dérivée** de
   * la clé, jamais stockée.
   *
   * Vaut zéro quand le chantier n'a pas encore de clé.
   */
  sharePercent: number;
  /**
   * Le coût de revient du lot.
   *
   * Sur un chantier ouvert : sa part du coût réel à l'instant de la lecture —
   * une estimation qui bougera. Sur un chantier clos : sa part du coût figé,
   * et celle-là ne bougera plus.
   */
  costPrice: number;
  currency: string;
  /** Le bien créé à la bascule, s'il y en a un. */
  propertyId: string | null;
  propertyLabel: string | null;
}

/**
 * Ajoute un lot à un chantier.
 *
 * Refuse sur un chantier clos : découper après coup ce qu'on a déclaré fini
 * rouvrirait la question du coût de revient de lots qui ont déjà basculé.
 */
export type CreateSiteLotTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { siteId: string; name: string; surfaceArea?: number | null; manualSharePercent?: number | null }
) => Promise<SiteLotRecord>;

/**
 * Corrige un lot — son nom, sa surface, sa quote-part.
 *
 * Refuse dès que le lot a basculé au patrimoine : le bien créé porte déjà le
 * coût calculé, et le recalculer ici le laisserait mentir.
 *
 * **Refusé dès qu'un lot QUELCONQUE du chantier a basculé**, pas seulement
 * celui qu'on touche. Corriger un lot change la part de tous les autres, et
 * l'un d'eux porte déjà un bien dont la valeur d'acquisition en découle.
 * Cette portée n'était pas écrite ici ; le service l'applique depuis le
 * début, et l'agent des écrans l'a relevée.
 */
export type UpdateSiteLotTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  lotId: string,
  params: { name?: string; surfaceArea?: number | null; manualSharePercent?: number | null }
) => Promise<SiteLotRecord>;

/**
 * Supprime un lot.
 *
 * Refuse s'il a basculé : le bien existe, et un lot supprimé le laisserait
 * orphelin de toute explication sur d'où vient sa valeur.
 *
 * **Refusé dès qu'un lot QUELCONQUE du chantier a basculé**, pas seulement
 * celui qu'on touche. Corriger un lot change la part de tous les autres, et
 * l'un d'eux porte déjà un bien dont la valeur d'acquisition en découle.
 * Cette portée n'était pas écrite ici ; le service l'applique depuis le
 * début, et l'agent des écrans l'a relevée.
 */
export type DeleteSiteLotTx = (tx: PrismaTransactionClient, tenantId: string, lotId: string) => Promise<void>;

/**
 * Fixe la clé de répartition du chantier.
 *
 * **Vérifie que les lots existants la supportent** :
 *
 * - `SURFACE` exige une surface strictement positive sur chaque lot ;
 * - `MANUAL` exige des quotes-parts totalisant exactement cent, sommées sur
 *   les valeurs arrondies ;
 * - `EQUAL` n'exige rien.
 *
 * Refuse plutôt que de répartir à moitié. Une clé qui ne s'applique pas
 * produirait des coûts de revient faux sans le dire, et personne ne s'en
 * apercevrait avant de vendre au mauvais prix.
 *
 * **Refusé aussi dès qu'un lot du chantier a basculé** : changer la clé
 * change toutes les parts, et l'une d'elles a déjà produit un bien.
 */
export type SetLotAllocationMethodTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  method: SiteLotAllocationMethod
) => Promise<SiteLotRecord[]>;

export type ListSiteLots = (tenantId: string, siteId: string) => Promise<SiteLotRecord[]>;

// ---------------------------------------------------------------------------
// Le coût de revient, vu du chantier
// ---------------------------------------------------------------------------

export interface SiteCostBreakdownRecord {
  siteId: string;
  siteLabel: string;
  isClosed: boolean;
  /**
   * Le coût qui sert de base à la répartition.
   *
   * Le coût figé si le chantier est clos, le coût réel courant sinon.
   */
  totalCost: number;
  /** La clé en vigueur. Nulle tant qu'aucune n'a été choisie. */
  allocationMethod: SiteLotAllocationMethod | null;
  lots: SiteLotRecord[];
  /**
   * Ce qui n'est réparti sur aucun lot : `totalCost` moins la somme des coûts
   * de revient.
   *
   * Il vaut **zéro dès qu'une clé de répartition est posée**, lots existants —
   * la répartition est alors exhaustive, reliquat d'arrondi compris.
   *
   * Il vaut `totalCost` dans deux cas, et pas un seul : quand le chantier n'a
   * aucun lot, **et quand il en a mais qu'aucune clé n'a été choisie**. Sans
   * clé, rien n'est réparti et chaque lot porte zéro — verser le coût entier
   * au premier au titre du reliquat aurait été un chiffre faux d'apparence
   * juste.
   *
   * Ce commentaire disait le contraire — « zéro dès qu'il y a un lot » — et
   * c'était le contrat qui avait tort, pas le code. Relevé par l'agent des
   * écrans, qui a construit son écran sur le comportement réel plutôt que sur
   * la promesse. Corrigé ici parce qu'un commentaire qui ment est pire qu'un
   * commentaire absent.
   */
  unallocatedCost: number;
  currency: string;
}

export type GetSiteCostBreakdown = (tenantId: string, siteId: string) => Promise<SiteCostBreakdownRecord>;

// ---------------------------------------------------------------------------
// La clôture
// ---------------------------------------------------------------------------

export interface SiteClosureRecord {
  siteId: string;
  siteLabel: string;
  closedAt: Date;
  closedByLabel: string;
  /** Le coût figé. C'est `finalCost`, et il ne bougera plus. */
  finalCost: number;
  currency: string;
  lots: SiteLotRecord[];
}

/**
 * Ce qui empêche de clôturer, listé avant d'essayer.
 *
 * L'écran l'affiche pour que l'utilisateur sache quoi faire, plutôt que de se
 * heurter à un refus sec après avoir cliqué.
 */
export interface SiteClosureBlocker {
  /** Ce qui bloque, en clair. Destiné à être lu tel quel. */
  message: string;
  /** Combien de pièces sont concernées. */
  count: number;
  /** Références des pièces bloquantes, quand la nature de pièce en porte une. */
  references?: string[];
  /** Identifiants des pièces bloquantes (pour un lien vers chacune). */
  documentIds?: string[];
  /** Nature des pièces bloquantes (ex. `SUPPLIER_INVOICE`). */
  documentType?: string;
}

export type GetSiteClosureBlockers = (tenantId: string, siteId: string) => Promise<SiteClosureBlocker[]>;

/**
 * Clôture le chantier : statut `CLOSED`, date, et coût figé.
 *
 * `finalCost` reçoit le coût réel à cet instant, lu par `sumSiteActualCost` —
 * la seule définition du coût réel, et on ne s'en écarte pas.
 *
 * **Refuse tant qu'un bloqueur subsiste.** Les mêmes que renvoie
 * `getSiteClosureBlockers` : ce serait cruel de les lister puis d'en appliquer
 * d'autres.
 *
 * Refuse aussi un chantier déjà clos, plutôt que de re-figer un coût — le
 * second figeage écraserait silencieusement le premier, et les lots déjà
 * basculés porteraient une valeur qui ne correspondrait plus à rien.
 */
export type CloseSiteTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  params: { closedByUserId: string }
) => Promise<SiteClosureRecord>;

/**
 * Rouvre un chantier clos par erreur.
 *
 * Remet le statut à `IN_PROGRESS`, efface `closedAt` et `finalCost`. Le coût
 * redevient dérivé, et les imputations sont de nouveau acceptées.
 *
 * **Refusé dès qu'un lot a basculé au patrimoine.** Un bien existe désormais,
 * avec une valeur d'acquisition tirée d'un coût qu'on s'apprêterait à faire
 * bouger. Il faudrait d'abord défaire la bascule, et défaire une bascule veut
 * dire supprimer un bien qui vit peut-être déjà sa vie — loué, publié,
 * rattaché à un bail. On ne le propose pas.
 *
 * Exister est indispensable : clôturer trop tôt est une erreur courante, et
 * sans retour possible la seule issue serait une intervention en base.
 */
export type ReopenSiteTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string
) => Promise<SiteClosureRecord>;

// ---------------------------------------------------------------------------
// La bascule au patrimoine
// ---------------------------------------------------------------------------

export interface CapitalizedLotRecord {
  lotId: string;
  lotName: string;
  propertyId: string;
  propertyInternalReference: string;
  /** La valeur d'acquisition portée au patrimoine : le coût de revient du lot. */
  acquisitionCost: number;
  acquisitionDate: Date;
  currency: string;
}

/**
 * Crée le bien d'un lot, avec son coût de revient pour valeur d'acquisition.
 *
 * Écrit un `Property` et une `AssetValuation` portant `acquisitionCost` et
 * `acquisitionDate`, puis rattache le bien au lot.
 *
 * **Refuse sur un chantier ouvert.** Le coût de revient n'est pas encore
 * définitif, et un bien créé sur une estimation porterait une valeur fausse
 * que plus rien ne corrigerait.
 *
 * Refuse un lot déjà basculé.
 *
 * Les champs du bien — type, mode de détention, titre, adresse — sont donnés
 * par l'appelant et **jamais devinés depuis le chantier**. Un chantier a une
 * zone, pas une adresse postale ; une villa et un terrain nu ne sont pas le
 * même type de bien. Deviner produirait des fiches à corriger une par une.
 */
export type CapitalizeSiteLotTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  lotId: string,
  params: {
    internalReference: string;
    propertyType: string;
    ownershipType: string;
    title: string;
    description: string;
    address: string;
    acquisitionDate: Date;
  }
) => Promise<CapitalizedLotRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const assertSiteOpenTxStub: AssertSiteOpenTx = async () => {
  throw new NotImplementedYetError('assertSiteOpenTx');
};

export const createSiteLotTxStub: CreateSiteLotTx = async () => {
  throw new NotImplementedYetError('createSiteLotTx');
};

export const updateSiteLotTxStub: UpdateSiteLotTx = async () => {
  throw new NotImplementedYetError('updateSiteLotTx');
};

export const deleteSiteLotTxStub: DeleteSiteLotTx = async () => {
  throw new NotImplementedYetError('deleteSiteLotTx');
};

export const setLotAllocationMethodTxStub: SetLotAllocationMethodTx = async () => {
  throw new NotImplementedYetError('setLotAllocationMethodTx');
};

export const listSiteLotsStub: ListSiteLots = async () => {
  throw new NotImplementedYetError('listSiteLots');
};

export const getSiteCostBreakdownStub: GetSiteCostBreakdown = async () => {
  throw new NotImplementedYetError('getSiteCostBreakdown');
};

export const getSiteClosureBlockersStub: GetSiteClosureBlockers = async () => {
  throw new NotImplementedYetError('getSiteClosureBlockers');
};

export const closeSiteTxStub: CloseSiteTx = async () => {
  throw new NotImplementedYetError('closeSiteTx');
};

export const reopenSiteTxStub: ReopenSiteTx = async () => {
  throw new NotImplementedYetError('reopenSiteTx');
};

export const capitalizeSiteLotTxStub: CapitalizeSiteLotTx = async () => {
  throw new NotImplementedYetError('capitalizeSiteLotTx');
};
