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
import { logAuditEvent, recordAuditEvent, AuditActionKey } from './audit-service';
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
  PARTICULIER_PACKS,
  PATRIMOINE_PACKS,
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
import {
  countActiveCopros,
  countActiveLots,
  countActiveSites,
  countHeldProperties,
  reconcileLotActivationsTx,
  tenantCountsHeldProperties
} from './lot-registry-service';

type Db = PrismaTransactionClient | typeof prisma;

/**
 * Ouvre une transaction sur `db`, ou reutilise `db` s'il est deja un client de
 * transaction (pas de transaction imbriquee) : l'ecriture metier et son
 * evenement d'audit critique s'engagent ensemble.
 */
function runInTransaction<T>(db: Db, fn: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> {
  return '$transaction' in db ? db.$transaction(fn) : fn(db);
}

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
export async function listCatalog(
  options: { includeUnsellable?: boolean } = {},
  db: Db = prisma
): Promise<CatalogEntry[]> {
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

/**
 * Comme `loadCatalogByCodes`, mais les codes absents sont simplement omis
 * (aucune erreur). Sert aux lignes optionnelles : la mise en route
 * `SETUP_<pack>` n'existe pas pour les packs Particulier (mise en route 0).
 */
export async function loadExistingCatalogByCodes(db: Db, codes: readonly string[]): Promise<Map<string, CatalogEntry>> {
  const rows = await db.catalogItem.findMany({ where: { code: { in: [...new Set(codes)] } }, include: catalogInclude });
  return new Map(rows.map(r => [r.code, toCatalogEntry(r)]));
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
export async function updateCatalogItem(
  code: string,
  patch: CatalogItemPatch,
  actorUserId: string
): Promise<CatalogEntry> {
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
    payload: { code, before: toCatalogEntry(existing), after: toCatalogEntry(updated) } as unknown as Record<
      string,
      unknown
    >
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
  CHANTIERS: countActiveSites,
  BIENS_DETENUS: countHeldProperties,
  ACTIFS: countActiveAssets,
  PHOTOS_INVENTAIRE: countInventoryPhotosThisMonth
};

/**
 * Photos analysees par l'IA dans le MOIS CIVIL UTC courant (capacite
 * PHOTOS_INVENTAIRE, lot 041, W11-R2) : `StockWhatsappUsage.used` du mois,
 * 0 sans ligne. Une CONSOMMATION, pas un stock : le compteur repart de zero
 * chaque mois. Il n'est ecrit que par la reservation atomique du quota
 * (`src/lib/stock-whatsapp/quota.ts`, jamais lu puis reecrit) ; ce fournisseur
 * ne fait que le lire.
 *
 * Vit ici et non dans `quota.ts` : le quota lit `getEntitlements` de ce
 * service, l'inverse creerait un cycle d'import. `quota.ts` peut l'exposer
 * sous le nom du contrat (`countWhatsappPhotosThisMonth`, plan 041 §3.3).
 */
export async function countInventoryPhotosThisMonth(db: Db, tenantId: string, now: Date = new Date()): Promise<number> {
  const month = now.toISOString().slice(0, 7);
  const row = await db.stockWhatsappUsage.findUnique({
    where: { tenantId_month: { tenantId, month } },
    select: { used: true }
  });
  return row?.used ?? 0;
}

/**
 * Actifs de patrimoine du tenant (capacite ACTIFS, packs Particulier) : les
 * actifs (`Asset`) non archives PLUS les biens non archives qui n'ont aucun
 * actif lie. Un actif immobilier lie a un bien compte une fois — jamais le
 * bien ET l'actif — et un bien sans actif (cree avant sa premiere valorisation)
 * compte deja. Deux comptages directs, filtres par `tenantId`, sans jointure ;
 * `DISPOSED` (vendu, cede) reste compte, seul `ARCHIVED` libere une place.
 */
export async function countActiveAssets(db: Db, tenantId: string): Promise<number> {
  const [assets, propertiesWithoutAsset] = await Promise.all([
    db.asset.count({ where: { tenantId, status: { not: 'ARCHIVED' } } }),
    db.property.count({ where: { tenantId, status: { not: 'ARCHIVED' }, asset: { is: null } } })
  ]);
  return assets + propertiesWithoutAsset;
}

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
    tierGroup: catalog.rules?.tierGroup ?? null,
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
          quotaPolicy: sub.quotaPolicy,
          manualReadOnlyAt: sub.manualReadOnlyAt,
          manualReadOnlyReason: sub.manualReadOnlyReason
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
 * L'agence a-t-elle des donnees dans ce module ? D11 (module retire en lecture
 * seule avec export) ne vise que ces donnees : un module retire sans aucune
 * donnee (pack ajoute par erreur puis retire) n'ouvre plus aucun acces. Les
 * compteurs comptent tous les statuts (une copropriete ou un chantier clos
 * reste une donnee a exporter).
 */
export async function moduleHoldsData(db: Db, tenantId: string, moduleKey: ModuleKey): Promise<boolean> {
  switch (moduleKey) {
    case 'MODULE_SYNDIC':
      return (await db.syndicate.count({ where: { tenantId } })) > 0;
    case 'MODULE_PROMOTER':
      return (await db.constructionSite.count({ where: { tenantId } })) > 0;
    case 'MODULE_PATRIMOINE':
      return (await db.property.count({ where: { tenantId, ownershipType: 'TENANT' } })) > 0;
    case 'MODULE_AGENCY': {
      const [clientProperties, mandates] = await Promise.all([
        db.property.count({ where: { tenantId, ownershipType: { not: 'TENANT' } } }),
        db.propertyMandate.count({ where: { tenantId } })
      ]);
      return clientProperties + mandates > 0;
    }
    default:
      return true; // module inconnu : la prudence garde l'acces en lecture
  }
}

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
          data: {
            tenantId,
            moduleKey,
            enabled: true,
            enabledAt: now,
            enabledBy: options.actorUserId ?? null,
            source: 'PACK'
          }
        });
        enabled.push(moduleKey);
      }
      continue;
    }
    const wasEnabled = row.enabled;
    if (wasEnabled === want && row.source === 'PACK') continue;
    // eslint-disable-next-line no-await-in-loop -- trois modules au plus.
    const keepReadOnly = !want && wasEnabled ? await moduleHoldsData(tx, tenantId, moduleKey) : false;
    // eslint-disable-next-line no-await-in-loop -- trois modules au plus.
    await tx.tenantModule.update({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      data: {
        source: 'PACK',
        expiresAt: null,
        enabled: want,
        ...(want && !wasEnabled ? { enabledAt: now, enabledBy: options.actorUserId ?? null } : {}),
        // D11 ne protège que des DONNÉES : sans donnée dans le module retiré,
        // aucun accès n'est conservé (NONE), même après un ajout retiré aussitôt.
        ...(!want && wasEnabled ? { disabledAt: keepReadOnly ? now : null } : {})
      }
    });
    if (want && !wasEnabled) enabled.push(moduleKey);
    if (!want && wasEnabled) disabled.push(moduleKey);
  }
  return { enabled, disabled };
}

/**
 * Pack auquel rattacher une extension (decision de Baba du 25/09 : une
 * extension achetee avec un pack est retiree a la meme echeance que lui) :
 * le plus ancien pack en vigueur qui l'autorise (Syndic/Integre pour une
 * copropriete, Promoteur/Integre pour un chantier, tout pack pour des lots).
 */
export function choosePackForExtension(
  extension: Pick<CatalogEntry, 'rules'>,
  packs: ReadonlyArray<{ id: string; code: string }>
): string | null {
  return packs.find(pack => isExtensionAllowed(extension, [pack.code]))?.id ?? null;
}

/**
 * Rattache a un pack les extensions en vigueur qui n'en ont pas (souscription
 * initiale en `createMany`, reprise). Idempotent.
 */
export async function linkExtensionsToPacksTx(tx: Db, tenantId: string): Promise<number> {
  const rows = await tx.subscriptionItem.findMany({
    where: { tenantId, status: { not: SubscriptionItemStatus.ENDED } },
    include: itemInclude,
    orderBy: { createdAt: 'asc' }
  });
  const packs = rows
    .filter(r => r.catalogItem.kind === CatalogItemKind.PACK)
    .map(r => ({ id: r.id, code: r.catalogItem.code }));
  let linked = 0;
  for (const row of rows) {
    if (row.catalogItem.kind !== CatalogItemKind.EXTENSION || row.parentItemId) continue;
    const parentItemId = choosePackForExtension(toCatalogEntry(row.catalogItem), packs);
    if (!parentItemId) continue;
    // eslint-disable-next-line no-await-in-loop -- quelques extensions au plus.
    await tx.subscriptionItem.update({ where: { id: row.id }, data: { parentItemId } });
    linked += 1;
  }
  return linked;
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
  const countedBefore = await tenantCountsHeldProperties(tx, tenantId, now);
  // Filet : une extension dont le pack est termine s'arrete avec lui, meme
  // si son echeance n'avait pas ete posee (retrait anterieur a la vague 2).
  await tx.subscriptionItem.updateMany({
    where: {
      tenantId,
      status: { not: SubscriptionItemStatus.ENDED },
      endsAt: null,
      parentItem: { status: SubscriptionItemStatus.ENDED }
    },
    data: { endsAt: now, endReason: 'PACK_REMOVED' }
  });
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
    // Echeance (retrait ou pack programme qui demarre) : reclasse si le droit Patrimoine a change (lot P1).
    await reconcileHeldPropertiesIfChangedTx(tx, tenantId, countedBefore, now);
    invalidateEntitlements(tenantId);
  }
  return { ended: ended.count, started: started.count };
}

// =============================================================== elements

function isTrial(subscription: { status: SubscriptionStatus }): boolean {
  return subscription.status === SubscriptionStatus.TRIALING;
}

/** Elements en vigueur maintenant et pas deja programmes pour finir. */
function standingItems<T extends Pick<EntitlementItem, 'status' | 'startsAt' | 'endsAt'>>(
  items: readonly T[],
  now: Date
): T[] {
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

/**
 * Reclasse le registre des lots (RENTAL_UNIT <-> HELD_PROPERTY) quand un pack
 * Patrimoine entre ou sort du droit de l'agence, DANS la meme transaction
 * qu'un ajout, un retrait immediat ou un changement de pack (lot P1) :
 * `countedBefore` doit etre capture AVANT l'ecriture qui peut changer ce
 * droit. Sans effet si rien n'a change (aucune agence hors Patrimoine n'est
 * concernee).
 */
async function reconcileHeldPropertiesIfChangedTx(
  tx: Db,
  tenantId: string,
  countedBefore: boolean,
  now: Date,
  actorUserId?: string | null
): Promise<void> {
  const countedAfter = await tenantCountsHeldProperties(tx, tenantId, now);
  if (countedAfter === countedBefore) return;
  await reconcileLotActivationsTx(tx, tenantId, { actorUserId: actorUserId ?? null });
}

export interface AddItemInput {
  code: string;
  quantity?: number;
  discountPercent?: number;
  note?: string;
  /** Extension : pack auquel la lier (par defaut, le plus ancien pack qui l'autorise). */
  parentItemId?: string;
}

/**
 * Ajoute un pack, une extension ou une mise en route (D7 : ajout IMMEDIAT,
 * facture au prorata des jours restants — sauf pendant l'essai). Le prix est
 * fige depuis le catalogue ; un bloc de lots est price selon le rang des lots
 * qu'il couvre (un element par palier de prix). Un pack incompatible
 * (exclusivite de l'Integre) est refuse : passer par `changePack`.
 */
/** Refus d'une extension hors pack : dit avec quels packs elle se vend, et que l'exces est facture sinon. */
async function requiredPackMessage(db: Db, extension: CatalogEntry): Promise<string> {
  const codes = extension.rules?.requiresAnyOf ?? [];
  const packs = codes.length
    ? await db.catalogItem.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } })
    : [];
  const names = codes.map(code => packs.find(p => p.code === code)?.name ?? code).join(', ');
  const isCapacity = Object.keys(extension.capacities).length > 0;
  return `${extension.name} n'est vendu qu'avec : ${names}.${isCapacity ? " Avec votre pack, l'excédent est facturé selon la grille du pack." : ''}`;
}

export async function addSubscriptionItem(tenantId: string, input: AddItemInput, actorUserId: string) {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new BadRequestError('La quantité doit être un entier positif.');

  const outcome = await prisma.$transaction(async tx => {
    const now = new Date();
    const subscription = await requireSubscription(tx, tenantId);
    const catalog = await loadCatalogItem(tx, input.code);
    if (!catalog.isSellable) throw new BadRequestError("Cette offre n'est plus commercialisée.");
    const countedBefore = await tenantCountsHeldProperties(tx, tenantId, now);

    const state = await loadState(tx, tenantId);
    const standing = standingItems(state.items, now);
    const held = heldPackCodes(standing);

    if (catalog.kind === CatalogItemKind.PACK) {
      if (quantity !== 1) throw new BadRequestError('Un pack se souscrit une seule fois.');
      if (held.includes(catalog.code)) throw new ConflictError('Ce pack est déjà souscrit.');
      const check = validateExclusivity([
        ...standing,
        {
          code: catalog.code,
          kind: 'PACK',
          exclusiveGroup: catalog.exclusiveGroup,
          tierGroup: catalog.rules?.tierGroup ?? null
        }
      ]);
      if (!check.ok) {
        throw new BadRequestError(
          `Pack incompatible avec l'abonnement actuel (${check.conflicts.map(c => c.join(' / ')).join(', ')}) : utilisez le changement de pack.`
        );
      }
    } else if (catalog.kind === CatalogItemKind.EXTENSION && !isExtensionAllowed(catalog, held)) {
      throw new BadRequestError(await requiredPackMessage(tx, catalog));
    }

    // Extension : liee au pack avec lequel elle est achetee (retiree avec lui).
    let parentItemId: string | null = null;
    if (catalog.kind === CatalogItemKind.EXTENSION) {
      const packs = standing.filter(i => i.kind === 'PACK').map(i => ({ id: i.id, code: i.code }));
      if (input.parentItemId) {
        const chosen = packs.find(p => p.id === input.parentItemId);
        if (!chosen || !isExtensionAllowed(catalog, [chosen.code])) {
          throw new BadRequestError("Le pack indiqué n'autorise pas cette extension.");
        }
        parentItemId = chosen.id;
      } else {
        parentItemId = choosePackForExtension(catalog, packs);
      }
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
          parentItemId,
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
    const modules =
      catalog.kind === CatalogItemKind.PACK ? await syncTenantModulesTx(tx, tenantId, { now, actorUserId }) : null;
    if (catalog.kind === CatalogItemKind.PACK) {
      await reconcileHeldPropertiesIfChangedTx(tx, tenantId, countedBefore, now, actorUserId);
    }
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
export async function removeSubscriptionItem(
  tenantId: string,
  itemId: string,
  input: RemoveItemInput,
  actorUserId: string
) {
  if (input.immediate && !input.reason?.trim()) {
    throw new BadRequestError('Un retrait immédiat exige une raison.');
  }

  const outcome = await prisma.$transaction(async tx => {
    const now = new Date();
    const subscription = await requireSubscription(tx, tenantId);
    const row = await tx.subscriptionItem.findFirst({ where: { id: itemId, tenantId }, include: itemInclude });
    if (!row) throw new NotFoundError('Élément d’abonnement introuvable.');
    if (row.status === SubscriptionItemStatus.ENDED) throw new ConflictError('Cet élément est déjà terminé.');
    const countedBefore = await tenantCountsHeldProperties(tx, tenantId, now);

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

    // Retrait d'un pack : ses extensions partent a la meme echeance (decision
    // de Baba du 25/09), sans remboursement, meme en retrait immediat.
    let extensionsEnded: string[] = [];
    if (row.catalogItem.kind === CatalogItemKind.PACK) {
      const linked = await tx.subscriptionItem.findMany({
        where: { tenantId, parentItemId: row.id, status: { not: SubscriptionItemStatus.ENDED } },
        select: { id: true, endsAt: true }
      });
      extensionsEnded = linked.filter(e => !e.endsAt || e.endsAt.getTime() > endsAt.getTime()).map(e => e.id);
      if (extensionsEnded.length > 0) {
        await tx.subscriptionItem.updateMany({
          where: { tenantId, id: { in: extensionsEnded } },
          data: {
            endsAt,
            endReason: 'PACK_REMOVED',
            endedByUserId: actorUserId,
            ...(immediate ? { status: SubscriptionItemStatus.ENDED } : {})
          }
        });
      }
    }

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
          parentItemId: row.parentItemId,
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
    // Retrait immediat d'un pack Patrimoine : reclasse aussitot (lot P1).
    await reconcileHeldPropertiesIfChangedTx(tx, tenantId, countedBefore, now, actorUserId);
    return { ended, remainder, immediate, removeQty, modules, extensionsEnded };
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
      remainderItemId: outcome.remainder?.id ?? null,
      extensionsEnded: outcome.extensionsEnded
    }
  });
  return {
    item: serializeItem(outcome.ended),
    remainder: outcome.remainder ? serializeItem(outcome.remainder) : null,
    immediate: outcome.immediate,
    modules: outcome.modules,
    /** Extensions liees au pack, retirees a la meme echeance. */
    extensionsEnded: outcome.extensionsEnded
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
    const countedBefore = await tenantCountsHeldProperties(tx, tenantId, now);

    const state = await loadState(tx, tenantId);
    const standing = standingItems(state.items, now);
    const fromItems = standing.filter(i => i.kind === 'PACK' && input.fromCodes.includes(i.code));
    const missing = input.fromCodes.filter(code => !fromItems.some(i => i.code === code));
    if (missing.length > 0) throw new BadRequestError(`Pack(s) non souscrit(s) : ${missing.join(', ')}.`);
    if (heldPackCodes(standing).includes(target.code)) throw new ConflictError('Ce pack est déjà souscrit.');

    const remaining = standing.filter(i => !fromItems.includes(i));
    const check = validateExclusivity([
      ...remaining,
      {
        code: target.code,
        kind: 'PACK',
        exclusiveGroup: target.exclusiveGroup,
        tierGroup: target.rules?.tierGroup ?? null
      }
    ]);
    if (!check.ok) {
      throw new BadRequestError(
        `Combinaison de packs impossible : ${check.conflicts.map(c => c.join(' / ')).join(', ')}.`
      );
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

    // Extensions des packs remplaces : suivent le nouveau pack (ou un pack
    // restant) qui les autorise, sinon partent a la date du changement — avec
    // un avoir au prorata comme leur pack si le changement est immediat (D7,
    // lot P1 : ex. EXT_BIENS_10 au passage Essentiel -> Pro).
    const remainingPacks = remaining.filter(i => i.kind === 'PACK').map(i => ({ id: i.id, code: i.code }));
    const linkedExtensions = await tx.subscriptionItem.findMany({
      where: {
        tenantId,
        parentItemId: { in: fromItems.map(i => i.id) },
        status: { not: SubscriptionItemStatus.ENDED }
      },
      include: itemInclude
    });
    const endedExtensions: Array<{
      id: string;
      catalogId: string;
      name: string;
      quantity: number;
      unitMonthlyPrice: unknown;
      discountPercent: unknown;
    }> = [];
    for (const ext of linkedExtensions) {
      const entry = toCatalogEntry(ext.catalogItem);
      const newParent = choosePackForExtension(entry, [{ id: created.id, code: target.code }, ...remainingPacks]);
      // eslint-disable-next-line no-await-in-loop -- quelques extensions au plus.
      await tx.subscriptionItem.update({
        where: { id: ext.id },
        data: newParent
          ? { parentItemId: newParent }
          : {
              endsAt: switchAt,
              endReason: 'PACK_REMOVED',
              endedByUserId: actorUserId,
              ...(immediate ? { status: SubscriptionItemStatus.ENDED } : {})
            }
      });
      if (!newParent) {
        endedExtensions.push({
          id: ext.id,
          catalogId: entry.id,
          name: entry.name,
          quantity: ext.quantity,
          unitMonthlyPrice: ext.unitMonthlyPrice,
          discountPercent: ext.discountPercent
        });
      }
    }

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
      for (const ext of endedExtensions) {
        const monthly = toNumber(ext.unitMonthlyPrice) * ext.quantity * (1 - toNumber(ext.discountPercent) / 100);
        const credit = prorateAmount(monthly * factor, period.start, period.end, now);
        pending.push({
          kind: InvoiceLineKind.CREDIT,
          label: `Avoir ${ext.name} — montée de gamme du ${now.toISOString().slice(0, 10)}`,
          catalogItemId: ext.catalogId,
          subscriptionItemId: ext.id,
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
    // Changement immediat (montee) : reclasse aussitot si le droit Patrimoine a change (lot P1).
    if (immediate) await reconcileHeldPropertiesIfChangedTx(tx, tenantId, countedBefore, now, actorUserId);
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
export async function grantCapacityOverride(
  tenantId: string,
  input: GrantOverrideInput,
  actorUserId: string | null,
  db: Db = prisma
) {
  if (!Number.isInteger(input.delta) || input.delta === 0)
    throw new BadRequestError('La dérogation doit être un entier non nul.');
  if (!input.reason?.trim()) throw new BadRequestError('Une dérogation exige une raison.');
  if (input.expiresAt && input.expiresAt.getTime() <= (input.startsAt ?? new Date()).getTime()) {
    throw new BadRequestError("La date d'expiration doit suivre la date de début.");
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new NotFoundError('Agence introuvable.');

  const created = await runInTransaction(db, async tx => {
    const row = await tx.capacityOverride.create({
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
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.CAPACITY_OVERRIDE_GRANTED,
      entityType: 'CapacityOverride',
      entityId: row.id,
      payload: {
        capacityKey: row.capacityKey,
        delta: row.delta,
        reason: row.reason,
        expiresAt: row.expiresAt?.toISOString() ?? null
      }
    });
    return row;
  });
  invalidateEntitlements(tenantId);
  return created;
}

export async function revokeCapacityOverride(tenantId: string, overrideId: string, actorUserId: string) {
  const existing = await prisma.capacityOverride.findFirst({ where: { id: overrideId, tenantId } });
  if (!existing) throw new NotFoundError('Dérogation introuvable.');
  if (existing.revokedAt) throw new ConflictError('Cette dérogation est déjà révoquée.');
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.capacityOverride.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedByUserId: actorUserId }
    });
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.CAPACITY_OVERRIDE_REVOKED,
      entityType: 'CapacityOverride',
      entityId: row.id,
      payload: { capacityKey: row.capacityKey, delta: row.delta }
    });
    return row;
  });
  invalidateEntitlements(tenantId);
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

export async function updateSubscriptionSettings(
  tenantId: string,
  input: SubscriptionSettingsInput,
  actorUserId: string
) {
  const subscription = await requireSubscription(prisma, tenantId);
  if (
    input.graceDays !== undefined &&
    (!Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 90)
  ) {
    throw new BadRequestError('Les jours de grâce doivent être compris entre 0 et 90.');
  }
  if (
    input.comboDiscountPercent !== undefined &&
    (input.comboDiscountPercent < 0 || input.comboDiscountPercent > 100)
  ) {
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

// =============================================================== lecture seule manuelle

/**
 * Lecture seule manuelle (Baba, 25/09) : action super-admin, motif
 * obligatoire, independante de la lecture seule d'impaye — jamais posee ni
 * levee par un paiement ou la tache planifiee (`resolveSubscriptionPhase`,
 * `manualReadOnlyAt`). Portails, paiements et factures restent accessibles
 * (route-features existantes, non concernees par `assertSubscriptionWritable`).
 */
export async function setSubscriptionManualReadOnly(tenantId: string, reason: string, actorUserId: string) {
  const subscription = await requireSubscription(prisma, tenantId);
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new BadRequestError('Le motif de la lecture seule manuelle doit compter au moins 3 caractères.');
  }
  // Capture avant l'ecriture : le faux client Prisma des tests mute la meme
  // ligne en place, contrairement au vrai client qui renvoie un objet neuf.
  const previousManualReadOnlyAt = subscription.manualReadOnlyAt?.toISOString() ?? null;
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.subscription.update({
      where: { tenantId },
      data: { manualReadOnlyAt: new Date(), manualReadOnlyReason: trimmed }
    });
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_MANUAL_READ_ONLY_SET,
      entityType: 'Subscription',
      entityId: row.id,
      payload: { reason: trimmed, previousManualReadOnlyAt }
    });
    return row;
  });
  invalidateEntitlements(tenantId);
  return updated;
}

/** Leve la lecture seule manuelle : seul le super-admin peut le faire. */
export async function clearSubscriptionManualReadOnly(tenantId: string, actorUserId: string) {
  const subscription = await requireSubscription(prisma, tenantId);
  if (!subscription.manualReadOnlyAt) {
    throw new BadRequestError("L'abonnement n'est pas en lecture seule manuelle.");
  }
  // Capture avant l'ecriture : le faux client Prisma des tests mute la meme
  // ligne en place, contrairement au vrai client qui renvoie un objet neuf.
  const previousReason = subscription.manualReadOnlyReason;
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.subscription.update({
      where: { tenantId },
      data: { manualReadOnlyAt: null, manualReadOnlyReason: null }
    });
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_MANUAL_READ_ONLY_CLEARED,
      entityType: 'Subscription',
      entityId: row.id,
      payload: { previousReason }
    });
    return row;
  });
  invalidateEntitlements(tenantId);
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
    parentItemId: row.parentItemId,
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
  /**
   * Rythme de facturation du depassement. MONTHLY-cycle : dans la facture de
   * la periode (`IN_PERIOD_INVOICE`). ANNUAL : facture a part CHAQUE MOIS
   * (`MONTHLY_SEPARATE`), jamais multiplie par 11 ; voir `overageInvoice`.
   */
  overageBilling: 'IN_PERIOD_INVOICE' | 'MONTHLY_SEPARATE';
  /** Annuel seulement : la prochaine facture mensuelle de depassement (null sinon). */
  overageInvoice: OverageInvoicePreview | null;
}

export interface OverageInvoicePreview extends InvoiceTotals {
  /** Mois de depassement couvert : fenetre mensuelle ancree sur le debut de la periode annuelle. */
  periodStart: Date;
  periodEnd: Date;
  /** Consommation retenue par capacite : pic du mois (UsageSnapshot) ou consommation du jour si plus haute. */
  usage: Record<CapacityKeyCode, { used: number; limit: number }>;
}

/**
 * Fenetre mensuelle de depassement d'un abonnement ANNUEL qui contient `now`,
 * ancree sur `periodStart` (ex. periode du 15/01 : 15/01-15/02, 15/02-15/03...).
 * Regle de Baba du 25/09 : en annuel, le pack reste paye a l'annee et le
 * depassement est facture CHAQUE MOIS, a la fin de chaque fenetre.
 */
export function monthlyOverageWindow(periodStart: Date, now: Date): { start: Date; end: Date } {
  let start = new Date(periodStart.getTime());
  let end = addBillingPeriod(start, 'MONTHLY');
  // 12 fenetres par an au plus ; la borne evite toute boucle sans fin.
  for (let i = 0; i < 24 && end.getTime() <= now.getTime(); i += 1) {
    start = end;
    end = addBillingPeriod(start, 'MONTHLY');
  }
  return { start, end };
}

/** Lignes de depassement (BILL_OVERAGE) pour une consommation donnee, aux prix du catalogue. */
async function computeOverageForUsage(
  tenantId: string,
  state: Awaited<ReturnType<typeof loadState>>,
  usage: Record<CapacityKeyCode, number>,
  at: Date
): Promise<{ lines: ChargeLine[]; usage: Record<CapacityKeyCode, { used: number; limit: number }> }> {
  const liveNow = effectiveItems(state.items, at);
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
    now: at
  });
  // ACTIFS n'a ni extension ni depassement facture : au-dela du plafond, le
  // palier gratuit refuse l'ajout (garde du lot 4B) ; rien n'est facture.
  // PHOTOS_INVENTAIRE (lot 041, W11-R2) non plus, VOLONTAIREMENT : au-dela du
  // quota du mois, le bot refuse la photo (M07) ; aucun depassement facture.
  // Ne pas lui ajouter d'entree ici (EXT_INVENTAIRE_WHATSAPP n'est pas une
  // extension de depassement).
  const extensionCodes: Partial<Record<CapacityKeyCode, string>> = {
    LOTS: EXTENSION.LOTS_10,
    COPROPRIETES: EXTENSION.COPRO,
    CHANTIERS: EXTENSION.CHANTIER,
    BIENS_DETENUS: EXTENSION.BIENS_10
  };
  const extensions = await loadCatalogByCodes(prisma, Object.values(extensionCodes) as string[]);
  const lines: ChargeLine[] = [];
  const retained = {} as Record<CapacityKeyCode, { used: number; limit: number }>;
  for (const key of CAPACITY_KEYS) {
    const capacity = entitlements.capacities[key];
    retained[key] = { used: capacity.used, limit: capacity.limit };
    const extensionCode = extensionCodes[key];
    if (!extensionCode) continue;
    lines.push(
      ...computeOverageLines({
        capacityKey: key,
        limit: capacity.limit,
        used: capacity.used,
        heldPacks: held,
        extension: requireEntry(extensions, extensionCode)
      })
    );
  }
  return { lines, usage: retained };
}

/**
 * Apercu de la PROCHAINE facture, calcule sans rien emettre : recurrent de
 * la periode suivante (packs, extensions, remise de combinaison, x11 en
 * annuel), mises en route non facturees, lignes en attente (prorata,
 * avoirs), TVA 18 %. Depassement (BILL_OVERAGE) : en mensuel, dans cette
 * facture au jour de l'apercu ; en ANNUEL, facture a part chaque mois
 * (`overageInvoice`, regle de Baba du 25/09).
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
      ? (subscription.trialEndsAt ?? subscription.currentPeriodEnd)
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

  // Depassement (BILL_OVERAGE seulement). Mensuel : dans la facture de la
  // periode, au jour de l'apercu. Annuel : JAMAIS dans la facture annuelle ;
  // facture a part chaque mois (`overageInvoice`), sans multiplicateur.
  const annual = subscription.billingCycle === 'ANNUAL';
  let overageInvoice: OverageInvoicePreview | null = null;
  if (subscription.quotaPolicy === QuotaPolicy.BILL_OVERAGE) {
    if (!annual) {
      lines.push(...(await computeOverageForUsage(tenantId, state, usage, now)).lines);
    } else if (subscription.status !== SubscriptionStatus.TRIALING) {
      overageInvoice = await previewMonthlyOverage(tenantId, state, usage, subscription.currentPeriodStart, now);
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
    overageBilling: annual ? 'MONTHLY_SEPARATE' : 'IN_PERIOD_INVOICE',
    overageInvoice,
    ...finalizeInvoice(lines, PLATFORM_TAX_RATE_PERCENT)
  };
}

/**
 * Facture mensuelle de depassement d'un abonnement ANNUEL (vague 3 : a
 * emettre a la fin de chaque fenetre `monthlyOverageWindow`). Consommation
 * retenue : le PIC des releves quotidiens (UsageSnapshot) de la fenetre, ou
 * la consommation du jour si elle est plus haute.
 */
async function previewMonthlyOverage(
  tenantId: string,
  state: Awaited<ReturnType<typeof loadState>>,
  usageNow: Record<CapacityKeyCode, number>,
  annualPeriodStart: Date,
  now: Date
): Promise<OverageInvoicePreview> {
  const window = monthlyOverageWindow(annualPeriodStart, now);
  const peaks = await prisma.usageSnapshot.groupBy({
    by: ['capacityKey'],
    where: { tenantId, snapshotDate: { gte: window.start, lt: window.end } },
    _max: { used: true }
  });
  const usage = { ...usageNow };
  for (const peak of peaks) {
    const key = peak.capacityKey as CapacityKeyCode;
    usage[key] = Math.max(usage[key] ?? 0, peak._max.used ?? 0);
  }
  const overage = await computeOverageForUsage(tenantId, state, usage, now);
  const lines = overage.lines.map(l => ({ ...l, periodStart: window.start, periodEnd: window.end }));
  return {
    periodStart: window.start,
    periodEnd: window.end,
    usage: overage.usage,
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
 * Regles de composition des PACKS, partagees par la creation d'agence, la
 * reprise et le devis super-admin (une seule validation, pas de copie) :
 * un pack une seule fois, exclusivite de l'Integre, meme palier (`tierGroup`)
 * non cumulable. Ne verifie ni les codes ni la vente : voir `planInitialItems`.
 */
export function assertPackComposition(packs: readonly CatalogEntry[]): void {
  const check = validateExclusivity(
    packs.map(p => ({
      code: p.code,
      kind: 'PACK' as const,
      exclusiveGroup: p.exclusiveGroup,
      tierGroup: p.rules?.tierGroup ?? null
    }))
  );
  if (check.ok) return;
  if (check.duplicates.length > 0) {
    throw new BadRequestError(`Un pack se souscrit une seule fois : ${check.duplicates.join(', ')}.`);
  }
  const tierClash = check.conflicts.find(([a, b]) => PATRIMOINE_PACKS.includes(a) && PATRIMOINE_PACKS.includes(b));
  if (tierClash) {
    throw new BadRequestError('Patrimoine Essentiel et Patrimoine Pro ne se cumulent pas : choisissez l’un des deux.');
  }
  const particulierClash = check.conflicts.find(
    ([a, b]) => PARTICULIER_PACKS.includes(a) && PARTICULIER_PACKS.includes(b)
  );
  if (particulierClash) {
    throw new BadRequestError('Particulier Gratuit et Particulier Plus ne se cumulent pas : choisissez l’un des deux.');
  }
  throw new BadRequestError(
    `Combinaison de packs impossible : ${check.conflicts.map(c => c.join(' / ')).join(', ')}. L'Intégré comprend déjà les trois modules.`
  );
}

/**
 * Valide et price une composition initiale (provisioning, reprise) : codes
 * connus et commercialises, au moins un pack, un pack au plus une fois,
 * exclusivite de l'Integre, extensions autorisees par les packs. Les blocs de
 * lots sont prices selon leur rang (un element par palier). Aucune ecriture.
 */
export function planInitialItems(
  requested: readonly RequestedItem[],
  catalog: Map<string, CatalogEntry>
): PlannedItem[] {
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
  assertPackComposition(packs.map(p => p.entry));

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
      throw new BadRequestError(
        `${entry.name} n'est vendu qu'avec : ${(entry.rules?.requiresAnyOf ?? []).map(c => catalog.get(c)?.name ?? c).join(', ')}.`
      );
    }
    if (entry.kind === CatalogItemKind.SETUP) {
      planned.push({ catalog: entry, quantity, unitMonthlyPrice: 0, unitSetupPrice: entry.setupPrice });
      continue;
    }
    const capacityKey = (Object.keys(entry.capacities)[0] ?? 'LOTS') as CapacityKeyCode;
    const before = planned.reduce((s, p) => s + (p.catalog.capacities[capacityKey] ?? 0) * p.quantity, 0);
    for (const segment of planExtensionUnits(entry, held, quantity, before)) {
      planned.push({
        catalog: entry,
        quantity: segment.quantity,
        unitMonthlyPrice: segment.unitMonthlyPrice,
        unitSetupPrice: 0
      });
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
