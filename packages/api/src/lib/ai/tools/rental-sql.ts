import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { compileAssistantSql, sqlViews, SQL_MAX_CHARS } from '../assistant-sql';
import { readAssistantSql } from '../assistant-sql-reader';
import type { AnalysisTable, ArtifactCell, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, isoDay, outcome } from './tool-utils';

const inputSchema = z.object({ sql: z.string().trim().min(1).max(SQL_MAX_CHARS) }).strict();
const syntax =
  'Un seul SELECT avec colonnes explicites. WHERE compare une colonne à une valeur, AND ou OR. GROUP BY, COUNT, SUM, AVG et ORDER BY par colonne sélectionnée sont autorisés. Pour tout montant, sélectionner currency. Pour un agrégat monétaire, grouper aussi par currency. Pas de jointure ni de sous-requête.';

function cell(value: unknown): ArtifactCell {
  if (value instanceof Date) return isoDay(value);
  if (typeof value === 'string') return value.slice(0, 80);
  if (value instanceof Prisma.Decimal) value = value.toNumber();
  if (typeof value === 'bigint') value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

function rentalSqlTool(
  kind: keyof typeof sqlViews,
  name: 'rental_receipts_sql' | 'rental_installments_sql',
  permission: string,
  description: string
): CopilotToolDefinition<typeof inputSchema> {
  return {
    name,
    description: description + ' ' + syntax,
    inputSchema,
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['sql'],
      properties: { sql: { type: 'string', maxLength: SQL_MAX_CHARS } }
    },
    requiredPermission: permission,
    feature: 'RENTAL',
    kind: 'read',
    async execute(input, ctx) {
      assertToolPermission(ctx, permission);
      const compiled = compileAssistantSql(input.sql, sqlViews[kind]);
      const result = await readAssistantSql(ctx.tenantId, compiled.sql, ctx.signal);
      const rows = result
        .slice(0, compiled.rowLimit)
        .map(row => Object.fromEntries(compiled.columns.map(({ key }) => [key, cell(row[key])])));
      const title = kind === 'receipts' ? t('Encaissements locatifs') : t('Échéances locatives');
      const path = kind === 'receipts' ? '/rental/payments' : '/rental/installments';
      const calculatedAt = new Date().toISOString();
      const artifact: AnalysisTable = {
        kind: 'table',
        id: randomUUID(),
        title,
        columns: compiled.columns,
        rows,
        query: { tool: name, sql: input.sql },
        truncated: result.length > rows.length,
        provenance: {
          source: title,
          href: `/tenant/${encodeURIComponent(ctx.tenantId)}${path}`,
          period: t('Selon les filtres de la requête'),
          calculatedAt,
          rules: [
            kind === 'receipts'
              ? t('Seuls les paiements au statut réussi sont inclus, selon la date effective d’encaissement.')
              : t('Les échéances annulées sont exclues. Le reste dû est calculé avec les affectations enregistrées.'),
            t('La requête utilise une vue en lecture seule filtrée sur l’agence active.')
          ]
        }
      };
      return outcome(
        { artifactId: artifact.id, items: rows.slice(0, 8), truncated: artifact.truncated },
        { type: 'artifact', artifact }
      );
    }
  };
}

export const rentalReceiptsSqlTool = rentalSqlTool(
  'receipts',
  'rental_receipts_sql',
  'RENTAL_PAYMENTS_VIEW',
  'Secours SQL si les outils métier ne répondent pas à la question. Vue rental_receipts, colonnes received_on (date), currency (devise), amount (montant), method (mode).'
);
export const rentalInstallmentsSqlTool = rentalSqlTool(
  'installments',
  'rental_installments_sql',
  'RENTAL_INSTALLMENTS_VIEW',
  'Secours SQL si les outils métier ne répondent pas à la question. Vue rental_installments, colonnes due_on (date), currency (devise), status (statut), gross_amount (attendu), allocated_amount (affecté), outstanding_amount (reste dû).'
);
