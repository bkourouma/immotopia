import type { SyndicChargeSchedule } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { runWithTenantContext } from '../../utils/tenant-context';
import { AppError } from '../../middleware/error-middleware';
import { fromCents, toCents } from './charge-allocation-plan';
import { scheduleChargeDocumentDelivery } from './charge-receipt-delivery';
import type { IssuedChargeDocument } from './charge-receipts';
import { buildChargeCallNoticeAttachment, loadNoticeRenderContext } from './charge-call-notice';
import { createSchedulingGateCache, type SchedulingDenial } from './charge-schedule-tenant-gate';
import {
  annualShareForPeriod,
  distributeFixedAmount,
  followingPeriod,
  periodContaining,
  type ScheduleTiming,
  type SchedulePeriod
} from './charge-schedule-periods';
import { notifyChargeCall, type NotifyChargeCallResult, type NotifyChargeCallSkipReason } from './notifications';
import {
  assertNoRegularBatchForPeriodTx,
  createChargeCallBatchWithCallsTx,
  recomputeBudgetAllocationsByBudget
} from './queries';

/**
 * Exécution des programmations d'appels de charges (lot S4, besoin 6, P3).
 *
 * Pour UNE période d'une programmation :
 *   1. calcul des montants par lot (budget voté ÷ nombre de périodes, ou
 *      montant fixe réparti par tantièmes) ;
 *   2. dans UNE transaction : réservation de la période (ligne
 *      `SyndicChargeScheduleRun`, unique par programmation et début de
 *      période), puis lot d'appels et appels par le chemin commun
 *      (`createChargeCallBatchWithCallsTx` : débit du compte du lot,
 *      imputation de l'avance, quittance S3 de chaque appel couvert) ;
 *   3. après le commit : livraison des quittances, puis e-mail et WhatsApp
 *      des SEULS appels non couverts, avec l'avis d'appel PDF en pièce jointe.
 *
 * Idempotence : une période déjà réservée (SUCCESS ou SKIPPED) n'est jamais
 * réémise — une seconde exécution, même concurrente, bute sur l'unicité et
 * rend SKIPPED. Une période en échec (FAILED) est retentée : sa ligne d'échec
 * est remplacée dans la transaction qui réussit.
 */

/** Rattrapage : au plus 12 périodes par programmation et par exécution. */
export const MAX_CATCH_UP_PERIODS = 12;

export type RunTrigger = 'CRON' | 'MANUAL';

export interface RunOutcome {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  /** Vrai quand la période avait déjà été traitée (rien n'a été créé). */
  alreadyProcessed: boolean;
  runId: string | null;
  periodStart: Date;
  periodLabel: string;
  batchId: string | null;
  callsCreated: number;
  callsCovered: number;
  notificationsSent: number;
  /**
   * Avis non envoyés : propriétaire qui n'est plus copropriétaire actuel,
   * lot sans copropriétaire, aucun canal d'envoi disponible, ou échec
   * d'envoi (exception). Détail par raison dans `notes`.
   */
  notificationsSkipped: number;
  error: string | null;
}

/** Échec métier d'une période (message destiné au gestionnaire). */
export class ScheduleRunError extends Error {}

export function timingOf(
  schedule: Pick<SyndicChargeSchedule, 'frequency' | 'issueDay' | 'dueOffsetDays' | 'startDate' | 'endDate'>
): ScheduleTiming {
  return {
    frequency: schedule.frequency,
    issueDay: schedule.issueDay,
    dueOffsetDays: schedule.dueOffsetDays,
    startDate: new Date(schedule.startDate),
    endDate: schedule.endDate ? new Date(schedule.endDate) : null
  };
}

/**
 * Violation de l'unicité (programmation, début de période) du journal, et
 * d'elle seule : c'est le signe qu'une autre exécution a déjà réservé la
 * période. Tout autre P2002 est une vraie erreur.
 */
export function isPeriodReservationConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || (error as { code?: unknown }).code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return /schedule_?id/i.test(text) && /period_?start/i.test(text);
}

export const TECHNICAL_ERROR_MESSAGE = 'Erreur technique, voir les journaux.';

/**
 * Message stocké dans le journal et renvoyé au client : celui d'un échec
 * métier (`ScheduleRunError`) ou d'une erreur typée ; sinon un message
 * générique, le détail allant aux journaux seulement.
 */
export function publicErrorMessage(error: unknown, context: Record<string, unknown> = {}): string {
  if (error instanceof ScheduleRunError || error instanceof AppError) return error.message.slice(0, 500);
  logger.error('Charge schedule technical error', {
    ...context,
    error: error instanceof Error ? error.message : String(error)
  });
  return TECHNICAL_ERROR_MESSAGE;
}

// ---------------------------------------------------------------- montants

export interface PeriodPlan {
  lots: Array<{ lotId: string; lotNumber: string; amount: number }>;
  totalAmount: number;
  currency: string;
  budgetId: string | null;
}

type ScheduleForPlan = Pick<
  SyndicChargeSchedule,
  'tenantId' | 'syndicateId' | 'amountSource' | 'budgetId' | 'fixedAmount' | 'currency'
>;

async function loadSyndicateLots(schedule: ScheduleForPlan) {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: schedule.syndicateId, tenantId: schedule.tenantId },
    select: { id: true, status: true }
  });
  if (!syndicate) throw new ScheduleRunError('Copropriété introuvable.');
  if (syndicate.status === 'IN_LIQUIDATION') {
    throw new ScheduleRunError('Copropriété en liquidation : aucun appel émis.');
  }
  return prisma.syndicateLot.findMany({
    where: { syndicateId: schedule.syndicateId },
    select: { id: true, lotNumber: true, lotType: true, generalShares: true },
    orderBy: { lotNumber: 'asc' }
  });
}

/** Budget de la période : celui désigné, sinon le budget approuvé de l'exercice. */
async function loadBudgetForPeriod(schedule: ScheduleForPlan, period: SchedulePeriod) {
  const include = { allocations: { select: { lotId: true, totalAllocated: true } } } as const;
  const year = period.periodStart.getUTCFullYear();
  const budget = schedule.budgetId
    ? await prisma.syndicateBudget.findFirst({
        where: { id: schedule.budgetId, syndicateId: schedule.syndicateId },
        include
      })
    : await prisma.syndicateBudget.findFirst({
        where: { syndicateId: schedule.syndicateId, fiscalYear: year, status: 'APPROVED' },
        orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
        include
      });
  if (!budget) {
    throw new ScheduleRunError(
      schedule.budgetId
        ? 'Le budget de la programmation est introuvable (supprimé ?).'
        : `Aucun budget approuvé pour l'exercice ${year} : aucun appel émis.`
    );
  }
  if (budget.status !== 'APPROVED') {
    throw new ScheduleRunError(`Le budget « ${budget.label} » n'est pas approuvé : aucun appel émis.`);
  }
  return budget;
}

/**
 * Montants de la période par lot. `allowRecompute` : calcule la répartition
 * d'un budget qui n'en a pas encore (écriture) — faux pour un aperçu.
 */
export async function computePeriodPlan(
  schedule: ScheduleForPlan,
  period: SchedulePeriod,
  options: { allowRecompute: boolean }
): Promise<PeriodPlan> {
  const lots = await loadSyndicateLots(schedule);
  const lotNumber = new Map(lots.map(lot => [lot.id, lot.lotNumber]));

  let amounts: Array<{ lotId: string; amount: number }>;
  let budgetId: string | null = null;
  let currency = schedule.currency || 'XOF';
  if (schedule.amountSource === 'FIXED') {
    amounts = distributeFixedAmount(Number(schedule.fixedAmount ?? 0), lots);
  } else {
    const budget = await loadBudgetForPeriod(schedule, period);
    budgetId = budget.id;
    currency = budget.currency || currency;
    let allocations = budget.allocations;
    // Un lot désactivé (0 tantième) qui figure encore dans la répartition enregistrée
    // rend celle-ci périmée : recalcul à l'émission, jamais d'appel pour ce lot.
    const hasShares = lots.some(lot => lot.generalShares > 0);
    const activeLotIds = new Set(lots.filter(lot => !hasShares || lot.generalShares > 0).map(lot => lot.id));
    const stale = allocations.some(allocation => !activeLotIds.has(allocation.lotId));
    if (allocations.length === 0 || (stale && options.allowRecompute)) {
      if (!options.allowRecompute) {
        throw new ScheduleRunError("La répartition du budget n'est pas encore calculée : elle le sera à l'émission.");
      }
      allocations = await recomputeBudgetAllocationsByBudget(schedule.tenantId, schedule.syndicateId, budget.id);
    }
    amounts = allocations
      .filter(allocation => lotNumber.has(allocation.lotId) && activeLotIds.has(allocation.lotId))
      .map(allocation => ({
        lotId: allocation.lotId,
        amount: annualShareForPeriod(Number(allocation.totalAllocated), period.periodsPerYear, period.indexInYear)
      }));
  }

  // Un lot à quote-part nulle n'a rien à payer : ni appel, ni avis (BUG-050).
  amounts = amounts.filter(item => toCents(item.amount) > 0);
  if (amounts.length === 0) throw new ScheduleRunError('Aucun lot à appeler pour cette copropriété.');
  const planned = amounts.map(item => ({ ...item, lotNumber: lotNumber.get(item.lotId) ?? '' }));
  const totalAmount = fromCents(planned.reduce((sum, item) => sum + toCents(item.amount), 0));
  return { lots: planned, totalAmount, currency, budgetId };
}

// ---------------------------------------------------------------- exécution

function outcome(period: SchedulePeriod, fields: Partial<RunOutcome> & Pick<RunOutcome, 'status'>): RunOutcome {
  return {
    alreadyProcessed: false,
    runId: null,
    periodStart: period.periodStart,
    periodLabel: period.label,
    batchId: null,
    callsCreated: 0,
    callsCovered: 0,
    notificationsSent: 0,
    notificationsSkipped: 0,
    error: null,
    ...fields
  };
}

/** Consigne (ou remplace) l'échec de la période ; ne lève jamais. */
async function recordFailure(
  schedule: SyndicChargeSchedule,
  period: SchedulePeriod,
  trigger: RunTrigger,
  error: string,
  now: Date
): Promise<RunOutcome> {
  const where = { tenantId: schedule.tenantId, scheduleId: schedule.id, periodStart: period.periodStart };
  try {
    const existing = await prisma.syndicChargeScheduleRun.findFirst({ where, select: { id: true, status: true } });
    if (existing && existing.status !== 'FAILED') return outcome(period, { status: 'SKIPPED', alreadyProcessed: true });
    if (existing) {
      await prisma.syndicChargeScheduleRun.updateMany({
        where: { id: existing.id, tenantId: schedule.tenantId },
        data: { error, trigger, createdAt: now, finishedAt: now }
      });
      return outcome(period, { status: 'FAILED', runId: existing.id, error });
    }
    const run = await prisma.syndicChargeScheduleRun.create({
      data: {
        ...where,
        periodEnd: period.periodEnd,
        periodLabel: period.label,
        status: 'FAILED',
        trigger,
        error,
        createdAt: now,
        finishedAt: now
      },
      select: { id: true }
    });
    return outcome(period, { status: 'FAILED', runId: run.id, error });
  } catch (recordError) {
    logger.error('Charge schedule failure could not be recorded', {
      scheduleId: schedule.id,
      error: recordError instanceof Error ? recordError.message : String(recordError)
    });
    return outcome(period, { status: 'FAILED', error });
  }
}

export interface NotificationSummary {
  sent: number;
  skipped: number;
  /** Remarque non sensible pour le journal (lots dont l'avis n'est pas parti). */
  notes: string | null;
}

/**
 * Raison pour laquelle un appel non couvert n'a reçu aucun avis — reprend
 * `NotifyChargeCallSkipReason` (moins `CHARGE_CALL_NOT_FOUND`/`ALREADY_PAID`,
 * deja filtres avant d'arriver ici).
 */
type SkipReason = Exclude<NotifyChargeCallSkipReason, 'CHARGE_CALL_NOT_FOUND' | 'ALREADY_PAID'>;

const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  OWNER_NOT_CURRENT: 'propriétaire du lot différent du copropriétaire actuel',
  NO_OWNER: 'lot sans copropriétaire',
  NO_EMAIL: 'copropriétaire sans e-mail ni WhatsApp exploitable',
  NOTIFICATION_DISABLED: "notification e-mail désactivée pour l'agence",
  EMAIL_NOT_CONFIGURED: "envoi d'e-mails non configuré sur le serveur",
  SEND_FAILED: "échec de l'envoi"
};

/** Classe le résultat d'un `notifyChargeCall` réussi : `null` si un avis est bien parti. */
function classifySkip(result: NotifyChargeCallResult): SkipReason | null {
  if (result.emailSent || result.whatsappSent) return null;
  switch (result.skipped) {
    case 'OWNER_NOT_CURRENT':
    case 'NO_OWNER':
    case 'NO_EMAIL':
    case 'NOTIFICATION_DISABLED':
    case 'EMAIL_NOT_CONFIGURED':
    case 'SEND_FAILED':
      return result.skipped;
    default:
      // `notifyChargeCall` n'a pas classe ce cas (defensif) : traite comme un echec d'envoi.
      return 'SEND_FAILED';
  }
}

/** Une ligne par raison groupant les lots concernés, dans le style de la note historique. */
function buildSkipNotes(byReason: Record<SkipReason, string[]>): string | null {
  const lines = (Object.keys(byReason) as SkipReason[])
    .filter(reason => byReason[reason].length > 0)
    .map(reason => `Avis non envoyé (${SKIP_REASON_LABELS[reason]}) : ${byReason[reason].join(', ')}`);
  return lines.length ? lines.join('\n') : null;
}

/**
 * Notifie les appels non couverts, avis d'appel joint. L'identité (logos,
 * signature, cachet) et les moyens de paiement sont lus UNE fois par
 * exécution, pas une fois par appel. Tout appel non notifié (canal
 * indisponible, propriétaire changé, ou exception) compte en `skipped` :
 * `sent + skipped === calls.length`. Exportee : reutilisee telle quelle par
 * le renvoi des avis non envoyes (`resendUncoveredNotices` ci-dessous).
 */
export async function notifyUncoveredCalls(
  schedule: SyndicChargeSchedule,
  calls: Array<{ id: string; lotNumber: string }>
): Promise<NotificationSummary> {
  if (calls.length === 0) return { sent: 0, skipped: 0, notes: null };
  const context = await loadNoticeRenderContext(schedule.tenantId, schedule.syndicateId);
  let sent = 0;
  const byReason: Record<SkipReason, string[]> = {
    OWNER_NOT_CURRENT: [],
    NO_OWNER: [],
    NO_EMAIL: [],
    NOTIFICATION_DISABLED: [],
    EMAIL_NOT_CONFIGURED: [],
    SEND_FAILED: []
  };
  for (const call of calls) {
    try {
      const result = await notifyChargeCall(call.id, {
        buildAttachments: async () => [
          await buildChargeCallNoticeAttachment(schedule.tenantId, schedule.syndicateId, call.id, context)
        ]
      });
      const reason = classifySkip(result);
      if (!reason) {
        sent += 1;
      } else if (reason === 'SEND_FAILED' && result.skipDetail) {
        // Le motif technique du serveur mail (ex. « 554 … ») va aux journaux, pas
        // à l'utilisateur : les notes affichées disent seulement « échec de l'envoi ».
        logger.warn('Scheduled charge call notice send failed', {
          chargeCallId: call.id,
          detail: result.skipDetail
        });
        byReason[reason].push(call.lotNumber);
      } else {
        byReason[reason].push(call.lotNumber);
      }
    } catch (error) {
      // Filet de securite : `notifyChargeCall` catche deja l'echec d'envoi
      // e-mail en interne (SEND_FAILED) — une exception ici est un imprevu
      // (ex. base indisponible), journalise et compte quand meme en skipped.
      logger.warn('Scheduled charge call notification failed', {
        chargeCallId: call.id,
        error: error instanceof Error ? error.message : String(error)
      });
      byReason.SEND_FAILED.push(call.lotNumber);
    }
  }
  return { sent, skipped: calls.length - sent, notes: buildSkipNotes(byReason) };
}

interface CreatedRun {
  runId: string;
  batchId: string;
  callsCreated: number;
  callsCovered: number;
  toNotify: Array<{ id: string; lotNumber: string }>;
}

async function createRunTx(
  schedule: SyndicChargeSchedule,
  period: SchedulePeriod,
  plan: PeriodPlan,
  trigger: RunTrigger,
  now: Date,
  issued: IssuedChargeDocument[]
): Promise<CreatedRun> {
  return prisma.$transaction(
    async tx => {
      const key = { tenantId: schedule.tenantId, scheduleId: schedule.id, periodStart: period.periodStart };
      const lotNumbers = new Map(plan.lots.map(lot => [lot.lotId, lot.lotNumber]));
      // Pas de second lot d'appels ordinaire sur la même période (autre
      // programmation, génération manuelle) : ConflictError, rien n'est créé.
      await assertNoRegularBatchForPeriodTx(tx, schedule.syndicateId, {
        start: period.periodStart,
        end: period.periodEnd
      });
      // Un échec antérieur libère la période ; SUCCESS/SKIPPED la gardent (unicité).
      await tx.syndicChargeScheduleRun.deleteMany({ where: { ...key, status: 'FAILED' } });
      const run = await tx.syndicChargeScheduleRun.create({
        data: {
          ...key,
          periodEnd: period.periodEnd,
          periodLabel: period.label,
          status: 'SUCCESS',
          trigger,
          createdAt: now
        },
        select: { id: true }
      });
      const { batch, chargeCalls } = await createChargeCallBatchWithCallsTx(
        tx,
        schedule.tenantId,
        {
          syndicateId: schedule.syndicateId,
          label: `${schedule.label} - ${period.label}`,
          period: period.label,
          bounds: { start: period.periodStart, end: period.periodEnd },
          dueDate: period.dueDate,
          batchType: 'REGULAR',
          budgetId: plan.budgetId,
          totalAmount: plan.totalAmount,
          currency: plan.currency,
          lots: plan.lots
        },
        issued
      );
      // Appel entièrement couvert par l'avance : quittance (S3), jamais d'avis « à payer ».
      const covered = chargeCalls.filter(call => call.status === 'PAID');
      await tx.syndicChargeScheduleRun.updateMany({
        where: { id: run.id, tenantId: schedule.tenantId },
        data: { batchId: batch.id, callsCreated: chargeCalls.length, callsCovered: covered.length }
      });
      return {
        runId: run.id,
        batchId: batch.id,
        callsCreated: chargeCalls.length,
        callsCovered: covered.length,
        toNotify: chargeCalls
          .filter(call => call.status !== 'PAID')
          .map(call => ({ id: call.id, lotNumber: lotNumbers.get(call.lotId) ?? '' }))
      };
    },
    { timeout: 120_000 }
  );
}

/**
 * Traite UNE période d'une programmation (voir l'en-tête). Ne lève pas pour
 * un échec métier : il est consigné (FAILED) et rendu dans le résultat.
 */
export async function executeSchedulePeriod(
  schedule: SyndicChargeSchedule,
  period: SchedulePeriod,
  trigger: RunTrigger,
  now: Date = new Date()
): Promise<RunOutcome> {
  const existing = await prisma.syndicChargeScheduleRun.findFirst({
    where: { tenantId: schedule.tenantId, scheduleId: schedule.id, periodStart: period.periodStart },
    select: { id: true, status: true, batchId: true }
  });
  if (existing && existing.status !== 'FAILED') {
    return outcome(period, {
      status: 'SKIPPED',
      alreadyProcessed: true,
      runId: existing.id,
      batchId: existing.batchId
    });
  }

  let plan: PeriodPlan;
  try {
    plan = await computePeriodPlan(schedule, period, { allowRecompute: true });
  } catch (error) {
    const message = publicErrorMessage(error, { scheduleId: schedule.id, step: 'plan' });
    return recordFailure(schedule, period, trigger, message, now);
  }

  const issued: IssuedChargeDocument[] = [];
  let created: CreatedRun;
  try {
    created = await createRunTx(schedule, period, plan, trigger, now, issued);
  } catch (error) {
    if (isPeriodReservationConflict(error)) return outcome(period, { status: 'SKIPPED', alreadyProcessed: true });
    const message = publicErrorMessage(error, { scheduleId: schedule.id, step: 'issue' });
    return recordFailure(schedule, period, trigger, message, now);
  }

  scheduleChargeDocumentDelivery(schedule.tenantId, issued);
  const notifications = await notifyUncoveredCalls(schedule, created.toNotify);
  await prisma.syndicChargeScheduleRun.updateMany({
    where: { id: created.runId, tenantId: schedule.tenantId },
    data: {
      notificationsSent: notifications.sent,
      notificationsSkipped: notifications.skipped,
      notes: notifications.notes,
      // Coherent avec `createdAt: now` ci-dessus (et avec la garde anti-rafale
      // du renvoi, qui compare `finishedAt` a son propre `now`) : un rattrapage
      // dont `now` est fourni par l'appelant ne doit pas dater sa fin du vrai
      // horodatage serveur.
      finishedAt: now
    }
  });
  return outcome(period, {
    status: 'SUCCESS',
    runId: created.runId,
    batchId: created.batchId,
    callsCreated: created.callsCreated,
    callsCovered: created.callsCovered,
    notificationsSent: notifications.sent,
    notificationsSkipped: notifications.skipped
  });
}

/** Avance la programmation après la période `period` (traitée ou déjà traitée). */
export async function advanceSchedule(schedule: SyndicChargeSchedule, period: SchedulePeriod, now: Date) {
  const next = followingPeriod(timingOf(schedule), period);
  const data = { nextRunAt: next?.issueDate ?? null, lastRunAt: now };
  await prisma.syndicChargeSchedule.updateMany({ where: { id: schedule.id, tenantId: schedule.tenantId }, data });
  return { ...schedule, ...data };
}

/**
 * Traite toutes les périodes dues d'une programmation, dans l'ordre
 * (rattrapage borné à `MAX_CATCH_UP_PERIODS`). Un échec arrête la
 * programmation sur sa période : elle sera retentée à la prochaine exécution,
 * et les périodes suivantes attendent (jamais d'appel émis dans le désordre).
 */
export async function processDueSchedule(
  tenantId: string,
  scheduleId: string,
  now: Date,
  denial: SchedulingDenial | null = null
): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  for (let index = 0; index < MAX_CATCH_UP_PERIODS; index += 1) {
    const schedule = await prisma.syndicChargeSchedule.findFirst({ where: { id: scheduleId, tenantId } });
    if (!schedule || !schedule.active || !schedule.nextRunAt || schedule.nextRunAt.getTime() > now.getTime()) break;

    const period = periodContaining(timingOf(schedule), schedule.nextRunAt);
    if (!period) {
      await prisma.syndicChargeSchedule.updateMany({ where: { id: schedule.id, tenantId }, data: { nextRunAt: null } });
      break;
    }
    if (denial) {
      // Agence inactive ou abonnement refusé : rien n'est créé ni envoyé. La
      // période est consignée en échec (rejouable à la main via « Exécuter »)
      // et la programmation avance, pour ne pas envoyer une rafale d'appels
      // à la réactivation.
      outcomes.push(await recordFailure(schedule, period, 'CRON', denial, now));
      await advanceSchedule(schedule, period, now);
      continue;
    }
    const result = await executeSchedulePeriod(schedule, period, 'CRON', now);
    outcomes.push(result);
    if (result.status === 'FAILED') break;
    await advanceSchedule(schedule, period, now);
  }
  return outcomes;
}

export interface DueSchedulesReport {
  schedules: number;
  success: number;
  skipped: number;
  failed: number;
  failures: Array<{ tenantId: string; syndicateId: string; scheduleId: string; error: string }>;
  /** Programmations non émises parce que l'agence n'y a pas droit (périodes comptées dans `skipped`). */
  denied: Array<{ tenantId: string; syndicateId: string; scheduleId: string; reason: SchedulingDenial }>;
}

/**
 * Tâche quotidienne : toutes les programmations actives dues, toutes agences
 * confondues, chacune dans le contexte de son agence. L'échec d'une
 * copropriété n'arrête jamais les autres.
 */
export async function runDueChargeSchedules(now: Date = new Date()): Promise<DueSchedulesReport> {
  const due = await prisma.syndicChargeSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    select: { id: true, tenantId: true, syndicateId: true },
    orderBy: [{ nextRunAt: 'asc' }],
    take: 1000
  });
  const report: DueSchedulesReport = {
    schedules: due.length,
    success: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    denied: []
  };
  const gateOf = createSchedulingGateCache(now);
  for (const schedule of due) {
    try {
      const denial = await gateOf(schedule.tenantId);
      const outcomes = await runWithTenantContext({ tenantId: schedule.tenantId }, () =>
        processDueSchedule(schedule.tenantId, schedule.id, now, denial)
      );
      if (denial) {
        report.skipped += outcomes.length;
        report.denied.push({ ...pick(schedule), reason: denial });
        continue;
      }
      for (const result of outcomes) {
        if (result.status === 'SUCCESS') report.success += 1;
        else if (result.status === 'SKIPPED') report.skipped += 1;
        else {
          report.failed += 1;
          report.failures.push({ ...pick(schedule), error: result.error ?? '' });
        }
      }
    } catch (error) {
      report.failed += 1;
      report.failures.push({ ...pick(schedule), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

function pick(schedule: { id: string; tenantId: string; syndicateId: string }) {
  return { tenantId: schedule.tenantId, syndicateId: schedule.syndicateId, scheduleId: schedule.id };
}
