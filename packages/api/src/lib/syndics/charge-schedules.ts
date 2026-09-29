import type { SyndicChargeSchedule, SyndicChargeScheduleRun } from '@prisma/client';
import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/error-middleware';
import { assertSyndicateOfTenant, paidFromAllocations } from './charge-allocation';
import { computeOutstanding } from './finance-utils';
import { formatIsoDay } from './period';
import {
  firstPeriodIssuedOnOrAfter,
  periodStartContaining,
  followingPeriod,
  periodContaining,
  type SchedulePeriod
} from './charge-schedule-periods';
import {
  advanceSchedule,
  computePeriodPlan,
  executeSchedulePeriod,
  notifyUncoveredCalls,
  publicErrorMessage,
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
    notificationsSkipped: run.notificationsSkipped,
    notes: run.notes,
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

type CalendarFields = Pick<SyndicChargeSchedule, 'frequency' | 'startDate' | 'endDate'>;

/** Étendue d'une programmation : début de sa première période, date de fin (ou sans fin). */
function calendarRange(schedule: CalendarFields): { start: number; end: number } {
  return {
    start: periodStartContaining(new Date(schedule.startDate), schedule.frequency).getTime(),
    end: schedule.endDate ? new Date(schedule.endDate).getTime() : Number.POSITIVE_INFINITY
  };
}

/**
 * Deux programmations actives d'une même copropriété ne doivent pas couvrir
 * la même période : les copropriétaires recevraient deux appels. 409 sinon.
 */
async function assertNoActiveOverlap(
  tenantId: string,
  syndicateId: string,
  candidate: CalendarFields,
  excludeId: string | null
): Promise<void> {
  const others = await prisma.syndicChargeSchedule.findMany({
    where: { tenantId, syndicateId, active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, frequency: true, startDate: true, endDate: true }
  });
  const range = calendarRange(candidate);
  const clash = others.some(other => {
    const otherRange = calendarRange(other);
    return range.start <= otherRange.end && otherRange.start <= range.end;
  });
  if (clash) {
    throw new ConflictError(
      'Une autre programmation active de cette copropriété couvre déjà cette période : mettez-la en pause ou ajustez les dates.'
    );
  }
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
  if (data.active) await assertNoActiveOverlap(tenantId, syndicateId, data, null);
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
  if (schedule.active && timingChanged) await assertNoActiveOverlap(tenantId, syndicateId, data, scheduleId);
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
  await assertNoActiveOverlap(tenantId, syndicateId, schedule, scheduleId);
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
    notificationsSkipped: result.notificationsSkipped,
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

// ---------------------------------------------------------------- renvoi des avis

/**
 * Garde anti-rafale simple, sans colonne supplémentaire : réutilise
 * `finishedAt` du journal, déjà posé à la fin de l'émission ET mis à jour à
 * chaque renvoi ci-dessous — un renvoi trop rapproché du précédent (émission
 * ou renvoi) est refusé.
 */
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * « Renvoyer les avis non envoyés » (item 4, anomalie recette) : ne retente
 * que les appels du lot d'appels de cette exécution qui sont encore dus
 * (reste à payer > 0) et sans avis déjà parti (`ChargeCall.noticeSentAt`
 * nul) — un appel dont l'avis est déjà parti n'est jamais renvoyé deux fois
 * par ce bouton. Les compteurs et la note de l'exécution sont recalculés sur
 * l'ENSEMBLE des appels non couverts du lot, pour garder l'invariant
 * `notificationsSent + notificationsSkipped === appels non couverts`.
 */
export async function resendChargeScheduleRunNotices(
  tenantId: string,
  syndicateId: string,
  scheduleId: string,
  runId: string,
  now: Date = new Date()
) {
  const schedule = await loadOwnedSchedule(tenantId, syndicateId, scheduleId);
  // `run → schedule → syndicat → tenant` doivent se tenir : un run d'une
  // autre agence (ou d'une autre programmation) répond le même 404 qu'un run
  // inexistant, jamais un 403 qui confirmerait son existence.
  const run = await prisma.syndicChargeScheduleRun.findFirst({ where: { id: runId, tenantId, scheduleId } });
  if (!run) throw new NotFoundError('Exécution introuvable.');
  if (run.status !== 'SUCCESS' || !run.batchId) {
    throw new ConflictError("Cette exécution n'a émis aucun appel de charges : rien à renvoyer.");
  }
  if (run.finishedAt && now.getTime() - run.finishedAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new ConflictError(
      'Un renvoi a déjà eu lieu il y a moins d’une minute pour cette exécution : patientez avant de réessayer.'
    );
  }

  const batchCalls = await prisma.chargeCall.findMany({
    where: { batchId: run.batchId, syndicateId },
    select: {
      id: true,
      amount: true,
      noticeSentAt: true,
      allocations: { select: { amount: true } },
      lot: { select: { lotNumber: true } }
    }
  });
  const uncovered = batchCalls.filter(
    call => computeOutstanding(Number(call.amount), paidFromAllocations(call.allocations)) > 0
  );
  const stillUnsent = uncovered.filter(call => !call.noticeSentAt);
  if (stillUnsent.length === 0) {
    throw new ConflictError('Tous les avis dus de cette exécution ont déjà été envoyés : rien à renvoyer.');
  }

  // Réservation atomique du renvoi : seule la requête qui fait passer
  // `finishedAt` de la valeur lue à `now` continue. Deux clics ou deux
  // collaborateurs simultanés n'envoient donc jamais deux fois le même avis.
  const claimed = await prisma.syndicChargeScheduleRun.updateMany({
    where: { id: run.id, tenantId, finishedAt: run.finishedAt },
    data: { finishedAt: now }
  });
  if (claimed.count !== 1) {
    throw new ConflictError(
      'Un renvoi a déjà eu lieu il y a moins d’une minute pour cette exécution : patientez avant de réessayer.'
    );
  }

  const summary = await notifyUncoveredCalls(
    schedule,
    stillUnsent.map(call => ({ id: call.id, lotNumber: call.lot.lotNumber }))
  );
  const previouslySent = uncovered.length - stillUnsent.length;
  const totalSent = previouslySent + summary.sent;
  const totalSkipped = uncovered.length - totalSent;
  await prisma.syndicChargeScheduleRun.updateMany({
    where: { id: run.id, tenantId },
    data: { notificationsSent: totalSent, notificationsSkipped: totalSkipped, notes: summary.notes, finishedAt: now }
  });

  return {
    resent: summary.sent,
    stillSkipped: summary.skipped,
    run: toRunView({
      ...run,
      notificationsSent: totalSent,
      notificationsSkipped: totalSkipped,
      notes: summary.notes,
      finishedAt: now
    })
  };
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
      error: publicErrorMessage(error, { scheduleId: schedule.id, step: 'preview' })
    };
  }
}
