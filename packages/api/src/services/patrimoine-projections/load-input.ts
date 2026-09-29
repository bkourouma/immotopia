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

export async function loadProjectionInput(
  tenantId: string,
  referencedAssetIds: ReadonlySet<string> = new Set()
): Promise<LoadedProjectionInput> {
  const today = new Date();
  const asOf = endOfDayUtc(today);
  const rows = await prisma.asset.findMany({ where: { tenantId }, select: NET_WORTH_ASSET_SELECT });
  const active = rows.filter(row => row.status === 'ACTIVE');
  const [valuations, loanRows] = await Promise.all([
    loadNetWorthValuations(tenantId, active),
    prisma.propertyLoan.findMany({ where: { tenantId, status: 'ACTIVE' }, select: LOAN_SELECT })
  ]);

  const netWorthAssets: NetWorthAssetInput[] = active.map(asset => ({
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
  const netWorth = computeNetWorth(netWorthAssets, [], asOf);
  const figures = new Map(netWorth.assets.map(entry => [entry.id, entry]));

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
        details: (asset.details ?? {}) as Record<string, unknown>,
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

  return { input: { today, assets, loans }, lowReliabilityShare: netWorth.lowReliabilityShare };
}
