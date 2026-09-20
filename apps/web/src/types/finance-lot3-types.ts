import { t } from '../i18n/t';
/**
 * Contrat gelé de la frontière réseau — module financier, lot 3.
 *
 * Budget de chantier, avenants, bons de commande, engagé, avancement physique,
 * alerte de dépassement et tableau de bord.
 *
 * Fichier séparé de `finance-types.ts` (lot 1) et `finance-lot2-types.ts`
 * (lot 2), tous deux gelés. On ajoute, on ne réécrit pas.
 *
 * **Chaque champ ici doit porter le nom que le serveur émet.** Le lot 2 a payé
 * cette règle : le type web annonçait `accountId` là où l'API émettait
 * `thirdPartyAccountId`, et TypeScript ne pouvait rien y voir puisque c'était
 * le type lui-même qui mentait. La source de vérité est
 * `specs/018-finance-budget-pilotage/contracts/openapi.yaml`, et le contrat
 * serveur `packages/api/src/lib/finance/types-lot3.ts`.
 *
 * **Aucun « débit » ni « crédit » ici.** On *budgète*, on *engage*, on
 * *réalise*, on *amende*. C'est le principe P-1 du PRD, et chaque écran porte
 * un test qui échoue si l'un des deux mots apparaît.
 *
 * Les montants arrivent en `number`, déjà arrondis par le serveur. La devise
 * stockée est `XOF` ; l'affichage dit « FCFA », et c'est `MoneyValue` qui s'en
 * charge — jamais un suffixe écrit en dur.
 */

/** Cycle d'un budget de chantier et de ses avenants. */
export type SiteBudgetStatus = 'DRAFT' | 'VALIDATED';

export const SITE_BUDGET_STATUS_LABELS: Record<SiteBudgetStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: t('Validé')
};

/** Cycle **décidé** d'un bon de commande. Voir `PurchaseOrderInvoicingState`. */
export type PurchaseOrderStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Brouillon',
  ISSUED: t('Émis'),
  CANCELLED: t('Annulé')
};

/**
 * État de facturation d'un bon. **Calculé par le serveur, jamais stocké.**
 *
 * Distinct du statut : un bon émis peut être non facturé, partiellement
 * facturé ou soldé, et ces trois états ne sont qu'une lecture des factures qui
 * lui sont rapprochées.
 */
export type PurchaseOrderInvoicingState = 'NOT_INVOICED' | 'PARTIALLY_INVOICED' | 'SETTLED';

export const INVOICING_STATE_LABELS: Record<PurchaseOrderInvoicingState, string> = {
  NOT_INVOICED: t('Non facturé'),
  PARTIALLY_INVOICED: t('Partiellement facturé'),
  SETTLED: t('Soldé')
};

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export interface SiteBudgetLine {
  id: string;
  costCategoryId: string;
  /** Nom du poste. L'écran ne montre jamais l'identifiant. */
  costCategoryLabel: string;
  label: string;
  amountForecast: number;
  /**
   * Quantité et prix unitaire, **facultatifs**. Nuls — ou absents, le
   * contrat ne les met pas dans `required` — pour une ligne saisie en
   * montant direct. Affichés par l'écran quand ils existent, jamais
   * remultipliés : le montant est la donnée de référence.
   */
  quantity?: number | null;
  unitPrice?: number | null;
}

export interface SiteBudget {
  id: string;
  siteId: string;
  label: string;
  status: SiteBudgetStatus;
  validatedAt: string | null;
  /**
   * Nom de qui a validé. Nul tant que le budget est un brouillon.
   *
   * L'écran affiche ce nom, jamais un identifiant. L'avenant en fait autant
   * avec `createdByLabel` : les deux se lisent côte à côte, ils doivent se
   * lire de la même façon.
   */
  validatedByLabel: string | null;
  currency: string;
  lines: SiteBudgetLine[];
  /**
   * Somme des lignes, calculée par le serveur.
   *
   * L'écran l'affiche, il ne le recalcule pas : deux additions donnent deux
   * résultats le jour où l'une des deux oublie un cas.
   */
  totalForecast: number;
  /**
   * Initial plus la somme des avenants **validés**, calculé par le serveur.
   *
   * L'écran l'affiche à côté de l'initial : c'est l'enveloppe réellement
   * accordée, celle contre laquelle se lit l'écart. Il ne le recompose jamais
   * à partir de la liste des avenants — ce serait refaire un calcul que le
   * serveur fait déjà, et les deux finiraient par différer.
   */
  revisedTotal: number;
}

export interface CreateSiteBudgetInput {
  siteId: string;
  label: string;
  lines: Array<{
    costCategoryId: string;
    label: string;
    amountForecast: number;
    quantity?: number | null;
    unitPrice?: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Avenants
// ---------------------------------------------------------------------------

export interface BudgetAmendmentLine {
  id: string;
  costCategoryId: string;
  costCategoryLabel: string;
  /** **Signé** : un avenant réduit parfois une enveloppe. */
  amountDelta: number;
  /**
   * Quantité et prix unitaire, **facultatifs**. La quantité reste positive ;
   * c'est le prix unitaire qui porte le signe d'une réduction d'enveloppe,
   * une quantité négative n'ayant aucun sens.
   */
  quantity?: number | null;
  unitPrice?: number | null;
}

export interface BudgetAmendment {
  id: string;
  budgetId: string;
  amendmentDate: string;
  reason: string;
  status: SiteBudgetStatus;
  /** Nom de qui l'a saisi. L'écran du validateur en a besoin. */
  createdByLabel: string;
  validatedAt: string | null;
  lines: BudgetAmendmentLine[];
  totalDelta: number;
}

export interface CreateBudgetAmendmentInput {
  budgetId: string;
  amendmentDate: string;
  /** Obligatoire. L'écran le vérifie avant l'envoi, le serveur aussi. */
  reason: string;
  lines: Array<{
    costCategoryId: string;
    amountDelta: number;
    quantity?: number | null;
    unitPrice?: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Bons de commande
// ---------------------------------------------------------------------------

export interface PurchaseOrderLine {
  id: string;
  costCategoryId: string;
  costCategoryLabel: string;
  label: string;
  amount: number;
  /**
   * Quantité et prix unitaire, **facultatifs**. Nuls — ou absents, le
   * contrat ne les met pas dans `required` — pour une ligne saisie en
   * montant direct. Affichés par l'écran quand ils existent, jamais
   * remultipliés : le montant est la donnée de référence.
   */
  quantity?: number | null;
  unitPrice?: number | null;
}

export interface PurchaseOrder {
  id: string;
  siteId: string;
  siteLabel: string;
  supplierId: string;
  supplierLabel: string;
  reference: string;
  orderDate: string;
  status: PurchaseOrderStatus;
  currency: string;
  lines: PurchaseOrderLine[];
  totalAmount: number;
  /** Somme des factures validées rapprochées. Calculé. */
  invoicedAmount: number;
  /** Reste à facturer. C'est cette part qui compte dans l'engagé. */
  remainingAmount: number;
  invoicingState: PurchaseOrderInvoicingState;
}

export interface CreatePurchaseOrderInput {
  siteId: string;
  supplierId: string;
  reference: string;
  orderDate: string;
  lines: Array<{
    costCategoryId: string;
    label: string;
    amount: number;
    quantity?: number | null;
    unitPrice?: number | null;
  }>;
}

/** Filtres de la liste des bons, reflétés dans l'URL de l'écran. */
export interface PurchaseOrderFilters {
  siteId?: string;
  supplierId?: string;
  status?: PurchaseOrderStatus;
}

// ---------------------------------------------------------------------------
// Engagé
// ---------------------------------------------------------------------------

/**
 * Ce qu'un chantier a engagé, et ce qu'il a réellement dépensé.
 *
 * `engagedAmount` vaut `actualCost + openCommitments`, où `openCommitments`
 * est le **reste à facturer** des bons émis — jamais leur montant entier, sans
 * quoi une facture rapprochée compterait deux fois.
 */
export interface SiteEngagement {
  siteId: string;
  actualCost: number;
  openCommitments: number;
  engagedAmount: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Avancement physique
// ---------------------------------------------------------------------------

export interface SiteProgressEntry {
  id: string;
  siteId: string;
  entryDate: string;
  percent: number;
  note: string | null;
  createdByLabel: string;
  createdAt: string;
}

export interface RecordSiteProgressInput {
  siteId: string;
  entryDate: string;
  percent: number;
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Alerte de dépassement
// ---------------------------------------------------------------------------

export interface SiteBudgetAlert {
  id: string;
  siteId: string;
  siteLabel: string;
  budgetId: string;
  thresholdPercent: number;
  engagedAmount: number;
  budgetAmount: number;
  /** Part de l'engagé dans le budget, en pourcentage. Calculé. */
  consumedPercent: number;
  raisedAt: string;
  acknowledgedAt: string | null;
  currency: string;
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export interface SiteDashboardRow {
  siteId: string;
  siteLabel: string;
  zone: string | null;
  status: string;
  /** Nul quand le chantier n'a pas encore de budget validé. */
  initialBudget: number | null;
  revisedBudget: number | null;
  engagedAmount: number;
  actualCost: number;
  progressPercent: number;
  /** Négatif quand on dépasse. Calculé contre le budget **révisé**. */
  variance: number | null;
  variancePercent: number | null;
  openAlert: SiteBudgetAlert | null;
  currency: string;
}

export interface SitesDashboard {
  rows: SiteDashboardRow[];
  currency: string;
}

export interface SitesDashboardFilters {
  status?: string;
  onlyOverBudget?: boolean;
}
