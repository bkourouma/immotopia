import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';
import { loadPropertyYieldInput } from './yield-input-adapter';
import { consolidateHoldings, type ConsolidationHoldingInput } from './consolidation';
import type { EntityConsolidation } from './dto';

/**
 * Assemble la vue consolidée d'une entité détentrice (route 9) : charge ses
 * rattachements, le `YieldInput` de chaque bien (via `yield-input-adapter.ts`,
 * seul point d'appel de `buildPropertyYieldInput`) et la dette active, par
 * lots de 5 appels parallèles, puis délègue l'agrégation à `consolidation.ts`
 * (pur).
 */

const BATCH_SIZE = 5;

async function mapInBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function getEntityConsolidation(tenantId: string, entityId: string): Promise<EntityConsolidation> {
  const entity = await prisma.holdingEntity.findFirst({ where: { id: entityId, tenantId } });
  if (!entity) throw new NotFoundError('Entité introuvable.');

  const holdings = await prisma.propertyHolding.findMany({
    where: { tenantId, entityId },
    include: { property: { select: { id: true, title: true, internalReference: true } } }
  });

  const now = new Date();
  const propertyIds = holdings.map(h => h.propertyId);

  const [yieldInputs, activeLoans] = await Promise.all([
    mapInBatches(holdings, BATCH_SIZE, async holding => ({
      propertyId: holding.propertyId,
      yieldInput: await loadPropertyYieldInput(tenantId, holding.propertyId)
    })),
    propertyIds.length === 0
      ? Promise.resolve([])
      : prisma.propertyLoan.findMany({
          where: { tenantId, propertyId: { in: propertyIds }, status: 'ACTIVE' },
          select: { propertyId: true, remainingCapital: true }
        })
  ]);

  const yieldInputByProperty = new Map(yieldInputs.map(entry => [entry.propertyId, entry.yieldInput]));
  const debtByProperty = new Map<string, number>();
  for (const loan of activeLoans) {
    debtByProperty.set(loan.propertyId, (debtByProperty.get(loan.propertyId) ?? 0) + Number(loan.remainingCapital));
  }

  const inputs: ConsolidationHoldingInput[] = holdings.map(holding => ({
    propertyId: holding.propertyId,
    title: holding.property.title,
    internalReference: holding.property.internalReference,
    sharePercent: Number(holding.sharePercent),
    pending: Boolean(holding.effectiveFrom && holding.effectiveFrom.getTime() > now.getTime()),
    yieldInput: yieldInputByProperty.get(holding.propertyId) ?? {
      annualRent: 0,
      currentValue: 0,
      costBasis: 0,
      annualExpenses: 0,
      annualLoanPayments: 0
    },
    outstandingDebt: debtByProperty.get(holding.propertyId) ?? 0
  }));

  const { totals, properties } = consolidateHoldings(inputs);

  return {
    entityId,
    asOf: now.toISOString(),
    currency: 'XOF',
    totals,
    properties
  };
}
