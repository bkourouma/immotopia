import { prisma } from '../../../utils/database';
import type { StockVisionCandidate } from '../types';

/**
 * Choix des articles candidats envoyés à l'IA (spec 041, W8-R4).
 *
 * Articles ACTIFS de l'agence, 300 au plus. Au-delà de 300 : d'abord ceux qui
 * ont eu un mouvement sur le lieu dans les 180 derniers jours, puis les autres,
 * chaque groupe par référence. Un article imposé par le chef (W9-R2) est
 * toujours dans la liste.
 *
 * AVEUGLE (spec §8.3) : seuls `id`, `reference`, `label`, `unit` et `category`
 * sont lus — jamais un solde, une quantité, un coût ni un montant. Le `select`
 * explicite de chaque lecture en est la garantie.
 *
 * Toutes les lectures portent `tenantId` (isolation, extension de garde Prisma).
 */

export const STOCK_VISION_MAX_CANDIDATES = 300;
export const STOCK_VISION_RECENT_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Colonnes lues, et seulement elles. */
const CANDIDATE_SELECT = { id: true, reference: true, label: true, unit: true, category: true } as const;

/** Sous-ensemble du client Prisma utilisé (injectable dans les tests). */
export type CandidatesDb = {
  stockItem: Pick<typeof prisma.stockItem, 'count' | 'findMany' | 'findFirst'>;
  stockMovement: Pick<typeof prisma.stockMovement, 'findMany'>;
};

function toCandidate(row: {
  id: string;
  reference: string;
  label: string;
  unit: string;
  category: string | null;
}): StockVisionCandidate {
  return { id: row.id, reference: row.reference, label: row.label, unit: row.unit, category: row.category ?? null };
}

export async function selectStockVisionCandidates(
  tenantId: string,
  params: { locationId: string | null; includeItemId?: string | null; now?: Date },
  db: CandidatesDb = prisma
): Promise<StockVisionCandidate[]> {
  const activeWhere = { tenantId, isActive: true };
  const total = await db.stockItem.count({ where: activeWhere });

  let selected: StockVisionCandidate[];
  if (total <= STOCK_VISION_MAX_CANDIDATES) {
    const rows = await db.stockItem.findMany({
      where: activeWhere,
      select: CANDIDATE_SELECT,
      orderBy: { reference: 'asc' },
      take: STOCK_VISION_MAX_CANDIDATES
    });
    selected = rows.map(toCandidate);
  } else {
    let recentIds: string[] = [];
    if (params.locationId) {
      const since = new Date((params.now ?? new Date()).getTime() - STOCK_VISION_RECENT_DAYS * DAY_MS);
      const movements = await db.stockMovement.findMany({
        where: { tenantId, locationId: params.locationId, movementDate: { gte: since } },
        select: { itemId: true },
        distinct: ['itemId']
      });
      recentIds = movements.map(movement => movement.itemId);
    }
    const recent =
      recentIds.length > 0
        ? await db.stockItem.findMany({
            where: { ...activeWhere, id: { in: recentIds } },
            select: CANDIDATE_SELECT,
            orderBy: { reference: 'asc' },
            take: STOCK_VISION_MAX_CANDIDATES
          })
        : [];
    const remaining = STOCK_VISION_MAX_CANDIDATES - recent.length;
    const others =
      remaining > 0
        ? await db.stockItem.findMany({
            where: recentIds.length > 0 ? { ...activeWhere, id: { notIn: recentIds } } : activeWhere,
            select: CANDIDATE_SELECT,
            orderBy: { reference: 'asc' },
            take: remaining
          })
        : [];
    selected = [...recent, ...others].map(toCandidate);
  }

  const includeId = params.includeItemId ?? null;
  if (includeId && !selected.some(candidate => candidate.id === includeId)) {
    const imposed = await db.stockItem.findFirst({
      where: { ...activeWhere, id: includeId },
      select: CANDIDATE_SELECT
    });
    if (imposed) {
      if (selected.length >= STOCK_VISION_MAX_CANDIDATES) selected = selected.slice(0, STOCK_VISION_MAX_CANDIDATES - 1);
      selected.push(toCandidate(imposed));
    }
  }
  return selected;
}
