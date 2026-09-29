import { prisma, type PrismaTransactionClient } from '../../utils/database';

/**
 * Verrous consultatifs PostgreSQL d'ImmoCopilot : rendent atomiques, entre
 * instances d'API, des séquences « vérifier puis écrire » qu'aucune contrainte
 * d'unicité ne protège (le schéma ne change pas pour cela).
 *
 * `pg_advisory_xact_lock(hashtextextended(clé, 0))` (clé sur 64 bits, moins de
 * collisions que `hashtext`) est pris dans une transaction
 * interactive et relâché à son commit ou rollback, y compris sur crash de la
 * connexion : pas de verrou orphelin possible (contrairement à
 * `pg_advisory_lock` de session). Même motif que
 * `services/platform-invoice-service.ts` (`lockTenantBillingTx`).
 */

const DEFAULT_MAX_WAIT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface AdvisoryLockOptions {
  /** Attente maximale d'une connexion du pool pour ouvrir la transaction. */
  maxWaitMs?: number;
  /** Durée maximale de la transaction, attente du verrou comprise. */
  timeoutMs?: number;
}

/**
 * Exécute `fn` dans une transaction qui détient le verrou de `key` : deux
 * appels de même clé, où qu'ils tournent, se suivent. `fn` reçoit le client de
 * transaction (à utiliser pour que ses écritures soient atomiques avec le verrou).
 */
export async function withTransactionalAdvisoryLock<T>(
  key: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>,
  options: AdvisoryLockOptions = {}
): Promise<T> {
  return prisma.$transaction(
    async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      return fn(tx as PrismaTransactionClient);
    },
    { maxWait: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS, timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }
  );
}

/** File d'attente par clé, dans ce processus. */
const tails = new Map<string, Promise<unknown>>();

async function withLocalMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/**
 * Plafond de sections exclusives SIMULTANÉES dans ce processus. Chacune garde
 * une connexion « gardienne » pendant toute sa durée, plus au moins une autre
 * pour son travail : sans plafond, quelques clés différentes suffisent à
 * saturer le pool Prisma (P2024) et à dégrader toute l'API. À dimensionner
 * avec `connection_limit` (voir env.example) : 2 connexions par section.
 */
export const MAX_CONCURRENT_EXCLUSIVE_SECTIONS = 2;

/**
 * Sémaphore de processus : les appels au-delà du plafond attendent en mémoire
 * (un résolveur en file), sans connexion. Un `release` transmet directement le
 * jeton au suivant ; la file se vide donc d'elle-même, sans fuite.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiters.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.max) {
      this.active += 1;
    } else {
      // Le jeton est transmis par `release` : `active` reste inchangé.
      await new Promise<void>(resolve => this.waiters.push(resolve));
    }
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

const exclusiveSectionSemaphore = new Semaphore(MAX_CONCURRENT_EXCLUSIVE_SECTIONS);

/** Instantané pour les tests : sections en cours et appels en attente. */
export function exclusiveSectionStats(): { running: number; queued: number; lockKeys: number } {
  return {
    running: exclusiveSectionSemaphore.running,
    queued: exclusiveSectionSemaphore.queued,
    lockKeys: tails.size
  };
}

/**
 * Sérialise une section critique qui utilise SES PROPRES connexions (par
 * exemple `generateDocument`), sans les faire passer par une transaction : le
 * verrou est détenu par une transaction « gardienne » qui ne fait rien
 * d'autre, ouverte pendant toute la section.
 *
 * Deux files locales, sans connexion, avant toute requête :
 * 1. le mutex PAR CLÉ (même clé : une seule section à la fois) ;
 * 2. le sémaphore de PROCESSUS (`MAX_CONCURRENT_EXCLUSIVE_SECTIONS`) : des clés
 *    différentes ne se sérialisent pas, mais ne dépassent pas le plafond, donc
 *    ne saturent pas le pool.
 *
 * Ordre : mutex de clé PUIS sémaphore. Le sémaphore n'est jamais détenu pendant
 * l'attente d'un mutex : un détenteur de jeton n'attend que le verrou
 * PostgreSQL (jamais un autre jeton ni un mutex local), et un attendeur de
 * mutex n'occupe aucun jeton. Aucun cycle d'attente possible, donc pas de
 * deadlock ; l'ordre inverse (jeton puis mutex) laisserait des jetons occupés
 * par des appels qui attendent une clé déjà tenue. Le verrou PostgreSQL
 * sérialise ensuite les instances entre elles.
 */
export async function withExclusiveSection<T>(
  key: string,
  fn: () => Promise<T>,
  options: AdvisoryLockOptions = {}
): Promise<T> {
  return withLocalMutex(key, () =>
    exclusiveSectionSemaphore.run(() => withTransactionalAdvisoryLock(key, () => fn(), options))
  );
}
