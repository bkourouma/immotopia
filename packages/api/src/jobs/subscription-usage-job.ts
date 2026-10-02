/**
 * Tache planifiee des abonnements par packs (vague 2, lot B) — reference :
 * docs/architecture/PLAN-ABONNEMENTS.md.
 *
 * Pour chaque abonnement vivant (essai, actif, impaye), a chaque passage :
 * 0. Facturation (vague 3, lot A, services/platform-invoice-service.ts,
 *    `runPlatformBillingStep`) : en annuel, facture du depassement de chaque
 *    fenetre mensuelle ecoulee ; a l'echeance d'essai ou de periode, facture
 *    PLATFORM de la periode suivante generee, emise et envoyee a l'agence
 *    (une facture a zero est reglee d'office) ; factures echues -> OVERDUE.
 *    L'echeance ci-dessous s'appuie ensuite sur CES factures : payee ->
 *    renouvellement, sinon PAST_DUE ; le paiement (lot B) repasse ACTIVE.
 * 1. Echeance (D7, D8) : a la fin de l'essai ou de la periode, les retraits
 *    programmes et les extensions liees a un pack retire s'appliquent
 *    (`applyDueItemTransitionsTx`) ; puis, si une facture PLATFORM PAYEE
 *    couvre la periode suivante, la periode avance, sinon l'abonnement passe
 *    PAST_DUE (`pastDueAt` = echeance). La lecture seule tombe d'elle-meme
 *    apres `graceDays` jours (7), calculee par `resolveSubscriptionPhase`.
 * 2. Releve quotidien de consommation (UsageSnapshot, une ligne par agence,
 *    capacite et jour ; la valeur garde le PIC de la journee).
 * 3. Alertes de seuil 80 % et 100 % : une seule fois par capacite, seuil et
 *    periode (unicite de QuotaAlert). La ligne QuotaAlert est l'alerte
 *    in-app (lue par les ecrans de l'agence et du super-admin) ; un e-mail
 *    part a l'administrateur de l'agence, un autre au super-admin.
 * 4. Rappels de fin d'essai J-7 et J-1, une seule fois par date de fin
 *    d'essai (une prolongation relance les rappels).
 *
 * Passages : tous les jours a 02:30 UTC (tout), et toutes les heures pour les
 * alertes de seuil (un depassement ne doit pas attendre le lendemain).
 * Portails et paiements des locataires ne sont jamais touches (D8).
 */

import * as cron from 'node-cron';
import { CapacityKey, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import { t } from '../i18n';
import { frontendUrl } from '../config/env';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';
import { addBillingPeriod, CAPACITY_KEYS, CapacityKeyCode, PACK, PARTICULIER_PACKS } from '../lib/subscription';
import { isFreeSubscription, runPlatformBillingStep } from '../services/platform-invoice-service';
import {
  applyDueItemTransitionsTx,
  getEntitlements,
  invalidateEntitlements,
  monthlyOverageWindow
} from '../services/subscription-v2-service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Seuils d'alerte, en pourcentage de la capacite. */
export const QUOTA_ALERT_THRESHOLDS = [80, 100] as const;
/** Rappels de fin d'essai, en jours avant la fin. */
export const TRIAL_REMINDER_DAYS = [7, 1] as const;

const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE
];

const CAPACITY_LABELS: Record<CapacityKeyCode, string> = {
  LOTS: 'lots',
  COPROPRIETES: 'copropriétés',
  CHANTIERS: 'chantiers',
  BIENS_DETENUS: 'biens détenus',
  ACTIFS: 'actifs'
};

/**
 * ACTIFS n'existe que pour les packs Particulier : sans plafond d'actifs
 * (agence, pack Patrimoine), la capacite est ignoree — ni releve, ni alerte.
 */
const isActifsWithoutCap = (key: CapacityKeyCode, limit: number) => key === 'ACTIFS' && limit <= 0;

type SubscriptionRow = Prisma.SubscriptionGetPayload<object>;

/** Ecran d'abonnement de l'agence (apps/web : /tenant/:tenantId/settings/abonnement). */
const subscriptionUrl = (tenantId: string) => `${frontendUrl}/tenant/${tenantId}/settings/abonnement`;

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function metadataOf(sub: { metadata: Prisma.JsonValue | null }): Record<string, unknown> {
  return sub.metadata && typeof sub.metadata === 'object' && !Array.isArray(sub.metadata)
    ? { ...(sub.metadata as Record<string, unknown>) }
    : {};
}

/**
 * Periode de reference des alertes et releves : la periode de facturation ;
 * en ANNUEL, la fenetre MENSUELLE de depassement (le depassement y est
 * facture chaque mois), si bien que les alertes se rearment chaque mois.
 */
export function alertPeriodStart(sub: Pick<SubscriptionRow, 'billingCycle' | 'currentPeriodStart'>, now: Date): Date {
  return sub.billingCycle === 'ANNUAL'
    ? monthlyOverageWindow(sub.currentPeriodStart, now).start
    : sub.currentPeriodStart;
}

// ------------------------------------------------------------------ destinataires

interface Recipient {
  email: string;
  fullName: string | null;
}

/** Administrateurs de l'agence (role TENANT_ADMIN), sinon l'e-mail de contact de l'agence. */
export async function agencyAdminRecipients(tenantId: string): Promise<Recipient[]> {
  const role = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' }, select: { id: true } });
  if (role) {
    const links = await prisma.userRole.findMany({ where: { tenantId, roleId: role.id }, select: { userId: true } });
    const ids = [...new Set(links.map(l => l.userId))];
    if (ids.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { email: true, fullName: true }
      });
      if (users.length > 0) return users;
    }
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { contactEmail: true, name: true }
  });
  return tenant?.contactEmail ? [{ email: tenant.contactEmail, fullName: tenant.name }] : [];
}

async function superAdminRecipients(): Promise<Recipient[]> {
  return prisma.user.findMany({
    where: { globalRole: 'SUPER_ADMIN', isActive: true },
    select: { email: true, fullName: true }
  });
}

async function sendMail(to: Recipient[], subject: string, text: string, tenantId?: string): Promise<number> {
  if (to.length === 0) return 0;
  const { emailService } = await import('../services/email-service');
  let sent = 0;
  for (const recipient of to) {
    try {
      // eslint-disable-next-line no-await-in-loop -- quelques destinataires au plus.
      await emailService.sendEmail({ to: recipient.email, subject, text, ...(tenantId ? { tenantId } : {}) });
      sent += 1;
    } catch (error) {
      logger.warn('Subscription notice e-mail failed', {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return sent;
}

/**
 * Previent l'agence (in-app : la ligne deja ecrite ; e-mail aux administrateurs) et le super-admin.
 * Un espace PARTICULIER (libre-service, potentiellement tres nombreux) ne
 * declenche aucun e-mail au super-admin : seul l'utilisateur est prevenu.
 */
async function notify(
  tenantId: string,
  notice: { subject: string; text: string; adminSubject: string; adminText: string }
) {
  const agencySent = await runWithTenantContext({ tenantId }, async () =>
    sendMail(await agencyAdminRecipients(tenantId), notice.subject, notice.text, tenantId)
  );
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
  const adminSent =
    tenant?.type === 'PARTICULIER'
      ? 0
      : await sendMail(await superAdminRecipients(), notice.adminSubject, notice.adminText);
  return { agencySent, adminSent };
}

async function tenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name ?? tenantId;
}

// ------------------------------------------------------------------ 1. echeance

export interface BoundaryOutcome {
  action: 'NONE' | 'RENEWED' | 'PAST_DUE';
  ended: number;
  started: number;
  readOnlyNotified: boolean;
}

/**
 * Echeance d'essai ou de periode atteinte : transitions dues, puis
 * renouvellement (facture payee) ou passage PAST_DUE. Idempotent.
 */
export async function processBillingBoundary(subscriptionId: string, now: Date = new Date()): Promise<BoundaryOutcome> {
  const result = await prisma.$transaction(async tx => {
    const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || !LIVE_STATUSES.includes(sub.status)) return null;
    const outcome: BoundaryOutcome = { action: 'NONE', ended: 0, started: 0, readOnlyNotified: false };
    const wasTrial = sub.status === SubscriptionStatus.TRIALING;

    // Transitions dues a l'instant (retraits programmes a une date passee).
    const due = await applyDueItemTransitionsTx(tx, sub.tenantId, now);
    outcome.ended += due.ended;
    outcome.started += due.started;

    if (sub.status === SubscriptionStatus.PAST_DUE) return { sub, outcome, wasTrial };

    const boundary =
      sub.status === SubscriptionStatus.TRIALING ? (sub.trialEndsAt ?? sub.currentPeriodEnd) : sub.currentPeriodEnd;
    if (boundary.getTime() > now.getTime()) return { sub, outcome, wasTrial };

    // Changement de periode : les transitions ci-dessus (a `now`, donc apres
    // l'echeance) ont deja termine les packs retires ET leurs extensions
    // liees, et commence ce qui etait programme.
    const nextEnd = addBillingPeriod(boundary, sub.billingCycle);
    const paid = await tx.invoice.findFirst({
      where: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        kind: 'PLATFORM',
        status: 'PAID',
        periodStart: { gte: new Date(boundary.getTime() - DAY_MS), lt: nextEnd }
      },
      select: { id: true }
    });
    // Abonnement gratuit : aucune facture n'existe ni n'est attendue, il se
    // renouvelle d'office (et sort de l'etat d'essai s'il y etait).
    const free = paid ? false : await isFreeSubscription(tx, sub.id);
    if (paid || free) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: boundary,
          currentPeriodEnd: nextEnd,
          nextBillingAt: nextEnd,
          pastDueAt: null
        }
      });
      outcome.action = 'RENEWED';
    } else {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.PAST_DUE, pastDueAt: boundary }
      });
      outcome.action = 'PAST_DUE';
    }
    return { sub, outcome, wasTrial };
  });

  if (!result) return { action: 'NONE', ended: 0, started: 0, readOnlyNotified: false };
  const { sub, outcome, wasTrial } = result;
  invalidateEntitlements(sub.tenantId);

  if (outcome.action !== 'NONE') {
    logAuditEvent({
      actorUserId: null,
      tenantId: sub.tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_UPDATED,
      entityType: 'Subscription',
      entityId: sub.id,
      payload: { job: 'subscription-usage', action: outcome.action, ended: outcome.ended, started: outcome.started }
    });
  }
  if (outcome.action === 'PAST_DUE') {
    const name = await tenantName(sub.tenantId);
    await notify(sub.tenantId, {
      subject: wasTrial ? t('Votre essai ImmoTopia est terminé') : t('Votre abonnement ImmoTopia est impayé'),
      text: t(
        "Votre abonnement n'est pas réglé. Vous disposez de {{days}} jours de grâce avant le passage en lecture seule. Réglez votre facture depuis {{url}}.",
        { days: sub.graceDays, url: subscriptionUrl(sub.tenantId) }
      ),
      adminSubject: `[ImmoTopia] PAST_DUE — ${name}`,
      adminText: `L'abonnement de ${name} (${sub.tenantId}) est passé PAST_DUE (${wasTrial ? "fin d'essai" : 'fin de période'} sans paiement).`
    });
  }

  // Entree en lecture seule (fin de la grace) : prevenir une seule fois.
  const entitlements = await getEntitlements(sub.tenantId, { fresh: true, now });
  const fresh = await prisma.subscription.findUnique({ where: { id: sub.id } });
  if (fresh && entitlements.readOnly && entitlements.phase === 'READ_ONLY') {
    const metadata = metadataOf(fresh);
    const marker = (entitlements.graceEndsAt ?? now).toISOString();
    if (metadata.readOnlyNotifiedFor !== marker) {
      await prisma.subscription.update({
        where: { id: fresh.id },
        data: { metadata: { ...metadata, readOnlyNotifiedFor: marker } as Prisma.InputJsonValue }
      });
      const name = await tenantName(sub.tenantId);
      await notify(sub.tenantId, {
        subject: t('Votre espace ImmoTopia est en lecture seule'),
        text: t(
          'Le délai de grâce est écoulé : vos données restent consultables et exportables, mais plus modifiables. Réglez votre abonnement pour tout rouvrir.'
        ),
        adminSubject: `[ImmoTopia] Lecture seule — ${name}`,
        adminText: `${name} (${sub.tenantId}) est passée en lecture seule (${entitlements.readOnlyReason}).`
      });
      outcome.readOnlyNotified = true;
    }
  }
  return outcome;
}

// ------------------------------------------------------------------ 2. releves

/** Releve du jour, par capacite ; garde le pic de la journee. */
export async function recordUsageSnapshots(tenantId: string, now: Date = new Date()): Promise<number> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return 0;
  const entitlements = await getEntitlements(tenantId, { fresh: true, now });
  const snapshotDate = utcDay(now);
  const periodStart = alertPeriodStart(sub, now);
  let recorded = 0;
  for (const key of CAPACITY_KEYS) {
    const capacity = entitlements.capacities[key];
    if (isActifsWithoutCap(key, capacity.limit)) continue;
    recorded += 1;
    const where = { tenantId_capacityKey_snapshotDate: { tenantId, capacityKey: key as CapacityKey, snapshotDate } };
    // eslint-disable-next-line no-await-in-loop -- trois capacites.
    const existing = await prisma.usageSnapshot.findUnique({ where, select: { used: true } });
    const used = Math.max(existing?.used ?? 0, capacity.used);
    const details = { included: capacity.included, extensions: capacity.extensions, overrides: capacity.overrides };
    // eslint-disable-next-line no-await-in-loop -- trois capacites.
    await prisma.usageSnapshot.upsert({
      where,
      create: {
        tenantId,
        capacityKey: key as CapacityKey,
        snapshotDate,
        periodStart,
        used,
        limit: capacity.limit,
        overage: Math.max(0, used - capacity.limit),
        details
      },
      update: { periodStart, used, limit: capacity.limit, overage: Math.max(0, used - capacity.limit), details }
    });
  }
  return recorded;
}

// ------------------------------------------------------------------ 3. alertes

/** Seuils franchis (80, 100) pour une consommation ; une capacite nulle entamee vaut 100 %. */
export function crossedThresholds(used: number, limit: number): number[] {
  if (used <= 0) return [];
  if (limit <= 0) return [...QUOTA_ALERT_THRESHOLDS];
  return QUOTA_ALERT_THRESHOLDS.filter(threshold => used * 100 >= limit * threshold);
}

export interface RaisedAlert {
  capacityKey: CapacityKeyCode;
  threshold: number;
  used: number;
  limit: number;
}

/**
 * Leve les alertes de seuil dues, UNE fois par capacite, seuil et periode :
 * l'unicite de QuotaAlert (tenant, capacite, seuil, periode) tranche meme
 * sous concurrence. A appeler par la tache ; utilisable apres une operation.
 */
export async function evaluateQuotaAlerts(tenantId: string, now: Date = new Date()): Promise<RaisedAlert[]> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub || !LIVE_STATUSES.includes(sub.status)) return [];
  const entitlements = await getEntitlements(tenantId, { fresh: true, now });
  const periodStart = alertPeriodStart(sub, now);
  const raised: RaisedAlert[] = [];

  for (const key of CAPACITY_KEYS) {
    const { used, limit } = entitlements.capacities[key];
    if (isActifsWithoutCap(key, limit)) continue;
    for (const threshold of crossedThresholds(used, limit)) {
      let created;
      try {
        // eslint-disable-next-line no-await-in-loop -- deux seuils, trois capacites.
        created = await prisma.quotaAlert.create({
          data: { tenantId, capacityKey: key as CapacityKey, threshold, periodStart, used, limit }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue; // deja levee
        throw error;
      }
      raised.push({ capacityKey: key, threshold, used, limit });
      // eslint-disable-next-line no-await-in-loop -- rare : une alerte par seuil et par periode.
      const name = await tenantName(tenantId);
      const label = t(CAPACITY_LABELS[key]);
      const policyNote =
        entitlements.quotaPolicy === 'BLOCK'
          ? t('Au-delà, les nouveaux ajouts seront refusés.')
          : entitlements.quotaPolicy === 'BILL_OVERAGE'
            ? t('Au-delà, le dépassement sera facturé.')
            : t('Au-delà, le dépassement sera signalé.');
      // eslint-disable-next-line no-await-in-loop -- rare.
      await notify(tenantId, {
        subject:
          threshold >= 100
            ? t('Capacité de votre abonnement atteinte ({{label}})', { label })
            : t('Capacité de votre abonnement utilisée à {{threshold}} % ({{label}})', { threshold, label }),
        text: alertText(key, entitlements.packs, {
          used,
          limit,
          label,
          policy: policyNote,
          url: subscriptionUrl(tenantId)
        }),
        adminSubject: `[ImmoTopia] ${name} — ${key} ${threshold} %`,
        adminText: `${name} (${tenantId}) : ${used} / ${limit} ${CAPACITY_LABELS[key]} (seuil ${threshold} %, politique ${entitlements.quotaPolicy}).`
      });
      // eslint-disable-next-line no-await-in-loop -- rare.
      await prisma.quotaAlert.update({ where: { id: created.id }, data: { notifiedAt: new Date() } });
    }
  }
  return raised;
}

/**
 * Corps de l'alerte de seuil. Un particulier n'a pas d'extension a ajouter : sur le palier gratuit on
 * l'invite a passer au palier payant, sur le palier payant a archiver ; les autres capacites gardent
 * le texte historique (« Ajoutez une extension »).
 */
function alertText(
  key: CapacityKeyCode,
  packs: readonly string[] | undefined,
  vars: { used: number; limit: number; label: string; policy: string; url: string }
): string {
  if (key === 'ACTIFS' && packs?.includes(PACK.PARTICULIER_GRATUIT)) {
    return t(
      'Vous utilisez {{used}} {{label}} sur {{limit}} inclus dans votre formule gratuite. {{policy}} Passez au palier payant depuis {{url}}.',
      vars
    );
  }
  if (key === 'ACTIFS' && packs?.some(pack => PARTICULIER_PACKS.includes(pack))) {
    return t(
      'Vous utilisez {{used}} {{label}} sur {{limit}} inclus dans votre formule. {{policy}} Archivez les actifs dont vous n’avez plus besoin ou contactez-nous depuis {{url}}.',
      vars
    );
  }
  return t(
    'Vous utilisez {{used}} {{label}} sur {{limit}} inclus. {{policy}} Ajoutez une extension depuis {{url}}.',
    vars
  );
}

/** Alertes de seuil d'une agence, les plus recentes d'abord (surface in-app). */
export async function listQuotaAlerts(tenantId: string, limit = 20) {
  return prisma.quotaAlert.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: limit });
}

// ------------------------------------------------------------------ 4. fin d'essai

/** Rappel du a `now` (7 ou 1), ou null. */
export function dueTrialReminder(trialEndsAt: Date, now: Date): number | null {
  const left = trialEndsAt.getTime() - now.getTime();
  if (left <= 0) return null;
  const daysLeft = Math.ceil(left / DAY_MS);
  // Le plus proche seuil atteint : J-1 si <= 1 jour, sinon J-7 si <= 7 jours.
  const reached = [...TRIAL_REMINDER_DAYS].sort((a, b) => a - b).find(d => daysLeft <= d);
  return reached ?? null;
}

/** Rappels J-7 et J-1, une fois chacun par date de fin d'essai. */
export async function sendTrialReminders(tenantId: string, now: Date = new Date()): Promise<number | null> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub || sub.status !== SubscriptionStatus.TRIALING) return null;
  // Un abonnement gratuit n'a pas d'essai qui expire : aucun rappel de fin d'essai.
  if (await isFreeSubscription(prisma, sub.id)) return null;
  const trialEndsAt = sub.trialEndsAt ?? sub.currentPeriodEnd;
  const reminder = dueTrialReminder(trialEndsAt, now);
  if (reminder === null) return null;

  const metadata = metadataOf(sub);
  const key = trialEndsAt.toISOString();
  const sent = (metadata.trialReminders ?? {}) as Record<string, number[]>;
  if ((sent[key] ?? []).includes(reminder)) return null;
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      metadata: { ...metadata, trialReminders: { [key]: [...(sent[key] ?? []), reminder] } } as Prisma.InputJsonValue
    }
  });

  const name = await tenantName(tenantId);
  await notify(tenantId, {
    subject:
      reminder === 1
        ? t('Votre essai ImmoTopia se termine demain')
        : t('Votre essai ImmoTopia se termine dans 7 jours'),
    text: t(
      "Votre période d'essai se termine le {{date}}. Pour continuer sans interruption, choisissez vos packs et réglez votre abonnement depuis {{url}}.",
      { date: trialEndsAt.toISOString().slice(0, 10), url: subscriptionUrl(tenantId) }
    ),
    adminSubject: `[ImmoTopia] Fin d'essai J-${reminder} — ${name}`,
    adminText: `L'essai de ${name} (${tenantId}) se termine le ${trialEndsAt.toISOString().slice(0, 10)}.`
  });
  return reminder;
}

// ------------------------------------------------------------------ passage complet

export interface UsageCycleReport {
  tenants: number;
  renewed: number;
  pastDue: number;
  snapshots: number;
  alerts: number;
  trialReminders: number;
  /** Factures PLATFORM de periode creees (vague 3). */
  periodInvoices: number;
  /** Factures mensuelles de depassement creees (annuel, vague 3). */
  overageInvoices: number;
  /** Factures passees OVERDUE. */
  overdueInvoices: number;
  errors: Array<{ tenantId: string; error: string }>;
}

/** Un passage complet (ou alertes seules), pour toutes les agences ou une seule. */
export async function runSubscriptionUsageCycle(
  options: { now?: Date; tenantId?: string; alertsOnly?: boolean } = {}
): Promise<UsageCycleReport> {
  const now = options.now ?? new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: { status: { in: LIVE_STATUSES }, ...(options.tenantId ? { tenantId: options.tenantId } : {}) },
    select: { id: true, tenantId: true }
  });
  const report: UsageCycleReport = {
    tenants: subscriptions.length,
    renewed: 0,
    pastDue: 0,
    snapshots: 0,
    alerts: 0,
    trialReminders: 0,
    periodInvoices: 0,
    overageInvoices: 0,
    overdueInvoices: 0,
    errors: []
  };
  for (const sub of subscriptions) {
    try {
      if (!options.alertsOnly) {
        // Facturation d'abord : l'echeance juge sur la facture de la periode.
        // Un echec de facturation n'empeche ni l'echeance ni les releves.
        try {
          // eslint-disable-next-line no-await-in-loop -- agences traitees une a une.
          const billing = await runPlatformBillingStep(sub.id, now);
          if (billing.periodInvoice === 'CREATED') report.periodInvoices += 1;
          report.overageInvoices += billing.overageInvoices;
          report.overdueInvoices += billing.overdue;
        } catch (error) {
          report.errors.push({
            tenantId: sub.tenantId,
            error: `billing: ${error instanceof Error ? error.message : String(error)}`
          });
        }
        // eslint-disable-next-line no-await-in-loop -- agences traitees une a une.
        const boundary = await processBillingBoundary(sub.id, now);
        if (boundary.action === 'RENEWED') report.renewed += 1;
        if (boundary.action === 'PAST_DUE') report.pastDue += 1;
        // eslint-disable-next-line no-await-in-loop -- agences traitees une a une.
        report.snapshots += await recordUsageSnapshots(sub.tenantId, now);
        // eslint-disable-next-line no-await-in-loop -- agences traitees une a une.
        if ((await sendTrialReminders(sub.tenantId, now)) !== null) report.trialReminders += 1;
      }
      // eslint-disable-next-line no-await-in-loop -- agences traitees une a une.
      report.alerts += (await evaluateQuotaAlerts(sub.tenantId, now)).length;
    } catch (error) {
      report.errors.push({ tenantId: sub.tenantId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}

// ------------------------------------------------------------------ planification

let dailyJob: cron.ScheduledTask | null = null;
let hourlyJob: cron.ScheduledTask | null = null;

async function runLogged(alertsOnly: boolean) {
  try {
    const report = await runSubscriptionUsageCycle({ alertsOnly });
    logger.info('Subscription usage job completed', { alertsOnly, ...report, errors: report.errors.length });
    for (const e of report.errors) logger.error('Subscription usage job: tenant failed', e);
  } catch (error) {
    logger.error('Error in subscription usage job', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/** Demarre la tache : passage complet a 02:30 UTC, alertes de seuil toutes les heures. */
export function startSubscriptionUsageJob() {
  if (dailyJob) {
    logger.warn('Subscription usage job is already running');
    return;
  }
  dailyJob = cron.schedule('30 2 * * *', () => runLogged(false), { timezone: 'UTC' });
  hourlyJob = cron.schedule('15 * * * *', () => runLogged(true), { timezone: 'UTC' });
  logger.info('Subscription usage job started (daily 02:30 UTC, quota alerts hourly)');
}

export function stopSubscriptionUsageJob() {
  dailyJob?.stop();
  hourlyJob?.stop();
  dailyJob = null;
  hourlyJob = null;
}

/** Declenchement manuel (tests, super-admin). */
export async function triggerSubscriptionUsageCycle(options: { now?: Date; tenantId?: string } = {}) {
  return runSubscriptionUsageCycle(options);
}
