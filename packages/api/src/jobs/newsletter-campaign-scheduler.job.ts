/**
 * Newsletter campaign scheduler job – runs every minute.
 * Sends campaigns that are SCHEDULED and whose scheduled_at <= now.
 * @see specs/012-newsletter-mailing Phase 6
 */
import * as cron from 'node-cron';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { sendCampaign } from '../services/newsletter-campaign.service';
import { runWithTenantContext } from '../utils/tenant-context';

let job: cron.ScheduledTask | null = null;

/**
 * D6 — lecture transverse hors contexte, traitement par agence dans son
 * contexte.
 *
 * La lecture ci-dessous porte volontairement sur toutes les agences (aucun
 * contexte n'est actif pendant le `findMany` : le garde-fou
 * (utils/prisma-tenant-guard-extension.ts) ne le contrôle pas, ce qui est
 * correct ici — c'est le travail planifié lui-même qui doit voir toutes les
 * campagnes dues, pas une agence en particulier). Chaque campagne est ensuite
 * traitée dans `runWithTenantContext({ tenantId: campaign.tenantId }, ...)` :
 * si `sendCampaign` ou la mise à jour de statut touchent, par erreur, un
 * modèle cloisonné d'une autre agence, le garde-fou le voit.
 */
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
    await runWithTenantContext({ tenantId: campaign.tenantId }, async () => {
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
            where: { id: campaign.id, tenantId: campaign.tenantId },
            data: { status: 'FAILED' }
          });
        } catch {
          // Ignore update error
        }
      }
    });
  }

  return { sent, failed };
}

export function startNewsletterCampaignSchedulerJob() {
  if (job) {
    logger.warn('Newsletter campaign scheduler job is already running');
    return;
  }
  job = cron.schedule('* * * * *', async () => {
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
  });
  logger.info('Newsletter campaign scheduler job started (runs every minute)');
}

export function stopNewsletterCampaignSchedulerJob() {
  if (job) {
    job.stop();
    job = null;
    logger.info('Newsletter campaign scheduler job stopped');
  }
}
