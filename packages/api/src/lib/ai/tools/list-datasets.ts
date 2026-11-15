import { z } from 'zod';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import { datasetCatalog, isDatasetName } from '../dataset-catalog';
import type { CopilotToolDefinition } from '../contracts';
import { outcome } from './tool-utils';

const inputSchema = z
  .object({
    dataset: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/)
      .optional()
  })
  .strict();

/** Outil documentaire construit à partir des outils réellement autorisés pour le tour. */
export function withDatasetCatalog(tools: readonly CopilotToolDefinition[]): readonly CopilotToolDefinition[] {
  const datasets = tools.filter(tool => isDatasetName(tool.name));
  if (datasets.length === 0) return tools;

  const catalog: CopilotToolDefinition<typeof inputSchema> = {
    name: 'list_datasets',
    description:
      'Consulte les jeux métier accessibles avant de calculer. Sans dataset, renvoie les jeux disponibles. Avec leur identifiant exact, renvoie le grain, les dimensions, les définitions et unités des mesures, les filtres acceptés et les périodes. Le catalogue ne lance aucun calcul.',
    inputSchema,
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        dataset: { type: 'string', maxLength: 64, description: 'Identifiant exact du jeu à décrire.' }
      }
    },
    feature: datasets[0].feature,
    requiredPermission: datasets[0].requiredPermission,
    kind: 'read',
    async execute({ dataset }, ctx) {
      const allowed = datasets.filter(
        tool =>
          ctx.permissions.has(tool.requiredPermission) &&
          (tool.additionalPermissions ?? []).every(p => ctx.permissions.has(p))
      );
      if (!dataset) {
        return outcome({
          total: allowed.length,
          items: allowed.flatMap(tool =>
            isDatasetName(tool.name)
              ? [{ id: tool.name, title: t(datasetCatalog[tool.name].title), module: tool.feature }]
              : []
          )
        });
      }
      const tool = allowed.find(candidate => candidate.name === dataset);
      if (!tool || !isDatasetName(dataset)) throw new NotFoundError(t('Jeu de données indisponible.'));
      const entry = datasetCatalog[dataset];
      const filters = Object.fromEntries(
        Object.entries((tool.jsonSchema.properties ?? {}) as Record<string, unknown>).map(([key, filter]) => [
          key,
          filter && typeof filter === 'object' && 'description' in filter && typeof filter.description === 'string'
            ? { ...filter, description: t(filter.description) }
            : filter
        ])
      );
      return outcome({
        id: dataset,
        title: t(entry.title),
        module: tool.feature,
        grain: t(entry.grain),
        dimensions: Object.entries(entry.dimensions).map(([key, label]) => ({ key, label: t(label) })),
        measures: Object.entries(entry.measures).map(([key, [label, unit, definition]]) => ({
          key,
          label: t(label),
          unit,
          format: unit === 'currency' || unit === 'XOF' ? 'currency' : unit === 'percent' ? 'percent' : 'number',
          definition: t(definition)
        })),
        filters,
        requiredFilters: tool.jsonSchema.required ?? [],
        defaultPeriod: t(entry.defaultPeriod),
        granularities: entry.granularities,
        ...('view' in entry ? { view: entry.view } : {})
      });
    }
  };
  return [...tools, catalog];
}
