import { LandRegularizationStatus, LandStepStatus } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { logAuditEvent, flushAuditEvents } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { applyTemplate, escapeHtml } from './notification-channels';
import { translateStepLabel, translateTrackLabel } from './land/tracks';
import { startOfUtcDay } from './land/transitions';

/**
 * Relance des etapes de regularisation fonciere en retard (spec 033, lot B2).
 *
 * Meme famille que `alertLoanMaturity` / `alertUpcomingWorks`
 * (`lib/patrimoine/notifications.ts`) : alerte operationnelle interne, envoyee
 * aux administrateurs actifs de l'agence (aucun consentement CRM a verifier),
 * anti-doublon par `AuditLog` -- voir le commentaire de tete de ce fichier pour
 * le raisonnement (pas de colonne `warningSentAt` sur ces modeles, lecture puis
 * ecriture non atomique mais job quotidien sequentiel).
 *
 * Perimetre : etapes `A_FAIRE` ou `EN_COURS` dont `dueDate` est anterieure au
 * debut du jour UTC courant (une echeance du jour n'est pas encore en retard),
 * d'un dossier lui-meme `EN_COURS` (un dossier termine ou abandonne n'est plus
 * relance). La marque `<stepId>::<AAAA-MM-JJ de l'echeance>` fait qu'une
 * echeance deplacee redeclenche une relance, et qu'une meme echeance n'en
 * declenche qu'une.
 */

type AlertReport = {
  matched: number;
  sent: number;
  skippedNoRecipient: number;
  skippedAlreadySent: number;
  failed: number;
};

type EmailConfig = { subjectOverride: string | null; bodyHtmlOverride: string | null };

const EVENT_KEY = 'LAND_STEP_OVERDUE_ALERT' as const;
const DAY_MS = 24 * 60 * 60 * 1000;

interface AgencyAdminRecipient {
  email: string;
  fullName: string | null;
}

/**
 * Administrateurs actifs de l'agence (role `TENANT_ADMIN`, membre ACTIF de
 * l'agence), repli sur `Tenant.contactEmail` : variante de
 * `resolveAgencyAdminRecipients` (`notifications.ts`), privee et hors du
 * perimetre de ce lot.
 */
async function resolveAgencyAdminRecipients(tenantId: string): Promise<AgencyAdminRecipient[]> {
  const role = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' }, select: { id: true } });
  if (role) {
    const links = await prisma.userRole.findMany({ where: { tenantId, roleId: role.id }, select: { userId: true } });
    const ids = [...new Set(links.map(link => link.userId))];
    if (ids.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true, memberships: { some: { tenantId, status: 'ACTIVE' } } },
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

/** Marque composee id + echeance : une echeance deplacee peut redeclencher une relance. */
function dateAlertKey(entityId: string, date: Date): string {
  return `${entityId}::${date.toISOString().slice(0, 10)}`;
}

async function alreadyAlertedKeys(tenantId: string, candidateKeys: string[]): Promise<Set<string>> {
  if (candidateKeys.length === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      actionKey: AuditActionKey.PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT,
      entityType: 'LandRegularizationStep',
      entityId: { in: candidateKeys }
    },
    select: { entityId: true }
  });
  return new Set(rows.map(row => row.entityId));
}

/** Jours de retard : jours calendaires UTC entre l'echeance et aujourd'hui (>= 1 par construction). */
function daysOverdue(today: Date, dueDate: Date): number {
  return Math.round((today.getTime() - startOfUtcDay(dueDate).getTime()) / DAY_MS);
}

function regularizationUrl(tenantId: string, regularizationId: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/tenant/${encodeURIComponent(tenantId)}/patrimoine/land/${encodeURIComponent(regularizationId)}`;
}

/** Etapes ouvertes, echues avant aujourd'hui, d'un dossier en cours de ce tenant. */
function findOverdueSteps(tenantId: string, today: Date) {
  return prisma.landRegularizationStep.findMany({
    where: {
      tenantId,
      status: { in: [LandStepStatus.A_FAIRE, LandStepStatus.EN_COURS] },
      dueDate: { lt: today },
      regularization: { tenantId, status: LandRegularizationStatus.EN_COURS }
    },
    select: {
      id: true,
      stepKey: true,
      label: true,
      dueDate: true,
      regularization: {
        select: { id: true, track: true, property: { select: { internalReference: true } } }
      }
    }
  });
}

type OverdueStep = Awaited<ReturnType<typeof findOverdueSteps>>[number];
type DatedOverdueStep = OverdueStep & { dueDate: Date };

/** Ecarte par prudence une etape sans echeance (la requete n'en renvoie pas). */
function withDueDate(steps: OverdueStep[]): DatedOverdueStep[] {
  return steps.filter((step): step is DatedOverdueStep => step.dueDate !== null);
}

/** Variables du gabarit, en texte brut : echappees a l'insertion dans le corps HTML. */
function buildVariables(tenantId: string, agencyName: string, step: DatedOverdueStep, today: Date) {
  const { regularization } = step;
  return {
    agencyName,
    propertyReference: regularization.property?.internalReference ?? '',
    trackLabel: translateTrackLabel(regularization.track),
    stepLabel: translateStepLabel(step.stepKey, step.label),
    dueDate: step.dueDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' }),
    daysOverdue: String(daysOverdue(today, step.dueDate)),
    regularizationUrl: regularizationUrl(tenantId, regularization.id)
  };
}

/** Envoie le meme message a chaque administrateur ; un echec individuel est journalise sans interrompre les autres. */
async function sendToRecipients(
  tenantId: string,
  recipients: AgencyAdminRecipient[],
  config: EmailConfig,
  variables: Record<string, string>,
  stepId: string
): Promise<number> {
  const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[EVENT_KEY];
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
      logger.warn('alertOverdueLandSteps: envoi echoue pour un destinataire', {
        stepId,
        email: recipient.email,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return delivered;
}

/** Pose la marque anti-doublon de l'etape (flush immediat : fenetre de perte bornee a une etape). */
async function markAlerted(tenantId: string, step: DatedOverdueStep, alertKey: string): Promise<void> {
  logAuditEvent({
    tenantId,
    actionKey: AuditActionKey.PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT,
    entityType: 'LandRegularizationStep',
    entityId: alertKey,
    payload: { stepId: step.id, regularizationId: step.regularization.id, dueDate: step.dueDate.toISOString() }
  });
  await flushAuditEvents();
}

type StepOutcome = 'sent' | 'skippedNoRecipient' | 'skippedAlreadySent' | 'failed';

interface AlertContext {
  tenantId: string;
  agencyName: string;
  today: Date;
  recipients: AgencyAdminRecipient[];
  alreadySent: Set<string>;
  config: EmailConfig;
}

/** Traite une etape : anti-doublon, destinataires, envoi, marque. */
async function alertOneStep(context: AlertContext, step: DatedOverdueStep): Promise<StepOutcome> {
  const alertKey = dateAlertKey(step.id, step.dueDate);
  if (context.alreadySent.has(alertKey)) return 'skippedAlreadySent';
  if (context.recipients.length === 0) return 'skippedNoRecipient';

  const variables = buildVariables(context.tenantId, context.agencyName, step, context.today);
  const delivered = await sendToRecipients(context.tenantId, context.recipients, context.config, variables, step.id);
  if (delivered === 0) return 'failed';
  await markAlerted(context.tenantId, step, alertKey);
  return 'sent';
}

async function buildContext(
  tenantId: string,
  today: Date,
  config: EmailConfig,
  steps: DatedOverdueStep[]
): Promise<AlertContext> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const recipients = await resolveAgencyAdminRecipients(tenantId);
  const alreadySent = await alreadyAlertedKeys(
    tenantId,
    steps.map(step => dateAlertKey(step.id, step.dueDate))
  );
  return { tenantId, today, config, agencyName: tenant?.name ?? '', recipients, alreadySent };
}

/**
 * Alerte l'agence des etapes de regularisation fonciere en retard. Retourne la
 * meme forme que `alertLoanMaturity`.
 */
export async function alertOverdueLandSteps(tenantId: string, options?: { now?: Date }): Promise<AlertReport> {
  const today = startOfUtcDay(options?.now ?? new Date());

  const config = await getEmailNotificationConfig(tenantId, EVENT_KEY);
  if (!config.enabled) {
    return { matched: 0, sent: 0, skippedNoRecipient: 0, skippedAlreadySent: 0, failed: 0 };
  }

  const steps = withDueDate(await findOverdueSteps(tenantId, today));
  const context = await buildContext(tenantId, today, config, steps);

  const report: AlertReport = {
    matched: steps.length,
    sent: 0,
    skippedNoRecipient: 0,
    skippedAlreadySent: 0,
    failed: 0
  };
  for (const step of steps) {
    report[await alertOneStep(context, step)] += 1;
  }

  await flushAuditEvents();
  logger.info('alertOverdueLandSteps completed', { tenantId, ...report });
  return report;
}
