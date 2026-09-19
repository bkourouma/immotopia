/**
 * Contrat gelé du domaine financier — lot 2, fournisseurs et chantiers.
 *
 * Écrit **avant** les implémentations, et il ne bouge plus. Même discipline
 * qu'au lot 1, et pour la même raison : c'est ce qui permet à plusieurs agents
 * de coder en parallèle sans s'attendre. Les talons lèvent une erreur explicite
 * tant que l'implémentation n'est pas là, de sorte qu'un appelant compile et se
 * teste avant elle.
 *
 * Fichier séparé de `types.ts`, qui reste le contrat du lot 1, littéralement
 * gelé. On ajoute, on ne réécrit pas.
 *
 * Les quatre règles du lot 1 s'appliquent inchangées :
 *
 *   1. **Aucun « débit » ni « crédit » ne sort d'ici.** Les colonnes portent
 *      ces noms, la frontière de l'API non : on *facture* (`amountBilled`), on
 *      *règle* (`amountSettled`), on *impute* (`allocations`).
 *   2. **Les montants circulent en `number`**, arrondis. Les colonnes restent
 *      en `Decimal(14,2)`.
 *   3. **Toute fonction qui écrit prend un client de transaction.** La pièce,
 *      son écriture et ses imputations naissent ensemble ou pas du tout.
 *   4. **La pièce précède l'écriture** (principe P-2 du PRD). Aucune fonction
 *      d'ici ne crée d'écriture libre : `postDocumentEntryTx` part toujours
 *      d'une pièce validée.
 *
 * S'y ajoute une règle propre à ce lot :
 *
 *   5. **Ce qui est validé ne bouge plus** (principe P-6). Une pièce validée
 *      est en lecture seule. On corrige par une pièce d'annulation liée, qui
 *      produit l'écriture inverse, et l'historique montre les deux.
 *
 * Références : `specs/017-finance-fournisseurs-chantiers/` et
 * `docs/finance/PLAN-mise-en-oeuvre.md` §6.
 */

import type {
  AccountingScope,
  ConstructionSiteStatus,
  CostAllocationSourceType,
  SupplierInvoiceStatus,
  SupplierKind,
  VoidableDocumentType
} from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { NotImplementedYetError, type PeriodRange } from './types';

export type {
  AccountingScope,
  ConstructionSiteStatus,
  CostAllocationSourceType,
  SupplierInvoiceStatus,
  SupplierKind,
  VoidableDocumentType
};

// ---------------------------------------------------------------------------
// Moteur comptable généralisé
// ---------------------------------------------------------------------------

/**
 * Une ligne d'écriture, dans le vocabulaire de la base.
 *
 * C'est le seul type de ce fichier qui parle de débit et de crédit, et il ne
 * franchit jamais la frontière de l'API : la partie double est générée sous le
 * capot, jamais exposée. C'est le principe P-1 du PRD, et une métrique de
 * succès du projet.
 */
export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  label: string;
}

export interface PostDocumentEntryParams {
  tenantId: string;
  journalId: string;
  entryDate: Date;
  reference: string;
  description: string;
  /** La pièce d'origine. Aucune écriture n'existe sans elle. */
  documentType: VoidableDocumentType | 'VOID';
  documentId: string;
  lines: JournalLineInput[];
}

/**
 * Écrit l'écriture d'une pièce validée, et la verrouille dans la même
 * transaction.
 *
 * **Le verrouillage est immédiat, et c'est le changement voulu.** Aujourd'hui
 * le drapeau `isLocked` ne protège rien : il n'est lu nulle part ailleurs que
 * dans la fonction qui le pose, et l'immuabilité tient à l'absence de route
 * d'écriture. C'est le défaut n°2 du §6.1 bis du plan. Ici, on ne s'en remet
 * pas à la pauvreté de l'API.
 *
 * **L'équilibre est vérifié sur les montants arrondis**, ceux qui seront
 * effectivement stockés, et non sur les valeurs brutes. C'est le défaut n°1 :
 * le contrôle actuel somme les valeurs brutes puis arrondit les totaux, alors
 * que chaque ligne est arrondie à l'enregistrement, si bien qu'une écriture
 * peut être acceptée équilibrée puis stockée déséquilibrée.
 */
export type PostDocumentEntryTx = (
  tx: PrismaTransactionClient,
  params: PostDocumentEntryParams
) => Promise<{ entryId: string; totalDebit: number; totalCredit: number }>;

/**
 * Annule une pièce validée par une pièce d'annulation liée.
 *
 * Ne modifie jamais la pièce d'origine ni son écriture : elle crée l'écriture
 * inverse, la relie par `voidedByEntryId`, et marque les imputations comme
 * annulées. L'historique montre les deux mouvements, jamais un seul corrigé.
 */
export type VoidDocumentTx = (
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    documentType: VoidableDocumentType;
    documentId: string;
    reason: string;
    voidedByUserId: string;
  }
) => Promise<{ voidDocumentId: string; reversingEntryId: string }>;

export interface TrialBalanceLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  totalBilled: number;
  totalSettled: number;
  balance: number;
}

/**
 * Balance générale d'une portée, par agrégation SQL.
 *
 * Distincte de `getTrialBalanceBySyndicate`, qui n'est pas modifiée et reste le
 * chemin de la copropriété. Celle-ci agrège en `groupBy` sur `tenantId` et
 * `scope`, jamais en mémoire : le banc de charge du lot 0 mesure un facteur
 * trente entre les deux approches.
 */
export type GetTrialBalance = (
  tenantId: string,
  scope: AccountingScope,
  range?: PeriodRange
) => Promise<{ lines: TrialBalanceLine[]; totalBilled: number; totalSettled: number; isBalanced: boolean }>;

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export interface SupplierRecord {
  id: string;
  tenantId: string;
  name: string;
  kind: SupplierKind;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  /** Lien facultatif vers un prestataire de maintenance déjà connu. */
  maintenanceVendorId: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
}

/**
 * Crée un fournisseur et son compte de tiers, dans la même transaction.
 *
 * Le compte naît avec le fournisseur : un fournisseur sans compte ne pourrait
 * rien devoir, et le premier règlement le trouverait manquant.
 *
 * `MaintenanceVendor` et `Supplier` coexistent, sans fusion : le premier est un
 * modèle léger sans montant ni solde, que le module Maintenance utilise. Le
 * lien est facultatif et sert à ne pas ressaisir un nom déjà connu.
 */
export type CreateSupplierTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    name: string;
    kind: SupplierKind;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    maintenanceVendorId?: string | null;
  }
) => Promise<SupplierRecord>;

export interface CostAllocationInput {
  siteId: string;
  costCategoryId: string;
  amount: number;
}

export interface SupplierInvoiceRecord {
  id: string;
  supplierId: string;
  siteId: string | null;
  invoiceDate: Date;
  reference: string;
  amount: number;
  currency: string;
  status: SupplierInvoiceStatus;
  createdByUserId: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
}

/**
 * Saisit une facture reçue, à l'état brouillon.
 *
 * **Le rattachement à un chantier est obligatoire pour un fournisseur de
 * matériaux** (besoin B7 du PRD) : un sac de ciment est toujours acheté pour
 * quelque chose. Il reste facultatif pour une prestation.
 *
 * Une facture brouillon ne produit **ni écriture, ni mouvement, ni
 * imputation**. Rien ne bouge avant la validation.
 */
export type CreateSupplierInvoiceTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    supplierId: string;
    invoiceDate: Date;
    reference: string;
    lines: Array<{ label: string; amount: number }>;
    allocations: CostAllocationInput[];
    createdByUserId: string;
  }
) => Promise<SupplierInvoiceRecord>;

/**
 * Valide une facture : écriture, mouvement du compte fournisseur, imputations.
 *
 * Tout dans la même transaction. L'échec de l'une annule tout — pas de facture
 * validée sans son écriture, pas d'imputation orpheline.
 *
 * **Invariant vérifié avant d'écrire** : la somme des imputations égale le
 * montant de la facture. Le contrôle porte sur les montants arrondis, ceux qui
 * seront stockés, jamais sur les valeurs brutes.
 */
export type ValidateSupplierInvoiceTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  invoiceId: string,
  validatedByUserId: string
) => Promise<SupplierInvoiceRecord>;

export interface SupplierPaymentRecord {
  id: string;
  supplierId: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  status: SupplierInvoiceStatus;
  allocations: Array<{ invoiceId: string; amount: number }>;
}

/**
 * Enregistre un règlement fournisseur, total ou partiel.
 *
 * Un règlement peut couvrir plusieurs factures. Un acompte sans facture en face
 * est permis : le compte du fournisseur devient alors débiteur, symétrique
 * exact de l'avance locataire du lot 1.
 */
export type CreateSupplierPaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    supplierId: string;
    paymentDate: Date;
    amount: number;
    allocations: Array<{ invoiceId: string; amount: number }>;
    createdByUserId: string;
  }
) => Promise<SupplierPaymentRecord>;

/**
 * Valide un règlement fournisseur : écriture, mouvements de compte, dans la
 * même transaction.
 *
 * **Ajoutée le 19 septembre 2026, après le lot 2.** Le contrat OpenAPI portait
 * `POST supplier-payments/{id}/validate` depuis le gel, l'écran web l'appelait,
 * et aucune route ne l'implémentait : le règlement naissait déjà validé. Trois
 * conséquences, toutes silencieuses — le bouton « Valider le règlement »
 * répondait 404, l'écran annonçait un « brouillon » qui n'en était pas un, et
 * la file de validation, qui filtre sur `validatedAt: null`, ne montrait jamais
 * aucun règlement.
 *
 * Un règlement suit donc désormais le même cycle que la facture et la pièce de
 * caisse : brouillon à la saisie, écriture à la validation. C'est la règle de
 * l'organisation de la cliente — plusieurs saisisseurs, un validateur — et elle
 * ne souffre pas d'exception par nature de pièce.
 */
export type ValidateSupplierPaymentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  paymentId: string,
  validatedByUserId: string
) => Promise<SupplierPaymentRecord>;

export interface SuppliersBalanceLine {
  accountId: string;
  supplierId: string;
  label: string;
  totalBilled: number;
  totalSettled: number;
  /** Solde courant. Positif : nous lui devons. */
  balance: number;
  currency: string;
}

/**
 * Balance fournisseurs : miroir exact de la balance clients du lot 1.
 *
 * Même règle de lecture : sur une balance filtrée par période, « facturé » et
 * « réglé » portent l'activité de la période, tandis que « solde » porte le
 * solde courant. Avec l'autre lecture, un fournisseur sans mouvement dans la
 * période afficherait zéro et notre dette envers lui disparaîtrait de la liste.
 */
export type GetSuppliersBalance = (
  tenantId: string,
  filters?: { range?: PeriodRange; siteId?: string }
) => Promise<{ lines: SuppliersBalanceLine[]; totalBalance: number; currency: string }>;

// ---------------------------------------------------------------------------
// Chantiers
// ---------------------------------------------------------------------------

export interface ConstructionSiteRecord {
  id: string;
  tenantId: string;
  name: string;
  zone: string | null;
  /** Facultatif : un chantier peut n'avoir aucun bien au patrimoine. */
  propertyId: string | null;
  managerId: string | null;
  status: ConstructionSiteStatus;
  startDate: Date | null;
  plannedEndDate: Date | null;
  progressPercent: number;
  closedAt: Date | null;
  finalCost: number | null;
  /**
   * Somme des imputations validées et non annulées. **Jamais stocké.**
   *
   * C'est le principe P-4 du PRD : un chiffre qu'on tape à la main est un
   * chiffre qu'on oublie de mettre à jour.
   */
  actualCost: number;
  currency: string;
}

export type CreateConstructionSite = (
  tenantId: string,
  params: {
    name: string;
    zone?: string | null;
    propertyId?: string | null;
    managerId?: string | null;
    startDate?: Date | null;
    plannedEndDate?: Date | null;
  }
) => Promise<ConstructionSiteRecord>;

export type ListConstructionSites = (
  tenantId: string,
  filters?: { status?: ConstructionSiteStatus; skip?: number; take?: number }
) => Promise<{ sites: ConstructionSiteRecord[]; total: number }>;

export interface SiteAllocationLine {
  id: string;
  allocationDate: Date;
  costCategoryId: string;
  costCategoryLabel: string;
  sourceType: CostAllocationSourceType;
  sourceId: string;
  /** Libellé lisible de la pièce d'origine, jamais son identifiant. */
  sourceLabel: string;
  amount: number;
}

export interface SiteDetail {
  site: ConstructionSiteRecord;
  allocations: SiteAllocationLine[];
  /** Sous-totaux par poste de dépense, dans l'ordre d'affichage. */
  byCostCategory: Array<{ costCategoryId: string; label: string; amount: number }>;
}

/**
 * Le détail d'un chantier : toutes ses imputations, avec leur pièce d'origine.
 *
 * Chaque ligne porte un libellé lisible, résolu par le serveur. Le lot 1 avait
 * livré un compte rendu de campagne qui n'affichait que des identifiants, et
 * il a fallu le corriger : une gestionnaire qui lit « Pièce 3f2a9b8c » ne peut
 * rien en faire.
 */
export type GetSiteDetail = (tenantId: string, siteId: string) => Promise<SiteDetail>;

export interface CostCategoryRecord {
  id: string;
  tenantId: string;
  label: string;
  position: number;
  isActive: boolean;
  /**
   * Compte de charge du plan comptable, s'il en porte un.
   *
   * Ajouté le 19 septembre 2026. Sans ce lien, toute dépense de chantier
   * frappait le même compte, quel que soit le poste : le grand livre ne
   * distinguait pas le ciment de la main-d'œuvre. Un poste sans compte
   * retombe sur le compte par défaut, exactement comme avant.
   */
  chartOfAccountId: string | null;
  /** Numéro et nom du compte, résolus. Nuls quand le poste n'en porte pas. */
  chartOfAccountLabel: string | null;
}

/**
 * Les postes de dépense d'une agence, créés au premier chantier.
 *
 * Un jeu par défaut est posé à la création — gros œuvre, toiture, plomberie,
 * électricité, main-d'œuvre, matériaux, divers — puis librement enrichi. Un
 * poste portant une imputation peut être désactivé, jamais supprimé.
 */
export type ListCostCategories = (tenantId: string) => Promise<CostCategoryRecord[]>;

export interface CashVoucherRecord {
  id: string;
  /**
   * Numéro affiché, `AAAA-NNNN`, séquentiel par agence et par année.
   *
   * **Nul tant que la pièce est un brouillon.** Le numéro est attribué à la
   * validation, pas à la saisie : un brouillon abandonné ne doit pas consommer
   * un numéro et laisser un trou dans le carnet. Décision de la cliente du
   * 19 septembre 2026 (rapport du lot 2, §6).
   */
  number: string | null;
  tenantId: string;
  siteId: string;
  costCategoryId: string;
  beneficiary: string;
  amount: number;
  currency: string;
  voucherDate: Date;
  reason: string;
  status: SupplierInvoiceStatus;
  createdByUserId: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
}

/**
 * Émet une pièce de caisse pour un ouvrier, à l'état brouillon.
 *
 * **Une seule caisse par agence**, décision actée le 18 septembre 2026 : la
 * gestionnaire émet, le dirigeant valide. Il n'existe donc pas d'entité Caisse,
 * et le validateur est celui qui porte le droit de validation.
 *
 * Le numéro est attribué à la création, séquentiellement, par un compteur
 * verrouillé : deux émissions simultanées ne doivent jamais produire le même
 * numéro.
 */
export type CreateCashVoucherTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    siteId: string;
    costCategoryId: string;
    beneficiary: string;
    amount: number;
    voucherDate: Date;
    reason: string;
    createdByUserId: string;
  }
) => Promise<CashVoucherRecord>;

export type ValidateCashVoucherTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  voucherId: string,
  validatedByUserId: string
) => Promise<CashVoucherRecord>;

// ---------------------------------------------------------------------------
// File de validation
// ---------------------------------------------------------------------------

export interface PendingDocument {
  documentType: VoidableDocumentType;
  documentId: string;
  /** Libellé lisible, jamais un identifiant. */
  label: string;
  amount: number;
  currency: string;
  createdAt: Date;
  createdByUserId: string;
  createdByLabel: string;
}

/**
 * Les pièces en attente de validation, toutes natures confondues.
 *
 * L'organisation cible est « plusieurs saisisseurs, un validateur ». Cet écran
 * est celui du validateur, et il doit dire qui a saisi quoi.
 */
export type GetValidationQueue = (
  tenantId: string,
  filters?: { createdByUserId?: string }
) => Promise<PendingDocument[]>;

// ---------------------------------------------------------------------------
// Talons
//
// Remplacés un à un par leur implémentation, chacun dans son fichier et par
// son propre agent. Ils existent pour que le code appelant compile et se teste
// avant que l'implémentation n'arrive.
// ---------------------------------------------------------------------------

export const postDocumentEntryTxStub: PostDocumentEntryTx = async () => {
  throw new NotImplementedYetError('postDocumentEntryTx (lib/finance/accounting.ts)');
};

export const voidDocumentTxStub: VoidDocumentTx = async () => {
  throw new NotImplementedYetError('voidDocumentTx (lib/finance/accounting.ts)');
};

export const getTrialBalanceStub: GetTrialBalance = async () => {
  throw new NotImplementedYetError('getTrialBalance (lib/finance/reports.ts)');
};

export const createSupplierTxStub: CreateSupplierTx = async () => {
  throw new NotImplementedYetError('createSupplierTx (lib/finance/suppliers.ts)');
};

export const createSupplierInvoiceTxStub: CreateSupplierInvoiceTx = async () => {
  throw new NotImplementedYetError('createSupplierInvoiceTx (lib/finance/suppliers.ts)');
};

export const validateSupplierInvoiceTxStub: ValidateSupplierInvoiceTx = async () => {
  throw new NotImplementedYetError('validateSupplierInvoiceTx (lib/finance/suppliers.ts)');
};

export const createSupplierPaymentTxStub: CreateSupplierPaymentTx = async () => {
  throw new NotImplementedYetError('createSupplierPaymentTx (lib/finance/suppliers.ts)');
};

export const validateSupplierPaymentTxStub: ValidateSupplierPaymentTx = async () => {
  throw new NotImplementedYetError('validateSupplierPaymentTx');
};

export const getSuppliersBalanceStub: GetSuppliersBalance = async () => {
  throw new NotImplementedYetError('getSuppliersBalance (lib/finance/reports.ts)');
};

export const createConstructionSiteStub: CreateConstructionSite = async () => {
  throw new NotImplementedYetError('createConstructionSite (lib/finance/sites.ts)');
};

export const listConstructionSitesStub: ListConstructionSites = async () => {
  throw new NotImplementedYetError('listConstructionSites (lib/finance/sites.ts)');
};

export const getSiteDetailStub: GetSiteDetail = async () => {
  throw new NotImplementedYetError('getSiteDetail (lib/finance/sites.ts)');
};

export const listCostCategoriesStub: ListCostCategories = async () => {
  throw new NotImplementedYetError('listCostCategories (lib/finance/sites.ts)');
};

export const createCashVoucherTxStub: CreateCashVoucherTx = async () => {
  throw new NotImplementedYetError('createCashVoucherTx (lib/finance/cash.ts)');
};

export const validateCashVoucherTxStub: ValidateCashVoucherTx = async () => {
  throw new NotImplementedYetError('validateCashVoucherTx (lib/finance/cash.ts)');
};

export const getValidationQueueStub: GetValidationQueue = async () => {
  throw new NotImplementedYetError('getValidationQueue (lib/finance/validation-queue.ts)');
};
