import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { roundMoneyXof } from '../../lib/finance/money';
import { computeNetWorth, toXof } from '../../lib/patrimoine/assets';
import type { NetWorthAssetInput } from '../../lib/patrimoine/assets';
import type { ProjectionAssetInput, ProjectionInput, ProjectionLoanInput } from '../../lib/patrimoine/projection';
import { NET_WORTH_ASSET_SELECT, loadNetWorthValuations, scopeKey } from '../patrimoine-assets-service';
import { effectiveReliability } from '../patrimoine-assets/reliability-view';

/**
 * Charge le patrimoine actuel d'une agence sous la forme attendue par le domaine
 * de projection (`lib/patrimoine/projection`). Lecture seule, TOUT filtré par
 * `tenantId`, un nombre constant de requêtes (actifs, valorisations, dettes).
 *
 * Règles alignées sur la valeur nette du lot 1 :
 * - actifs ACTIVE comptés, valeur = dernière valorisation convertie en XOF au taux
 *   de l'actif (`valueXof: null` sans valeur ou sans taux) ; les valorisations
 *   d'un actif immobilier lié à un bien sont celles du bien ;
 * - dettes ACTIVE adossées à un actif ou au bien d'un actif, ou personnelles ; un
 *   prêt d'un bien sans actif n'est pas compté ; une dette en devise étrangère
 *   est convertie au taux de l'actif, sinon exclue (dette personnelle : XOF seul) ;
 * - seuls les actifs ACTIVE, ceux cités par une opération (UUID valides) et ceux
 *   qui portent une dette chargée sont lus ; au plus MAX_LOADED_LOANS dettes ;
 * - un véhicule dont les `details` portent une durée d'utilité reçoit
 *   `annuityXof` et `residualValueXof` dérivés du coût d'acquisition, comme le
 *   lot 2 (`valuation-methods.ts`) ;
 * - un actif cédé ou archivé n'entre pas dans la projection : il n'est transmis
 *   (statut `ARCHIVED`, sans valeur) que si une opération le nomme, pour que le
 *   domaine réponde `ASSET_NOT_ACTIVE` plutôt que `ASSET_NOT_FOUND`.
 * Un identifiant d'une autre agence n'est jamais chargé : il est donc
 * indiscernable d'un identifiant inexistant.
 */

export interface LoadedProjectionInput {
  input: ProjectionInput;
  /** Part de la valeur de départ peu fiable, de 0 à 100 (calcul du lot 2 de la valeur nette). */
  lowReliabilityShare: number;
}

const ASSET_SELECT = { ...NET_WORTH_ASSET_SELECT, acquisitionCost: true } satisfies Prisma.AssetSelect;

type AssetRow = Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>;
type LoanRow = Prisma.PropertyLoanGetPayload<{ select: typeof LOAN_SELECT }>;

/** Plafond de dettes chargées par calcul (le calcul coûte plus cher qu'une lecture). */
export const MAX_LOADED_LOANS = 2000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const LOAN_SELECT = {
  id: true,
  assetId: true,
  propertyId: true,
  remainingCapital: true,
  interestRate: true,
  monthlyPayment: true,
  currency: true,
  endDate: true,
  status: true
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function endOfDayUtc(date: Date): Date {
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(start + MS_PER_DAY - 1);
}

const num = (value: { toString(): string } | number): number => Number(value);

function numberDetail(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Clés d'amortissement que le domaine attend (`project.ts`), dérivées du coût
 * d'acquisition comme le lot 2 : résiduelle = coût × résiduel %, annuité =
 * (coût − résiduelle) / durée d'utilité. Une clé déjà présente n'est jamais
 * écrasée ; sans coût connu (en XOF), les `details` restent tels quels.
 */
export function withDerivedDepreciation(asset: AssetRow, details: Record<string, unknown>): Record<string, unknown> {
  if (asset.assetClass !== 'VEHICLE_EQUIPMENT' || asset.acquisitionCost === null) return details;
  const rate = asset.exchangeRateToXof === null ? null : num(asset.exchangeRateToXof);
  const cost = toXof(num(asset.acquisitionCost), asset.currency, rate);
  if (cost === null || !(cost > 0)) return details;
  const declining = details.depreciationMethod === 'DECLINING';
  const life = numberDetail(details, 'usefulLifeYears');
  if (!declining && (life === null || life <= 0)) return details;
  const percent = numberDetail(details, 'residualValuePercent') ?? 0;
  const residual = (cost * percent) / 100;
  const derived: Record<string, number> = { residualValueXof: residual };
  if (!declining && life !== null) derived.annuityXof = (cost - residual) / life;
  return { ...derived, ...details };
}

function toNetWorthAssets(
  active: AssetRow[],
  valuations: Awaited<ReturnType<typeof loadNetWorthValuations>>,
  asOf: Date
): NetWorthAssetInput[] {
  return active.map(asset => ({
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
      reliability: effectiveReliability(asset, v, asOf).reliability
    }))
  }));
}

function toProjectionAssets(
  rows: AssetRow[],
  figures: Map<string, { valueXof: number; valuatedAt: Date }>,
  referencedAssetIds: ReadonlySet<string>
): ProjectionAssetInput[] {
  const assets: ProjectionAssetInput[] = [];
  for (const asset of rows) {
    if (asset.status === 'ACTIVE') {
      const figure = figures.get(asset.id);
      assets.push({
        id: asset.id,
        name: asset.name,
        assetClass: asset.assetClass,
        status: 'ACTIVE',
        valueXof: figure ? figure.valueXof : null,
        details: withDerivedDepreciation(asset, (asset.details ?? {}) as Record<string, unknown>),
        lastValuedAt: figure ? figure.valuatedAt : null
      });
    } else if (referencedAssetIds.has(asset.id)) {
      assets.push({
        id: asset.id,
        name: asset.name,
        assetClass: asset.assetClass,
        status: 'ARCHIVED',
        valueXof: null,
        details: {},
        lastValuedAt: null
      });
    }
  }
  return assets;
}

function toProjectionLoans(loanRows: LoanRow[], rows: AssetRow[]): ProjectionLoanInput[] {
  const byId = new Map(rows.map(asset => [asset.id, asset]));
  const byProperty = new Map(rows.flatMap(asset => (asset.propertyId ? [[asset.propertyId, asset] as const] : [])));
  const loans: ProjectionLoanInput[] = [];
  for (const row of loanRows) {
    const asset = row.assetId ? byId.get(row.assetId) : row.propertyId ? byProperty.get(row.propertyId) : null;
    // Un prêt d'un bien SANS actif n'est pas compté ; une dette personnelle l'est.
    if ((row.assetId || row.propertyId) && !asset) continue;
    const rate = asset?.exchangeRateToXof == null ? null : num(asset.exchangeRateToXof);
    const capital = toXof(num(row.remainingCapital), row.currency, rate);
    const payment = toXof(num(row.monthlyPayment), row.currency, rate);
    if (capital === null || payment === null) continue;
    loans.push({
      id: row.id,
      assetId: asset?.id ?? null,
      remainingCapital: roundMoneyXof(capital),
      annualRatePercent: num(row.interestRate),
      monthlyPayment: roundMoneyXof(payment),
      endDate: row.endDate,
      status: row.status
    });
  }
  return loans;
}

/** Actifs à lire : actifs ACTIVE, actifs cités (UUID valides) et actifs qui portent une dette chargée. */
function assetFilter(tenantId: string, cited: ReadonlySet<string>, loanRows: LoanRow[]): Prisma.AssetWhereInput {
  const ids = new Set([...cited].filter(isUuid));
  for (const loan of loanRows) if (loan.assetId) ids.add(loan.assetId);
  const propertyIds = [...new Set(loanRows.flatMap(loan => (loan.propertyId ? [loan.propertyId] : [])))];
  const or: Prisma.AssetWhereInput[] = [{ status: 'ACTIVE' }];
  if (ids.size > 0) or.push({ id: { in: [...ids] } });
  if (propertyIds.length > 0) or.push({ propertyId: { in: propertyIds } });
  return { tenantId, OR: or };
}

export async function loadProjectionInput(
  tenantId: string,
  referencedAssetIds: ReadonlySet<string> = new Set()
): Promise<LoadedProjectionInput> {
  const today = new Date();
  const asOf = endOfDayUtc(today);
  const loanRows = await prisma.propertyLoan.findMany({
    where: { tenantId, status: 'ACTIVE' },
    select: LOAN_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_LOADED_LOANS
  });
  const rows = await prisma.asset.findMany({
    where: assetFilter(tenantId, referencedAssetIds, loanRows),
    select: ASSET_SELECT
  });
  const active = rows.filter(row => row.status === 'ACTIVE');
  const valuations = await loadNetWorthValuations(tenantId, active);
  const netWorth = computeNetWorth(toNetWorthAssets(active, valuations, asOf), [], asOf);
  const figures = new Map(netWorth.assets.map(entry => [entry.id, entry]));

  return {
    input: {
      today,
      assets: toProjectionAssets(rows, figures, referencedAssetIds),
      loans: toProjectionLoans(loanRows, rows)
    },
    lowReliabilityShare: netWorth.lowReliabilityShare
  };
}
