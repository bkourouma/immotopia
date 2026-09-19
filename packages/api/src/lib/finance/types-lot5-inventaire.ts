/**
 * Contrat gelé — lot 5, troisième sous-lot : transferts et inventaire
 * physique (PRD E9, besoins S4 pour le transfert, S6 pour l'inventaire).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * Un transfert s'écrit en DEUX mouvements
 * ---------------------------------------------------------------------------
 *
 * Une sortie du lieu d'origine, une entrée au lieu d'arrivée, liées par
 * `transferGroupId`. Un mouvement unique portant deux lieux obligerait chaque
 * calcul de solde à se demander de quel côté il se trouve ; là où chaque
 * mouvement ne touche qu'un lieu, l'arithmétique est la même partout — la
 * même que celle des réceptions et des sorties, déjà écrite.
 *
 * ### Transférer ne crée ni ne détruit de valeur
 *
 * La valeur part au coût moyen du lieu d'**origine** et recalcule celui du
 * lieu d'**arrivée**. C'est l'invariant du transfert, et il se teste : la
 * somme des valeurs des deux lieux ne bouge pas d'un franc.
 *
 * ### Un transfert n'impute rien, et n'écrit aucune écriture
 *
 * Déplacer du ciment d'un dépôt vers un chantier ne le consomme pas. Le 311
 * ne bouge pas — la matière est toujours à l'actif, simplement ailleurs — et
 * le coût du chantier ne bouge pas non plus.
 *
 * **C'est le piège de ce sous-lot.** Livrer sur un chantier *ressemble* à une
 * dépense, et la compter comme telle ferait monter le coût de matériaux qui
 * dorment encore sous la bâche. Seule la **sortie** impute (principe P-7).
 *
 * ---------------------------------------------------------------------------
 * L'inventaire : ce qu'on a compté face à ce que le système croyait
 * ---------------------------------------------------------------------------
 *
 * Un inventaire se saisit en brouillon, article par article, puis se valide.
 * La validation produit un **ajustement par ligne en écart**, et rien pour
 * les lignes qui tombent juste.
 *
 * ### La quantité attendue est FIGÉE à la saisie
 *
 * `expectedQuantity` est recopiée quand la ligne est saisie, pas relue à la
 * validation. Relire comparerait le comptage d'hier au stock d'aujourd'hui,
 * et l'écart ne voudrait plus rien dire : une sortie enregistrée entre-temps
 * se lirait comme une perte.
 *
 * Conséquence assumée : si du stock bouge entre le comptage et la validation,
 * l'ajustement ramène le solde à ce qui a été compté, en écrasant ce
 * mouvement. C'est le comportement voulu d'un inventaire — le comptage
 * physique fait foi — mais il faut le savoir, et l'écran doit dire quand un
 * mouvement est survenu depuis le comptage.
 *
 * ### Un écart sans motif ne se valide pas
 *
 * Le besoin S6 exige que l'écart soit justifié : casse, perte, vol. Une
 * validation qui laisserait passer un écart muet transformerait une perte en
 * ligne de tableau que personne ne relira.
 *
 * ### Où passe l'argent
 *
 * ```
 * on a trouvé MOINS    débit  603 (variations de stock)   crédit 311
 * on a trouvé PLUS     débit  311                          crédit 603
 * ```
 *
 * Le 603 va dans les deux sens, et c'est pourquoi c'est lui plutôt qu'un
 * compte de charge : un compte de charge seul ne saurait pas dire le second
 * cas. Un écart n'est **jamais** imputé à un chantier : personne n'a décidé
 * de consommer ce qui a disparu.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce sous-lot ne fait pas
 * ---------------------------------------------------------------------------
 *
 * - **Pas d'inventaire tournant ni de gel du lieu pendant le comptage.** Un
 *   vrai inventaire bloque les mouvements le temps du comptage ; rien ici ne
 *   le fait, et le paragraphe ci-dessus dit ce que cela coûte.
 * - **Pas d'annulation d'un inventaire validé.** Ses ajustements sont des
 *   mouvements comme les autres ; les défaire demanderait de rejouer tout ce
 *   qui a suivi. Un comptage erroné se corrige par un second comptage.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { StockCountStatus } from '@prisma/client';

import { NotImplementedYetError } from './types';
import type { StockMovementRecord } from './types-lot5-mouvements';

export type { StockCountStatus };

// ---------------------------------------------------------------------------
// Le transfert
// ---------------------------------------------------------------------------

export interface StockTransferRecord {
  transferGroupId: string;
  /** Les deux moitiés : la sortie d'abord, l'entrée ensuite. */
  movements: StockMovementRecord[];
  fromLocationLabel: string;
  toLocationLabel: string;
  quantity: number;
  /** La valeur déplacée, au coût moyen du lieu d'origine. */
  value: number;
  currency: string;
}

/**
 * Déplace un article d'un lieu vers un autre.
 *
 * Écrit **deux** mouvements liés par un même `transferGroupId`, dans une
 * seule transaction : sans cela, une panne entre les deux ferait disparaître
 * de la matière.
 *
 * **N'écrit aucune écriture comptable et aucune imputation.** Voir l'en-tête :
 * déplacer n'est pas consommer.
 *
 * Refuse un transfert vers le même lieu, une quantité nulle ou négative, une
 * quantité supérieure au stock d'origine, et un lieu désactivé.
 *
 * Ne refuse **pas** un transfert vers un chantier clos : y déposer du
 * matériel n'impute rien, et un chantier clos peut légitimement servir de
 * lieu de stockage le temps qu'on évacue. C'est la sortie qui est refusée,
 * pas la livraison.
 */
export type RecordStockTransferTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    fromLocationId: string;
    toLocationId: string;
    itemId: string;
    quantity: number;
    transferDate: Date;
    createdByUserId: string;
  }
) => Promise<StockTransferRecord>;

// ---------------------------------------------------------------------------
// L'inventaire
// ---------------------------------------------------------------------------

export interface StockCountLineRecord {
  id: string;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  /** Ce que le système disait au moment du comptage. Figé. */
  expectedQuantity: number;
  countedQuantity: number;
  /** `countedQuantity − expectedQuantity`. Négatif quand il manque. Calculé. */
  variance: number;
  reason: string | null;
}

export interface StockCountRecord {
  id: string;
  tenantId: string;
  locationId: string;
  locationLabel: string;
  countedAt: Date;
  status: StockCountStatus;
  lines: StockCountLineRecord[];
  /** Nombre de lignes en écart. Calculé. */
  varianceCount: number;
  /**
   * La valeur de l'écart total, au coût moyen courant de chaque article.
   *
   * **Négative quand il manque.** Estimée tant que l'inventaire est en
   * brouillon : le coût moyen peut bouger d'ici la validation.
   */
  varianceValue: number;
  currency: string;
  createdByLabel: string;
  validatedAt: Date | null;
}

/**
 * Ouvre un inventaire sur un lieu, à l'état brouillon, sans aucune ligne.
 *
 * Les lignes s'ajoutent ensuite, une par une : on compte une allée après
 * l'autre, et exiger la liste complète d'un coup obligerait à tout ressaisir
 * pour corriger un chiffre.
 *
 * **Refuse un second inventaire en brouillon sur le même lieu.** Deux
 * comptages simultanés du même dépôt produiraient deux vérités, et le second
 * validé écraserait le premier sans que personne ne le voie.
 */
export type CreateStockCountTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { locationId: string; countedAt: Date; createdByUserId: string }
) => Promise<StockCountRecord>;

/**
 * Saisit ou corrige le comptage d'un article.
 *
 * `expectedQuantity` **n'est pas un paramètre** : le service la lit dans le
 * stock au moment de la saisie et la fige (principe P-4, et voir l'en-tête).
 * La laisser saisir permettrait de fabriquer un écart nul.
 *
 * Rappeler le même article remplace son comptage — on se reprend en
 * comptant, et une seconde ligne pour le même article rendrait l'écart
 * ambigu.
 *
 * Refuse une quantité comptée négative, et un inventaire déjà validé.
 */
export type SetStockCountLineTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  params: { itemId: string; countedQuantity: number; reason?: string | null }
) => Promise<StockCountRecord>;

export type RemoveStockCountLineTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  itemId: string
) => Promise<StockCountRecord>;

/**
 * Valide l'inventaire : les écarts deviennent des ajustements.
 *
 * Pour **chaque ligne en écart**, et seulement celles-là, écrit dans la même
 * transaction un mouvement `ADJUSTMENT` qui ramène le solde à la quantité
 * comptée, et son écriture — débit 603 / crédit 311 quand il manque, l'inverse
 * quand on a trouvé plus.
 *
 * L'ajustement est valorisé au **coût moyen courant du lieu**, pas à un prix
 * saisi. Quand il manque, la valeur sort au coût moyen ; quand on trouve plus,
 * elle entre au même coût moyen — faute de mieux, et parce qu'inventer un prix
 * pour du stock retrouvé serait pire. Sur un stock à quantité nulle, le coût
 * moyen est nul et l'entrée vaut zéro : c'est consigné, pas caché.
 *
 * **Refuse tant qu'une ligne en écart n'a pas de motif** (besoin S6). Refuse
 * un inventaire déjà validé, et un inventaire sans aucune ligne — valider un
 * comptage vide ne dit rien et pourrait se lire comme « tout est conforme ».
 *
 * **N'impute aucun chantier.** Personne n'a décidé de consommer ce qui a
 * disparu.
 */
export type ValidateStockCountTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  validatedByUserId: string
) => Promise<StockCountRecord>;

export type ListStockCounts = (
  tenantId: string,
  filters: { locationId?: string; status?: StockCountStatus }
) => Promise<StockCountRecord[]>;

export type GetStockCount = (tenantId: string, countId: string) => Promise<StockCountRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const recordStockTransferTxStub: RecordStockTransferTx = async () => {
  throw new NotImplementedYetError('recordStockTransferTx');
};

export const createStockCountTxStub: CreateStockCountTx = async () => {
  throw new NotImplementedYetError('createStockCountTx');
};

export const setStockCountLineTxStub: SetStockCountLineTx = async () => {
  throw new NotImplementedYetError('setStockCountLineTx');
};

export const removeStockCountLineTxStub: RemoveStockCountLineTx = async () => {
  throw new NotImplementedYetError('removeStockCountLineTx');
};

export const validateStockCountTxStub: ValidateStockCountTx = async () => {
  throw new NotImplementedYetError('validateStockCountTx');
};

export const listStockCountsStub: ListStockCounts = async () => {
  throw new NotImplementedYetError('listStockCounts');
};

export const getStockCountStub: GetStockCount = async () => {
  throw new NotImplementedYetError('getStockCount');
};
