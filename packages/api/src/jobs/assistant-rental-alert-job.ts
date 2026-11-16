import * as cron from 'node-cron';
import type { AssistantRentalAlert } from '@prisma/client';
import { assistantLanguageFor, t } from '../i18n';
import { assertAnalysisCollaborator } from '../lib/ai/analysis-shares';
import { writeAssistantNotification } from '../lib/ai/in-app-notification';
import { assertRentalAlertPermission, rentalAlertMatches, rentalAlertRule } from '../lib/ai/rental-alerts';
import { getSubscriptionEnforcement } from '../lib/subscription/enforcement';
import { evaluateFeatureAccess } from '../lib/subscription/feature-access';
import { AppError, ForbiddenError } from '../middleware/error-middleware';
import { getUserPermissions } from '../services/permission-service';
import { getEntitlements } from '../services/subscription-v2-service';
import { prisma } from '../utils/database';
import { withJobLock } from '../utils/job-lock';
import { logger } from '../utils/logger';
import { runWithTenantContext } from '../utils/tenant-context';

async function processAlert(alert: AssistantRentalAlert, now: Date) {
  const { id, tenantId, ownerId } = alert;
  const rule = rentalAlertRule.parse(alert.rule);
  const where = { id, tenantId, ownerId, nextCheckAt: alert.nextCheckAt };
  const nextCheckAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  async function authorize() {
    await assertAnalysisCollaborator(tenantId, ownerId);
    if (
      getSubscriptionEnforcement() === 'enforce' &&
      !evaluateFeatureAccess(await getEntitlements(tenantId, { fresh: true }), 'RENTAL', false).allowed
    )
      throw new ForbiddenError();
    assertRentalAlertPermission(new Set(await getUserPermissions(ownerId, tenantId, { fresh: true })), rule.kind);
  }
  try {
    await authorize();
    const matched = await rentalAlertMatches(tenantId, rule, now);
    const notify = matched && !alert.matched;
    if (notify) await authorize();
    const account = notify
      ? await prisma.user.findFirst({
          where: { id: ownerId, isActive: true, memberships: { some: { tenantId, status: 'ACTIVE' } } },
          select: { id: true, fullName: true, preferredLanguage: true, preferredAssistantLanguage: true }
        })
      : null;
    if (notify && !account) throw new ForbiddenError();
    await prisma.$transaction(async tx => {
      const updated = await tx.assistantRentalAlert.updateMany({ where, data: { matched, nextCheckAt } });
      if (!updated.count || !account) return;
      const language = assistantLanguageFor(account);
      const titles = {
        lease_expiry: t('Fin de bail à surveiller', undefined, language),
        declaration_pending: t('Déclaration locative en attente', undefined, language),
        overdue_rent: t('Seuil des impayés atteint', undefined, language)
      };
      await writeAssistantNotification(tx, { tenantId, ownerId }, account, language, {
        key: 'ASSISTANT_RENTAL_ALERT',
        title: titles[rule.kind],
        body: t('Ouvrez vos alertes locatives pour consulter la règle.', undefined, language),
        link: `/tenant/${encodeURIComponent(tenantId)}/assistant?alertes-locatives=1`,
        relatedEntityType: 'AssistantRentalAlert',
        relatedEntityId: id
      });
    });
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode >= 500) throw error;
    await prisma.assistantRentalAlert.updateMany({ where, data: { nextCheckAt } });
  }
}

export async function runAssistantRentalAlerts(now = new Date()) {
  await withJobLock(
    'assistant-rental-alerts',
    120_000,
    async () => {
      const alerts = await prisma.assistantRentalAlert.findMany({
        where: { nextCheckAt: { lte: now }, tenant: { status: 'ACTIVE', isActive: true } },
        orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
        take: 200
      });
      for (const alert of alerts) {
        try {
          await runWithTenantContext({ tenantId: alert.tenantId, userId: alert.ownerId }, () =>
            processAlert(alert, now)
          );
        } catch (error) {
          logger.error('Assistant rental alert check failed', {
            tenantId: alert.tenantId,
            alertId: alert.id,
            errorType: (error as Error)?.name
          });
          // Advance only the failing row so it cannot starve the other checks.
          await prisma.assistantRentalAlert.updateMany({
            where: { tenantId: alert.tenantId, id: alert.id, nextCheckAt: alert.nextCheckAt },
            data: { nextCheckAt: new Date(now.getTime() + 30 * 60_000) }
          });
        }
      }
    },
    { failOpen: false }
  );
}

export function startAssistantRentalAlertJob() {
  cron.schedule(
    '*/15 * * * *',
    () => {
      void runAssistantRentalAlerts().catch(error =>
        logger.error('Assistant rental alert job failed', { errorType: (error as Error)?.name })
      );
    },
    { timezone: 'UTC' }
  );
}
