import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../utils/database';
import { assertBelongsToTenant } from '../utils/tenant-ownership';
import { getPropertyForTenant } from '../utils/property-tenant-guard';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../middleware/error-middleware';
import { roundMoneyXof } from '../lib/finance/money';
import {
  ASSET_DETAILS_VERSION,
  computeNetWorth,
  computeNetWorthHistory,
  currentValueAt,
  isStale,
  toXof
} from '../lib/patrimoine/assets';
import type {
  AssetClassKey,
  NetWorthAssetInput,
  NetWorthLoanInput,
  NetWorthResult,
  Reliability,
  ReliabilityReason,
  ValuationMethodKey
} from '../lib/patrimoine/assets';
import { assetScopeData, assetScopeWhere } from '../lib/patrimoine/asset-scope';
import { EXPERT_SOURCE_MESSAGE, validateAssetDetails } from '../lib/patrimoine/asset-schemas';
import { assertAssetQuota, assertValuationQuota, LIST_ASSETS_HARD_LIMIT } from './patrimoine-assets/limits';
import { assertFreeTierCapacityTx, getAssetCapacityLimit, lockTenantAssets } from './personal-space/free-tier';
import { auditPatrimoine, changedFields, PATRIMOINE_ASSET_AUDIT as AUDIT } from './patrimoine-assets/audit';
import { computeStoredReliability, effectiveReliability } from './patrimoine-assets/reliability-view';
import { buildSuggestion, verifiedMethod } from './patrimoine-assets/valuation-suggest';
import type { SuggestAssetInput, SuggestLastValuation, SuggestResponse } from './patrimoine-assets/valuation-suggest';
import type {
  createAssetSchema,
  updateAssetSchema,
  createAssetValuationSchema,
  updateAssetValuationSchema,
  createDebtSchema,
  updateDebtSchema,
  setAssetHoldingSchema,
  listAssetsQuerySchema,
  listDebtsQuerySchema
} from '../lib/patrimoine/asset-schemas';

/**
 * Logique métier du patrimoine multi-actifs (lot 1, ADR-005, spec 023).
 * TOUTE requête est filtrée par `tenantId`. Le choix de la clé
 * `propertyId`/`assetId` des lignes liées passe uniquement par
 * `lib/patrimoine/asset-scope.ts`.
 */

export {
  MAX_ACTIVE_ASSETS_PER_TENANT,
  MAX_VALUATIONS_PER_ASSET,
  LIST_ASSETS_HARD_LIMIT
} from './patrimoine-assets/limits';

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type CreateValuationInput = z.infer<typeof createAssetValuationSchema>;
export type UpdateValuationInput = z.infer<typeof updateAssetValuationSchema>;
export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type SetHoldingInput = z.infer<typeof setAssetHoldingSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
export type ListDebtsQuery = z.infer<typeof listDebtsQuerySchema>;

/** Client de transaction de l'extension Prisma du dépôt (`utils/database`). */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const BASE_CURRENCY = 'XOF';
const NOT_FOUND_ASSET = 'Actif introuvable.';
const NOT_FOUND_VALUATION = 'Valorisation introuvable.';
const NOT_FOUND_DEBT = 'Dette introuvable.';
const NOT_FOUND_ENTITY = 'Entité introuvable.';
const ARCHIVED_ASSET_MESSAGE = 'Cet actif est archivé : il ne peut plus être modifié.';
const CURRENCY_CHANGE_MESSAGE =
  'Changez d’abord ou supprimez les valorisations et dettes libellées dans l’ancienne devise.';

const ASSET_INCLUDE = {
  property: { select: { id: true, internalReference: true, title: true } }
} satisfies Prisma.AssetInclude;

type AssetRow = Prisma.AssetGetPayload<{ include: typeof ASSET_INCLUDE }>;

const VALUATION_SELECT = {
  id: true,
  assetId: true,
  propertyId: true,
  valuatedAt: true,
  estimatedValue: true,
  currency: true,
  method: true,
  source: true,
  notes: true,
  reliability: true
} satisfies Prisma.AssetValuationSelect;

type ValuationRow = Prisma.AssetValuationGetPayload<{ select: typeof VALUATION_SELECT }>;

const LOAN_SELECT = {
  id: true,
  assetId: true,
  propertyId: true,
  lender: true,
  capitalAmount: true,
  remainingCapital: true,
  interestRate: true,
  monthlyPayment: true,
  currency: true,
  startDate: true,
  endDate: true,
  status: true
} satisfies Prisma.PropertyLoanSelect;

type LoanRow = Prisma.PropertyLoanGetPayload<{ select: typeof LOAN_SELECT }>;

// ---------------------------------------------------------------- DTO

export interface AssetValuationDto {
  id: string;
  assetId: string;
  valuatedAt: string;
  estimatedValue: number;
  currency: string;
  method: ValuationMethodKey;
  source: string | null;
  notes: string | null;
  /** Fiabilité effective à la date du jour ; nulle pour une ligne antérieure au lot 2. */
  reliability: Reliability | null;
  reliabilityReasons: ReliabilityReason[];
}

export interface AssetDto {
  id: string;
  name: string;
  assetClass: AssetClassKey;
  status: 'ACTIVE' | 'DISPOSED' | 'ARCHIVED';
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
  /** Valeur périmée selon le seuil de la classe (vrai sans valorisation). */
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
  status: 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
}

export interface AssetHoldingDto {
  id: string;
  assetId: string;
  entityId: string;
  entityName: string;
  sharePercent: number;
  effectiveFrom: string | null;
  notes: string | null;
}

interface AssetFigures {
  currentValue: AssetDto['currentValue'];
  stale: boolean;
  outstandingDebtXof: number;
}

const iso = (date: Date): string => date.toISOString();
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);
const num = (value: Prisma.Decimal | number): number => Number(value);

function toAssetDto(row: AssetRow, figures: AssetFigures): AssetDto {
  return {
    id: row.id,
    name: row.name,
    assetClass: row.assetClass,
    status: row.status,
    currency: row.currency,
    exchangeRateToXof: row.exchangeRateToXof === null ? null : num(row.exchangeRateToXof),
    acquisitionCost: row.acquisitionCost === null ? null : num(row.acquisitionCost),
    acquisitionDate: row.acquisitionDate ? iso(row.acquisitionDate) : null,
    disposedAt: row.disposedAt ? iso(row.disposedAt) : null,
    holdingEntityId: row.holdingEntityId,
    propertyId: row.propertyId,
    property: row.property,
    details: (row.details ?? {}) as Record<string, unknown>,
    notes: row.notes,
    currentValue: figures.currentValue,
    stale: figures.stale,
    outstandingDebtXof: figures.outstandingDebtXof,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function toValuationDto(row: ValuationRow, asset: Pick<AssetRow, 'id' | 'assetClass' | 'details'>): AssetValuationDto {
  const assetId = asset.id;
  return {
    id: row.id,
    assetId,
    valuatedAt: iso(row.valuatedAt),
    estimatedValue: num(row.estimatedValue),
    currency: row.currency,
    method: row.method,
    source: row.source,
    notes: row.notes,
    ...effectiveReliability(asset, row)
  };
}

function toDebtDto(row: LoanRow, assetId: string | null): DebtDto {
  return {
    id: row.id,
    assetId,
    propertyId: row.propertyId,
    lender: row.lender,
    capitalAmount: num(row.capitalAmount),
    remainingCapital: num(row.remainingCapital),
    interestRate: num(row.interestRate),
    monthlyPayment: num(row.monthlyPayment),
    currency: row.currency,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    status: row.status
  };
}

// ---------------------------------------------------------------- Chiffres d'un lot d'actifs (sans N+1)

/** Clé de regroupement des lignes : le bien pour un actif immobilier lié, l'actif sinon. */
export function scopeKey(asset: { id: string; propertyId: string | null }): string {
  return asset.propertyId ? `p:${asset.propertyId}` : `a:${asset.id}`;
}

function rowKey(row: { propertyId: string | null; assetId: string | null }): string | null {
  if (row.propertyId) return `p:${row.propertyId}`;
  return row.assetId ? `a:${row.assetId}` : null;
}

function scopeFilters(assets: { id: string; propertyId: string | null }[]) {
  const propertyIds = assets.flatMap(a => (a.propertyId ? [a.propertyId] : []));
  const assetIds = assets.filter(a => !a.propertyId).map(a => a.id);
  return [
    ...(assetIds.length ? [{ assetId: { in: assetIds } }] : []),
    ...(propertyIds.length ? [{ propertyId: { in: propertyIds } }] : [])
  ];
}

function groupByKey<T extends { propertyId: string | null; assetId: string | null }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = rowKey(row);
    if (key) groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

async function loadValuationsByKey(tenantId: string, assets: AssetRow[]) {
  const filters = scopeFilters(assets);
  if (filters.length === 0) return new Map<string, ValuationRow[]>();
  const rows = await prisma.assetValuation.findMany({
    where: { tenantId, OR: filters },
    select: VALUATION_SELECT,
    orderBy: [{ valuatedAt: 'asc' }, { createdAt: 'asc' }]
  });
  return groupByKey(rows);
}

async function loadActiveLoansByKey(tenantId: string, assets: AssetRow[]) {
  const filters = scopeFilters(assets);
  if (filters.length === 0) return new Map<string, LoanRow[]>();
  const rows = await prisma.propertyLoan.findMany({
    where: { tenantId, status: 'ACTIVE', OR: filters },
    select: LOAN_SELECT
  });
  return groupByKey(rows);
}

function figuresOf(asset: AssetRow, valuations: ValuationRow[], loans: LoanRow[]): AssetFigures {
  const rate = asset.exchangeRateToXof === null ? null : num(asset.exchangeRateToXof);
  const now = new Date();
  const inputs = valuations.map(v => ({
    valuatedAt: v.valuatedAt,
    estimatedValue: num(v.estimatedValue),
    currency: v.currency,
    row: v
  }));
  // `currentValueAt` renvoie l'un des éléments passés : le cast retrouve la ligne d'origine.
  const latest = currentValueAt({ valuations: inputs }, now) as (typeof inputs)[number] | null;
  const valueXof = latest ? toXof(latest.estimatedValue, latest.currency, rate) : null;
  const debt = loans.reduce((sum, loan) => {
    const converted = toXof(num(loan.remainingCapital), loan.currency, rate);
    return converted === null ? sum : sum + roundMoneyXof(converted);
  }, 0);
  return {
    currentValue: latest
      ? {
          amount: latest.estimatedValue,
          currency: latest.currency,
          valuatedAt: iso(latest.valuatedAt),
          valueXof: valueXof === null ? null : roundMoneyXof(valueXof),
          reliability: effectiveReliability(asset, latest.row, now).reliability
        }
      : null,
    stale: asset.status === 'ACTIVE' && isStale(asset.assetClass, latest ? latest.valuatedAt : null, now),
    outstandingDebtXof: debt
  };
}

async function toAssetDtos(tenantId: string, assets: AssetRow[]): Promise<AssetDto[]> {
  const [valuations, loans] = await Promise.all([
    loadValuationsByKey(tenantId, assets),
    loadActiveLoansByKey(tenantId, assets)
  ]);
  return assets.map(asset =>
    toAssetDto(asset, figuresOf(asset, valuations.get(scopeKey(asset)) ?? [], loans.get(scopeKey(asset)) ?? []))
  );
}

async function findAssetOrThrow(tenantId: string, assetId: string): Promise<AssetRow> {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId }, include: ASSET_INCLUDE });
  if (!asset) throw new NotFoundError(NOT_FOUND_ASSET);
  return asset;
}

async function assetDtoById(tenantId: string, assetId: string): Promise<AssetDto> {
  const [dto] = await toAssetDtos(tenantId, [await findAssetOrThrow(tenantId, assetId)]);
  return dto;
}

// ---------------------------------------------------------------- Devises

function fieldError(field: string, message: string): ValidationError {
  return new ValidationError(message, [{ field, message }]);
}

/** Une devise autre que le XOF exige un taux strictement positif ; en XOF le taux est nul. */
function resolveCurrency(
  currency: string | undefined,
  rate: number | null | undefined
): { currency: string; exchangeRateToXof: number | null } {
  const resolved = currency ?? BASE_CURRENCY;
  if (resolved === BASE_CURRENCY) return { currency: resolved, exchangeRateToXof: null };
  if (rate === null || rate === undefined || !(rate > 0)) {
    throw fieldError(
      'exchangeRateToXof',
      'Un taux de change vers le XOF strictement positif est requis pour cette devise.'
    );
  }
  return { currency: resolved, exchangeRateToXof: rate };
}

/** Un actif archivé est figé : aucune écriture (actif, valorisation, dette, part). */
function assertNotArchived(asset: Pick<AssetRow, 'status'>): void {
  if (asset.status === 'ARCHIVED') throw new ConflictError(ARCHIVED_ASSET_MESSAGE);
}

/** Une ligne d'un actif est en XOF ou dans la devise de l'actif (seule convertible avec le taux de l'actif). */
function assertLineCurrency(asset: Pick<AssetRow, 'currency'>, currency: string, field = 'currency'): void {
  if (currency !== BASE_CURRENCY && currency !== asset.currency) {
    throw fieldError(field, `La devise doit être le XOF ou celle de l'actif (${asset.currency}).`);
  }
}

// ---------------------------------------------------------------- Actifs

async function assertNewAssetProperty(tenantId: string, input: CreateAssetInput): Promise<void> {
  const isRealEstate = input.assetClass === 'REAL_ESTATE';
  if (!isRealEstate) {
    if (input.propertyId) throw fieldError('propertyId', 'Seul un actif immobilier peut être rattaché à un bien.');
    return;
  }
  if (!input.propertyId) throw fieldError('propertyId', 'Un actif immobilier doit être rattaché à un bien.');
  await getPropertyForTenant(input.propertyId, tenantId);
  const linked = await prisma.asset.findFirst({
    where: { tenantId, propertyId: input.propertyId },
    select: { id: true }
  });
  if (linked) throw new ConflictError('Ce bien est déjà rattaché à un actif.');
}

export async function createAsset(tenantId: string, input: CreateAssetInput, actorUserId?: string): Promise<AssetDto> {
  const details = validateAssetDetails(input.assetClass, input.details);
  const money = resolveCurrency(input.currency, input.exchangeRateToXof);
  await assertNewAssetProperty(tenantId, input);
  await assertBelongsToTenant(prisma, 'holdingEntity', input.holdingEntityId, tenantId, { message: NOT_FOUND_ENTITY });
  await assertAssetQuota(tenantId);
  // Palier gratuit (lot 4B) : plafond du pack quand il porte la capacité ACTIFS,
  // quel que soit le mode global. Comptage et création sous verrou par tenant.
  const capacityLimit = await getAssetCapacityLimit(tenantId, { fresh: true });

  const created = await prisma.$transaction(async tx => {
    if (capacityLimit !== null) {
      await lockTenantAssets(tx, tenantId);
      await assertFreeTierCapacityTx(tx, tenantId, capacityLimit);
    }
    const asset = await tx.asset.create({
      data: {
        tenantId,
        name: input.name,
        assetClass: input.assetClass,
        currency: money.currency,
        exchangeRateToXof: money.exchangeRateToXof,
        acquisitionCost: input.acquisitionCost ?? null,
        acquisitionDate: input.acquisitionDate ?? null,
        holdingEntityId: input.holdingEntityId ?? null,
        propertyId: input.propertyId ?? null,
        details: details as Prisma.InputJsonValue,
        detailsVersion: ASSET_DETAILS_VERSION,
        notes: input.notes ?? null,
        createdByUserId: actorUserId ?? null
      }
    });
    if (input.initialValuation) {
      const initial = input.initialValuation;
      const method = verifiedMethod(suggestInputOf(asset), null, {
        method: initial.method,
        valuatedAt: initial.valuatedAt,
        estimatedValue: initial.estimatedValue,
        currency: asset.currency
      });
      await tx.assetValuation.create({
        data: {
          tenantId,
          ...assetScopeData(asset),
          valuatedAt: initial.valuatedAt,
          estimatedValue: initial.estimatedValue,
          currency: asset.currency,
          method,
          source: initial.source ?? null,
          notes: initial.notes ?? null,
          ...computeStoredReliability(
            { assetClass: asset.assetClass, details },
            { method, valuatedAt: initial.valuatedAt, source: initial.source ?? null }
          )
        }
      });
    }
    return asset;
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.ASSET_CREATED,
    entityType: 'Asset',
    entityId: created.id,
    payload: { assetClass: created.assetClass }
  });
  return assetDtoById(tenantId, created.id);
}

export async function listAssets(tenantId: string, query: ListAssetsQuery): Promise<AssetDto[]> {
  const rows = await prisma.asset.findMany({
    where: {
      tenantId,
      ...(query.assetClass ? { assetClass: query.assetClass } : {}),
      // Sans filtre : tout sauf les actifs archivés.
      status: query.status ?? { not: 'ARCHIVED' as const },
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {})
    },
    include: ASSET_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: LIST_ASSETS_HARD_LIMIT
  });
  return toAssetDtos(tenantId, rows);
}

export async function getAsset(tenantId: string, assetId: string): Promise<AssetDto> {
  return assetDtoById(tenantId, assetId);
}

function moneyPatch(
  existing: AssetRow,
  input: UpdateAssetInput
): { currency?: string; exchangeRateToXof?: number | null } {
  if (input.currency === undefined && input.exchangeRateToXof === undefined) return {};
  const rate =
    input.exchangeRateToXof !== undefined
      ? input.exchangeRateToXof
      : existing.exchangeRateToXof === null
        ? null
        : num(existing.exchangeRateToXof);
  return resolveCurrency(input.currency ?? existing.currency, rate);
}

/** Refuse un changement de devise qui laisserait des lignes dans une devise que le taux de l'actif ne convertit plus. */
async function assertNoStrandedCurrencyLines(tenantId: string, asset: AssetRow, newCurrency: string): Promise<void> {
  const where = { tenantId, ...assetScopeWhere(asset), currency: { notIn: [newCurrency, BASE_CURRENCY] } };
  const [valuations, loans] = await Promise.all([
    prisma.assetValuation.count({ where }),
    prisma.propertyLoan.count({ where })
  ]);
  if (valuations + loans > 0) throw new ConflictError(CURRENCY_CHANGE_MESSAGE);
}

export async function updateAsset(
  tenantId: string,
  assetId: string,
  input: UpdateAssetInput,
  actorUserId?: string
): Promise<AssetDto> {
  const existing = await findAssetOrThrow(tenantId, assetId);
  assertNotArchived(existing);
  const money = moneyPatch(existing, input);
  if (money.currency !== undefined) await assertNoStrandedCurrencyLines(tenantId, existing, money.currency);
  const details = input.details === undefined ? undefined : validateAssetDetails(existing.assetClass, input.details);
  await assertBelongsToTenant(prisma, 'holdingEntity', input.holdingEntityId, tenantId, { message: NOT_FOUND_ENTITY });

  await prisma.asset.update({
    where: { id: assetId, tenantId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...money,
      ...(input.acquisitionCost !== undefined ? { acquisitionCost: input.acquisitionCost } : {}),
      ...(input.acquisitionDate !== undefined ? { acquisitionDate: input.acquisitionDate } : {}),
      ...(input.holdingEntityId !== undefined ? { holdingEntityId: input.holdingEntityId } : {}),
      ...(details !== undefined
        ? { details: details as Prisma.InputJsonValue, detailsVersion: ASSET_DETAILS_VERSION }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {})
    }
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.ASSET_UPDATED,
    entityType: 'Asset',
    entityId: assetId,
    payload: { assetClass: existing.assetClass, changedFields: changedFields(input) }
  });
  return assetDtoById(tenantId, assetId);
}

export async function disposeAsset(
  tenantId: string,
  assetId: string,
  disposedAt: Date,
  actorUserId?: string
): Promise<AssetDto> {
  const result = await prisma.asset.updateMany({
    where: { id: assetId, tenantId, status: 'ACTIVE' },
    data: { status: 'DISPOSED', disposedAt }
  });
  if (result.count === 0) {
    await findAssetOrThrow(tenantId, assetId);
    throw new ConflictError("Cet actif n'est plus actif : il ne peut pas être cédé.");
  }
  auditPatrimoine({ tenantId, actorUserId, action: AUDIT.ASSET_DISPOSED, entityType: 'Asset', entityId: assetId });
  return assetDtoById(tenantId, assetId);
}

export async function archiveAsset(tenantId: string, assetId: string, actorUserId?: string): Promise<AssetDto> {
  const result = await prisma.asset.updateMany({
    where: { id: assetId, tenantId, status: { in: ['ACTIVE', 'DISPOSED'] } },
    data: { status: 'ARCHIVED' }
  });
  if (result.count === 0) {
    await findAssetOrThrow(tenantId, assetId);
    throw new ConflictError('Cet actif est déjà archivé.');
  }
  auditPatrimoine({ tenantId, actorUserId, action: AUDIT.ASSET_ARCHIVED, entityType: 'Asset', entityId: assetId });
  return assetDtoById(tenantId, assetId);
}

// ---------------------------------------------------------------- Valorisations

export async function listAssetValuations(tenantId: string, assetId: string): Promise<AssetValuationDto[]> {
  const asset = await findAssetOrThrow(tenantId, assetId);
  const rows = await prisma.assetValuation.findMany({
    where: { tenantId, ...assetScopeWhere(asset) },
    select: VALUATION_SELECT,
    orderBy: [{ valuatedAt: 'desc' }, { createdAt: 'desc' }]
  });
  return rows.map(row => toValuationDto(row, asset));
}

export async function createAssetValuation(
  tenantId: string,
  assetId: string,
  input: CreateValuationInput,
  actorUserId?: string
): Promise<AssetValuationDto> {
  const asset = await findAssetOrThrow(tenantId, assetId);
  assertNotArchived(asset);
  await assertValuationQuota(tenantId, asset);
  const currency = input.currency ?? asset.currency;
  assertLineCurrency(asset, currency);
  const method = verifiedMethod(suggestInputOf(asset), await lastValuationBefore(tenantId, asset, input.valuatedAt), {
    method: input.method ?? 'MANUAL',
    valuatedAt: input.valuatedAt,
    estimatedValue: input.estimatedValue,
    currency
  });
  const reliability = computeStoredReliability(asset, {
    method,
    valuatedAt: input.valuatedAt,
    source: input.source ?? null
  });
  const row = await prisma.assetValuation.create({
    data: {
      tenantId,
      ...assetScopeData(asset),
      valuatedAt: input.valuatedAt,
      estimatedValue: input.estimatedValue,
      currency,
      method,
      source: input.source ?? null,
      notes: input.notes ?? null,
      ...reliability
    },
    select: VALUATION_SELECT
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.VALUATION_CREATED,
    entityType: 'AssetValuation',
    entityId: row.id,
    payload: { assetId: asset.id }
  });
  return toValuationDto(row, asset);
}

/** Champs de l'actif utiles au recalcul d'une suggestion. */
function suggestInputOf(
  asset: Pick<
    AssetRow,
    'assetClass' | 'currency' | 'exchangeRateToXof' | 'details' | 'acquisitionCost' | 'acquisitionDate'
  >
): SuggestAssetInput {
  return {
    assetClass: asset.assetClass,
    currency: asset.currency,
    exchangeRateToXof: asset.exchangeRateToXof === null ? null : num(asset.exchangeRateToXof),
    details: asset.details,
    acquisitionCost: asset.acquisitionCost === null ? null : num(asset.acquisitionCost),
    acquisitionDate: asset.acquisitionDate
  };
}

/** Dernière valorisation strictement antérieure à `before` (hors la ligne `excludeId`), base du recalcul d'une méthode calculée. */
async function lastValuationBefore(
  tenantId: string,
  asset: AssetRow,
  before: Date,
  excludeId?: string
): Promise<SuggestLastValuation | null> {
  const row = await prisma.assetValuation.findFirst({
    where: {
      tenantId,
      ...assetScopeWhere(asset),
      valuatedAt: { lt: before },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { valuatedAt: true, estimatedValue: true, currency: true },
    orderBy: [{ valuatedAt: 'desc' }, { createdAt: 'desc' }]
  });
  return row ? { valuatedAt: row.valuatedAt, estimatedValue: num(row.estimatedValue), currency: row.currency } : null;
}

async function findValuationOrThrow(tenantId: string, asset: AssetRow, valuationId: string) {
  const row = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, ...assetScopeWhere(asset) },
    select: { id: true, valuatedAt: true, method: true, source: true, estimatedValue: true, currency: true }
  });
  if (!row) throw new NotFoundError(NOT_FOUND_VALUATION);
  return row;
}

export async function updateAssetValuation(
  tenantId: string,
  assetId: string,
  valuationId: string,
  input: UpdateValuationInput,
  actorUserId?: string
): Promise<AssetValuationDto> {
  const asset = await findAssetOrThrow(tenantId, assetId);
  assertNotArchived(asset);
  const existing = await findValuationOrThrow(tenantId, asset, valuationId);
  if (input.currency !== undefined) assertLineCurrency(asset, input.currency);
  // Ligne fusionnée avec le PATCH : elle sert à la source d'une expertise, à la vérification d'une
  // méthode calculée et à la fiabilité ; le corps ne peut jamais fixer la fiabilité (schéma strict).
  const merged = {
    method: input.method ?? existing.method,
    valuatedAt: input.valuatedAt ?? existing.valuatedAt,
    estimatedValue: input.estimatedValue ?? num(existing.estimatedValue),
    currency: input.currency ?? existing.currency,
    source: input.source !== undefined ? input.source : existing.source
  };
  if (merged.method === 'EXPERT_APPRAISAL' && !merged.source) {
    throw fieldError('source', EXPERT_SOURCE_MESSAGE);
  }
  // Un montant, une date, une devise ou une méthode retouchés relancent la vérification d'une méthode calculée.
  const touched =
    input.method !== undefined ||
    input.estimatedValue !== undefined ||
    input.valuatedAt !== undefined ||
    input.currency !== undefined;
  const method = touched
    ? verifiedMethod(
        suggestInputOf(asset),
        await lastValuationBefore(tenantId, asset, merged.valuatedAt, valuationId),
        merged
      )
    : merged.method;
  const reliability = computeStoredReliability(asset, {
    method,
    valuatedAt: merged.valuatedAt,
    source: merged.source
  });
  const row = await prisma.assetValuation.update({
    where: { id: valuationId, tenantId },
    data: {
      ...(input.valuatedAt !== undefined ? { valuatedAt: input.valuatedAt } : {}),
      ...(input.estimatedValue !== undefined ? { estimatedValue: input.estimatedValue } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.method !== undefined || method !== existing.method ? { method } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...reliability
    },
    select: VALUATION_SELECT
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.VALUATION_UPDATED,
    entityType: 'AssetValuation',
    entityId: valuationId,
    payload: { assetId: asset.id, changedFields: changedFields(input) }
  });
  return toValuationDto(row, asset);
}

export async function deleteAssetValuation(
  tenantId: string,
  assetId: string,
  valuationId: string,
  actorUserId?: string
): Promise<void> {
  const asset = await findAssetOrThrow(tenantId, assetId);
  assertNotArchived(asset);
  await findValuationOrThrow(tenantId, asset, valuationId);
  await prisma.assetValuation.delete({ where: { id: valuationId, tenantId } });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.VALUATION_DELETED,
    entityType: 'AssetValuation',
    entityId: valuationId,
    payload: { assetId: asset.id }
  });
}

/**
 * Suggestion de valeur (lot 2) : lecture seule, rien n'est écrit ni audité. La
 * dernière valorisation vient des lignes de l'actif (celles du bien pour un
 * actif immobilier lié) ; le statut juridique n'intervient pas.
 */
export async function suggestAssetValuation(
  tenantId: string,
  assetId: string,
  query: { asOf?: string }
): Promise<SuggestResponse> {
  const asset = await findAssetOrThrow(tenantId, assetId);
  const asOf = query.asOf ? parseDay(query.asOf, 'asOf') : new Date();
  const rows = await prisma.assetValuation.findMany({
    where: { tenantId, ...assetScopeWhere(asset) },
    select: VALUATION_SELECT,
    orderBy: [{ valuatedAt: 'asc' }, { createdAt: 'asc' }]
  });
  const last = currentValueAt(
    {
      valuations: rows.map(v => ({
        valuatedAt: v.valuatedAt,
        estimatedValue: num(v.estimatedValue),
        currency: v.currency
      }))
    },
    asOf
  );
  return buildSuggestion(suggestInputOf(asset), last, asOf);
}

// ---------------------------------------------------------------- Dettes

/** Actifs immobiliers liés à un bien, par bien : sert à retrouver l'actif d'un prêt posé sur un bien. */
async function assetIdsByProperty(tenantId: string): Promise<Map<string, string>> {
  const rows = await prisma.asset.findMany({
    where: { tenantId, propertyId: { not: null } },
    select: { id: true, propertyId: true }
  });
  return new Map(rows.flatMap(r => (r.propertyId ? [[r.propertyId, r.id] as [string, string]] : [])));
}

async function debtsWhere(tenantId: string, query: ListDebtsQuery, byProperty: Map<string, string>) {
  if (query.assetId && query.unattached === 'true') {
    throw new BadRequestError('Les filtres assetId et unattached ne se combinent pas.');
  }
  if (query.assetId) return { tenantId, ...assetScopeWhere(await findAssetOrThrow(tenantId, query.assetId)) };
  if (query.unattached === 'true') return { tenantId, propertyId: null, assetId: null };
  // Un prêt d'un bien SANS actif relève des routes du bien : hors de cette liste.
  return {
    tenantId,
    OR: [
      { propertyId: null, assetId: null },
      { assetId: { not: null } },
      { propertyId: { in: Array.from(byProperty.keys()) } }
    ]
  };
}

export async function listDebts(tenantId: string, query: ListDebtsQuery): Promise<DebtDto[]> {
  const byProperty = await assetIdsByProperty(tenantId);
  const where = await debtsWhere(tenantId, query, byProperty);
  const rows = await prisma.propertyLoan.findMany({
    where,
    select: LOAN_SELECT,
    orderBy: [{ startDate: 'desc' }, { id: 'asc' }]
  });
  return rows.map(row =>
    toDebtDto(row, row.assetId ?? (row.propertyId ? (byProperty.get(row.propertyId) ?? null) : null))
  );
}

/** Actif d'une dette existante ; nul pour une dette personnelle. Un prêt d'un bien sans actif est introuvable ici. */
async function assetOfLoan(tenantId: string, loan: LoanRow): Promise<AssetRow | null> {
  if (!loan.assetId && !loan.propertyId) return null;
  const asset = await prisma.asset.findFirst({
    where: { tenantId, ...(loan.assetId ? { id: loan.assetId } : { propertyId: loan.propertyId }) },
    include: ASSET_INCLUDE
  });
  if (!asset) throw new NotFoundError(NOT_FOUND_DEBT);
  return asset;
}

function assertDebtCurrency(asset: AssetRow | null, currency: string): void {
  if (asset) return assertLineCurrency(asset, currency);
  if (currency !== BASE_CURRENCY) {
    throw fieldError('currency', 'Une dette personnelle est exprimée en XOF.');
  }
}

/** Cohérence d'une dette complète (création, ou ligne existante fusionnée avec un PATCH). */
function assertDebtConsistency(debt: {
  capitalAmount: number;
  remainingCapital: number;
  startDate: Date;
  endDate: Date;
}): void {
  if (debt.remainingCapital > debt.capitalAmount) {
    throw fieldError('remainingCapital', 'Le capital restant dû ne peut pas dépasser le capital emprunté.');
  }
  if (debt.endDate.getTime() < debt.startDate.getTime()) {
    throw fieldError('endDate', 'La date de fin doit suivre la date de début.');
  }
}

export async function createDebt(tenantId: string, input: CreateDebtInput, actorUserId?: string): Promise<DebtDto> {
  const asset = input.assetId ? await findAssetOrThrow(tenantId, input.assetId) : null;
  if (asset) {
    assertNotArchived(asset);
    if (asset.status === 'DISPOSED') {
      throw new ConflictError('Cet actif est cédé : une nouvelle dette ne peut pas lui être rattachée.');
    }
  }
  assertDebtConsistency(input);
  const currency = input.currency ?? asset?.currency ?? BASE_CURRENCY;
  assertDebtCurrency(asset, currency);
  const row = await prisma.propertyLoan.create({
    data: {
      tenantId,
      ...(asset ? assetScopeData(asset) : {}),
      lender: input.lender,
      capitalAmount: input.capitalAmount,
      remainingCapital: input.remainingCapital,
      interestRate: input.interestRate,
      monthlyPayment: input.monthlyPayment,
      currency,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? 'ACTIVE'
    },
    select: LOAN_SELECT
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.DEBT_CREATED,
    entityType: 'PropertyLoan',
    entityId: row.id,
    payload: { assetId: asset?.id ?? null }
  });
  return toDebtDto(row, asset?.id ?? null);
}

async function findLoanOrThrow(tenantId: string, debtId: string): Promise<LoanRow> {
  const loan = await prisma.propertyLoan.findFirst({ where: { id: debtId, tenantId }, select: LOAN_SELECT });
  if (!loan) throw new NotFoundError(NOT_FOUND_DEBT);
  return loan;
}

export async function updateDebt(
  tenantId: string,
  debtId: string,
  input: UpdateDebtInput,
  actorUserId?: string
): Promise<DebtDto> {
  const loan = await findLoanOrThrow(tenantId, debtId);
  const asset = await assetOfLoan(tenantId, loan);
  if (asset) assertNotArchived(asset);
  if (input.currency !== undefined) assertDebtCurrency(asset, input.currency);
  assertDebtConsistency({
    capitalAmount: input.capitalAmount ?? num(loan.capitalAmount),
    remainingCapital: input.remainingCapital ?? num(loan.remainingCapital),
    startDate: input.startDate ?? loan.startDate,
    endDate: input.endDate ?? loan.endDate
  });
  const row = await prisma.propertyLoan.update({
    where: { id: debtId, tenantId },
    data: {
      ...(input.lender !== undefined ? { lender: input.lender } : {}),
      ...(input.capitalAmount !== undefined ? { capitalAmount: input.capitalAmount } : {}),
      ...(input.remainingCapital !== undefined ? { remainingCapital: input.remainingCapital } : {}),
      ...(input.interestRate !== undefined ? { interestRate: input.interestRate } : {}),
      ...(input.monthlyPayment !== undefined ? { monthlyPayment: input.monthlyPayment } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    },
    select: LOAN_SELECT
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.DEBT_UPDATED,
    entityType: 'PropertyLoan',
    entityId: debtId,
    payload: { assetId: asset?.id ?? null, changedFields: changedFields(input) }
  });
  return toDebtDto(row, asset?.id ?? null);
}

export async function deleteDebt(tenantId: string, debtId: string, actorUserId?: string): Promise<void> {
  const loan = await findLoanOrThrow(tenantId, debtId);
  const asset = await assetOfLoan(tenantId, loan);
  if (asset) assertNotArchived(asset);
  await prisma.propertyLoan.delete({ where: { id: debtId, tenantId } });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.DEBT_DELETED,
    entityType: 'PropertyLoan',
    entityId: debtId,
    payload: { assetId: asset?.id ?? null }
  });
}

// ---------------------------------------------------------------- Parts détenues (actifs non immobiliers)

async function findNonRealEstateAsset(tenantId: string, assetId: string): Promise<AssetRow> {
  const asset = await findAssetOrThrow(tenantId, assetId);
  if (asset.propertyId) {
    throw new BadRequestError(
      "Les parts d'un actif immobilier se gèrent depuis les entités détentrices " +
        '(routes /patrimoine/entities/:entityId/holdings et /properties/:propertyId/holdings).'
    );
  }
  return asset;
}

const HOLDING_INCLUDE = { entity: { select: { id: true, name: true } } } satisfies Prisma.PropertyHoldingInclude;
type HoldingRow = Prisma.PropertyHoldingGetPayload<{ include: typeof HOLDING_INCLUDE }>;

function toHoldingDto(row: HoldingRow, assetId: string): AssetHoldingDto {
  return {
    id: row.id,
    assetId,
    entityId: row.entityId,
    entityName: row.entity.name,
    sharePercent: num(row.sharePercent),
    effectiveFrom: row.effectiveFrom ? isoDay(row.effectiveFrom) : null,
    notes: row.notes
  };
}

export async function listAssetHoldings(tenantId: string, assetId: string): Promise<AssetHoldingDto[]> {
  const asset = await findNonRealEstateAsset(tenantId, assetId);
  const rows = await prisma.propertyHolding.findMany({
    where: { tenantId, assetId: asset.id },
    include: HOLDING_INCLUDE,
    orderBy: { createdAt: 'asc' }
  });
  return rows.map(row => toHoldingDto(row, asset.id));
}

async function assertShareWithinLimit(tx: Tx, tenantId: string, assetId: string, entityId: string, share: number) {
  const others = await tx.propertyHolding.aggregate({
    where: { tenantId, assetId, entityId: { not: entityId } },
    _sum: { sharePercent: true }
  });
  const total = (others._sum.sharePercent ? num(others._sum.sharePercent) : 0) + share;
  if (total > 100 + 0.0001) {
    throw fieldError(
      'sharePercent',
      `La somme des quotes-parts dépasse 100 % (${total.toFixed(4).replace(/\.?0+$/, '')} %).`
    );
  }
}

/**
 * Verrou pessimiste sur la ligne de l'actif (`FOR UPDATE`, `$queryRaw` tagué),
 * comme `setPropertyHoldings` : deux PUT concurrents se sérialisent, la somme
 * des 100 % est relue puis écrite dans la même transaction. Le statut est relu
 * sous verrou pour qu'un archivage concurrent ne laisse pas passer l'écriture.
 */
async function lockAssetTx(tx: Tx, tenantId: string, assetId: string): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM assets WHERE id = ${assetId}::uuid AND tenant_id = ${tenantId} FOR UPDATE
  `;
  if (locked.length === 0) throw new NotFoundError(NOT_FOUND_ASSET);
  assertNotArchived({ status: locked[0].status as AssetRow['status'] });
}

export async function setAssetHolding(
  tenantId: string,
  assetId: string,
  entityId: string,
  input: SetHoldingInput,
  actorUserId?: string
): Promise<AssetHoldingDto> {
  const asset = await findNonRealEstateAsset(tenantId, assetId);
  assertNotArchived(asset);
  await assertBelongsToTenant(prisma, 'holdingEntity', entityId, tenantId, { message: NOT_FOUND_ENTITY });

  const values = {
    sharePercent: input.sharePercent,
    ...(input.effectiveFrom !== undefined ? { effectiveFrom: input.effectiveFrom } : {}),
    updatedByUserId: actorUserId ?? null
  };
  const row = await prisma.$transaction(async tx => {
    await lockAssetTx(tx, tenantId, asset.id);
    await assertShareWithinLimit(tx, tenantId, asset.id, entityId, input.sharePercent);
    const existing = await tx.propertyHolding.findFirst({
      where: { tenantId, assetId: asset.id, entityId },
      select: { id: true }
    });
    return existing
      ? tx.propertyHolding.update({ where: { id: existing.id, tenantId }, data: values, include: HOLDING_INCLUDE })
      : tx.propertyHolding.create({
          data: { tenantId, assetId: asset.id, entityId, ...values },
          include: HOLDING_INCLUDE
        });
  });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.HOLDING_SET,
    entityType: 'PropertyHolding',
    entityId: row.id,
    payload: { assetId: asset.id, entityId }
  });
  return toHoldingDto(row, asset.id);
}

export async function deleteAssetHolding(
  tenantId: string,
  assetId: string,
  entityId: string,
  actorUserId?: string
): Promise<void> {
  const asset = await findNonRealEstateAsset(tenantId, assetId);
  assertNotArchived(asset);
  const existing = await prisma.propertyHolding.findFirst({
    where: { tenantId, assetId: asset.id, entityId },
    select: { id: true }
  });
  if (!existing) throw new NotFoundError('Part détenue introuvable.');
  await prisma.propertyHolding.delete({ where: { id: existing.id, tenantId } });
  auditPatrimoine({
    tenantId,
    actorUserId,
    action: AUDIT.HOLDING_DELETED,
    entityType: 'PropertyHolding',
    entityId: existing.id,
    payload: { assetId: asset.id, entityId }
  });
}

// ---------------------------------------------------------------- Valeur nette

const HISTORY_MAX_POINTS = 60;
const HISTORY_DEFAULT_MONTHS = 12;
const END_OF_DAY_MS = 24 * 60 * 60 * 1000 - 1;

function parseDay(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDay(date) !== value) throw fieldError(field, 'Date inexistante.');
  return date;
}

function todayUtc(): Date {
  return parseDay(isoDay(new Date()), 'asOf');
}

/** Même jour, `months` mois plus tôt, ramené au dernier jour du mois cible si besoin (31 mars -> 28 février). */
function monthsBefore(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

/** Un point par mois en remontant depuis `to`, jusqu'à `from` inclus ; au plus 60 points. */
export function buildHistoryDates(from: Date | null, to: Date): Date[] {
  const start = from ?? monthsBefore(to, HISTORY_DEFAULT_MONTHS - 1);
  if (start.getTime() > to.getTime()) throw fieldError('from', 'La date de début doit précéder la date de fin.');
  const dates: Date[] = [];
  for (let i = 0; i <= HISTORY_MAX_POINTS; i += 1) {
    const date = monthsBefore(to, i);
    if (date.getTime() < start.getTime()) break;
    dates.push(date);
  }
  if (dates.length > HISTORY_MAX_POINTS) {
    throw fieldError('from', `La période dépasse ${HISTORY_MAX_POINTS} mois.`);
  }
  return dates.reverse();
}

/** Colonnes strictement nécessaires au calcul de valeur nette (pas de jointure, pas de `details`/`notes`). */
export const NET_WORTH_ASSET_SELECT = {
  id: true,
  name: true,
  assetClass: true,
  status: true,
  currency: true,
  exchangeRateToXof: true,
  disposedAt: true,
  propertyId: true,
  details: true
} satisfies Prisma.AssetSelect;

type NetWorthAssetRow = Prisma.AssetGetPayload<{ select: typeof NET_WORTH_ASSET_SELECT }>;

/** Valorisations des actifs non archivés (un actif archivé est exclu du calcul), en une requête, triées. */
export async function loadNetWorthValuations(tenantId: string, assets: NetWorthAssetRow[]) {
  const filters = scopeFilters(assets.filter(a => a.status !== 'ARCHIVED'));
  if (filters.length === 0) return new Map<string, NetWorthValuationRow[]>();
  const rows = await prisma.assetValuation.findMany({
    where: { tenantId, OR: filters },
    select: NET_WORTH_VALUATION_SELECT,
    orderBy: [{ valuatedAt: 'asc' }, { createdAt: 'asc' }]
  });
  return groupByKey(rows);
}

const NET_WORTH_VALUATION_SELECT = {
  assetId: true,
  propertyId: true,
  valuatedAt: true,
  estimatedValue: true,
  currency: true,
  method: true,
  source: true,
  reliability: true
} satisfies Prisma.AssetValuationSelect;

type NetWorthValuationRow = Prisma.AssetValuationGetPayload<{ select: typeof NET_WORTH_VALUATION_SELECT }>;

interface NetWorthData {
  assets: NetWorthAssetInput[];
  loans: NetWorthLoanInput[];
}

async function loadNetWorthLoans(tenantId: string, assets: NetWorthAssetRow[]): Promise<NetWorthLoanInput[]> {
  const byProperty = new Map(
    assets.flatMap(a => (a.propertyId ? [[a.propertyId, a] as [string, NetWorthAssetRow]] : []))
  );
  const rows = await prisma.propertyLoan.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: LOAN_SELECT
  });
  const byId = new Map(assets.map(a => [a.id, a]));
  return rows.flatMap(row => {
    const asset = row.assetId ? byId.get(row.assetId) : row.propertyId ? byProperty.get(row.propertyId) : null;
    // Un prêt d'un bien SANS actif n'est pas compté ; une dette personnelle l'est.
    if ((row.assetId || row.propertyId) && !asset) return [];
    return [
      {
        id: row.id,
        assetId: asset?.id ?? null,
        remainingCapital: num(row.remainingCapital),
        currency: row.currency,
        status: row.status,
        exchangeRateToXof: asset?.exchangeRateToXof == null ? null : num(asset.exchangeRateToXof)
      }
    ];
  });
}

/** `reliabilityAt` : date à laquelle l'ancienneté des valorisations est jugée (fiabilité effective). */
async function loadNetWorthData(tenantId: string, reliabilityAt: Date): Promise<NetWorthData> {
  const rows = await prisma.asset.findMany({ where: { tenantId }, select: NET_WORTH_ASSET_SELECT });
  const [valuations, loans] = await Promise.all([
    loadNetWorthValuations(tenantId, rows),
    loadNetWorthLoans(tenantId, rows)
  ]);
  const assets: NetWorthAssetInput[] = rows.map(asset => ({
    id: asset.id,
    name: asset.name,
    assetClass: asset.assetClass,
    status: asset.status,
    currency: asset.currency,
    exchangeRateToXof: asset.exchangeRateToXof === null ? null : num(asset.exchangeRateToXof),
    disposedAt: asset.disposedAt,
    valuations: (valuations.get(scopeKey(asset)) ?? []).map(v => ({
      valuatedAt: v.valuatedAt,
      estimatedValue: num(v.estimatedValue),
      currency: v.currency,
      reliability: effectiveReliability(asset, v, reliabilityAt).reliability
    }))
  }));
  return { assets, loans };
}

/** Un jour est compté en entier : une valorisation datée ce jour-là, à n'importe quelle heure, en fait partie. */
const endOfDay = (day: Date): Date => new Date(day.getTime() + END_OF_DAY_MS);

export async function getNetWorth(tenantId: string, query: { asOf?: string }): Promise<NetWorthResult> {
  const day = query.asOf ? parseDay(query.asOf, 'asOf') : todayUtc();
  const { assets, loans } = await loadNetWorthData(tenantId, endOfDay(day));
  return { ...computeNetWorth(assets, loans, endOfDay(day)), asOf: day };
}

export interface NetWorthHistoryPointDto {
  date: string;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
}

export async function getNetWorthHistory(
  tenantId: string,
  query: { from?: string; to?: string }
): Promise<NetWorthHistoryPointDto[]> {
  const to = query.to ? parseDay(query.to, 'to') : todayUtc();
  const from = query.from ? parseDay(query.from, 'from') : null;
  const dates = buildHistoryDates(from, to);
  const { assets, loans } = await loadNetWorthData(tenantId, new Date());
  return computeNetWorthHistory(assets, loans, dates.map(endOfDay)).map((point, index) => ({
    date: isoDay(dates[index]),
    totalAssets: point.totalAssets,
    totalDebts: point.totalDebts,
    netWorth: point.netWorth
  }));
}
