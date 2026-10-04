import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { roundQuantity } from '../../finance/money';
import { maskValue } from '../../finance/stock-controles';
import type { StockCallerContext } from '../../finance/types-040-controle';
import { CONFIRMED_OUTCOMES } from './captures';
import { isUuid, type FieldCountsQuery } from './schemas';
import { userLabelOf } from './sessions';

/**
 * Comptages terrain — réconciliation (lot 041, ecrans §3, W14-R2) : par lieu
 * et par article, le stock théorique et le dernier comptage physique.
 *
 * Une ligne par couple (lieu, article) qui a un solde non nul OU au moins un
 * comptage (toute source) dans les 180 derniers jours. « Dernier comptage » :
 * la ligne d'inventaire la plus récente du couple (`countedAtServer`, à défaut
 * la création de l'inventaire), quel que soit son statut sauf `CANCELLED`.
 *
 * MASQUES (lot 040, §8.1 et §8.2) :
 * - sans `STOCK_VALUES_VIEW`, `theoreticalValue` et `averageUnitCost` valent
 *   `null` ;
 * - sur un lieu « en comptage » (inventaire `DRAFT`), un appelant sans
 *   `STOCK_COUNT_VALIDATE` reçoit `theoreticalQuantity`, `theoreticalValue` et
 *   `averageUnitCost` à `null`, et le lieu figure dans `meta.blindLocationIds` ;
 *   ses couples sont TOUS rendus, solde nul compris : n'en rendre que les
 *   soldes non nuls trahirait lesquels sont à zéro (règle du filtre
 *   `onlyInStock`, spec 040 §8.2).
 * - `lastCount` n'est jamais masqué : c'est une quantité comptée.
 *
 * « Source du dernier comptage » : `WHATSAPP` si une capture confirmée
 * (`ACCEPTED` ou `CORRECTED`) a écrit cette ligne, sinon `WEB`.
 */

export const FIELD_COUNT_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

export type FieldCountRow = {
  locationId: string;
  locationLabel: string;
  siteId: string | null;
  siteName: string | null;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  unit: string;
  theoreticalQuantity: number | null;
  theoreticalValue: number | null;
  averageUnitCost: number | null;
  lastCount: {
    countId: string;
    countStatus: 'DRAFT' | 'COUNTED' | 'VALIDATED';
    countSource: 'WEB' | 'WHATSAPP';
    countedQuantity: number | null;
    countedAtServer: string | null;
    countedByLabel: string | null;
    captureId: string | null;
    hasPhoto: boolean;
    outcome: 'ACCEPTED' | 'CORRECTED' | null;
  } | null;
};

/** Dernière ligne d'inventaire d'un couple (lieu, article), lue en SQL (`DISTINCT ON`). */
type LastLineRow = {
  line_id: string;
  count_id: string;
  location_id: string;
  item_id: string;
  count_status: string;
  counted_quantity: unknown;
  counted_at_server: Date | null;
  line_date: Date;
  counted_by_full_name: string | null;
  counted_by_email: string | null;
};

type PairKey = string;
const pairKey = (locationId: string, itemId: string): PairKey => `${locationId}|${itemId}`;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Coût moyen pondéré, même règle que le lot 5 : zéro quand la quantité n'est pas positive. */
function averageUnitCostOf(quantity: number, value: number): number {
  if (quantity <= 0) return 0;
  return roundQuantity(value / quantity);
}

// ---------------------------------------------------------------------------
// Curseur opaque : la clé de tri de la dernière ligne rendue
// ---------------------------------------------------------------------------

type SortKey = { locationLabel: string; locationId: string; itemReference: string; itemId: string };

function compareKeys(a: SortKey, b: SortKey): number {
  return (
    a.locationLabel.localeCompare(b.locationLabel, 'fr') ||
    a.locationId.localeCompare(b.locationId) ||
    a.itemReference.localeCompare(b.itemReference, 'fr') ||
    a.itemId.localeCompare(b.itemId)
  );
}

function encodeCursor(key: SortKey): string {
  return Buffer.from(
    JSON.stringify([key.locationLabel, key.locationId, key.itemReference, key.itemId]),
    'utf8'
  ).toString('base64url');
}

function decodeCursor(raw: string | undefined): SortKey | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [locationLabel, locationId, itemReference, itemId] = parsed;
    if (typeof locationLabel !== 'string' || typeof itemReference !== 'string') return null;
    if (!isUuid(locationId) || !isUuid(itemId)) return null;
    return { locationLabel, locationId, itemReference, itemId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * `GET …/field-counts`.
 *
 * @param blind lieux en comptage masqués pour l'appelant (`loadBlindLocationIds`).
 */
export async function listFieldCounts(
  tenantId: string,
  ctx: StockCallerContext,
  blind: Set<string>,
  query: FieldCountsQuery,
  now: Date = new Date()
): Promise<{ data: FieldCountRow[]; nextCursor: string | null }> {
  await assertBelongsToTenant(prisma, 'constructionSite', query.siteId, tenantId, { message: 'Chantier introuvable.' });
  await assertBelongsToTenant(prisma, 'stockLocation', query.locationId, tenantId, {
    message: 'Lieu de stockage introuvable.'
  });
  await assertBelongsToTenant(prisma, 'stockItem', query.itemId, tenantId, { message: 'Article introuvable.' });

  // 1. Les lieux du périmètre.
  const locations = await prisma.stockLocation.findMany({
    where: {
      tenantId,
      ...(query.locationId ? { id: query.locationId } : {}),
      ...(query.siteId ? { siteId: query.siteId } : {})
    },
    select: { id: true, label: true, siteId: true, site: { select: { name: true } } }
  });
  if (locations.length === 0) return { data: [], nextCursor: null };
  const locationById = new Map(locations.map(location => [location.id, location]));
  const locationIds = locations.map(location => location.id);

  // 2. Les soldes : non nuls, ou tous sur un lieu en comptage.
  const balances = await prisma.stockBalance.findMany({
    where: {
      tenantId,
      locationId: { in: locationIds },
      ...(query.itemId ? { itemId: query.itemId } : {})
    },
    select: { itemId: true, locationId: true, quantity: true, value: true }
  });
  const balanceByPair = new Map<PairKey, { quantity: number; value: number }>();
  for (const balance of balances) {
    balanceByPair.set(pairKey(balance.locationId, balance.itemId), {
      quantity: toNumber(balance.quantity) ?? 0,
      value: toNumber(balance.value) ?? 0
    });
  }

  // 3. La dernière ligne d'inventaire de chaque couple (hors inventaires annulés).
  const itemFilter = query.itemId ? Prisma.sql`AND l.item_id = ${query.itemId}::uuid` : Prisma.empty;
  const lastLines = await prisma.$queryRaw<LastLineRow[]>`
    SELECT DISTINCT ON (c.location_id, l.item_id)
      l.id AS line_id,
      c.id AS count_id,
      c.location_id AS location_id,
      l.item_id AS item_id,
      c.status::text AS count_status,
      l.counted_quantity AS counted_quantity,
      l.counted_at_server AS counted_at_server,
      COALESCE(l.counted_at_server, c.created_at) AS line_date,
      u.full_name AS counted_by_full_name,
      u.email AS counted_by_email
    FROM stock_count_lines l
    JOIN stock_counts c ON c.id = l.count_id
    LEFT JOIN users u ON u.id = l.counted_by_user_id
    WHERE c.tenant_id = ${tenantId}
      AND c.status <> 'CANCELLED'
      AND c.location_id = ANY(${locationIds}::uuid[])
      ${itemFilter}
    ORDER BY c.location_id, l.item_id, COALESCE(l.counted_at_server, c.created_at) DESC, l.id DESC
  `;
  const lastLineByPair = new Map<PairKey, LastLineRow>();
  for (const line of lastLines) lastLineByPair.set(pairKey(line.location_id, line.item_id), line);

  // 4. Les couples retenus.
  const since = now.getTime() - FIELD_COUNT_WINDOW_DAYS * DAY_MS;
  const pairs = new Map<PairKey, { locationId: string; itemId: string }>();
  for (const balance of balances) {
    const quantity = balanceByPair.get(pairKey(balance.locationId, balance.itemId))?.quantity ?? 0;
    if (quantity !== 0 || blind.has(balance.locationId)) {
      pairs.set(pairKey(balance.locationId, balance.itemId), {
        locationId: balance.locationId,
        itemId: balance.itemId
      });
    }
  }
  for (const line of lastLines) {
    if (new Date(line.line_date).getTime() >= since) {
      pairs.set(pairKey(line.location_id, line.item_id), { locationId: line.location_id, itemId: line.item_id });
    }
  }
  if (pairs.size === 0) return { data: [], nextCursor: null };

  // 5. Articles et captures des lignes retenues.
  const itemIds = [...new Set([...pairs.values()].map(pair => pair.itemId))];
  const items = await prisma.stockItem.findMany({
    where: { tenantId, id: { in: itemIds } },
    select: { id: true, reference: true, label: true, unit: true }
  });
  const itemById = new Map(items.map(item => [item.id, item]));

  const lineIds = [...pairs.keys()]
    .map(key => lastLineByPair.get(key)?.line_id)
    .filter((id): id is string => typeof id === 'string');
  const captures =
    lineIds.length === 0
      ? []
      : await prisma.stockFieldCapture.findMany({
          where: {
            tenantId,
            countLineId: { in: lineIds },
            outcome: { in: [...CONFIRMED_OUTCOMES] },
            confirmedAt: { not: null }
          },
          orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
          select: { id: true, countLineId: true, outcome: true, fileUrl: true, photoRemovedAt: true }
        });
  const captureByLine = new Map<string, (typeof captures)[number]>();
  for (const capture of captures) {
    if (capture.countLineId && !captureByLine.has(capture.countLineId)) {
      captureByLine.set(capture.countLineId, capture);
    }
  }

  // 6. Les lignes, masquées pour l'appelant.
  const rows: Array<FieldCountRow & { sortKey: SortKey }> = [];
  for (const [key, pair] of pairs) {
    const location = locationById.get(pair.locationId);
    const item = itemById.get(pair.itemId);
    if (!location || !item) continue;

    const isBlind = blind.has(pair.locationId);
    const balance = balanceByPair.get(key) ?? { quantity: 0, value: 0 };
    const line = lastLineByPair.get(key);
    const capture = line ? captureByLine.get(line.line_id) : undefined;

    const lastCount: FieldCountRow['lastCount'] = line
      ? {
          countId: line.count_id,
          countStatus: line.count_status as 'DRAFT' | 'COUNTED' | 'VALIDATED',
          countSource: capture ? 'WHATSAPP' : 'WEB',
          countedQuantity: toNumber(line.counted_quantity),
          countedAtServer: line.counted_at_server ? new Date(line.counted_at_server).toISOString() : null,
          countedByLabel:
            line.counted_by_email !== null
              ? userLabelOf({ fullName: line.counted_by_full_name, email: line.counted_by_email })
              : null,
          captureId: capture?.id ?? null,
          hasPhoto: capture ? Boolean(capture.fileUrl) && !capture.photoRemovedAt : false,
          outcome: capture ? (capture.outcome as 'ACCEPTED' | 'CORRECTED') : null
        }
      : null;

    if (query.source && lastCount?.countSource !== query.source) continue;

    rows.push({
      locationId: location.id,
      locationLabel: location.label,
      siteId: location.siteId,
      siteName: location.site?.name ?? null,
      itemId: item.id,
      itemReference: item.reference,
      itemLabel: item.label,
      unit: item.unit,
      theoreticalQuantity: isBlind ? null : roundQuantity(balance.quantity),
      theoreticalValue: isBlind ? null : maskValue(balance.value, ctx),
      averageUnitCost: isBlind ? null : maskValue(averageUnitCostOf(balance.quantity, balance.value), ctx),
      lastCount,
      sortKey: {
        locationLabel: location.label,
        locationId: location.id,
        itemReference: item.reference,
        itemId: item.id
      }
    });
  }

  rows.sort((a, b) => compareKeys(a.sortKey, b.sortKey));
  const after = decodeCursor(query.cursor);
  const remaining = after ? rows.filter(row => compareKeys(row.sortKey, after) > 0) : rows;
  const page = remaining.slice(0, query.limit);
  const last = page[page.length - 1];

  return {
    data: page.map(({ sortKey: _sortKey, ...row }) => row),
    nextCursor: remaining.length > query.limit && last ? encodeCursor(last.sortKey) : null
  };
}
