/**
 * Droits d'une agence — calcul PUR (aucun acces base, aucune horloge implicite :
 * `now` est toujours passe par l'appelant).
 *
 * - modules      = union des modules des packs en vigueur, corrigee par les
 *                  TenantModule OVERRIDE (D11 : un module retire passe en
 *                  lecture seule, ses donnees restent) ;
 * - capacites    = somme des packs + extensions + derogations actives (D3 :
 *                  une reserve UNIQUE de lots, pas une reserve par pack) ;
 * - exclusivite  = l'Integre ne se cumule avec aucun autre pack (D6) ;
 * - phase        = essai, actif, grace ou lecture seule (D8).
 *
 * Voir docs/architecture/PLAN-ABONNEMENTS.md.
 */

import { CAPACITY_KEYS, CapacityKeyCode, MODULE_KEYS, ModuleKeyCode } from './catalog';

export type ItemStatusCode = 'SCHEDULED' | 'ACTIVE' | 'ENDED';
export type SubscriptionStatusCode = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
export type QuotaPolicyCode = 'BLOCK' | 'BILL_OVERAGE' | 'WARN_ONLY';
export type SubscriptionEnforcement = 'off' | 'warn' | 'enforce';

/** Element souscrit, avec ce qu'il faut de son catalogue pour calculer les droits. */
export interface EntitlementItem {
  code: string;
  kind: 'PACK' | 'EXTENSION' | 'SETUP';
  quantity: number;
  status: ItemStatusCode;
  startsAt: Date;
  endsAt: Date | null;
  modules: readonly string[];
  exclusiveGroup: string | null;
  /** Palier de gamme (`rules.tierGroup`) : deux packs du meme palier ne se cumulent pas. */
  tierGroup?: string | null;
  /** Capacite d'UNE unite. */
  capacities: Partial<Record<CapacityKeyCode, number>>;
}

export interface EntitlementOverride {
  capacityKey: CapacityKeyCode;
  delta: number;
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ModuleRow {
  moduleKey: string;
  enabled: boolean;
  source: 'PACK' | 'OVERRIDE';
  expiresAt: Date | null;
  disabledAt: Date | null;
}

export type ModuleAccess = 'FULL' | 'READ_ONLY' | 'NONE';

export interface CapacityBreakdown {
  /** Apporte par les packs. */
  included: number;
  /** Apporte par les extensions achetees. */
  extensions: number;
  /** Derogations actives (Reprise, geste commercial...). */
  overrides: number;
  /** Plafond effectif : included + extensions + overrides, jamais negatif. */
  limit: number;
}

// ---------------------------------------------------------------- elements

/** Un element compte-t-il a l'instant `now` ? (SCHEDULED compte des que startsAt est atteint.) */
export function isItemEffective(item: Pick<EntitlementItem, 'status' | 'startsAt' | 'endsAt'>, now: Date): boolean {
  if (item.status === 'ENDED') return false;
  if (item.startsAt.getTime() > now.getTime()) return false;
  return !item.endsAt || item.endsAt.getTime() > now.getTime();
}

export function effectiveItems<T extends Pick<EntitlementItem, 'status' | 'startsAt' | 'endsAt'>>(
  items: readonly T[],
  now: Date
): T[] {
  return items.filter(item => isItemEffective(item, now));
}

/** Codes des packs en vigueur, sans doublon, dans l'ordre d'arrivee. */
export function heldPackCodes(items: readonly Pick<EntitlementItem, 'code' | 'kind'>[]): string[] {
  return [...new Set(items.filter(i => i.kind === 'PACK').map(i => i.code))];
}

/** Modules ouverts par les packs (union), dans l'ordre de MODULE_KEYS. */
export function packModules(items: readonly Pick<EntitlementItem, 'kind' | 'modules'>[]): ModuleKeyCode[] {
  const set = new Set<string>();
  for (const item of items) {
    if (item.kind !== 'PACK') continue;
    for (const m of item.modules) set.add(m);
  }
  return MODULE_KEYS.filter(m => set.has(m));
}

// ---------------------------------------------------------------- exclusivite

export interface ExclusivityResult {
  ok: boolean;
  /**
   * Paires de packs incompatibles, ex. [['INTEGRE', 'AGENCE']] (exclusivite)
   * ou [['PATRIMOINE_ESSENTIEL', 'PATRIMOINE_PRO']] (meme palier).
   */
  conflicts: Array<[string, string]>;
  /** Pack present deux fois (un pack ne se souscrit qu'une fois). */
  duplicates: string[];
}

/**
 * Un pack portant un `exclusiveGroup` exclut tout autre PACK hors de ce
 * groupe ; deux packs portant le meme `tierGroup` (Patrimoine Essentiel et
 * Pro) s'excluent. Les extensions et mises en route ne sont jamais concernees.
 */
export function validateExclusivity(
  items: readonly Pick<EntitlementItem, 'code' | 'kind' | 'exclusiveGroup' | 'tierGroup'>[]
): ExclusivityResult {
  const packs = items.filter(i => i.kind === 'PACK');
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const pack of packs) {
    if (seen.has(pack.code)) duplicates.add(pack.code);
    seen.add(pack.code);
  }

  const conflicts: Array<[string, string]> = [];
  const distinct = [...new Map(packs.map(p => [p.code, p])).values()];
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = i + 1; j < distinct.length; j += 1) {
      const a = distinct[i];
      const b = distinct[j];
      const clash =
        (a.exclusiveGroup !== null && a.exclusiveGroup !== b.exclusiveGroup) ||
        (b.exclusiveGroup !== null && b.exclusiveGroup !== a.exclusiveGroup);
      const sameTier = Boolean(a.tierGroup) && a.tierGroup === b.tierGroup;
      if (clash) conflicts.push(a.exclusiveGroup ? [a.code, b.code] : [b.code, a.code]);
      else if (sameTier) conflicts.push([a.code, b.code]);
    }
  }
  return { ok: conflicts.length === 0 && duplicates.size === 0, conflicts, duplicates: [...duplicates] };
}

// ---------------------------------------------------------------- capacites

export function isOverrideActive(override: Omit<EntitlementOverride, 'capacityKey' | 'delta'>, now: Date): boolean {
  if (override.revokedAt && override.revokedAt.getTime() <= now.getTime()) return false;
  if (override.startsAt.getTime() > now.getTime()) return false;
  return !override.expiresAt || override.expiresAt.getTime() > now.getTime();
}

/**
 * Plafonds par capacite. Les elements passes doivent deja etre filtres sur
 * ceux en vigueur (`effectiveItems`) ; les derogations sont filtrees ici.
 */
export function computeCapacityLimits(
  items: readonly Pick<EntitlementItem, 'kind' | 'quantity' | 'capacities'>[],
  overrides: readonly EntitlementOverride[],
  now: Date
): Record<CapacityKeyCode, CapacityBreakdown> {
  const result = {} as Record<CapacityKeyCode, CapacityBreakdown>;
  for (const key of CAPACITY_KEYS) {
    let included = 0;
    let extensions = 0;
    for (const item of items) {
      const amount = (item.capacities[key] ?? 0) * item.quantity;
      if (item.kind === 'PACK') included += amount;
      else if (item.kind === 'EXTENSION') extensions += amount;
    }
    const overrideTotal = overrides
      .filter(o => o.capacityKey === key && isOverrideActive(o, now))
      .reduce((sum, o) => sum + o.delta, 0);
    result[key] = {
      included,
      extensions,
      overrides: overrideTotal,
      limit: Math.max(0, included + extensions + overrideTotal)
    };
  }
  return result;
}

/** Capacite ACHETEE (packs + extensions, sans derogation) : base du rang des lots pour les paliers de prix. */
export function purchasedCapacity(
  items: readonly Pick<EntitlementItem, 'kind' | 'quantity' | 'capacities'>[],
  key: CapacityKeyCode
): number {
  return items
    .filter(i => i.kind === 'PACK' || i.kind === 'EXTENSION')
    .reduce((sum, i) => sum + (i.capacities[key] ?? 0) * i.quantity, 0);
}

// ---------------------------------------------------------------- modules

function isModuleOverrideLive(row: ModuleRow, now: Date): boolean {
  return row.source === 'OVERRIDE' && (!row.expiresAt || row.expiresAt.getTime() > now.getTime());
}

/**
 * Acces par module :
 * - OVERRIDE en vigueur : FULL s'il ouvre le module ; sinon READ_ONLY si le
 *   module a deja ete detenu (disabledAt), NONE sinon ;
 * - sinon, module d'un pack en vigueur : FULL ;
 * - sinon, module deja detenu puis retire (disabledAt) : READ_ONLY (D11) ;
 * - sinon NONE.
 */
export function resolveModuleAccess(
  fromPacks: readonly string[],
  rows: readonly ModuleRow[],
  now: Date
): { modules: ModuleKeyCode[]; access: Record<ModuleKeyCode, ModuleAccess> } {
  const packSet = new Set(fromPacks);
  const rowByKey = new Map(rows.map(r => [r.moduleKey, r]));
  const access = {} as Record<ModuleKeyCode, ModuleAccess>;

  for (const moduleKey of MODULE_KEYS) {
    const row = rowByKey.get(moduleKey);
    if (row && isModuleOverrideLive(row, now)) {
      access[moduleKey] = row.enabled ? 'FULL' : row.disabledAt ? 'READ_ONLY' : 'NONE';
    } else if (packSet.has(moduleKey)) {
      access[moduleKey] = 'FULL';
    } else if (row?.disabledAt) {
      access[moduleKey] = 'READ_ONLY';
    } else {
      access[moduleKey] = 'NONE';
    }
  }

  return { modules: MODULE_KEYS.filter(m => access[m] === 'FULL'), access };
}

// ---------------------------------------------------------------- phase (D8)

export type SubscriptionPhase = 'NONE' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'READ_ONLY';

export type ReadOnlyReason =
  'NO_SUBSCRIPTION' | 'TRIAL_EXPIRED' | 'PAST_DUE' | 'PERIOD_EXPIRED' | 'CANCELED' | 'SUSPENDED' | 'MANUAL';

export interface PhaseInput {
  status: SubscriptionStatusCode;
  trialEndsAt: Date | null;
  pastDueAt: Date | null;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  canceledAt: Date | null;
  graceDays: number;
  /**
   * Lecture seule manuelle (Baba, 25/09) : posee par le super-admin, motif
   * obligatoire, JAMAIS levee par un paiement ni par la tache planifiee —
   * seulement par le super-admin (`manualReadOnlyAt = null`). Prend le pas
   * sur toute autre phase tant qu'elle est posee.
   */
  manualReadOnlyAt: Date | null;
}

export interface PhaseResult {
  phase: SubscriptionPhase;
  readOnly: boolean;
  /** Pourquoi l'agence est (ou sera, en GRACE) en lecture seule. */
  reason: ReadOnlyReason | null;
  trialEndsAt: Date | null;
  /** Fin des jours de grace, quand la phase est GRACE ou READ_ONLY apres grace. */
  graceEndsAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function afterGrace(from: Date, graceDays: number, now: Date, reason: ReadOnlyReason): PhaseResult {
  const graceEndsAt = addDays(from, graceDays);
  const inGrace = now.getTime() < graceEndsAt.getTime();
  return { phase: inGrace ? 'GRACE' : 'READ_ONLY', readOnly: !inGrace, reason, trialEndsAt: null, graceEndsAt };
}

/**
 * Phase de l'abonnement (D8) : essai -> (fin d'essai non convertie ou impaye)
 * -> grace de `graceDays` jours -> lecture seule. Les portails et paiements
 * des locataires ne dependent JAMAIS de cette phase (garde de la vague 2).
 */
export function resolveSubscriptionPhase(sub: PhaseInput | null, now: Date): PhaseResult {
  if (!sub) {
    return { phase: 'NONE', readOnly: true, reason: 'NO_SUBSCRIPTION', trialEndsAt: null, graceEndsAt: null };
  }
  if (sub.manualReadOnlyAt && sub.manualReadOnlyAt.getTime() <= now.getTime()) {
    // Lecture seule manuelle : prend le pas sur le statut/la periode, jamais
    // de grace, jamais levee automatiquement (Baba, 25/09).
    return { phase: 'READ_ONLY', readOnly: true, reason: 'MANUAL', trialEndsAt: sub.trialEndsAt, graceEndsAt: null };
  }
  const t = now.getTime();

  switch (sub.status) {
    case 'SUSPENDED':
      return {
        phase: 'READ_ONLY',
        readOnly: true,
        reason: 'SUSPENDED',
        trialEndsAt: sub.trialEndsAt,
        graceEndsAt: null
      };

    case 'CANCELED': {
      const end = sub.cancelAt ?? sub.canceledAt ?? sub.currentPeriodEnd;
      if (t < end.getTime()) {
        return {
          phase: 'ACTIVE',
          readOnly: false,
          reason: 'CANCELED',
          trialEndsAt: sub.trialEndsAt,
          graceEndsAt: null
        };
      }
      return {
        phase: 'READ_ONLY',
        readOnly: true,
        reason: 'CANCELED',
        trialEndsAt: sub.trialEndsAt,
        graceEndsAt: null
      };
    }

    case 'TRIALING': {
      const trialEnd = sub.trialEndsAt ?? sub.currentPeriodEnd;
      if (t <= trialEnd.getTime()) {
        return { phase: 'TRIAL', readOnly: false, reason: null, trialEndsAt: trialEnd, graceEndsAt: null };
      }
      return { ...afterGrace(trialEnd, sub.graceDays, now, 'TRIAL_EXPIRED'), trialEndsAt: trialEnd };
    }

    case 'PAST_DUE':
      return {
        ...afterGrace(sub.pastDueAt ?? sub.currentPeriodEnd, sub.graceDays, now, 'PAST_DUE'),
        trialEndsAt: sub.trialEndsAt
      };

    case 'ACTIVE':
    default: {
      // Periode echue sans renouvellement (la facturation de la vague 3
      // avance currentPeriodEnd a chaque emission) : grace puis lecture seule.
      if (t <= sub.currentPeriodEnd.getTime()) {
        return { phase: 'ACTIVE', readOnly: false, reason: null, trialEndsAt: sub.trialEndsAt, graceEndsAt: null };
      }
      const result = afterGrace(sub.currentPeriodEnd, sub.graceDays, now, 'PERIOD_EXPIRED');
      return { ...result, phase: result.readOnly ? 'READ_ONLY' : 'ACTIVE', trialEndsAt: sub.trialEndsAt };
    }
  }
}

// ---------------------------------------------------------------- quota (D4)

export type QuotaDecision = 'ALLOW' | 'WARN' | 'BILL' | 'BLOCK';

export interface QuotaEvaluation {
  decision: QuotaDecision;
  limit: number;
  usedBefore: number;
  usedAfter: number;
  /** Unites au-dela du plafond apres l'operation (0 si dans le plafond). */
  overBy: number;
}

/**
 * Que faire quand une operation ajoute `increment` unites a une capacite ?
 * Dans le plafond : ALLOW. Au-dela : selon SUBSCRIPTION_ENFORCEMENT puis la
 * politique de l'agence — `off` laisse tout passer, `warn` ne bloque jamais
 * (WARN), `enforce` applique la politique (BLOCK, BILL_OVERAGE -> BILL,
 * WARN_ONLY -> WARN). L'activation n'est pas bloquee par defaut (D4).
 */
export function evaluateQuota(
  capacity: { limit: number; used: number },
  increment: number,
  policy: QuotaPolicyCode,
  enforcement: SubscriptionEnforcement
): QuotaEvaluation {
  const usedAfter = capacity.used + increment;
  const overBy = Math.max(0, usedAfter - capacity.limit);
  const base = { limit: capacity.limit, usedBefore: capacity.used, usedAfter, overBy };
  if (overBy === 0 || increment <= 0) return { ...base, decision: 'ALLOW' };
  if (enforcement === 'off') return { ...base, decision: 'ALLOW' };
  if (enforcement === 'warn') return { ...base, decision: 'WARN' };
  if (policy === 'BLOCK') return { ...base, decision: 'BLOCK' };
  if (policy === 'BILL_OVERAGE') return { ...base, decision: 'BILL' };
  return { ...base, decision: 'WARN' };
}

// ---------------------------------------------------------------- synthese

export interface CapacityState extends CapacityBreakdown {
  used: number;
  /** Place restante dans le plafond (0 si depasse). */
  remaining: number;
  /** Unites au-dela du plafond (0 si dans le plafond). */
  overBy: number;
}

/**
 * Droits d'une agence, tels que `getEntitlements(tenantId)` les renvoie
 * (services/subscription-v2-service.ts). Contrat stable pour les vagues 2 et 3.
 */
export interface TenantEntitlements {
  tenantId: string;
  subscriptionId: string | null;
  status: SubscriptionStatusCode | 'NONE';
  phase: SubscriptionPhase;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  /** Lecture seule manuelle en vigueur (super-admin) : date de pose et motif saisi. */
  manualReadOnlyAt: Date | null;
  manualReadOnlyReason: string | null;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  billingCycle: 'MONTHLY' | 'ANNUAL' | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  /** Packs en vigueur (codes du catalogue). */
  packs: string[];
  /** Modules pleinement ouverts (acces FULL). */
  modules: ModuleKeyCode[];
  moduleAccess: Record<ModuleKeyCode, ModuleAccess>;
  /** Fonctionnalites des modules ouverts (lib/subscription/features.ts). */
  features: string[];
  /**
   * Barriere « detenu en propre » (pack Patrimoine, 28/09) : vrai quand le
   * SEUL module pleinement ouvert est MODULE_PATRIMOINE. L'agence gere alors
   * ses propres biens : ni mandat, ni proprietaire tiers
   * (`assertThirdPartyManagementAllowed`, guards.ts).
   */
  ownAssetsOnly: boolean;
  capacities: Record<CapacityKeyCode, CapacityState>;
  quotaPolicy: QuotaPolicyCode;
  enforcement: SubscriptionEnforcement;
  computedAt: Date;
}

export interface BuildEntitlementsInput {
  tenantId: string;
  subscription:
    | (PhaseInput & {
        id: string;
        billingCycle: 'MONTHLY' | 'ANNUAL';
        currentPeriodStart: Date;
        quotaPolicy: QuotaPolicyCode;
        manualReadOnlyReason: string | null;
      })
    | null;
  items: readonly EntitlementItem[];
  overrides: readonly EntitlementOverride[];
  moduleRows: readonly ModuleRow[];
  usage: Partial<Record<CapacityKeyCode, number>>;
  enforcement: SubscriptionEnforcement;
  /** Fonctionnalites d'une liste de modules (injectee pour garder ce fichier sans dependance). */
  featuresFor: (modules: readonly string[]) => string[];
  now: Date;
}

/** Vrai quand MODULE_PATRIMOINE est le seul module pleinement ouvert (barriere « detenu en propre »). */
export function isOwnAssetsOnly(fullModules: readonly string[]): boolean {
  return fullModules.length > 0 && fullModules.every(m => m === 'MODULE_PATRIMOINE');
}

/** Assemble les droits a partir des donnees brutes. Pur : le service ne fait que charger. */
export function buildEntitlements(input: BuildEntitlementsInput): TenantEntitlements {
  const { now } = input;
  const live = effectiveItems(input.items, now);
  const phase = resolveSubscriptionPhase(input.subscription, now);
  const { modules, access } = resolveModuleAccess(packModules(live), input.moduleRows, now);
  const limits = computeCapacityLimits(live, input.overrides, now);

  const capacities = {} as Record<CapacityKeyCode, CapacityState>;
  for (const key of CAPACITY_KEYS) {
    const used = input.usage[key] ?? 0;
    capacities[key] = {
      ...limits[key],
      used,
      remaining: Math.max(0, limits[key].limit - used),
      overBy: Math.max(0, used - limits[key].limit)
    };
  }

  const sub = input.subscription;
  return {
    tenantId: input.tenantId,
    subscriptionId: sub?.id ?? null,
    status: sub?.status ?? 'NONE',
    phase: phase.phase,
    readOnly: phase.readOnly,
    readOnlyReason: phase.reason,
    manualReadOnlyAt: sub?.manualReadOnlyAt ?? null,
    manualReadOnlyReason: phase.reason === 'MANUAL' ? (sub?.manualReadOnlyReason ?? null) : null,
    trialEndsAt: phase.trialEndsAt,
    graceEndsAt: phase.graceEndsAt,
    billingCycle: sub?.billingCycle ?? null,
    currentPeriodStart: sub?.currentPeriodStart ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    packs: heldPackCodes(live),
    modules,
    moduleAccess: access,
    features: input.featuresFor(modules),
    ownAssetsOnly: isOwnAssetsOnly(modules),
    capacities,
    quotaPolicy: sub?.quotaPolicy ?? 'BILL_OVERAGE',
    enforcement: input.enforcement,
    computedAt: now
  };
}
