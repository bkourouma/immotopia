/**
 * Contrat gelé — lot 4, deuxième sous-lot : les associations (PRD E7,
 * besoin B9).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus. Fichier séparé de
 * `types-lot4.ts`, qui reste le contrat des baux de terrain.
 *
 * ---------------------------------------------------------------------------
 * Le besoin
 * ---------------------------------------------------------------------------
 *
 * Certains biens appartiennent à plusieurs associés, chacun pour une
 * quote-part. L'agence encaisse le loyer entier du locataire, puis doit à
 * chaque associé sa part.
 *
 * ---------------------------------------------------------------------------
 * Ce que le locataire doit ne change pas — et pourquoi je l'écris ici
 * ---------------------------------------------------------------------------
 *
 * Le locataire a signé un bail pour un montant. Il doit ce montant, et son
 * compte de tiers porte toujours le loyer **entier**. Ce qui se répartit,
 * c'est le *produit*, jamais la créance.
 *
 * Le PRD dit que « le compte loyer principal ne reçoit que la part de
 * l'entreprise ». Cette phrase suppose une comptabilisation du loyer en
 * produit que le lot 1 n'a délibérément pas construite : la campagne de
 * facturation n'écrit aucune écriture comptable, seulement un mouvement de
 * compte de tiers. Il n'existe donc aucun « compte loyer principal » à
 * alimenter.
 *
 * **La part de l'entreprise est ce qui reste** une fois les parts des associés
 * constatées. C'est la seule lecture qui tienne avec le code existant, et elle
 * est juste : l'agence doit aux associés, le reste est à elle. À confirmer
 * avec la cliente, et consigné comme tel dans le rapport plutôt que tranché en
 * silence.
 *
 * ---------------------------------------------------------------------------
 * L'idempotence est héritée
 * ---------------------------------------------------------------------------
 *
 * La campagne de facturation du lot 1 se rejoue sans refacturer. La
 * ventilation doit en faire autant, sans quoi une campagne relancée doublerait
 * ce que l'agence doit à ses associés. L'unicité `(part, échéance)` en base le
 * garantit ; la lecture préalable dans le service est la règle, parce qu'en
 * PostgreSQL une commande en échec condamne toute la transaction.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { NotImplementedYetError, type PeriodRange } from './types';

// ---------------------------------------------------------------------------
// L'association et ses parts
// ---------------------------------------------------------------------------

export interface PartnershipShareRecord {
  id: string;
  partnerAccountId: string;
  partnerName: string;
  /** En pourcentage, deux décimales. */
  sharePercent: number;
}

export interface PartnershipPropertyRef {
  propertyId: string;
  /** Référence interne du bien. L'écran ne montre jamais l'identifiant. */
  propertyLabel: string;
}

export interface PartnershipRecord {
  id: string;
  tenantId: string;
  label: string;
  isActive: boolean;
  shares: PartnershipShareRecord[];
  /**
   * Somme des quotes-parts des associés. **Calculée, jamais stockée.**
   *
   * Ne peut pas dépasser cent.
   */
  totalSharePercent: number;
  /**
   * `100 − totalSharePercent`. La part de l'entreprise, par différence.
   *
   * Elle n'est pas un associé : elle ne porte pas de compte de tiers, et rien
   * ne lui est dû. Voir l'en-tête sur ce que le PRD laisse ouvert.
   */
  companySharePercent: number;
  /** Les biens détenus par cette association, nommés. */
  properties: PartnershipPropertyRef[];
}

/**
 * Crée une association, sans associé.
 *
 * Les parts s'ajoutent ensuite, une par une : une association se constitue
 * rarement d'un coup, et exiger la liste complète à la création obligerait à
 * tout ressaisir pour corriger un nom.
 */
export type CreatePartnershipTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { label: string }
) => Promise<PartnershipRecord>;

/**
 * Ajoute un associé, et ouvre son compte de tiers.
 *
 * Le compte naît avec la part : un associé sans compte ne pourrait rien
 * recevoir, et la première ventilation le trouverait manquant.
 *
 * **Refuse de dépasser cent pour cent au total.** Vérifié avant d'écrire, et
 * la somme se calcule sur les parts déjà arrondies — celles qui seront
 * stockées, jamais sur des valeurs brutes. C'est le défaut n°1 du moteur
 * comptable, rejoué ici sur des pourcentages.
 */
export type AddPartnershipShareTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { partnershipId: string; partnerName: string; sharePercent: number }
) => Promise<PartnershipRecord>;

/**
 * Retire un associé d'une association.
 *
 * **Refusé dès qu'une ventilation a été constatée sur sa part.** On ne fait
 * pas disparaître un associé à qui l'agence doit de l'argent : l'historique
 * de ce qui lui revient deviendrait illisible. Il faut d'abord solder son
 * compte.
 */
export type RemovePartnershipShareTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  shareId: string
) => Promise<PartnershipRecord>;

/**
 * Rattache un bien à une association, ou l'en détache quand
 * `partnershipId` vaut `null`.
 *
 * Un bien a **au plus une** association. Le rattacher ailleurs remplace le
 * lien — c'est une correction, pas un conflit — mais **ne recalcule aucune
 * ventilation passée** : les loyers déjà répartis l'ont été selon
 * l'association d'alors, et les réécrire serait réécrire l'histoire.
 */
export type AttachPropertyToPartnershipTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  propertyId: string,
  partnershipId: string | null
) => Promise<PartnershipRecord | null>;

export type ListPartnerships = (tenantId: string, filters: { onlyActive?: boolean }) => Promise<PartnershipRecord[]>;

export type GetPartnership = (tenantId: string, partnershipId: string) => Promise<PartnershipRecord>;

// ---------------------------------------------------------------------------
// La ventilation, à la facturation
// ---------------------------------------------------------------------------

export interface PartnershipDistributionRecord {
  id: string;
  partnershipId: string;
  partnershipShareId: string;
  partnerName: string;
  rentalInstallmentId: string;
  /** Référence du bien dont vient le loyer. */
  propertyLabel: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  currency: string;
}

/**
 * Ventile une échéance de loyer entre les associés du bien, s'il en a.
 *
 * Appelée par la campagne de facturation, dans **sa** transaction, juste après
 * la création de l'échéance et de son mouvement.
 *
 * **Ne fait rien** quand le bien n'appartient à aucune association, quand
 * l'association n'a aucun associé, ou quand la ventilation de cette échéance
 * existe déjà. Ce dernier cas est ce qui rend une campagne rejouable.
 *
 * **Ne touche jamais le compte du locataire.** Il doit le loyer entier ; ce
 * qu'on répartit est le produit, pas la créance.
 *
 * Le reliquat d'arrondi va au **premier associé**, par ordre de création, sans
 * quoi la somme des parts ne vaudrait pas le produit réparti.
 *
 * **Ne lève jamais pour cause d'association mal configurée.** Une échéance de
 * loyer qui a bien eu lieu doit pouvoir s'enregistrer : bloquer la campagne
 * entière parce qu'une association totalise cent-un pour cent empêcherait de
 * facturer des locataires qui n'y sont pour rien. Le cas est journalisé et la
 * ventilation sautée.
 */
export type DistributeInstallmentToPartnersTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { rentalInstallmentId: string; propertyId: string; amount: number; periodYear: number; periodMonth: number }
) => Promise<PartnershipDistributionRecord[]>;

// ---------------------------------------------------------------------------
// L'état de quote-part — lecture seule
// ---------------------------------------------------------------------------

export interface PartnerStatementLine {
  propertyLabel: string;
  periodYear: number;
  periodMonth: number;
  /** Le loyer facturé au locataire, en entier. */
  rentBilled: number;
  /** Ce qui en a été encaissé, à l'instant de la lecture. */
  rentCollected: number;
  /** La part de cet associé sur ce loyer. */
  partnerShare: number;
}

export interface PartnerStatementRecord {
  partnershipShareId: string;
  partnerName: string;
  sharePercent: number;
  lines: PartnerStatementLine[];
  /** Somme des parts de la période. Calculé. */
  totalShare: number;
  /**
   * Ce qui a déjà été reversé à l'associé, sur la période.
   *
   * C'est la somme des règlements portés à son compte de tiers. Le solde de ce
   * compte dit ce qui lui reste dû.
   */
  totalPaidOut: number;
  /**
   * Ce qui lui reste dû, à l'instant de la lecture : le solde de son compte.
   *
   * **Positif quand nous lui devons.** Ajouté à la relecture : le contrat
   * évoquait cette grandeur en prose — « le solde de ce compte dit ce qui lui
   * reste dû » — sans jamais l'exposer, si bien que l'écran ne pouvait pas
   * l'afficher. C'est pourtant le chiffre qu'un associé regarde en premier.
   *
   * Il ne se déduit pas des trois autres : `totalShare` et `totalPaidOut`
   * portent sur la période du relevé, le solde porte sur toute l'histoire du
   * compte.
   */
  accountBalance: number;
  currency: string;
}

/**
 * L'état de quote-part d'un associé, en lecture seule (priorité C du PRD).
 *
 * Rien ici ne s'écrit : c'est un relevé, pas une pièce.
 */
export type GetPartnerStatement = (
  tenantId: string,
  shareId: string,
  range?: PeriodRange
) => Promise<PartnerStatementRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const createPartnershipTxStub: CreatePartnershipTx = async () => {
  throw new NotImplementedYetError('createPartnershipTx');
};

export const addPartnershipShareTxStub: AddPartnershipShareTx = async () => {
  throw new NotImplementedYetError('addPartnershipShareTx');
};

export const removePartnershipShareTxStub: RemovePartnershipShareTx = async () => {
  throw new NotImplementedYetError('removePartnershipShareTx');
};

export const attachPropertyToPartnershipTxStub: AttachPropertyToPartnershipTx = async () => {
  throw new NotImplementedYetError('attachPropertyToPartnershipTx');
};

export const listPartnershipsStub: ListPartnerships = async () => {
  throw new NotImplementedYetError('listPartnerships');
};

export const getPartnershipStub: GetPartnership = async () => {
  throw new NotImplementedYetError('getPartnership');
};

export const distributeInstallmentToPartnersTxStub: DistributeInstallmentToPartnersTx = async () => {
  throw new NotImplementedYetError('distributeInstallmentToPartnersTx');
};

export const getPartnerStatementStub: GetPartnerStatement = async () => {
  throw new NotImplementedYetError('getPartnerStatement');
};
