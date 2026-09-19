/**
 * Contrat gelé du domaine financier — lot 3, budget de chantier, engagements,
 * pilotage (PRD E5).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus. Même discipline
 * qu'aux lots 1 et 2, et pour la même raison : c'est ce qui permet à plusieurs
 * agents de coder en parallèle sans s'attendre. Les talons lèvent une erreur
 * explicite tant que l'implémentation n'est pas là, de sorte qu'un appelant
 * compile et se teste avant elle.
 *
 * Fichier séparé de `types.ts` (lot 1) et `types-lot2.ts` (lot 2), tous deux
 * gelés. On ajoute, on ne réécrit pas.
 *
 * ---------------------------------------------------------------------------
 * Les cinq règles héritées, inchangées
 * ---------------------------------------------------------------------------
 *
 *   1. **Aucun « débit » ni « crédit » ne sort d'ici.** On *budgète*, on
 *      *engage*, on *réalise*, on *amende*.
 *   2. **Les montants circulent en `number`**, arrondis. Les colonnes restent
 *      en `Decimal(14,2)`.
 *   3. **Toute fonction qui écrit prend un client de transaction.**
 *   4. **La pièce précède l'écriture** (P-2). Rien ici ne crée d'écriture
 *      comptable : un budget est une prévision, pas un mouvement.
 *   5. **Ce qui est validé ne bouge plus** (P-6). Un budget validé s'amende,
 *      il ne se corrige pas.
 *
 * ---------------------------------------------------------------------------
 * La règle qui gouverne tout ce lot : ce qui se calcule ne se stocke pas
 * ---------------------------------------------------------------------------
 *
 * C'est le principe P-4 du PRD, et c'est le fil de ce contrat. Trois grandeurs
 * pourraient tenter d'exister en colonne, et aucune n'en a :
 *
 *   - le **total d'un budget** est la somme de ses lignes ;
 *   - le **budget révisé** est l'initial plus la somme des avenants validés ;
 *   - l'**état de facturation d'un bon de commande** est une fonction des
 *     factures qui lui sont rapprochées.
 *
 * Le lot 2 a payé cette leçon deux fois : `WorkProgram.actualCost`, copie
 * stockée qui pouvait dériver, et l'annulation qui inversait l'écriture sans
 * toucher le solde de tiers. Une valeur recalculée à chaque lecture ne se
 * désynchronise de rien.
 *
 * La seule copie stockée de ce lot est `ConstructionSite.progressPercent`,
 * tenue à jour par `recordSiteProgressTx`, parce que les écrans du lot 2 la
 * lisent déjà et que la faire disparaître les casserait. Le contrôleur
 * d'invariants vérifie qu'elle dit bien ce que dit la dernière saisie.
 *
 * Références : `docs/finance/PLAN-mise-en-oeuvre.md` §7 et
 * `specs/018-finance-budget-pilotage/`.
 */

import type { PurchaseOrderStatus, SiteBudgetStatus } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { NotImplementedYetError } from './types';

export type { PurchaseOrderStatus, SiteBudgetStatus };

// ---------------------------------------------------------------------------
// Budget de chantier
// ---------------------------------------------------------------------------

export interface SiteBudgetLineRecord {
  id: string;
  costCategoryId: string;
  /** Nom du poste, résolu. Jamais un identifiant seul à l'écran. */
  costCategoryLabel: string;
  label: string;
  amountForecast: number;
}

export interface SiteBudgetRecord {
  id: string;
  tenantId: string;
  siteId: string;
  label: string;
  status: SiteBudgetStatus;
  validatedAt: Date | null;
  validatedByUserId: string | null;
  currency: string;
  lines: SiteBudgetLineRecord[];
  /** Somme des lignes. **Calculé, jamais stocké.** */
  totalForecast: number;
}

/**
 * Crée un budget de chantier à l'état brouillon, avec ses lignes.
 *
 * Un budget brouillon ne compte pour rien : ni dans l'écart, ni dans l'alerte
 * de dépassement. Plusieurs brouillons peuvent coexister sur un même chantier
 * — on prépare, on compare, on valide.
 *
 * Refuse deux lignes sur le même poste de dépense : une enveloppe par poste,
 * sans quoi l'écart par poste devient ambigu.
 */
export type CreateSiteBudgetTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    siteId: string;
    label: string;
    lines: Array<{ costCategoryId: string; label: string; amountForecast: number }>;
  }
) => Promise<SiteBudgetRecord>;

/**
 * Valide un budget brouillon : il devient le budget initial du chantier.
 *
 * **Un seul budget validé par chantier**, garanti par un index partiel en base
 * (`site_budgets_one_validated_per_site`). Valider un second budget alors qu'un
 * autre l'est déjà est un conflit (409), pas un remplacement : on amende un
 * budget validé, on ne le remplace pas en silence.
 */
export type ValidateSiteBudgetTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  budgetId: string,
  validatedByUserId: string
) => Promise<SiteBudgetRecord>;

/** Le budget validé d'un chantier, ou `null` s'il n'en a pas encore. */
export type GetValidatedSiteBudget = (tenantId: string, siteId: string) => Promise<SiteBudgetRecord | null>;

/** Tous les budgets d'un chantier, brouillons compris, du plus récent au plus ancien. */
export type ListSiteBudgets = (tenantId: string, siteId: string) => Promise<SiteBudgetRecord[]>;

// ---------------------------------------------------------------------------
// Avenants
// ---------------------------------------------------------------------------

export interface BudgetAmendmentLineRecord {
  id: string;
  costCategoryId: string;
  costCategoryLabel: string;
  /** **Signé.** Un avenant réduit parfois une enveloppe. */
  amountDelta: number;
}

export interface BudgetAmendmentRecord {
  id: string;
  budgetId: string;
  amendmentDate: Date;
  reason: string;
  status: SiteBudgetStatus;
  createdByUserId: string;
  createdByLabel: string;
  validatedAt: Date | null;
  lines: BudgetAmendmentLineRecord[];
  /** Somme signée des lignes. Calculé. */
  totalDelta: number;
}

/**
 * Saisit un avenant à un budget validé, à l'état brouillon.
 *
 * Refuse un avenant sur un budget qui n'est pas validé : on n'amende pas un
 * brouillon, on le modifie.
 *
 * Le motif est obligatoire. Un avenant sans motif est un chiffre que personne
 * ne saura expliquer six mois plus tard, et c'est précisément ce que le PRD
 * demande de tracer.
 */
export type CreateBudgetAmendmentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    budgetId: string;
    amendmentDate: Date;
    reason: string;
    lines: Array<{ costCategoryId: string; amountDelta: number }>;
    createdByUserId: string;
  }
) => Promise<BudgetAmendmentRecord>;

/**
 * Valide un avenant : il entre alors dans le budget révisé.
 *
 * Un avenant ne figure pas dans la file de validation partagée du lot 2, qui ne
 * montre que les pièces déplaçant de l'argent. Un avenant déplace une
 * *prévision*. Il se valide depuis l'écran du budget, par le même droit.
 */
export type ValidateBudgetAmendmentTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  amendmentId: string,
  validatedByUserId: string
) => Promise<BudgetAmendmentRecord>;

export type ListBudgetAmendments = (tenantId: string, budgetId: string) => Promise<BudgetAmendmentRecord[]>;

// ---------------------------------------------------------------------------
// Bons de commande
// ---------------------------------------------------------------------------

/**
 * État de facturation d'un bon. **Dérivé, jamais stocké.**
 *
 * Distinct de `PurchaseOrderStatus`, qui porte le cycle qu'on décide
 * (brouillon, émis, annulé). Celui-ci est une fonction des factures
 * rapprochées : mélanger les deux dans une colonne, c'est se donner une valeur
 * qui dérive dès que quelqu'un valide une facture par un autre chemin.
 */
export type PurchaseOrderInvoicingState = 'NOT_INVOICED' | 'PARTIALLY_INVOICED' | 'SETTLED';

export interface PurchaseOrderLineRecord {
  id: string;
  costCategoryId: string;
  costCategoryLabel: string;
  label: string;
  amount: number;
}

export interface PurchaseOrderRecord {
  id: string;
  tenantId: string;
  siteId: string;
  siteLabel: string;
  supplierId: string;
  supplierLabel: string;
  reference: string;
  orderDate: Date;
  status: PurchaseOrderStatus;
  currency: string;
  lines: PurchaseOrderLineRecord[];
  /** Somme des lignes. Calculé. */
  totalAmount: number;
  /** Somme des factures VALIDÉES rapprochées de ce bon. Calculé. */
  invoicedAmount: number;
  /** `totalAmount - invoicedAmount`, borné à zéro. Calculé. */
  remainingAmount: number;
  invoicingState: PurchaseOrderInvoicingState;
}

export type CreatePurchaseOrderTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    siteId: string;
    supplierId: string;
    reference: string;
    orderDate: Date;
    lines: Array<{ costCategoryId: string; label: string; amount: number }>;
    createdByUserId: string;
  }
) => Promise<PurchaseOrderRecord>;

/**
 * Émet un bon de commande brouillon.
 *
 * C'est l'émission qui fait entrer le bon dans l'engagé : un brouillon
 * n'engage personne. C'est aussi à cet instant que l'alerte de dépassement est
 * évaluée (`raiseBudgetAlertIfNeededTx`).
 */
export type IssuePurchaseOrderTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  orderId: string,
  issuedByUserId: string
) => Promise<PurchaseOrderRecord>;

/**
 * Annule un bon de commande.
 *
 * Refusé dès qu'une facture y est rapprochée : on ne fait pas disparaître un
 * engagement qui a déjà produit une dette. Il faut d'abord défaire le
 * rapprochement, ou annuler la facture.
 */
export type CancelPurchaseOrderTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  orderId: string,
  reason: string
) => Promise<PurchaseOrderRecord>;

/**
 * Rapproche une facture reçue d'un bon de commande, ou défait le rapprochement
 * quand `orderId` vaut `null`.
 *
 * Contrôles, tous avant écriture : même agence, même fournisseur, même
 * chantier, bon émis et non annulé. Une facture validée ne se rapproche plus :
 * ce qui est validé ne bouge plus (P-6).
 */
export type LinkInvoiceToPurchaseOrderTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  invoiceId: string,
  orderId: string | null
) => Promise<PurchaseOrderRecord | null>;

export type ListPurchaseOrders = (
  tenantId: string,
  filters: { siteId?: string; supplierId?: string; status?: PurchaseOrderStatus }
) => Promise<PurchaseOrderRecord[]>;

export type GetPurchaseOrder = (tenantId: string, orderId: string) => Promise<PurchaseOrderRecord>;

// ---------------------------------------------------------------------------
// Engagé — la grandeur centrale du lot
// ---------------------------------------------------------------------------

/**
 * Ce qu'un chantier a engagé, et ce qu'il a réellement dépensé.
 *
 * **La formule, écrite ici une fois pour toutes**, parce qu'une formule
 * comprise de travers produit un chiffre juste en apparence :
 *
 *   réalisé = somme des imputations validées et non annulées du chantier
 *             (c'est exactement `getSiteActualCost` du lot 2, inchangé)
 *
 *   engagé  = réalisé
 *           + somme, sur les bons ÉMIS et non annulés du chantier,
 *             de leur reste à facturer
 *
 * Le reste à facturer, et non le montant du bon : sans cela, une facture
 * rapprochée d'un bon serait comptée deux fois, une fois dans le réalisé et
 * une fois dans le bon. C'est le piège de cette formule, et la raison pour
 * laquelle `remainingAmount` existe sur `PurchaseOrderRecord`.
 *
 * Un bon en brouillon n'engage rien. Un bon annulé non plus.
 */
export interface SiteEngagementRecord {
  siteId: string;
  /** Somme des imputations validées et non annulées. */
  actualCost: number;
  /** Reste à facturer des bons émis. */
  openCommitments: number;
  /** `actualCost + openCommitments`. */
  engagedAmount: number;
  currency: string;
}

export type GetSiteEngagement = (tenantId: string, siteId: string) => Promise<SiteEngagementRecord>;

// ---------------------------------------------------------------------------
// Avancement physique
// ---------------------------------------------------------------------------

export interface SiteProgressEntryRecord {
  id: string;
  siteId: string;
  entryDate: Date;
  percent: number;
  note: string | null;
  createdByUserId: string;
  createdByLabel: string;
  createdAt: Date;
}

/**
 * Enregistre un point d'avancement, et recopie le pourcentage sur le chantier.
 *
 * L'historique est conservé : on ajoute une ligne, on ne modifie jamais la
 * précédente. C'est ce que le PRD demande, et c'est ce qui permet de lire une
 * progression plutôt qu'un état.
 *
 * `percent` est borné à `[0, 100]`. Un avancement qui recule est permis — un
 * chantier se découvre parfois moins avancé qu'on ne le croyait, et le nier
 * obligerait à mentir.
 *
 * La copie sur `ConstructionSite.progressPercent` suit la dernière saisie **au
 * sens de la date de saisie**, pas de la date d'enregistrement : une saisie
 * antérieure ajoutée après coup ne doit pas écraser un point plus récent.
 */
export type RecordSiteProgressTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    siteId: string;
    entryDate: Date;
    percent: number;
    note?: string | null;
    createdByUserId: string;
  }
) => Promise<SiteProgressEntryRecord>;

/** L'historique d'un chantier, du plus récent au plus ancien. */
export type ListSiteProgress = (tenantId: string, siteId: string) => Promise<SiteProgressEntryRecord[]>;

// ---------------------------------------------------------------------------
// Alerte de dépassement
// ---------------------------------------------------------------------------

export interface SiteBudgetAlertRecord {
  id: string;
  siteId: string;
  siteLabel: string;
  budgetId: string;
  thresholdPercent: number;
  engagedAmount: number;
  budgetAmount: number;
  /** Part de l'engagé dans le budget, en pourcentage. Calculé. */
  consumedPercent: number;
  raisedAt: Date;
  acknowledgedAt: Date | null;
  currency: string;
}

/**
 * Lève une alerte si l'engagé franchit le seuil du chantier, et sinon ne fait
 * rien.
 *
 * Appelée à chaque validation de facture, de pièce de caisse, et à chaque
 * émission de bon de commande — c'est-à-dire aux trois seuls moments où
 * l'engagé peut monter.
 *
 * Ne fait rien quand : le chantier n'a pas de seuil configuré
 * (`budgetThresholdPercent` nul), le chantier n'a pas de budget validé, ou une
 * alerte non acquittée existe déjà sur ce budget. Ce dernier cas est aussi
 * garanti en base par un index partiel
 * (`site_budget_alerts_one_open_per_budget`) : sans lui, chaque pièce validée
 * au-delà du seuil produirait une alerte de plus.
 *
 * **Ne lève jamais d'exception pour cause de dépassement.** Une alerte informe,
 * elle n'interdit pas : refuser la validation d'une facture parce qu'un budget
 * est dépassé bloquerait l'enregistrement d'une dépense qui, elle, a bien eu
 * lieu.
 */
export type RaiseBudgetAlertIfNeededTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string
) => Promise<SiteBudgetAlertRecord | null>;

export type AcknowledgeBudgetAlertTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  alertId: string,
  acknowledgedByUserId: string
) => Promise<SiteBudgetAlertRecord>;

export type ListOpenBudgetAlerts = (tenantId: string) => Promise<SiteBudgetAlertRecord[]>;

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

/**
 * Une ligne du tableau de bord des chantiers.
 *
 * Tout y est calculé à la lecture. L'écart est donné en valeur **et** en
 * pourcentage, parce que 2 000 000 de dépassement ne se lisent pas de la même
 * façon sur un budget de 5 000 000 et sur un budget de 500 000 000.
 */
export interface SiteDashboardRow {
  siteId: string;
  siteLabel: string;
  zone: string | null;
  status: string;
  /** Budget initial : le budget validé. Nul si le chantier n'en a pas. */
  initialBudget: number | null;
  /** Initial plus la somme des avenants validés. Nul s'il n'y a pas de budget. */
  revisedBudget: number | null;
  engagedAmount: number;
  actualCost: number;
  progressPercent: number;
  /**
   * `revisedBudget - engagedAmount`. Négatif quand on dépasse.
   *
   * Contre le budget **révisé**, parce que c'est l'enveloppe réellement
   * accordée. L'écart contre l'initial se lit en comparant les deux colonnes,
   * que la ligne porte toutes les deux.
   */
  variance: number | null;
  /** L'écart en part du budget révisé. Nul quand il n'y a pas de budget. */
  variancePercent: number | null;
  /** L'alerte ouverte de ce chantier, s'il y en a une. */
  openAlert: SiteBudgetAlertRecord | null;
  currency: string;
}

/**
 * Le tableau de bord, en **un seul appel**.
 *
 * Même parti pris que l'endpoint agrégé des programmes de travaux : un écran
 * qui appelle une route par chantier devient inutilisable dès la trentième
 * ligne. L'agrégation se fait en SQL, jamais en mémoire — le banc de charge du
 * lot 0 a mesuré un facteur trente entre les deux approches.
 */
export type GetSitesDashboard = (
  tenantId: string,
  filters: { status?: string; onlyOverBudget?: boolean }
) => Promise<{ rows: SiteDashboardRow[]; currency: string }>;

// ---------------------------------------------------------------------------
// Talons — remplacés par les implémentations, jamais appelés en production
// ---------------------------------------------------------------------------

export const createSiteBudgetTxStub: CreateSiteBudgetTx = async () => {
  throw new NotImplementedYetError('createSiteBudgetTx');
};

export const validateSiteBudgetTxStub: ValidateSiteBudgetTx = async () => {
  throw new NotImplementedYetError('validateSiteBudgetTx');
};

export const getValidatedSiteBudgetStub: GetValidatedSiteBudget = async () => {
  throw new NotImplementedYetError('getValidatedSiteBudget');
};

export const listSiteBudgetsStub: ListSiteBudgets = async () => {
  throw new NotImplementedYetError('listSiteBudgets');
};

export const createBudgetAmendmentTxStub: CreateBudgetAmendmentTx = async () => {
  throw new NotImplementedYetError('createBudgetAmendmentTx');
};

export const validateBudgetAmendmentTxStub: ValidateBudgetAmendmentTx = async () => {
  throw new NotImplementedYetError('validateBudgetAmendmentTx');
};

export const listBudgetAmendmentsStub: ListBudgetAmendments = async () => {
  throw new NotImplementedYetError('listBudgetAmendments');
};

export const createPurchaseOrderTxStub: CreatePurchaseOrderTx = async () => {
  throw new NotImplementedYetError('createPurchaseOrderTx');
};

export const issuePurchaseOrderTxStub: IssuePurchaseOrderTx = async () => {
  throw new NotImplementedYetError('issuePurchaseOrderTx');
};

export const cancelPurchaseOrderTxStub: CancelPurchaseOrderTx = async () => {
  throw new NotImplementedYetError('cancelPurchaseOrderTx');
};

export const linkInvoiceToPurchaseOrderTxStub: LinkInvoiceToPurchaseOrderTx = async () => {
  throw new NotImplementedYetError('linkInvoiceToPurchaseOrderTx');
};

export const listPurchaseOrdersStub: ListPurchaseOrders = async () => {
  throw new NotImplementedYetError('listPurchaseOrders');
};

export const getPurchaseOrderStub: GetPurchaseOrder = async () => {
  throw new NotImplementedYetError('getPurchaseOrder');
};

export const getSiteEngagementStub: GetSiteEngagement = async () => {
  throw new NotImplementedYetError('getSiteEngagement');
};

export const recordSiteProgressTxStub: RecordSiteProgressTx = async () => {
  throw new NotImplementedYetError('recordSiteProgressTx');
};

export const listSiteProgressStub: ListSiteProgress = async () => {
  throw new NotImplementedYetError('listSiteProgress');
};

export const raiseBudgetAlertIfNeededTxStub: RaiseBudgetAlertIfNeededTx = async () => {
  throw new NotImplementedYetError('raiseBudgetAlertIfNeededTx');
};

export const acknowledgeBudgetAlertTxStub: AcknowledgeBudgetAlertTx = async () => {
  throw new NotImplementedYetError('acknowledgeBudgetAlertTx');
};

export const listOpenBudgetAlertsStub: ListOpenBudgetAlerts = async () => {
  throw new NotImplementedYetError('listOpenBudgetAlerts');
};

export const getSitesDashboardStub: GetSitesDashboard = async () => {
  throw new NotImplementedYetError('getSitesDashboard');
};
