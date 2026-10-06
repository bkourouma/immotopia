/**
 * SYNDIC : données fausses ou maigres relevées par la recette (quotes-parts de lots, fiches « bâtiment »,
 * statuts d'appels, programmations, contacts CRM, portail copropriétaire).
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 *
 * Les causes sont corrigées à la source (`syndic-plan.ts`, `syndic-extras-*.ts`) ; ce fichier
 * répare en plus les lignes déjà écrites sur une base peuplée (staging) :
 *   1. quotes-parts : 100 % par lot (indivisions pour quelques lots) ;
 *   2. fiches « bâtiment » (`Property` COPRO-…) : conservées pour le pack Syndic (maintenance), retirées de
 *      l'Opérateur intégré qui a déjà son patrimoine ;
 *   3. statut STOCKÉ des appels = statut déduit des affectations (PENDING/PARTIAL/PAID) ;
 *   4. programmations d'appels : une active par copropriété, exécutions et prochaine échéance ;
 *   5. contacts CRM variés (`syndic-fixes-crm.ts`) ;
 *   6. comptes de connexion du portail copropriétaire (`syndic-fixes-portal.ts`).
 */
import { createHash, randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import {
  CoproLedger,
  TX_OPTIONS,
  addDays,
  between,
  isSyndicPack,
  loadSyndicEnv,
  num,
  pickOne,
  roundTo,
  shuffle,
  type SyndicEnv
} from './syndic-extras-common';
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, PROFESSIONS } from './syndic-data';
import { addPayment, loadFacts } from './syndic-extras-finance';
import { seedPropertyImages } from './property-images';
import { seedSyndicCrm } from './syndic-fixes-crm';
import { seedCoOwnerPortalAccounts } from './syndic-fixes-portal';

export async function seedSyndicFixes(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const env = await loadSyndicEnv(ctx);
  if (!env) return;
  const started = Date.now();
  const step = async (name: string, run: () => Promise<void>): Promise<void> => {
    const t0 = Date.now();
    await run();
    ctx.log(`syndic-fixes ${name} : ${Math.round((Date.now() - t0) / 100) / 10} s`);
  };

  await step('quotes-parts des lots', () => fixOwnerShares(env));
  await step('fiches bâtiment', async () => {
    if (await isSyndicPack(env))
      await seedPropertyImages(ctx); // photos des immeubles du pack Syndic
    else await removeBuildingProperties(env);
  });
  await step('statuts des appels', () => fixChargeCallStatuses(env));
  await step('programmations', () => fixChargeSchedules(env));
  await step('contacts CRM', () => seedSyndicCrm(env));
  await step('portail copropriétaire', () => seedCoOwnerPortalAccounts(env));
  ctx.log(`syndic-fixes terminé en ${Math.round((Date.now() - started) / 1000)} s`);
}

const syndicateIds = (env: SyndicEnv): string[] => env.syndicates.map(s => s.id);

// ───────────────────────────────────────────────────────── 1. quotes-parts des lots

/** Répartitions d'indivision (parts de PROPRIÉTÉ du lot, total 100 %). Le premier reste le propriétaire principal. */
const INDIVISIONS: number[][] = [
  [60, 40],
  [50, 50],
  [70, 30],
  [55, 45],
  [50, 30, 20],
  [60, 40]
];

/**
 * `LotOwnerProfile.ownershipPercentage` est la part de PROPRIÉTÉ du lot (100 % pour un propriétaire
 * unique, le total des profils actuels d'un lot vaut 100). Le générateur d'origine y écrivait la part
 * de tantièmes du lot dans l'immeuble (0,1 à 20,6) : tous les lots sortaient « incomplets ».
 */
async function fixOwnerShares(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId, rng, end } = env;
  const ids = syndicateIds(env);
  // Réparation : seules les lignes qui portent exactement l'ancienne formule (tantièmes / 10) sont touchées.
  const repaired = await prisma.$executeRaw`
    UPDATE lot_owner_profiles p
    SET ownership_percentage = 100
    FROM syndicate_lots l
    WHERE l.id = p.lot_id
      AND l.syndicate_id = ANY(${ids}::uuid[])
      AND p.ownership_percentage <> 100
      AND p.ownership_percentage = ROUND(l.general_shares * 10)::numeric / 100`;
  if (repaired > 0) env.log(`syndic-fixes quotes-parts : ${repaired} profil(s) de propriétaire remis à 100 %`);

  for (const s of env.syndicates) {
    const profiles = await prisma.lotOwnerProfile.findMany({
      where: { lot: { syndicateId: s.id }, isActive: true, ownedUntil: null },
      select: {
        id: true,
        lotId: true,
        contactId: true,
        ownershipPercentage: true,
        ownedSince: true,
        lot: { select: { lotNumber: true, lotType: true } }
      }
    });
    const byLot = new Map<string, typeof profiles>();
    for (const p of profiles) byLot.set(p.lotId, [...(byLot.get(p.lotId) ?? []), p]);
    const shared = [...byLot.values()].filter(group => group.length > 1).length;
    const candidates = [...byLot.values()]
      .filter(g => g.length === 1 && num(g[0].ownershipPercentage) === 100 && g[0].lot.lotType === 'APARTMENT')
      .sort((a, b) =>
        createHash('md5')
          .update(a[0].lotId)
          .digest('hex')
          .localeCompare(createHash('md5').update(b[0].lotId).digest('hex'))
      );
    const wanted = Math.max(2, Math.round(byLot.size * 0.07));
    const toSplit = candidates.slice(0, Math.max(0, wanted - shared));
    let made = 0;
    for (const [i, group] of toSplit.entries()) {
      const main = group[0];
      const split = INDIVISIONS[(i + shared) % INDIVISIONS.length];
      const female = rng() < 0.5;
      const first = pickOne(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
      const last = pickOne(rng, LAST_NAMES);
      const since = main.ownedSince;
      await prisma.$transaction(async tx => {
        await tx.lotOwnerProfile.update({ where: { id: main.id }, data: { ownershipPercentage: split[0] } });
        for (const [k, part] of split.slice(1).entries()) {
          const f = k === 0 ? female : rng() < 0.5;
          const fn = k === 0 ? first : pickOne(rng, f ? FIRST_NAMES_F : FIRST_NAMES_M);
          const ln = k === 0 ? last : pickOne(rng, LAST_NAMES);
          const contactId = randomUUID();
          const contactSince = addDays(since, 5 + k * 3);
          await tx.crmContact.create({
            data: {
              id: contactId,
              tenantId,
              contactType: 'PERSON',
              civility: f ? 'MRS' : 'MR',
              firstName: fn,
              lastName: ln,
              email: `${slugOf(fn)}.${slugOf(ln)}.i${s.id.slice(0, 4)}${main.lot.lotNumber.replace(/\W/g, '')}${k}@copropriete.test`,
              city: 'Abidjan',
              country: "Côte d'Ivoire",
              nationality: 'Ivoirienne',
              profession: pickOne(rng, PROFESSIONS),
              preferredLanguage: 'fr',
              preferredContactChannel: pickOne(rng, ['EMAIL', 'SMS', 'WHATSAPP'] as const),
              status: 'ACTIVE_CLIENT',
              source: 'Syndic de copropriété',
              internalNotes: '[seed:pack-history:syndic-extras]',
              createdAt: contactSince
            }
          });
          await tx.crmContactRole.create({
            data: {
              tenantId,
              contactId,
              role: 'COOWNER',
              active: true,
              startedAt: contactSince,
              metadata: { source: 'pack-history:syndic-fixes', indivision: true }
            }
          });
          await tx.lotOwnerProfile.create({
            data: {
              lotId: main.lotId,
              contactId,
              ownershipPercentage: part,
              ownedSince: contactSince,
              portalAccessEnabled: false,
              isActive: true,
              createdAt: contactSince,
              notificationPrefs: {
                email: true,
                sms: false,
                whatsapp: false,
                chargeCalls: true,
                meetings: true,
                incidents: false
              }
            }
          });
        }
      }, TX_OPTIONS);
      made++;
    }
    if (made > 0) env.log(`syndic-fixes quotes-parts « ${s.name} » : ${made} lot(s) en indivision`);
  }
  void end;
}

const slugOf = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');

// ───────────────────────────────────────────────────── 2. fiches « bâtiment » à retirer

/**
 * Le seed d'origine créait une `Property` IMMEUBLE (COPRO-0001…) par copropriété : elles polluaient la
 * liste des biens, le tableau de bord, la capacité ACTIFS et le patrimoine de l'Opérateur intégré.
 * Retire celles des bases déjà peuplées : référence `COPRO-%`, `typeSpecificData.copropriete = true`,
 * sans bail, mandat ni vente. `Syndicate.propertyId` est détaché d'abord.
 */
async function removeBuildingProperties(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId } = env;
  const props = await prisma.property.findMany({
    where: {
      tenantId,
      internalReference: { startsWith: 'COPRO-' },
      typeSpecificData: { path: ['copropriete'], equals: true },
      rentalLeases: { none: {} },
      mandates: { none: {} },
      saleMandates: { none: {} },
      saleAgreements: { none: {} }
    },
    select: { id: true, internalReference: true }
  });
  if (props.length === 0) return;
  const ids = props.map(p => p.id);
  await prisma.$transaction(async tx => {
    await tx.syndicate.updateMany({ where: { tenantId, propertyId: { in: ids } }, data: { propertyId: null } });
    await tx.syndicateLot.updateMany({ where: { propertyId: { in: ids } }, data: { propertyId: null } });
    // tickets de maintenance créés sur la fiche bâtiment (property_id obligatoire) : retirés avec elle
    const tickets = await tx.maintenanceTicket.findMany({
      where: { tenant_id: tenantId, property_id: { in: ids } },
      select: { id: true }
    });
    const ticketIds = tickets.map(t => t.id);
    if (ticketIds.length > 0) {
      await tx.syndicateIncident.updateMany({
        where: { maintenanceWorkOrderId: { in: ticketIds } },
        data: { maintenanceWorkOrderId: null }
      });
      await tx.maintenanceTicket.deleteMany({ where: { tenant_id: tenantId, id: { in: ticketIds } } });
    }
    await tx.lotActivation.deleteMany({ where: { tenantId, propertyId: { in: ids } } });
    await tx.property.deleteMany({ where: { tenantId, id: { in: ids } } });
  }, TX_OPTIONS);
  env.log(
    `syndic-fixes bâtiments : ${props.length} fiche(s) bâtiment retirée(s) des biens (${props.map(p => p.internalReference).join(', ')})`
  );
  for (const s of env.syndicates) if (s.propertyId && ids.includes(s.propertyId)) s.propertyId = null;
}

// ─────────────────────────────────────────────────── 3. statuts des appels de charges

/**
 * Règle des services de charges (`statusFromCents`, `deriveChargeCallStatus`) : le statut STOCKÉ vient
 * des affectations de paiements (PENDING / PARTIAL / PAID) ; « en retard » n'est jamais stocké, il se
 * dérive à la lecture (non soldé + échéance passée). Aligne les lignes existantes, puis fait apparaître
 * des règlements partiels sur le trimestre en cours (échéance non dépassée : seul cas où la liste
 * affiche encore « Partiel »).
 */
async function fixChargeCallStatuses(env: SyndicEnv): Promise<void> {
  const { prisma } = env;
  const ids = syndicateIds(env);
  const fixed = await prisma.$executeRaw`
    UPDATE charge_calls c
    SET status = x.target::"ChargeCallStatus"
    FROM (
      SELECT cc.id,
             CASE
               WHEN COALESCE(SUM(a.amount), 0) <= 0 THEN 'PENDING'
               WHEN COALESCE(SUM(a.amount), 0) < cc.amount THEN 'PARTIAL'
               ELSE 'PAID'
             END AS target
      FROM charge_calls cc
      LEFT JOIN charge_payment_allocations a ON a.charge_call_id = cc.id
      WHERE cc.syndicate_id = ANY(${ids}::uuid[]) AND cc.amount > 0
      GROUP BY cc.id, cc.amount
    ) x
    WHERE x.id = c.id AND c.status::text <> x.target`;
  if (fixed > 0) env.log(`syndic-fixes statuts : ${fixed} appel(s) alignés sur leurs affectations`);

  for (const s of env.syndicates) {
    const partialOpen = await prisma.chargeCall.count({
      where: { syndicateId: s.id, status: 'PARTIAL', dueDate: { gte: env.end } }
    });
    if (partialOpen > 0) continue;
    const open = await prisma.chargeCall.findMany({
      where: {
        syndicateId: s.id,
        status: 'PENDING',
        dueDate: { gte: env.end },
        amount: { gt: 0 },
        allocations: { none: {} },
        batch: { batchType: 'REGULAR' }
      },
      select: {
        id: true,
        lotId: true,
        period: true,
        amount: true,
        fundId: true,
        createdAt: true,
        batch: { select: { budgetId: true, createdAt: true } }
      }
    });
    if (open.length === 0) continue;
    const facts = await loadFacts(env, s);
    const led = await CoproLedger.load(env, s.id);
    const chosen = shuffle(env.rng, open).slice(0, Math.max(3, Math.round(open.length * 0.22)));
    await prisma.$transaction(async tx => {
      for (const c of chosen) {
        const lot = facts.lotById.get(c.lotId);
        if (!lot) continue;
        const issue = c.batch?.createdAt ?? c.createdAt;
        const span = Math.max(1, Math.floor((env.end.getTime() - issue.getTime()) / 86_400_000) - 1);
        const date = new Date(
          issue.getTime() + between(env.rng, 1, span) * 86_400_000 + between(env.rng, 9, 16) * 3_600_000
        );
        const amount = roundTo(num(c.amount) * (0.3 + env.rng() * 0.4), 100);
        if (amount <= 0 || amount >= num(c.amount) || date > env.end) continue;
        await addPayment(env, facts, led, tx, {
          lot,
          allocations: [
            {
              call: {
                id: c.id,
                period: c.period,
                amount: num(c.amount),
                fundId: c.fundId,
                budgetId: c.batch?.budgetId ?? null
              },
              amount
            }
          ],
          date,
          method: lot.method
        });
        await tx.chargeCall.update({ where: { id: c.id }, data: { status: 'PARTIAL' } });
      }
      await led.finalize(tx);
    }, TX_OPTIONS);
    env.log(`syndic-fixes statuts « ${s.name} » : ${chosen.length} règlement(s) partiel(s) sur le trimestre en cours`);
  }
}

// ───────────────────────────────────────────────────────────── 4. programmations d'appels

/**
 * Au moins une programmation ACTIVE par copropriété, avec ses exécutions passées (SUCCESS, SKIPPED,
 * MANUAL…) et une prochaine échéance. Les programmations de projet (inactives) sont conservées.
 */
async function fixChargeSchedules(env: SyndicEnv): Promise<void> {
  const { prisma, tenantId } = env;
  for (const s of env.syndicates) {
    const schedules = await prisma.syndicChargeSchedule.findMany({
      where: { tenantId, syndicateId: s.id },
      select: { id: true, active: true, nextRunAt: true, lastRunAt: true, _count: { select: { runs: true } } }
    });
    // Programmation de projet (inactive) : une tentative d'exécution manuelle refusée, visible dans son journal
    // (couvre aussi le statut FAILED).
    const drafts = schedules.filter(x => !x.active && x._count.runs === 0);
    for (const draft of drafts) {
      const at = addDays(env.end, -9);
      await prisma.syndicChargeScheduleRun.create({
        data: {
          tenantId,
          scheduleId: draft.id,
          periodStart: new Date(Date.UTC(at.getFullYear(), at.getMonth(), 1)),
          periodEnd: new Date(Date.UTC(at.getFullYear(), at.getMonth() + 1, 0)),
          periodLabel: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(at),
          status: 'FAILED',
          trigger: 'MANUAL',
          callsCreated: 0,
          callsCovered: 0,
          notificationsSent: 0,
          notificationsSkipped: 0,
          error: 'Exécution refusée : la programmation est en projet, elle n’a pas été activée.',
          createdAt: at,
          finishedAt: new Date(at.getTime() + 2_000)
        }
      });
    }
    const live = schedules.filter(x => x.active && x._count.runs > 0 && x.nextRunAt);
    if (live.length > 0) continue;
    // Reconstitue depuis les lots d'appels réels : même mécanique que le bloc F5 des compléments.
    const { describePeriod, firstPeriod, nextPeriodStart } =
      await import('../../../src/lib/syndics/charge-schedule-periods');
    const batches = await prisma.chargeCallBatch.findMany({
      where: { syndicateId: s.id, batchType: 'REGULAR', periodStart: { not: null } },
      orderBy: { periodStart: 'asc' },
      select: { id: true, periodStart: true, createdAt: true }
    });
    if (batches.length < 3) continue;
    const startDate = new Date(Date.UTC(batches[0].periodStart!.getUTCFullYear(), 0, 1));
    const timing = { frequency: 'QUARTERLY' as const, issueDay: 2, dueOffsetDays: 13, startDate };
    const byStart = new Map(batches.map(b => [b.periodStart!.toISOString().slice(0, 10), b]));
    const callCounts = await prisma.chargeCall.groupBy({
      by: ['batchId'],
      where: { syndicateId: s.id, amount: { gt: 0 } },
      _count: { _all: true }
    });
    const countByBatch = new Map(callCounts.map(c => [c.batchId, c._count._all]));
    const scheduleId = randomUUID();
    const runs: Prisma.SyndicChargeScheduleRunCreateManyInput[] = [];
    let period = firstPeriod(timing);
    let lastRunAt: Date | null = null;
    let lastPeriodStart: Date | null = null;
    let index = 0;
    while (period && period.issueDate <= env.end) {
      const batch = byStart.get(period.periodStart.toISOString().slice(0, 10));
      if (batch) {
        const calls = countByBatch.get(batch.id) ?? 0;
        const skipped = index === 0;
        const createdAt = new Date(
          Date.UTC(
            batch.createdAt.getFullYear(),
            batch.createdAt.getMonth(),
            batch.createdAt.getDate(),
            2,
            between(env.rng, 0, 20)
          )
        );
        const noneSent = skipped ? 0 : env.rng() < 0.12 ? 1 : 0;
        runs.push({
          tenantId,
          scheduleId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          periodLabel: period.label,
          status: skipped ? 'SKIPPED' : 'SUCCESS',
          trigger: index === 1 || index === 5 ? 'MANUAL' : 'CRON',
          batchId: batch.id,
          callsCreated: skipped ? 0 : calls,
          callsCovered: 0,
          notificationsSent: skipped ? 0 : calls - noneSent,
          notificationsSkipped: noneSent,
          notes: skipped
            ? 'Période déjà appelée manuellement : aucun doublon créé.'
            : noneSent
              ? 'Un avis n’est pas parti : le propriétaire du lot n’est plus un copropriétaire actuel.'
              : null,
          createdAt,
          finishedAt: new Date(createdAt.getTime() + between(env.rng, 15, 90) * 1000)
        });
        if (!skipped) {
          lastRunAt = createdAt;
          lastPeriodStart = period.periodStart;
        }
        index++;
      }
      period = describePeriod(timing, nextPeriodStart(period.periodStart, timing.frequency));
    }
    if (runs.length === 0 || !lastPeriodStart) continue;
    const next = describePeriod(timing, nextPeriodStart(lastPeriodStart, timing.frequency));
    await prisma.$transaction(async tx => {
      const data = {
        label: 'Appels de fonds trimestriels',
        frequency: 'QUARTERLY' as const,
        issueDay: 2,
        dueOffsetDays: 13,
        amountSource: 'BUDGET' as const,
        budgetId: null,
        currency: 'XOF',
        startDate,
        active: true,
        nextRunAt: next.issueDate,
        lastRunAt
      };
      await tx.syndicChargeSchedule.create({
        data: {
          id: scheduleId,
          tenantId,
          syndicateId: s.id,
          ...data,
          createdById: env.adminId,
          createdAt: addDays(startDate, -12)
        }
      });
      await tx.syndicChargeScheduleRun.createMany({ data: runs, skipDuplicates: true });
    }, TX_OPTIONS);
    env.log(
      `syndic-fixes programmations « ${s.name} » : 1 active, ${runs.length} exécution(s), prochaine ${next.issueDate.toISOString().slice(0, 10)}`
    );
  }
}
