/**
 * Contrat gelé du domaine financier — lot 4, premier sous-lot : les baux de
 * terrain (PRD E7, besoin B10).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus. Même discipline
 * qu'aux lots 1, 2 et 3.
 *
 * Fichier séparé de `types.ts`, `types-lot2.ts` et `types-lot3.ts`, tous gelés.
 * On ajoute, on ne réécrit pas.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce sous-lot ouvre le lot 4, seul
 * ---------------------------------------------------------------------------
 *
 * C'est le **seul « must »** du lot 4 dans le PRD ; les associations, les
 * salaires, les tâcherons, la retenue de garantie et la clôture sont tous en
 * priorité inférieure. Le plan dit par ailleurs que ces sous-lots sont
 * indépendants et peuvent être livrés séparément.
 *
 * S'y ajoute une raison de méthode. Trois lots de suite, les défauts les plus
 * coûteux sont venus de contrats que j'ai gelés seuls et que personne n'a
 * relus. Un contrat plus court est un contrat que je rate moins.
 *
 * ---------------------------------------------------------------------------
 * Le cycle, en trois temps
 * ---------------------------------------------------------------------------
 *
 *   1. **Le bail est enregistré**, et ouvre le compte de tiers du bailleur.
 *   2. **Le paiement annuel est saisi puis validé.** L'avance est versée, et le
 *      compte du bailleur devient *débiteur* de ce qu'il nous doit encore en
 *      jouissance du terrain.
 *   3. **Chaque mois, un douzième est constaté.** La charge naît, le compte du
 *      bailleur remonte d'autant, et il atteint zéro au douzième mois.
 *
 * Sans ce mécanisme, un chantier sur terrain loué porterait la totalité du
 * loyer le mois du paiement et rien les onze suivants : son coût deviendrait
 * illisible, ce que le PRD demande précisément d'éviter.
 *
 * ---------------------------------------------------------------------------
 * Les deux vues, comme aux lots précédents
 * ---------------------------------------------------------------------------
 *
 * Le **compte de tiers** porte la vue de la gestionnaire : combien ai-je payé
 * d'avance à ce bailleur, combien reste-t-il à consommer.
 *
 * Le **journal** porte la vue comptable : le paiement débite les charges
 * constatées d'avance (486), la constatation mensuelle les vire aux locations
 * (613). Les deux vues ne se contredisent jamais parce qu'elles naissent de la
 * même pièce, dans la même transaction.
 *
 * ---------------------------------------------------------------------------
 * Le prorata, tranché ici parce que le PRD ne le dit pas
 * ---------------------------------------------------------------------------
 *
 * Le PRD dit que la charge « s'impute aux chantiers rattachés au prorata »,
 * sans dire au prorata de quoi. Un chantier ne porte ni surface ni durée
 * exploitable : il n'existe aucune grandeur sur laquelle proratiser.
 *
 * **La charge est donc répartie à parts égales entre les chantiers actifs du
 * bail**, et le reliquat de l'arrondi va au premier d'entre eux, par ordre de
 * création — sans quoi la somme des imputations ne vaudrait pas la charge, et
 * le coût réel des chantiers s'écarterait du grand livre.
 *
 * Quand un bail n'a **aucun** chantier actif, la charge est constatée en
 * comptabilité sans imputation analytique. Elle a bien eu lieu ; elle n'est
 * simplement imputable à rien.
 *
 * Référence : `docs/finance/PLAN-mise-en-oeuvre.md` §8 et `specs/019-finance-baux-terrain/`.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { NotImplementedYetError } from './types';

// ---------------------------------------------------------------------------
// Le bail
// ---------------------------------------------------------------------------

export interface LandLeaseSiteRef {
  siteId: string;
  /** Nom du chantier. L'écran ne montre jamais l'identifiant. */
  siteLabel: string;
  status: string;
}

export interface LandLeaseRecord {
  id: string;
  tenantId: string;
  landlordAccountId: string;
  landlordName: string;
  landLabel: string;
  annualAmount: number;
  /** Poste auquel le loyer s'impute dans le coût des chantiers. */
  costCategoryId: string;
  /** Nom du poste, résolu. L'écran ne montre jamais l'identifiant. */
  costCategoryLabel: string;
  /**
   * `annualAmount / 12`, arrondi à l'unité de franc. **Calculé, jamais stocké.**
   *
   * Le reliquat d'arrondi des douze mois est porté par la dernière
   * constatation de la période, sans quoi douze douzièmes ne feraient pas un
   * an. Voir `RecordLandLeaseAccrualTx`.
   */
  monthlyAmount: number;
  currency: string;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  /** Les chantiers rattachés, nommés. */
  sites: LandLeaseSiteRef[];
  /**
   * Ce que le bailleur nous doit encore en jouissance, à l'instant de la
   * lecture. C'est le solde du compte de tiers, **négatif** quand nous avons
   * payé d'avance — même convention de signe qu'au lot 2 pour l'acompte versé
   * à un fournisseur.
   */
  accountBalance: number;
}

/**
 * Enregistre un bail et ouvre le compte de tiers du bailleur.
 *
 * Le compte naît avec le bail, dans la même transaction : un bail sans compte
 * ne pourrait rien devoir, et le premier paiement le trouverait manquant.
 * Même raison qu'au lot 2 pour le fournisseur.
 *
 * Le montant annuel doit être strictement positif, et la date de fin, quand
 * elle existe, postérieure à la date de début.
 */
export type CreateLandLeaseTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    landlordName: string;
    landLabel: string;
    annualAmount: number;
    /**
     * Poste de dépense auquel le loyer s'imputera.
     *
     * Obligatoire, et demandé plutôt que deviné : c'est la gestionnaire qui
     * sait si le loyer d'un terrain relève des « Divers » ou d'un poste
     * qu'elle a créé pour cela. Un poste deviné se lirait comme un choix, et
     * personne ne saurait qu'il n'en était pas un.
     *
     * Sans lui, la constatation mensuelle ne pourrait produire aucune
     * imputation — `CostAllocation` exige un poste — et le loyer n'entrerait
     * jamais dans le coût du chantier.
     */
    costCategoryId: string;
    startDate: Date;
    endDate?: Date | null;
  }
) => Promise<LandLeaseRecord>;

/**
 * Rattache un chantier à un bail, ou l'en détache quand `landLeaseId` vaut
 * `null`.
 *
 * Un chantier dépend d'au plus un bail : on ne bâtit pas sur deux terrains à
 * la fois. Rattacher un chantier déjà rattaché ailleurs remplace le lien,
 * sans erreur — c'est une correction, pas un conflit.
 *
 * **Ne recalcule aucune constatation passée.** Rattacher un chantier en juin
 * ne lui fait pas porter les loyers de janvier à mai : ce serait réécrire
 * l'histoire, et les imputations de ces mois-là sont déjà validées.
 */
export type AttachSiteToLandLeaseTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  landLeaseId: string | null
) => Promise<LandLeaseRecord | null>;

export type ListLandLeases = (tenantId: string, filters: { onlyActive?: boolean }) => Promise<LandLeaseRecord[]>;

export type GetLandLease = (tenantId: string, landLeaseId: string) => Promise<LandLeaseRecord>;

// ---------------------------------------------------------------------------
// Le paiement annuel
// ---------------------------------------------------------------------------

export type LandLeaseDocumentStatus = 'DRAFT' | 'VALIDATED';

export interface LandLeasePaymentRecord {
  id: string;
  landLeaseId: string;
  landlordName: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  coverageStartDate: Date;
  coverageEndDate: Date;
  status: LandLeaseDocumentStatus;
  createdByLabel: string;
  validatedAt: Date | null;
}

/**
 * Saisit le paiement annuel, à l'état brouillon.
 *
 * Aucune écriture, aucun mouvement de compte : un paiement saisi n'a encore
 * rien payé. Tout naît à la validation, comme pour toute pièce depuis le
 * lot 2.
 *
 * La période couverte est obligatoire et doit être cohérente : fin après
 * début. C'est elle qui dira, plus tard, quels mois la constatation doit
 * couvrir.
 */
export type CreateLandLeasePaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    landLeaseId: string;
    paymentDate: Date;
    amount: number;
    coverageStartDate: Date;
    coverageEndDate: Date;
    createdByUserId: string;
  }
) => Promise<LandLeasePaymentRecord>;

/**
 * Valide le paiement : écriture et mouvement de compte, en une transaction.
 *
 * Journal : débit des charges constatées d'avance (486), crédit de la caisse
 * (571). Compte de tiers : le bailleur devient débiteur du montant versé.
 */
export type ValidateLandLeasePaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  paymentId: string,
  validatedByUserId: string
) => Promise<LandLeasePaymentRecord>;

export type ListLandLeasePayments = (tenantId: string, landLeaseId: string) => Promise<LandLeasePaymentRecord[]>;

// ---------------------------------------------------------------------------
// La constatation mensuelle
// ---------------------------------------------------------------------------

export interface LandLeaseAccrualRecord {
  id: string;
  landLeaseId: string;
  landlordName: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  currency: string;
  /** Les imputations produites, par chantier. Vide si le bail n'en a aucun. */
  allocations: Array<{ siteId: string; siteLabel: string; amount: number }>;
  createdAt: Date;
}

/**
 * Constate un douzième du loyer annuel pour un mois donné.
 *
 * **Idempotente.** Un second appel sur le même triplet `(bail, année, mois)`
 * ne crée rien et renvoie la constatation existante. C'est ce qui permet au
 * travail programmé de se rejouer sans rien doubler, exactement comme la
 * campagne de facturation du lot 1 se rejoue sans refacturer. La contrainte
 * d'unicité en base est le filet ; la lecture préalable est la règle, parce
 * qu'en PostgreSQL une commande en échec condamne toute la transaction.
 *
 * **Pas d'état brouillon.** Personne ne saisit une constatation, et il n'y
 * aurait personne pour la valider : elle naît validée, avec son écriture. Le
 * principe P-2 tient — la pièce précède l'écriture — seul le cycle
 * brouillon/validé ne s'applique pas.
 *
 * **Le reliquat d'arrondi va au douzième mois.** Onze mois à `round(annuel/12)`
 * puis un dernier à `annuel - 11 × round(annuel/12)` : sans cela, douze
 * douzièmes ne feraient pas un an, et le compte du bailleur n'atteindrait pas
 * zéro — ce que le PRD exige explicitement.
 *
 * Le mois se compte à partir de la date de début du bail, pas de janvier : un
 * bail qui commence en mars a son douzième mois en février suivant.
 */
export type RecordLandLeaseAccrualTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { landLeaseId: string; periodYear: number; periodMonth: number }
) => Promise<LandLeaseAccrualRecord>;

export type ListLandLeaseAccruals = (tenantId: string, landLeaseId: string) => Promise<LandLeaseAccrualRecord[]>;

/**
 * Constate le mois échu pour **tous** les baux actifs d'une agence, ou de
 * toutes les agences quand `tenantId` est absent.
 *
 * C'est le point d'entrée du travail programmé du 1er du mois. Il traite
 * chaque bail dans sa propre transaction : un bail mal configuré ne doit pas
 * empêcher les autres d'être constatés. Le compte rendu dit ce qui a été
 * constaté et ce qui a échoué, avec la raison.
 */
export type RunMonthlyLandLeaseAccruals = (params: {
  tenantId?: string;
  periodYear: number;
  periodMonth: number;
}) => Promise<{
  constatees: number;
  dejaConstatees: number;
  echecs: Array<{ landLeaseId: string; landlordName: string; raison: string }>;
}>;

// ---------------------------------------------------------------------------
// Talons — remplacés par les implémentations, jamais appelés en production
// ---------------------------------------------------------------------------

export const createLandLeaseTxStub: CreateLandLeaseTx = async () => {
  throw new NotImplementedYetError('createLandLeaseTx');
};

export const attachSiteToLandLeaseTxStub: AttachSiteToLandLeaseTx = async () => {
  throw new NotImplementedYetError('attachSiteToLandLeaseTx');
};

export const listLandLeasesStub: ListLandLeases = async () => {
  throw new NotImplementedYetError('listLandLeases');
};

export const getLandLeaseStub: GetLandLease = async () => {
  throw new NotImplementedYetError('getLandLease');
};

export const createLandLeasePaymentTxStub: CreateLandLeasePaymentTx = async () => {
  throw new NotImplementedYetError('createLandLeasePaymentTx');
};

export const validateLandLeasePaymentTxStub: ValidateLandLeasePaymentTx = async () => {
  throw new NotImplementedYetError('validateLandLeasePaymentTx');
};

export const listLandLeasePaymentsStub: ListLandLeasePayments = async () => {
  throw new NotImplementedYetError('listLandLeasePayments');
};

export const recordLandLeaseAccrualTxStub: RecordLandLeaseAccrualTx = async () => {
  throw new NotImplementedYetError('recordLandLeaseAccrualTx');
};

export const listLandLeaseAccrualsStub: ListLandLeaseAccruals = async () => {
  throw new NotImplementedYetError('listLandLeaseAccruals');
};

export const runMonthlyLandLeaseAccrualsStub: RunMonthlyLandLeaseAccruals = async () => {
  throw new NotImplementedYetError('runMonthlyLandLeaseAccruals');
};
