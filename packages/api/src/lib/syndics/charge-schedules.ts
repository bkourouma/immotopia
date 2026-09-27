import type { SyndicChargeSchedule, SyndicChargeScheduleRun } from '@prisma/client';
import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/error-middleware';
import { assertSyndicateOfTenant } from './charge-allocation';
import { formatIsoDay } from './period';
import {
  firstPeriodIssuedOnOrAfter,
  followingPeriod,
  periodContaining,
  type SchedulePeriod
} from './charge-schedule-periods';
import {
  advanceSchedule,
  computePeriodPlan,
  executeSchedulePeriod,
  timingOf,
  type RunOutcome
} from './charge-schedule-runner';
import {
  scheduleConsistencyIssues,
  type CreateChargeScheduleInput,
  type UpdateChargeScheduleInput
} from './charge-schedule-schemas';

/**
 * Programmations des appels de charges d'une copropriété (lot S4, besoin 6) :
 * création, modification, pause, reprise, suppression, exécution immédiate,
 * historique et aperçu. L'exécution elle-même vit dans
 * `charge-schedule-runner.ts` (partagée avec la tâche quotidienne).
 *
 * `nextRunAt` (date d'émission de la prochaine période à traiter) est
 * calculé ainsi : à la création, à la reprise et à chaque changement de
 * calendrier, c'est la première période dont la date d'émission tombe
 * AUJOURD'HUI ou plus tard, et qui n'a pas déjà été émise. Une période
 * passée n'est donc jamais émise d'office ; « Exécuter » émet la période en
 * cours à la demande.
 */

type ScheduleWithBudget = SyndicChargeSchedule & {
  budget?: { id: string; label: string; fiscalYear: number; status: string } | null;
};

// ---------------------------------------------------------------- vues

function periodDates(period: SchedulePeriod) {
  return {
    label: period.label,
    periodStart: formatIsoDay(period.periodStart),
    periodEnd: formatIsoDay(period.periodEnd),
    issueDate: formatIsoDay(period.issueDate),
    dueDate: formatIsoDay(period.dueDate)
  };
}

export function toRunView(run: SyndicChargeScheduleRun) {
  return {
    id: run.id,
    scheduleId: run.scheduleId,
    periodStart: formatIsoDay(run.periodStart),
    periodEnd: formatIsoDay(run.periodEnd),
    periodLabel: run.periodLabel,
    status: run.status,
    trigger: run.trigger,
    batchId: run.batchId,
    callsCreated: run.callsCreated,
    callsCovered: run.callsCovered,
    notificationsSent: run.notificationsSent,
    error: run.error,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt
  };
}

function toScheduleView(
  schedule: ScheduleWithBudget,
  extra: { lastRun: SyndicChargeScheduleRun | null; hasIssuedPeriods: boolean }
) {
  const nextPeriod = schedule.nextRunAt ? periodContaining(timingOf(schedule), schedule.nextRunAt) : null;
  return {
    id: schedule.id,
    syndicateId: schedule.syndicateId,
    label: schedule.label,
    frequency: schedule.frequency,
    issueDay: schedule.issueDay,
    dueOffsetDays: schedule.dueOffsetDays,
    amountSource: schedule.amountSource,
    budgetId: schedule.budgetId,
    budget: schedule.budget
      ? {
          id: schedule.budget.id,
          label: schedule.budget.label,
          fiscalYear: schedule.budget.fiscalYear,
          status: schedule.budget.status
        }
      : null,
    fixedAmount: schedule.fixedAmount === null ? null : Number(schedule.fixedAmount),
    currency: schedule.currency,
    startDate: formatIsoDay(schedule.startDate),
    endDate: formatIsoDay(schedule.endDate),
    active: schedule.active,
    nextRunAt: schedule.nextRunAt,
    nextPeriod: nextPeriod ? periodDates(nextPeriod) : null,
    lastRunAt: schedule.lastRunAt,
    lastRun: extra.lastRun ? toRunView(extra.lastRun) : null,
    hasIssuedPeriods: extra.hasIssuedPeriods,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

export type ChargeScheduleView = ReturnType<typeof toScheduleView>;

const BUDGET_SELECT = { select: { id: true, label: true, fiscalYear: true, status: true } } as const;

async function viewsOf(tenantId: string, schedules: ScheduleWithBudget[]): Promise<ChargeScheduleView[]> {
  const ids = schedules.map(schedule => schedule.id);
  if (ids.length === 0) return [];
  const runs = await prisma.syndicChargeScheduleRun.findMany({
    where: { tenantId, scheduleId: { in: ids } },
    orderBy: [{ createdAt: 'desc' }],
    take: 1000
  });
  return schedules.map(schedule => {
    const own = runs.filter(run => run.scheduleId === schedule.id);
    return toScheduleView(schedule, {
      lastRun: own[0] ?? null,
      hasIssuedPeriods: own.some(run => run.status === 'SUCCESS')
    });
  });
}

async function viewOf(tenantId: string, scheduleId: string): Promise<ChargeScheduleView> {
  const schedule = await prisma.syndicChargeSchedule.findFirst({
    where: { id: scheduleId, tenantId },
    include: { budget: BUDGET_SELECT }
  });
  if (!schedule) throw new NotFoundError('Programmation introuvable.');
  return (await viewsOf(tenantId, [schedule]))[0];
}

// ---------------------------------------------------------------- gardes

/** Programmation de la copropriété de l'agence ; sinon 404 (comme une programmation inexistante). */
async function loadOwnedSchedule(tenantId: string, syndicateId: string, scheduleId: string) {
  const schedule = await prisma.syndicChargeSchedule.findFirst({ where: { id: scheduleId, tenantId, syndicateId } });
  if (!schedule) throw new NotFoundError('Programmation introuvable.');
  return schedule;
}

/** Le budget désigné doit être celui de cette copropriété (de l'agence) ; sinon 404. */
async function assertBudgetOfSyndicate(syndicateId: string, budgetId: string | null | undefined) {
  if (!budgetId) return;
  const budget = await prisma.syndicateBudget.findFirst({ where: { id: budgetId, syndicateId }, select: { id: true } });
  if (!budget) throw new NotFoundError('Budget introuvable pour cette copropriété.');
}

async function processedPeriodStarts(tenantId: string, scheduleId: string): Promise<Set<number>> {
  const runs = await prisma.syndicChargeScheduleRun.findMany({
    where: { tenantId, scheduleId, status: { in: ['SUCCESS', 'SKIPPED'] } },
    select: { periodStart: true }
  });
  return new Set(runs.map(run => new Date(run.periodStart).getTime()));
}

/** Prochaine date d'émission : première période émise aujourd'hui ou après, non encore traitée. */
async function computeNextRunAt(
  schedule: Pick<
    SyndicChargeSchedule,
    'id' | 'tenantId' | 'frequency' | 'issueDay' | 'dueOffsetDays' | 'startDate' | 'endDate'
  >,
  now: Date
): Promise<Date | null> {
  const done = schedule.id ? await processedPeriodStarts(schedule.tenantId, schedule.id) : new Set<number>();
  const period = firstPeriodIssuedOnOrAfter(timingOf(schedule), now, start => done.has(start.getTime()));
  return period?.issueDate ?? null;
}

// ---------------------------------------------------------------- lecture

export async function listChargeSchedules(tenantId: string, syndicateId: string): Promise<ChargeScheduleView[]> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const schedules = await prisma.syndicChargeSchedule.findMany({
    where: { tenantId, syndicateId },
    include: { budget: BUDGET_SELECT },
    orderBy: [{ createdAt: 'desc' }]
  });
  return viewsOf(tenantId, schedules);
}

export async function getChargeSchedule(tenantId: string, syndicateId: string, scheduleId: string) {
  await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  return viewOf(tenantId, scheduleId);
}

export async function listChargeScheduleRuns(
  tenantId: string,
  syndicateId: string,
  scheduleId: string,
  query: { limit: number }
) {
  await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  const runs = await prisma.syndicChargeScheduleRun.findMany({
    where: { tenantId, scheduleId },
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    take: query.limit
  });
  return runs.map(toRunView);
}

// ---------------------------------------------------------------- écriture

export async function createChargeSchedule(
  tenantId: string,
  syndicateId: string,
  input: CreateChargeScheduleInput,
  actorUserId: string | null,
  now: Date = new Date()
): Promise<ChargeScheduleView> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  await assertBudgetOfSyndicate(syndicateId, input.budgetId);

  const data = {
    tenantId,
    syndicateId,
    label: input.label,
    frequency: input.frequency,
    issueDay: input.issueDay,
    dueOffsetDays: input.dueOffsetDays,
    amountSource: input.amountSource,
    budgetId: input.amountSource === 'BUDGET' ? (input.budgetId ?? null) : null,
    fixedAmount: input.amountSource === 'FIXED' ? (input.fixedAmount ?? null) : null,
    currency: input.currency ?? 'XOF',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    active: input.active ?? true,
    createdById: actorUserId
  };
  const nextRunAt = await computeNextRunAt({ ...data, id: '' }, now);
  const created = await prisma.syndicChargeSchedule.create({ data: { ...data, nextRunAt }, select: { id: true } });
  return viewOf(tenantId, created.id);
}

const CALENDAR_FIELDS = ['frequency', 'startDate'] as const;
const TIMING_FIELDS = ['frequency', 'startDate', 'endDate', 'issueDay'] as const;

export async function updateChargeSchedule(
  tenantId: string,
  syndicateId: string,
  scheduleId: string,
  input: UpdateChargeScheduleInput,
  now: Date = new Date()
): Promise<ChargeScheduleView> {
  const schedule = await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  const merged = {
    ...schedule,
    ...input,
    fixedAmount:
      input.fixedAmount !== undefined
        ? input.fixedAmount
        : schedule.fixedAmount === null
          ? null
          : Number(schedule.fixedAmount)
  };
  // Changer de source efface le champ de l'autre source, sauf s'il est fourni (et alors refusé).
  if (input.amountSource === 'FIXED' && input.budgetId === undefined) merged.budgetId = null;
  if (input.amountSource === 'BUDGET' && input.fixedAmount === undefined) merged.fixedAmount = null;

  const issues = scheduleConsistencyIssues(merged);
  if (issues.length > 0) throw new ValidationError(issues[0].message, issues);
  await assertBudgetOfSyndicate(syndicateId, input.budgetId);

  const changesCalendar = CALENDAR_FIELDS.some(
    field => input[field] !== undefined && String(input[field]) !== String(schedule[field])
  );
  if (changesCalendar && (await processedPeriodStarts(tenantId, scheduleId)).size > 0) {
    throw new ConflictError(
      'Des périodes ont déjà été émises : la fréquence et la date de début ne peuvent plus changer. Créez une nouvelle programmation.'
    );
  }

  const data = {
    label: merged.label,
    frequency: merged.frequency,
    issueDay: merged.issueDay,
    dueOffsetDays: merged.dueOffsetDays,
    amountSource: merged.amountSource,
    budgetId: merged.budgetId,
    fixedAmount: merged.fixedAmount,
    currency: merged.currency,
    startDate: merged.startDate,
    endDate: merged.endDate
  };
  const timingChanged = TIMING_FIELDS.some(field => input[field] !== undefined);
  const nextRunAt = timingChanged ? await computeNextRunAt({ ...schedule, ...data }, now) : schedule.nextRunAt;
  await prisma.syndicChargeSchedule.updateMany({ where: { id: scheduleId, tenantId }, data: { ...data, nextRunAt } });
  return viewOf(tenantId, scheduleId);
}

/**
 * Supprime une programmation qui n'a encore rien émis ; sinon la désactive
 * (son historique et ses appels restent).
 */
export async function deleteChargeSchedule(tenantId: string, syndicateId: string, scheduleId: string) {
  await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  const issued = await prisma.syndicChargeScheduleRun.count({
    where: { tenantId, scheduleId, status: 'SUCCESS' }
  });
  if (issued > 0) {
    await prisma.syndicChargeSchedule.updateMany({ where: { id: scheduleId, tenantId }, data: { active: false } });
    return { deleted: false, deactivated: true, schedule: await viewOf(tenantId, scheduleId) };
  }
  await prisma.syndicChargeScheduleRun.deleteMany({ where: { tenantId, scheduleId } });
  await prisma.syndicChargeSchedule.deleteMany({ where: { id: scheduleId, tenantId } });
  return { deleted: true, deactivated: false, schedule: null };
}

export async function pauseChargeSchedule(tenantId: string, syndicateId: string, scheduleId: string) {
  await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  await prisma.syndicChargeSchedule.updateMany({ where: { id: scheduleId, tenantId }, data: { active: false } });
  return viewOf(tenantId, scheduleId);
}

/** Reprise : les périodes émises pendant la pause ne sont pas rattrapées (voir l'en-tête). */
export async function resumeChargeSchedule(
  tenantId: string,
  syndicateId: string,
  scheduleId: string,
  now: Date = new Date()
) {
  const schedule = await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  const nextRunAt = await computeNextRunAt(schedule, now);
  await prisma.syndicChargeSchedule.updateMany({
    where: { id: scheduleId, tenantId },
    data: { active: true, nextRunAt }
  });
  return viewOf(tenantId, scheduleId);
}

// ---------------------------------------------------------------- exécution immédiate

function runResultView(result: RunOutcome) {
  return {
    status: result.status,
    alreadyProcessed: result.alreadyProcessed,
    runId: result.runId,
    periodStart: formatIsoDay(result.periodStart),
    periodLabel: result.periodLabel,
    batchId: result.batchId,
    callsCreated: result.callsCreated,
    callsCovered: result.callsCovered,
    notificationsSent: result.notificationsSent,
    error: result.error
  };
}

/**
 * « Exécuter maintenant » : la période due (date d'émission passée), sinon
 * la période en cours. Idempotent : une période déjà émise rend SKIPPED sans
 * rien créer. Quand la période traitée est la prochaine prévue, la
 * programmation avance.
 */
export async function executeChargeScheduleNow(
  tenantId: string,
  syndicateId: string,
  scheduleId: string,
  now: Date = new Date()
) {
  const schedule = await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  if (!schedule.active) {
    throw new ConflictError("La programmation est en pause : reprenez-la avant de l'exécuter.");
  }
  const timing = timingOf(schedule);
  const nextRunAt = schedule.nextRunAt;
  const due = nextRunAt !== null && nextRunAt.getTime() <= now.getTime();
  const period = periodContaining(timing, due ? nextRunAt : now);
  if (!period) throw new ValidationError('Aucune période due ni en cours pour cette programmation.');

  const result = await executeSchedulePeriod(schedule, period, 'MANUAL', now);
  const isPlannedPeriod = schedule.nextRunAt?.getTime() === period.issueDate.getTime();
  if (result.status !== 'FAILED' && isPlannedPeriod) await advanceSchedule(schedule, period, now);
  return { run: runResultView(result), schedule: await viewOf(tenantId, scheduleId) };
}

// ---------------------------------------------------------------- aperçu

/**
 * Les `count` prochaines périodes (à partir de la prochaine prévue) avec
 * leurs dates et montants, total et par lot. Aucune écriture : un budget
 * sans répartition ou non approuvé donne `error` au lieu des montants.
 */
export async function previewChargeSchedule(
  tenantId: string,
  syndicateId: string,
  scheduleId: string,
  now: Date = new Date(),
  count = 3
) {
  const schedule = await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  const timing = timingOf(schedule);
  let period = schedule.nextRunAt
    ? periodContaining(timing, schedule.nextRunAt)
    : firstPeriodIssuedOnOrAfter(timing, now);
  const periods = [];
  for (let index = 0; period && index < count; index += 1) {
    periods.push(await previewPeriod(schedule, period));
    period = followingPeriod(timing, period);
  }
  return { scheduleId, active: schedule.active, periods };
}

async function previewPeriod(schedule: SyndicChargeSchedule, period: SchedulePeriod) {
  const base = periodDates(period);
  try {
    const plan = await computePeriodPlan(schedule, period, { allowRecompute: false });
    return {
      ...base,
      totalAmount: plan.totalAmount,
      currency: plan.currency,
      budgetId: plan.budgetId,
      lots: plan.lots.map(lot => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, amount: lot.amount })),
      error: null as string | null
    };
  } catch (error) {
    return {
      ...base,
      totalAmount: null,
      currency: schedule.currency,
      budgetId: schedule.budgetId,
      lots: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
