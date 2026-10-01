/**
 * Reminder scheduler job – runs daily at 6:00 AM UTC.
 * Les rappels (INSTALLMENT_DUE_REMINDER, LEASE_ENDING_SOON) doivent être envoyés via "Notifications email"
 * (email_notification_configs) lorsqu'un flux dédié sera implémenté. On n'utilise plus triggerEvent (Règles/Templates).
 * @see specs/010-communication-module/tasks.md T044
 */
import * as cron from 'node-cron';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { RentalInstallmentStatus } from '@prisma/client';

const REMINDER_DAYS_INSTALLMENT = 3;
const REMINDER_DAYS_LEASE_ENDING = 30;

let job: cron.ScheduledTask | null = null;

export async function runReminderScheduler(): Promise<{ installmentReminders: number; leaseReminders: number }> {
  const now = new Date();
  const inNDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const startDue = inNDays(1);
  const endDue = inNDays(REMINDER_DAYS_INSTALLMENT);
  const startLeaseEnd = inNDays(1);
  const endLeaseEnd = inNDays(REMINDER_DAYS_LEASE_ENDING);

  let installmentReminders = 0;
  let leaseReminders = 0;

  const installmentsDue = await prisma.rentalInstallment.findMany({
    where: {
      due_date: { gte: startDue, lte: endDue },
      status: {
        in: [RentalInstallmentStatus.DRAFT, RentalInstallmentStatus.DUE, RentalInstallmentStatus.PARTIAL]
      }
    },
    include: { lease: true }
  });

  // Les emails de rappel sont gérés uniquement par "Notifications email" (email_notification_configs).
  // TODO: ajouter un flux dédié (getEmailNotificationConfig + envoi) pour INSTALLMENT_DUE_REMINDER / LEASE_ENDING_SOON.
  installmentReminders = installmentsDue.length;

  const leasesEnding = await prisma.rentalLease.findMany({
    where: {
      end_date: { gte: startLeaseEnd, lte: endLeaseEnd, not: null }
    }
  });

  for (const lease of leasesEnding) {
    if (lease.end_date) leaseReminders++;
  }

  return { installmentReminders, leaseReminders };
}

export function startReminderSchedulerJob() {
  if (job) {
    logger.warn('Reminder scheduler job is already running');
    return;
  }
  job = cron.schedule(
    '0 6 * * *',
    async () => {
      try {
        logger.info('Starting reminder scheduler job');
        const result = await runReminderScheduler();
        logger.info('Reminder scheduler job completed', result);
      } catch (error) {
        logger.error('Reminder scheduler job error', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    },
    { timezone: 'UTC' }
  );
  logger.info('Reminder scheduler job started (runs daily at 6:00 AM UTC)');
}

export function stopReminderSchedulerJob() {
  if (job) {
    job.stop();
    job = null;
    logger.info('Reminder scheduler job stopped');
  }
}
