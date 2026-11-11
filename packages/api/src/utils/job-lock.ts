/**
 * Verrou distribué des tâches planifiées (cron).
 *
 * Plusieurs instances de l'API (déploiement à chaud, réplicas) démarrent les
 * mêmes `cron.schedule` : sans verrou, chaque tâche tourne en double. Le verrou
 * vit dans la table `job_locks` (`name` PK, `holder`, `locked_until`,
 * `updated_at`), en SQL brut : le modèle Prisma n'est pas requis.
 *
 * - Prise atomique : `INSERT … ON CONFLICT (name) DO UPDATE … WHERE
 *   job_locks.locked_until < now() RETURNING name`. Une seule instance obtient
 *   une ligne en retour ; les autres sautent leur passage.
 * - `ttlMs` : durée de vie du verrou sans nouvelle de son titulaire. Tant que
 *   `fn` tourne, un minuteur le prolonge toutes les `ttlMs / 2` (un passage
 *   plus long que le TTL ne perd donc pas son verrou). Si l'instance meurt sans
 *   libérer, plus personne ne prolonge et le verrou expire seul.
 * - Libération en fin de passage (succès ou échec), seulement par son titulaire.
 * - Table absente (migration pas encore appliquée) ou base injoignable pour le
 *   verrou (« indisponible ») : selon `options.failOpen`, on journalise et on
 *   exécute quand même (ouvert, comme avant le verrou), ou on refuse
 *   d'exécuter (fermé). Par défaut : ouvert hors production, fermé en
 *   production. Les tâches qui écrivent de l'argent passent `failOpen: false`
 *   explicitement : sans verrou, deux instances les exécuteraient en double.
 * - Mode fermé : un incident passager (base qui redémarre) ne doit pas faire
 *   perdre un passage rare (ex. constatation mensuelle du 2 à 3 h). La prise
 *   est retentée après chacun des délais `retryDelaysMs` (défaut : 2 nouvelles
 *   tentatives à 5 s) avant de sauter la tâche avec `logger.error`.
 */
import { randomUUID } from 'crypto';
import { isProduction } from '../config/env';
import { prisma } from './database';
import { logger } from './logger';

/** Délais avant chaque nouvelle tentative de prise en mode fermé (3 essais en tout). */
export const CLOSED_LOCK_RETRY_DELAYS_MS: readonly number[] = [5_000, 5_000];

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Identité de ce processus, stable pour toute sa durée de vie. */
const HOLDER = `${process.pid}-${randomUUID()}`;

/** `42P01` : relation inexistante (PostgreSQL). Prisma l'enveloppe selon le chemin d'accès. */
function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { code?: string; message?: string } } | null;
  const text = `${e?.message ?? ''} ${e?.meta?.message ?? ''}`;
  return (
    e?.code === 'P2010' ||
    e?.code === 'P2021' ||
    e?.meta?.code === '42P01' ||
    /job_locks.*does not exist|relation "job_locks"/i.test(text)
  );
}

type Acquisition = 'acquired' | 'busy' | 'unavailable';

async function acquire(name: string, ttlMs: number, failOpen: boolean): Promise<Acquisition> {
  try {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      INSERT INTO job_locks (name, holder, locked_until, updated_at)
      VALUES (${name}, ${HOLDER}, now() + (${ttlMs}::bigint * interval '1 millisecond'), now())
      ON CONFLICT (name) DO UPDATE
        SET holder = EXCLUDED.holder,
            locked_until = EXCLUDED.locked_until,
            updated_at = now()
        WHERE job_locks.locked_until < now()
      RETURNING name
    `;
    return Array.isArray(rows) && rows.length > 0 ? 'acquired' : 'busy';
  } catch (error) {
    const outcome = failOpen ? 'exécution sans verrou' : 'tâche sautée';
    logger.warn(
      isMissingTable(error)
        ? `Verrou de tâche « ${name} » : table job_locks absente (migration non appliquée), ${outcome}`
        : `Verrou de tâche « ${name} » : prise impossible, ${outcome}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
    return 'unavailable';
  }
}

async function release(name: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE job_locks SET locked_until = now(), updated_at = now()
      WHERE name = ${name} AND holder = ${HOLDER}
    `;
  } catch (error) {
    // Le verrou expirera seul à l'échéance du TTL.
    logger.warn(`Verrou de tâche « ${name} » : libération impossible`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function extend(name: string, ttlMs: number): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE job_locks
      SET locked_until = now() + (${ttlMs}::bigint * interval '1 millisecond'), updated_at = now()
      WHERE name = ${name} AND holder = ${HOLDER}
    `;
  } catch (error) {
    // Sans effet sur fn : au pire le verrou expire à l'échéance du TTL.
    logger.warn(`Verrou de tâche « ${name} » : prolongation impossible`, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Exécute `fn` si aucune autre instance ne détient le verrou `name`.
 * Renvoie le résultat de `fn`, ou `undefined` si le passage est sauté parce
 * qu'une autre instance travaille. Les erreurs de `fn` sont relancées après
 * libération du verrou. Verrou indisponible et mode fermé : `undefined`, `fn`
 * n'est pas exécutée.
 */
export async function withJobLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
  options?: { failOpen?: boolean; retryDelaysMs?: readonly number[] }
): Promise<T | undefined> {
  const failOpen = options?.failOpen ?? !isProduction;
  let state = await acquire(name, ttlMs, failOpen);
  if (state === 'unavailable' && !failOpen) {
    // Mode fermé : quelques nouvelles tentatives espacées avant de renoncer.
    for (const delayMs of options?.retryDelaysMs ?? CLOSED_LOCK_RETRY_DELAYS_MS) {
      await wait(delayMs);
      state = await acquire(name, ttlMs, failOpen);
      if (state !== 'unavailable') break;
    }
  }
  if (state === 'unavailable') {
    if (!failOpen) {
      logger.error(`Tâche « ${name} » : verrou indisponible, exécution refusée (mode fermé)`);
      return undefined;
    }
  }
  if (state === 'busy') {
    logger.info(`Tâche « ${name} » : déjà en cours sur une autre instance, passage sauté`);
    return undefined;
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  // Prolongation en vol : à attendre avant la libération, sinon elle pourrait
  // arriver après `release` et ré-armer le verrou jusqu'à l'échéance du TTL.
  let inFlight: Promise<void> | undefined;
  let stopped = false;
  if (state === 'acquired') {
    timer = setInterval(
      () => {
        if (stopped || inFlight) return; // arrêté, ou pas de chevauchement
        const current: Promise<void> = extend(name, ttlMs).finally(() => {
          if (inFlight === current) inFlight = undefined;
        });
        inFlight = current;
      },
      Math.max(1, Math.floor(ttlMs / 2))
    );
    if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
  }
  try {
    return await fn();
  } finally {
    stopped = true;
    if (timer) clearInterval(timer);
    if (state === 'acquired') {
      // extend() ne jette jamais ; on attend la prolongation en cours avant de libérer.
      if (inFlight) await inFlight;
      await release(name);
    }
  }
}
