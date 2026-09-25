/**
 * Reprise : abonnements BASIC/PRO/ELITE + modules -> abonnements par packs.
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md (section « Reprise »).
 *
 *   npm run db:migrate:subscriptions-to-packs -- --dry-run   # rapport, aucune ecriture
 *   npm run db:migrate:subscriptions-to-packs                # applique
 *   ... -- --tenant=<id>                                      # une seule agence
 *
 * Pour chaque agence, IDEMPOTENT (rejouable sans doublon) :
 * 1. Packs deduits des modules actifs : {AGENCY}->AGENCE, {SYNDIC}->SYNDIC,
 *    {PROMOTER}->PROMOTEUR, deux -> les deux packs, trois -> INTEGRE, aucun ->
 *    AGENCE marque « a revoir ». Rien n'est cree si l'agence a deja des
 *    elements d'abonnement.
 * 2. Abonnement : cycle, periode et statut CONSERVES ; s'il n'existe pas, un
 *    essai de 30 jours est cree (marque « a revoir »).
 * 3. TenantModule resynchronises depuis les packs (source PACK).
 * 4. Registre des lots (LotActivation) aligne sur D1, D2, D14.
 * 5. Consommation > capacite : derogation « Reprise » (D13) de 3 mois, arrondie
 *    a la dizaine superieure pour les lots, a l'unite pour coproprietes et
 *    chantiers. Pas de seconde derogation si une « Reprise » est deja active.
 *
 * Refuse de tourner en production sans `--allow-production`.
 */

import { Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../src/utils/database';
import {
  CAPACITY_KEYS,
  CapacityKeyCode,
  REPRISE_OVERRIDE_MONTHS,
  TRIAL_DAYS,
  computeCapacityLimits,
  isOverrideActive,
  packsForModules
} from '../src/lib/subscription';
import { loadCatalogByCodes, planInitialItems, syncTenantModulesTx } from '../src/services/subscription-v2-service';
import {
  computeQualifyingUnits,
  countActiveCopros,
  countActiveSites,
  reconcileLotActivations
} from '../src/services/lot-registry-service';

const REPRISE_REASON_PREFIX = 'Reprise';

interface TenantReport {
  tenant: string;
  tenantId: string;
  status: string;
  modulesBefore: string[];
  packs: string[];
  toReview: boolean;
  subscription: 'conservé' | 'créé (essai 30 j)' | 'déjà migré';
  lots: { total: number; logements: number; copro: number; programme: number; added: number; removed: number };
  capacities: Record<CapacityKeyCode, { limit: number; used: number }>;
  overrides: string[];
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function ceilToTen(n: number): number {
  return Math.ceil(n / 10) * 10;
}

async function migrateTenant(tenant: { id: string; name: string; status: string }, dryRun: boolean): Promise<TenantReport> {
  const now = new Date();
  const [moduleRows, subscription, existingItems, overridesBefore] = await Promise.all([
    prisma.tenantModule.findMany({ where: { tenantId: tenant.id } }),
    prisma.subscription.findUnique({ where: { tenantId: tenant.id } }),
    prisma.subscriptionItem.findMany({
      where: { tenantId: tenant.id, status: { not: 'ENDED' } },
      include: { catalogItem: { include: { capacities: true } } }
    }),
    prisma.capacityOverride.findMany({ where: { tenantId: tenant.id, revokedAt: null } })
  ]);

  const modulesBefore = moduleRows.filter(m => m.enabled).map(m => m.moduleKey);
  const { packs, toReview } = packsForModules(modulesBefore);
  const alreadyMigrated = existingItems.length > 0;

  // --- 1-2. Elements et abonnement
  const catalog = await loadCatalogByCodes(prisma, packs);
  const planned = planInitialItems(
    packs.map(code => ({ code, quantity: 1 })),
    catalog
  );
  const itemsForLimits = alreadyMigrated
    ? existingItems.map(i => ({
        kind: i.catalogItem.kind,
        quantity: i.quantity,
        capacities: Object.fromEntries(i.catalogItem.capacities.map(c => [c.capacityKey, c.amount]))
      }))
    : planned.map(p => ({ kind: p.catalog.kind, quantity: p.quantity, capacities: p.catalog.capacities }));
  const packsHeld = alreadyMigrated
    ? [...new Set(existingItems.filter(i => i.catalogItem.kind === 'PACK').map(i => i.catalogItem.code))]
    : packs;

  let subscriptionOutcome: TenantReport['subscription'] = alreadyMigrated
    ? 'déjà migré'
    : subscription
      ? 'conservé'
      : 'créé (essai 30 j)';

  if (!dryRun && !alreadyMigrated) {
    await prisma.$transaction(async tx => {
      const marker = {
        at: now.toISOString(),
        fromModules: modulesBefore,
        fromPlanKey: subscription?.planKey ?? null,
        packs,
        toReview
      };
      let sub = subscription;
      if (!sub) {
        const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
        sub = await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planKey: null,
            billingCycle: 'MONTHLY',
            status: SubscriptionStatus.TRIALING,
            startAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: trialEnd,
            trialEndsAt: trialEnd,
            nextBillingAt: trialEnd,
            metadata: { packMigration: marker } as Prisma.InputJsonValue
          }
        });
      } else {
        const metadata = (sub.metadata && typeof sub.metadata === 'object' && !Array.isArray(sub.metadata)
          ? sub.metadata
          : {}) as Record<string, unknown>;
        sub = await tx.subscription.update({
          where: { tenantId: tenant.id },
          data: {
            metadata: { ...metadata, packMigration: marker } as Prisma.InputJsonValue,
            ...(sub.status === SubscriptionStatus.TRIALING && !sub.trialEndsAt ? { trialEndsAt: sub.currentPeriodEnd } : {}),
            ...(!sub.nextBillingAt ? { nextBillingAt: sub.currentPeriodEnd } : {})
          }
        });
      }
      await tx.subscriptionItem.createMany({
        data: planned.map(p => ({
          subscriptionId: sub!.id,
          tenantId: tenant.id,
          catalogItemId: p.catalog.id,
          quantity: p.quantity,
          unitMonthlyPrice: p.unitMonthlyPrice,
          unitSetupPrice: p.unitSetupPrice,
          status: 'ACTIVE' as const,
          startsAt: sub!.startAt,
          note: toReview
            ? `Reprise du ${now.toISOString().slice(0, 10)} — aucun module actif : pack Agence attribué, à revoir.`
            : `Reprise du ${now.toISOString().slice(0, 10)} depuis les modules ${modulesBefore.join(', ')}.`
        }))
      });
      // --- 3. Modules
      await syncTenantModulesTx(tx, tenant.id, { now });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          tenantId: tenant.id,
          actionKey: 'SUBSCRIPTION_MIGRATED_TO_PACKS',
          entityType: 'Subscription',
          entityId: sub.id,
          payload: { ...marker, subscriptionCreated: !subscription } as Prisma.InputJsonValue
        }
      });
    });
  } else if (dryRun && !alreadyMigrated && !subscription) {
    subscriptionOutcome = 'créé (essai 30 j)';
  }

  // --- 4. Registre des lots
  const reconcile = await reconcileLotActivations(tenant.id, { dryRun });

  // --- 5. Capacites et derogation « Reprise »
  const usedLots = dryRun ? (await computeQualifyingUnits(prisma, tenant.id)).length : reconcile.qualifying;
  const usage: Record<CapacityKeyCode, number> = {
    LOTS: usedLots,
    COPROPRIETES: await countActiveCopros(prisma, tenant.id),
    CHANTIERS: await countActiveSites(prisma, tenant.id)
  };
  const limits = computeCapacityLimits(itemsForLimits, overridesBefore, now);
  const overrides: string[] = [];
  const capacities = {} as TenantReport['capacities'];

  for (const key of CAPACITY_KEYS) {
    capacities[key] = { limit: limits[key].limit, used: usage[key] };
    const over = usage[key] - limits[key].limit;
    if (over <= 0) continue;
    const existingReprise = overridesBefore.find(
      o => o.capacityKey === key && o.reason.startsWith(REPRISE_REASON_PREFIX) && isOverrideActive(o, now)
    );
    if (existingReprise) {
      overrides.push(`${key} +${existingReprise.delta} (déjà accordée, expire le ${existingReprise.expiresAt?.toISOString().slice(0, 10)})`);
      continue;
    }
    const delta = key === 'LOTS' ? ceilToTen(over) : over;
    const expiresAt = addMonths(now, REPRISE_OVERRIDE_MONTHS);
    overrides.push(`${key} +${delta} jusqu'au ${expiresAt.toISOString().slice(0, 10)}`);
    capacities[key].limit += delta;
    if (!dryRun) {
      const reason =
        `${REPRISE_REASON_PREFIX} : ${usage[key]} utilisé(s) pour une capacité de ${limits[key].limit} ` +
        `au ${now.toISOString().slice(0, 10)} (dérogation de ${REPRISE_OVERRIDE_MONTHS} mois, D13).`;
      const created = await prisma.capacityOverride.create({
        data: { tenantId: tenant.id, capacityKey: key, delta, reason, startsAt: now, expiresAt, grantedByUserId: null }
      });
      await prisma.auditLog.create({
        data: {
          actorUserId: null,
          tenantId: tenant.id,
          actionKey: 'CAPACITY_OVERRIDE_GRANTED',
          entityType: 'CapacityOverride',
          entityId: created.id,
          payload: { capacityKey: key, delta, reason, expiresAt: expiresAt.toISOString(), source: 'reprise' }
        }
      });
    }
  }

  return {
    tenant: tenant.name,
    tenantId: tenant.id,
    status: tenant.status,
    modulesBefore,
    packs: packsHeld,
    toReview: !alreadyMigrated && toReview,
    subscription: subscriptionOutcome,
    lots: {
      total: reconcile.qualifying,
      logements: reconcile.byKind.RENTAL_UNIT,
      copro: reconcile.byKind.COPRO_LOT,
      programme: reconcile.byKind.PROGRAM_LOT,
      added: reconcile.added.length,
      removed: reconcile.removed.length
    },
    capacities,
    overrides
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const tenantArg = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1];
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
    throw new Error('Refus : NODE_ENV=production. Relancez avec --allow-production si c’est voulu.');
  }

  const tenants = await prisma.tenant.findMany({
    where: tenantArg ? { id: tenantArg } : {},
    select: { id: true, name: true, status: true },
    orderBy: { name: 'asc' }
  });

  console.log(`Reprise des abonnements vers les packs${dryRun ? ' (SIMULATION, aucune écriture)' : ''} — ${tenants.length} agence(s)\n`);
  const reports: TenantReport[] = [];
  for (const tenant of tenants) {
    reports.push(await migrateTenant(tenant, dryRun));
  }

  for (const r of reports) {
    console.log(`■ ${r.tenant} (${r.tenantId}, ${r.status})`);
    console.log(`    modules avant : ${r.modulesBefore.join(', ') || 'aucun'}`);
    console.log(`    packs         : ${r.packs.join(' + ')}${r.toReview ? '  ⚠ à revoir' : ''}`);
    console.log(`    abonnement    : ${r.subscription}`);
    console.log(
      `    lots comptés  : ${r.lots.total} (logements ${r.lots.logements}, copropriété ${r.lots.copro}, programme ${r.lots.programme})` +
        ` — registre +${r.lots.added} / -${r.lots.removed}`
    );
    console.log(
      `    capacités     : ${CAPACITY_KEYS.map(k => `${k} ${r.capacities[k].used}/${r.capacities[k].limit}`).join(' · ')}`
    );
    console.log(`    dérogations   : ${r.overrides.join(' ; ') || 'aucune'}\n`);
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
