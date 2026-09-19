/**
 * Contrat gelé — lot 4, quatrième sous-lot : les tâcherons (PRD E8,
 * besoin P10).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * Un tâcheron n'est pas un fournisseur, même s'il lui ressemble
 * ---------------------------------------------------------------------------
 *
 * Il ne facture pas. Il convient d'un **marché** pour un ouvrage, puis
 * présente des **situations** d'avancement à mesure qu'il avance.
 *
 * ---------------------------------------------------------------------------
 * Deux soldes, et les confondre est l'erreur à ne pas faire
 * ---------------------------------------------------------------------------
 *
 * ```
 * marché restant   = montant convenu − situations validées
 * ce qu'on lui doit = situations validées − règlements
 * ```
 *
 * Le premier dit ce qui reste à exécuter. Le second dit ce qui reste à payer.
 * Un tâcheron peut avoir terminé son marché et rester créancier, ou n'avoir
 * rien fait et être débiteur d'un acompte.
 *
 * ---------------------------------------------------------------------------
 * Les acomptes se déduisent tout seuls
 * ---------------------------------------------------------------------------
 *
 * Un règlement versé avant toute situation rend le compte débiteur ; la
 * première situation le ramène vers zéro. C'est exactement le mécanisme de
 * l'acompte fournisseur du lot 2, et il n'y a rien de plus à modéliser.
 *
 * Le PRD parle d'« acomptes déduits » : ils le sont par le solde lui-même,
 * sans table d'affectation.
 *
 * ---------------------------------------------------------------------------
 * Un dépassement de marché n'est pas refusé
 * ---------------------------------------------------------------------------
 *
 * Si le tâcheron a fait davantage, la situation dit ce qui a été fait. La
 * refuser empêcherait d'enregistrer un travail réel — même erreur que bloquer
 * une facture parce qu'un budget est dépassé, leçon déjà tirée au lot 3 avec
 * l'alerte de dépassement.
 *
 * Le dépassement est **exposé**, jamais interdit : `remainingAmount` devient
 * négatif et `isOverrun` le dit.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { SupplierInvoiceStatus } from '@prisma/client';
import { NotImplementedYetError } from './types';

export type ContractorDocumentStatus = SupplierInvoiceStatus;

// ---------------------------------------------------------------------------
// Le tâcheron
// ---------------------------------------------------------------------------

export interface ContractorRecord {
  id: string;
  tenantId: string;
  fullName: string;
  trade: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
  /** Ce qu'on lui doit. **Positif quand nous lui devons**, négatif s'il a reçu une avance. */
  accountBalance: number;
  currency: string;
}

export type CreateContractorTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { fullName: string; trade?: string | null }
) => Promise<ContractorRecord>;

export type ListContractors = (tenantId: string, filters: { onlyActive?: boolean }) => Promise<ContractorRecord[]>;

// ---------------------------------------------------------------------------
// Le marché
// ---------------------------------------------------------------------------

export interface ContractorContractRecord {
  id: string;
  contractorId: string;
  contractorLabel: string;
  siteId: string;
  siteLabel: string;
  costCategoryId: string;
  costCategoryLabel: string;
  reference: string;
  agreedAmount: number;
  currency: string;
  signedDate: Date;
  isActive: boolean;
  /** Somme des situations **validées**. Calculé, jamais stocké. */
  statementedAmount: number;
  /**
   * `agreedAmount − statementedAmount`. **Négatif en cas de dépassement.**
   *
   * C'est le marché restant, pas ce qu'on doit : voir l'en-tête sur les deux
   * soldes.
   */
  remainingAmount: number;
  /** Vrai quand les situations dépassent le marché convenu. */
  isOverrun: boolean;
}

/**
 * Convient d'un marché avec un tâcheron, sur un chantier et un poste.
 *
 * Le poste est exigé, jamais deviné : c'est lui qui recevra les situations
 * dans le coût du chantier.
 */
export type CreateContractorContractTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    contractorId: string;
    siteId: string;
    costCategoryId: string;
    reference: string;
    agreedAmount: number;
    signedDate: Date;
  }
) => Promise<ContractorContractRecord>;

export type ListContractorContracts = (
  tenantId: string,
  filters: { contractorId?: string; siteId?: string }
) => Promise<ContractorContractRecord[]>;

export type GetContractorContract = (tenantId: string, contractId: string) => Promise<ContractorContractRecord>;

// ---------------------------------------------------------------------------
// La situation d'avancement
// ---------------------------------------------------------------------------

export interface ProgressStatementRecord {
  id: string;
  contractId: string;
  contractReference: string;
  contractorLabel: string;
  statementDate: Date;
  amount: number;
  currency: string;
  description: string;
  status: ContractorDocumentStatus;
  createdByLabel: string;
  validatedAt: Date | null;
}

/**
 * Saisit une situation d'avancement, à l'état brouillon.
 *
 * Aucune écriture, aucun mouvement, aucune imputation : une situation saisie
 * n'a encore rien constaté.
 *
 * La description est obligatoire. Une situation sans description est un
 * chiffre que personne ne saura justifier six mois plus tard — même exigence
 * que le motif d'un avenant au lot 3.
 */
export type CreateProgressStatementTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { contractId: string; statementDate: Date; amount: number; description: string; createdByUserId: string }
) => Promise<ProgressStatementRecord>;

/**
 * Valide la situation : écriture, mouvement de compte, imputation au chantier.
 *
 * Journal : débit du compte de charge du poste du marché — celui que
 * `resolveExpenseAccountsByCostCategoryTx` résout, avec repli sur les charges
 * de chantier — et crédit des tâcherons (402). Compte de tiers : le tâcheron
 * devient créancier.
 *
 * L'imputation fait monter le coût réel du chantier, et les programmes de
 * travaux rattachés suivent dans la même transaction.
 */
export type ValidateProgressStatementTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  statementId: string,
  validatedByUserId: string
) => Promise<ProgressStatementRecord>;

export type ListProgressStatements = (tenantId: string, contractId: string) => Promise<ProgressStatementRecord[]>;

// ---------------------------------------------------------------------------
// Le règlement
// ---------------------------------------------------------------------------

export interface ContractorPaymentRecord {
  id: string;
  contractorId: string;
  contractorLabel: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  status: ContractorDocumentStatus;
  createdByLabel: string;
  validatedAt: Date | null;
}

/**
 * Saisit un règlement, à l'état brouillon.
 *
 * Sans affectation à des situations précises. Un règlement versé avant toute
 * situation est un acompte : il rend le compte débiteur, et la première
 * situation le ramène vers zéro.
 */
export type CreateContractorPaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { contractorId: string; paymentDate: Date; amount: number; createdByUserId: string }
) => Promise<ContractorPaymentRecord>;

/**
 * Valide le règlement : écriture et mouvement de compte.
 *
 * Journal : débit des tâcherons (402), crédit de la caisse (571).
 *
 * **N'est pas refusé quand il dépasse ce qu'on doit** : c'est un acompte, et
 * le PRD le prévoit explicitement.
 */
export type ValidateContractorPaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  paymentId: string,
  validatedByUserId: string
) => Promise<ContractorPaymentRecord>;

export type ListContractorPayments = (tenantId: string, contractorId: string) => Promise<ContractorPaymentRecord[]>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const createContractorTxStub: CreateContractorTx = async () => {
  throw new NotImplementedYetError('createContractorTx');
};

export const listContractorsStub: ListContractors = async () => {
  throw new NotImplementedYetError('listContractors');
};

export const createContractorContractTxStub: CreateContractorContractTx = async () => {
  throw new NotImplementedYetError('createContractorContractTx');
};

export const listContractorContractsStub: ListContractorContracts = async () => {
  throw new NotImplementedYetError('listContractorContracts');
};

export const getContractorContractStub: GetContractorContract = async () => {
  throw new NotImplementedYetError('getContractorContract');
};

export const createProgressStatementTxStub: CreateProgressStatementTx = async () => {
  throw new NotImplementedYetError('createProgressStatementTx');
};

export const validateProgressStatementTxStub: ValidateProgressStatementTx = async () => {
  throw new NotImplementedYetError('validateProgressStatementTx');
};

export const listProgressStatementsStub: ListProgressStatements = async () => {
  throw new NotImplementedYetError('listProgressStatements');
};

export const createContractorPaymentTxStub: CreateContractorPaymentTx = async () => {
  throw new NotImplementedYetError('createContractorPaymentTx');
};

export const validateContractorPaymentTxStub: ValidateContractorPaymentTx = async () => {
  throw new NotImplementedYetError('validateContractorPaymentTx');
};

export const listContractorPaymentsStub: ListContractorPayments = async () => {
  throw new NotImplementedYetError('listContractorPayments');
};
