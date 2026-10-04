/**
 * Lectures du terrain — lot 040, territoire API-3 (spec B3-R1, A8-R1, Q9).
 *
 * - `GET /stock/field-context` : tout ce dont l'écran mobile du magasinier a
 *   besoin, en un appel (B3-R1) — lieux actifs (en `LocationView`), chantiers,
 *   postes, articles, preneurs actifs, les 50 factures validées les plus
 *   récentes des 180 derniers jours SANS leurs lignes, motifs, réglages,
 *   droits. **Aucune quantité ni aucune ligne de facture** : le poids reste
 *   compatible avec un téléphone en 3G, et rien ne trahit l'attendu d'un lieu
 *   en comptage.
 * - `GET /stock/receivable-invoices` : la recherche au-delà des 50 (Q9),
 *   paginée par curseur (`invoiceDate|id`), 20 par page.
 * - `GET /stock/supplier-invoices/{invoiceId}/receipts` : ce qui a déjà été
 *   reçu et retourné sur une facture, ses lignes, et le cumul par article
 *   (A8-R1) — l'écran n'additionne rien.
 *
 * Masquage : valeurs (§8.1) par `maskValue` et `maskMovementView`, aveugle
 * (§8.2) sur les mouvements d'un lieu en comptage. Le téléphone d'un preneur
 * et la liste `people` ne vont qu'à STOCK_TAKERS_MANAGE (B2-R6).
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '../../utils/database';
import { AppError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { roundMoneyXof, roundQuantity } from './money';
import { toAmount, toAmountOrZero } from './types';
import { formatSlipNumber } from './stock-bons';
import {
  buildStockMeta,
  loadBlindLocationIds,
  maskMovementView,
  maskValue,
  reasonCodesForResponse
} from './stock-controles';
import { readStockAlertSettings } from './stock-alertes';
import { MOVEMENT_VIEW_INCLUDE, toMovementView } from './stock-journal';
import { listStockTakers } from './stock-preneurs';
import { buildLocationViews, listStockLocations } from './stock-referentiel';
import type {
  FieldContext,
  InvoiceLineView,
  InvoiceReceiptsView,
  PrismaLike,
  ReceivableInvoice,
  StockCallerContext,
  StockMeta,
  StockValuationSource
} from './types-040-controle';

const DAY_MS = 86_400_000;

/** Fenêtre et taille de la liste des factures du contexte terrain (B3-R1). */
export const FIELD_CONTEXT_INVOICE_LIMIT = 50;
export const FIELD_CONTEXT_INVOICE_WINDOW_DAYS = 180;

/** Deux lignes d'une réception d'avant le lot, saisies dans la même opération, sont à quelques ms d'écart. */
const LEGACY_RECEIPT_GAP_MS = 5_000;

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

// ---------------------------------------------------------------------------
// Regroupement des réceptions d'une facture
// ---------------------------------------------------------------------------

/** Ce qu'il faut d'un mouvement de réception pour le rattacher à son opération. */
export interface ReceiptMovementKey {
  slipId: string | null;
  movementDate: Date;
  createdAt: Date;
  createdByUserId: string;
  locationId: string;
}

/**
 * Regroupe les mouvements RECEIPT d'une facture en réceptions : une par bon
 * (lot 040) ; pour une réception d'avant le lot, sans bon, les lignes de même
 * date, même lieu et même auteur saisies à moins de 5 secondes l'une de
 * l'autre (une seule transaction). Ordre : la plus ancienne d'abord.
 */
export function groupReceiptOperations<T extends ReceiptMovementKey>(rows: T[]): T[][] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const bySlip = new Map<string, T[]>();
  const groups: T[][] = [];
  let legacy: T[] | null = null;
  for (const row of sorted) {
    if (row.slipId) {
      const group = bySlip.get(row.slipId);
      if (group) {
        group.push(row);
      } else {
        const created = [row];
        bySlip.set(row.slipId, created);
        groups.push(created);
      }
      continue;
    }
    const last: T | undefined = legacy ? legacy[legacy.length - 1] : undefined;
    const sameOperation =
      !!last &&
      last.locationId === row.locationId &&
      last.createdByUserId === row.createdByUserId &&
      last.movementDate.getTime() === row.movementDate.getTime() &&
      row.createdAt.getTime() - last.createdAt.getTime() <= LEGACY_RECEIPT_GAP_MS;
    if (sameOperation && legacy) {
      legacy.push(row);
    } else {
      legacy = [row];
      groups.push(legacy);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Factures réceptionnables (B3-R1, Q9)
// ---------------------------------------------------------------------------

interface InvoiceCursor {
  invoiceDate: Date;
  id: string;
}

function encodeInvoiceCursor(cursor: InvoiceCursor): string {
  return Buffer.from(`${cursor.invoiceDate.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

function decodeInvoiceCursor(value: string): InvoiceCursor {
  const parts = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const invoiceDate = new Date(parts[0] ?? '');
  if (parts.length !== 2 || !parts[1] || Number.isNaN(invoiceDate.getTime())) {
    throw new AppError('Curseur de pagination invalide.', 400, ErrorCode.BAD_REQUEST);
  }
  return { invoiceDate, id: parts[1] };
}

const RECEIVABLE_INVOICE_SELECT = {
  id: true,
  reference: true,
  invoiceDate: true,
  amount: true,
  siteId: true,
  supplier: { select: { name: true } },
  site: { select: { name: true } }
} satisfies Prisma.SupplierInvoiceSelect;

/** Nombre de réceptions et date de la dernière, par facture : une requête pour toutes. */
async function receiptStatsByInvoice(
  db: PrismaLike,
  tenantId: string,
  invoiceIds: string[]
): Promise<Map<string, { count: number; last: Date | null }>> {
  const stats = new Map<string, { count: number; last: Date | null }>();
  if (invoiceIds.length === 0) {
    return stats;
  }
  const rows = await db.stockMovement.findMany({
    where: { tenantId, type: 'RECEIPT', supplierInvoiceId: { in: invoiceIds } },
    select: {
      supplierInvoiceId: true,
      slipId: true,
      movementDate: true,
      createdAt: true,
      createdByUserId: true,
      locationId: true
    }
  });
  const byInvoice = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.supplierInvoiceId) continue;
    const list = byInvoice.get(row.supplierInvoiceId) ?? [];
    list.push(row);
    byInvoice.set(row.supplierInvoiceId, list);
  }
  for (const [invoiceId, list] of byInvoice) {
    const last = list.reduce<Date | null>(
      (latest, row) => (!latest || row.createdAt > latest ? row.createdAt : latest),
      null
    );
    stats.set(invoiceId, { count: groupReceiptOperations(list).length, last });
  }
  return stats;
}

/**
 * Factures VALIDÉES de l'agence, plus récentes d'abord, sans leurs lignes.
 * `since` borne la date de facture (contexte terrain : 180 jours).
 */
export async function listReceivableInvoices(
  tenantId: string,
  ctx: StockCallerContext,
  params: { search?: string; cursor?: string; limit: number; since?: Date },
  db: PrismaLike = prisma
): Promise<{ invoices: ReceivableInvoice[]; nextCursor: string | null }> {
  const search = params.search?.trim();
  const cursor = params.cursor ? decodeInvoiceCursor(params.cursor) : null;
  const and: Prisma.SupplierInvoiceWhereInput[] = [];
  if (search) {
    and.push({
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ]
    });
  }
  if (cursor) {
    and.push({
      OR: [{ invoiceDate: { lt: cursor.invoiceDate } }, { invoiceDate: cursor.invoiceDate, id: { lt: cursor.id } }]
    });
  }

  const rows = await db.supplierInvoice.findMany({
    where: {
      tenantId,
      status: 'VALIDATED',
      ...(params.since ? { invoiceDate: { gte: params.since } } : {}),
      ...(and.length > 0 ? { AND: and } : {})
    },
    select: RECEIVABLE_INVOICE_SELECT,
    orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
    take: params.limit + 1
  });
  const page = rows.slice(0, params.limit);
  const stats = await receiptStatsByInvoice(
    db,
    tenantId,
    page.map(row => row.id)
  );
  const last = page[page.length - 1];
  return {
    invoices: page.map(row => ({
      id: row.id,
      reference: row.reference,
      supplierName: row.supplier?.name ?? 'Fournisseur inconnu',
      invoiceDate: row.invoiceDate,
      siteId: row.siteId ?? null,
      siteName: row.site?.name ?? null,
      receiptCount: stats.get(row.id)?.count ?? 0,
      lastReceiptAt: stats.get(row.id)?.last ?? null,
      amount: maskValue(roundMoneyXof(toAmountOrZero(row.amount)), ctx)
    })),
    nextCursor:
      rows.length > params.limit && last ? encodeInvoiceCursor({ invoiceDate: last.invoiceDate, id: last.id }) : null
  };
}

/** `GET /stock/receivable-invoices` : une page de 20 (par défaut) et son `meta`. */
export async function searchReceivableInvoices(
  tenantId: string,
  ctx: StockCallerContext,
  params: { search?: string; cursor?: string; limit: number }
): Promise<{ invoices: ReceivableInvoice[]; meta: StockMeta }> {
  const { invoices, nextCursor } = await listReceivableInvoices(tenantId, ctx, params);
  // Aucune quantité de solde dans cette réponse : aucun lieu à déclarer masqué.
  return { invoices, meta: buildStockMeta(ctx, new Set(), nextCursor) };
}

// ---------------------------------------------------------------------------
// Réceptions d'une facture (A8-R1)
// ---------------------------------------------------------------------------

/** Sources qui permettent de valoriser un retour sans ligne de facture (A6-R3 bis) ; nul = avant le lot. */
const RETURN_PRICEABLE_SOURCES = new Set<StockValuationSource | null>(['DECLARED', 'INVOICE_LINE', null]);

function toInvoiceLineView(line: any, ctx: StockCallerContext): InvoiceLineView {
  const unitPrice = toAmount(line.unitPrice);
  const quantity = toAmount(line.quantity);
  return {
    id: line.id,
    label: line.label,
    quantity: quantity === null ? null : roundQuantity(quantity),
    unitPrice: maskValue(unitPrice === null ? null : roundMoneyXof(unitPrice), ctx),
    amount: maskValue(roundMoneyXof(toAmountOrZero(line.amount)), ctx),
    hasUnitPrice: unitPrice !== null && unitPrice > 0
  };
}

interface ItemAccumulator {
  itemId: string;
  itemLabel: string;
  itemUnit: string;
  received: number;
  returned: number;
  sources: Set<StockValuationSource | null>;
}

function accumulateByItem(receipts: any[], returns: any[]): ItemAccumulator[] {
  const byItem = new Map<string, ItemAccumulator>();
  const entry = (row: any): ItemAccumulator => {
    let current = byItem.get(row.itemId);
    if (!current) {
      current = {
        itemId: row.itemId,
        itemLabel: row.item?.label ?? 'Article inconnu',
        itemUnit: row.item?.unit ?? '',
        received: 0,
        returned: 0,
        sources: new Set()
      };
      byItem.set(row.itemId, current);
    }
    return current;
  };
  for (const row of receipts) {
    const current = entry(row);
    current.received += toAmountOrZero(row.quantity);
    current.sources.add(row.valuationSource ?? null);
  }
  for (const row of returns) {
    entry(row).returned += toAmountOrZero(row.quantity);
  }
  return [...byItem.values()].sort((a, b) => a.itemLabel.localeCompare(b.itemLabel, 'fr'));
}

function toByItem(acc: ItemAccumulator, ctx: StockCallerContext): InvoiceReceiptsView['byItem'][number] {
  const received = roundQuantity(acc.received);
  const returned = roundQuantity(acc.returned);
  const sources = [...acc.sources];
  return {
    itemId: acc.itemId,
    itemLabel: acc.itemLabel,
    itemUnit: acc.itemUnit,
    receivedQuantity: received,
    returnedQuantity: returned,
    returnableQuantity: Math.max(0, roundQuantity(received - returned)),
    // Rendu à tous : ce n'est pas une valeur, c'est le champ que l'écran exige.
    returnNeedsInvoiceLine: sources.some(source => !RETURN_PRICEABLE_SOURCES.has(source)),
    valuationSources: ctx.valuesVisible ? [...new Set(sources.map(source => source ?? 'DECLARED'))].sort() : null
  };
}

function toReceiptEntry(
  group: any[],
  ctx: StockCallerContext,
  blind: Set<string>
): InvoiceReceiptsView['receipts'][number] {
  const first = group[0];
  return {
    slipId: first.slipId ?? null,
    slipNumber: first.slip ? formatSlipNumber(first.slip.kind, first.slip.year, first.slip.number) : null,
    receiptDate: first.movementDate,
    createdAt: first.createdAt,
    createdByLabel: toCreatedByLabel(first.createdBy),
    locationLabel: first.location?.label ?? 'Lieu inconnu',
    lines: group.map(row => ({
      itemId: row.itemId,
      itemLabel: row.item?.label ?? 'Article inconnu',
      itemUnit: row.item?.unit ?? '',
      quantity: roundQuantity(toAmountOrZero(row.quantity)),
      // Le coût unitaire d'un lieu en comptage trahirait l'attendu (§8.2).
      unitCost: blind.has(row.locationId) ? null : maskValue(roundQuantity(toAmountOrZero(row.unitCost)), ctx),
      totalValue: maskValue(roundMoneyXof(toAmountOrZero(row.totalValue)), ctx)
    }))
  };
}

/**
 * `GET /stock/supplier-invoices/{invoiceId}/receipts`. Une facture d'une autre
 * agence répond 404, comme une facture inexistante.
 */
export async function getInvoiceReceipts(
  tenantId: string,
  ctx: StockCallerContext,
  invoiceId: string
): Promise<{ view: InvoiceReceiptsView; meta: StockMeta }> {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: {
      id: true,
      reference: true,
      invoiceDate: true,
      status: true,
      amount: true,
      supplier: { select: { name: true } },
      lines: {
        select: { id: true, label: true, quantity: true, unitPrice: true, amount: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!invoice) {
    throw new NotFoundError('Facture fournisseur introuvable.');
  }

  const [movements, blind] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { tenantId, supplierInvoiceId: invoiceId, type: { in: ['RECEIPT', 'SUPPLIER_RETURN'] } },
      include: MOVEMENT_VIEW_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    }),
    loadBlindLocationIds(prisma, tenantId, ctx)
  ]);
  const receipts = movements.filter(row => row.type === 'RECEIPT');
  const returns = movements.filter(row => row.type === 'SUPPLIER_RETURN');

  const receivedValue = receipts.reduce((sum, row) => sum + toAmountOrZero(row.totalValue), 0);
  // Le retour réduit la dette au prix fournisseur (A6-R3 bis) : c'est lui, à
  // défaut la valeur sortie, qui se soustrait de ce qui a été reçu.
  const returnedValue = returns.reduce(
    (sum, row) => sum + (toAmount(row.supplierCreditValue) ?? toAmountOrZero(row.totalValue)),
    0
  );

  const view: InvoiceReceiptsView = {
    invoice: {
      id: invoice.id,
      reference: invoice.reference,
      supplierName: invoice.supplier?.name ?? 'Fournisseur inconnu',
      invoiceDate: invoice.invoiceDate,
      status: invoice.status,
      amount: maskValue(roundMoneyXof(toAmountOrZero(invoice.amount)), ctx),
      lines: invoice.lines.map(line => toInvoiceLineView(line, ctx))
    },
    byItem: accumulateByItem(receipts, returns).map(acc => toByItem(acc, ctx)),
    receipts: groupReceiptOperations(receipts).map(group => toReceiptEntry(group, ctx, blind)),
    returns: returns.map(row => maskMovementView(toMovementView(row), ctx, blind)),
    receivedValue: maskValue(roundMoneyXof(receivedValue), ctx),
    returnedValue: maskValue(roundMoneyXof(returnedValue), ctx)
  };
  return { view, meta: buildStockMeta(ctx, blind) };
}

// ---------------------------------------------------------------------------
// Le contexte terrain (B3-R1)
// ---------------------------------------------------------------------------

/**
 * Chantiers ouverts, plus les chantiers clos dont le lieu porte encore du
 * stock (évacuation). Un lieu clos en comptage est rendu sans se demander
 * s'il porte du stock : la réponse ne doit rien dire de sa quantité.
 */
async function loadFieldSites(tenantId: string, blind: Set<string>): Promise<FieldContext['sites']> {
  const sites = await prisma.constructionSite.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      closedAt: true,
      stockEnabledAt: true,
      stockLocation: { select: { id: true } }
    },
    orderBy: { name: 'asc' }
  });
  const closedLocationIds = sites
    .filter(site => site.closedAt && site.stockLocation && !blind.has(site.stockLocation.id))
    .map(site => site.stockLocation!.id);
  const stocked =
    closedLocationIds.length > 0
      ? await prisma.stockBalance.findMany({
          where: { tenantId, locationId: { in: closedLocationIds }, quantity: { gt: 0 } },
          select: { locationId: true }
        })
      : [];
  const stockedLocations = new Set(stocked.map(row => row.locationId));

  return sites
    .filter(site => {
      if (!site.closedAt) return true;
      const locationId = site.stockLocation?.id;
      return !!locationId && (blind.has(locationId) || stockedLocations.has(locationId));
    })
    .map(site => ({
      id: site.id,
      name: site.name,
      status: site.status,
      closed: !!site.closedAt,
      stockEnabled: !!site.stockEnabledAt,
      locationId: site.stockLocation?.id ?? null
    }));
}

/** Employés et tâcherons actifs, le nom seulement (B2-R6) ; vide sans STOCK_TAKERS_MANAGE. */
async function loadPeople(tenantId: string, ctx: StockCallerContext): Promise<FieldContext['people']> {
  if (!ctx.canManageTakers) {
    return [];
  }
  const [employees, contractors] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' }
    }),
    prisma.contractor.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' }
    })
  ]);
  return [
    ...employees.map(row => ({ kind: 'EMPLOYEE' as const, id: row.id, fullName: row.fullName })),
    ...contractors.map(row => ({ kind: 'CONTRACTOR' as const, id: row.id, fullName: row.fullName }))
  ];
}

/** Les droits de l'appelant, pour n'afficher que les gestes permis. */
function abilitiesOf(ctx: StockCallerContext): FieldContext['abilities'] {
  return {
    canReceive: ctx.canReceive,
    canIssue: ctx.canIssue,
    canTransfer: ctx.canTransfer,
    canCount: ctx.canCount,
    canValidateCount: ctx.canValidateCount,
    canDispose: ctx.canDispose,
    canManageTakers: ctx.canManageTakers,
    valuesVisible: ctx.valuesVisible,
    canViewAlerts: ctx.canViewAlerts,
    canManageSettings: ctx.canManageSettings
  };
}

/** `GET /stock/field-context` : un seul appel de chargement pour l'écran mobile. */
export async function getStockFieldContext(
  tenantId: string,
  ctx: StockCallerContext,
  now: Date = new Date()
): Promise<{ context: FieldContext; meta: StockMeta }> {
  const blind = await loadBlindLocationIds(prisma, tenantId, ctx);
  const [locationRecords, sites, costCategories, items, takers, invoices, settings, people] = await Promise.all([
    listStockLocations(tenantId, { onlyActive: true }),
    loadFieldSites(tenantId, blind),
    prisma.costCategory.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, label: true },
      orderBy: [{ position: 'asc' }, { label: 'asc' }]
    }),
    prisma.stockItem.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, reference: true, label: true, unit: true, category: true, defaultCostCategoryId: true },
      orderBy: { reference: 'asc' }
    }),
    listStockTakers(tenantId, ctx, { onlyActive: true }),
    listReceivableInvoices(tenantId, ctx, {
      limit: FIELD_CONTEXT_INVOICE_LIMIT,
      since: new Date(now.getTime() - FIELD_CONTEXT_INVOICE_WINDOW_DAYS * DAY_MS)
    }),
    readStockAlertSettings(prisma, tenantId),
    loadPeople(tenantId, ctx)
  ]);
  const locations = await buildLocationViews(prisma, tenantId, locationRecords, now);

  return {
    context: {
      locations,
      sites,
      // Recomposés champ par champ : la réponse ne porte que le contrat (poids 3G).
      costCategories: costCategories.map(category => ({ id: category.id, label: category.label })),
      items: items.map(item => ({
        id: item.id,
        reference: item.reference,
        label: item.label,
        unit: item.unit,
        category: item.category ?? null,
        defaultCostCategoryId: item.defaultCostCategoryId ?? null
      })),
      takers,
      receivableInvoices: invoices.invoices,
      reasonCodes: reasonCodesForResponse(),
      settings: { requireTaker: settings.requireTaker, backdatingLimitDays: settings.backdatingLimitDays },
      abilities: abilitiesOf(ctx),
      people
    },
    meta: buildStockMeta(ctx, blind)
  };
}
