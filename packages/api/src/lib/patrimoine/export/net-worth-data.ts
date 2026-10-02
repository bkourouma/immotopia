import { prisma } from '../../../utils/database';
import { roundMoneyXof } from '../../finance/money';
import { getNetWorth, getNetWorthHistory } from '../../../services/patrimoine-assets-service';
import { assetScopeWhere } from '../asset-scope';
import { toXof, type NetWorthClassBreakdown, type NetWorthResult, type Reliability } from '../assets';

/**
 * Collecte des données de l'export de la situation patrimoniale (lot 5).
 *
 * Les totaux, la répartition par classe et les exclusions viennent de
 * `getNetWorth` (même calcul que l'écran, une seule vérité) ; ce fichier n'y
 * ajoute que le détail par ligne (actifs, dettes) nécessaire au document.
 * TOUTE requête est filtrée par `tenantId`. Aucune donnée libre (`details`,
 * `notes`) n'est lue.
 */

/** Plafond de lignes exportées par tableau (actifs, dettes) : au-delà, le fichier le signale. */
export const NET_WORTH_EXPORT_MAX_ROWS = 500;
/** Borne de lecture des prêts, pour ne pas charger une table démesurée en mémoire. */
const LOANS_READ_CAP = 5000;
const END_OF_DAY_MS = 24 * 60 * 60 * 1000 - 1;

export interface NetWorthExportAsset {
  id: string;
  name: string;
  assetClass: string;
  currency: string;
  /** Valeur dans la devise de l'actif (dernière valorisation à la date de calcul). */
  originalValue: number;
  valueXof: number;
  valuatedAt: Date;
  reliability: Reliability | null;
  stale: boolean;
}

export interface NetWorthExportExcludedAsset {
  id: string;
  name: string;
  assetClass: string;
  reason: string;
}

export interface NetWorthExportDebt {
  id: string;
  lender: string;
  /** Nom de l'actif adossé ; nul pour une dette personnelle. */
  assetName: string | null;
  currency: string;
  remainingCapital: number;
  /** Nul si le taux de change manque : la dette n'est pas comptée dans le total. */
  valueXof: number | null;
  endDate: Date;
}

export interface NetWorthExportHistoryPoint {
  date: string;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
}

export interface NetWorthExportData {
  generatedAt: Date;
  asOf: Date;
  currency: 'XOF';
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  lowReliabilityShare: number;
  byClass: NetWorthClassBreakdown[];
  assets: NetWorthExportAsset[];
  excludedAssets: NetWorthExportExcludedAsset[];
  debts: NetWorthExportDebt[];
  history: NetWorthExportHistoryPoint[];
  /** Nombre réel de lignes avant plafonnement. */
  totals: { assets: number; excludedAssets: number; debts: number };
  truncated: { assets: boolean; excludedAssets: boolean; debts: boolean };
}

const num = (value: { toString(): string } | number): number => Number(value);

interface AssetRow {
  id: string;
  name: string;
  assetClass: string;
  currency: string;
  exchangeRateToXof: number | null;
  propertyId: string | null;
}

interface LoanRow {
  id: string;
  assetId: string | null;
  propertyId: string | null;
  lender: string;
  remainingCapital: { toString(): string };
  currency: string;
  endDate: Date;
}

/** Valeur d'origine (devise de l'actif) de la dernière valorisation à la date de calcul, par actif étranger. */
async function loadOriginalValues(
  tenantId: string,
  rows: AssetRow[],
  included: NetWorthResult['assets'],
  asOfEnd: Date
): Promise<Map<string, number>> {
  const includedIds = new Set(included.map(item => item.id));
  const foreign = rows.filter(row => row.currency.trim().toUpperCase() !== 'XOF' && includedIds.has(row.id));
  const result = new Map<string, number>();
  if (foreign.length === 0) return result;
  const valuations = await prisma.assetValuation.findMany({
    where: { tenantId, valuatedAt: { lte: asOfEnd }, OR: foreign.map(row => assetScopeWhere(row)) },
    select: { assetId: true, propertyId: true, valuatedAt: true, estimatedValue: true },
    orderBy: [{ valuatedAt: 'asc' }, { createdAt: 'asc' }]
  });
  for (const row of foreign) {
    const own = valuations.filter(v => (row.propertyId ? v.propertyId === row.propertyId : v.assetId === row.id));
    const last = own[own.length - 1];
    if (last) result.set(row.id, num(last.estimatedValue));
  }
  return result;
}

function buildDebts(loans: LoanRow[], rows: AssetRow[]): NetWorthExportDebt[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  const byProperty = new Map(rows.flatMap(row => (row.propertyId ? [[row.propertyId, row] as const] : [])));
  return loans.flatMap(loan => {
    const asset = loan.assetId ? byId.get(loan.assetId) : loan.propertyId ? byProperty.get(loan.propertyId) : null;
    // Même règle que le calcul de valeur nette : un prêt d'un bien SANS actif n'est pas compté.
    if ((loan.assetId || loan.propertyId) && !asset) return [];
    const remaining = num(loan.remainingCapital);
    const converted = toXof(remaining, loan.currency, asset?.exchangeRateToXof ?? null);
    return [
      {
        id: loan.id,
        lender: loan.lender,
        assetName: asset?.name ?? null,
        currency: loan.currency,
        remainingCapital: remaining,
        valueXof: converted === null ? null : roundMoneyXof(converted),
        endDate: loan.endDate
      }
    ];
  });
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export async function collectNetWorthExport(tenantId: string, query: { asOf?: string }): Promise<NetWorthExportData> {
  const result = await getNetWorth(tenantId, query);
  const asOfEnd = new Date(result.asOf.getTime() + END_OF_DAY_MS);

  const assetRows = await prisma.asset.findMany({
    where: { tenantId },
    select: { id: true, name: true, assetClass: true, currency: true, exchangeRateToXof: true, propertyId: true }
  });
  const rows: AssetRow[] = assetRows.map(row => ({
    ...row,
    exchangeRateToXof: row.exchangeRateToXof === null ? null : num(row.exchangeRateToXof)
  }));
  const byId = new Map(rows.map(row => [row.id, row]));

  const [originals, loanRows, history] = await Promise.all([
    loadOriginalValues(tenantId, rows, result.assets, asOfEnd),
    prisma.propertyLoan.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        assetId: true,
        propertyId: true,
        lender: true,
        remainingCapital: true,
        currency: true,
        endDate: true
      },
      orderBy: [{ remainingCapital: 'desc' }, { id: 'asc' }],
      take: LOANS_READ_CAP
    }),
    getNetWorthHistory(tenantId, { to: isoDay(result.asOf) })
  ]);

  const allAssets: NetWorthExportAsset[] = result.assets.flatMap(item => {
    const row = byId.get(item.id);
    if (!row) return [];
    return [
      {
        id: item.id,
        name: row.name,
        assetClass: row.assetClass,
        currency: row.currency,
        originalValue: originals.get(item.id) ?? item.valueXof,
        valueXof: item.valueXof,
        valuatedAt: item.valuatedAt,
        reliability: item.reliability,
        stale: item.stale
      }
    ];
  });
  allAssets.sort((a, b) => b.valueXof - a.valueXof || a.name.localeCompare(b.name));

  const allExcluded: NetWorthExportExcludedAsset[] = result.excluded.flatMap(item => {
    const row = byId.get(item.assetId);
    return row ? [{ id: row.id, name: row.name, assetClass: row.assetClass, reason: item.reason }] : [];
  });
  const allDebts = buildDebts(loanRows, rows);

  const max = NET_WORTH_EXPORT_MAX_ROWS;
  return {
    generatedAt: new Date(),
    asOf: result.asOf,
    currency: result.currency,
    totalAssets: result.totalAssets,
    totalDebts: result.totalDebts,
    netWorth: result.netWorth,
    lowReliabilityShare: result.lowReliabilityShare,
    byClass: result.byClass,
    assets: allAssets.slice(0, max),
    excludedAssets: allExcluded.slice(0, max),
    debts: allDebts.slice(0, max),
    history,
    totals: { assets: allAssets.length, excludedAssets: allExcluded.length, debts: allDebts.length },
    truncated: {
      assets: allAssets.length > max,
      excludedAssets: allExcluded.length > max,
      debts: allDebts.length > max
    }
  };
}
