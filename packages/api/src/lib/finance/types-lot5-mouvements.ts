/**
 * Contrat gelé — lot 5, deuxième sous-lot : réceptions, sorties et
 * valorisation (PRD E9, besoins S2, S3, S4).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * Le stock redéfinit le coût, il ne s'y ajoute pas — principe P-7
 * ---------------------------------------------------------------------------
 *
 * Dès que le stock est activé sur un chantier, le coût de ses matériaux vient
 * des **sorties** de magasin et non des factures. Une facture qui continuerait
 * à s'imputer pendant que les sorties s'imputent aussi compterait le ciment
 * deux fois : le chantier paraîtrait coûter le double de ce qu'il coûte, et
 * le dirigeant prendrait ses décisions là-dessus.
 *
 * Le basculement se lit sur `ConstructionSite.stockEnabledAt`, posé au lot 2
 * en prévision de celui-ci et que personne ne lisait encore. **Ce sous-lot ne
 * le pose pas et ne le lit pas non plus** : brancher la bascule dans la
 * validation de facture appartient au superviseur, à l'intégration, comme
 * `assertSiteOpenTx` au lot 4. Ici on écrit ce qui doit exister pour que la
 * bascule ait un sens.
 *
 * ---------------------------------------------------------------------------
 * Où passe l'argent, et pourquoi la réception n'écrit aucune écriture
 * ---------------------------------------------------------------------------
 *
 * ```
 * facture d'un chantier au stock actif   débit  311 (stock)   crédit 401
 *                                        aucune imputation de chantier
 * réception                              aucune écriture — voir ci-dessous
 * sortie vers un chantier                débit  compte du poste   crédit 311
 *                                        + imputation au coût du chantier
 * ```
 *
 * **La réception n'écrit aucune écriture comptable**, et ce n'est pas un
 * oubli. La facture a déjà porté la valeur au 311 ; une seconde écriture
 * doublerait l'actif. La réception enregistre des **quantités** et la valeur
 * qui leur est attachée, rien d'autre.
 *
 * ### L'écart entre le 311 et la valeur du stock est une donnée, pas un bug
 *
 * Si le total d'une réception ne vaut pas le montant de sa facture — parce
 * que la facture portait aussi du transport, ou parce qu'on a reçu moins que
 * facturé —, le compte 311 et la valeur du stock divergent.
 *
 * **C'est exactement ce que le besoin S7 demande d'exposer** : « rapprochement
 * acheté / consommé / restant par chantier ; l'écart non justifié est mis en
 * évidence ». On ne l'empêche donc pas, on ne le masque pas, et on ne force
 * pas la réception à totaliser la facture. Le rapprochement est un sous-lot à
 * part entière.
 *
 * ---------------------------------------------------------------------------
 * Le coût moyen pondéré, et pourquoi le solde se stocke
 * ---------------------------------------------------------------------------
 *
 * Un coût moyen pondéré **dépend du chemin** : il ne se déduit pas d'un
 * ensemble de mouvements, il se construit en les rejouant dans l'ordre. C'est
 * la seule grandeur de ce module qui échappe à la doctrine « ce qui se calcule
 * ne se stocke pas », et elle y échappe pour une raison.
 *
 * Le dépôt suit déjà ce schéma : `ThirdPartyAccount.balance` porte le solde,
 * `ThirdPartyMovement.balanceAfter` l'état après chaque mouvement.
 * `StockBalance` et `StockMovement.quantityAfter` reprennent ce couple.
 *
 * ```
 * à la réception   valeur += quantité × prix unitaire
 *                  quantité += quantité
 *                  coût moyen = valeur / quantité      (jamais stocké)
 *
 * à la sortie      prix unitaire = coût moyen AVANT la sortie
 *                  valeur -= quantité × coût moyen
 *                  quantité -= quantité
 * ```
 *
 * **Le coût moyen n'est jamais une colonne.** Il se déduit de `value` et
 * `quantity`. Une troisième colonne serait un troisième chiffre à tenir
 * d'accord avec les deux autres, et c'est toujours celui-là qui ment.
 *
 * ### Le coût moyen est par (article, LIEU)
 *
 * Le besoin S4 exige quantité **et valeur** par dépôt et par chantier. Un coût
 * moyen global ne saurait pas dire ce que vaut le stock d'un dépôt.
 *
 * ### Quand la quantité tombe à zéro, la valeur aussi
 *
 * Sans cette règle, les arrondis successifs laissent une valeur résiduelle sur
 * une quantité nulle — et le prochain coût moyen calculé serait une division
 * par zéro, ou pire, un nombre. Le service force la valeur à zéro et écrit
 * l'écart d'arrondi dans le mouvement, où on peut le voir.
 *
 * ---------------------------------------------------------------------------
 * Ce qui est refusé, et ce qui ne l'est pas
 * ---------------------------------------------------------------------------
 *
 * **Une sortie supérieure au stock est refusée.** C'est la seule interdiction
 * dure de ce sous-lot, et elle tranche avec la doctrine du module — ailleurs,
 * on enregistre ce qui a eu lieu plutôt que de bloquer. Ici c'est différent :
 * un stock négatif n'a pas de coût moyen qui veuille dire quelque chose, et
 * toute la valorisation qui suit deviendrait fausse. Quand la quantité
 * physique dépasse ce que le système croit, le geste juste est un inventaire,
 * pas une sortie à découvert.
 *
 * **Une sortie vers un chantier clos est refusée** — `assertSiteOpenTx`, la
 * garde du lot 4. Une sortie impute, et un chantier clos n'accepte plus
 * d'imputation.
 *
 * **Un prix unitaire nul en réception est accepté.** Un don, une reprise, une
 * chute récupérée : cela existe et cela entre en stock à valeur nulle.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { StockMovementType } from '@prisma/client';

import { NotImplementedYetError } from './types';

export type { StockMovementType };

// ---------------------------------------------------------------------------
// Ce qu'il reste, et ce que ça vaut
// ---------------------------------------------------------------------------

export interface StockBalanceRecord {
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  quantity: number;
  value: number;
  /**
   * `value / quantity`. **Calculé, jamais stocké.**
   *
   * Vaut zéro quand la quantité est nulle — et non `null` : un écran qui
   * affiche un coût moyen n'a pas à distinguer « pas de stock » de « stock
   * gratuit », la quantité le dit déjà.
   */
  averageUnitCost: number;
  currency: string;
}

export type ListStockBalances = (
  tenantId: string,
  filters: { locationId?: string; itemId?: string; /** Masque les lignes à quantité nulle. */ onlyInStock?: boolean }
) => Promise<StockBalanceRecord[]>;

// ---------------------------------------------------------------------------
// Le mouvement, tel qu'on le relit
// ---------------------------------------------------------------------------

export interface StockMovementRecord {
  id: string;
  type: StockMovementType;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  movementDate: Date;
  /** Toujours positive. C'est `type` et `isDecrease` qui disent le sens. */
  quantity: number;
  isDecrease: boolean;
  unitCost: number;
  totalValue: number;
  currency: string;
  quantityAfter: number;
  valueAfter: number;
  /** Le chantier imputé, pour une sortie. */
  siteId: string | null;
  siteLabel: string | null;
  costCategoryLabel: string | null;
  requestedBy: string | null;
  /** Référence de la facture qui a valorisé la réception. */
  supplierInvoiceReference: string | null;
  createdByLabel: string;
  createdAt: Date;
}

export type ListStockMovements = (
  tenantId: string,
  filters: {
    itemId?: string;
    locationId?: string;
    siteId?: string;
    type?: StockMovementType;
    from?: Date;
    to?: Date;
  }
) => Promise<StockMovementRecord[]>;

// ---------------------------------------------------------------------------
// La réception
// ---------------------------------------------------------------------------

export interface StockReceiptLineInput {
  itemId: string;
  quantity: number;
  /** Prix unitaire de cette entrée. Zéro accepté : voir l'en-tête. */
  unitCost: number;
}

/**
 * Enregistre une réception : un ou plusieurs articles entrent dans un lieu.
 *
 * **Écrit un mouvement par ligne**, jamais un mouvement fourre-tout : le
 * coût moyen se recalcule article par article, et une ligne qui en porterait
 * plusieurs rendrait le calcul illisible.
 *
 * Elle est **rattachée à une facture fournisseur** (besoin S2), et ce lien
 * est exigé : une entrée de stock sans pièce est une valeur qui apparaît de
 * nulle part. C'est le principe P-2 du PRD — le document précède l'écriture.
 *
 * **N'écrit aucune écriture comptable ni aucune imputation.** Voir l'en-tête :
 * la facture a déjà porté la valeur au 311, et la doubler gonflerait l'actif.
 *
 * Refuse une quantité nulle ou négative, un prix unitaire négatif, une facture
 * qui n'est pas validée, et un lieu désactivé.
 */
export type RecordStockReceiptTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    locationId: string;
    supplierInvoiceId: string;
    receiptDate: Date;
    lines: StockReceiptLineInput[];
    createdByUserId: string;
  }
) => Promise<StockMovementRecord[]>;

// ---------------------------------------------------------------------------
// La sortie
// ---------------------------------------------------------------------------

/**
 * Sort un article vers un chantier, et l'impute à son coût.
 *
 * C'est **le** geste du lot : c'est lui qui fait entrer le matériau dans le
 * coût réel du chantier, à la place de la facture (principe P-7).
 *
 * Il écrit, dans une seule transaction :
 *
 *  - le mouvement, valorisé au coût moyen du lieu **avant** la sortie ;
 *  - l'écriture : débit du compte de charge du poste — celui que
 *    `resolveExpenseAccountsByCostCategoryTx` résout, avec repli sur les
 *    charges de chantier —, crédit du 311 ;
 *  - l'imputation (`CostAllocation`, `sourceType: 'STOCK_ISSUE'`, validée) ;
 *  - la synchronisation du coût des programmes de travaux rattachés.
 *
 * Le poste est **exigé**, jamais deviné depuis l'article : `defaultCostCategoryId`
 * est une proposition d'écran, pas une autorité. Même parti pris qu'au poste
 * « main-d'œuvre » des salaires.
 *
 * `requestedBy` est exigé — le besoin S3 le demande. Une sortie sans
 * demandeur est un matériau qui a disparu sans que personne n'en réponde.
 *
 * **Refuse une sortie supérieure au stock**, et **refuse un chantier clos**.
 * Voir l'en-tête pour les deux raisons.
 *
 * Le prix unitaire n'est **pas** un paramètre : il est dérivé (principe P-4).
 */
export type RecordStockIssueTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    locationId: string;
    itemId: string;
    quantity: number;
    siteId: string;
    costCategoryId: string;
    requestedBy: string;
    issueDate: Date;
    createdByUserId: string;
  }
) => Promise<StockMovementRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const listStockBalancesStub: ListStockBalances = async () => {
  throw new NotImplementedYetError('listStockBalances');
};

export const listStockMovementsStub: ListStockMovements = async () => {
  throw new NotImplementedYetError('listStockMovements');
};

export const recordStockReceiptTxStub: RecordStockReceiptTx = async () => {
  throw new NotImplementedYetError('recordStockReceiptTx');
};

export const recordStockIssueTxStub: RecordStockIssueTx = async () => {
  throw new NotImplementedYetError('recordStockIssueTx');
};
