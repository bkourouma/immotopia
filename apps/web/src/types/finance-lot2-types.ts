import { t } from '../i18n/t';
/**
 * Contrat gelé de la frontière réseau — module financier, lot 2.
 *
 * Fournisseurs, factures reçues, règlements, chantiers, imputations et pièces
 * de caisse. Écrit avant les écrans, il ne bouge plus.
 *
 * Fichier séparé de `finance-types.ts`, qui reste le contrat du lot 1,
 * littéralement gelé. On ajoute, on ne réécrit pas.
 *
 * **Aucun « débit » ni « crédit » ici**, pas plus qu'au lot 1. La partie double
 * existe sous le capot et n'en sort jamais : on *facture*, on *règle*, on
 * *impute*. C'est le principe P-1 du PRD, et chaque écran porte un test qui
 * échoue si l'un des deux mots apparaît.
 *
 * Les montants arrivent en `number`, déjà arrondis par le serveur. La devise
 * stockée est `XOF` ; l'affichage dit « FCFA », et c'est `MoneyValue` qui s'en
 * charge — jamais un suffixe écrit en dur.
 *
 * Source : `specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`.
 */

/** Nature d'un fournisseur. Décide si le rattachement à un chantier est exigé. */
export type SupplierKind = 'MATERIALS' | 'SERVICES' | 'MIXED';

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  MATERIALS: t('Matériaux'),
  SERVICES: 'Prestation',
  MIXED: t('Matériaux et prestation')
};

/** Cycle de vie d'une pièce : brouillon, validée, annulée. */
export type DocumentStatus = 'DRAFT' | 'VALIDATED' | 'VOIDED';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: t('Validée'),
  VOIDED: t('Annulée')
};

export type VoidableDocumentType = 'SUPPLIER_INVOICE' | 'SUPPLIER_PAYMENT' | 'CASH_VOUCHER';

export const DOCUMENT_TYPE_LABELS: Record<VoidableDocumentType, string> = {
  SUPPLIER_INVOICE: t('Facture fournisseur'),
  SUPPLIER_PAYMENT: t('Règlement fournisseur'),
  CASH_VOUCHER: t('Pièce de caisse')
};

export type ConstructionSiteStatus = 'PLANNED' | 'IN_PROGRESS' | 'SUSPENDED' | 'CLOSED';

/**
 * Les quatre etats d'un chantier.
 *
 * `PLANNED` se lit **« Planifie »**, et non « Prevu » : c'est le mot que
 * `<StatusTag>` emploie deja pour cet etat, et un meme statut portait donc deux
 * noms selon l'ecran — « Prevu » sur la fiche, « Planifie » sur le tableau de
 * bord. Arbitre par le proprietaire du produit le 20 septembre 2026 en faveur
 * de « Planifie ».
 */
export const SITE_STATUS_LABELS: Record<ConstructionSiteStatus, string> = {
  PLANNED: t('Planifié'),
  IN_PROGRESS: t('En cours'),
  SUSPENDED: t('Suspendu'),
  CLOSED: t('Clôturé')
};

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  kind: SupplierKind;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Prestataire de maintenance déjà connu, s'il y en a un. */
  maintenanceVendorId: string | null;
  /**
   * Compte de tiers du fournisseur, ouvert à sa création.
   *
   * Nommé comme l'API le nomme, et non `accountId` : le serveur émet
   * `thirdPartyAccountId` (contrat OpenAPI, schéma `Supplier`), et un type qui
   * l'appelait autrement promettait un champ qui n'arrive jamais. TypeScript
   * ne pouvait pas le voir, puisque c'est précisément ce type qui mentait.
   *
   * La *ligne de balance* (`SuppliersBalanceLine`), elle, dit bien `accountId`
   * des deux côtés : l'écart ne portait que sur l'objet fournisseur.
   */
  thirdPartyAccountId: string;
  isActive: boolean;
}

/** Une ligne de la balance fournisseurs. Miroir de la balance clients. */
export interface SuppliersBalanceLine {
  accountId: string;
  supplierId: string;
  /** Raison sociale du fournisseur. */
  label: string;
  totalBilled: number;
  totalSettled: number;
  /** Solde courant. Positif : nous lui devons. */
  balance: number;
  currency: string;
}

export interface SuppliersBalance {
  lines: SuppliersBalanceLine[];
  /** Total de contrôle, affiché en pied de liste. */
  totalBalance: number;
  currency: string;
}

export interface SupplierInvoice {
  id: string;
  supplierId: string;
  supplierLabel: string;
  siteId: string | null;
  siteLabel: string | null;
  invoiceDate: string;
  reference: string;
  amount: number;
  currency: string;
  status: DocumentStatus;
  validatedAt: string | null;
}

/**
 * Une ligne de facture fournisseur, telle que le DÉTAIL la rend.
 *
 * La liste des factures d'un fournisseur n'en porte pas : une liste ne
 * transporte pas le détail de chaque pièce. Il faut donc relire le détail
 * (`getSupplierInvoice`) pour savoir ce que contient une facture — ce que la
 * duplication exige, un en-tête recopié seul n'ayant aucun intérêt.
 */
export interface SupplierInvoiceLine {
  id: string;
  label: string;
  amount: number;
  /** Nuls pour une ligne saisie en montant direct — un forfait n'a pas de quantité. */
  quantity: number | null;
  unitPrice: number | null;
}

/** Une imputation de facture, telle que le détail la rend : des identifiants, pas des libellés. */
export interface SupplierInvoiceAllocation {
  id: string;
  siteId: string;
  costCategoryId: string;
  amount: number;
}

/**
 * Le détail d'une facture : son en-tête, ses lignes, ses imputations.
 *
 * Type distinct de `SupplierInvoice` — et non une extension — parce que le
 * détail ne rend ni `supplierLabel` ni `siteLabel` : seule la LISTE résout ces
 * deux libellés. Prétendre le contraire ferait promettre à TypeScript des
 * champs qui n'arrivent jamais, exactement le défaut relevé plus haut sur
 * `thirdPartyAccountId`.
 */
export interface SupplierInvoiceDetail {
  id: string;
  supplierId: string;
  siteId: string | null;
  invoiceDate: string;
  reference: string;
  amount: number;
  currency: string;
  status: DocumentStatus;
  validatedAt: string | null;
  lines: SupplierInvoiceLine[];
  /** Y compris celles d'une facture annulée : on annule justement pour ressaisir. */
  allocations: SupplierInvoiceAllocation[];
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierLabel: string;
  paymentDate: string;
  amount: number;
  currency: string;
  status: DocumentStatus;
  allocations: Array<{ invoiceId: string; invoiceReference: string; amount: number }>;
}

// ---------------------------------------------------------------------------
// Chantiers
// ---------------------------------------------------------------------------

export interface ConstructionSite {
  id: string;
  name: string;
  zone: string | null;
  propertyId: string | null;
  propertyLabel: string | null;
  managerLabel: string | null;
  /**
   * Bail de terrain dont dépend le chantier, s'il y en a un.
   *
   * Ajouté au lot 4 : l'écran d'un bail s'en sert pour prévenir qu'un
   * chantier appartient déjà à un autre bail avant de le rattacher.
   */
  landLeaseId: string | null;
  status: ConstructionSiteStatus;
  startDate: string | null;
  plannedEndDate: string | null;
  progressPercent: number;
  closedAt: string | null;
  finalCost: number | null;
  /**
   * Somme des imputations validées. **Calculé, jamais saisi.**
   *
   * C'est le principe P-4 du PRD, et l'écran ne doit offrir aucun moyen de le
   * modifier : un chiffre qu'on tape à la main est un chiffre qu'on oublie de
   * mettre à jour.
   */
  actualCost: number;
  currency: string;
  /**
   * Date de bascule au stock (lot 5), ou `null` tant que le chantier n'a pas
   * basculé. Ajouté le 20 septembre 2026 : la fiche du chantier n'avait
   * jusque-là aucun moyen de savoir s'il était passé au stock ni depuis
   * quand — seul l'écran Stock du chantier (`stock/reconciliation`) portait
   * cette date.
   */
  stockEnabledAt: string | null;
}

export interface CostCategory {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
}

/** Une imputation au détail d'un chantier. */
export interface SiteAllocationLine {
  id: string;
  allocationDate: string;
  costCategoryId: string;
  costCategoryLabel: string;
  sourceType: 'SUPPLIER_INVOICE' | 'CASH_VOUCHER';
  sourceId: string;
  /** Libellé lisible de la pièce, jamais son identifiant. */
  sourceLabel: string;
  amount: number;
}

export interface SiteDetail {
  site: ConstructionSite;
  allocations: SiteAllocationLine[];
  /** Sous-totaux par poste, dans l'ordre d'affichage. */
  byCostCategory: Array<{ costCategoryId: string; label: string; amount: number }>;
}

export interface CashVoucher {
  id: string;
  /**
   * Numéro affiché, `AAAA-NNNN`, séquentiel par agence et par année.
   *
   * **Nul tant que la pièce est un brouillon.** Le numéro est attribué à la
   * validation, pas à la saisie : un brouillon abandonné ne doit pas consommer
   * un numéro et laisser un trou dans le carnet, ce qu'un contrôle comptable
   * relève. Décision de la cliente du 19 septembre 2026 (rapport du lot 2, §6).
   *
   * L'écran ne doit donc jamais l'afficher sans se demander s'il existe, ni le
   * remplacer par un tiret — qui se lirait comme un numéro.
   */
  number: string | null;
  siteId: string;
  siteLabel: string;
  costCategoryId: string;
  costCategoryLabel: string;
  beneficiary: string;
  amount: number;
  currency: string;
  voucherDate: string;
  reason: string;
  status: DocumentStatus;
  validatedAt: string | null;
}

// ---------------------------------------------------------------------------
// File de validation
// ---------------------------------------------------------------------------

/**
 * Une pièce en attente de validation.
 *
 * L'organisation de la cliente est « plusieurs saisisseurs, un validateur ».
 * Cet écran est celui du validateur : il doit dire qui a saisi quoi, sinon il
 * ne sert qu'à cliquer.
 */
export interface PendingDocument {
  documentType: VoidableDocumentType;
  documentId: string;
  label: string;
  amount: number;
  currency: string;
  createdAt: string;
  /**
   * L'identifiant du saisisseur, et non son seul nom.
   *
   * Oubli de ma transcription : le contrat serveur le porte depuis le debut.
   * Sans lui, le filtre « Saisi par » enverrait un libelle la ou l'API attend
   * un identifiant — exactement le defaut corrige au lot 1 sur le filtre par
   * bien. Deux homonymes suffiraient a le rendre faux.
   */
  createdByUserId: string;
  createdByLabel: string;
}

// ---------------------------------------------------------------------------
// Saisies
// ---------------------------------------------------------------------------

export interface CostAllocationInput {
  siteId: string;
  costCategoryId: string;
  amount: number;
}

export interface CreateSupplierInvoiceInput {
  supplierId: string;
  invoiceDate: string;
  reference: string;
  /**
   * `quantity` et `unitPrice` sont **facultatifs** : beaucoup de dépenses
   * n'ont pas de quantité — une prestation, un forfait. Quand ils sont
   * renseignés, `amount` est leur produit, calculé par l'écran ; le serveur
   * les conserve sans jamais refaire ce calcul. Le montant reste la donnée
   * de référence comptable.
   */
  lines: Array<{ label: string; amount: number; quantity?: number | null; unitPrice?: number | null }>;
  /**
   * Obligatoire pour un fournisseur de matériaux.
   *
   * La somme des imputations doit égaler le montant de la facture. Le serveur
   * le vérifie avant d'écrire quoi que ce soit ; l'écran le vérifie aussi, pour
   * le dire avant l'envoi plutôt qu'après.
   */
  allocations: CostAllocationInput[];
}

/** Les modes de règlement, les mêmes que ceux des encaissements locatifs. */
export const SUPPLIER_PAYMENT_METHODS = [
  { value: 'CASH', label: t('Espèces') },
  { value: 'BANK_TRANSFER', label: t('Virement bancaire') },
  { value: 'CHECK', label: t('Chèque') },
  { value: 'MOBILE_MONEY', label: t('Mobile Money') },
  { value: 'CARD', label: t('Carte bancaire') },
  { value: 'OTHER', label: t('Autre') }
];

export interface CreateSupplierPaymentInput {
  supplierId: string;
  paymentDate: string;
  amount: number;
  /**
   * Comment on a payé. **Obligatoire** : le serveur le refuse sans.
   *
   * Il l'exigeait déjà sans que l'écran le demande — aucun règlement
   * fournisseur n'était donc enregistrable, et l'échec ne disait rien avant
   * que l'intercepteur ne remonte le détail des erreurs.
   */
  method: string;
  /** Vide pour un acompte : le compte du fournisseur devient alors débiteur. */
  allocations: Array<{ invoiceId: string; amount: number }>;
}

export interface CreateCashVoucherInput {
  siteId: string;
  costCategoryId: string;
  beneficiary: string;
  amount: number;
  voucherDate: string;
  reason: string;
}

/** Filtres de la balance fournisseurs, reflétés dans l'URL de l'écran. */
export interface SuppliersBalanceFilters {
  from?: string;
  to?: string;
  siteId?: string;
}
