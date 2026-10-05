/**
 * Outil d'exploitation — provisionnement / suspension d'abonnement (CLI
 * `scripts/provision-subscription.ts`, lancee en production dans le
 * conteneur de l'API). Logique testable, aucun acces reseau/console ici.
 *
 * Reutilise les services existants (subscription-v2-service,
 * lot-registry-service, tenant-service, audit-service) : aucune ecriture SQL
 * directe. Voir docs/architecture/PLAN-ABONNEMENTS.md.
 */

import {
  BillingCycle,
  CatalogItemKind,
  InvoiceStatus,
  Prisma,
  QuotaPolicy,
  SubscriptionItemStatus,
  SubscriptionStatus
} from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { logAuditEvent } from './audit-service';
import {
  CapacityKeyCode,
  DEFAULT_COMBO_DISCOUNT_PERCENT,
  PLATFORM_TAX_RATE_PERCENT,
  TRIAL_DAYS,
  TenantEntitlements,
  buildEntitlements,
  computeRecurringLines,
  featuresForModules,
  finalizeInvoice,
  getSubscriptionEnforcement
} from '../lib/subscription';
import {
  PlannedItem,
  RequestedItem,
  getEntitlements,
  invalidateEntitlements,
  linkExtensionsToPacksTx,
  loadCatalogByCodes,
  loadExistingCatalogByCodes,
  planInitialItems,
  syncTenantModulesTx
} from './subscription-v2-service';
import {
  computeQualifyingUnits,
  countActiveCopros,
  countActiveSites,
  reconcileLotActivations,
  ReconcileResult
} from './lot-registry-service';
import { suspendTenant } from './tenant-service';
// `crossedThresholds` est une fonction pure ; importer ce module n'y demarre
// aucune tache (seul `index.ts` appelle `startSubscriptionUsageJob`).
import { crossedThresholds } from '../jobs/subscription-usage-job';

/** Acteur systeme des ecritures faites par cet outil (aucune cle etrangere vers User). */
export const SYSTEM_ACTOR_ID = 'system:provision-subscription';

/** La tache horaire `subscription-usage-job` passe a hh:15 UTC : fenetre fermee aux ecritures. */
const FORBIDDEN_WINDOW_START_MINUTE = 10;
const FORBIDDEN_WINDOW_END_MINUTE = 20;

const MAX_TRIAL_DAYS_AHEAD = 365;
const PROVISIONING_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

type Db = PrismaTransactionClient | typeof prisma;

export function isForbiddenWriteWindow(now: Date): boolean {
  const minute = now.getUTCMinutes();
  return minute >= FORBIDDEN_WINDOW_START_MINUTE && minute <= FORBIDDEN_WINDOW_END_MINUTE;
}

/** Erreur de refus : code de sortie 2, jamais d'ecriture. */
export class ProvisioningRefusedError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(reasons.join(' '));
    this.reasons = reasons;
    this.name = 'ProvisioningRefusedError';
  }
}

/**
 * Violation de contrainte unique (P2002) sur la creation de l'abonnement —
 * signe d'une creation concurrente qui a gagne la course entre la lecture
 * de garde ci-dessus et l'ecriture. `instanceof Prisma.PrismaClientKnownRequestError`
 * couvre le cas reel ; le repli sur `code` couvre un mock de test qui ne
 * construit pas une vraie instance de cette classe.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002';
  }
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002';
}

function assertWritableWindow(now: Date, action: string): void {
  if (isForbiddenWriteWindow(now)) {
    throw new ProvisioningRefusedError([
      `Refus : ${action} tombe dans la fenêtre hh:10–hh:20 UTC (tâche horaire subscription-usage-job à hh:15 UTC). Réessayez hors de cette fenêtre, ou utilisez --dry-run.`
    ]);
  }
}

// =============================================================== agences

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  isActive: boolean;
}

async function loadTenantSummary(db: Db, tenantId: string): Promise<TenantSummary> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, status: true, isActive: true }
  });
  if (!tenant) throw new NotFoundError('Agence introuvable.');
  return tenant;
}

/** Recherche par id EXACT ou slug EXACT, jamais par nom. */
export async function resolveTenant(db: Db, ref: string): Promise<TenantSummary> {
  const byId = await db.tenant.findUnique({
    where: { id: ref },
    select: { id: true, slug: true, name: true, status: true, isActive: true }
  });
  if (byId) return byId;
  const bySlug = await db.tenant.findUnique({
    where: { slug: ref },
    select: { id: true, slug: true, name: true, status: true, isActive: true }
  });
  if (bySlug) return bySlug;
  throw new NotFoundError(`Agence introuvable pour « ${ref} » (id ou slug exact attendu).`);
}

export interface TenantListRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  subscriptionStatus: string | null;
  openItemCodes: string[];
}

export async function listTenants(options: { search?: string } = {}, db: Db = prisma): Promise<TenantListRow[]> {
  const search = options.search?.trim();
  const tenants = await db.tenant.findMany({
    where: search
      ? {
          OR: [{ slug: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }]
        }
      : {},
    select: { id: true, slug: true, name: true, status: true },
    orderBy: { name: 'asc' },
    take: 200
  });
  const tenantIds = tenants.map(t => t.id);
  const [subscriptions, items] = await Promise.all([
    db.subscription.findMany({ where: { tenantId: { in: tenantIds } }, select: { tenantId: true, status: true } }),
    db.subscriptionItem.findMany({
      where: { tenantId: { in: tenantIds }, status: { not: SubscriptionItemStatus.ENDED } },
      select: { tenantId: true, catalogItem: { select: { code: true } } }
    })
  ]);
  const subByTenant = new Map(subscriptions.map(s => [s.tenantId, s.status]));
  const codesByTenant = new Map<string, string[]>();
  for (const item of items) {
    const list = codesByTenant.get(item.tenantId) ?? [];
    list.push(item.catalogItem.code);
    codesByTenant.set(item.tenantId, list);
  }
  return tenants.map(t => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    subscriptionStatus: subByTenant.get(t.id) ?? null,
    openItemCodes: codesByTenant.get(t.id) ?? []
  }));
}

// =============================================================== provisionnement

export interface ProvisionSubscriptionInput {
  tenantRef: string;
  items: RequestedItem[];
  trialEndsAt?: Date;
  setupWaived?: boolean;
  quotaPolicy?: QuotaPolicy;
  billingCycle?: BillingCycle;
  dryRun?: boolean;
  now?: Date;
}

/** Un changement deja programme sur l'abonnement existant (D7) : un palier SCHEDULED, ou un retrait partiel en cours (ligne ACTIVE avec `endsAt` pose). */
interface PendingChange {
  code: string;
  quantity: number;
  kind: 'SCHEDULED' | 'PARTIAL_REMOVAL';
  date: Date;
}

interface ExistingSubscriptionSnapshot {
  id: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  quotaPolicy: QuotaPolicy;
  trialEndsAt: Date | null;
  metadata: Record<string, unknown> | null;
  /** Composition EN VIGUEUR maintenant : ACTIVE, `startsAt <= now`, `endsAt` nul ou futur. */
  items: Array<{ code: string; quantity: number }>;
  pendingChanges: PendingChange[];
}

async function loadExistingSubscription(
  db: Db,
  tenantId: string,
  now: Date
): Promise<ExistingSubscriptionSnapshot | null> {
  const subscription = await db.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return null;
  const rows = await db.subscriptionItem.findMany({
    where: { tenantId, status: { not: SubscriptionItemStatus.ENDED } },
    include: { catalogItem: { select: { code: true } } }
  });

  const byCode = new Map<string, number>();
  const pendingChanges: PendingChange[] = [];
  for (const row of rows) {
    const startsAt = row.startsAt as Date;
    const endsAt = row.endsAt as Date | null;
    const isLiveNow =
      row.status === SubscriptionItemStatus.ACTIVE &&
      startsAt.getTime() <= now.getTime() &&
      (!endsAt || endsAt.getTime() > now.getTime());
    if (isLiveNow) {
      byCode.set(row.catalogItem.code, (byCode.get(row.catalogItem.code) ?? 0) + row.quantity);
    }
    if (row.status === SubscriptionItemStatus.SCHEDULED) {
      pendingChanges.push({ code: row.catalogItem.code, quantity: row.quantity, kind: 'SCHEDULED', date: startsAt });
    } else if (row.status === SubscriptionItemStatus.ACTIVE && endsAt && endsAt.getTime() > now.getTime()) {
      pendingChanges.push({
        code: row.catalogItem.code,
        quantity: row.quantity,
        kind: 'PARTIAL_REMOVAL',
        date: endsAt
      });
    }
  }

  return {
    id: subscription.id,
    status: subscription.status,
    billingCycle: subscription.billingCycle,
    quotaPolicy: subscription.quotaPolicy,
    trialEndsAt: subscription.trialEndsAt,
    metadata: (subscription.metadata as Record<string, unknown> | null) ?? null,
    items: [...byCode.entries()].map(([code, quantity]) => ({ code, quantity })),
    pendingChanges
  };
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function multisetEqual(
  a: Array<{ code: string; quantity: number }>,
  b: Array<{ code: string; quantity: number }>
): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(a.map(x => [x.code, x.quantity]));
  for (const item of b) {
    if (map.get(item.code) !== item.quantity) return false;
    map.delete(item.code);
  }
  return map.size === 0;
}

function formatMultiset(items: Array<{ code: string; quantity: number }>): string {
  return items.map(i => `${i.code}×${i.quantity}`).join(', ') || 'aucun';
}

/** Ecarts « changement programmé » : un palier SCHEDULED, ou un retrait partiel en cours. */
function pendingChangeGaps(pending: PendingChange[]): string[] {
  return pending.map(p => {
    const when = p.kind === 'SCHEDULED' ? 'prise d’effet le' : 'retrait partiel programmé au';
    return `Changement d'abonnement programmé en cours (${p.code} × ${p.quantity}, ${when} ${p.date.toISOString()}) : terminez-le ou attendez son échéance.`;
  });
}

/**
 * Ecarts entre l'abonnement existant et la demande. Un tableau vide = conforme.
 */
function diffConformance(
  existing: ExistingSubscriptionSnapshot,
  requestedItems: Array<{ code: string; quantity: number }>,
  input: { billingCycle: BillingCycle; quotaPolicy: QuotaPolicy; setupWaived: boolean; trialEndsAt?: Date }
): string[] {
  const gaps: string[] = [];
  if (existing.status === SubscriptionStatus.CANCELED) gaps.push('Abonnement existant CANCELED.');
  if (existing.billingCycle !== input.billingCycle) {
    gaps.push(`Cycle de facturation différent (existant : ${existing.billingCycle}, demandé : ${input.billingCycle}).`);
  }
  if (existing.quotaPolicy !== input.quotaPolicy) {
    gaps.push(`Politique de quota différente (existante : ${existing.quotaPolicy}, demandée : ${input.quotaPolicy}).`);
  }
  gaps.push(...pendingChangeGaps(existing.pendingChanges));
  if (!multisetEqual(existing.items, requestedItems)) {
    gaps.push(
      `Composition différente de la demande (existante : ${formatMultiset(existing.items)} ; demandée : ${formatMultiset(requestedItems)}).`
    );
  }
  const existingSetupWaived = existing.metadata?.setupWaived === true;
  if (existingSetupWaived !== input.setupWaived) {
    gaps.push(
      `Mise en route ${input.setupWaived ? 'demandée levée mais ne l’est pas sur l’abonnement existant' : 'levée sur l’abonnement existant mais non demandée'}.`
    );
  }
  if (input.trialEndsAt) {
    if (!existing.trialEndsAt || !sameUtcDay(existing.trialEndsAt, input.trialEndsAt)) {
      gaps.push("Fin d'essai différente de celle demandée (jour UTC).");
    }
  }
  return gaps;
}

export interface SetupChargeLine {
  code: string;
  name: string;
  amount: number;
}

export interface ProvisionOutcomeCommon {
  tenant: TenantSummary;
  plannedItems: Array<{
    code: string;
    name: string;
    quantity: number;
    unitMonthlyPrice: number;
    unitSetupPrice: number;
  }>;
  quotaPolicy: QuotaPolicy;
  billingCycle: BillingCycle;
  trialEndsAt: Date;
  setupWaived: boolean;
  /** Statut de l'abonnement (créé ou existant) sur lequel porte le résultat. */
  subscriptionStatus: SubscriptionStatus;
  /** Horodatage utilisé pour ce passage (permet d'afficher un nombre de jours cohérent). */
  now: Date;
  warnings: string[];
}

export interface ProvisionDryRunResult extends ProvisionOutcomeCommon {
  outcome: 'dry-run';
  before: {
    subscription: ExistingSubscriptionSnapshot | null;
    entitlementsNow: TenantEntitlements;
    lotRegistry: { qualifying: number; openActivations: number };
  };
  wouldDo: 'create' | 'already-provisioned' | 'refused';
  refusalReasons: string[];
  reconciliationPreview: { added: number; removed: number; byKind: Record<string, number> } | null;
  after: {
    projectedEntitlements: TenantEntitlements;
    monthlyEstimate: ReturnType<typeof finalizeInvoice>;
    setupCharge: { waived: boolean; amount: number; lines: SetupChargeLine[]; firstInvoiceAlreadyIssued: boolean };
  } | null;
}

export interface ProvisionRealResult extends ProvisionOutcomeCommon {
  outcome: 'created' | 'already-provisioned';
  entitlements: TenantEntitlements;
  reconciliation: ReconcileResult;
}

function systemNow(input: { now?: Date }): Date {
  return input.now ?? new Date();
}

function resolveTrialEndsAt(now: Date, raw?: Date): Date {
  const trialEndsAt = raw ?? new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  if (trialEndsAt.getTime() <= now.getTime()) {
    throw new BadRequestError("La fin d'essai doit être dans le futur.");
  }
  const maxAhead = now.getTime() + MAX_TRIAL_DAYS_AHEAD * 24 * 60 * 60 * 1000;
  if (trialEndsAt.getTime() > maxAhead) {
    throw new BadRequestError("La fin d'essai ne peut pas dépasser 365 jours.");
  }
  return trialEndsAt;
}

function resolveTrialEndsAtSafe(now: Date, raw?: Date): Date {
  try {
    return resolveTrialEndsAt(now, raw);
  } catch {
    return raw ?? new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }
}

function planToPlannedSummary(planned: PlannedItem[]) {
  return planned.map(p => ({
    code: p.catalog.code,
    name: p.catalog.name,
    quantity: p.quantity,
    unitMonthlyPrice: p.unitMonthlyPrice,
    unitSetupPrice: p.unitSetupPrice
  }));
}

function toRequestedMultiset(planned: PlannedItem[]): Array<{ code: string; quantity: number }> {
  const map = new Map<string, number>();
  for (const p of planned) map.set(p.catalog.code, (map.get(p.catalog.code) ?? 0) + p.quantity);
  return [...map.entries()].map(([code, quantity]) => ({ code, quantity }));
}

/**
 * Montant de mise en route qui serait facturé (ou aurait été facturé si
 * levée) : meme regle que `autoSetupLines` de platform-invoice-service —
 * pour chaque PACK planifié, `SETUP_<code>` chargé via le catalogue, retenu
 * si `setupPrice > 0`, si l'agence n'a pas déjà un SubscriptionItem de ce
 * code, ET si aucune facture `{ tenantId, kind: 'PLATFORM', billingNature:
 * 'PERIOD', status: { not: CANCELED } }` n'existe déjà pour l'agence (la
 * mise en route automatique ne joue qu'à la PREMIERE facture de période,
 * `autoSetupLines`, platform-invoice-service.ts:153-193) ; plus les éléments
 * SETUP explicites de la demande, qui restent facturés dans tous les cas.
 * Aucun prix en dur.
 */
async function computeSetupCharge(
  db: Db,
  tenantId: string,
  planned: PlannedItem[]
): Promise<{ amount: number; lines: SetupChargeLine[]; firstInvoiceAlreadyIssued: boolean }> {
  const lines: SetupChargeLine[] = [];
  const explicitSetupCodes = new Set<string>();
  for (const p of planned) {
    if (p.catalog.kind !== CatalogItemKind.SETUP) continue;
    explicitSetupCodes.add(p.catalog.code);
    if (p.unitSetupPrice > 0) {
      lines.push({ code: p.catalog.code, name: p.catalog.name, amount: p.unitSetupPrice * p.quantity });
    }
  }

  const packCodes = planned.filter(p => p.catalog.kind === CatalogItemKind.PACK).map(p => p.catalog.code);
  const autoSetupCodes = packCodes.map(code => `SETUP_${code}`).filter(code => !explicitSetupCodes.has(code));
  let firstInvoiceAlreadyIssued = false;
  if (autoSetupCodes.length > 0) {
    const previousPeriodInvoices = await db.invoice.count({
      where: { tenantId, kind: 'PLATFORM', billingNature: 'PERIOD', status: { not: InvoiceStatus.CANCELED } }
    });
    firstInvoiceAlreadyIssued = previousPeriodInvoices > 0;
    if (!firstInvoiceAlreadyIssued) {
      const [catalog, existingSetups] = await Promise.all([
        loadExistingCatalogByCodes(db, autoSetupCodes),
        db.subscriptionItem.findMany({
          where: { tenantId, catalogItem: { code: { in: autoSetupCodes } } },
          select: { catalogItem: { select: { code: true } } }
        })
      ]);
      const already = new Set(existingSetups.map(s => s.catalogItem.code));
      for (const code of autoSetupCodes) {
        const entry = catalog.get(code);
        if (!entry || already.has(code) || entry.setupPrice <= 0) continue;
        lines.push({ code, name: entry.name, amount: entry.setupPrice });
      }
    }
  }

  return { amount: lines.reduce((s, l) => s + l.amount, 0), lines, firstInvoiceAlreadyIssued };
}

/** Meme regle que `syncTenantModulesTx` (subscription-v2-service.ts) : un OVERRIDE encore valide n'est jamais touche. */
function isModuleOverrideLive(row: { source: string; expiresAt: Date | null }, now: Date): boolean {
  return row.source === 'OVERRIDE' && (!row.expiresAt || row.expiresAt.getTime() > now.getTime());
}

interface ProjectedEntitlements {
  entitlements: TenantEntitlements;
  /** Un message par module force par une derogation (OVERRIDE) encore vivante. */
  moduleOverrideWarnings: string[];
}

async function computeEntitlementsForItems(
  tenantId: string,
  planned: PlannedItem[],
  now: Date,
  quotaPolicy: QuotaPolicy,
  billingCycle: BillingCycle,
  trialEndsAt: Date
): Promise<ProjectedEntitlements> {
  const items = planned.map(p => ({
    code: p.catalog.code,
    kind: p.catalog.kind,
    quantity: p.quantity,
    status: 'ACTIVE' as const,
    startsAt: now,
    endsAt: null,
    modules: p.catalog.modules,
    exclusiveGroup: p.catalog.exclusiveGroup,
    capacities: p.catalog.capacities
  }));
  const [qualifying, coproCount, siteCount, overrides, moduleRows] = await Promise.all([
    computeQualifyingUnits(prisma, tenantId),
    countActiveCopros(prisma, tenantId),
    countActiveSites(prisma, tenantId),
    prisma.capacityOverride.findMany({ where: { tenantId, revokedAt: null } }),
    prisma.tenantModule.findMany({ where: { tenantId } })
  ]);
  const usage: Partial<Record<CapacityKeyCode, number>> = {
    LOTS: qualifying.length,
    COPROPRIETES: coproCount,
    CHANTIERS: siteCount
  };
  const moduleOverrideWarnings = moduleRows
    .filter(row => isModuleOverrideLive(row, now))
    .map(row => `Module ${row.moduleKey} forcé par dérogation (OVERRIDE) : la synchronisation n'y touchera pas.`);

  const entitlements = buildEntitlements({
    tenantId,
    subscription: {
      id: 'projected',
      status: SubscriptionStatus.TRIALING,
      trialEndsAt,
      pastDueAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      cancelAt: null,
      canceledAt: null,
      graceDays: 7,
      billingCycle,
      quotaPolicy,
      manualReadOnlyAt: null,
      manualReadOnlyReason: null
    },
    items,
    overrides,
    moduleRows,
    usage,
    enforcement: getSubscriptionEnforcement(),
    featuresFor: featuresForModules,
    now
  });
  return { entitlements, moduleOverrideWarnings };
}

/** Avertissement de dépassement (sous BILL_OVERAGE, un dépassement est facturé). */
function overageWarnings(capacities: Record<CapacityKeyCode, { overBy: number; limit: number }>): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(capacities) as CapacityKeyCode[]) {
    // ACTIFS : compteur des packs Particulier ; sans pack Particulier (plafond 0), les actifs d'une agence ne comptent pas.
    if (key === 'ACTIFS' && capacities[key].limit <= 0) continue;
    // PHOTOS_INVENTAIRE (lot 041, data-model §4) : une consommation qui n'est
    // JAMAIS facturée en dépassement (le quota refuse au-delà) ; aucun
    // avertissement de facturation, avec ou sans option souscrite.
    if (key === 'PHOTOS_INVENTAIRE') continue;
    const overBy = capacities[key].overBy;
    if (overBy > 0) {
      warnings.push(
        `Capacité ${key} dépassée de ${overBy} unité(s) : sous BILL_OVERAGE, un dépassement sera facturé et des alertes de quota partiront à la prochaine tâche horaire.`
      );
    }
  }
  return warnings;
}

/**
 * Avertissement des seuils 80 % / 100 % que la tache horaire annoncerait
 * (`evaluateQuotaAlerts`, subscription-usage-job.ts) : un e-mail part aux
 * administrateurs de l'agence, une fois par capacité, seuil et periode.
 */
function quotaThresholdWarnings(capacities: Record<CapacityKeyCode, { used: number; limit: number }>): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(capacities) as CapacityKeyCode[]) {
    const cap = capacities[key];
    // Capacités facultatives sans plafond (ACTIFS hors pack Particulier,
    // PHOTOS_INVENTAIRE sans option) : la tâche horaire n'alerte pas
    // (OPTIONAL_CAPACITIES, subscription-usage-job.ts).
    if ((key === 'ACTIFS' || key === 'PHOTOS_INVENTAIRE') && cap.limit <= 0) continue;
    const crossed = crossedThresholds(cap.used, cap.limit);
    if (crossed.length === 0) continue;
    warnings.push(
      `${key} : ${cap.used}/${cap.limit} — seuil(s) ${crossed.map(t => `${t} %`).join(', ')} franchi(s) : alerte(s) envoyée(s) aux administrateurs de l'agence à la prochaine tâche horaire (hh:15 UTC), une fois par période.`
    );
  }
  return warnings;
}

function capacityWarnings(
  capacities: Record<CapacityKeyCode, { overBy: number; used: number; limit: number }>
): string[] {
  return [...overageWarnings(capacities), ...quotaThresholdWarnings(capacities)];
}

async function buildBeforeBlock(db: Db, tenantId: string, now: Date) {
  const [existing, entitlementsNow, qualifying, open] = await Promise.all([
    loadExistingSubscription(db, tenantId, now),
    getEntitlements(tenantId, { fresh: true }),
    computeQualifyingUnits(prisma, tenantId),
    prisma.lotActivation.findMany({ where: { tenantId, deactivatedAt: null }, select: { id: true } })
  ]);
  return {
    subscription: existing,
    entitlementsNow,
    lotRegistry: { qualifying: qualifying.length, openActivations: open.length }
  };
}

function logReconciliationIfChanged(tenantId: string, reconciliation: ReconcileResult): void {
  if (reconciliation.added.length === 0 && reconciliation.removed.length === 0) return;
  logAuditEvent({
    actorUserId: SYSTEM_ACTOR_ID,
    tenantId,
    actionKey: 'LOT_REGISTRY_RECONCILED',
    entityType: 'LotActivation',
    entityId: tenantId,
    payload: {
      added: reconciliation.added.length,
      removed: reconciliation.removed.length,
      qualifying: reconciliation.qualifying,
      byKind: reconciliation.byKind
    }
  });
}

// --------------------------------------------------------------- contexte

interface ProvisionContext {
  now: Date;
  dryRun: boolean;
  quotaPolicy: QuotaPolicy;
  billingCycle: BillingCycle;
  setupWaived: boolean;
  tenant: TenantSummary;
  warnings: string[];
}

async function resolveProvisionContext(input: ProvisionSubscriptionInput): Promise<ProvisionContext> {
  const now = systemNow(input);
  const dryRun = Boolean(input.dryRun);
  const quotaPolicy = input.quotaPolicy ?? QuotaPolicy.BILL_OVERAGE;
  const billingCycle = input.billingCycle ?? BillingCycle.MONTHLY;
  const setupWaived = Boolean(input.setupWaived);

  if (!dryRun) assertWritableWindow(now, 'un provisionnement');

  const tenant = await resolveTenant(prisma, input.tenantRef);
  const warnings: string[] = [];
  if (dryRun && isForbiddenWriteWindow(now)) {
    warnings.push(
      'Avertissement : simulation lancée pendant la fenêtre hh:10–hh:20 UTC (tâche horaire subscription-usage-job) — un passage réel serait refusé.'
    );
  }
  return { now, dryRun, quotaPolicy, billingCycle, setupWaived, tenant, warnings };
}

/** Refus qui ne dependent d'aucune consultation du catalogue ou de l'abonnement existant. */
function earlyRefusalReasons(tenant: TenantSummary, input: ProvisionSubscriptionInput, setupWaived: boolean): string[] {
  if (tenant.status === 'SUSPENDED') {
    return ['Agence SUSPENDUE : le provisionnement est refusé.'];
  }
  const setupCodesRequested = input.items.filter(i => i.code.startsWith('SETUP_'));
  if (setupWaived && setupCodesRequested.length > 0) {
    return [
      `--setup-waived est incompatible avec des éléments de mise en route explicites (${setupCodesRequested.map(i => i.code).join(', ')}).`
    ];
  }
  return [];
}

async function refusalDryRunResult(
  ctx: ProvisionContext,
  input: ProvisionSubscriptionInput,
  reasons: string[]
): Promise<ProvisionDryRunResult> {
  const before = await buildBeforeBlock(prisma, ctx.tenant.id, ctx.now);
  return {
    outcome: 'dry-run',
    tenant: ctx.tenant,
    plannedItems: [],
    quotaPolicy: ctx.quotaPolicy,
    billingCycle: ctx.billingCycle,
    trialEndsAt: resolveTrialEndsAtSafe(ctx.now, input.trialEndsAt),
    setupWaived: ctx.setupWaived,
    subscriptionStatus: before.subscription?.status ?? SubscriptionStatus.TRIALING,
    now: ctx.now,
    before,
    wouldDo: 'refused',
    refusalReasons: reasons,
    reconciliationPreview: null,
    after: null,
    warnings: ctx.warnings
  };
}

// --------------------------------------------------------------- planification

interface Planning {
  planned: PlannedItem[];
  plannedItems: ProvisionOutcomeCommon['plannedItems'];
  requestedMultiset: Array<{ code: string; quantity: number }>;
  existing: ExistingSubscriptionSnapshot | null;
  gaps: string[];
  trialEndsAt: Date;
}

async function resolvePlanning(ctx: ProvisionContext, input: ProvisionSubscriptionInput): Promise<Planning> {
  const catalog = await loadCatalogByCodes(
    prisma,
    input.items.map(i => i.code)
  );
  const planned = planInitialItems(input.items, catalog);
  const plannedItems = planToPlannedSummary(planned);
  const requestedMultiset = toRequestedMultiset(planned);

  const existing = await loadExistingSubscription(prisma, ctx.tenant.id, ctx.now);
  let gaps: string[] = [];
  if (existing) {
    // Ecart de fin d'essai compare UNIQUEMENT si demande explicitement : sinon
    // une fin par defaut recalculee a chaque passage (aujourd'hui + 30 j) ne
    // doit jamais rendre un abonnement deja conforme "non conforme" le lendemain.
    gaps = diffConformance(existing, requestedMultiset, {
      billingCycle: ctx.billingCycle,
      quotaPolicy: ctx.quotaPolicy,
      setupWaived: ctx.setupWaived,
      trialEndsAt: input.trialEndsAt
    });
  }
  const conforming = existing !== null && gaps.length === 0;

  // Abonnement deja conforme : on affiche/projette sa fin d'essai REELLE, sans
  // jamais valider ni recalculer de fin par defaut (qui n'a alors aucun sens
  // et ne doit surtout pas faire refuser un passage idempotent). Sinon
  // (creation, ou refus a venir) : resolution habituelle, qui valide un
  // `--trial-ends-at` explicite.
  const trialEndsAt = conforming
    ? (existing!.trialEndsAt ?? resolveTrialEndsAtSafe(ctx.now, input.trialEndsAt))
    : resolveTrialEndsAt(ctx.now, input.trialEndsAt);

  return { planned, plannedItems, requestedMultiset, existing, gaps, trialEndsAt };
}

// --------------------------------------------------------------- branche dry-run

async function buildReconciliationPreview(tenantId: string, wouldDo: 'create' | 'already-provisioned' | 'refused') {
  if (wouldDo === 'refused') return null;
  const preview = await reconcileLotActivations(tenantId, { dryRun: true, actorUserId: SYSTEM_ACTOR_ID });
  return { added: preview.added.length, removed: preview.removed.length, byKind: preview.byKind };
}

async function buildDryRunAfterBlock(
  ctx: ProvisionContext,
  planning: Planning
): Promise<ProvisionDryRunResult['after']> {
  const { entitlements: projected, moduleOverrideWarnings } = await computeEntitlementsForItems(
    ctx.tenant.id,
    planning.planned,
    ctx.now,
    ctx.quotaPolicy,
    ctx.billingCycle,
    planning.trialEndsAt
  );
  ctx.warnings.push(...moduleOverrideWarnings, ...capacityWarnings(projected.capacities));

  const monthly = finalizeInvoice(
    computeRecurringLines(
      planning.planned.map(p => ({
        code: p.catalog.code,
        kind: p.catalog.kind,
        name: p.catalog.name,
        quantity: p.quantity,
        unitMonthlyPrice: p.unitMonthlyPrice
      })),
      { comboDiscountPercent: DEFAULT_COMBO_DISCOUNT_PERCENT }
    ).lines,
    PLATFORM_TAX_RATE_PERCENT
  );
  const setupCharge = await computeSetupCharge(prisma, ctx.tenant.id, planning.planned);

  return {
    projectedEntitlements: projected,
    monthlyEstimate: monthly,
    setupCharge: {
      waived: ctx.setupWaived,
      amount: setupCharge.amount,
      lines: setupCharge.lines,
      firstInvoiceAlreadyIssued: setupCharge.firstInvoiceAlreadyIssued
    }
  };
}

async function buildDryRunResult(
  ctx: ProvisionContext,
  planning: Planning,
  before: ProvisionDryRunResult['before']
): Promise<ProvisionDryRunResult> {
  let wouldDo: 'create' | 'already-provisioned' | 'refused' = 'create';
  let refusalReasons: string[] = [];
  if (planning.existing) {
    wouldDo = planning.gaps.length === 0 ? 'already-provisioned' : 'refused';
    refusalReasons = planning.gaps;
  }

  const reconciliationPreview = await buildReconciliationPreview(ctx.tenant.id, wouldDo);
  const after = wouldDo === 'refused' ? null : await buildDryRunAfterBlock(ctx, planning);

  // Deja provisionne : l'etat « levee » affiche vient de l'abonnement EXISTANT
  // (metadata.setupWaived), pas de l'option --setup-waived demandee — les deux
  // sont garantis egaux ici (diffConformance refuse sinon), mais la source
  // reste l'etat reel, pas l'entree.
  const setupWaived =
    wouldDo === 'already-provisioned' ? planning.existing!.metadata?.setupWaived === true : ctx.setupWaived;

  return {
    outcome: 'dry-run',
    tenant: ctx.tenant,
    plannedItems: planning.plannedItems,
    quotaPolicy: ctx.quotaPolicy,
    billingCycle: ctx.billingCycle,
    trialEndsAt: planning.trialEndsAt,
    setupWaived,
    subscriptionStatus: planning.existing?.status ?? SubscriptionStatus.TRIALING,
    now: ctx.now,
    before,
    wouldDo,
    refusalReasons,
    reconciliationPreview,
    after,
    warnings: ctx.warnings
  };
}

// --------------------------------------------------------------- branche « deja conforme »

async function handleAlreadyProvisioned(ctx: ProvisionContext, planning: Planning): Promise<ProvisionRealResult> {
  // Deja conforme : aucune ecriture sur l'abonnement, mais on termine la
  // reprise du registre (idempotent) et on renvoie l'etat reel.
  const reconciliation = await reconcileLotActivations(ctx.tenant.id, { actorUserId: SYSTEM_ACTOR_ID });
  logReconciliationIfChanged(ctx.tenant.id, reconciliation);
  const entitlements = await getEntitlements(ctx.tenant.id, { fresh: true });
  return {
    outcome: 'already-provisioned',
    tenant: ctx.tenant,
    plannedItems: planning.plannedItems,
    quotaPolicy: ctx.quotaPolicy,
    billingCycle: ctx.billingCycle,
    trialEndsAt: planning.trialEndsAt,
    // Etat reel de l'abonnement existant, pas l'option --setup-waived demandee.
    setupWaived: planning.existing!.metadata?.setupWaived === true,
    subscriptionStatus: planning.existing!.status,
    now: ctx.now,
    entitlements,
    reconciliation,
    warnings: [...ctx.warnings, ...capacityWarnings(entitlements.capacities)]
  };
}

// --------------------------------------------------------------- branche creation

async function createSubscriptionTx(ctx: ProvisionContext, planning: Planning) {
  return prisma.$transaction(async tx => {
    // Garde contre une creation concurrente : relit l'abonnement DANS la transaction.
    const concurrent = await tx.subscription.findUnique({ where: { tenantId: ctx.tenant.id } });
    if (concurrent) {
      throw new ProvisioningRefusedError([
        "Un abonnement a été créé entre-temps pour cette agence : relancez l'outil."
      ]);
    }
    let created;
    try {
      created = await tx.subscription.create({
        data: {
          tenantId: ctx.tenant.id,
          planKey: null,
          billingCycle: ctx.billingCycle,
          status: SubscriptionStatus.TRIALING,
          startAt: ctx.now,
          currentPeriodStart: ctx.now,
          currentPeriodEnd: planning.trialEndsAt,
          trialEndsAt: planning.trialEndsAt,
          nextBillingAt: planning.trialEndsAt,
          quotaPolicy: ctx.quotaPolicy,
          metadata: {
            ...(ctx.setupWaived ? { setupWaived: true } : {}),
            provisioning: {
              source: 'cli:provision-subscription',
              at: ctx.now.toISOString(),
              items: planning.requestedMultiset
            }
          }
        }
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ProvisioningRefusedError([
          "Un abonnement a été créé entre-temps pour cette agence : relancez l'outil."
        ]);
      }
      throw error;
    }
    const noteDate = ctx.now.toISOString().slice(0, 10);
    await tx.subscriptionItem.createMany({
      data: planning.planned.map(p => ({
        subscriptionId: created.id,
        tenantId: ctx.tenant.id,
        catalogItemId: p.catalog.id,
        quantity: p.quantity,
        unitMonthlyPrice: p.unitMonthlyPrice,
        unitSetupPrice: p.unitSetupPrice,
        status: SubscriptionItemStatus.ACTIVE,
        startsAt: ctx.now,
        addedByUserId: SYSTEM_ACTOR_ID,
        note: `Provisionné par l'outil d'exploitation le ${noteDate}`
      }))
    });
    await linkExtensionsToPacksTx(tx, ctx.tenant.id);
    await syncTenantModulesTx(tx, ctx.tenant.id, { now: ctx.now, actorUserId: SYSTEM_ACTOR_ID });
    return created;
  }, PROVISIONING_TX_OPTIONS);
}

function logCreationAudit(ctx: ProvisionContext, planning: Planning, subscriptionId: string): void {
  // Journalise juste apres le commit, AVANT reconcileLotActivations : un echec
  // de la reconciliation qui suit ne doit jamais faire perdre la trace d'une
  // creation reussie.
  logAuditEvent({
    actorUserId: SYSTEM_ACTOR_ID,
    tenantId: ctx.tenant.id,
    actionKey: 'SUBSCRIPTION_PROVISIONED',
    entityType: 'Subscription',
    entityId: subscriptionId,
    payload: {
      source: 'cli:provision-subscription',
      items: planning.requestedMultiset,
      trialEndsAt: planning.trialEndsAt.toISOString(),
      setupWaived: ctx.setupWaived,
      quotaPolicy: ctx.quotaPolicy,
      billingCycle: ctx.billingCycle,
      created: true
    }
  });
}

async function createSubscriptionAndReconcile(ctx: ProvisionContext, planning: Planning): Promise<ProvisionRealResult> {
  const subscription = await createSubscriptionTx(ctx, planning);
  invalidateEntitlements(ctx.tenant.id);
  logCreationAudit(ctx, planning, subscription.id);

  let reconciliation: ReconcileResult;
  try {
    reconciliation = await reconcileLotActivations(ctx.tenant.id, { actorUserId: SYSTEM_ACTOR_ID });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Abonnement créé (id ${subscription.id}) mais réconciliation du registre en échec : relancez la même commande, elle est idempotente. Détail : ${detail}`
    );
  }
  logReconciliationIfChanged(ctx.tenant.id, reconciliation);

  const entitlements = await getEntitlements(ctx.tenant.id, { fresh: true });
  return {
    outcome: 'created',
    tenant: ctx.tenant,
    plannedItems: planning.plannedItems,
    quotaPolicy: ctx.quotaPolicy,
    billingCycle: ctx.billingCycle,
    trialEndsAt: planning.trialEndsAt,
    setupWaived: ctx.setupWaived,
    subscriptionStatus: SubscriptionStatus.TRIALING,
    now: ctx.now,
    entitlements,
    reconciliation,
    warnings: [...ctx.warnings, ...capacityWarnings(entitlements.capacities)]
  };
}

// --------------------------------------------------------------- point d'entree

/**
 * Provisionne (ou verifie la conformite d'un abonnement existant). En
 * `dryRun`, N'ECRIT RIEN : aucune methode d'ecriture Prisma, aucune
 * transaction, aucun audit, `reconcileLotActivations` avec `dryRun: true`.
 */
export async function provisionSubscription(
  input: ProvisionSubscriptionInput
): Promise<ProvisionDryRunResult | ProvisionRealResult> {
  const ctx = await resolveProvisionContext(input);

  const earlyReasons = earlyRefusalReasons(ctx.tenant, input, ctx.setupWaived);
  if (earlyReasons.length > 0) {
    if (ctx.dryRun) return refusalDryRunResult(ctx, input, earlyReasons);
    throw new ProvisioningRefusedError(earlyReasons);
  }

  const planning = await resolvePlanning(ctx, input);
  const before = await buildBeforeBlock(prisma, ctx.tenant.id, ctx.now);

  if (ctx.dryRun) {
    return buildDryRunResult(ctx, planning, before);
  }

  if (planning.existing) {
    if (planning.gaps.length > 0) {
      throw new ProvisioningRefusedError(['Abonnement existant NON CONFORME à la demande :', ...planning.gaps]);
    }
    return handleAlreadyProvisioned(ctx, planning);
  }

  return createSubscriptionAndReconcile(ctx, planning);
}

// =============================================================== suspension

export interface SuspendTenantInput {
  tenantRef: string;
  dryRun?: boolean;
  now?: Date;
}

export interface SuspendDryRunResult {
  outcome: 'dry-run';
  tenant: TenantSummary;
  before: { status: string; isActive: boolean; activeMemberCount: number; subscriptionStatus: string | null };
  wouldDo: 'suspend' | 'nothing';
  warnings: string[];
}

export interface SuspendRealResult {
  outcome: 'suspended' | 'nothing';
  tenant: TenantSummary;
}

export async function suspendTenantAction(input: SuspendTenantInput): Promise<SuspendDryRunResult | SuspendRealResult> {
  const now = systemNow(input);
  const dryRun = Boolean(input.dryRun);
  const tenant = await resolveTenant(prisma, input.tenantRef);

  if (!dryRun) {
    if (tenant.status !== 'SUSPENDED') assertWritableWindow(now, 'une suspension');
  }

  if (dryRun) {
    const [activeMembers, subscription] = await Promise.all([
      prisma.membership.count({ where: { tenantId: tenant.id, status: 'ACTIVE' } }),
      prisma.subscription.findUnique({ where: { tenantId: tenant.id }, select: { status: true } })
    ]);
    const before = {
      status: tenant.status,
      isActive: tenant.isActive,
      activeMemberCount: activeMembers,
      subscriptionStatus: subscription?.status ?? null
    };
    const warnings = isForbiddenWriteWindow(now)
      ? [
          'Avertissement : simulation lancée pendant la fenêtre hh:10–hh:20 UTC (tâche horaire subscription-usage-job) — un passage réel serait refusé.'
        ]
      : [];
    return {
      outcome: 'dry-run',
      tenant,
      before,
      wouldDo: tenant.status === 'SUSPENDED' ? 'nothing' : 'suspend',
      warnings
    };
  }

  if (tenant.status === 'SUSPENDED') {
    return { outcome: 'nothing', tenant };
  }

  await suspendTenant(tenant.id, SYSTEM_ACTOR_ID);
  const refreshed = await loadTenantSummary(prisma, tenant.id);
  return { outcome: 'suspended', tenant: refreshed };
}
