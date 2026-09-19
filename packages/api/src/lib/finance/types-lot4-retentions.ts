/**
 * Contrat gelé — lot 4, cinquième sous-lot : la retenue de garantie (PRD E6,
 * besoin P15).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * Ce que c'est
 * ---------------------------------------------------------------------------
 *
 * On retient une part de ce qu'on doit à un fournisseur ou à un tâcheron,
 * jusqu'à ce que l'ouvrage ait fait ses preuves. C'est une garantie de bonne
 * fin, et l'argent lui revient plus tard.
 *
 * ---------------------------------------------------------------------------
 * La retenue ne diminue pas la charge — le piège à ne pas manquer
 * ---------------------------------------------------------------------------
 *
 * L'ouvrage a coûté son prix entier. Ce qui change, c'est ce qu'on doit
 * **maintenant**. L'imputation au coût du chantier reste au montant plein, et
 * rien ici ne la touche.
 *
 * Une retenue qui ferait baisser le coût d'un chantier serait un mensonge
 * comptable doublé d'un mensonge de pilotage : le chantier paraîtrait moins
 * cher parce qu'on n'a pas fini de payer. C'est exactement la confusion que le
 * lot 3 a déjà refusée entre l'engagé et le réel.
 *
 * ---------------------------------------------------------------------------
 * C'est un reclassement, pas une pièce de plus dans le cycle
 * ---------------------------------------------------------------------------
 *
 * La pièce source — facture du lot 2, situation d'avancement du sous-lot 4 —
 * est **déjà validée** et a déjà tout constaté : la charge, le mouvement de
 * tiers, l'imputation. La retenue ne refait rien de tout cela. Elle déplace
 * une part du solde « dû maintenant » vers « détenu » :
 *
 *   à la pose        : débit du tiers (401 ou 402), crédit des retenues (4047)
 *   à la libération  : débit des retenues (4047), crédit du tiers
 *
 * Après libération, le tiers est créancier du montant retenu et se règle par
 * le chemin ordinaire du lot 2 ou du sous-lot 4. **Aucun règlement ne naît
 * ici** : libérer, ce n'est pas payer.
 *
 * ### Ce que ce parti pris coûte, et pourquoi il est quand même le bon
 *
 * Il évite de modifier les validations déjà écrites — elles n'ont rien à
 * savoir des retenues, et les rouvrir pour y glisser un paramètre casserait
 * trois contrats gelés.
 *
 * Le prix : une fenêtre. Rien n'empêche de régler la pièce en entier avant
 * d'avoir posé la retenue, et la retenue arriverait alors trop tard. Le
 * service **ferme cette fenêtre pour les factures**, dont les règlements sont
 * affectés pièce par pièce (`SupplierPaymentAllocation`) et donc lisibles. Il
 * **ne le peut pas pour les situations**, dont les règlements ne sont affectés
 * à rien — on règle un tâcheron, pas une situation.
 *
 * ### Correction : la mitigation annoncée ici n'existe pas
 *
 * Ce paragraphe disait : « l'écran pose la retenue dans la foulée de la
 * validation, et c'est la seule garantie qu'on ait de ce côté ». **C'était
 * faux.** L'écran des retenues est une liste autonome, atteinte plus tard
 * depuis le menu ; aucun écran ne propose de poser une retenue au moment où
 * l'on valide une situation ou une facture.
 *
 * Relevé par l'agent des écrans, qui a constaté qu'on lui demandait de tenir
 * une promesse écrite dans un contrat qu'il n'avait pas rédigé. Un contrat
 * qui décrit une garantie inexistante est plus dangereux que l'absence de
 * garantie : on cesse de chercher le trou.
 *
 * **La fenêtre est donc ouverte, côté situations d'avancement, et rien ne la
 * ferme aujourd'hui.** La refermer demande un bouton « Poser une retenue »
 * sur `pages/finance/Tacheron.tsx` et `pages/finance/FactureFournisseur.tsx`,
 * au moment de la validation. C'est consigné comme tel dans le rapport de
 * lot, à arbitrer plutôt qu'à supposer réglé.
 *
 * ---------------------------------------------------------------------------
 * Le montant est dérivé du taux, jamais saisi
 * ---------------------------------------------------------------------------
 *
 * Principe P-4. Le taux est paramétrable pièce par pièce — le PRD dit « taux
 * paramétrable » sans dire où il se règle, et un taux par pièce couvre le cas
 * général sans inventer un écran de paramétrage que personne n'a demandé.
 *
 * Le montant obtenu est **stocké**, parce que c'est ce qui a effectivement été
 * retenu : le recalculer plus tard, avec un taux qui aurait changé entre-temps,
 * réécrirait l'histoire.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce sous-lot ne fait pas
 * ---------------------------------------------------------------------------
 *
 * - **Pas de libération partielle.** Une retenue se libère en entier. Les
 *   retenues libérées en deux temps (réception provisoire, puis définitive)
 *   existent, mais le PRD n'en parle pas, et la moitié d'un mécanisme est pire
 *   que son absence : on ne saurait pas dire ce qu'il reste détenu.
 * - **Pas d'acquisition de la retenue.** Si le tiers n'a jamais réparé, on
 *   garde l'argent : c'est un produit, et cela demande un compte de produit et
 *   une décision qui n'ont pas été demandés.
 * - **Rien ne se libère automatiquement à la date prévue.** La date est une
 *   prévision ; la libération est un acte que quelqu'un pose.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { RetentionSourceType, RetentionStatus } from '@prisma/client';

import { NotImplementedYetError } from './types';

export type { RetentionSourceType, RetentionStatus };

// ---------------------------------------------------------------------------
// La retenue
// ---------------------------------------------------------------------------

export interface RetentionGuaranteeRecord {
  id: string;
  tenantId: string;
  sourceType: RetentionSourceType;
  sourceId: string;
  /**
   * De quoi on retient, en clair : « Facture F-2026-014 » ou « Situation n°3
   * — marché MAÇ-07 ». L'écran ne montre jamais un identifiant.
   */
  sourceLabel: string;
  /** Le fournisseur ou le tâcheron, nommé. */
  thirdPartyLabel: string;
  thirdPartyAccountId: string;
  siteId: string | null;
  /** Nom du chantier. Nul pour une facture qui n'en porte aucun. */
  siteLabel: string | null;
  /** Le montant de la pièce source, au moment de la pose. */
  baseAmount: number;
  /** Le taux appliqué, en pourcentage, deux décimales. */
  ratePercent: number;
  /** Ce qui est retenu. Dérivé du taux à la pose, puis figé. */
  amount: number;
  currency: string;
  plannedReleaseDate: Date;
  status: RetentionStatus;
  releasedAt: Date | null;
  createdAt: Date;
}

/**
 * Pose une retenue sur une pièce **déjà validée**.
 *
 * Écrit une écriture de reclassement (débit du tiers, crédit du 4047) et un
 * mouvement de compte de tiers qui diminue ce qu'on lui doit. **N'écrit aucune
 * imputation** : le coût du chantier ne bouge pas d'un franc.
 *
 * Refuse, chaque fois pour une raison qu'on peut expliquer à l'utilisateur :
 *
 * - la pièce n'est pas validée — on ne retient pas sur une promesse ;
 * - une retenue existe déjà sur cette pièce — retenir deux fois ferait
 *   attendre le tiers deux fois plus longtemps ;
 * - le taux n'est pas strictement compris entre zéro et cent — un taux de
 *   cent pour cent n'est pas une garantie, c'est un non-paiement ;
 * - le montant retenu tombe à zéro après arrondi — une retenue de zéro franc
 *   n'est pas une retenue, et la laisser passer créerait une écriture vide ;
 * - **pour une facture seulement**, un règlement lui a déjà été affecté. Voir
 *   l'en-tête sur la fenêtre qu'on ne sait pas fermer côté situations.
 *
 * `plannedReleaseDate` est exigée. Une retenue sans échéance prévue est une
 * retenue qu'on oublie, et c'est précisément ce que la cliente veut éviter.
 */
export type CreateRetentionTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    sourceType: RetentionSourceType;
    sourceId: string;
    ratePercent: number;
    plannedReleaseDate: Date;
    createdByUserId: string;
  }
) => Promise<RetentionGuaranteeRecord>;

/**
 * Libère une retenue : l'argent redevient exigible.
 *
 * Écriture inverse (débit du 4047, crédit du tiers) et mouvement de compte qui
 * remonte ce qu'on lui doit. **Ne règle rien** : le tiers devient créancier, et
 * il se paie ensuite par le chemin ordinaire.
 *
 * Refuse une retenue déjà libérée. Ne refuse **pas** une libération avant la
 * date prévue : rien n'interdit de rendre l'argent plus tôt, et bloquer
 * obligerait à mentir sur la date pour contourner.
 */
export type ReleaseRetentionTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  retentionId: string,
  releasedByUserId: string
) => Promise<RetentionGuaranteeRecord>;

export type ListRetentions = (
  tenantId: string,
  filters: {
    status?: RetentionStatus;
    siteId?: string;
    thirdPartyAccountId?: string;
    /** Ne garde que les retenues dont la date prévue est passée. */
    dueBefore?: Date;
  }
) => Promise<RetentionGuaranteeRecord[]>;

export type GetRetention = (tenantId: string, retentionId: string) => Promise<RetentionGuaranteeRecord>;

// ---------------------------------------------------------------------------
// Ce qui est détenu, en un coup d'œil
// ---------------------------------------------------------------------------

export interface RetentionSummaryRecord {
  /** Somme des retenues encore détenues. */
  totalHeld: number;
  /** Somme des retenues déjà libérées. */
  totalReleased: number;
  /**
   * Détenues dont la date prévue est dépassée.
   *
   * C'est le seul chiffre qui appelle une action : un tiers qui attend son
   * argent au-delà de la date convenue finit par le réclamer, et mieux vaut
   * l'avoir vu avant lui.
   */
  overdueHeld: number;
  overdueCount: number;
  currency: string;
}

export type GetRetentionSummary = (tenantId: string, filters: { siteId?: string }) => Promise<RetentionSummaryRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const createRetentionTxStub: CreateRetentionTx = async () => {
  throw new NotImplementedYetError('createRetentionTx');
};

export const releaseRetentionTxStub: ReleaseRetentionTx = async () => {
  throw new NotImplementedYetError('releaseRetentionTx');
};

export const listRetentionsStub: ListRetentions = async () => {
  throw new NotImplementedYetError('listRetentions');
};

export const getRetentionStub: GetRetention = async () => {
  throw new NotImplementedYetError('getRetention');
};

export const getRetentionSummaryStub: GetRetentionSummary = async () => {
  throw new NotImplementedYetError('getRetentionSummary');
};
