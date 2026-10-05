import * as cron from 'node-cron';

import { env } from '../config/env';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';
import { runWithLanguage, isLanguage, DEFAULT_LANGUAGE } from '../i18n';
import type { Language } from '../i18n';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../services/email-notification-config-service';
import { emailService } from '../services/email-service';
import { getEntitlements } from '../services/subscription-v2-service';
import { evaluateFeatureAccess } from '../lib/subscription/feature-access';
import { applyTemplate, escapeHtml } from '../lib/patrimoine/notification-channels';
import {
  ALERT_SELECT,
  buildAlertTitle,
  formatAlertAmount,
  type StockAlertRow
} from '../lib/finance/stock-alertes-lecture';
import { toAmount } from '../lib/finance/types';

/**
 * Tâche de maintenance du stock — lot 040 (spec B7-R6, B3-R2).
 *
 * Deux travaux :
 *
 * 1. **Récapitulatif e-mail des alertes** (toutes les 10 minutes), seulement
 *    si `STOCK_ALERT_MAIL_JOB_ENABLED` (faux par défaut, comme
 *    `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED`) :
 *    - LECTURE TRANSVERSE ASSUMÉE de la liste des agences qui ont des alertes
 *      non envoyées (`email_sent_at IS NULL`), hors contexte d'agence — même
 *      parti pris, commenté, que `newsletter-campaign-scheduler.job.ts` :
 *      c'est la tâche elle-même qui doit voir toutes les agences ;
 *    - puis UNE AGENCE À LA FOIS dans `runWithTenantContext`, pour que la
 *      garde Prisma (`prisma-tenant-guard-extension.ts`) reste active ;
 *    - RÉCLAMATION des alertes par une mise à jour conditionnelle (`UPDATE …
 *      RETURNING`) : deux instances ne réclament jamais la même alerte, et une
 *      instance tombée en cours d'envoi libère ses alertes au bout de
 *      30 minutes ;
 *    - ENVOI d'un récapitulatif, puis `email_sent_at` APRÈS le succès SMTP
 *      seulement (« au moins une fois ») ;
 *    - une alerte SANS OBJET — clé désactivée (`DISABLED`), fonctionnalité
 *      CONSTRUCTION absente (`NO_FEATURE`), aucun destinataire
 *      (`NO_RECIPIENT`) — reçoit `email_sent_at` et `email_skipped_reason` :
 *      elle n'est plus relue, l'écran Contrôle reste sa source.
 *    Destinataires : membres ACTIFS de l'agence, `User.isActive`, détenant
 *    STOCK_ALERTS_VIEW ET STOCK_VALUES_VIEW — lus EN BASE, jamais dans le cache
 *    des permissions (B1-R6). Le récapitulatif ne cite aucun nom de personne.
 *
 * 2. **Purge nocturne** (3 h UTC) des clés d'idempotence du stock de plus de
 *    30 jours (B3-R2). Toujours active : la table ne doit pas grossir sans fin.
 *    Suppression TRANSVERSE assumée (toutes agences), bornée par la date.
 *
 * Les horodatages écrits en SQL sont convertis en UTC explicitement : les
 * colonnes `timestamp` du schéma portent l'heure UTC, quel que soit le fuseau
 * de la session PostgreSQL.
 */

let mailJob: cron.ScheduledTask | null = null;
let purgeJob: cron.ScheduledTask | null = null;
let mailRunning = false;

/** Délai au bout duquel une réclamation non suivie d'envoi expire (B7-R6). */
export const STOCK_ALERT_CLAIM_TIMEOUT_MS = 30 * 60 * 1000;
/** Âge des clés d'idempotence purgées (B3-R2). */
export const STOCK_CLIENT_REQUEST_RETENTION_DAYS = 30;

const EVENT_KEY = 'STOCK_ALERT_AGENCY' as const;

export type StockAlertSkipReason = 'DISABLED' | 'NO_FEATURE' | 'NO_RECIPIENT';

export interface StockAlertMailReport {
  tenants: number;
  claimed: number;
  sent: number;
  skipped: Record<StockAlertSkipReason, number>;
  /** Alertes réclamées dont aucun envoi n'a abouti (repartiront après 30 minutes). */
  failed: number;
  failedTenants: number;
}

interface StockAlertRecipient {
  email: string;
  language: Language;
}

// ---------------------------------------------------------------------------
// Lectures et écritures
// ---------------------------------------------------------------------------

/** Lecture TRANSVERSE assumée (hors contexte d'agence) : agences ayant des alertes non envoyées. */
export async function listTenantsWithUnsentStockAlerts(): Promise<string[]> {
  const rows = await prisma.stockAlert.findMany({
    where: { emailSentAt: null },
    distinct: ['tenantId'],
    select: { tenantId: true }
  });
  return rows.map(row => row.tenantId);
}

/**
 * Réclame les alertes non envoyées de l'agence : mise à jour conditionnelle,
 * atomique. Une alerte réclamée depuis moins de 30 minutes n'est pas reprise.
 */
export async function claimStockAlertsForMail(tenantId: string, now: Date): Promise<string[]> {
  const claimedAt = now.toISOString();
  const expiredBefore = new Date(now.getTime() - STOCK_ALERT_CLAIM_TIMEOUT_MS).toISOString();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE stock_alerts
       SET email_claimed_at = (${claimedAt}::timestamptz AT TIME ZONE 'UTC')
     WHERE tenant_id = ${tenantId}
       AND email_sent_at IS NULL
       AND (email_claimed_at IS NULL OR email_claimed_at < (${expiredBefore}::timestamptz AT TIME ZONE 'UTC'))
    RETURNING id::text AS id`;
  return rows.map(row => row.id);
}

/** Marque des alertes réclamées comme envoyées (ou sans objet, avec la raison). */
async function markStockAlertsMailed(
  tenantId: string,
  ids: string[],
  now: Date,
  reason: StockAlertSkipReason | null
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await prisma.stockAlert.updateMany({
    where: { tenantId, id: { in: ids } },
    data: { emailSentAt: now, emailSkippedReason: reason }
  });
}

/**
 * Destinataires lus EN BASE (B1-R6) : rôles d'agence portant les DEUX droits,
 * puis comptes actifs et membres actifs de l'agence.
 */
export async function resolveStockAlertRecipients(tenantId: string): Promise<StockAlertRecipient[]> {
  const links = await prisma.userRole.findMany({
    where: { tenantId, role: { scope: 'TENANT' } },
    select: {
      userId: true,
      role: { select: { permissions: { select: { permission: { select: { key: true } } } } } }
    }
  });
  const keysByUser = new Map<string, Set<string>>();
  for (const link of links) {
    const keys = keysByUser.get(link.userId) ?? new Set<string>();
    for (const rolePermission of link.role?.permissions ?? []) {
      keys.add(rolePermission.permission.key);
    }
    keysByUser.set(link.userId, keys);
  }
  const userIds = [...keysByUser]
    .filter(([, keys]) => keys.has('STOCK_ALERTS_VIEW') && keys.has('STOCK_VALUES_VIEW'))
    .map(([userId]) => userId);
  if (userIds.length === 0) {
    return [];
  }
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true, memberships: { some: { tenantId, status: 'ACTIVE' } } },
    select: { email: true, preferredLanguage: true }
  });
  return users
    .filter(user => Boolean(user.email))
    .map(user => ({
      email: user.email,
      language: isLanguage(user.preferredLanguage) ? user.preferredLanguage : DEFAULT_LANGUAGE
    }));
}

/** CONSTRUCTION ouverte ? Hors mode `enforce`, ou en panne du calcul des droits : oui. */
async function hasConstructionFeature(tenantId: string): Promise<boolean> {
  try {
    const entitlements = await getEntitlements(tenantId);
    if (entitlements.enforcement !== 'enforce') {
      return true;
    }
    return evaluateFeatureAccess(entitlements, 'CONSTRUCTION', false).allowed;
  } catch (error) {
    logger.error('Alertes de stock : droits indisponibles, fonctionnalité supposée ouverte', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Récapitulatif
// ---------------------------------------------------------------------------

/**
 * Une ligne par alerte : titre neutre, lieu ou chantier, montant. Jamais de
 * nom de personne. Les destinataires détiennent STOCK_VALUES_VIEW : le montant
 * leur est montré.
 */
export function buildStockAlertSummaryLines(rows: StockAlertRow[]): string[] {
  return rows.map(row => {
    const place = row.location?.label ?? row.site?.name ?? null;
    const amount = toAmount(row.amount);
    return [buildAlertTitle(row.kind), place, amount !== null ? formatAlertAmount(amount, row.currency) : null]
      .filter((part): part is string => Boolean(part))
      .join(' — ');
  });
}

function controlUrl(tenantId: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/tenant/${encodeURIComponent(tenantId)}/finance/stock/controle`;
}

/** Envoie le récapitulatif à chaque destinataire, dans sa langue. Renvoie le nombre d'envois réussis. */
async function sendSummary(
  tenantId: string,
  agencyName: string,
  rows: StockAlertRow[],
  recipients: StockAlertRecipient[],
  config: { subjectOverride: string | null; bodyHtmlOverride: string | null }
): Promise<number> {
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[EVENT_KEY];
  let delivered = 0;
  for (const recipient of recipients) {
    const lines = runWithLanguage(recipient.language, () => buildStockAlertSummaryLines(rows));
    const variables = {
      agencyName,
      alertsCount: String(rows.length),
      alertsSummary: lines.join('\n'),
      controlUrl: controlUrl(tenantId)
    };
    const bodyVariables = {
      agencyName: escapeHtml(agencyName),
      alertsCount: variables.alertsCount,
      alertsSummary: lines.map(line => escapeHtml(line)).join('<br/>'),
      controlUrl: escapeHtml(variables.controlUrl)
    };
    try {
      await emailService.sendEmail({
        to: recipient.email,
        subject: applyTemplate(config.subjectOverride || defaults.subject, { ...variables, alertsSummary: '' }),
        html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables),
        tenantId
      });
      delivered += 1;
    } catch (error) {
      logger.warn('Alertes de stock : envoi échoué pour un destinataire', {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return delivered;
}

/** Traite une agence, dans son contexte. */
export async function mailStockAlertsForTenant(
  tenantId: string,
  now: Date,
  report: StockAlertMailReport
): Promise<void> {
  const claimed = await claimStockAlertsForMail(tenantId, now);
  if (claimed.length === 0) {
    return;
  }
  report.claimed += claimed.length;

  const skip = async (reason: StockAlertSkipReason): Promise<void> => {
    await markStockAlertsMailed(tenantId, claimed, now, reason);
    report.skipped[reason] += claimed.length;
  };

  const config = await getEmailNotificationConfig(tenantId, EVENT_KEY);
  if (!config.enabled) {
    return skip('DISABLED');
  }
  if (!(await hasConstructionFeature(tenantId))) {
    return skip('NO_FEATURE');
  }
  const recipients = await resolveStockAlertRecipients(tenantId);
  if (recipients.length === 0) {
    return skip('NO_RECIPIENT');
  }

  const [rows, tenant] = await Promise.all([
    prisma.stockAlert.findMany({
      where: { tenantId, id: { in: claimed } },
      select: ALERT_SELECT,
      orderBy: [{ raisedAt: 'asc' }, { id: 'asc' }]
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  ]);
  if (rows.length === 0) {
    return;
  }
  const delivered = await sendSummary(tenantId, tenant?.name ?? '', rows, recipients, config);
  if (delivered === 0) {
    // Réclamation laissée en place : les alertes repartent après 30 minutes.
    report.failed += rows.length;
    return;
  }
  await markStockAlertsMailed(
    tenantId,
    rows.map(row => row.id),
    now,
    null
  );
  report.sent += rows.length;
}

/** Un passage de l'envoi : toutes les agences concernées, une à la fois. */
export async function runStockAlertMail(now: Date = new Date()): Promise<StockAlertMailReport> {
  const tenantIds = await listTenantsWithUnsentStockAlerts();
  const report: StockAlertMailReport = {
    tenants: tenantIds.length,
    claimed: 0,
    sent: 0,
    skipped: { DISABLED: 0, NO_FEATURE: 0, NO_RECIPIENT: 0 },
    failed: 0,
    failedTenants: 0
  };
  for (const tenantId of tenantIds) {
    try {
      await runWithTenantContext({ tenantId }, () => mailStockAlertsForTenant(tenantId, now, report));
    } catch (error) {
      report.failedTenants += 1;
      logger.error('Alertes de stock : envoi impossible pour une agence', {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (report.claimed > 0 || report.failedTenants > 0) {
    logger.info('Alertes de stock : passage terminé', report);
  }
  return report;
}

// ---------------------------------------------------------------------------
// Purge des clés d'idempotence (B3-R2)
// ---------------------------------------------------------------------------

/** Supprime les clés d'idempotence du stock de plus de 30 jours, toutes agences (suppression transverse assumée). */
export async function purgeStockClientRequests(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STOCK_CLIENT_REQUEST_RETENTION_DAYS * 86_400_000).toISOString();
  const deleted = await prisma.$executeRaw`
    DELETE FROM stock_client_requests
     WHERE created_at < (${cutoff}::timestamptz AT TIME ZONE 'UTC')`;
  logger.info('Clés d’idempotence du stock purgées', { deleted });
  return deleted;
}

// ---------------------------------------------------------------------------
// Planification
// ---------------------------------------------------------------------------

/**
 * Démarre la tâche. La purge nocturne est toujours planifiée ; l'envoi des
 * alertes seulement si `mailEnabled` (`env.STOCK_ALERT_MAIL_JOB_ENABLED`).
 */
export function startStockMaintenanceJob(options: { mailEnabled: boolean } = { mailEnabled: false }): void {
  if (purgeJob || mailJob) {
    logger.warn('Stock maintenance job is already running');
    return;
  }
  purgeJob = cron.schedule(
    '0 3 * * *',
    async () => {
      try {
        await purgeStockClientRequests();
      } catch (error) {
        logger.error('Error in stock idempotency purge', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
    { timezone: 'UTC' }
  );
  if (options.mailEnabled) {
    mailJob = cron.schedule(
      '*/10 * * * *',
      async () => {
        if (mailRunning) {
          return;
        }
        mailRunning = true;
        try {
          await runStockAlertMail();
        } catch (error) {
          logger.error('Error in stock alert mail job', {
            error: error instanceof Error ? error.message : String(error)
          });
        } finally {
          mailRunning = false;
        }
      },
      { timezone: 'UTC' }
    );
  }
  logger.info(
    `Stock maintenance job started (purge daily at 3:00 AM UTC${options.mailEnabled ? ', alert e-mails every 10 minutes' : ''})`
  );
}

export function stopStockMaintenanceJob(): void {
  mailJob?.stop();
  purgeJob?.stop();
  mailJob = null;
  purgeJob = null;
  logger.info('Stock maintenance job stopped');
}
