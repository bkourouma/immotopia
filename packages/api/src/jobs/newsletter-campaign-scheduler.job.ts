/**
 * Newsletter campaign scheduler job – runs every minute.
 * Sends campaigns that are SCHEDULED and whose scheduled_at <= now.
 * @see specs/012-newsletter-mailing Phase 6
 */
import * as cron from 'node-cron';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { sendCampaign } from '../services/newsletter-campaign.service';

let job: cron.ScheduledTask | null = null;

export async function runNewsletterCampaignScheduler(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const campaigns = await prisma.newsletterCampaign.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now }
    }
  });

  let sent = 0;
  let failed = 0;

  for (const campaign of campaigns) {
    try {
      await sendCampaign(campaign.tenantId, campaign.id);
      sent++;
      logger.info('Newsletter campaign sent', { campaignId: campaign.id, tenantId: campaign.tenantId });
    } catch (error) {
      failed++;
      logger.error('Newsletter campaign send failed', {
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      try {
        await prisma.newsletterCampaign.update({
          where: { id: campaign.id },
          data: { status: 'FAILED' }
        });
      } catch {
        // Ignore update error
      }
    }
  }

  return { sent, failed };
}

export function startNewsletterCampaignSchedulerJob() {
  if (job) {
    logger.warn('Newsletter campaign scheduler job is already running');
    return;
  }
  job = cron.schedule(
    '* * * * *',
    async () => {
      try {
        const result = await runNewsletterCampaignScheduler();
        if (result.sent > 0 || result.failed > 0) {
          logger.info('Newsletter campaign scheduler job completed', result);
        }
      } catch (error) {
        logger.error('Newsletter campaign scheduler job error', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    },
    { scheduled: true }
  );
  logger.info('Newsletter campaign scheduler job started (runs every minute)');
}

export function stopNewsletterCampaignSchedulerJob() {
  if (job) {
    job.stop();
    job = null;
    logger.info('Newsletter campaign scheduler job stopped');
  }
}
