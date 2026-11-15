import * as cron from 'node-cron';
import type { AssistantScheduledReport } from '@prisma/client';
import { assistantLanguageFor, runWithAssistantLanguage, t } from '../i18n';
import { AppError, ForbiddenError, NotFoundError } from '../middleware/error-middleware';
import { resolveAvailableTools } from '../lib/ai/access-scope';
import { assertAnalysisCollaborator } from '../lib/ai/analysis-shares';
import { readArtifactVersions } from '../lib/ai/artifact-versions';
import { replayArtifact } from '../lib/ai/artifact-replay';
import { buildArtifactCsv, buildArtifactXlsx } from '../lib/ai/artifact-spreadsheet';
import { buildArtifactPdf } from '../lib/ai/artifact-pdf';
import { assistantScope, resolveSavedAssistantScope } from '../lib/ai/conversations';
import { nextReportRun, reportSchedule } from '../lib/ai/report-schedule';
import { getLlmProvider } from '../lib/ai/providers';
import { evaluateFeatureAccess } from '../lib/subscription/feature-access';
import { getSubscriptionEnforcement } from '../lib/subscription/enforcement';
import { getEntitlements } from '../services/subscription-v2-service';
import { writeAssistantNotification } from '../lib/ai/in-app-notification';
import { emailService, isEmailDeliveryConfigured } from '../services/email-service';
import { prisma } from '../utils/database';
import { withJobLock } from '../utils/job-lock';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';

const exporters = { csv: buildArtifactCsv, pdf: buildArtifactPdf, xlsx: buildArtifactXlsx };
type DeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED' | 'UNKNOWN';

async function assertOwner(report: AssistantScheduledReport) {
  await assertAnalysisCollaborator(report.tenantId, report.ownerId);
  if (
    getSubscriptionEnforcement() === 'enforce' &&
    !evaluateFeatureAccess(await getEntitlements(report.tenantId, { fresh: true }), 'CORE', false).allowed
  ) {
    throw new ForbiddenError();
  }
  const owner = await resolveAvailableTools(report.ownerId, report.tenantId, true);
  if (!owner.tools.length) throw new ForbiddenError();
  return owner;
}

async function readReportSource(report: AssistantScheduledReport, owner: Awaited<ReturnType<typeof assertOwner>>) {
  const identity = { tenantId: report.tenantId, ownerId: report.ownerId };
  const scopeKey = await resolveSavedAssistantScope(
    identity,
    owner.permissions,
    owner.tools.map(tool => tool.name)
  );
  return readArtifactVersions(
    { ...identity, conversationId: report.conversationId, artifactId: report.artifactId },
    scopeKey
  );
}

async function deliver(report: AssistantScheduledReport, dueAt: Date, recipientId: string): Promise<DeliveryStatus> {
  const { tenantId, conversationId } = report;
  const key = { tenantId, reportId: report.id, dueAt, recipientId };
  const previous = await prisma.assistantReportDelivery.findFirst({ where: key, select: { status: true } });
  if (previous) {
    // An interrupted SMTP attempt may have succeeded. Leave its status unknown
    // and never submit the same occurrence to SMTP twice.
    return previous.status as DeliveryStatus;
  }
  const current = { tenantId, id: report.id, active: true, nextRunAt: dueAt };
  await assertAnalysisCollaborator(tenantId, recipientId);
  const [owner, recipient, account] = await Promise.all([
    assertOwner(report),
    resolveAvailableTools(recipientId, tenantId, true),
    prisma.user.findFirst({
      where: {
        id: recipientId,
        isActive: true,
        emailVerified: true,
        memberships: { some: { tenantId, status: 'ACTIVE' } }
      },
      select: { email: true, preferredLanguage: true, preferredAssistantLanguage: true }
    })
  ]);
  if (!account?.email) return 'SKIPPED';
  const stored = await readReportSource(report, owner);
  const permissions = new Set([...recipient.permissions].filter(permission => owner.permissions.has(permission)));
  const tools = recipient.tools.filter(tool => owner.tools.some(source => source.name === tool.name));
  const language = assistantLanguageFor(account);
  return runWithAssistantLanguage(language, async () => {
    const artifact = await replayArtifact(
      stored.artifact,
      { tenantId, userId: recipientId, conversationId, permissions, tools },
      true
    );
    const attachments = [];
    for (const format of report.formats) {
      if (!Object.prototype.hasOwnProperty.call(exporters, format)) {
        throw new AppError(t('Format de rapport invalide.'), 422);
      }
      const content = await exporters[format as keyof typeof exporters](artifact);
      attachments.push({ filename: `ImmoTopia.${format}`, content });
    }
    await assertAnalysisCollaborator(tenantId, recipientId);
    const [currentOwner, currentRecipient, currentAccount] = await Promise.all([
      assertOwner(report),
      resolveAvailableTools(recipientId, tenantId, true),
      prisma.user.findFirst({
        where: {
          id: recipientId,
          isActive: true,
          emailVerified: true,
          memberships: { some: { tenantId, status: 'ACTIVE' } }
        },
        select: { email: true }
      })
    ]);
    const fingerprint = (access: typeof owner) =>
      assistantScope(
        access.permissions,
        access.tools.map(tool => tool.name)
      );
    if (
      currentAccount?.email !== account.email ||
      fingerprint(currentOwner) !== fingerprint(owner) ||
      fingerprint(currentRecipient) !== fingerprint(recipient)
    )
      return 'SKIPPED';
    const reserved = await prisma.$executeRaw`
      INSERT INTO assistant_report_deliveries (tenant_id, report_id, due_at, recipient_id, status)
      SELECT tenant_id, id, next_run_at, ${recipientId}, 'UNKNOWN'
      FROM assistant_scheduled_reports
      WHERE tenant_id = ${current.tenantId} AND id = ${current.id} AND active AND next_run_at = ${current.nextRunAt}
      FOR SHARE
      ON CONFLICT DO NOTHING
    `;
    if (!reserved) return 'SKIPPED';
    let status: DeliveryStatus = 'UNKNOWN';
    try {
      const result = await emailService.sendEmail({
        tenantId,
        to: account.email,
        subject: t('Votre rapport ImmoTopia'),
        text: report.immediateKey
          ? [t('Vous trouverez votre rapport en pièce jointe.'), report.message].filter(Boolean).join('\n\n')
          : t('Vous trouverez le rapport programmé en pièce jointe.'),
        attachments,
        redactRecipient: true
      });
      status = result.sent ? 'SENT' : 'FAILED';
    } catch (error) {
      logger.warn('Assistant report delivery attempt unconfirmed', {
        tenantId,
        reportId: report.id,
        errorType: (error as Error)?.name
      });
    }
    await prisma.assistantReportDelivery.updateMany({ where: key, data: { status } });
    return status;
  });
}

async function processReport(report: AssistantScheduledReport, now: Date) {
  const { tenantId, id, nextRunAt: dueAt } = report;
  if (!dueAt) return;
  const current = { tenantId, id, active: true, nextRunAt: dueAt };
  const schedule = reportSchedule.safeParse(report.schedule);
  let status = report.immediateKey ? 'FAILED' : 'PAUSED';
  let nextRunAt: Date | null = null;
  try {
    if (!report.immediateKey && !schedule.success) throw new NotFoundError();
    await readReportSource(report, await assertOwner(report));
    nextRunAt = schedule.success ? nextReportRun(schedule.data, now) : null;
    const states: DeliveryStatus[] = [];
    for (const recipientId of report.recipientIds) {
      try {
        states.push(await deliver(report, dueAt, recipientId));
      } catch (error) {
        if (!(error instanceof AppError) || error.statusCode >= 500) throw error;
        states.push('SKIPPED');
      }
    }
    status =
      states.length && states.every(state => state === 'SENT')
        ? 'SENT'
        : states.includes('SENT')
          ? 'PARTIAL'
          : states.includes('UNKNOWN')
            ? 'UNKNOWN'
            : 'FAILED';
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode >= 500) throw error;
    nextRunAt = null;
  }
  await prisma.$transaction(async tx => {
    const currentResult = await tx.assistantScheduledReport.updateMany({
      where: current,
      data: { active: nextRunAt !== null, nextRunAt, lastRunAt: now, lastStatus: status }
    });
    if (!currentResult.count) return;
    const owner = await tx.user.findUnique({
      where: { id: report.ownerId },
      select: { id: true, fullName: true, preferredLanguage: true, preferredAssistantLanguage: true }
    });
    if (!owner) return;
    const language = assistantLanguageFor(owner);
    await writeAssistantNotification(tx, { tenantId, ownerId: owner.id }, owner, language, {
      senderUserId: null,
      key: 'ASSISTANT_REPORT_RESULT',
      title: report.immediateKey
        ? t('Envoi d’un rapport ImmoTopia', undefined, language)
        : t('Rapport programmé ImmoTopia', undefined, language),
      body:
        status === 'SENT'
          ? t('Le rapport a été envoyé.', undefined, language)
          : t('Certains envois du rapport restent à vérifier.', undefined, language),
      link: `/tenant/${encodeURIComponent(tenantId)}/assistant?rapports=1`,
      relatedEntityType: 'AssistantScheduledReport',
      relatedEntityId: id
    });
  });
}

export async function runAssistantReports(now = new Date()) {
  if (!isEmailDeliveryConfigured() || !(await getLlmProvider())) return;
  await withJobLock(
    'assistant-scheduled-reports',
    120_000,
    async () => {
      const due = await prisma.assistantScheduledReport.findMany({
        where: {
          active: true,
          nextRunAt: { lte: now },
          analysis: { conversation: { tenant: { status: 'ACTIVE', isActive: true } } }
        },
        orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
        take: 50
      });
      for (const report of due) {
        try {
          await runWithTenantContext({ tenantId: report.tenantId, userId: report.ownerId }, () =>
            processReport(report, now)
          );
        } catch (error) {
          logger.error('Assistant scheduled report failed', {
            tenantId: report.tenantId,
            reportId: report.id,
            errorType: (error as Error)?.name
          });
        }
      }
    },
    { failOpen: false }
  );
}

export function startAssistantReportJob() {
  cron.schedule(
    '* * * * *',
    () => {
      void runAssistantReports().catch(error =>
        logger.error('Assistant report job failed', { errorType: (error as Error)?.name })
      );
    },
    { timezone: 'UTC' }
  );
}
