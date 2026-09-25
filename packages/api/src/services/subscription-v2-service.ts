/**
 * Abonnements par packs — service (vague 1). Reference :
 * docs/architecture/PLAN-ABONNEMENTS.md.
 *
 * Lit et modifie l'abonnement d'une agence : droits (`getEntitlements`),
 * elements souscrits (ajout, retrait, changement de pack selon D6/D7),
 * derogations de capacite, apercu de la prochaine facture (sans emission),
 * synchronisation des TenantModule depuis les packs. Tous les calculs de prix
 * et de droits sont delegues a la bibliotheque pure `lib/subscription`.
 *
 * Toutes les requetes sur des modeles d'agence portent `tenantId` ; le
 * catalogue (CatalogItem) est global.
 */

import {
  CapacityKey,
  CatalogItemKind,
  InvoiceLineKind,
  ModuleKey,
  Prisma,
  QuotaPolicy,
  SubscriptionItemStatus,
  SubscriptionStatus
} from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { logAuditEvent, AuditActionKey } from './audit-service';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error-middleware';
import {
  CAPACITY_KEYS,
  CapacityKeyCode,
  CatalogRules,
  ChargeLine,
  ChargeableItem,
  EntitlementItem,
  EXTENSION,
  InvoiceTotals,
  MODULE_KEYS,
  PLATFORM_INVOICE_ISSUER,
  PLATFORM_TAX_RATE_PERCENT,
  PricingCatalogItem,
  TenantEntitlements,
  addBillingPeriod,
  buildEntitlements,
  computeOverageLines,
  computeRecurringLines,
  computeSetupLines,
  cycleMultiplier,
  effectiveItems,
  featuresForModules,
  finalizeInvoice,
  getSubscriptionEnforcement,
  heldPackCodes,
  isExtensionAllowed,
  packModules,
  parseCatalogRules,
  planExtensionUnits,
  prorateAmount,
  purchasedCapacity,
  scaleLinesForCycle,
  validateExclusivity
} from '../lib/subscription';
import { countActiveCopros, countActiveLots, countActiveSites } from './lot-registry-service';

type Db = PrismaTransactionClient | typeof prisma;

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return 0;
  return Number((value as { toString(): string }).toString());
};

// =============================================================== catalogue

export interface CatalogEntry extends PricingCatalogItem {
  id: string;
  description: string | null;
  modules: ModuleKey[];
  exclusiveGroup: string | null;
  isSellable: boolean;
  sortOrder: number;
}

const catalogInclude = { capacities: { select: { capacityKey: true, amount: true } } } as const;

type CatalogRow = Prisma.CatalogItemGetPayload<{ include: typeof catalogInclude }>;

export function toCatalogEntry(row: CatalogRow): CatalogEntry {
  const capacities: Partial<Record<CapacityKeyCode, number>> = {};
  for (const c of row.capacities ?? []) capacities[c.capacityKey] = c.amount;
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    name: row.name,
    description: row.description ?? null,
    monthlyPrice: toNumber(row.monthlyPrice),
    setupPrice: toNumber(row.setupPrice),
    modules: row.modules ?? [],
    exclusiveGroup: row.exclusiveGroup ?? null,
    rules: parseCatalogRules(row.rules),
    isSellable: row.isSellable,
    sortOrder: row.sortOrder,
    capacities
  };
}

/** Catalogue, trie pour l'affichage. */
export async function listCatalog(options: { includeUnsellable?: boolean } = {}, db: Db = prisma): Promise<CatalogEntry[]> {
  const rows = await db.catalogItem.findMany({
    where: options.includeUnsellable ? {} : { isSellable: true },
    include: catalogInclude,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }]
  });
  return rows.map(toCatalogEntry);
}

/** Elements du catalogue par code ; leve NotFoundError si un code manque. */
export async function loadCatalogByCodes(db: Db, codes: readonly string[]): Promise<Map<string, CatalogEntry>> {
  const unique = [...new Set(codes)];
  const rows = await db.catalogItem.findMany({ where: { code: { in: unique } }, include: catalogInclude });
  const map = new Map(rows.map(r => [r.code, toCatalogEntry(r)]));
  const missing = unique.filter(code => !map.has(code));
  if (missing.length > 0) {
    throw new NotFoundError(`Offre introuvable dans le catalogue : ${missing.join(', ')}.`);
  }
  return map;
}

/** Une offre du catalogue par code ; leve NotFoundError si elle manque. */
export async function loadCatalogItem(db: Db, code: string): Promise<CatalogEntry> {
  return requireEntry(await loadCatalogByCodes(db, [code]), code);
}

function requireEntry(map: Map<string, CatalogEntry>, code: string): CatalogEntry {
  const entry = map.get(code);
  if (!entry) throw new NotFoundError(`Offre introuvable dans le catalogue : ${code}.`);
  return entry;
}

export interface CatalogItemPatch {
  name?: string;
  description?: string | null;
  monthlyPrice?: number;
  setupPrice?: number;
  isSellable?: boolean;
  sortOrder?: number;
  rules?: CatalogRules | null;
}

/**
 * Modifie une offre du catalogue (super-admin, D12). N'affecte AUCUN
 * abonnement en cours : leurs prix sont figes dans SubscriptionItem.
 */
export async function updateCatalogItem(code: string, patch: CatalogItemPatch, actorUserId: string): Promise<CatalogEntry> {
  const existing = await prisma.catalogItem.findUnique({ where: { code }, include: catalogInclude });
  if (!existing) throw new NotFoundError('Offre introuvable dans le catalogue.');
  const updated = await prisma.catalogItem.update({
    where: { code },
    data: {
      name: patch.name,
      description: patch.description,
      monthlyPrice: patch.monthlyPrice,
      setupPrice: patch.setupPrice,
      isSellable: patch.isSellable,
      sortOrder: patch.sortOrder,
      ...(patch.rules !== undefined
        ? { rules: patch.rules === null ? Prisma.DbNull : (patch.rules as unknown as Prisma.InputJsonValue) }
        : {})
    },
    include: catalogInclude
  });
  logAuditEvent({
    actorUserId,
    tenantId: null,
    actionKey: AuditActionKey.CATALOG_ITEM_UPDATED,
    entityType: 'CatalogItem',
    entityId: updated.id,
    payload: { code, before: toCatalogEntry(existing), after: toCatalogEntry(updated) } as unknown as Record<string, unknown>
  });
  return toCatalogEntry(updated);
}

// =============================================================== consommation

/**
 * Point d'extension de la consommation (`used`) par capacite. Par defaut :
 * LOTS = activations ouvertes du registre (LotActivation), COPROPRIETES et
 * CHANTIERS = comptage direct (D14). La vague 2 peut remplacer un fournisseur
 * (`registerUsageProvider`) sans toucher a getEntitlements.
 */
export type UsageProvider = (db: Db, tenantId: string) => Promise<number>;

const usageProviders: Record<CapacityKeyCode, UsageProvider> = {
  LOTS: countActiveLots,
  COPROPRIETES: countActiveCopros,
  CHANTIERS: countActiveSites
};

export function registerUsageProvider(capacityKey: CapacityKeyCode, provider: UsageProvider): void {
  usageProviders[capacityKey] = provider;
}

export async function getUsage(tenantId: string, db: Db = prisma): Promise<Record<CapacityKeyCode, number>> {
  const values = await Promise.all(CAPACITY_KEYS.map(key => usageProviders[key](db, tenantId)));
  const usage = {} as Record<CapacityKeyCode, number>;
  CAPACITY_KEYS.forEach((key, i) => {
    usage[key] = values[i];
  });
  return usage;
}

// =============================================================== chargement

const itemInclude = { catalogItem: { include: catalogInclude } } as const;
type ItemRow = Prisma.SubscriptionItemGetPayload<{ include: typeof itemInclude }>;

function toEntitlementItem(row: ItemRow): EntitlementItem & { id: string; catalog: CatalogEntry; row: ItemRow } {
  const catalog = toCatalogEntry(row.catalogItem);
  return {
    id: row.id,
    code: catalog.code,
    kind: catalog.kind,
    quantity: row.quantity,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    modules: catalog.modules,
    exclusiveGroup: catalog.exclusiveGroup,
    capacities: catalog.capacities,
    catalog,
    row
  };
}

function toChargeable(item: ReturnType<typeof toEntitlementItem>): ChargeableItem {
  return {
    code: item.code,
    kind: item.kind,
    name: item.catalog.name,
    quantity: item.quantity,
    unitMonthlyPrice: toNumber(item.row.unitMonthlyPrice),
    unitSetupPrice: toNumber(item.row.unitSetupPrice),
    discountPercent: toNumber(item.row.discountPercent),
    subscriptionItemId: item.id
  };
}

async function loadState(db: Db, tenantId: string) {
  const [subscription, items, overrides, moduleRows] = await Promise.all([
    db.subscription.findUnique({ where: { tenantId } }),
    db.subscriptionItem.findMany({
      where: { tenantId, status: { not: SubscriptionItemStatus.ENDED } },
      include: itemInclude,
      orderBy: { createdAt: 'asc' }
    }),
    db.capacityOverride.findMany({ where: { tenantId, revokedAt: null }, orderBy: { createdAt: 'asc' } }),
    db.tenantModule.findMany({ where: { tenantId } })
  ]);
  return { subscription, items: items.map(toEntitlementItem), overrides, moduleRows };
}

async function requireSubscription(db: Db, tenantId: string) {
  const subscription = await db.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new NotFoundError('Abonnement introuvable.');
  return subscription;
}

// =============================================================== droits

const ENTITLEMENTS_TTL_MS = 30_000;
const entitlementsCache = new Map<string, { value: TenantEntitlements; expiresAt: number }>();

/** A appeler apres toute ecriture qui change les droits d'une agence (fait par ce service). */
export function invalidateEntitlements(tenantId?: string): void {
  if (tenantId) entitlementsCache.delete(tenantId);
  else entitlementsCache.clear();
}

/**
 * Droits d'une agence : `{ status, phase, readOnly, modules, moduleAccess,
 * features, capacities: { LOTS: { limit, used, ... } }, quotaPolicy,
 * enforcement }`. Mis en cache 30 s par agence (les gardes de la vague 2
 * l'appellent a chaque requete) ; `fresh: true` force le recalcul.
 */
export async function getEntitlements(
  tenantId: string,
  options: { fresh?: boolean; now?: Date; db?: Db } = {}
): Promise<TenantEntitlements> {
  const useCache = !options.fresh && !options.now && !options.db;
  if (useCache) {
    const cached = entitlementsCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const [state, usage] = await Promise.all([loadState(db, tenantId), getUsage(tenantId, db)]);
  const sub = state.subscription;

  const value = buildEntitlements({
    tenantId,
    subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          pastDueAt: sub.pastDueAt,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAt: sub.cancelAt,
          canceledAt: sub.canceledAt,
          graceDays: sub.graceDays,
          billingCycle: sub.billingCycle,
          quotaPolicy: sub.quotaPolicy
        }
      : null,
    items: state.items,
    overrides: state.overrides,
    moduleRows: state.moduleRows,
    usage,
    enforcement: getSubscriptionEnforcement(),
    featuresFor: featuresForModules,
    now
  });

  if (useCache) entitlementsCache.set(tenantId, { value, expiresAt: Date.now() + ENTITLEMENTS_TTL_MS });
  return value;
}

// =============================================================== modules

/**
 * Recalcule les TenantModule de source PACK depuis les packs en vigueur,
 * sans toucher aux OVERRIDE encore valides (un OVERRIDE expire redevient
 * PACK). Un module retire garde sa ligne (enabled=false, disabledAt pose) :
 * ses donnees restent, en lecture seule (D11).
 */
export async function syncTenantModulesTx(
  tx: Db,
  tenantId: string,
  options: { now?: Date; actorUserId?: string | null } = {}
): Promise<{ enabled: ModuleKey[]; disabled: ModuleKey[] }> {
  const now = options.now ?? new Date();
  const items = await tx.subscriptionItem.findMany({
    where: { tenantId, status: { not: SubscriptionItemStatus.ENDED } },
    include: itemInclude
  });
  const desired = new Set<string>(packModules(effectiveItems(items.map(toEntitlementItem), now)));
  const rows = await tx.tenantModule.findMany({ where: { tenantId } });
  const byKey = new Map(rows.map(r => [r.moduleKey, r]));

  const enabled: ModuleKey[] = [];
  const disabled: ModuleKey[] = [];
  for (const moduleKey of MODULE_KEYS as readonly ModuleKey[]) {
    const row = byKey.get(moduleKey);
    const want = desired.has(moduleKey);
    const overrideLive = row?.source === 'OVERRIDE' && (!row.expiresAt || row.expiresAt.getTime() > now.getTime());
    if (overrideLive) continue;

    if (!row) {
      if (want) {
        // eslint-disable-next-line no-await-in-loop -- trois modules au plus.
        await tx.tenantModule.create({
          data: { tenantId, moduleKey, enabled: true, enabledAt: now, enabledBy: options.actorUserId ?? null, source: 'PACK' }
        });
        enabled.push(moduleKey);
      }
      continue;
    }
    const wasEnabled = row.enabled;
    if (wasEnabled === want && row.source === 'PACK') continue;
    // eslint-disable-next-line no-await-in-loop -- trois modules au plus.
    await tx.tenantModule.update({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      data: {
        source: 'PACK',
        expiresAt: null,
        enabled: want,
        ...(want && !wasEnabled ? { enabledAt: now, enabledBy: options.actorUserId ?? null } : {}),
        ...(!want && wasEnabled ? { disabledAt: now } : {})
      }
    });
    if (want && !wasEnabled) enabled.push(moduleKey);
    if (!want && wasEnabled) disabled.push(moduleKey);
  }
  return { enabled, disabled };
}

/**
 * Transitions dues a `now` : elements dont la fin est passee -> ENDED,
 * elements SCHEDULED dont le debut est atteint -> ACTIVE, puis modules
 * resynchronises. Idempotent. A appeler au changement de periode (vague 3).
 */
export async function applyDueItemTransitionsTx(
  tx: Db,
  tenantId: string,
  now: Date = new Date()
): Promise<{ ended: number; started: number }> {
  const ended = await tx.subscriptionItem.updateMany({
    where: { tenantId, status: { not: SubscriptionItemStatus.ENDED }, endsAt: { lte: now } },
    data: { status: SubscriptionItemStatus.ENDED }
  });
  const started = await tx.subscriptionItem.updateMany({
    where: { tenantId, status: SubscriptionItemStatus.SCHEDULED, startsAt: { lte: now } },
    data: { status: SubscriptionItemStatus.ACTIVE }
  });
  if (ended.count > 0 || started.count > 0) {
    await syncTenantModulesTx(tx, tenantId, { now });
    invalidateEntitlements(tenantId);
  }
  return { ended: ended.count, started: started.count };
}

// =============================================================== elements

function isTrial(subscription: { status: SubscriptionStatus }): boolean {
  return subscription.status === SubscriptionStatus.TRIALING;
}

/** Elements en vigueur maintenant et pas deja programmes pour finir. */
function standingItems<T extends Pick<EntitlementItem, 'status' | 'startsAt' | 'endsAt'>>(items: readonly T[], now: Date): T[] {
  return effectiveItems(items, now).filter(i => !i.endsAt);
}

interface PendingLineInput {
  kind: InvoiceLineKind;
  label: string;
  catalogItemId?: string | null;
  subscriptionItemId?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
  metadata?: Record<string, unknown>;
}

async function createPendingLinesTx(tx: Db, tenantId: string, lines: PendingLineInput[]) {
  const nonZero = lines.filter(l => l.amount !== 0);
  if (nonZero.length === 0) return [];
  const created = [];
  for (const line of nonZero) {
    // eslint-disable-next-line no-await-in-loop -- quelques lignes au plus.
    created.push(
      await tx.invoiceLine.create({
        data: {
          tenantId,
          invoiceId: null,
          kind: line.kind,
          label: line.label,
          catalogItemId: line.catalogItemId ?? null,
          subscriptionItemId: line.subscriptionItemId ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
          periodStart: line.periodStart,
          periodEnd: line.periodEnd,
          metadata: (line.metadata ?? undefined) as Prisma.InputJsonValue | undefined
        }
      })
    );
  }
  return created;
}

/** Remise de combinaison mensuelle d'un ensemble d'elements (D6). */
function monthlyComboDiscount(items: ChargeableItem[], percent: number): number {
  return computeRecurringLines(items, { comboDiscountPercent: percent }).comboDiscount;
}

export interface AddItemInput {
  code: string;
  quantity?: number;
  discountPercent?: number;
  note?: string;
}

/**
 * Ajoute un pack, une extension ou une mise en route (D7 : ajout IMMEDIAT,
 * facture au prorata des jours restants — sauf pendant l'essai). Le prix est
 * fige depuis le catalogue ; un bloc de lots est price selon le rang des lots
 * qu'il couvre (un element par palier de prix). Un pack incompatible
 * (exclusivite de l'Integre) est refuse : passer par `changePack`.
 */
export async function addSubscriptionItem(tenantId: string, input: AddItemInput, actorUserId: string) {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestError('La quantité doit être un entier positif.');

  const outcome = await prisma.$transaction(async tx => {
    const now = new Date();
    const subscription = await requireSubscription(tx, tenantId);
    const catalog = await loadCatalogItem(tx, input.code);
    if (!catalog.isSellable) throw new BadRequestError("Cette offre n'est plus commercialisée.");

    const state = await loadState(tx, tenantId);
    const standing = standingItems(state.items, now);
    const held = heldPackCodes(standing);

    if (catalog.kind === CatalogItemKind.PACK) {
      if (quantity !== 1) throw new BadRequestError("Un pack se souscrit une seule fois.");
      if (held.includes(catalog.code)) throw new ConflictError('Ce pack est déjà souscrit.');
      const check = validateExclusivity([...standing, { code: catalog.code, kind: 'PACK', exclusiveGroup: catalog.exclusiveGroup }]);
      if (!check.ok) {
        throw new BadRequestError(
          `Pack incompatible avec l'abonnement actuel (${check.conflicts.map(c => c.join(' / ')).join(', ')}) : utilisez le changement de pack.`
        );
      }
    } else if (catalog.kind === CatalogItemKind.EXTENSION && !isExtensionAllowed(catalog, held)) {
      throw new BadRequestError("Cette extension exige un pack qui n'est pas souscrit.");
    }

    // Prix figes : un segment par palier de prix (blocs de lots).
    let segments: Array<{ quantity: number; unitMonthlyPrice: number }>;
    if (catalog.kind === CatalogItemKind.EXTENSION) {
      const capacityKey = (Object.keys(catalog.capacities)[0] ?? 'LOTS') as CapacityKeyCode;
      segments = planExtensionUnits(catalog, held, quantity, purchasedCapacity(standing, capacityKey));
    } else {
      segments = [{ quantity, unitMonthlyPrice: catalog.kind === CatalogItemKind.SETUP ? 0 : catalog.monthlyPrice }];
    }

    const created: ItemRow[] = [];
    for (const segment of segments) {
      // eslint-disable-next-line no-await-in-loop -- un element par palier.
      const row = await tx.subscriptionItem.create({
        data: {
          subscriptionId: subscription.id,
          tenantId,
          catalogItemId: catalog.id,
          quantity: segment.quantity,
          unitMonthlyPrice: segment.unitMonthlyPrice,
          unitSetupPrice: catalog.kind === CatalogItemKind.SETUP ? catalog.setupPrice : 0,
          discountPercent: input.discountPercent ?? 0,
          status: SubscriptionItemStatus.ACTIVE,
          startsAt: now,
          addedByUserId: actorUserId,
          note: input.note ?? null
        },
        include: itemInclude
      });
      created.push(row);
    }

    // Prorata (hors essai, hors mise en route) : l'element + la variation de
    // la remise de combinaison qu'il entraine.
    const pending: PendingLineInput[] = [];
    if (!isTrial(subscription) && catalog.kind !== CatalogItemKind.SETUP) {
      const factor = cycleMultiplier(subscription.billingCycle);
      const period = { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd };
      for (const row of created) {
        const monthly = row.quantity * toNumber(row.unitMonthlyPrice) * (1 - toNumber(row.discountPercent) / 100);
        const amount = prorateAmount(monthly * factor, period.start, period.end, now);
        pending.push({
          kind: InvoiceLineKind.PRORATA,
          label: `${catalog.name} — prorata du ${now.toISOString().slice(0, 10)}`,
          catalogItemId: catalog.id,
          subscriptionItemId: row.id,
          quantity: row.quantity,
          unitPrice: toNumber(row.unitMonthlyPrice),
          amount,
          periodStart: now,
          periodEnd: period.end
        });
      }
      if (catalog.kind === CatalogItemKind.PACK) {
        const percent = toNumber(subscription.comboDiscountPercent);
        const before = monthlyComboDiscount(standing.map(toChargeable), percent);
        const after = monthlyComboDiscount([...standing, ...created.map(toEntitlementItem)].map(toChargeable), percent);
        const delta = prorateAmount((after - before) * factor, period.start, period.end, now);
        if (delta !== 0) {
          pending.push({
            kind: InvoiceLineKind.DISCOUNT,
            label: 'Remise de combinaison — prorata',
            quantity: 1,
            unitPrice: -delta,
            amount: -delta,
            periodStart: now,
            periodEnd: period.end
          });
        }
      }
    }
    const pendingLines = await createPendingLinesTx(tx, tenantId, pending);
    const modules = catalog.kind === CatalogItemKind.PACK ? await syncTenantModulesTx(tx, tenantId, { now, actorUserId }) : null;
    return { created, pendingLines, modules, catalog };
  });

  invalidateEntitlements(tenantId);
  for (const row of outcome.created) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_ITEM_ADDED,
      entityType: 'SubscriptionItem',
      entityId: row.id,
      payload: {
        code: outcome.catalog.code,
        quantity: row.quantity,
        unitMonthlyPrice: toNumber(row.unitMonthlyPrice),
        prorata: outcome.pendingLines.filter(l => l.subscriptionItemId === row.id).map(l => toNumber(l.amount))
      }
    });
  }
  return {
    items: outcome.created.map(serializeItem),
    pendingLines: outcome.pendingLines.map(serializeLine),
    modules: outcome.modules
  };
}

export interface RemoveItemInput {
  /** Retrait immediat (super-admin), sans remboursement ; exige `reason`. Par defaut : a l'echeance. */
  immediate?: boolean;
  reason?: string;
  /** Retirer seulement une partie des unites (extensions). Par defaut : toutes. */
  quantity?: number;
}

/**
 * Retire un element (D7) : a l'ECHEANCE par defaut (reste actif jusqu'a la
 * fin de la periode, sans remboursement) ; immediatement si `immediate` avec
 * une raison, ou pendant l'essai. Un retrait partiel cree un element du reste
 * au meme prix fige.
 */
export async function removeSubscriptionItem(tenantId: string, itemId: string, input: RemoveItemInput, actorUserId: string) {
  if (input.immediate && !input.reason?.trim()) {
    throw new BadRequestError('Un retrait immédiat exige une raison.');
  }

  const outcome = await prisma.$transaction(async tx => {
    const now = new Date();
    const subscription = await requireSubscription(tx, tenantId);
    const row = await tx.subscriptionItem.findFirst({ where: { id: itemId, tenantId }, include: itemInclude });
    if (!row) throw new NotFoundError('Élément d’abonnement introuvable.');
    if (row.status === SubscriptionItemStatus.ENDED) throw new ConflictError('Cet élément est déjà terminé.');

    const removeQty = input.quantity ?? row.quantity;
    if (!Number.isInteger(removeQty) || removeQty < 1 || removeQty > row.quantity) {
      throw new BadRequestError('Quantité à retirer invalide.');
    }

    const notStarted = row.startsAt.getTime() > now.getTime();
    const immediate = Boolean(input.immediate) || isTrial(subscription) || notStarted;
    const endsAt = immediate ? now : subscription.currentPeriodEnd;
    const reason = input.reason?.trim() || (immediate ? 'IMMEDIATE' : 'END_OF_PERIOD');

    const ended = await tx.subscriptionItem.update({
      where: { id: row.id },
      data: {
        endsAt,
        endReason: reason,
        endedByUserId: actorUserId,
        ...(immediate ? { status: SubscriptionItemStatus.ENDED } : {})
      },
      include: itemInclude
    });

    let remainder: ItemRow | null = null;
    if (removeQty < row.quantity) {
      remainder = await tx.subscriptionItem.create({
        data: {
          subscriptionId: row.subscriptionId,
          tenantId,
          catalogItemId: row.catalogItemId,
          quantity: row.quantity - removeQty,
          unitMonthlyPrice: row.unitMonthlyPrice,
          unitSetupPrice: row.unitSetupPrice,
          discountPercent: row.discountPercent,
          status: immediate || notStarted ? row.status : SubscriptionItemStatus.SCHEDULED,
          startsAt: immediate || notStarted ? row.startsAt : endsAt,
          replacesItemId: row.id,
          addedByUserId: actorUserId,
          billedThrough: row.billedThrough,
          note: `Reste après retrait partiel de ${removeQty} unité(s)`
        },
        include: itemInclude
      });
    }

    const modules =
      immediate && row.catalogItem.kind === CatalogItemKind.PACK
        ? await syncTenantModulesTx(tx, tenantId, { now, actorUserId })
        : null;
    return { ended, remainder, immediate, removeQty, modules };
  });

  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SUBSCRIPTION_ITEM_REMOVED,
    entityType: 'SubscriptionItem',
    entityId: itemId,
    payload: {
      code: outcome.ended.catalogItem.code,
      quantity: outcome.removeQty,
      immediate: outcome.immediate,
      endsAt: outcome.ended.endsAt?.toISOString() ?? null,
      reason: outcome.ended.endReason,
      remainderItemId: outcome.remainder?.id ?? null
    }
  });
  return {
    item: serializeItem(outcome.ended),
    remainder: outcome.remainder ? serializeItem(outcome.remainder) : null,
    immediate: outcome.immediate,
    modules: outcome.modules
  };
}

/**
 * Change de pack (ex. Agence + Syndic -> Integre). Montee de gamme (nouveau
 * prix superieur) : IMMEDIATE, avoir au prorata des packs remplaces et
 * prorata du nouveau (D7). Descente : a l'ECHEANCE, le nouveau pack est
 * programme (SCHEDULED) au debut de la periode suivante. Pendant l'essai,
 * tout est immediat et sans prorata.
 */
export async function changePack(
  tenantId: string,
  input: { fromCodes: string[]; toCode: string; note?: string },
  actorUserId: string
) {
  if (input.fromCodes.length === 0) throw new BadRequestError('Indiquez le ou les packs remplacés.');

  const outcome = await prisma.$transaction(async tx => {
    const now = new Date();
    const subscription = await requireSubscription(tx, tenantId);
    const target = await loadCatalogItem(tx, input.toCode);
    if (target.kind !== CatalogItemKind.PACK) throw new BadRequestError("L'offre cible n'est pas un pack.");
    if (!target.isSellable) throw new BadRequestError("Cette offre n'est plus commercialisée.");

    const state = await loadState(tx, tenantId);
    const standing = standingItems(state.items, now);
    const fromItems = standing.filter(i => i.kind === 'PACK' && input.fromCodes.includes(i.code));
    const missing = input.fromCodes.filter(code => !fromItems.some(i => i.code === code));
    if (missing.length > 0) throw new BadRequestError(`Pack(s) non souscrit(s) : ${missing.join(', ')}.`);
    if (heldPackCodes(standing).includes(target.code)) throw new ConflictError('Ce pack est déjà souscrit.');

    const remaining = standing.filter(i => !fromItems.includes(i));
    const check = validateExclusivity([...remaining, { code: target.code, kind: 'PACK', exclusiveGroup: target.exclusiveGroup }]);
    if (!check.ok) {
      throw new BadRequestError(`Combinaison de packs impossible : ${check.conflicts.map(c => c.join(' / ')).join(', ')}.`);
    }

    const fromMonthly = fromItems.reduce((s, i) => s + toNumber(i.row.unitMonthlyPrice), 0);
    const upgrade = target.monthlyPrice > fromMonthly;
    const immediate = upgrade || isTrial(subscription);
    const switchAt = immediate ? now : subscription.currentPeriodEnd;

    for (const item of fromItems) {
      // eslint-disable-next-line no-await-in-loop -- un a trois packs.
      await tx.subscriptionItem.update({
        where: { id: item.id },
        data: {
          endsAt: switchAt,
          endReason: upgrade ? 'UPGRADE' : 'DOWNGRADE',
          endedByUserId: actorUserId,
          ...(immediate ? { status: SubscriptionItemStatus.ENDED } : {})
        }
      });
    }
    const created = await tx.subscriptionItem.create({
      data: {
        subscriptionId: subscription.id,
        tenantId,
        catalogItemId: target.id,
        quantity: 1,
        unitMonthlyPrice: target.monthlyPrice,
        status: immediate ? SubscriptionItemStatus.ACTIVE : SubscriptionItemStatus.SCHEDULED,
        startsAt: switchAt,
        replacesItemId: fromItems[0].id,
        addedByUserId: actorUserId,
        note: input.note ?? null
      },
      include: itemInclude
    });

    const pending: PendingLineInput[] = [];
    if (immediate && !isTrial(subscription)) {
      const factor = cycleMultiplier(subscription.billingCycle);
      const period = { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd };
      for (const item of fromItems) {
        const monthly = toNumber(item.row.unitMonthlyPrice) * (1 - toNumber(item.row.discountPercent) / 100);
        const credit = prorateAmount(monthly * factor, period.start, period.end, now);
        pending.push({
          kind: InvoiceLineKind.CREDIT,
          label: `Avoir ${item.catalog.name} — montée de gamme du ${now.toISOString().slice(0, 10)}`,
          catalogItemId: item.catalog.id,
          subscriptionItemId: item.id,
          quantity: 1,
          unitPrice: -credit,
          amount: -credit,
          periodStart: now,
          periodEnd: period.end
        });
      }
      pending.push({
        kind: InvoiceLineKind.PRORATA,
        label: `${target.name} — prorata du ${now.toISOString().slice(0, 10)}`,
        catalogItemId: target.id,
        subscriptionItemId: created.id,
        quantity: 1,
        unitPrice: target.monthlyPrice,
        amount: prorateAmount(target.monthlyPrice * factor, period.start, period.end, now),
        periodStart: now,
        periodEnd: period.end
      });
      const percent = toNumber(subscription.comboDiscountPercent);
      const before = monthlyComboDiscount(standing.map(toChargeable), percent);
      const after = monthlyComboDiscount([...remaining, toEntitlementItem(created)].map(toChargeable), percent);
      const delta = prorateAmount((after - before) * factor, period.start, period.end, now);
      if (delta !== 0) {
        pending.push({
          kind: InvoiceLineKind.DISCOUNT,
          label: 'Remise de combinaison — prorata',
          quantity: 1,
          unitPrice: -delta,
          amount: -delta,
          periodStart: now,
          periodEnd: period.end
        });
      }
    }
    const pendingLines = await createPendingLinesTx(tx, tenantId, pending);
    const modules = immediate ? await syncTenantModulesTx(tx, tenantId, { now, actorUserId }) : null;
    return { created, pendingLines, modules, upgrade, immediate, switchAt };
  });

  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SUBSCRIPTION_PACK_CHANGED,
    entityType: 'SubscriptionItem',
    entityId: outcome.created.id,
    payload: {
      from: input.fromCodes,
      to: input.toCode,
      upgrade: outcome.upgrade,
      immediate: outcome.immediate,
      switchAt: outcome.switchAt.toISOString()
    }
  });
  return {
    item: serializeItem(outcome.created),
    upgrade: outcome.upgrade,
    immediate: outcome.immediate,
    switchAt: outcome.switchAt,
    pendingLines: outcome.pendingLines.map(serializeLine),
    modules: outcome.modules
  };
}

// =============================================================== derogations

export interface GrantOverrideInput {
  capacityKey: CapacityKey;
  delta: number;
  reason: string;
  startsAt?: Date;
  expiresAt?: Date | null;
}

/** Accorde une derogation de capacite (ex. « Reprise », D13). */
export async function grantCapacityOverride(tenantId: string, input: GrantOverrideInput, actorUserId: string | null, db: Db = prisma) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new BadRequestError('La dérogation doit être un entier non nul.');
  if (!input.reason?.trim()) throw new BadRequestError('Une dérogation exige une raison.');
  if (input.expiresAt && input.expiresAt.getTime() <= (input.startsAt ?? new Date()).getTime()) {
    throw new BadRequestError("La date d'expiration doit suivre la date de début.");
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new NotFoundError('Agence introuvable.');

  const created = await db.capacityOverride.create({
    data: {
      tenantId,
      capacityKey: input.capacityKey,
      delta: input.delta,
      reason: input.reason.trim(),
      startsAt: input.startsAt ?? new Date(),
      expiresAt: input.expiresAt ?? null,
      grantedByUserId: actorUserId
    }
  });
  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.CAPACITY_OVERRIDE_GRANTED,
    entityType: 'CapacityOverride',
    entityId: created.id,
    payload: {
      capacityKey: created.capacityKey,
      delta: created.delta,
      reason: created.reason,
      expiresAt: created.expiresAt?.toISOString() ?? null
    }
  });
  return created;
}

export async function revokeCapacityOverride(tenantId: string, overrideId: string, actorUserId: string) {
  const existing = await prisma.capacityOverride.findFirst({ where: { id: overrideId, tenantId } });
  if (!existing) throw new NotFoundError('Dérogation introuvable.');
  if (existing.revokedAt) throw new ConflictError('Cette dérogation est déjà révoquée.');
  const updated = await prisma.capacityOverride.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), revokedByUserId: actorUserId }
  });
  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.CAPACITY_OVERRIDE_REVOKED,
    entityType: 'CapacityOverride',
    entityId: updated.id,
    payload: { capacityKey: updated.capacityKey, delta: updated.delta }
  });
  return updated;
}

export async function listCapacityOverrides(tenantId: string) {
  return prisma.capacityOverride.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}

// =============================================================== reglages

export interface SubscriptionSettingsInput {
  quotaPolicy?: QuotaPolicy;
  graceDays?: number;
  comboDiscountPercent?: number;
  /** Prolonge (ou avance) la fin d'essai ; aligne la fin de periode pendant l'essai (D8). */
  trialEndsAt?: Date;
}

export async function updateSubscriptionSettings(tenantId: string, input: SubscriptionSettingsInput, actorUserId: string) {
  const subscription = await requireSubscription(prisma, tenantId);
  if (input.graceDays !== undefined && (!Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 90)) {
    throw new BadRequestError('Les jours de grâce doivent être compris entre 0 et 90.');
  }
  if (input.comboDiscountPercent !== undefined && (input.comboDiscountPercent < 0 || input.comboDiscountPercent > 100)) {
    throw new BadRequestError('La remise de combinaison doit être comprise entre 0 et 100 %.');
  }
  const trialing = subscription.status === SubscriptionStatus.TRIALING;
  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: {
      quotaPolicy: input.quotaPolicy,
      graceDays: input.graceDays,
      comboDiscountPercent: input.comboDiscountPercent,
      ...(input.trialEndsAt
        ? { trialEndsAt: input.trialEndsAt, ...(trialing ? { currentPeriodEnd: input.trialEndsAt } : {}) }
        : {})
    }
  });
  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SUBSCRIPTION_SETTINGS_UPDATED,
    entityType: 'Subscription',
    entityId: updated.id,
    payload: {
      changes: Object.keys(input),
      quotaPolicy: updated.quotaPolicy,
      graceDays: updated.graceDays,
      comboDiscountPercent: toNumber(updated.comboDiscountPercent),
      trialEndsAt: updated.trialEndsAt?.toISOString() ?? null
    }
  });
  return updated;
}

// =============================================================== vue d'ensemble

function serializeItem(row: ItemRow) {
  return {
    id: row.id,
    code: row.catalogItem.code,
    kind: row.catalogItem.kind,
    name: row.catalogItem.name,
    quantity: row.quantity,
    unitMonthlyPrice: toNumber(row.unitMonthlyPrice),
    unitSetupPrice: toNumber(row.unitSetupPrice),
    discountPercent: toNumber(row.discountPercent),
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    endReason: row.endReason,
    replacesItemId: row.replacesItemId,
    billedThrough: row.billedThrough,
    note: row.note
  };
}

function serializeLine(row: {
  id: string;
  kind: InvoiceLineKind;
  label: string;
  quantity: unknown;
  unitPrice: unknown;
  amount: unknown;
  subscriptionItemId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unitPrice),
    amount: toNumber(row.amount),
    subscriptionItemId: row.subscriptionItemId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd
  };
}

/** Abonnement, elements (y compris termines), derogations, lignes en attente et droits. */
export async function getSubscriptionOverview(tenantId: string) {
  const [subscription, items, overrides, pendingLines, entitlements] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId } }),
    prisma.subscriptionItem.findMany({ where: { tenantId }, include: itemInclude, orderBy: { createdAt: 'asc' } }),
    prisma.capacityOverride.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.invoiceLine.findMany({ where: { tenantId, invoiceId: null }, orderBy: { createdAt: 'asc' } }),
    getEntitlements(tenantId, { fresh: true })
  ]);
  if (!subscription) throw new NotFoundError('Abonnement introuvable.');
  return {
    subscription: { ...subscription, comboDiscountPercent: toNumber(subscription.comboDiscountPercent) },
    items: items.map(serializeItem),
    overrides,
    pendingLines: pendingLines.map(serializeLine),
    entitlements
  };
}

// =============================================================== apercu de facture

export interface InvoicePreview extends InvoiceTotals {
  tenantId: string;
  issuer: typeof PLATFORM_INVOICE_ISSUER;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  periodStart: Date;
  periodEnd: Date;
  /** Lignes en attente (prorata, avoirs) reprises par cette facture. */
  pendingLineIds: string[];
  /** Politique de quota : le depassement n'est chiffre qu'en BILL_OVERAGE. */
  quotaPolicy: QuotaPolicy;
}

/**
 * Apercu de la PROCHAINE facture, calcule sans rien emettre : recurrent de
 * la periode suivante (packs, extensions, remise de combinaison, x11 en
 * annuel), mises en route non facturees, lignes en attente (prorata,
 * avoirs), depassement mensuel au jour de l'apercu (BILL_OVERAGE), TVA 18 %.
 * L'emission reelle (numero, echeance, paiement) est la vague 3.
 */
export async function previewNextInvoice(tenantId: string, options: { now?: Date } = {}): Promise<InvoicePreview> {
  const now = options.now ?? new Date();
  const subscription = await requireSubscription(prisma, tenantId);
  const [state, usage, pending] = await Promise.all([
    loadState(prisma, tenantId),
    getUsage(tenantId),
    prisma.invoiceLine.findMany({ where: { tenantId, invoiceId: null }, orderBy: { createdAt: 'asc' } })
  ]);

  const periodStart =
    subscription.status === SubscriptionStatus.TRIALING
      ? subscription.trialEndsAt ?? subscription.currentPeriodEnd
      : subscription.currentPeriodEnd;
  const periodEnd = addBillingPeriod(periodStart, subscription.billingCycle);

  // Elements en vigueur au debut de la prochaine periode.
  const nextItems = effectiveItems(state.items, periodStart);
  const recurring = computeRecurringLines(nextItems.map(toChargeable), {
    comboDiscountPercent: toNumber(subscription.comboDiscountPercent)
  });
  const lines: ChargeLine[] = scaleLinesForCycle(recurring.lines, subscription.billingCycle).map(l => ({
    ...l,
    periodStart,
    periodEnd
  }));

  lines.push(
    ...computeSetupLines(
      state.items.filter(i => i.kind === 'SETUP' && !i.row.billedThrough && i.status !== 'ENDED').map(toChargeable)
    )
  );

  for (const line of pending) {
    lines.push({
      kind: line.kind,
      label: line.label,
      subscriptionItemId: line.subscriptionItemId ?? undefined,
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
      amount: toNumber(line.amount),
      periodStart: line.periodStart ?? undefined,
      periodEnd: line.periodEnd ?? undefined
    });
  }

  if (subscription.quotaPolicy === QuotaPolicy.BILL_OVERAGE) {
    const liveNow = effectiveItems(state.items, now);
    const held = heldPackCodes(liveNow);
    const entitlements = buildEntitlements({
      tenantId,
      subscription: null,
      items: liveNow,
      overrides: state.overrides,
      moduleRows: [],
      usage,
      enforcement: 'off',
      featuresFor: () => [],
      now
    });
    const extensionCodes: Record<CapacityKeyCode, string> = {
      LOTS: EXTENSION.LOTS_10,
      COPROPRIETES: EXTENSION.COPRO,
      CHANTIERS: EXTENSION.CHANTIER
    };
    const extensions = await loadCatalogByCodes(prisma, Object.values(extensionCodes));
    for (const key of CAPACITY_KEYS) {
      const capacity = entitlements.capacities[key];
      lines.push(
        ...computeOverageLines({
          capacityKey: key,
          limit: capacity.limit,
          used: capacity.used,
          heldPacks: held,
          extension: requireEntry(extensions, extensionCodes[key])
        })
      );
    }
  }

  return {
    tenantId,
    issuer: PLATFORM_INVOICE_ISSUER,
    billingCycle: subscription.billingCycle,
    periodStart,
    periodEnd,
    pendingLineIds: pending.map(l => l.id),
    quotaPolicy: subscription.quotaPolicy,
    ...finalizeInvoice(lines, PLATFORM_TAX_RATE_PERCENT)
  };
}

// =============================================================== souscription initiale

export interface RequestedItem {
  code: string;
  quantity?: number;
}

export interface PlannedItem {
  catalog: CatalogEntry;
  quantity: number;
  unitMonthlyPrice: number;
  unitSetupPrice: number;
}

/**
 * Valide et price une composition initiale (provisioning, reprise) : codes
 * connus et commercialises, au moins un pack, un pack au plus une fois,
 * exclusivite de l'Integre, extensions autorisees par les packs. Les blocs de
 * lots sont prices selon leur rang (un element par palier). Aucune ecriture.
 */
export function planInitialItems(requested: readonly RequestedItem[], catalog: Map<string, CatalogEntry>): PlannedItem[] {
  const merged = new Map<string, number>();
  for (const item of requested) {
    const quantity = item.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestError(`Quantité invalide pour ${item.code}.`);
    }
    merged.set(item.code, (merged.get(item.code) ?? 0) + quantity);
  }

  const entries = [...merged.entries()].map(([code, quantity]) => {
    const entry = catalog.get(code);
    if (!entry) throw new NotFoundError(`Offre introuvable dans le catalogue : ${code}.`);
    if (!entry.isSellable) throw new BadRequestError(`Offre non commercialisée : ${code}.`);
    return { entry, quantity };
  });

  const packs = entries.filter(e => e.entry.kind === CatalogItemKind.PACK);
  if (packs.length === 0) throw new BadRequestError('Choisissez au moins un pack.');
  const multiple = packs.find(p => p.quantity !== 1);
  if (multiple) throw new BadRequestError(`Un pack se souscrit une seule fois : ${multiple.entry.code}.`);
  const check = validateExclusivity(packs.map(p => ({ code: p.entry.code, kind: 'PACK' as const, exclusiveGroup: p.entry.exclusiveGroup })));
  if (!check.ok) {
    throw new BadRequestError(
      `Combinaison de packs impossible : ${check.conflicts.map(c => c.join(' / ')).join(', ')}. L'Intégré comprend déjà les trois modules.`
    );
  }

  const held = packs.map(p => p.entry.code);
  const planned: PlannedItem[] = packs.map(p => ({
    catalog: p.entry,
    quantity: 1,
    unitMonthlyPrice: p.entry.monthlyPrice,
    unitSetupPrice: 0
  }));

  for (const { entry, quantity } of entries) {
    if (entry.kind === CatalogItemKind.PACK) continue;
    if (!isExtensionAllowed(entry, held)) {
      throw new BadRequestError(`${entry.name} exige un pack qui n'est pas choisi.`);
    }
    if (entry.kind === CatalogItemKind.SETUP) {
      planned.push({ catalog: entry, quantity, unitMonthlyPrice: 0, unitSetupPrice: entry.setupPrice });
      continue;
    }
    const capacityKey = (Object.keys(entry.capacities)[0] ?? 'LOTS') as CapacityKeyCode;
    const before = planned.reduce((s, p) => s + (p.catalog.capacities[capacityKey] ?? 0) * p.quantity, 0);
    for (const segment of planExtensionUnits(entry, held, quantity, before)) {
      planned.push({ catalog: entry, quantity: segment.quantity, unitMonthlyPrice: segment.unitMonthlyPrice, unitSetupPrice: 0 });
    }
  }
  return planned;
}

// =============================================================== derogation de module

/**
 * Rend un module a ses packs : supprime la derogation (OVERRIDE) posee par un
 * basculement manuel du super-admin, puis resynchronise.
 */
export async function clearModuleOverride(tenantId: string, moduleKey: ModuleKey, actorUserId: string) {
  const result = await prisma.$transaction(async tx => {
    const row = await tx.tenantModule.findFirst({ where: { tenantId, moduleKey } });
    if (!row || row.source !== 'OVERRIDE') throw new NotFoundError('Aucune dérogation sur ce module.');
    await tx.tenantModule.update({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      data: { source: 'PACK', expiresAt: null }
    });
    return syncTenantModulesTx(tx, tenantId, { actorUserId });
  });
  invalidateEntitlements(tenantId);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.MODULE_OVERRIDE_CLEARED,
    entityType: 'TenantModule',
    entityId: `${tenantId}:${moduleKey}`,
    payload: { moduleKey, ...result }
  });
  return result;
}
