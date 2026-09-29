import apiClient from '../utils/api-client';

/**
 * Abonnements par packs (vague 2, lot C) — appels côté web vers les routes
 * super-admin `/api/admin/...` et la lecture d'agence `/api/tenants/:id/entitlements`
 * livrées par la vague 1.
 *
 * Types recopiés EXACTEMENT sur les réponses des contrôleurs (piège connu :
 * un écran vide vient souvent d'un type front qui ment). Référence :
 * - packages/api/src/controllers/subscription-v2-controller.ts
 * - packages/api/src/services/subscription-v2-service.ts (serializeItem, serializeLine, getSubscriptionOverview, previewNextInvoice)
 * - packages/api/src/lib/subscription/entitlements.ts (TenantEntitlements)
 * - docs/architecture/PLAN-ABONNEMENTS.md
 */

export type CapacityKeyCode = 'LOTS' | 'COPROPRIETES' | 'CHANTIERS' | 'BIENS_DETENUS' | 'ACTIFS';
export type CatalogItemKindCode = 'PACK' | 'EXTENSION' | 'SETUP';
export type ModuleKeyCode = 'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER' | 'MODULE_PATRIMOINE';
export type SubscriptionItemStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';
export type SubscriptionStatusCode = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
export type QuotaPolicyCode = 'BLOCK' | 'BILL_OVERAGE' | 'WARN_ONLY';
export type SubscriptionPhase = 'NONE' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY';
export type ModuleAccess = 'FULL' | 'READ_ONLY' | 'NONE';
export type InvoiceLineKindCode =
  'PACK' | 'EXTENSION' | 'PRORATA' | 'DISCOUNT' | 'SETUP' | 'OVERAGE' | 'CREDIT' | 'USAGE' | 'TAX';

export interface CatalogRules {
  byHeldPacks?: Array<{ anyOf: string[]; monthlyPrice: number }>;
  lotTiers?: Array<{ onlyPacks: string[]; fromLot: number; monthlyPrice: number }>;
  requiresAnyOf?: string[];
  /** Palier d'une gamme (packs Patrimoine, lot P1) : deux packs du même `tierGroup` ne se cumulent pas. */
  tierGroup?: string;
}

/** `CatalogEntry` (subscription-v2-service.ts, `toCatalogEntry`). */
export interface CatalogEntry {
  id: string;
  code: string;
  kind: CatalogItemKindCode;
  name: string;
  description: string | null;
  monthlyPrice: number;
  setupPrice: number;
  modules: ModuleKeyCode[];
  exclusiveGroup: string | null;
  rules: CatalogRules | null;
  isSellable: boolean;
  sortOrder: number;
  capacities: Partial<Record<CapacityKeyCode, number>>;
}

export interface ChargeLine {
  kind: InvoiceLineKindCode;
  label: string;
  code?: string;
  subscriptionItemId?: string;
  capacityKey?: CapacityKeyCode;
  quantity: number;
  unitPrice: number;
  amount: number;
  periodStart?: string;
  periodEnd?: string;
}

/** Réponse de `POST /api/admin/catalog/quote`. */
export interface CatalogQuote {
  lines: ChargeLine[];
  subtotal: number;
  comboDiscount: number;
  extensions: Record<string, number>;
  monthly: number;
  annual: number;
}

export interface CatalogQuoteRequest {
  packs: string[];
  lots?: number;
  copros?: number;
  chantiers?: number;
  /** Biens détenus visés (packs Patrimoine, lot P1). */
  biens?: number;
}

/** `serializeItem` (subscription-v2-service.ts). */
export interface SubscriptionItemDTO {
  id: string;
  code: string;
  kind: CatalogItemKindCode;
  name: string;
  quantity: number;
  unitMonthlyPrice: number;
  unitSetupPrice: number;
  discountPercent: number;
  status: SubscriptionItemStatus;
  startsAt: string;
  endsAt: string | null;
  endReason: string | null;
  replacesItemId: string | null;
  parentItemId: string | null;
  billedThrough: string | null;
  note: string | null;
}

/** `serializeLine`. */
export interface InvoiceLineDTO {
  id: string;
  kind: InvoiceLineKindCode;
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  subscriptionItemId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface CapacityOverrideDTO {
  id: string;
  tenantId: string;
  capacityKey: CapacityKeyCode;
  delta: number;
  reason: string;
  startsAt: string;
  expiresAt: string | null;
  grantedByUserId: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityState {
  included: number;
  extensions: number;
  overrides: number;
  limit: number;
  used: number;
  remaining: number;
  overBy: number;
}

/** `TenantEntitlements` (lib/subscription/entitlements.ts). */
export interface TenantEntitlements {
  tenantId: string;
  subscriptionId: string | null;
  status: SubscriptionStatusCode | 'NONE';
  phase: SubscriptionPhase;
  readOnly: boolean;
  readOnlyReason: string | null;
  /** Lecture seule manuelle (super-admin), independante de la lecture seule d'impaye. */
  manualReadOnlyAt: string | null;
  manualReadOnlyReason: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  billingCycle: 'MONTHLY' | 'ANNUAL' | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  packs: string[];
  modules: ModuleKeyCode[];
  moduleAccess: Record<ModuleKeyCode, ModuleAccess>;
  features: string[];
  /**
   * Barrière « détenu en propre » (pack Patrimoine, lot P1) : vrai quand le
   * seul module pleinement ouvert est MODULE_PATRIMOINE. Ni mandat, ni
   * propriétaire tiers (403 `OWN_ASSETS_ONLY`, utils/subscription-denial-notice.ts).
   */
  ownAssetsOnly: boolean;
  capacities: Record<CapacityKeyCode, CapacityState>;
  quotaPolicy: QuotaPolicyCode;
  enforcement: 'off' | 'warn' | 'enforce';
  computedAt: string;
}

/** Ligne `subscriptions` (Prisma), telle que renvoyée sans transformation (hors `comboDiscountPercent` en nombre). */
export interface SubscriptionRow {
  id: string;
  tenantId: string;
  planKey: 'BASIC' | 'PRO' | 'ELITE' | null;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  status: SubscriptionStatusCode;
  startAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAt: string | null;
  canceledAt: string | null;
  trialEndsAt: string | null;
  pastDueAt: string | null;
  graceDays: number;
  quotaPolicy: QuotaPolicyCode;
  comboDiscountPercent: number;
  nextBillingAt: string | null;
  /** Lecture seule manuelle (super-admin), independante de la lecture seule d'impaye. */
  manualReadOnlyAt: string | null;
  manualReadOnlyReason: string | null;
}

/** `getSubscriptionOverview`. */
export interface SubscriptionOverview {
  subscription: SubscriptionRow;
  items: SubscriptionItemDTO[];
  overrides: CapacityOverrideDTO[];
  pendingLines: InvoiceLineDTO[];
  entitlements: TenantEntitlements;
}

/** `InvoicePreview` (previewNextInvoice). */
export interface InvoicePreview {
  tenantId: string;
  issuer: { name: string };
  billingCycle: 'MONTHLY' | 'ANNUAL';
  periodStart: string;
  periodEnd: string;
  pendingLineIds: string[];
  quotaPolicy: QuotaPolicyCode;
  lines: ChargeLine[];
  amountExclTax: number;
  taxRate: number;
  taxAmount: number;
  amountTotal: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ------------------------------------------------------------------ catalogue

export async function listCatalog(includeUnsellable = false): Promise<CatalogEntry[]> {
  const response = await apiClient.get<Envelope<CatalogEntry[]>>('/admin/catalog', {
    params: includeUnsellable ? { all: '1' } : undefined
  });
  return response.data.data;
}

export async function quoteCatalog(input: CatalogQuoteRequest): Promise<CatalogQuote> {
  const response = await apiClient.post<Envelope<CatalogQuote>>('/admin/catalog/quote', input);
  return response.data.data;
}

// ------------------------------------------------------------------ droits et abonnement

/** Super-admin : `GET /api/admin/tenants/:tenantId/entitlements`. */
export async function getTenantEntitlements(tenantId: string): Promise<TenantEntitlements> {
  const response = await apiClient.get<Envelope<TenantEntitlements>>(`/admin/tenants/${tenantId}/entitlements`);
  return response.data.data;
}

/** Agence elle-même : `GET /api/tenants/:tenantId/entitlements`. */
export async function getOwnEntitlements(tenantId: string): Promise<TenantEntitlements> {
  const response = await apiClient.get<Envelope<TenantEntitlements>>(`/tenants/${tenantId}/entitlements`);
  return response.data.data;
}

export async function getSubscriptionOverview(tenantId: string): Promise<SubscriptionOverview> {
  const response = await apiClient.get<Envelope<SubscriptionOverview>>(
    `/admin/tenants/${tenantId}/subscription/overview`
  );
  return response.data.data;
}

export interface AddItemInput {
  code: string;
  quantity?: number;
  discountPercent?: number;
  note?: string;
}

export interface AddItemResult {
  items: SubscriptionItemDTO[];
  pendingLines: InvoiceLineDTO[];
  modules: unknown;
}

export async function addSubscriptionItem(tenantId: string, input: AddItemInput): Promise<AddItemResult> {
  const response = await apiClient.post<Envelope<AddItemResult>>(
    `/admin/tenants/${tenantId}/subscription/items`,
    input
  );
  return response.data.data;
}

export interface RemoveItemInput {
  immediate?: boolean;
  reason?: string;
  quantity?: number;
}

export interface RemoveItemResult {
  item: SubscriptionItemDTO;
  remainder: SubscriptionItemDTO | null;
  immediate: boolean;
  modules: unknown;
}

export async function removeSubscriptionItem(
  tenantId: string,
  itemId: string,
  input: RemoveItemInput
): Promise<RemoveItemResult> {
  const response = await apiClient.delete<Envelope<RemoveItemResult>>(
    `/admin/tenants/${tenantId}/subscription/items/${itemId}`,
    { data: input }
  );
  return response.data.data;
}

export interface ChangePackInput {
  fromCodes: string[];
  toCode: string;
  note?: string;
}

export interface ChangePackResult {
  item: SubscriptionItemDTO;
  upgrade: boolean;
  immediate: boolean;
  switchAt: string;
  pendingLines: InvoiceLineDTO[];
  modules: unknown;
}

export async function changeSubscriptionPack(tenantId: string, input: ChangePackInput): Promise<ChangePackResult> {
  const response = await apiClient.post<Envelope<ChangePackResult>>(
    `/admin/tenants/${tenantId}/subscription/change-pack`,
    input
  );
  return response.data.data;
}

export interface UpdateSettingsInput {
  quotaPolicy?: QuotaPolicyCode;
  graceDays?: number;
  comboDiscountPercent?: number;
  /** Date ISO (avec offset), prolonge ou avance la fin d'essai. */
  trialEndsAt?: string;
}

export async function updateSubscriptionSettings(
  tenantId: string,
  input: UpdateSettingsInput
): Promise<SubscriptionRow> {
  const response = await apiClient.patch<Envelope<SubscriptionRow>>(
    `/admin/tenants/${tenantId}/subscription/settings`,
    input
  );
  return response.data.data;
}

// ------------------------------------------------------------------ lecture seule manuelle

/**
 * Lecture seule manuelle (Baba, 25/09) : action super-admin, motif
 * obligatoire, independante de la lecture seule d'impaye. Jamais levee par un
 * paiement ni par la tâche planifiée — seulement par cette action.
 */
export async function setSubscriptionManualReadOnly(tenantId: string, reason: string): Promise<SubscriptionRow> {
  const response = await apiClient.post<Envelope<SubscriptionRow>>(
    `/admin/tenants/${tenantId}/subscription/manual-read-only`,
    {
      reason
    }
  );
  return response.data.data;
}

export async function clearSubscriptionManualReadOnly(tenantId: string): Promise<SubscriptionRow> {
  const response = await apiClient.delete<Envelope<SubscriptionRow>>(
    `/admin/tenants/${tenantId}/subscription/manual-read-only`
  );
  return response.data.data;
}

// ------------------------------------------------------------------ dérogations

export async function listCapacityOverrides(tenantId: string): Promise<CapacityOverrideDTO[]> {
  const response = await apiClient.get<Envelope<CapacityOverrideDTO[]>>(
    `/admin/tenants/${tenantId}/subscription/overrides`
  );
  return response.data.data;
}

export interface GrantOverrideInput {
  capacityKey: CapacityKeyCode;
  delta: number;
  reason: string;
  startsAt?: string;
  expiresAt?: string | null;
}

export async function grantCapacityOverride(tenantId: string, input: GrantOverrideInput): Promise<CapacityOverrideDTO> {
  const response = await apiClient.post<Envelope<CapacityOverrideDTO>>(
    `/admin/tenants/${tenantId}/subscription/overrides`,
    input
  );
  return response.data.data;
}

export async function revokeCapacityOverride(tenantId: string, overrideId: string): Promise<CapacityOverrideDTO> {
  const response = await apiClient.delete<Envelope<CapacityOverrideDTO>>(
    `/admin/tenants/${tenantId}/subscription/overrides/${overrideId}`
  );
  return response.data.data;
}

// ------------------------------------------------------------------ facture et modules

export async function previewNextInvoice(tenantId: string): Promise<InvoicePreview> {
  const response = await apiClient.get<Envelope<InvoicePreview>>(
    `/admin/tenants/${tenantId}/subscription/invoice-preview`
  );
  return response.data.data;
}

export async function clearModuleOverride(tenantId: string, moduleKey: ModuleKeyCode): Promise<unknown> {
  const response = await apiClient.delete<Envelope<unknown>>(
    `/admin/tenants/${tenantId}/modules/${moduleKey}/override`
  );
  return response.data.data;
}
