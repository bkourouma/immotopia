import { raiseStockAlertTx, readStockAlertSettings } from '../../finance/stock-alertes';
import type { PrismaTransactionClient } from '../../../utils/database';

/**
 * Alerte `FIELD_COUNT_CLOSED` d'un inventaire de chantier clos par WhatsApp
 * (lot 041, spec W5-R6).
 *
 * Levée dans la transaction de la clôture, par la seule fonction du lot 040
 * qui fait naître une alerte (`raiseStockAlertTx`, `ON CONFLICT DO NOTHING`).
 * Gravité `WARNING` si l'écart brut valorisé des lignes comptées —
 * Σ |compté − attendu figé| × coût moyen du lieu — atteint
 * `countVarianceAlertAmount`, ou atteint `countVarianceAlertPercent` de la
 * valeur comptée ; sinon `INFO`. `amount` et `threshold` sont figés.
 *
 * AVEUGLE : ce calcul ne sort JAMAIS vers le chef. Le bot ne dit pas qu'une
 * alerte a été levée (spec §8.3) ; `details` ne porte aucun nom de personne.
 */

export const fieldCountClosedKey = (countId: string): string => `FIELD_COUNT_CLOSED:${countId}`;

export type FieldVarianceLine = {
  countedQuantity: number;
  expectedQuantity: number;
  /** Coût moyen unitaire du lieu (valeur ÷ quantité du solde), 0 sans solde. */
  unitCost: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Écart brut valorisé et valeur comptée des lignes comptées. */
export function computeFieldVariance(lines: readonly FieldVarianceLine[]): { gross: number; countedValue: number } {
  let gross = 0;
  let countedValue = 0;
  for (const line of lines) {
    gross += Math.abs(line.countedQuantity - line.expectedQuantity) * line.unitCost;
    countedValue += line.countedQuantity * line.unitCost;
  }
  return { gross: round2(gross), countedValue: round2(countedValue) };
}

/** `WARNING` au-delà d'un des deux seuils (un seuil nul ou absent est coupé). */
export function fieldAlertSeverity(
  variance: { gross: number; countedValue: number },
  settings: { countVarianceAlertAmount: number | null; countVarianceAlertPercent: number | null }
): 'INFO' | 'WARNING' {
  const amount = settings.countVarianceAlertAmount;
  if (amount !== null && amount > 0 && variance.gross >= amount) return 'WARNING';
  const percent = settings.countVarianceAlertPercent;
  if (percent !== null && percent > 0 && variance.countedValue > 0) {
    if (variance.gross >= (percent / 100) * variance.countedValue) return 'WARNING';
  }
  return 'INFO';
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const number = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(number) ? number : 0;
}

/** Lignes comptées d'un inventaire, avec le coût moyen de leur article sur le lieu. */
async function loadVarianceLines(
  tx: PrismaTransactionClient,
  tenantId: string,
  countId: string,
  locationId: string
): Promise<FieldVarianceLine[]> {
  const lines = await tx.stockCountLine.findMany({
    where: { countId, count: { tenantId }, countedQuantity: { not: null } },
    select: { itemId: true, countedQuantity: true, expectedQuantity: true }
  });
  if (lines.length === 0) return [];
  const balances = await tx.stockBalance.findMany({
    where: { tenantId, locationId, itemId: { in: lines.map(line => line.itemId) } },
    select: { itemId: true, quantity: true, value: true }
  });
  const costByItem = new Map<string, number>();
  for (const balance of balances) {
    const quantity = toNumber(balance.quantity);
    costByItem.set(balance.itemId, quantity > 0 ? toNumber(balance.value) / quantity : 0);
  }
  return lines.map(line => ({
    countedQuantity: toNumber(line.countedQuantity),
    expectedQuantity: toNumber(line.expectedQuantity),
    unitCost: costByItem.get(line.itemId) ?? 0
  }));
}

/** Lève l'alerte de clôture (dans la transaction de la clôture). */
export async function raiseFieldCountClosedAlertTx(
  tx: PrismaTransactionClient,
  input: {
    tenantId: string;
    countId: string;
    siteId: string | null;
    locationId: string;
    capturesCount: number;
    uncountedLinesCount: number;
  }
): Promise<{ severity: 'INFO' | 'WARNING'; linesCount: number }> {
  const lines = await loadVarianceLines(tx, input.tenantId, input.countId, input.locationId);
  const settings = await readStockAlertSettings(tx, input.tenantId);
  const variance = computeFieldVariance(lines);
  const severity = fieldAlertSeverity(variance, settings);
  await raiseStockAlertTx(tx, {
    tenantId: input.tenantId,
    kind: 'FIELD_COUNT_CLOSED',
    severity,
    dedupeKey: fieldCountClosedKey(input.countId),
    amount: variance.gross,
    threshold: settings.countVarianceAlertAmount,
    siteId: input.siteId,
    locationId: input.locationId,
    subjectType: 'StockCount',
    subjectId: input.countId,
    details: {
      linesCount: lines.length,
      capturesCount: input.capturesCount,
      uncountedLinesCount: input.uncountedLinesCount
    }
  });
  return { severity, linesCount: lines.length };
}
