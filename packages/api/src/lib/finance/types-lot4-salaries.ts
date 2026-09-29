/**
 * Contrat gelé — lot 4, troisième sous-lot : les salaires (PRD E8, besoins
 * B11 et P9).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus. Fichier séparé des
 * deux autres contrats du lot 4, tous gelés.
 *
 * ---------------------------------------------------------------------------
 * Aucun calcul social, et c'est une exigence
 * ---------------------------------------------------------------------------
 *
 * Le PRD le dit en toutes lettres : « aucun calcul de cotisation ». Le module
 * constate une dépense et une dette envers un salarié ; il ne calcule ni
 * cotisation, ni retenue, ni net à payer. **Ce qui est saisi est ce qui sera
 * versé.**
 *
 * Ce n'est pas un raccourci : une paie complète est un métier, soumis à un
 * droit local qui change, et la cliente n'a pas demandé un logiciel de paie.
 * Elle a demandé que les salaires d'un chantier entrent dans son coût.
 *
 * ---------------------------------------------------------------------------
 * Le cycle, calqué sur le fournisseur du lot 2
 * ---------------------------------------------------------------------------
 *
 * C'est le même mouvement d'argent : une pièce crée la dette, une autre
 * l'éteint.
 *
 *   1. La note de salaire est saisie, puis validée : la charge naît, et le
 *      compte de l'employé devient créditeur de ce qu'on lui doit.
 *   2. Quand la note porte un chantier, la charge s'impute à son coût. C'est
 *      le besoin P9, et c'est ce qui fait qu'un chantier connaît sa
 *      main-d'œuvre.
 *   3. Le règlement éteint la dette.
 *
 * ---------------------------------------------------------------------------
 * Le poste de dépense, exigé et jamais deviné
 * ---------------------------------------------------------------------------
 *
 * Le PRD dit « poste main-d'œuvre ». Le domaine ne le devine **pas** depuis un
 * libellé : les postes sont propres à chaque agence et librement renommables,
 * et résoudre par le texte casserait le jour où quelqu'un écrit « Main
 * d'oeuvre » sans apostrophe.
 *
 * L'écran présente le poste pré-sélectionné ; le domaine, lui, l'exige dès
 * qu'un chantier est renseigné. Même parti pris qu'au bail de terrain, pour la
 * même raison : un poste deviné se lirait comme un choix sans en être un.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { OutflowPayer } from '../treasury/outflow';
import type { SupplierInvoiceStatus } from '@prisma/client';
import { NotImplementedYetError } from './types';

export type SalaryDocumentStatus = SupplierInvoiceStatus;

// ---------------------------------------------------------------------------
// L'employé
// ---------------------------------------------------------------------------

export interface EmployeeRecord {
  id: string;
  tenantId: string;
  fullName: string;
  role: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
  /**
   * Ce qu'on lui doit encore, à l'instant de la lecture.
   *
   * **Positif quand nous lui devons**, comme pour un fournisseur au lot 2.
   */
  accountBalance: number;
  currency: string;
}

/**
 * Enregistre un salarié et ouvre son compte de tiers.
 *
 * Distinct d'un `User`, qui est un compte d'accès à l'application : un maçon
 * n'ouvre pas l'application, et un comptable qui l'ouvre n'est pas forcément
 * payé par ce module.
 *
 * Le compte naît avec le salarié : sans lui, la première note de salaire le
 * trouverait manquant.
 */
export type CreateEmployeeTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { fullName: string; role?: string | null }
) => Promise<EmployeeRecord>;

export type ListEmployees = (tenantId: string, filters: { onlyActive?: boolean }) => Promise<EmployeeRecord[]>;

export type GetEmployee = (tenantId: string, employeeId: string) => Promise<EmployeeRecord>;

// ---------------------------------------------------------------------------
// La note de salaire
// ---------------------------------------------------------------------------

export interface SalaryNoteRecord {
  id: string;
  employeeId: string;
  employeeLabel: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  currency: string;
  siteId: string | null;
  /** Nom du chantier. Nul quand la note n'en porte aucun. */
  siteLabel: string | null;
  costCategoryId: string | null;
  costCategoryLabel: string | null;
  status: SalaryDocumentStatus;
  createdByLabel: string;
  validatedAt: Date | null;
}

/**
 * Saisit la note de salaire d'un mois, à l'état brouillon.
 *
 * Aucune écriture, aucun mouvement, aucune imputation : une note saisie n'a
 * encore rien constaté. Tout naît à la validation.
 *
 * **Une note par employé et par mois.** L'unicité l'impose en base, et le
 * service la vérifie avant d'écrire — en PostgreSQL une commande en échec
 * condamne toute la transaction. Sans cette contrainte, une double saisie
 * ferait payer deux fois le même mois, et personne ne s'en apercevrait avant
 * que le salarié ne le signale.
 *
 * `costCategoryId` est **exigé dès que `siteId` est renseigné** : une
 * imputation sans poste n'existe pas. Il est refusé quand il n'y a pas de
 * chantier, plutôt qu'ignoré — accepter un champ qui ne servira à rien
 * laisserait croire qu'il a servi.
 */
export type CreateSalaryNoteTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    employeeId: string;
    periodYear: number;
    periodMonth: number;
    amount: number;
    siteId?: string | null;
    costCategoryId?: string | null;
    createdByUserId: string;
  }
) => Promise<SalaryNoteRecord>;

/**
 * Valide la note : écriture, mouvement de compte, et imputation s'il y a un
 * chantier — le tout dans une transaction.
 *
 * Journal : débit des charges de personnel (661), crédit des rémunérations
 * dues (422). Compte de tiers : l'employé devient créditeur.
 *
 * Quand la note porte un chantier, elle produit une imputation validée, et le
 * coût réel du chantier monte d'autant. Les programmes de travaux rattachés
 * suivent dans la même transaction.
 */
export type ValidateSalaryNoteTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  salaryNoteId: string,
  validatedByUserId: string
) => Promise<SalaryNoteRecord>;

export type ListSalaryNotes = (
  tenantId: string,
  filters: { employeeId?: string; siteId?: string; periodYear?: number; periodMonth?: number }
) => Promise<SalaryNoteRecord[]>;

// ---------------------------------------------------------------------------
// Le règlement
// ---------------------------------------------------------------------------

export interface SalaryPaymentRecord {
  id: string;
  employeeId: string;
  employeeLabel: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  status: SalaryDocumentStatus;
  createdByLabel: string;
  validatedAt: Date | null;
}

/**
 * Saisit un règlement de salaire, à l'état brouillon.
 *
 * **Sans affectation à des notes précises**, contrairement au règlement
 * fournisseur du lot 2 : on paie un salarié, pas une facture. Le solde de son
 * compte dit ce qui lui reste dû, et c'est la seule question qu'on se pose.
 */
export type CreateSalaryPaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { employeeId: string; paymentDate: Date; amount: number; createdByUserId: string }
) => Promise<SalaryPaymentRecord>;

/**
 * Valide le règlement : écriture et mouvement de compte.
 *
 * Journal : débit des rémunérations dues (422), crédit de la caisse (571).
 * Compte de tiers : ce qu'on doit à l'employé diminue d'autant.
 *
 * **Ne refuse pas un règlement supérieur au solde.** Une avance sur salaire
 * est courante, et la refuser empêcherait d'enregistrer un versement qui a
 * bien eu lieu. Le compte devient alors débiteur, comme l'acompte versé à un
 * fournisseur au lot 2.
 */
export type ValidateSalaryPaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  salaryPaymentId: string,
  validatedByUserId: string,
  /** D'où sort l'argent (mode, compte). Défaut : espèces, caisse. BUG-2026-09-29-032. */
  payer?: OutflowPayer | null
) => Promise<SalaryPaymentRecord>;

export type ListSalaryPayments = (tenantId: string, employeeId: string) => Promise<SalaryPaymentRecord[]>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const createEmployeeTxStub: CreateEmployeeTx = async () => {
  throw new NotImplementedYetError('createEmployeeTx');
};

export const listEmployeesStub: ListEmployees = async () => {
  throw new NotImplementedYetError('listEmployees');
};

export const getEmployeeStub: GetEmployee = async () => {
  throw new NotImplementedYetError('getEmployee');
};

export const createSalaryNoteTxStub: CreateSalaryNoteTx = async () => {
  throw new NotImplementedYetError('createSalaryNoteTx');
};

export const validateSalaryNoteTxStub: ValidateSalaryNoteTx = async () => {
  throw new NotImplementedYetError('validateSalaryNoteTx');
};

export const listSalaryNotesStub: ListSalaryNotes = async () => {
  throw new NotImplementedYetError('listSalaryNotes');
};

export const createSalaryPaymentTxStub: CreateSalaryPaymentTx = async () => {
  throw new NotImplementedYetError('createSalaryPaymentTx');
};

export const validateSalaryPaymentTxStub: ValidateSalaryPaymentTx = async () => {
  throw new NotImplementedYetError('validateSalaryPaymentTx');
};

export const listSalaryPaymentsStub: ListSalaryPayments = async () => {
  throw new NotImplementedYetError('listSalaryPayments');
};
