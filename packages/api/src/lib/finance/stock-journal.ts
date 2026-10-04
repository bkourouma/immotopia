/**
 * Journal des mouvements de stock — extrait de `stock-mouvements.ts` (lot 040,
 * étape des fondations, plan.md §3.1) **sans changement de comportement**.
 *
 * Le code est celui du lot 5, deuxième sous-lot (`types-lot5-mouvements.ts`,
 * contrat gelé), déplacé tel quel : le lot 040 fait évoluer le journal
 * (pagination par curseur, filtres, export CSV) dans le territoire API-3, et les
 * réceptions et sorties dans le territoire API-1. Le convertisseur de mouvement
 * est **recopié** plutôt que partagé, pour qu'aucun des deux fichiers ne
 * dépende de l'autre.
 */

import { prisma } from '../../utils/database';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmountOrZero } from './types';
import type { ListStockMovements, StockMovementRecord } from './types-lot5-mouvements';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function toMovementRecord(row: any): StockMovementRecord {
  return {
    id: row.id,
    type: row.type,
    itemId: row.itemId,
    itemReference: row.item?.reference ?? 'Article inconnu',
    itemLabel: row.item?.label ?? 'Article inconnu',
    itemUnit: row.item?.unit ?? '',
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    movementDate: row.movementDate,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    isDecrease: row.isDecrease === true,
    unitCost: roundQuantity(toAmountOrZero(row.unitCost)),
    totalValue: roundMoneyXof(toAmountOrZero(row.totalValue)),
    currency: row.currency ?? DEFAULT_CURRENCY,
    quantityAfter: roundQuantity(toAmountOrZero(row.quantityAfter)),
    valueAfter: roundMoneyXof(toAmountOrZero(row.valueAfter)),
    siteId: row.siteId ?? null,
    siteLabel: row.site?.name ?? null,
    costCategoryLabel: row.costCategory?.label ?? null,
    requestedBy: row.requestedBy ?? null,
    supplierInvoiceReference: row.supplierInvoice?.reference ?? null,
    transferGroupId: row.transferGroupId ?? null,
    createdByLabel: toCreatedByLabel(row.createdBy),
    createdAt: row.createdAt
  };
}

// ---------------------------------------------------------------------------
// Le journal des mouvements
// ---------------------------------------------------------------------------

/** Voir `ListStockMovements` dans `./types-lot5-mouvements.ts`. */
export const listStockMovements: ListStockMovements = async (tenantId, filters) => {
  const from = filters?.from;
  const to = filters?.to;

  const rows = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      ...(filters?.itemId ? { itemId: filters.itemId } : {}),
      ...(filters?.locationId ? { locationId: filters.locationId } : {}),
      ...(filters?.siteId ? { siteId: filters.siteId } : {}),
      ...(filters?.type ? { type: filters.type as any } : {}),
      ...(from || to
        ? {
            movementDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {})
    },
    include: {
      item: { select: { reference: true, label: true, unit: true } },
      location: { select: { label: true } },
      site: { select: { name: true } },
      costCategory: { select: { label: true } },
      supplierInvoice: { select: { reference: true } },
      createdBy: { select: { fullName: true, email: true } }
    },
    orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }]
  });

  return (rows as any[]).map(toMovementRecord);
};
