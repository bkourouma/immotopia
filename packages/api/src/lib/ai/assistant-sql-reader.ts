import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../../config/env';
import { t } from '../../i18n';
import { AppError } from '../../middleware/error-middleware';
import { logger } from '../../utils/logger';

let reader: PrismaClient | undefined;
function unavailable() {
  return new AppError(t('La lecture SQL de l’assistant est indisponible.'), 503);
}

export async function readAssistantSql(tenantId: string, sql: Prisma.Sql, signal: AbortSignal) {
  const url = env.AI_ASSISTANT_SQL_URL;
  if (!url) throw unavailable();
  signal.throwIfAborted();
  reader ??= new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    return await reader.$transaction(
      async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '2s'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '500ms'`;
        await tx.$executeRaw`SET LOCAL search_path = pg_catalog`;
        const [role] = await tx.$queryRaw<{ safe: boolean }[]>`
        SELECT (
          rolname = 'immotopia_assistant_reader'
          AND session_user = current_user
          AND NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolinherit OR rolreplication)
          AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
          AND NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND left(n.nspname, 3) <> 'pg_'
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND (
                has_table_privilege(c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER')
                OR has_any_column_privilege(c.oid, 'INSERT, UPDATE, REFERENCES')
                OR (
                  NOT (n.nspname = 'assistant_read' AND c.relname IN ('rental_receipts', 'rental_installments') AND c.relkind = 'v')
                  AND has_any_column_privilege(c.oid, 'SELECT')
                )
              )
          )
        ) AS safe FROM pg_roles r WHERE rolname = current_user
      `;
        if (!role?.safe) throw unavailable();
        signal.throwIfAborted();
        await tx.$queryRaw`SELECT set_config('immotopia.assistant_tenant', ${tenantId}, true)`;
        const rows = await tx.$queryRaw<Record<string, unknown>[]>(sql);
        signal.throwIfAborted();
        return rows;
      },
      { maxWait: 1_000, timeout: 5_000 }
    );
  } catch (error) {
    if (signal.aborted) throw error;
    // Ne jamais journaliser l'URL, la requête ni les valeurs métier.
    logger.warn('ImmoCopilot : lecture SQL impossible', {
      errorName: error instanceof Error ? error.name : typeof error
    });
    throw unavailable();
  }
}
