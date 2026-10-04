/**
 * Tâche planifiée de l'inventaire de chantier par WhatsApp (lot 041, spec
 * W10, W6-R7, W14-R6).
 *
 * Chaque minute :
 * - relances et expirations des sessions (`runSessionTimers`, W4-R5) ;
 * - reprise des événements du webhook restés `RECEIVED` plus de 2 minutes ou
 *   `PROCESSING` plus de 5 minutes (arrêt de l'API) : `processWebhookEvent`
 *   les réclame par mise à jour conditionnelle, trois tentatives au plus, puis
 *   `FAILED` (W1) ;
 * - effacement des copies transitoires `payload` de plus d'une heure (W6-R8).
 *
 * Chaque nuit à 3 h 30 UTC : purge des messages de conversation de plus de
 * 180 jours et des événements du webhook de plus de 30 jours, par lots de
 * 5 000 (data-model §8). Les captures et leurs photos ne sont JAMAIS purgées
 * (preuve d'inventaire).
 *
 * Lecture transverse assumée hors contexte (même parti pris que
 * `newsletter-campaign-scheduler.job.ts`) ; chaque session est ensuite traitée
 * dans le contexte de son agence par `runSessionTimers`.
 *
 * Démarrée par `src/index.ts` seulement si le transport n'est pas `disabled`,
 * jamais en test.
 */
import * as cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { runSessionTimers } from '../lib/stock-whatsapp/engine/timers';
import { processWebhookEvent } from '../lib/stock-whatsapp/webhook/process-event';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const EVENT_RECEIVED_RETRY_AFTER_MS = 2 * MINUTE_MS;
export const EVENT_PROCESSING_RETRY_AFTER_MS = 5 * MINUTE_MS;
export const EVENT_PAYLOAD_MAX_AGE_MS = 60 * MINUTE_MS;
export const MESSAGE_RETENTION_MS = 180 * DAY_MS;
export const EVENT_RETENTION_MS = 30 * DAY_MS;
export const PURGE_BATCH_SIZE = 5000;
const RETRY_BATCH_SIZE = 100;

let minuteJob: cron.ScheduledTask | null = null;
let nightlyJob: cron.ScheduledTask | null = null;
let minuteRunning = false;

/** Événements à reprendre (W6-R7). Ceux qui ont épuisé leurs tentatives passent à `FAILED` dans `processWebhookEvent`. */
export async function retryStaleWebhookEvents(now: Date = new Date()): Promise<number> {
  const receivedBefore = new Date(now.getTime() - EVENT_RECEIVED_RETRY_AFTER_MS);
  const processingBefore = new Date(now.getTime() - EVENT_PROCESSING_RETRY_AFTER_MS);
  const events = await prisma.whatsappCloudEvent.findMany({
    where: {
      kind: 'MESSAGE',
      OR: [
        { status: 'RECEIVED', receivedAt: { lt: receivedBefore } },
        { status: 'PROCESSING', claimedAt: { lt: processingBefore } }
      ]
    },
    select: { id: true },
    orderBy: { receivedAt: 'asc' },
    take: RETRY_BATCH_SIZE
  });
  for (const event of events) {
    // Un par un, dans l'ordre de réception (W4-R9). Ne lève jamais.
    await processWebhookEvent(event.id);
  }
  return events.length;
}

/** Copies transitoires du message effacées au plus tard après une heure (W6-R8). */
export async function clearStaleEventPayloads(now: Date = new Date()): Promise<number> {
  const result = await prisma.whatsappCloudEvent.updateMany({
    where: {
      receivedAt: { lt: new Date(now.getTime() - EVENT_PAYLOAD_MAX_AGE_MS) },
      NOT: { payload: { equals: Prisma.DbNull } }
    },
    data: { payload: Prisma.DbNull }
  });
  return result.count;
}

async function purgeInBatches(
  findIds: () => Promise<Array<{ id: string }>>,
  remove: (ids: string[]) => Promise<{ count: number }>
): Promise<number> {
  let total = 0;
  for (;;) {
    const ids = (await findIds()).map(row => row.id);
    if (ids.length === 0) return total;
    total += (await remove(ids)).count;
    if (ids.length < PURGE_BATCH_SIZE) return total;
  }
}

/** Purges nocturnes (W10-R3, W14-R6) : messages à 180 jours, événements à 30 jours. */
export async function purgeStockWhatsappHistory(now: Date = new Date()): Promise<{ messages: number; events: number }> {
  const messagesBefore = new Date(now.getTime() - MESSAGE_RETENTION_MS);
  const eventsBefore = new Date(now.getTime() - EVENT_RETENTION_MS);
  const messages = await purgeInBatches(
    () =>
      prisma.stockWhatsappMessage.findMany({
        where: { createdAt: { lt: messagesBefore } },
        select: { id: true },
        take: PURGE_BATCH_SIZE
      }),
    ids => prisma.stockWhatsappMessage.deleteMany({ where: { id: { in: ids }, createdAt: { lt: messagesBefore } } })
  );
  const events = await purgeInBatches(
    () =>
      prisma.whatsappCloudEvent.findMany({
        where: { receivedAt: { lt: eventsBefore } },
        select: { id: true },
        take: PURGE_BATCH_SIZE
      }),
    ids => prisma.whatsappCloudEvent.deleteMany({ where: { id: { in: ids }, receivedAt: { lt: eventsBefore } } })
  );
  return { messages, events };
}

/** Le travail de chaque minute. Une étape en échec n'empêche pas les suivantes. */
export async function runStockWhatsappMinute(now: Date = new Date()): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['minuteries', () => runSessionTimers({ now })],
    ['reprise des événements', () => retryStaleWebhookEvents(now)],
    ['effacement des copies', () => clearStaleEventPayloads(now)]
  ];
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (error) {
      logger.error(`Inventaire WhatsApp : tâche (${label}) en échec`, {
        error: error instanceof Error ? error.name : 'inconnue'
      });
    }
  }
}

export function startStockWhatsappJob(): void {
  if (minuteJob) {
    logger.warn('Inventaire WhatsApp : la tâche planifiée tourne déjà');
    return;
  }
  minuteJob = cron.schedule('* * * * *', async () => {
    // Un passage à la fois dans ce processus ; entre instances, les mises à
    // jour conditionnelles évitent tout doublon (W10-R4).
    if (minuteRunning) return;
    minuteRunning = true;
    try {
      await runStockWhatsappMinute();
    } finally {
      minuteRunning = false;
    }
  });
  nightlyJob = cron.schedule(
    '30 3 * * *',
    async () => {
      try {
        const purged = await purgeStockWhatsappHistory();
        logger.info('Inventaire WhatsApp : purge nocturne', purged);
      } catch (error) {
        logger.error('Inventaire WhatsApp : purge nocturne en échec', {
          error: error instanceof Error ? error.name : 'inconnue'
        });
      }
    },
    { timezone: 'UTC' }
  );
  logger.info('Inventaire WhatsApp : tâche planifiée démarrée (chaque minute, purge à 3 h 30 UTC)');
}

export function stopStockWhatsappJob(): void {
  minuteJob?.stop();
  nightlyJob?.stop();
  minuteJob = null;
  nightlyJob = null;
}
