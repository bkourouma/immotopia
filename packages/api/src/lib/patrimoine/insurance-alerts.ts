import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { MARKER_KIND, alreadyMarkedEntityIds, markNotified, type MarkerKind } from '../notification-markers';
import { applyTemplate, escapeHtml } from './notification-channels';
import { MAINTENANCE_LOG_CATEGORY_LABELS } from './insurance/labels';

/**
 * Alertes d'échéance assurance et entretien (lot B1, spec 032) : polices
 * d'assurance arrivant à terme, prochaine échéance d'entretien et fin de
 * garantie d'une intervention du carnet.
 *
 * Patron de `alertLoanMaturity` (`notifications.ts`, dont les helpers sont
 * privés : dupliqués ici). Les destinataires sont les administrateurs actifs
 * de l'agence (rôle `TENANT_ADMIN`, repli sur `Tenant.contactEmail`) : des
 * utilisateurs internes, pas des contacts CRM avec consentement. Le routeur de
 * canaux (`notification-channels.ts`, WhatsApp opt-in par contact) n'est donc
 * PAS appliqué : e-mail seul, une seule clé `INSURANCE_DEADLINE_ALERT` pour les
 * trois alertes, distinguées par des variables de gabarit.
 *
 * Anti-doublon par `AuditLog` (pas de colonne dédiée, comme les alertes
 * bail/prêt/travaux) : `entityId = ${id}::${KIND}::${AAAA-MM-JJ}` avec KIND =
 * POLICY | DUE | WARRANTY, écrit puis vidé (flush) juste après chaque envoi.
 * Une échéance repoussée produit une nouvelle marque, donc une nouvelle alerte.
 * Événement e-mail désactivé : rien n'est envoyé ni marqué. Un échec d'envoi ne
 * marque rien (nouvel essai le lendemain).
 */

export interface InsuranceAlertResult {
  matched: number;
  sent: number;
  skippedNoRecipient: number;
  skippedAlreadySent: number;
  failed: number;
}

type AlertKind = 'POLICY' | 'DUE' | 'WARRANTY';

interface AlertItem {
  id: string;
  kind: AlertKind;
  date: Date;
  propertyReference: string;
  itemLabel: string;
  alertTitle: string;
}

interface AlertOptions {
  daysAhead?: number;
  now?: Date;
}

const EVENT_KEY = 'INSURANCE_DEADLINE_ALERT' as const;

const ALERT_TITLES: Record<AlertKind, string> = {
  POLICY: "Police d'assurance bientôt échue",
  DUE: "Prochaine échéance d'entretien",
  WARRANTY: 'Fin de garantie proche'
};

const emptyResult = (): InsuranceAlertResult => ({
  matched: 0,
  sent: 0,
  skippedNoRecipient: 0,
  skippedAlreadySent: 0,
  failed: 0
});

/**
 * Fenêtre [début du jour UTC de `now`, fin du jour J+`daysAhead`[ : `to` est le
 * début du jour J+`daysAhead`+1, borne EXCLUSIVE (`lt`), pour inclure une
 * échéance horodatée en cours de journée J+`daysAhead`.
 */
function alertWindow(options?: AlertOptions): { from: Date; to: Date; daysAhead: number } {
  const daysAhead = options?.daysAhead ?? 30;
  const now = options?.now ?? new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + daysAhead + 1);
  return { from, to, daysAhead };
}

const inWindow = (date: Date | null, from: Date, to: Date): date is Date => !!date && date >= from && date < to;

const alertKey = (item: AlertItem): string => `${item.id}::${item.kind}::${item.date.toISOString().slice(0, 10)}`;

interface AdminRecipient {
  email: string;
  fullName: string | null;
}

/** Administrateurs actifs de l'agence, repli `Tenant.contactEmail` (même requête que `notifications.ts`). */
async function resolveAgencyAdminRecipients(tenantId: string): Promise<AdminRecipient[]> {
  const role = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' }, select: { id: true } });
  if (role) {
    const links = await prisma.userRole.findMany({ where: { tenantId, roleId: role.id }, select: { userId: true } });
    const ids = [...new Set(links.map(link => link.userId))];
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

type AlertConfig = Awaited<ReturnType<typeof getEmailNotificationConfig>>;

interface BatchTarget {
  kind: MarkerKind;
  entityType: string;
  caller: string;
}

/** Envoie l'e-mail d'une échéance à chaque destinataire ; retourne le nombre de livraisons réussies. */
async function deliverItem(
  tenantId: string,
  item: AlertItem,
  recipients: AdminRecipient[],
  config: AlertConfig,
  caller: string
): Promise<number> {
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[EVENT_KEY];
  const variables = {
    alertTitle: item.alertTitle,
    itemLabel: item.itemLabel,
    propertyReference: item.propertyReference,
    dueDate: item.date.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
  };
  const bodyVariables = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, escapeHtml(value)]));

  let delivered = 0;
  for (const recipient of recipients) {
    try {
      await emailService.sendEmail({
        to: recipient.email,
        subject: applyTemplate(config.subjectOverride || defaults.subject, variables),
        html: applyTemplate(config.bodyHtmlOverride || defaults.bodyHtml, bodyVariables),
        tenantId
      });
      delivered += 1;
    } catch (error) {
      logger.warn(`${caller}: envoi échoué pour un destinataire`, {
        itemId: item.id,
        kind: item.kind,
        email: recipient.email,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return delivered;
}

/** Cœur commun aux deux alertes : anti-doublon, envoi, marque anti-doublon immédiate. */
async function processItems(
  tenantId: string,
  items: AlertItem[],
  target: BatchTarget,
  daysAhead: number,
  config: AlertConfig
): Promise<InsuranceAlertResult> {
  const alreadySent = await alreadyMarkedEntityIds(tenantId, target.kind, target.entityType, items.map(alertKey));
  const recipients = await resolveAgencyAdminRecipients(tenantId);
  const result = { ...emptyResult(), matched: items.length };

  for (const item of items) {
    const key = alertKey(item);
    if (alreadySent.has(key)) {
      result.skippedAlreadySent += 1;
    } else if (recipients.length === 0) {
      result.skippedNoRecipient += 1;
    } else if ((await deliverItem(tenantId, item, recipients, config, target.caller)) > 0) {
      result.sent += 1;
      // Marque immédiate : borne le renvoi, en cas de plantage, à une seule échéance.
      await markNotified(tenantId, target.kind, target.entityType, key, {
        id: item.id,
        kind: item.kind,
        dueDate: item.date.toISOString()
      });
    } else {
      result.failed += 1;
    }
  }

  logger.info(`${target.caller} completed`, { tenantId, daysAhead, ...result });
  return result;
}

/** Polices d'assurance dont `endDate` tombe dans la fenêtre. */
export async function alertExpiringInsurancePolicies(
  tenantId: string,
  options?: AlertOptions
): Promise<InsuranceAlertResult> {
  const { from, to, daysAhead } = alertWindow(options);
  const config = await getEmailNotificationConfig(tenantId, EVENT_KEY);
  if (!config.enabled) return emptyResult();

  const policies = await prisma.insurancePolicy.findMany({
    where: { tenantId, endDate: { gte: from, lt: to } },
    select: {
      id: true,
      insurer: true,
      policyNumber: true,
      endDate: true,
      property: { select: { internalReference: true } }
    }
  });
  const items: AlertItem[] = policies.map(policy => ({
    id: policy.id,
    kind: 'POLICY',
    date: policy.endDate,
    propertyReference: policy.property?.internalReference ?? '',
    itemLabel: `${policy.insurer} · n° ${policy.policyNumber}`,
    alertTitle: ALERT_TITLES.POLICY
  }));
  return processItems(
    tenantId,
    items,
    {
      kind: MARKER_KIND.insurancePolicy,
      entityType: 'InsurancePolicy',
      caller: 'alertExpiringInsurancePolicies'
    },
    daysAhead,
    config
  );
}

/** Entrées du carnet d'entretien dont la prochaine échéance ou la fin de garantie tombe dans la fenêtre. */
export async function alertMaintenanceDeadlines(
  tenantId: string,
  options?: AlertOptions
): Promise<InsuranceAlertResult> {
  const { from, to, daysAhead } = alertWindow(options);
  const config = await getEmailNotificationConfig(tenantId, EVENT_KEY);
  if (!config.enabled) return emptyResult();

  const entries = await prisma.maintenanceLogEntry.findMany({
    where: {
      tenantId,
      OR: [{ nextDueDate: { gte: from, lt: to } }, { warrantyEndDate: { gte: from, lt: to } }]
    },
    select: {
      id: true,
      category: true,
      description: true,
      nextDueDate: true,
      warrantyEndDate: true,
      property: { select: { internalReference: true } }
    }
  });

  const items: AlertItem[] = [];
  for (const entry of entries) {
    const base = {
      id: entry.id,
      propertyReference: entry.property?.internalReference ?? '',
      itemLabel: `${MAINTENANCE_LOG_CATEGORY_LABELS[entry.category] ?? entry.category} : ${entry.description.slice(0, 120)}`
    };
    if (inWindow(entry.nextDueDate, from, to)) {
      items.push({ ...base, kind: 'DUE', date: entry.nextDueDate, alertTitle: ALERT_TITLES.DUE });
    }
    if (inWindow(entry.warrantyEndDate, from, to)) {
      items.push({ ...base, kind: 'WARRANTY', date: entry.warrantyEndDate, alertTitle: ALERT_TITLES.WARRANTY });
    }
  }
  return processItems(
    tenantId,
    items,
    {
      kind: MARKER_KIND.maintenanceDue,
      entityType: 'MaintenanceLogEntry',
      caller: 'alertMaintenanceDeadlines'
    },
    daysAhead,
    config
  );
}

/** Les deux alertes, résultat agrégé (appelé par `jobs/document-expiry-alert-job.ts`). */
export async function runInsuranceAlerts(tenantId: string, options?: AlertOptions): Promise<InsuranceAlertResult> {
  const policies = await alertExpiringInsurancePolicies(tenantId, options);
  const maintenance = await alertMaintenanceDeadlines(tenantId, options);
  return {
    matched: policies.matched + maintenance.matched,
    sent: policies.sent + maintenance.sent,
    skippedNoRecipient: policies.skippedNoRecipient + maintenance.skippedNoRecipient,
    skippedAlreadySent: policies.skippedAlreadySent + maintenance.skippedAlreadySent,
    failed: policies.failed + maintenance.failed
  };
}
