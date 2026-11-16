import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import type { AnalysisTable, ArtifactIndicator, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const columnKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
const filterValue = z.union([z.string().max(200), z.number().finite()]);
const selector = z
  .object({
    filters: z
      .record(columnKey, filterValue)
      .refine(filters => Object.keys(filters).length <= 4)
      .optional()
  })
  .strict();
const card = z
  .object({
    measure: columnKey,
    value: selector,
    comparison: selector.optional()
  })
  .strict();
const schema = z
  .object({
    sourceId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    cards: z.array(card).min(1).max(12)
  })
  .strict();

const selectorJson = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filters: {
      type: 'object',
      maxProperties: 4,
      additionalProperties: { anyOf: [{ type: 'string', maxLength: 200 }, { type: 'number' }] }
    }
  }
};

const permission = 'PROPERTIES_VIEW';

function findValue(source: AnalysisTable, measure: string, filters: Record<string, string | number>) {
  const rows = source.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
  if (rows.length !== 1) return undefined;
  const row = rows[0];
  const value = row[measure];
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return { value, currency: typeof row.currency === 'string' ? row.currency : undefined };
}

export const showIndicatorsTool: CopilotToolDefinition<typeof schema> = {
  name: 'show_indicators',
  description:
    'Affiche des indicateurs calculés depuis un tableau de la conversation. Référence son artifactId et une mesure numérique. Sélectionne une ligne unique par carte avec les filtres (par exemple période et devise), et éventuellement une ligne de comparaison de même devise. Ne fournis aucun montant ni pourcentage.',
  inputSchema: schema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['sourceId', 'title', 'cards'],
    properties: {
      sourceId: { type: 'string', format: 'uuid' },
      title: { type: 'string', minLength: 1, maxLength: 120 },
      cards: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['measure', 'value'],
          properties: { measure: { type: 'string' }, value: selectorJson, comparison: selectorJson }
        }
      }
    }
  },
  requiredPermission: permission,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const source = ctx.analysisTables?.get(input.sourceId);
    if (!source?.provenance) throw new NotFoundError(t('Le résultat de cette analyse est indisponible.'));
    if (source.truncated) return outcome({ error: 'INCOMPLETE_DATASET' });

    const cards: ArtifactIndicator[] = [];
    for (const spec of input.cards) {
      const measure = source.columns.find(col => col.key === spec.measure);
      if (measure?.type !== 'currency' && measure?.type !== 'number') return outcome({ error: 'UNKNOWN_MEASURE' });

      const filters = spec.value.filters ?? {};
      const comparisonFilters = spec.comparison?.filters ?? {};
      if (
        [...Object.keys(filters), ...Object.keys(comparisonFilters)].some(
          key => !source.columns.some(column => column.key === key && column.key !== measure.key)
        )
      )
        return outcome({ error: 'UNKNOWN_DIMENSION' });

      const current = findValue(source, measure.key, filters);
      if (!current) return outcome({ error: 'UNRESOLVED_VALUE' });
      const comparison = spec.comparison ? findValue(source, measure.key, comparisonFilters) : undefined;
      if (spec.comparison && (!comparison || comparison.currency !== current.currency)) {
        return outcome({ error: 'UNRESOLVED_COMPARISON' });
      }

      const indicator: ArtifactIndicator = {
        label: [measure.label, ...Object.values(filters)].join(' · '),
        value: current.value,
        currency: measure.type === 'currency' ? current.currency : undefined
      };
      if (comparison) {
        const change =
          comparison.value === 0 ? undefined : ((current.value - comparison.value) / Math.abs(comparison.value)) * 100;
        indicator.comparison = {
          label: Object.values(comparisonFilters).join(' · '),
          value: comparison.value,
          change: Number.isFinite(change) ? change : undefined
        };
      }
      cards.push(indicator);
    }
    const id = randomUUID();
    return outcome(
      { artifactId: id, cards },
      {
        type: 'artifact',
        artifact: {
          id,
          kind: 'indicators',
          title: input.title,
          cards,
          provenance: source.provenance,
          ...(source.query ? { replay: { tool: 'show_indicators' as const, source: source.query, input } } : {})
        }
      }
    );
  }
};
