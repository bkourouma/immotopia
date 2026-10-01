export type ValuationMethod = 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
export type LoanStatus = 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
export type WorkProgramStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type StatementStatus = 'DRAFT' | 'SENT' | 'PAID';

/**
 * Moyen de paiement d'une dépense (lot 10, conformité SYSCOHADA —
 * `LOT10-CONTRAT.md`). Mêmes valeurs que `RentalPaymentMethod` côté
 * encaissement locataire.
 */
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'CARD' | 'OTHER';

/** Périodicité d'une dépense : ponctuelle (passée) ou récurrente, qui alimente le plan de trésorerie. */
export type ExpenseRecurrence = 'ONE_OFF' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export type ExpenseCategory =
  | 'PROPERTY_TAX'
  | 'CONDO_FEES'
  | 'INSURANCE'
  | 'ROUTINE_MAINTENANCE'
  | 'RENOVATION'
  | 'MANAGEMENT_FEES'
  | 'UTILITIES'
  | 'OTHER';

/**
 * Types d'un document patrimonial. Les documents du patrimoine SONT les
 * documents du bien (`PropertyDocument`, routes `.../properties/:id/documents`) :
 * mêmes codes que `documentType` côté API, y compris ceux ajoutés pour le
 * patrimoine (acte notarié, assurance, diagnostic, permis, ACD).
 */
export const PATRIMONY_DOC_TYPES = [
  'TITLE_DEED',
  'LAND_CONCESSION',
  'NOTARIAL_DEED',
  'BUILDING_PERMIT',
  'PLAN',
  'TECHNICAL_DIAGNOSIS',
  'INSURANCE',
  'TAX_DOCUMENT',
  'MANDATE',
  'SYNDICATE_PV',
  'SYNDICATE_BUDGET',
  'SYNDICATE_CONTRAT',
  'SYNDICATE_REGL_COPRO',
  'OTHER'
] as const;

export type PatrimonyDocType = (typeof PATRIMONY_DOC_TYPES)[number];

export interface PatrimoineOverviewData {
  totalProperties: number;
  occupiedProperties: number;
  occupancyRate: number;
  totalEstimatedValue: number;
  totalLoanBalance: number;
  totalExpensesThisYear: number;
  totalAnnualRent: number;
}

export interface YieldProjectionPoint {
  year: number;
  estimatedValue: number;
  cumulativeRent: number;
  cumulativeExpenses: number;
  netResult: number;
}

/**
 * `netNetYield` et `latentCapitalGain` valent `null` quand le prix
 * d'acquisition du bien est inconnu : ils se calculent sur lui, et un zéro
 * aurait affiché un rendement ou une plus-value inventés.
 */
export interface PropertyYieldData {
  grossYield: number;
  netYield: number;
  netNetYield: number | null;
  latentCapitalGain: number | null;
  projectedAtHorizon?: {
    year: number;
    grossYield: number;
    netYield: number;
    netNetYield: number | null;
    latentCapitalGain: number | null;
  };
  projection: YieldProjectionPoint[];
}

export interface AssetValuation {
  id: string;
  propertyId: string;
  tenantId: string;
  valuatedAt: string;
  estimatedValue: number;
  currency: string;
  acquisitionCost?: number | null;
  acquisitionDate?: string | null;
  method: ValuationMethod;
  notes?: string | null;
}

export interface PropertyExpense {
  id: string;
  propertyId: string;
  tenantId: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  currency: string;
  paidAt: string;
  isCapitalized: boolean;
  receiptUrl?: string | null;
  notes?: string | null;
  /** Moyen de paiement de la dépense (lot 10, SYSCOHADA). */
  paymentMethod?: PaymentMethod | null;
  /** Compte de trésorerie débité. */
  treasuryAccountId?: string | null;
  /** L'agence a commandé et doit la facture (dépense refacturée au propriétaire). */
  agencyIsBuyer?: boolean;
  /** Fournisseur, requis dès que `agencyIsBuyer` est coché. */
  supplierName?: string | null;
  /** Périodicité ; absente = ponctuelle. `paidAt` est la date d'ancrage de la récurrence. */
  recurrence?: ExpenseRecurrence;
  /** Dernière occurrence d'une dépense périodique (ISO), sinon sans fin. */
  recurrenceEndDate?: string | null;
}

export interface PropertyLoan {
  id: string;
  propertyId: string;
  tenantId: string;
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency: string;
  startDate: string;
  endDate: string;
  status: LoanStatus;
}

export interface WorkProgram {
  id: string;
  propertyId: string;
  tenantId: string;
  title: string;
  description?: string | null;
  estimatedCost: number;
  actualCost?: number | null;
  currency: string;
  plannedDate: string;
  completedDate?: string | null;
  status: WorkProgramStatus;
  isCapitalized: boolean;
  /**
   * Chantier auquel le programme est rattaché. Son coût réel est alors
   * alimenté par le chantier : il ne se saisit pas et ne s'envoie pas.
   */
  constructionSiteId?: string | null;
  constructionSite?: { id: string; name: string } | null;
}

export interface OwnerStatementItem {
  id: string;
  propertyId: string;
  property?: {
    id: string;
    title?: string;
    internalReference?: string;
  };
  label: string;
  type: 'RENT_COLLECTED' | 'EXPENSE_DEDUCTED' | 'MANAGEMENT_FEE' | 'MANAGEMENT_FEE_VAT' | 'ADVANCE' | 'OTHER';
  amount: number;
}

export interface OwnerStatement {
  id: string;
  tenantId: string;
  ownerContactId: string;
  owner?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  period: string;
  /** Loyers réellement encaissés dans le mois. */
  totalRevenue: number;
  /** Dépenses des biens payées dans le mois. */
  totalExpenses: number;
  /** Encaissé − honoraires − TVA − dépenses. */
  netAmount: number;
  /** Montant appelé sur les échéances du mois. */
  totalRentDue: number;
  /** Restant dû par les locataires à la fin du mois. */
  totalArrears: number;
  totalManagementFees: number;
  totalManagementFeesVat: number;
  /** Taux appliqués, figés avec le relevé ; `null` si non appliqués. */
  managementFeeRate: number | null;
  managementFeeBase: 'RENT_ONLY' | 'ALL_COLLECTED' | null;
  vatRate: number | null;
  propertyIds: string[];
  /** 1 : ancien calcul (loyer du contrat pris pour un loyer encaissé). */
  computationVersion: number;
  currency: string;
  status: StatementStatus;
  sentAt?: string | null;
  paidAt?: string | null;
  items: OwnerStatementItem[];
}
