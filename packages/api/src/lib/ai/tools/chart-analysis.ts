import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import {
  ANALYSIS_CHART_TYPES,
  COPILOT_ARTIFACT_MAX_CHART_POINTS,
  COPILOT_ARTIFACT_MAX_SERIES,
  type ArtifactCell,
  type CopilotToolDefinition
} from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
const schema = z
  .object({
    sourceId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    dimension: key,
    measure: key,
    chartType: z.enum(ANALYSIS_CHART_TYPES),
    seriesBy: key.optional(),
    aggregation: z.enum(['sum', 'average']).optional()
  })
  .strict();

export const chartAnalysisTool: CopilotToolDefinition<typeof schema> = {
  name: 'chart_analysis',
  description:
    'Publie un graphique fondé sur un tableau de cette conversation. Réutilise son artifactId et ses clés. seriesBy sépare les valeurs en séries. Pour un taux, demande aggregation=average. Une forme empilée ou en parts exige des valeurs additives et une seule devise.',
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
      chartType: { type: 'string', enum: ANALYSIS_CHART_TYPES },
      seriesBy: { type: 'string' },
      aggregation: { type: 'string', enum: ['sum', 'average'] }
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
      (input.seriesBy &&
        (!source.columns.some(column => column.key === input.seriesBy) || input.seriesBy === input.measure)) ||
      !['number', 'currency'].includes(measure.type ?? '')
    ) {
      throw new NotFoundError(t('Le résultat de cette analyse est indisponible.'));
    }

    if (source.truncated) {
      return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
    }
    const monetary = measure.type === 'currency';
    const parts = input.chartType === 'pie' || input.chartType === 'donut';
    const stacked = input.chartType === 'stacked_bar' || input.chartType === 'stacked_area';
    const xKey = 'category';
    const series = new Map<string, { key: string; label: string }>();
    const categories = new Map<string, Map<string, { sum: Prisma.Decimal; count: number }>>();
    const currencies = new Set<string>();
    let negative = false;
    let combined = false;

    for (const row of source.rows) {
      const currency = String(row.currency === 'FCFA' ? 'XOF' : (row.currency ?? ''));
      const group = input.seriesBy && input.seriesBy !== 'currency' ? String(row[input.seriesBy] ?? '') : '';
      const id = JSON.stringify([group, currency]);
      if (!series.has(id)) {
        series.set(id, {
          key: `value${series.size}`,
          label: [measure.label, group, currency].filter(Boolean).join(' · ')
        });
      }
      const label = String(row[dimension.key] ?? '');
      const entry = categories.get(label) ?? new Map();
      categories.set(label, entry);
      const point = row[measure.key];
      if (typeof point !== 'number' || !Number.isFinite(point)) continue;
      currencies.add(currency);
      negative ||= point < 0;
      const previous = entry.get(id);
      combined ||= previous !== undefined;
      entry.set(id, { sum: (previous?.sum ?? new Prisma.Decimal(0)).plus(point), count: (previous?.count ?? 0) + 1 });
    }
    if (series.size > COPILOT_ARTIFACT_MAX_SERIES || categories.size > COPILOT_ARTIFACT_MAX_CHART_POINTS) {
      return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
    }
    if ((parts || stacked) && (input.aggregation === 'average' || (monetary && currencies.size > 1))) {
      return outcome({
        error: 'INCOMPATIBLE_UNITS',
        message: t('Ce graphique exige des valeurs additives de même unité.')
      });
    }
    if (negative && input.chartType === 'stacked_area') {
      return outcome({ error: 'NEGATIVE_AREA', message: t('Une aire empilée exige des valeurs positives ou nulles.') });
    }
    if (!series.size) series.set('', { key: 'value0', label: measure.label });
    const data: Record<string, ArtifactCell>[] = [...categories].map(([category, entry]) => ({
      [xKey]: category,
      ...Object.fromEntries(
        [...entry].map(([id, point]) => {
          const value = (input.aggregation === 'average' ? point.sum.div(point.count) : point.sum).toNumber();
          return [series.get(id)!.key, Number.isFinite(value) ? value : null];
        })
      )
    }));
    if (
      parts &&
      (series.size !== 1 || data.length < 2 || data.length > 8 || negative || !data.some(row => Number(row.value0) > 0))
    ) {
      return outcome({
        error: 'INVALID_PARTS',
        message: t('Un graphique en parts exige de deux à huit catégories et des valeurs positives ou nulles.')
      });
    }
    if (parts || (input.chartType === 'horizontal_bar' && series.size === 1)) {
      data.sort((a, b) => Number(b.value0 ?? -Infinity) - Number(a.value0 ?? -Infinity));
    } else if (dimension.key === 'period' || dimension.type === 'date') {
      data.sort((a, b) => String(a[xKey]).localeCompare(String(b[xKey])));
    }
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
          xLabel: dimension.label,
          series: [...series.values()],
          data,
          provenance:
            source.provenance && (combined || input.aggregation === 'average')
              ? {
                  ...source.provenance,
                  rules: [
                    ...source.provenance.rules,
                    input.aggregation === 'average'
                      ? t('Les valeurs d’une même catégorie et série sont agrégées par moyenne.')
                      : t('Les valeurs d’une même catégorie et série sont additionnées.')
                  ]
                }
              : source.provenance,
          ...(source.query ? { replay: { tool: 'chart_analysis' as const, source: source.query, input } } : {})
        }
      }
    );
  }
};
