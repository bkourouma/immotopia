/**
 * Facturation de la plateforme à l'agence « 3 ans » : l'agence est cliente
 * d'ImmoTopia (Alliance Consultants). Vue « Abonnement et facturation ».
 *
 * Écrit, en cohérence avec l'abonnement RÉEL de l'agence (pack, prix figés du
 * catalogue, essai repoussé à +5 ans laissé intact) :
 *  - 36 factures mensuelles de période émises à l'avance (`IMT-AAAA-NNNNN`,
 *    numérotation continue par le compteur de la série `platform_invoice_sequences`,
 *    TVA 18 % en ligne séparée, totaux = somme des lignes), payées avec leurs
 *    règlements (moyens variés, justificatifs PDF réels, retours de checkout en
 *    ligne dont des tentatives échouées), la dernière facture émise et à régler ;
 *  - une erreur de facturation corrigée par un avoir puis une facture réémise ;
 *  - des extensions ajoutées et retirées au fil du temps (`subscription_items`
 *    historisés avec prorata sur la facture suivante), des demandes d'extension
 *    acceptées, refusées ou ouvertes, des dérogations de capacité ;
 *  - un dépassement de capacité facturé quand l'histoire le raconte ;
 *  - des relevés d'usage, des alertes de seuil (80 % et 100 %), des exports de
 *    données de l'agence (dont une vraie archive).
 *
 * Aucune facture n'est passée par le service de paiement (il fait avancer la
 * période et sortirait l'agence de l'essai repoussé) ; les écritures suivent
 * exactement les invariants des services (`platform-invoice-service`,
 * `platform-payment-service`).
 *
 * Idempotent par bloc : une agence qui porte déjà des factures PLATFORM n'en
 * reçoit pas d'autres ; les exports, relevés d'usage et alertes ont leur propre garde.
 */
import * as path from 'path';

import { Prisma } from '@prisma/client';

import { env } from '../../../src/config/env';
import { PLATFORM_TAX_RATE_PERCENT } from '../../../src/lib/subscription/catalog';
import {
  assembleInvoice,
  creditNoteLines,
  formatPlatformInvoiceNumber
} from '../../../src/lib/subscription/platform-invoice';
import {
  computeOverageLines,
  computeRecurringLines,
  prorateAmount,
  resolveUnitMonthlyPrice
} from '../../../src/lib/subscription/pricing';
import type { ChargeLine, ChargeableItem, PricingCatalogItem } from '../../../src/lib/subscription/pricing';
import { between, pick } from './types';
import type { HistoryContext } from './types';
import { writeDemoPdf } from './seed-files';
import { AuditBuilder, fakeUuid, loadPeople, writeAuditRows } from './equipe-plateforme-audit';
import {
  BANKS,
  GATEWAY_SERVICES,
  PACK_STORIES,
  PAYMENT_METHOD_WEIGHTS,
  defaultCurve,
  interpolate
} from './equipe-plateforme-billing-data';
import type { CapacityKeyName, ExtensionStory, PackStory } from './equipe-plateforme-billing-data';
import { AuditActionKey } from '../../../src/types/audit-types';
import { detectPack } from './equipe-plateforme-team';

const DAY = 86_400_000;
const PERIODS = 36;
const ANCHOR_DAY = 5;
const GRACE_DAYS = 7;

const toNumber = (value: unknown): number => (value === null || value === undefined ? 0 : Number(String(value)));
const utc = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date => new Date(Date.UTC(y, m, d, h, mi, s));

type PaymentMethodName = 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'ONLINE' | 'CHECK' | 'CASH';

// ───────────────────────────────────────────────────────────── plan

interface CatalogRow extends PricingCatalogItem {
  id: string;
  setupPrice: number;
}

interface PlannedExtension {
  story: ExtensionStory;
  catalog: CatalogRow;
  unitPrice: number;
  startsAt: Date;
  endsAt: Date | null;
}

interface PlannedOverride {
  key: CapacityKeyName;
  delta: number;
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  reason: string;
}

interface Plan {
  pack: string;
  story: PackStory;
  /** Début de chaque période 0..36 (la 36e borne ferme la période en cours). */
  boundaries: Date[];
  founded: Date;
  catalog: Map<string, CatalogRow>;
  extensions: PlannedExtension[];
  overrides: PlannedOverride[];
  included: Partial<Record<CapacityKeyName, number>>;
  finalUsed: Partial<Record<CapacityKeyName, number>>;
  /** Jour -> consommation, par capacité (index = jours depuis `founded`). */
  daily: Partial<Record<CapacityKeyName, number[]>>;
}

const CAP_KEYS: readonly CapacityKeyName[] = ['LOTS', 'COPROPRIETES', 'CHANTIERS', 'BIENS_DETENUS'];

function boundariesFor(end: Date): Date[] {
  const last =
    end.getUTCDate() >= ANCHOR_DAY
      ? utc(end.getUTCFullYear(), end.getUTCMonth(), ANCHOR_DAY)
      : utc(end.getUTCFullYear(), end.getUTCMonth() - 1, ANCHOR_DAY);
  const out: Date[] = [];
  for (let k = 0; k <= PERIODS; k += 1)
    out.push(utc(last.getUTCFullYear(), last.getUTCMonth() - (PERIODS - 1) + k, ANCHOR_DAY));
  return out;
}

function dayIndex(plan: Pick<Plan, 'founded'>, date: Date): number {
  return Math.floor((date.getTime() - plan.founded.getTime()) / DAY);
}

/** Période (0..35) qui contient `date`, ou -1 avant la première. */
function periodOf(boundaries: Date[], date: Date): number {
  if (date.getTime() < boundaries[0].getTime()) return -1;
  for (let k = 0; k < PERIODS; k += 1) if (date.getTime() < boundaries[k + 1].getTime()) return k;
  return PERIODS - 1;
}

function extensionActive(ext: PlannedExtension, at: Date): boolean {
  return ext.startsAt.getTime() <= at.getTime() && (!ext.endsAt || at.getTime() < ext.endsAt.getTime());
}

function overrideActive(o: PlannedOverride, at: Date): boolean {
  if (at.getTime() < o.startsAt.getTime()) return false;
  const stops = [o.expiresAt, o.revokedAt].filter((d): d is Date => d !== null).map(d => d.getTime());
  return stops.length === 0 || at.getTime() < Math.min(...stops);
}

function limitAt(plan: Plan, key: CapacityKeyName, at: Date): number {
  let limit = plan.included[key] ?? 0;
  for (const ext of plan.extensions) {
    const size = ext.catalog.capacities[key] ?? 0;
    if (size > 0 && extensionActive(ext, at)) limit += size * ext.story.quantity;
  }
  for (const o of plan.overrides) if (o.key === key && overrideActive(o, at)) limit += o.delta;
  return limit;
}

function usedAt(plan: Plan, key: CapacityKeyName, at: Date): number {
  const series = plan.daily[key];
  if (!series) return 0;
  const idx = Math.min(series.length - 1, Math.max(0, dayIndex(plan, at)));
  return series[idx];
}

async function buildPlan(ctx: HistoryContext, pack: string): Promise<Plan | null> {
  const { prisma, tenantId, end, rng } = ctx;
  const story = PACK_STORIES[pack];
  if (!story) return null;
  const boundaries = boundariesFor(end);
  const founded = utc(ctx.start.getFullYear(), ctx.start.getMonth(), 5, 8);
  // `founded` = début de l'histoire de l'agence ; l'essai d'un mois précède la première période.
  const catalogRows = await prisma.catalogItem.findMany({ include: { capacities: true } });
  const catalog = new Map<string, CatalogRow>(
    catalogRows.map(c => {
      const capacities: Partial<Record<CapacityKeyName, number>> = {};
      for (const cap of c.capacities) capacities[cap.capacityKey as CapacityKeyName] = cap.amount;
      return [
        c.code,
        {
          id: c.id,
          code: c.code,
          kind: c.kind,
          name: c.name,
          monthlyPrice: toNumber(c.monthlyPrice),
          setupPrice: toNumber(c.setupPrice),
          capacities,
          rules: c.rules as PricingCatalogItem['rules']
        }
      ];
    })
  );
  const packRow = catalog.get(pack);
  if (!packRow) return null;

  const included: Partial<Record<CapacityKeyName, number>> = {};
  for (const key of CAP_KEYS) {
    const amount = packRow.capacities[key] ?? 0;
    if (amount > 0) included[key] = amount;
  }

  // Consommation actuelle réelle (ce que l'agence a vraiment créé).
  const { getEntitlements } = await import('../../../src/services/subscription-v2-service');
  const entitlements = await getEntitlements(tenantId, { fresh: true });
  const finalUsed: Partial<Record<CapacityKeyName, number>> = {};
  for (const key of CAP_KEYS) {
    if (included[key] !== undefined) finalUsed[key] = entitlements.capacities[key].used;
  }

  const extensions: PlannedExtension[] = [];
  for (const s of story.extensions) {
    const row = catalog.get(s.code);
    if (!row) continue;
    const startsAt = new Date(boundaries[s.startPeriod].getTime() + s.startDay * DAY + 10 * 3_600_000);
    const endsAt = s.endPeriod !== undefined ? boundaries[s.endPeriod] : null;
    const rank = (included.LOTS ?? 0) + 1;
    extensions.push({
      story: s,
      catalog: row,
      unitPrice: resolveUnitMonthlyPrice(row, {
        heldPacks: [pack],
        firstLotRank: s.code === 'EXT_LOTS_10' ? rank : undefined
      }),
      startsAt,
      endsAt
    });
  }

  const overrides: PlannedOverride[] = story.overrides.map(o => {
    const startsAt = new Date(boundaries[o.startPeriod].getTime() + o.startDay * DAY + 9 * 3_600_000);
    return {
      key: o.key,
      delta: o.delta,
      startsAt,
      expiresAt: o.validDays ? new Date(startsAt.getTime() + o.validDays * DAY) : null,
      revokedAt: o.revokeAfterDays ? new Date(startsAt.getTime() + o.revokeAfterDays * DAY) : null,
      reason: o.reason
    };
  });

  const plan: Plan = {
    pack,
    story,
    boundaries,
    founded,
    catalog,
    extensions,
    overrides,
    included,
    finalUsed,
    daily: {}
  };

  // Couverture du présent : si la consommation réelle dépasse ce que l'abonnement couvre aujourd'hui,
  // un bloc est ajouté à l'échéance du 31e mois (jamais de dépassement non facturé « par accident »).
  for (const key of CAP_KEYS) {
    const used = finalUsed[key];
    if (used === undefined) continue;
    const gap = used - limitAt(plan, key, end);
    if (gap <= 0) continue;
    const code =
      key === 'LOTS'
        ? 'EXT_LOTS_10'
        : key === 'COPROPRIETES'
          ? 'EXT_COPRO'
          : key === 'CHANTIERS'
            ? 'EXT_CHANTIER'
            : 'EXT_BIENS_10';
    const row = catalog.get(code);
    const size = row?.capacities[key] ?? 0;
    if (!row || size <= 0 || !(row.rules?.requiresAnyOf ?? [pack]).includes(pack)) continue;
    const quantity = Math.ceil(gap / size);
    const startsAt = new Date(boundaries[28].getTime() + 6 * DAY + 10 * 3_600_000);
    extensions.push({
      story: {
        code: code as ExtensionStory['code'],
        quantity,
        startPeriod: 28,
        startDay: 6,
        requestMessage: `Notre volume dépasse désormais la capacité du pack : pouvez-vous ajouter ${quantity} bloc(s) ?`,
        handledNote: 'Extension ajoutée au prorata de la période en cours.'
      },
      catalog: row,
      unitPrice: resolveUnitMonthlyPrice(row, { heldPacks: [pack] }),
      startsAt,
      endsAt: null
    });
  }

  // Courbes quotidiennes de consommation (même source pour relevés, alertes et dépassements).
  const days = Math.max(2, dayIndex(plan, end) + 1);
  for (const key of CAP_KEYS) {
    const finalValue = finalUsed[key];
    if (finalValue === undefined) continue;
    const storyCurve = story.curves[key];
    const points: Array<readonly [number, number]> = storyCurve
      ? [...storyCurve.filter(([x]) => x < 34.9), [35, finalValue]]
      : [...defaultCurve(finalValue)];
    const series: number[] = [];
    let noise = 0;
    for (let d = 0; d < days; d += 1) {
      const date = new Date(plan.founded.getTime() + d * DAY);
      const k = (date.getTime() - boundaries[0].getTime()) / (30.4375 * DAY);
      const base = interpolate(points, Math.max(0, k));
      // Petit bruit lissé : quelques lots de plus ou de moins d'un jour à l'autre, jamais plus de 2 %.
      noise = Math.max(-1, Math.min(1, noise + (rng() - 0.5) * 0.6));
      const wobble = base > 25 ? noise * Math.min(2, base * 0.02) : 0;
      series.push(Math.max(0, Math.round(base + wobble)));
    }
    series[series.length - 1] = finalValue;
    plan.daily[key] = series;
  }
  return plan;
}

// ───────────────────────────────────────────────────────────── données de référence

async function superAdminId(ctx: HistoryContext): Promise<string | null> {
  const u = await ctx.prisma.user.findFirst({
    where: { globalRole: 'SUPER_ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  return u?.id ?? null;
}

function issuerSnapshot(): Prisma.InputJsonValue {
  const clean = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    name: env.PLATFORM_ISSUER_NAME,
    address: clean(env.PLATFORM_ISSUER_ADDRESS),
    rccm: clean(env.PLATFORM_ISSUER_RCCM),
    taxId: clean(env.PLATFORM_ISSUER_TAX_ID),
    email: clean(env.PLATFORM_ISSUER_EMAIL),
    phone: clean(env.PLATFORM_ISSUER_PHONE)
  };
}

async function customerSnapshot(ctx: HistoryContext): Promise<Prisma.InputJsonValue> {
  const { prisma, tenantId } = ctx;
  const [tenant, finance] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        legalName: true,
        address: true,
        city: true,
        country: true,
        contactEmail: true,
        contactPhone: true
      }
    }),
    prisma.agencyFinanceSettings.findFirst({ where: { tenantId }, select: { taxpayerNumber: true } })
  ]);
  const address = [tenant?.address, tenant?.city, tenant?.country].filter(Boolean).join(', ');
  return {
    tenantId,
    name: tenant?.legalName || tenant?.name || 'Agence',
    address: address || null,
    email: tenant?.contactEmail ?? null,
    phone: tenant?.contactPhone ?? null,
    taxId: finance?.taxpayerNumber ?? null
  };
}

function weighted<T extends string>(rng: () => number, table: ReadonlyArray<readonly [T, number]>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of table) {
    r -= weight;
    if (r <= 0) return value;
  }
  return table[0][0];
}

const frDate = (d: Date): string => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const fcfa = (n: number): string =>
  `${Math.round(n)
    .toLocaleString('fr-FR')
    .replace(/[\u202f\u00a0]/g, ' ')} F CFA`;

// ───────────────────────────────────────────────────────────── blocs

async function writeSubscriptionHistory(
  ctx: HistoryContext,
  plan: Plan,
  adminId: string,
  superId: string | null
): Promise<Map<PlannedExtension, string>> {
  const { prisma, tenantId, end } = ctx;
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
  if (!subscription) throw new Error('Abonnement introuvable.');
  const lastPeriodEnd = plan.boundaries[PERIODS];
  const packItem = await prisma.subscriptionItem.findFirst({
    where: { tenantId, catalogItem: { kind: 'PACK' } },
    orderBy: { startsAt: 'asc' },
    select: { id: true }
  });
  if (packItem) {
    await prisma.subscriptionItem.update({
      where: { id: packItem.id },
      data: {
        startsAt: plan.founded,
        createdAt: plan.founded,
        billedThrough: lastPeriodEnd,
        note: 'Souscription initiale du pack.'
      }
    });
  }
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { startAt: plan.founded, createdAt: plan.founded }
  });

  const ids = new Map<PlannedExtension, string>();
  const already = await prisma.subscriptionItem.count({ where: { tenantId, catalogItem: { kind: 'EXTENSION' } } });
  if (already > 0) return ids;
  for (const ext of plan.extensions) {
    const ended = ext.endsAt !== null && ext.endsAt.getTime() <= end.getTime();
    // eslint-disable-next-line no-await-in-loop -- quelques éléments par agence.
    const row = await prisma.subscriptionItem.create({
      data: {
        subscriptionId: subscription.id,
        tenantId,
        catalogItemId: ext.catalog.id,
        quantity: ext.story.quantity,
        unitMonthlyPrice: ext.unitPrice,
        unitSetupPrice: 0,
        discountPercent: 0,
        status: ended ? 'ENDED' : 'ACTIVE',
        startsAt: ext.startsAt,
        endsAt: ended ? ext.endsAt : null,
        endReason: ended ? (ext.story.endReason ?? 'Retrait à l’échéance.') : null,
        addedByUserId: superId ?? adminId,
        endedByUserId: ended ? (superId ?? adminId) : null,
        parentItemId: packItem?.id ?? null,
        billedThrough: ended ? ext.endsAt : lastPeriodEnd,
        note: ext.story.handledNote,
        createdAt: ext.startsAt,
        updatedAt: ended ? (ext.endsAt as Date) : ext.startsAt
      },
      select: { id: true }
    });
    ids.set(ext, row.id);
  }
  return ids;
}

async function writeRequestsAndOverrides(
  ctx: HistoryContext,
  plan: Plan,
  people: Awaited<ReturnType<typeof loadPeople>>,
  superId: string | null
): Promise<void> {
  const { prisma, tenantId, end } = ctx;
  const requesters = people.filter(p => p.roleKey === 'TENANT_ADMIN' || p.roleKey === 'TENANT_MANAGER');
  const requester = (at: Date): string => {
    const alive = requesters.filter(p => p.joinedAt.getTime() <= at.getTime() && p.endAt.getTime() >= at.getTime());
    return (alive[0] ?? requesters[0] ?? people[0]).id;
  };

  if ((await prisma.subscriptionExtensionRequest.count({ where: { tenantId } })) === 0) {
    // Demandes liées aux extensions ajoutées + les autres du scénario.
    for (const ext of plan.extensions) {
      const createdAt = new Date(ext.startsAt.getTime() - 11 * DAY);
      const handledAt = new Date(ext.startsAt.getTime() - 1 * DAY);
      // eslint-disable-next-line no-await-in-loop -- quelques demandes par agence.
      await prisma.subscriptionExtensionRequest.create({
        data: {
          tenantId,
          requestedByUserId: requester(createdAt),
          catalogCode: ext.story.code,
          quantity: ext.story.quantity,
          message: ext.story.requestMessage,
          status: 'HANDLED',
          handledAt,
          handledByUserId: superId,
          handledNote: ext.story.handledNote,
          createdAt,
          updatedAt: handledAt
        }
      });
    }
    for (const r of plan.story.requests) {
      const createdAt = new Date(plan.boundaries[r.period].getTime() + r.day * DAY + 11 * 3_600_000);
      if (createdAt.getTime() > end.getTime()) continue;
      const handled = r.status !== 'OPEN';
      const handledAt = handled ? new Date(createdAt.getTime() + 2 * DAY + 3 * 3_600_000) : null;
      // eslint-disable-next-line no-await-in-loop -- quelques demandes par agence.
      await prisma.subscriptionExtensionRequest.create({
        data: {
          tenantId,
          requestedByUserId: requester(createdAt),
          catalogCode: r.catalogCode,
          quantity: r.quantity,
          message: r.message,
          status: r.status,
          handledAt,
          handledByUserId: handled ? superId : null,
          handledNote: handled ? (r.handledNote ?? null) : null,
          createdAt,
          updatedAt: handledAt ?? createdAt
        }
      });
    }
  }

  if ((await prisma.capacityOverride.count({ where: { tenantId } })) === 0) {
    for (const o of plan.overrides) {
      // eslint-disable-next-line no-await-in-loop -- quelques dérogations par agence.
      await prisma.capacityOverride.create({
        data: {
          tenantId,
          capacityKey: o.key,
          delta: o.delta,
          reason: o.reason,
          startsAt: o.startsAt,
          expiresAt: o.expiresAt,
          grantedByUserId: superId,
          revokedAt: o.revokedAt,
          revokedByUserId: o.revokedAt ? superId : null,
          createdAt: o.startsAt,
          updatedAt: o.revokedAt ?? o.startsAt
        }
      });
    }
  }
}

/** Lignes de la facture de la période `k` (émise au début de k, pour k). */
function invoiceLinesFor(plan: Plan, k: number, setupWithFirst: boolean): ChargeLine[] {
  const start = plan.boundaries[k];
  const end = plan.boundaries[k + 1];
  const packRow = plan.catalog.get(plan.pack) as CatalogRow;
  const chargeable: ChargeableItem[] = [
    { code: plan.pack, kind: 'PACK', name: packRow.name, quantity: 1, unitMonthlyPrice: packRow.monthlyPrice }
  ];
  const prorata: ChargeLine[] = [];
  for (const ext of plan.extensions) {
    // Récurrent dès la période qui suit l'ajout, jusqu'à l'échéance de retrait.
    if (ext.startsAt.getTime() < start.getTime() && (!ext.endsAt || ext.endsAt.getTime() > start.getTime())) {
      chargeable.push({
        code: ext.catalog.code,
        kind: 'EXTENSION',
        name: ext.catalog.name,
        quantity: ext.story.quantity,
        unitMonthlyPrice: ext.unitPrice
      });
    }
    // Prorata de la période d'ajout, repris par la facture suivante.
    const addedIn = periodOf(plan.boundaries, ext.startsAt);
    if (addedIn === k - 1) {
      const monthly = ext.story.quantity * ext.unitPrice;
      prorata.push({
        kind: 'PRORATA',
        label: `${ext.catalog.name} — prorata du ${ext.startsAt.toISOString().slice(0, 10)}`,
        code: ext.catalog.code,
        quantity: ext.story.quantity,
        unitPrice: ext.unitPrice,
        amount: prorateAmount(monthly, plan.boundaries[addedIn], plan.boundaries[addedIn + 1], ext.startsAt),
        periodStart: ext.startsAt,
        periodEnd: plan.boundaries[addedIn + 1]
      });
    }
  }
  const recurring = computeRecurringLines(chargeable, { comboDiscountPercent: 10 });
  const lines: ChargeLine[] = recurring.lines.map(l => ({ ...l, periodStart: start, periodEnd: end }));
  lines.push(...prorata);

  if (setupWithFirst && k === 0) {
    const setup = plan.catalog.get(`SETUP_${plan.pack}`);
    if (setup && setup.setupPrice > 0) {
      lines.push({
        kind: 'SETUP',
        label: setup.name,
        code: setup.code,
        quantity: 1,
        unitPrice: setup.setupPrice,
        amount: setup.setupPrice,
        periodStart: start,
        periodEnd: end
      });
    }
  }

  // Dépassement : pic de la période précédente au-delà de la capacité en vigueur à sa fin (politique BILL_OVERAGE).
  if (k >= 1) {
    for (const key of CAP_KEYS) {
      if (plan.included[key] === undefined) continue;
      const prevStart = plan.boundaries[k - 1];
      let peak = 0;
      for (let t = prevStart.getTime(); t < start.getTime(); t += DAY)
        peak = Math.max(peak, usedAt(plan, key, new Date(t)));
      const limit = limitAt(plan, key, new Date(start.getTime() - DAY));
      if (peak <= limit) continue;
      const extCode =
        key === 'LOTS'
          ? 'EXT_LOTS_10'
          : key === 'COPROPRIETES'
            ? 'EXT_COPRO'
            : key === 'CHANTIERS'
              ? 'EXT_CHANTIER'
              : 'EXT_BIENS_10';
      const extension = plan.catalog.get(extCode);
      if (!extension) continue;
      for (const l of computeOverageLines({ capacityKey: key, limit, used: peak, heldPacks: [plan.pack], extension })) {
        lines.push({ ...l, periodStart: prevStart, periodEnd: start });
      }
    }
  }
  return lines;
}

async function nextNumber(tx: Prisma.TransactionClient, issuedAt: Date): Promise<string> {
  const year = issuedAt.getUTCFullYear();
  const rows = await tx.$queryRaw<Array<{ last_number: number }>>`
    INSERT INTO platform_invoice_sequences (year, last_number, updated_at)
    VALUES (${year}, 1, NOW())
    ON CONFLICT (year) DO UPDATE
      SET last_number = platform_invoice_sequences.last_number + 1, updated_at = NOW()
    RETURNING last_number`;
  return formatPlatformInvoiceNumber(year, Number(rows[0].last_number));
}

async function writeLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  invoiceId: string,
  lines: readonly ChargeLine[],
  plan: Plan,
  source: string,
  createdAt: Date,
  extra: Record<string, unknown> = {}
): Promise<void> {
  let sortOrder = 0;
  for (const line of lines) {
    sortOrder += 10;
    const catalog = line.code ? plan.catalog.get(line.code) : undefined;
    // eslint-disable-next-line no-await-in-loop -- quelques lignes par facture.
    await tx.invoiceLine.create({
      data: {
        tenantId,
        invoiceId,
        kind: line.kind as never,
        label: line.label,
        catalogItemId: catalog?.id ?? null,
        capacityKey: (line.capacityKey as never) ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        periodStart: line.periodStart ?? null,
        periodEnd: line.periodEnd ?? null,
        sortOrder,
        metadata: { source, code: line.code ?? null, ...extra } as Prisma.InputJsonValue,
        createdAt
      }
    });
  }
}

interface PaymentOutcome {
  method: PaymentMethodName;
  paidAt: Date;
  reference: string;
}

async function writeInvoicesAndPayments(
  ctx: HistoryContext,
  plan: Plan,
  adminId: string,
  superId: string | null,
  b: AuditBuilder
): Promise<number> {
  const { prisma, tenantId, rng, end } = ctx;
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
  const issuer = issuerSnapshot();
  const customer = await customerSnapshot(ctx);
  const subscriptionId = subscription?.id ?? null;
  const payer = (at: Date) => b.actor(['TENANT_ACCOUNTANT', 'TENANT_ADMIN'], at);
  let written = 0;
  const proofDir = ['platform', 'invoice-payments', tenantId];
  let onlineFailures = 0;
  let onlineCount = 0;

  for (let k = 0; k < PERIODS; k += 1) {
    const periodStart = plan.boundaries[k];
    const periodEnd = plan.boundaries[k + 1];
    const issuedAt = new Date(periodStart.getTime() + 6 * 3_600_000 + between(rng, 0, 40) * 60_000);
    if (issuedAt.getTime() > end.getTime()) continue;
    const isCurrent = k === PERIODS - 1;
    const baseLines = invoiceLinesFor(plan, k, true);
    const creditNoteHere = k === plan.story.creditNotePeriod;

    // Facture(s) de la période : l'erreur corrigée produit facture annulée, avoir puis facture réémise.
    const variants: Array<{ role: 'normal' | 'wrong' | 'reissued'; lines: ChargeLine[]; at: Date }> = creditNoteHere
      ? [
          { role: 'wrong', lines: baseLines, at: issuedAt },
          { role: 'reissued', lines: [], at: new Date(issuedAt.getTime() + 3 * DAY + 3 * 3_600_000) }
        ]
      : [{ role: 'normal', lines: baseLines, at: issuedAt }];

    for (const variant of variants) {
      let lines = variant.lines;
      if (variant.role === 'reissued') {
        // Facture corrigée : même contenu + geste commercial (remise de fidélité sur le pack).
        const packLine = baseLines.find(l => l.kind === 'PACK');
        const discount = Math.round((packLine?.amount ?? 0) * 0.1);
        lines = [
          ...baseLines,
          {
            kind: 'DISCOUNT',
            label: 'Remise de fidélité (10 % sur le pack)',
            quantity: 1,
            unitPrice: -discount,
            amount: -discount,
            periodStart,
            periodEnd
          }
        ];
      }
      const totals = assembleInvoice(lines);
      const paid = !isCurrent && variant.role !== 'wrong';
      const method = weighted(rng, PAYMENT_METHOD_WEIGHTS);
      const lateDays = rng() < 0.12 ? between(rng, 9, 20) : between(rng, 0, 4);
      const paidAt = new Date(
        Math.min(variant.at.getTime() + lateDays * DAY + between(rng, 3, 9) * 3_600_000, end.getTime() - 3_600_000)
      );
      const outcome: PaymentOutcome | null = paid
        ? {
            method,
            paidAt,
            reference:
              method === 'ONLINE'
                ? `PSH-${between(rng, 10, 99)}${between(rng, 100000, 999999)}`
                : method === 'BANK_TRANSFER'
                  ? `VIR-${paidAt.getUTCFullYear()}-${String(between(rng, 1, 99999)).padStart(5, '0')} ${pick(rng, BANKS)}`
                  : method === 'MOBILE_MONEY'
                    ? `MM${paidAt.getUTCFullYear().toString().slice(2)}${between(rng, 100000000, 999999999)}`
                    : method === 'CHECK'
                      ? `Chèque n° ${String(between(rng, 100000, 999999))} ${pick(rng, BANKS)}`
                      : `Reçu de caisse n° ${between(rng, 100, 999)}`
          }
        : null;
      const dueDate = new Date(variant.at.getTime() + GRACE_DAYS * DAY);

      // eslint-disable-next-line no-await-in-loop -- séquentiel : la numérotation suit l'ordre des dates.
      const invoiceId = await prisma.$transaction(
        async tx => {
          const number = await nextNumber(tx, variant.at);
          const invoice = await tx.invoice.create({
            data: {
              tenantId,
              subscriptionId,
              invoiceNumber: number,
              issueDate: variant.at,
              issuedAt: variant.at,
              sentAt: new Date(variant.at.getTime() + 4 * 60_000),
              dueDate,
              currency: 'FCFA',
              kind: 'PLATFORM',
              billingNature: 'PERIOD',
              status: variant.role === 'wrong' ? 'CANCELED' : paid ? 'PAID' : 'ISSUED',
              paidAt: outcome?.paidAt ?? null,
              paymentMethod: outcome?.method ?? null,
              paymentReference: outcome?.reference ?? null,
              canceledAt: variant.role === 'wrong' ? new Date(variant.at.getTime() + 3 * DAY) : null,
              cancelReason:
                variant.role === 'wrong' ? 'Remise de fidélité omise : facture annulée par avoir puis réémise.' : null,
              periodStart,
              periodEnd,
              amountExclTax: totals.amountExclTax,
              taxAmount: totals.taxAmount,
              taxRate: PLATFORM_TAX_RATE_PERCENT,
              amountTotal: totals.amountTotal,
              notes: null,
              issuerSnapshot: issuer,
              customerSnapshot: customer,
              createdAt: new Date(variant.at.getTime() - 60_000),
              updatedAt: outcome?.paidAt ?? variant.at
            },
            select: { id: true }
          });
          await writeLines(
            tx,
            tenantId,
            invoice.id,
            totals.lines,
            plan,
            'GENERATED',
            new Date(variant.at.getTime() - 60_000)
          );
          return { id: invoice.id, number };
        },
        { timeout: 60_000 }
      );

      b.emit(variant.at, AuditActionKey.INVOICE_ISSUED, null, 'Invoice', invoiceId.id, {
        payload: {
          invoiceNumber: invoiceId.number,
          periodStart: periodStart.toISOString(),
          amountTotal: totals.amountTotal
        },
        system: true
      });
      written += 1;

      if (variant.role === 'wrong') {
        // Avoir : lignes opposées, numéro de la série, payé par compensation (la facture n'était pas réglée).
        const cnAt = new Date(variant.at.getTime() + 3 * DAY + 2 * 3_600_000);
        const reversed = creditNoteLines(totals.lines);
        // eslint-disable-next-line no-await-in-loop -- séquentiel.
        const cn = await prisma.$transaction(async tx => {
          const number = await nextNumber(tx, cnAt);
          const note = await tx.invoice.create({
            data: {
              tenantId,
              subscriptionId,
              invoiceNumber: number,
              issueDate: cnAt,
              issuedAt: cnAt,
              dueDate: cnAt,
              currency: 'FCFA',
              kind: 'PLATFORM',
              billingNature: 'CREDIT_NOTE',
              creditedInvoiceId: invoiceId.id,
              status: 'PAID',
              paidAt: cnAt,
              paymentMethod: 'COMPENSATION',
              periodStart,
              periodEnd,
              amountExclTax: reversed.amountExclTax,
              taxAmount: reversed.taxAmount,
              taxRate: PLATFORM_TAX_RATE_PERCENT,
              amountTotal: reversed.amountTotal,
              notes: 'Remise de fidélité omise : facture annulée et réémise.',
              issuerSnapshot: issuer,
              customerSnapshot: customer,
              createdAt: cnAt,
              updatedAt: cnAt
            },
            select: { id: true }
          });
          await writeLines(tx, tenantId, note.id, reversed.lines, plan, 'CREDIT_NOTE', cnAt, {
            creditedInvoiceId: invoiceId.id
          });
          return { id: note.id, number };
        });
        b.emit(cnAt, AuditActionKey.INVOICE_CREDIT_NOTE_ISSUED, b.people[0], 'Invoice', cn.id, {
          payload: { creditedInvoiceId: invoiceId.id, invoiceNumber: cn.number, reason: 'Remise de fidélité omise' },
          superAdminId: superId
        });
        b.emit(cnAt, AuditActionKey.INVOICE_CANCELED, b.people[0], 'Invoice', invoiceId.id, {
          payload: { creditNoteId: cn.id, reason: 'Remise de fidélité omise' },
          superAdminId: superId
        });
        continue;
      }

      if (!outcome) {
        // Facture en cours : une tentative de paiement en ligne abandonnée aujourd'hui.
        if (isCurrent) {
          const who = payer(end);
          const startedAt = new Date(end.getTime() - 3 * 3_600_000);
          // eslint-disable-next-line no-await-in-loop -- une tentative.
          await prisma.platformPaymentCheckout.create({
            data: {
              tenantId,
              invoiceId: invoiceId.id,
              provider: 'PAYSECUREHUB',
              mode: 'SIMULATOR',
              codePaiement: `IMP-${fakeUuid(rng).replace(/-/g, '').slice(0, 20)}`,
              amount: totals.amountTotal,
              currency: 'FCFA',
              checkoutUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/simulator/abandoned`,
              status: 'CANCELED',
              lastProviderState: 'CANCELED',
              lastCheckedAt: new Date(startedAt.getTime() + 6 * 60_000),
              checkAttempts: 1,
              simulatedOutcome: 'CANCELED',
              createdByUserId: who.id,
              completedAt: new Date(startedAt.getTime() + 6 * 60_000),
              createdAt: startedAt,
              updatedAt: new Date(startedAt.getTime() + 6 * 60_000)
            }
          });
          b.emit(startedAt, AuditActionKey.PLATFORM_PAYMENT_STARTED, who, 'Invoice', invoiceId.id, {
            payload: { mode: 'SIMULATOR', amount: totals.amountTotal }
          });
        }
        continue;
      }

      // Règlement (un seul par facture) et, en ligne, son checkout.
      const who = payer(outcome.paidAt);
      let checkoutId: string | null = null;
      if (outcome.method === 'ONLINE') {
        const service = pick(rng, GATEWAY_SERVICES);
        const fees = Math.round(totals.amountTotal * (service === 'VISA' ? 0.028 : 0.017));
        // Tentative échouée ou abandonnée avant le succès, une fois de temps en temps.
        onlineCount += 1;
        if (onlineFailures < 3 && onlineCount % 2 === 0) {
          onlineFailures += 1;
          const failedAt = new Date(outcome.paidAt.getTime() - between(rng, 20, 180) * 60_000);
          const failed = onlineFailures === 2;
          // eslint-disable-next-line no-await-in-loop -- rare.
          await prisma.platformPaymentCheckout.create({
            data: {
              tenantId,
              invoiceId: invoiceId.id,
              provider: 'PAYSECUREHUB',
              mode: 'SIMULATOR',
              codePaiement: `IMP-${fakeUuid(rng).replace(/-/g, '').slice(0, 20)}`,
              amount: totals.amountTotal,
              currency: 'FCFA',
              checkoutUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/simulator/failed`,
              providerServiceName: service,
              status: failed ? 'FAILED' : onlineFailures === 1 ? 'CANCELED' : 'EXPIRED',
              lastProviderState: failed ? 'FAILED' : 'CANCELED',
              failureMessage: failed ? 'Solde insuffisant sur le compte Mobile Money.' : null,
              lastCheckedAt: new Date(failedAt.getTime() + 5 * 60_000),
              checkAttempts: 1,
              simulatedOutcome: failed ? 'FAILED' : 'CANCELED',
              createdByUserId: who.id,
              completedAt: new Date(failedAt.getTime() + 5 * 60_000),
              createdAt: failedAt,
              updatedAt: new Date(failedAt.getTime() + 5 * 60_000)
            }
          });
          b.emit(
            failedAt,
            AuditActionKey.PLATFORM_PAYMENT_STARTED,
            who,
            'Invoice',
            invoiceId.id,
            { payload: { mode: 'SIMULATOR', amount: totals.amountTotal } },
            false
          );
        }
        const startedAt = new Date(outcome.paidAt.getTime() - between(rng, 2, 9) * 60_000);
        const code = `IMP-${fakeUuid(rng).replace(/-/g, '').slice(0, 20)}`;
        // eslint-disable-next-line no-await-in-loop -- un checkout par paiement en ligne.
        const checkout = await prisma.platformPaymentCheckout.create({
          data: {
            tenantId,
            invoiceId: invoiceId.id,
            provider: 'PAYSECUREHUB',
            mode: 'SIMULATOR',
            codePaiement: code,
            amount: totals.amountTotal,
            currency: 'FCFA',
            checkoutUrl: `${env.BACKEND_URL.replace(/\/$/, '')}/api/payment-gateway/simulator/${code}`,
            providerToken: fakeUuid(rng).replace(/-/g, ''),
            providerTransactionId: outcome.reference,
            providerServiceName: service,
            providerFees: fees,
            status: 'SUCCESS',
            lastProviderState: 'SUCCESS',
            lastProviderPayload: {
              state: 'SUCCESS',
              serviceName: service,
              transactionId: outcome.reference,
              fees
            } as Prisma.InputJsonValue,
            lastCheckedAt: outcome.paidAt,
            checkAttempts: 1,
            simulatedOutcome: 'SUCCESS',
            createdByUserId: who.id,
            completedAt: outcome.paidAt,
            createdAt: startedAt,
            updatedAt: outcome.paidAt
          },
          select: { id: true }
        });
        checkoutId = checkout.id;
        b.emit(
          startedAt,
          AuditActionKey.PLATFORM_PAYMENT_STARTED,
          who,
          'Invoice',
          invoiceId.id,
          {
            payload: { codePaiement: code, mode: 'SIMULATOR', amount: totals.amountTotal }
          },
          false
        );
        b.emit(outcome.paidAt, AuditActionKey.INVOICE_MARKED_PAID, null, 'Invoice', invoiceId.id, {
          payload: { source: 'ONLINE', codePaiement: code, mode: 'SIMULATOR' },
          system: true
        });
      } else {
        b.emit(outcome.paidAt, AuditActionKey.INVOICE_MARKED_PAID, b.people[0], 'Invoice', invoiceId.id, {
          payload: { source: 'MANUAL', hasProof: outcome.method === 'BANK_TRANSFER' || outcome.method === 'CHECK' },
          superAdminId: superId
        });
      }

      let proof: { path: string; name: string; mimeType: string } | null = null;
      if (outcome.method === 'BANK_TRANSFER' || outcome.method === 'CHECK') {
        const label = outcome.method === 'BANK_TRANSFER' ? 'Avis de virement' : 'Copie du chèque';
        const fileName = `justificatif-${invoiceId.number}.pdf`;
        // eslint-disable-next-line no-await-in-loop -- un justificatif par règlement manuel.
        const stored = await writeDemoPdf(proofDir, fileName, `${label} — ${invoiceId.number}`, [
          `# ${label}`,
          `Bénéficiaire : ${env.PLATFORM_ISSUER_NAME}`,
          `Donneur d'ordre : ${String((customer as { name: string }).name)}`,
          `Facture réglée : ${invoiceId.number}`,
          `Montant : ${fcfa(totals.amountTotal)}`,
          `Date : ${frDate(outcome.paidAt)}`,
          `Référence : ${outcome.reference}`,
          '',
          'Document de démonstration joint par l’agence au constat de paiement.'
        ]);
        proof = {
          path: path.posix.join(...proofDir, stored.fileName),
          name: stored.fileName,
          mimeType: 'application/pdf'
        };
      }
      // eslint-disable-next-line no-await-in-loop -- un règlement par facture.
      await prisma.platformInvoicePayment.create({
        data: {
          tenantId,
          invoiceId: invoiceId.id,
          method: outcome.method,
          amount: totals.amountTotal,
          currency: 'FCFA',
          paidAt: outcome.paidAt,
          reference: outcome.reference,
          note: lateDays > 8 ? 'Règlement reçu après relance de la plateforme.' : null,
          proofPath: proof?.path ?? null,
          proofName: proof?.name ?? null,
          proofMimeType: proof?.mimeType ?? null,
          checkoutId,
          recordedByUserId: outcome.method === 'ONLINE' ? who.id : (superId ?? adminId),
          createdAt: outcome.paidAt
        }
      });
    }
  }
  return written;
}

/** Relevés d'usage (hebdomadaires, puis quotidiens sur les trois dernières semaines) et alertes de seuil. */
async function writeUsage(ctx: HistoryContext, plan: Plan): Promise<{ snapshots: number; alerts: number }> {
  const { prisma, tenantId, end } = ctx;
  const result = { snapshots: 0, alerts: 0 };
  const keys = CAP_KEYS.filter(k => plan.daily[k] !== undefined);

  if ((await prisma.usageSnapshot.count({ where: { tenantId } })) === 0) {
    const rows: Prisma.UsageSnapshotCreateManyInput[] = [];
    const total = dayIndex(plan, end);
    for (let d = 0; d <= total; d += 1) {
      const date = new Date(plan.founded.getTime() + d * DAY);
      const dom = date.getUTCDate();
      const recent = end.getTime() - date.getTime() < 21 * DAY;
      if (!(recent || dom === 1 || dom === 8 || dom === 15 || dom === 22)) continue;
      if (date.getTime() < plan.boundaries[0].getTime()) continue;
      const k = periodOf(plan.boundaries, date);
      for (const key of keys) {
        const limit = limitAt(plan, key, date);
        const used = usedAt(plan, key, date);
        let extensions = 0;
        for (const ext of plan.extensions) {
          const size = ext.catalog.capacities[key] ?? 0;
          if (size > 0 && extensionActive(ext, date)) extensions += size * ext.story.quantity;
        }
        let overrides = 0;
        for (const o of plan.overrides) if (o.key === key && overrideActive(o, date)) overrides += o.delta;
        rows.push({
          tenantId,
          capacityKey: key,
          snapshotDate: utc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
          periodStart: plan.boundaries[Math.max(0, k)],
          used,
          limit,
          overage: Math.max(0, used - limit),
          details: { included: plan.included[key] ?? 0, extensions, overrides } as Prisma.InputJsonValue,
          createdAt: new Date(date.getTime() + 23 * 3_600_000 + 50 * 60_000)
        });
      }
    }
    await prisma.usageSnapshot.createMany({ data: rows, skipDuplicates: true });
    result.snapshots = rows.length;
  }

  if ((await prisma.quotaAlert.count({ where: { tenantId } })) === 0) {
    const alerts: Prisma.QuotaAlertCreateManyInput[] = [];
    for (let k = 0; k < PERIODS; k += 1) {
      const from = plan.boundaries[k];
      const to = new Date(Math.min(plan.boundaries[k + 1].getTime(), end.getTime()));
      for (const key of keys) {
        for (const threshold of [80, 100]) {
          for (let t = from.getTime(); t < to.getTime(); t += DAY) {
            const date = new Date(t);
            const limit = limitAt(plan, key, date);
            const used = usedAt(plan, key, date);
            if (limit <= 0 || used <= 0 || used * 100 < limit * threshold) continue;
            const at = new Date(t + 4 * 3_600_000 + between(ctx.rng, 0, 120) * 60_000);
            alerts.push({
              tenantId,
              capacityKey: key,
              threshold,
              periodStart: from,
              used,
              limit,
              notifiedAt: new Date(at.getTime() + 2 * 60_000),
              createdAt: at
            });
            break;
          }
        }
      }
    }
    await prisma.quotaAlert.createMany({ data: alerts, skipDuplicates: true });
    result.alerts = alerts.length;
  }
  return result;
}

/** Exports de données demandés à la plateforme : une vraie archive récente, des archives expirées, un échec. */
async function writeDataExports(ctx: HistoryContext, b: AuditBuilder, superId: string | null): Promise<number> {
  const { prisma, tenantId, end, rng } = ctx;
  if (!superId) return 0;
  if ((await prisma.tenantDataExport.count({ where: { tenantId } })) > 0) return 0;
  const requestedBy = superId;
  const past = (daysAgo: number, hour: number): Date =>
    new Date(utc(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), hour).getTime() - daysAgo * DAY);

  const expired = [
    {
      requested: past(430, 10),
      rows: between(rng, 41000, 52000),
      models: 118,
      files: between(rng, 300, 520),
      size: between(rng, 90, 180)
    },
    {
      requested: past(150, 15),
      rows: between(rng, 62000, 85000),
      models: 124,
      files: between(rng, 700, 1100),
      size: between(rng, 240, 420)
    }
  ];
  for (const e of expired) {
    const started = new Date(e.requested.getTime() + 20_000);
    const finished = new Date(e.requested.getTime() + between(rng, 90, 260) * 1000);
    // eslint-disable-next-line no-await-in-loop -- deux archives expirées.
    const row = await prisma.tenantDataExport.create({
      data: {
        tenantId,
        status: 'EXPIRED',
        requestedById: requestedBy,
        filePath: null,
        sizeBytes: BigInt(e.size * 1024 * 1024),
        modelCount: e.models,
        rowCount: e.rows,
        fileCount: e.files,
        missingFileCount: 0,
        startedAt: started,
        finishedAt: finished,
        expiresAt: new Date(finished.getTime() + 7 * DAY),
        createdAt: e.requested
      }
    });
    b.emit(e.requested, AuditActionKey.TENANT_DATA_EXPORT_REQUESTED, b.people[0], 'TenantDataExport', row.id, {
      superAdminId: superId,
      payload: null
    });
    b.emit(
      new Date(finished.getTime() + 2 * DAY),
      AuditActionKey.TENANT_DATA_EXPORT_DOWNLOADED,
      b.people[0],
      'TenantDataExport',
      row.id,
      { superAdminId: superId, payload: null }
    );
    b.emit(
      new Date(finished.getTime() + 7 * DAY + 3_600_000),
      AuditActionKey.TENANT_DATA_EXPORT_DELETED,
      null,
      'TenantDataExport',
      row.id,
      { system: true, payload: { reason: 'expired' } }
    );
  }

  const failedAt = past(290, 9);
  const failed = await prisma.tenantDataExport.create({
    data: {
      tenantId,
      status: 'FAILED',
      requestedById: requestedBy,
      error:
        "Espace disque insuffisant sur le serveur pour préparer l'archive. Libérez de l'espace, puis relancez l'export.",
      startedAt: new Date(failedAt.getTime() + 15_000),
      finishedAt: new Date(failedAt.getTime() + 95_000),
      createdAt: failedAt
    }
  });
  b.emit(failedAt, AuditActionKey.TENANT_DATA_EXPORT_REQUESTED, b.people[0], 'TenantDataExport', failed.id, {
    superAdminId: superId,
    payload: null
  });

  // Archive RÉELLE d'hier, construite par le service d'export (données et fichiers de l'agence).
  const requestedAt = new Date(end.getTime() - 26 * 3_600_000);
  const ready = await prisma.tenantDataExport.create({
    data: { tenantId, status: 'QUEUED', requestedById: requestedBy, createdAt: requestedAt },
    select: { id: true }
  });
  try {
    const { runTenantDataExport } = await import('../../../src/services/tenant-data-export/export-service');
    await runTenantDataExport(ready.id);
  } catch (error) {
    ctx.log(`exports : archive réelle non construite (${error instanceof Error ? error.message : String(error)}).`);
  }
  const built = await prisma.tenantDataExport.findUnique({ where: { id: ready.id }, select: { status: true } });
  if (built && built.status !== 'READY' && built.status !== 'FAILED') {
    // Garde d'agence en mode « enforce » ou service indisponible : jamais de ligne laissée « en préparation ».
    await prisma.tenantDataExport.update({
      where: { id: ready.id },
      data: {
        status: 'FAILED',
        error: "La préparation de l'archive a échoué. Consultez les journaux du serveur, puis relancez l'export.",
        finishedAt: new Date(requestedAt.getTime() + 2 * 60_000)
      }
    });
  }
  if (built?.status === 'READY') {
    const finishedAt = new Date(requestedAt.getTime() + 4 * 60_000);
    await prisma.tenantDataExport.update({
      where: { id: ready.id },
      data: {
        startedAt: new Date(requestedAt.getTime() + 20_000),
        finishedAt,
        // Archive de démonstration : conservée un an (le service l'expirerait après 7 jours).
        expiresAt: new Date(end.getTime() + 365 * DAY)
      }
    });
  }
  b.emit(requestedAt, AuditActionKey.TENANT_DATA_EXPORT_REQUESTED, b.people[0], 'TenantDataExport', ready.id, {
    superAdminId: superId,
    payload: null
  });
  if (built?.status === 'READY') {
    b.emit(
      new Date(requestedAt.getTime() + 3 * 3_600_000),
      AuditActionKey.TENANT_DATA_EXPORT_DOWNLOADED,
      b.people[0],
      'TenantDataExport',
      ready.id,
      { superAdminId: superId, payload: null }
    );
  }
  return 4;
}

export interface BillingResult {
  invoices: number;
  snapshots: number;
  alerts: number;
  exports: number;
}

export async function seedPlatformBilling(ctx: HistoryContext): Promise<BillingResult> {
  const { prisma, tenantId, adminUserId, log } = ctx;
  const result: BillingResult = { invoices: 0, snapshots: 0, alerts: 0, exports: 0 };
  const pack = await detectPack(ctx);
  if (!pack) return result;
  const plan = await buildPlan(ctx, pack);
  if (!plan) {
    log(`facturation : pack ${pack} sans scénario, ignorée.`);
    return result;
  }
  const people = await loadPeople(ctx);
  const founded = people.reduce((min, p) => (p.joinedAt < min ? p.joinedAt : min), people[0]?.joinedAt ?? plan.founded);
  const b = new AuditBuilder(ctx, people, new Set(), founded);
  const superId = await superAdminId(ctx);

  const existingInvoices = await prisma.invoice.count({ where: { tenantId, kind: 'PLATFORM' } });
  if (existingInvoices === 0) {
    const itemIds = await writeSubscriptionHistory(ctx, plan, adminUserId, superId);
    await writeRequestsAndOverrides(ctx, plan, people, superId);
    result.invoices = await writeInvoicesAndPayments(ctx, plan, adminUserId, superId, b);

    // Traces des extensions et dérogations (au nom de la plateforme).
    for (const [ext, itemId] of itemIds) {
      b.emit(
        new Date(ext.startsAt.getTime() - 11 * DAY),
        AuditActionKey.SUBSCRIPTION_EXTENSION_REQUESTED,
        b.actor(['TENANT_ADMIN', 'TENANT_MANAGER'], ext.startsAt),
        'SubscriptionExtensionRequest',
        itemId,
        {
          payload: { catalogCode: ext.story.code, quantity: ext.story.quantity }
        }
      );
      b.emit(
        new Date(ext.startsAt.getTime() - 1 * DAY),
        AuditActionKey.SUBSCRIPTION_EXTENSION_REQUEST_HANDLED,
        b.people[0],
        'SubscriptionExtensionRequest',
        itemId,
        {
          payload: { status: 'HANDLED' },
          superAdminId: superId
        }
      );
      b.emit(ext.startsAt, AuditActionKey.SUBSCRIPTION_ITEM_ADDED, b.people[0], 'SubscriptionItem', itemId, {
        payload: { code: ext.story.code, quantity: ext.story.quantity, unitMonthlyPrice: ext.unitPrice },
        superAdminId: superId
      });
      if (ext.endsAt && ext.endsAt.getTime() <= ctx.end.getTime()) {
        b.emit(ext.endsAt, AuditActionKey.SUBSCRIPTION_ITEM_REMOVED, null, 'SubscriptionItem', itemId, {
          payload: { code: ext.story.code, reason: ext.story.endReason },
          system: true
        });
      }
    }
    for (const o of plan.overrides) {
      b.emit(
        o.startsAt,
        AuditActionKey.CAPACITY_OVERRIDE_GRANTED,
        b.people[0],
        'CapacityOverride',
        `${tenantId}:${o.key}:${o.startsAt.toISOString()}`,
        {
          payload: { capacityKey: o.key, delta: o.delta, reason: o.reason },
          superAdminId: superId
        }
      );
      if (o.revokedAt) {
        b.emit(
          o.revokedAt,
          AuditActionKey.CAPACITY_OVERRIDE_REVOKED,
          b.people[0],
          'CapacityOverride',
          `${tenantId}:${o.key}:${o.startsAt.toISOString()}`,
          {
            payload: { capacityKey: o.key },
            superAdminId: superId
          }
        );
      }
    }
    b.emit(
      plan.founded,
      AuditActionKey.SUBSCRIPTION_PROVISIONED,
      b.people[0],
      'Subscription',
      tenantId,
      {
        payload: { pack, billingCycle: 'MONTHLY' },
        superAdminId: superId
      },
      false
    );
  } else {
    log(`facturation : ${existingInvoices} facture(s) de plateforme déjà présente(s), non régénérées.`);
  }

  const usage = await writeUsage(ctx, plan);
  result.snapshots = usage.snapshots;
  result.alerts = usage.alerts;
  result.exports = await writeDataExports(ctx, b, superId);
  await writeAuditRows(ctx, b.rows);
  log(
    `facturation : ${result.invoices} facture(s), ${result.snapshots} relevé(s) d'usage, ${result.alerts} alerte(s), ${result.exports} export(s), ${b.rows.length} événement(s) d'audit.`
  );
  return result;
}
