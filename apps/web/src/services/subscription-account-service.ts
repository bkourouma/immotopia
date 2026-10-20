import apiClient from '../utils/api-client';
import type { CapacityKeyCode, InvoicePreview } from './subscription-v2-service';

/**
 * Abonnement en libre-service de l'agence (spec 045, section 3).
 *
 * Fichier SÉPARÉ de `subscription-v2-service.ts`, que le menu charge dans le
 * chunk d'entrée : ces appels ne servent qu'à la page « Abonnement et
 * factures », chargée en `React.lazy`. Les imports ci-dessus sont des types
 * seulement (effacés à la compilation).
 *
 * Toutes les routes sont sous `/api/tenants/:tenantId/subscription`, enveloppe
 * `{ success, data }`, montants en FCFA HT sauf mention.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type AccountPhase = 'NONE' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY';

export interface AccountItem {
  id: string;
  code: string;
  name: string;
  kind: 'PACK' | 'EXTENSION' | 'SETUP';
  quantity: number;
  /** Prix figé HT. */
  unitMonthlyPrice: number;
  /** quantité × prix × (1 − remise), HT. */
  monthlyAmount: number;
  startsAt: string;
  /** Non nul et futur = retrait programmé. */
  endsAt: string | null;
  removalScheduled: boolean;
  parentItemId: string | null;
  /** Capacité apportée (unités × capacité unitaire). */
  capacities: Partial<Record<CapacityKeyCode, number>>;
  canScheduleRemoval: boolean;
  canCancelRemoval: boolean;
}

export interface CapacityBreakdown {
  key: CapacityKeyCode;
  included: number;
  extensions: number;
  overrides: number;
  limit: number;
  used: number;
  overage: number;
  /** HT, à ce jour, si quotaPolicy = BILL_OVERAGE. */
  estimatedOverageAmount: number | null;
}

export interface SubscriptionAccountOverview {
  phase: AccountPhase;
  billingCycle: 'MONTHLY' | 'ANNUAL' | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  isParticulier: boolean;
  canManage: boolean;
  manageBlockedReason: string | null;
  items: AccountItem[];
  capacities: CapacityBreakdown[];
  /** TTC. */
  balance: { amountDue: number; overdueAmount: number; nextDueAt: string | null; currency: 'FCFA' };
}

export interface CatalogOffer {
  code: string;
  kind: 'PACK' | 'EXTENSION';
  name: string;
  description: string | null;
  /** Prix HT d'une unité pour CETTE agence. */
  unitMonthlyPrice: number;
  modules: string[];
  /** Par unité. */
  capacities: Partial<Record<CapacityKeyCode, number>>;
  held: boolean;
  available: boolean;
  unavailableReason: string | null;
  /** 1 pour un pack, 100 pour une extension. */
  maxQuantity: number;
}

export interface AddItemQuote {
  code: string;
  name: string;
  kind: 'PACK' | 'EXTENSION';
  quantity: number;
  segments: { quantity: number; unitMonthlyPrice: number }[];
  /** HT, récurrent ajouté par mois. */
  monthlyAmount: number;
  /** HT, récurrent ajouté par période de facturation. */
  cycleAmount: number;
  /** `null` pendant l'essai. */
  prorata: { amount: number; from: string; periodEnd: string; remainingDays: number; totalDays: number } | null;
  /** HT, ≤ 0. */
  comboDiscountDelta: number;
  taxRate: number;
  /** (prorata + delta) TTC, ajouté à la prochaine facture. */
  dueOnNextInvoiceInclTax: number;
  modulesOpened: string[];
  trial: boolean;
}

export interface AddItemInput {
  code: string;
  quantity?: number;
}

/** Réponse de `POST /items` (sérialisation existante d'`addSubscriptionItem`). */
export interface AddItemResult {
  items: AccountItem[];
  pendingLines: unknown[];
  modules: unknown;
}

export type StatementEntryType =
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'PAYMENT'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVAL_SCHEDULED'
  | 'ITEM_REMOVAL_CANCELED'
  | 'ITEM_ENDED';

export interface StatementEntry {
  /** `${type}:${sourceId}`. */
  id: string;
  date: string;
  type: StatementEntryType;
  label: string;
  reference: string | null;
  invoiceId: string | null;
  /** TTC, factures. */
  debit: number;
  /** TTC, avoirs et paiements. */
  credit: number;
  /** `null` pour un mouvement non monétaire. */
  balanceAfter: number | null;
  actorName: string | null;
  status: string | null;
}

export interface AccountStatement {
  from: string | null;
  to: string | null;
  currency: 'FCFA';
  openingBalance: number;
  entries: StatementEntry[];
  totals: { invoiced: number; credited: number; paid: number; balanceDue: number };
}

const base = (tenantId: string) => `/tenants/${tenantId}/subscription`;

/** `GET /overview` — `TENANT_SETTINGS_VIEW`. */
export async function getAccountOverview(tenantId: string): Promise<SubscriptionAccountOverview> {
  const response = await apiClient.get<Envelope<SubscriptionAccountOverview>>(`${base(tenantId)}/overview`);
  return response.data.data;
}

/** `GET /catalog` — offres PACK et EXTENSION vendables ; vide pour un espace particulier. */
export async function getAccountCatalog(tenantId: string): Promise<CatalogOffer[]> {
  const response = await apiClient.get<Envelope<CatalogOffer[]>>(`${base(tenantId)}/catalog`);
  return response.data.data;
}

/** `POST /items/quote` — calcul à blanc, rien n'est écrit. */
export async function quoteAddItem(tenantId: string, input: AddItemInput): Promise<AddItemQuote> {
  const response = await apiClient.post<Envelope<AddItemQuote>>(`${base(tenantId)}/items/quote`, input);
  return response.data.data;
}

/** `POST /items` — `TENANT_SUBSCRIPTION_MANAGE`. */
export async function addAccountItem(tenantId: string, input: AddItemInput): Promise<AddItemResult> {
  const response = await apiClient.post<Envelope<AddItemResult>>(`${base(tenantId)}/items`, input);
  return response.data.data;
}

/** `POST /items/:itemId/schedule-removal` — retrait à l'échéance, sans remboursement. */
export async function scheduleItemRemoval(tenantId: string, itemId: string, quantity?: number): Promise<AccountItem> {
  const response = await apiClient.post<Envelope<AccountItem>>(
    `${base(tenantId)}/items/${itemId}/schedule-removal`,
    quantity ? { quantity } : {}
  );
  return response.data.data;
}

/** `POST /items/:itemId/cancel-removal` — annule un retrait dont l'échéance n'est pas passée. */
export async function cancelItemRemoval(tenantId: string, itemId: string): Promise<AccountItem> {
  const response = await apiClient.post<Envelope<AccountItem>>(`${base(tenantId)}/items/${itemId}/cancel-removal`, {});
  return response.data.data;
}

/** `GET /invoice-preview` — prochaine facture estimée à ce jour (404 sans abonnement). */
export async function getAccountInvoicePreview(tenantId: string): Promise<InvoicePreview> {
  const response = await apiClient.get<Envelope<InvoicePreview>>(`${base(tenantId)}/invoice-preview`);
  return response.data.data;
}

/** `GET /statement?from=&to=` — relevé de compte (dates `YYYY-MM-DD`). */
export async function getAccountStatement(
  tenantId: string,
  range: { from?: string; to?: string } = {}
): Promise<AccountStatement> {
  const params: Record<string, string> = {};
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  const response = await apiClient.get<Envelope<AccountStatement>>(`${base(tenantId)}/statement`, { params });
  return response.data.data;
}
