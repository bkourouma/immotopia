import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { tenantGuardExtension } from './prisma-tenant-guard-extension';

/**
 * Database connection utilities
 * Configures connection pooling and database connection management
 */

// Create Prisma client with connection pooling, plus the tenant guard extension
// that reports (or blocks, see TENANT_GUARD_MODE) queries on tenant-scoped
// models that carry no tenant filter.
function createExtendedClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  // Unit tests replace @prisma/client with a plain mock that has no $extends;
  // fall back to the bare client there rather than failing at import time.
  const candidate = client as unknown as { $extends?: (ext: unknown) => unknown };
  if (typeof candidate.$extends !== 'function') {
    return client as unknown as ReturnType<typeof extend>;
  }

  return extend(client);
}

/** Applies the tenant guard; separated so its return type names the client. */
function extend(client: PrismaClient) {
  return client.$extends(tenantGuardExtension);
}

const prismaClientSingleton = () => createExtendedClient();

// Global Prisma instance (connection pooling is handled by Prisma)
declare global {
  // eslint-disable-next-line no-var
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prisma ?? prismaClientSingleton();

/** The extended client, as returned by `$extends`. */
export type ExtendedPrismaClient = typeof prisma;

/**
 * What a `prisma.$transaction(async tx => ...)` callback receives.
 *
 * On an extended client this is the client minus the lifecycle methods, not
 * `Prisma.TransactionClient`. Helpers that must accept either the top-level
 * client or a transaction client should take this type: the full client is
 * assignable to it, a transaction client is exactly it.
 */
export type PrismaTransactionClient = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * Ferme la connexion, une fois et une seule.
 *
 * **Le drapeau n'est pas une precaution, il est indispensable.** Sans lui,
 * `process.on('beforeExit')` ci-dessous boucle a l'infini : `beforeExit` se
 * declenche chaque fois que la boucle d'evenements se vide, le gestionnaire
 * `async` y replace aussitot du travail, la boucle ne se vide donc jamais
 * pour de bon, et l'evenement se redeclenche. Un script qui a fini son
 * travail en trois secondes tourne alors sans fin en ecrivant la meme ligne
 * de journal — un fichier de 1,4 Go observe en pratique, et un script qu'on
 * croit bloque alors qu'il a deja tout fait.
 */
let deconnexionFaite = false;

// Graceful shutdown handler
export async function disconnectDatabase(): Promise<void> {
  if (deconnexionFaite) {
    return;
  }
  deconnexionFaite = true;

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected gracefully');
  } catch (error) {
    // Le drapeau reste pose : une deconnexion qui echoue ne se retente pas en
    // boucle, sans quoi on retrouverait exactement le probleme qu'il corrige.
    logger.error('Error disconnecting database', { error });
    throw error;
  }
}

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
}

// Process event handlers for graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});
