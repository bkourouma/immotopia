import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import {
  COPILOT_ARTIFACT_MAX_CHART_POINTS,
  COPILOT_ARTIFACT_MAX_SERIES,
  type CopilotToolDefinition
} from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const schema = z
  .object({
    sourceId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    dimension: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
    measure: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),
    chartType: z.enum(['bar', 'line'])
  })
  .strict();

export const chartAnalysisTool: CopilotToolDefinition<typeof schema> = {
  name: 'chart_analysis',
  description:
    'Publie un graphique fondé sur un tableau calculé par un outil d’analyse dans cette conversation. Réutilise son artifactId et les clés de colonnes réellement retournées. Les valeurs sont lues directement depuis le résultat serveur.',
  inputSchema: schema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['sourceId', 'title', 'dimension', 'measure', 'chartType'],
    properties: {
      sourceId: { type: 'string', format: 'uuid' },
      title: { type: 'string', maxLength: 120 },
      dimension: { type: 'string' },
      measure: { type: 'string' },
      chartType: { type: 'string', enum: ['bar', 'line'] }
    }
  },
  requiredPermission: 'PROPERTIES_VIEW',
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, 'PROPERTIES_VIEW');
    const source = ctx.analysisTables?.get(input.sourceId);
    const dimension = source?.columns.find(column => column.key === input.dimension);
    const measure = source?.columns.find(column => column.key === input.measure);
    if (
      !source ||
      !dimension ||
      !measure ||
      input.dimension === input.measure ||
      !['number', 'currency'].includes(measure.type ?? '')
    ) {
      throw new NotFoundError(t('Le résultat de cette analyse est indisponible.'));
    }

    const currencies = [...new Set(source.rows.map(row => String(row.currency ?? '')))];
    const series = currencies.length ? currencies : [''];
    if (series.length > COPILOT_ARTIFACT_MAX_SERIES || source.truncated) {
      return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
    }
    const xKey = 'category';
    const names = new Map<string, Record<string, string | number | null>>();
    for (const row of source.rows) {
      const currency = String(row.currency ?? '');
      const label = String(row[dimension.key] ?? '');
      const key = series.indexOf(currency);
      const entry = names.get(label) ?? { [xKey]: label };
      if (entry[`value${key}`] !== undefined)
        return outcome({
          error: 'DUPLICATE_CATEGORY',
          message: t('Les valeurs du graphique doivent avoir une catégorie unique par devise.')
        });
      entry[`value${key}`] = row[measure.key] ?? null;
      names.set(label, entry);
    }
    if (names.size > COPILOT_ARTIFACT_MAX_CHART_POINTS) {
      return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
    }
    const data = [...names.values()];
    if (dimension.key === 'period') data.sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey])));
    const id = randomUUID();
    return outcome(
      { artifactId: id, sourceId: source.id },
      {
        type: 'artifact',
        artifact: {
          id,
          kind: 'chart',
          title: input.title,
          chartType: input.chartType,
          xKey,
          series: series.map((currency, index) => ({
            key: `value${index}`,
            label: [measure.label, currency].filter(Boolean).join(' · ')
          })),
          data,
          provenance: source.provenance,
          ...(source.query ? { replay: { tool: 'chart_analysis' as const, source: source.query, input } } : {})
        }
      }
    );
  }
};
