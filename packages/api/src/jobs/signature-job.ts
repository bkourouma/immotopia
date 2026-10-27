/**
 * Tâche planifiée de la signature électronique (spec 044, SG-R11).
 *
 * Toutes les 15 minutes :
 * - rejoue le scellement des demandes entièrement signées dont le scellement
 *   a échoué (`sealPendingSignatureRequests`), EN PREMIER ;
 * - marque `EXPIRED` les demandes échues qui attendent encore une signature et
 *   prévient l'émetteur (`expireDueSignatureRequests`) ;
 * - envoie les rappels avant expiration (`sendDueSignatureReminders`), EN DERNIER.
 *
 * Lecture transverse assumée hors contexte (même parti pris que
 * `stock-whatsapp-job.ts`) ; chaque demande est ensuite traitée dans le
 * contexte de son agence. Mises à jour conditionnelles : plusieurs instances
 * ne doublent rien. Démarrée par `src/index.ts` (jamais en test), même avec
 * `SIGNATURE_PROVIDER=disabled` : une demande déjà envoyée doit pouvoir expirer.
 */
import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { withJobLock } from '../utils/job-lock';
import { sendDueSignatureReminders } from '../lib/signature/reminders';
import { expireDueSignatureRequests, sealPendingSignatureRequests } from '../services/signature-service';

let job: cron.ScheduledTask | null = null;
let running = false;

/** Le travail d'un passage. Une étape en échec n'empêche pas l'autre. */
export async function runSignatureMaintenance(
  now: Date = new Date()
): Promise<{ expired: number; sealed: number; reminded: number }> {
  const result = { expired: 0, sealed: 0, reminded: 0 };
  // Scellement d'abord : une demande entièrement signée avant son échéance ne doit pas expirer.
  try {
    result.sealed = await sealPendingSignatureRequests(now);
  } catch (error) {
    logger.error('Signature : reprise du scellement en échec', {
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
  try {
    result.expired = await expireDueSignatureRequests(now);
  } catch (error) {
    logger.error('Signature : expiration en échec', { error: error instanceof Error ? error.name : 'inconnue' });
  }
  // Rappels après l'expiration : une demande échue ne reçoit plus de rappel.
  try {
    result.reminded = (await sendDueSignatureReminders(now)).reminded;
  } catch (error) {
    logger.error('Signature : rappels automatiques en échec', {
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
  return result;
}

export function startSignatureJob(): void {
  if (job) return;
  job = cron.schedule('*/15 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      // Période de 15 min : TTL de 10 min, le verrou expire avant le passage suivant.
      await withJobLock('signature-maintenance', 10 * 60 * 1000, () => runSignatureMaintenance());
    } finally {
      running = false;
    }
  });
  logger.info('Signature : tâche planifiée démarrée (toutes les 15 minutes)');
}

export function stopSignatureJob(): void {
  job?.stop();
  job = null;
}
