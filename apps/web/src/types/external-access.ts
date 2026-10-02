/**
 * Types du lot B3 — accès en lecture seule des tiers de confiance (spec 034).
 *
 * Fidèles aux JSON du contrat commun (sections 3 et 4). Aucun jeton ni hash
 * n'apparaît dans les réponses de liste ou de détail : l'URL d'un lien n'existe
 * qu'à la création et au renvoi.
 */

export type ExternalAccessType = 'NOTARY' | 'ACCOUNTANT' | 'BANKER';

export type ExternalAccessSection =
  'VALUATIONS' | 'YIELD_RATIOS' | 'LOANS' | 'EXPENSES' | 'RENTS' | 'DOCUMENTS' | 'TITLES_OWNERSHIP';

export type ExternalAccessStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';

export interface ExternalAccessGrantSummary {
  id: string;
  type: ExternalAccessType;
  recipientName: string;
  recipientEmail: string;
  ownerClientId: string | null;
  ownerName: string | null;
  sections: ExternalAccessSection[];
  expiresAt: string | null;
  permanent: boolean;
  revokedAt: string | null;
  status: ExternalAccessStatus;
  propertyCount: number;
  entityCount: number;
  documentCount: number;
  viewCount: number;
  lastViewedAt: string | null;
  lastLinkSentAt: string | null;
  activeLinkCount: number;
  createdAt: string;
}

export interface ExternalAccessGrantDetail extends ExternalAccessGrantSummary {
  properties: Array<{ id: string; title: string; reference: string }>;
  entities: Array<{ id: string; name: string }>;
  /** `id` = identifiant du document du bien. */
  documents: Array<{ id: string; propertyId: string; fileName: string }>;
}

export interface ExternalAccessScopeOptions {
  sections: ExternalAccessSection[];
  defaultsByType: Record<ExternalAccessType, ExternalAccessSection[]>;
  maxLinkTtlDays: number;
  owners: Array<{ id: string; name: string }>;
  properties: Array<{ id: string; title: string; reference: string; ownerClientId: string | null }>;
  entities: Array<{ id: string; name: string }>;
}

export interface ExternalAccessPropertyDocument {
  id: string;
  fileName: string;
  documentType: string;
  fileSize: number;
  createdAt: string;
}

export interface ExternalAccessLink {
  id: string;
  /** Affichée UNE seule fois. */
  url: string;
  expiresAt: string;
}

/** Pourquoi aucun e-mail n'est parti. */
export type ExternalAccessEmailReason = 'NOT_REQUESTED' | 'EVENT_DISABLED' | 'SEND_FAILED';

export interface ExternalAccessEmailResult {
  sent: boolean;
  reason?: ExternalAccessEmailReason;
}

export interface CreateExternalAccessInput {
  type: ExternalAccessType;
  recipientName: string;
  recipientEmail: string;
  ownerClientId?: string | null;
  propertyIds: string[];
  entityIds: string[];
  sections?: ExternalAccessSection[];
  documentIds: string[];
  /** ISO ; `null` ou absent = permanent. */
  expiresAt?: string | null;
  linkTtlDays?: number;
  sendEmail?: boolean;
}

export interface CreateExternalAccessResult {
  grant: ExternalAccessGrantDetail;
  link: ExternalAccessLink;
  email: ExternalAccessEmailResult;
}

export interface UpdateExternalAccessInput {
  sections?: ExternalAccessSection[];
  expiresAt?: string | null;
  recipientName?: string;
  recipientEmail?: string;
  propertyIds?: string[];
  entityIds?: string[];
  documentIds?: string[];
}

export interface SendExternalAccessLinkInput {
  linkTtlDays?: number;
  revokePreviousLinks?: boolean;
  sendEmail?: boolean;
}

export interface SendExternalAccessLinkResult {
  link: ExternalAccessLink;
  email: ExternalAccessEmailResult;
}

export interface ExternalAccessLogEntry {
  id: string;
  at: string;
  /** `VIEWED`, `DOCUMENT_DOWNLOADED`, `LINK_SENT`… : une valeur inconnue s'affiche telle quelle. */
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  sections?: ExternalAccessSection[];
  documentName?: string;
}

// --- Vue publique (contrat §4) ----------------------------------------------

export interface ExternalAccessValuationHistoryPoint {
  valuatedAt: string;
  estimatedValue: number;
  method: string;
}

export interface ExternalAccessViewProperty {
  reference: string;
  title: string;
  address: string | null;
  city: string | null;
  sharePercent: number | null;
  valuation?: {
    estimatedValue: number;
    valuatedAt: string;
    acquisitionCost: number | null;
    currency: string;
    latentCapitalGain: number | null;
    history: ExternalAccessValuationHistoryPoint[];
  } | null;
  yield?: {
    grossYield: number | null;
    netYield: number | null;
    netNetYield: number | null;
    annualRent: number;
    annualExpenses: number;
  };
  loans?: Array<{
    lender: string;
    capitalAmount: number;
    remainingCapital: number;
    interestRate: number;
    monthlyPayment: number;
    currency: string;
    startDate: string;
    endDate: string | null;
    status: string;
  }>;
  expenses?: {
    totalLast12Months: number;
    items: Array<{ date: string; category: string; amount: number }>;
  };
  rents?: Array<{
    status: string;
    startDate: string;
    endDate: string | null;
    rentAmount: number;
    chargesAmount: number | null;
    billingFrequency: string;
  }>;
  titles?: {
    propertyType: string;
    surface: number | null;
    holdings: Array<{
      entityName: string;
      legalForm: string;
      country: string;
      rccm: string | null;
      taxId: string | null;
      sharePercent: number;
    }>;
    ownerSharePercent: number | null;
    /** Part agrégée des autres détenteurs, sans nom. */
    otherHoldersSharePercent?: number | null;
  };
  documents?: Array<{
    ref: string;
    fileName: string;
    documentType: string;
    fileSize: number | null;
    mimeType: string | null;
    createdAt: string;
  }>;
}

export interface ExternalAccessViewDto {
  agencyName: string;
  grantType: ExternalAccessType;
  recipientName: string;
  ownerName: string | null;
  linkExpiresAt: string;
  /** `null` = accès permanent. */
  accessExpiresAt: string | null;
  currency: string;
  sections: ExternalAccessSection[];
  summary: {
    propertyCount: number;
    totalEstimatedValue?: number;
    totalLatentCapitalGain?: number | null;
    totalRemainingLoanCapital?: number;
    /** Totaux calculés selon la quote-part du propriétaire désigné. */
    ownerShareApplied?: boolean;
    /** Périmètre tronqué (100 premiers biens affichés). */
    truncated?: boolean;
  };
  properties: ExternalAccessViewProperty[];
}

export type PublicExternalAccessResult =
  | { status: 'ok'; view: ExternalAccessViewDto }
  | { status: 'invalid' }
  | { status: 'rate_limited' }
  | { status: 'unavailable' };

export type PublicExternalAccessDownloadResult =
  | { status: 'ok'; blob: Blob; fileName: string | null }
  | { status: 'invalid' }
  | { status: 'rate_limited' }
  | { status: 'unavailable' };
