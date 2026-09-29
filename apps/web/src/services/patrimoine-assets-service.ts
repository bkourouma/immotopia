import apiClient from '../utils/api-client';

/**
 * Service du patrimoine multi-actifs (lot 1) — une fonction par route de
 * `specs/023-patrimoine-multi-actifs/contracts/api.md`, sous
 * `/tenants/:tenantId/patrimoine`. Réseau uniquement via `utils/api-client`.
 * Les dates arrivent en chaîne ISO ; les montants en nombres.
 */

export type AssetClass =
  | 'REAL_ESTATE'
  | 'BUSINESS_EQUITY'
  | 'INVENTORY'
  | 'VEHICLE_EQUIPMENT'
  | 'CASH'
  | 'SAVINGS_INVESTMENT'
  | 'RECEIVABLE'
  | 'AGRICULTURE'
  | 'MOVABLE'
  | 'OTHER';

export type AssetStatus = 'ACTIVE' | 'DISPOSED' | 'ARCHIVED';
export type ValuationMethod =
  | 'MANUAL'
  | 'MARKET_ESTIMATE'
  | 'EXPERT_APPRAISAL'
  | 'DEPRECIATION_LINEAR'
  | 'DEPRECIATION_DECLINING'
  | 'EQUITY_SHARE'
  | 'UNIT_COST'
  | 'BALANCE'
  | 'ACCRUED_SAVINGS'
  | 'DISCOUNTED_CLAIM'
  | 'UNIT_VALUE';
export type AssetValuationMethod = ValuationMethod;

export type Reliability = 'HIGH' | 'MEDIUM' | 'LOW';

/** Clés stables des raisons de fiabilité, calculées par le serveur et traduites côté web. */
export type ReliabilityReason =
  | 'METHOD_EXPERT'
  | 'METHOD_BALANCE'
  | 'METHOD_COMPUTED'
  | 'METHOD_MANUAL_WITH_SOURCE'
  | 'METHOD_MANUAL_NO_SOURCE'
  | 'STALE_ONE_LEVEL'
  | 'STALE_TWO_LEVELS'
  | 'LEGAL_STATUS_FRAGILE'
  | 'LEGAL_STATUS_UNKNOWN';

export type SuggestResponse =
  | {
      ok: true;
      amount: number;
      currency: string;
      method: ValuationMethod;
      assumptions: { key: string; value: string | number }[];
    }
  | { ok: false; missing: string[] };
export type DebtStatus = 'ACTIVE' | 'CLOSED' | 'DEFAULTED';

export interface AssetValuationDto {
  id: string;
  assetId: string;
  valuatedAt: string;
  estimatedValue: number;
  currency: string;
  method: AssetValuationMethod;
  source: string | null;
  notes: string | null;
  /** `null` : valorisation antérieure au lot 2, traitée comme faible. */
  reliability: Reliability | null;
  reliabilityReasons: ReliabilityReason[];
}

export interface AssetDto {
  id: string;
  name: string;
  assetClass: AssetClass;
  status: AssetStatus;
  currency: string;
  exchangeRateToXof: number | null;
  acquisitionCost: number | null;
  acquisitionDate: string | null;
  disposedAt: string | null;
  holdingEntityId: string | null;
  propertyId: string | null;
  property: { id: string; internalReference: string; title: string | null } | null;
  details: Record<string, unknown>;
  notes: string | null;
  currentValue: {
    amount: number;
    currency: string;
    valuatedAt: string;
    valueXof: number | null;
    reliability: Reliability | null;
  } | null;
  /** Valeur périmée selon le seuil de la classe (calculé par le serveur). */
  stale: boolean;
  outstandingDebtXof: number;
  createdAt: string;
  updatedAt: string;
}

export interface DebtDto {
  id: string;
  assetId: string | null;
  propertyId: string | null;
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency: string;
  startDate: string;
  endDate: string;
  status: DebtStatus;
}

export interface HoldingDto {
  id: string;
  assetId: string;
  entityId: string;
  entityName: string;
  sharePercent: number;
  effectiveFrom: string | null;
  notes: string | null;
}

export type NetWorthExclusionReason = 'NO_VALUATION' | 'MISSING_EXCHANGE_RATE' | 'DISPOSED' | 'ARCHIVED';

export interface NetWorthResult {
  currency: 'XOF';
  asOf: string;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  byClass: { assetClass: AssetClass; value: number; count: number; share: number }[];
  assets: { id: string; valueXof: number; valuatedAt: string; reliability: Reliability | null; stale: boolean }[];
  /** Part (0..100) de la valeur totale reposant sur une fiabilité faible ou inconnue. */
  lowReliabilityShare: number;
  excluded: { assetId: string; reason: NetWorthExclusionReason }[];
  excludedLoans: { loanId: string; reason: 'MISSING_EXCHANGE_RATE' }[];
}

export interface NetWorthHistoryPoint {
  date: string;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
}

export interface AssetFilters {
  assetClass?: AssetClass;
  status?: AssetStatus;
  search?: string;
}

export interface InitialValuationInput {
  valuatedAt: string;
  estimatedValue: number;
  method?: AssetValuationMethod;
  source?: string | null;
  notes?: string | null;
}

export interface CreateAssetInput {
  name: string;
  assetClass: AssetClass;
  currency?: string;
  exchangeRateToXof?: number | null;
  acquisitionCost?: number | null;
  acquisitionDate?: string | null;
  holdingEntityId?: string | null;
  propertyId?: string | null;
  details: Record<string, unknown>;
  notes?: string | null;
  initialValuation?: InitialValuationInput;
}

/** Champs modifiables : ceux de la création, sauf la classe, le bien et la valorisation initiale. */
export type UpdateAssetInput = Partial<Omit<CreateAssetInput, 'assetClass' | 'propertyId' | 'initialValuation'>>;

export interface AssetValuationInput {
  valuatedAt: string;
  estimatedValue: number;
  currency?: string;
  method?: AssetValuationMethod;
  source?: string | null;
  notes?: string | null;
}

export interface DebtInput {
  assetId?: string | null;
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency?: string;
  startDate: string;
  endDate: string;
  status?: DebtStatus;
}

export interface DebtFilters {
  assetId?: string;
  unattached?: boolean;
}

export interface NetWorthHistoryParams {
  from?: string;
  to?: string;
  step?: 'month';
}

type Envelope<T> = { data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/patrimoine`;
}

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.append(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

// --- Actifs -----------------------------------------------------------------

export async function listAssets(tenantId: string, filters?: AssetFilters): Promise<AssetDto[]> {
  const query = buildQuery({ assetClass: filters?.assetClass, status: filters?.status, search: filters?.search });
  const response = await apiClient.get<Envelope<AssetDto[]>>(`${base(tenantId)}/assets${query}`);
  return response.data.data;
}

/**
 * Biens déjà liés à un actif immobilier, archivés compris (le serveur exclut
 * les archivés de la liste par défaut et répond 409 pour un bien déjà lié).
 * Indépendant des filtres de l'écran appelant.
 */
export async function listLinkedPropertyIds(tenantId: string): Promise<string[]> {
  const [current, archived] = await Promise.all([
    listAssets(tenantId, { assetClass: 'REAL_ESTATE' }),
    listAssets(tenantId, { assetClass: 'REAL_ESTATE', status: 'ARCHIVED' })
  ]);
  const ids = [...current, ...archived].flatMap(asset => (asset.propertyId ? [asset.propertyId] : []));
  return Array.from(new Set(ids));
}

export async function createAsset(tenantId: string, payload: CreateAssetInput): Promise<AssetDto> {
  const response = await apiClient.post<Envelope<AssetDto>>(`${base(tenantId)}/assets`, payload);
  return response.data.data;
}

export async function getAsset(tenantId: string, assetId: string): Promise<AssetDto> {
  const response = await apiClient.get<Envelope<AssetDto>>(`${base(tenantId)}/assets/${assetId}`);
  return response.data.data;
}

export async function updateAsset(tenantId: string, assetId: string, payload: UpdateAssetInput): Promise<AssetDto> {
  const response = await apiClient.patch<Envelope<AssetDto>>(`${base(tenantId)}/assets/${assetId}`, payload);
  return response.data.data;
}

export async function disposeAsset(tenantId: string, assetId: string, disposedAt: string): Promise<AssetDto> {
  const response = await apiClient.post<Envelope<AssetDto>>(`${base(tenantId)}/assets/${assetId}/dispose`, {
    disposedAt
  });
  return response.data.data;
}

export async function archiveAsset(tenantId: string, assetId: string): Promise<AssetDto> {
  const response = await apiClient.post<Envelope<AssetDto>>(`${base(tenantId)}/assets/${assetId}/archive`);
  return response.data.data;
}

// --- Valorisations ----------------------------------------------------------

export async function listAssetValuations(tenantId: string, assetId: string): Promise<AssetValuationDto[]> {
  const response = await apiClient.get<Envelope<AssetValuationDto[]>>(`${base(tenantId)}/assets/${assetId}/valuations`);
  return response.data.data;
}

export async function createAssetValuation(
  tenantId: string,
  assetId: string,
  payload: AssetValuationInput
): Promise<AssetValuationDto> {
  const response = await apiClient.post<Envelope<AssetValuationDto>>(
    `${base(tenantId)}/assets/${assetId}/valuations`,
    payload
  );
  return response.data.data;
}

/** Calcule une valeur d'après les caractéristiques de l'actif, sans rien enregistrer. */
export async function suggestAssetValuation(
  tenantId: string,
  assetId: string,
  asOf?: string
): Promise<SuggestResponse> {
  const response = await apiClient.post<Envelope<SuggestResponse>>(
    `${base(tenantId)}/assets/${assetId}/valuations/suggest`,
    asOf ? { asOf } : {}
  );
  return response.data.data;
}

export async function updateAssetValuation(
  tenantId: string,
  assetId: string,
  valuationId: string,
  payload: Partial<AssetValuationInput>
): Promise<AssetValuationDto> {
  const response = await apiClient.patch<Envelope<AssetValuationDto>>(
    `${base(tenantId)}/assets/${assetId}/valuations/${valuationId}`,
    payload
  );
  return response.data.data;
}

export async function deleteAssetValuation(tenantId: string, assetId: string, valuationId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/assets/${assetId}/valuations/${valuationId}`);
}

// --- Dettes -----------------------------------------------------------------

export async function listDebts(tenantId: string, filters?: DebtFilters): Promise<DebtDto[]> {
  const query = buildQuery({ assetId: filters?.assetId, unattached: filters?.unattached ? 'true' : undefined });
  const response = await apiClient.get<Envelope<DebtDto[]>>(`${base(tenantId)}/debts${query}`);
  return response.data.data;
}

export async function createDebt(tenantId: string, payload: DebtInput): Promise<DebtDto> {
  const response = await apiClient.post<Envelope<DebtDto>>(`${base(tenantId)}/debts`, payload);
  return response.data.data;
}

export async function updateDebt(tenantId: string, debtId: string, payload: Partial<DebtInput>): Promise<DebtDto> {
  const response = await apiClient.patch<Envelope<DebtDto>>(`${base(tenantId)}/debts/${debtId}`, payload);
  return response.data.data;
}

export async function deleteDebt(tenantId: string, debtId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/debts/${debtId}`);
}

// --- Parts détenues (actifs non immobiliers) --------------------------------

export async function listAssetHoldings(tenantId: string, assetId: string): Promise<HoldingDto[]> {
  const response = await apiClient.get<Envelope<HoldingDto[]>>(`${base(tenantId)}/assets/${assetId}/holdings`);
  return response.data.data;
}

export async function upsertAssetHolding(
  tenantId: string,
  assetId: string,
  entityId: string,
  payload: { sharePercent: number; effectiveFrom?: string | null }
): Promise<HoldingDto> {
  const response = await apiClient.put<Envelope<HoldingDto>>(
    `${base(tenantId)}/assets/${assetId}/holdings/${entityId}`,
    payload
  );
  return response.data.data;
}

export async function deleteAssetHolding(tenantId: string, assetId: string, entityId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/assets/${assetId}/holdings/${entityId}`);
}

// --- Valeur nette -----------------------------------------------------------

export async function getNetWorth(tenantId: string, asOf?: string): Promise<NetWorthResult> {
  const response = await apiClient.get<Envelope<NetWorthResult>>(`${base(tenantId)}/net-worth${buildQuery({ asOf })}`);
  return response.data.data;
}

export async function getNetWorthHistory(
  tenantId: string,
  params?: NetWorthHistoryParams
): Promise<NetWorthHistoryPoint[]> {
  const response = await apiClient.get<Envelope<NetWorthHistoryPoint[]>>(
    `${base(tenantId)}/net-worth/history${buildQuery({ from: params?.from, to: params?.to, step: params?.step })}`
  );
  return response.data.data;
}

/**
 * Entités détentrices proposées dans le sélecteur d'un actif (id et nom).
 * Route des entités déjà existante ; la fonction vit ici plutôt que dans
 * `patrimoine-entities-service` pour ne pas rendre ce service partagé entre
 * plusieurs écrans : Vite en ferait un fichier de plus dans la carte des
 * dépendances du chunk d'entrée (`npm run measure:entry`, REFONTE_UI_UX.md §8.1).
 */
export async function listHoldingEntityOptions(tenantId: string): Promise<{ id: string; name: string }[]> {
  const response = await apiClient.get<Envelope<{ id: string; name: string }[]>>(`${base(tenantId)}/entities`);
  return response.data.data;
}
