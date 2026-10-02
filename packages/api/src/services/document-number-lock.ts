import { prisma } from '../utils/database';

/**
 * Section critique « choisir un numéro de document puis l'enregistrer ».
 *
 * L'index unique `(tenant_id, document_number)` de `RentalDocument` refuse un
 * doublon, mais ne dit pas quel suffixe prendre : deux générations simultanées
 * du contrat d'un même bail liraient le même « dernier numéro ». Le verrou
 * consultatif PostgreSQL (`pg_advisory_xact_lock`) les fait donc se suivre,
 * même entre deux instances d'API. Même motif que
 * `lib/ai/advisory-lock.ts#withExclusiveSection` (recopié ici pour ne pas faire
 * dépendre `services/` de `lib/ai/`) : le verrou est tenu par une transaction
 * « gardienne » qui ne fait rien d'autre, ouverte pendant toute la section, car
 * le travail à l'intérieur emprunte ses propres connexions. Elle est relâchée
 * au commit/rollback de la gardienne, y compris sur crash de la connexion.
 *
 * Une file locale par clé, sans connexion, évite qu'un appel qui attend le
 * verrou monopolise une connexion du pool pendant l'attente.
 */

const MAX_WAIT_MS = 10_000;
const TIMEOUT_MS = 60_000;

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

/** Exécute `fn` en exclusion mutuelle pour `key` (tous processus confondus). */
export async function withDocumentNumberLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return withLocalMutex(key, () =>
    prisma.$transaction(
      async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        return fn();
      },
      { maxWait: MAX_WAIT_MS, timeout: TIMEOUT_MS }
    )
  );
}
