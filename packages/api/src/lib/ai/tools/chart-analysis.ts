import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import {
  ANALYSIS_CHART_TYPES,
  COPILOT_ARTIFACT_MAX_CHART_POINTS,
  COPILOT_ARTIFACT_MAX_SERIES,
  type AnalysisChartSeries,
  type AnalysisTable,
  type ArtifactCell,
  type ChartScene,
  type CopilotToolDefinition
} from '../contracts';
import { chartScene } from '../artifact-chart-scene';
import { assertToolPermission, outcome } from './tool-utils';

const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
const aggregationSchema = z.enum(['sum', 'average']);
const seriesSchema = z
  .object({
    measure: key,
    form: z.enum(['bar', 'line']),
    axis: z.enum(['primary', 'secondary']).optional(),
    aggregation: aggregationSchema.optional()
  })
  .strict();
const schema = z
  .object({
    sourceId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    dimension: key,
    measure: key,
    chartType: z.enum(ANALYSIS_CHART_TYPES),
    seriesBy: key.optional(),
    aggregation: aggregationSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    series: z.array(seriesSchema).max(11).optional(),
    percent: z.boolean().optional(),
    targetMeasure: key.optional()
  })
  .strict();

type ChartInput = z.infer<typeof schema>;
type ChartParts = {
  xKey: string;
  xLabel: string;
  series: AnalysisChartSeries[];
  data: Record<string, ArtifactCell>[];
  rule?: string;
  groupKey?: string;
  groupLabel?: string;
  scene?: ChartScene;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const currencyOf = (value: ArtifactCell | undefined) => (value === 'FCFA' ? 'XOF' : String(value ?? ''));
const numeric = (column: AnalysisTable['columns'][number] | undefined) =>
  column?.type === 'number' || column?.type === 'currency';

function publish(input: ChartInput, source: AnalysisTable, { rule, ...parts }: ChartParts) {
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
        ...parts,
        provenance:
          source.provenance && rule
            ? { ...source.provenance, rules: [...source.provenance.rules, rule] }
            : source.provenance,
        ...(source.query ? { replay: { tool: 'chart_analysis' as const, source: source.query, input } } : {})
      }
    }
  );
}

const sceneTypes = ['heatmap', 'treemap', 'funnel', 'gauge'] as const;
type SceneType = (typeof sceneTypes)[number];
const isSceneType = (type: ChartInput['chartType']): type is SceneType => sceneTypes.some(value => type === value);

function plotScene(
  type: SceneType,
  input: ChartInput,
  source: AnalysisTable,
  dimension: AnalysisTable['columns'][number],
  measure: AnalysisTable['columns'][number]
) {
  const group = source.columns.find(column => column.key === input.seriesBy);
  const targetColumn = source.columns.find(column => column.key === input.targetMeasure);
  const invalid = () =>
    outcome({
      error: 'INVALID_SERIES',
      message: t('Vérifiez les mesures et les axes demandés pour ce graphique.')
    });
  const unavailable = () =>
    outcome({
      error: 'NO_PLOT_VALUES',
      message: t('Aucune valeur numérique à tracer.')
    });
  if (
    input.series?.length ||
    (type === 'heatmap' && (!group || group.key === dimension.key)) ||
    ((type === 'gauge' || type === 'funnel') && group) ||
    (type !== 'gauge' && (input.percent !== undefined || input.targetMeasure)) ||
    (input.targetMeasure && (!numeric(targetColumn) || targetColumn?.type !== measure.type)) ||
    (input.percent && measure.type !== 'number') ||
    ((type === 'funnel' || type === 'treemap') && input.aggregation === 'average')
  )
    return invalid();

  const selected = source.rows.filter(
    row => !input.currency || currencyOf(row.currency) === currencyOf(input.currency)
  );
  const values = selected.map(row => row[measure.key]).filter(finite);
  if (!values.length) return unavailable();
  const currencies =
    measure.type === 'currency'
      ? new Set(
          selected
            .filter(row => finite(row[measure.key]) || (targetColumn && finite(row[targetColumn.key])))
            .map(row => currencyOf(row.currency))
        )
      : new Set<string>();
  if (currencies.size > 1)
    return outcome({
      error: 'INCOMPATIBLE_UNITS',
      message: t('Ce graphique exige des valeurs additives de même unité.')
    });
  const label = [measure.label, [...currencies][0]].filter(Boolean).join(' · ');
  const series: AnalysisChartSeries[] = [{ key: 'value0', label }];

  if (type === 'gauge') {
    const percent = input.percent === true;
    // Un taux agrégé doit provenir du tableau métier sous forme d’une valeur unique.
    if (values.length > 8 || (percent && values.length !== 1) || input.aggregation === 'average') return invalid();
    const total = values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)).toNumber();
    const targets = targetColumn ? [...new Set(selected.map(row => row[targetColumn.key]).filter(finite))] : [];
    if (targetColumn && targets.length !== 1) return invalid();
    const target = targets[0];
    if (
      !finite(total) ||
      total < 0 ||
      (percent && total > 100) ||
      (target !== undefined && (target < 0 || (percent && target > 100)))
    )
      return invalid();
    const max = percent ? 100 : Math.min(Number.MAX_VALUE, Math.max(total, target ?? 0) * 1.25 || 1);
    if (target !== undefined) series.push({ key: 'target', label: t('Objectif') });
    return publish(input, source, {
      xKey: 'category',
      xLabel: dimension.label,
      series,
      data: [
        {
          category:
            values.length === 1
              ? String(selected.find(row => finite(row[measure.key]))?.[dimension.key] ?? label)
              : t('Total'),
          value0: total,
          ...(target !== undefined ? { target } : {})
        }
      ],
      scene: chartScene(type, [], { value: total, target, percent, max }),
      rule: percent
        ? t('La jauge utilise le taux calculé du jeu source sur une échelle de 0 à 100.')
        : t('La jauge utilise le total du jeu et affiche l’objectif fourni par la source lorsqu’il existe.')
    });
  }

  const buckets = new Map<string, { category: string; group?: string; sum: Prisma.Decimal; count: number }>();
  for (const row of selected) {
    const category = String(row[dimension.key] ?? t('Non renseigné'));
    const grouping = group ? String(row[group.key] ?? t('Non renseigné')) : undefined;
    const id = JSON.stringify([category, grouping]);
    const bucket = buckets.get(id) ?? { category, group: grouping, sum: new Prisma.Decimal(0), count: 0 };
    const value = row[measure.key];
    if (finite(value)) {
      bucket.sum = bucket.sum.plus(value);
      bucket.count += 1;
    }
    buckets.set(id, bucket);
  }
  const entries = [...buckets.values()].map(bucket => {
    const value = bucket.count
      ? (input.aggregation === 'average' ? bucket.sum.div(bucket.count) : bucket.sum).toNumber()
      : null;
    return { category: bucket.category, group: bucket.group, value: finite(value) ? value : null };
  });
  const columns = new Set(entries.map(entry => entry.category)).size;
  const rows = new Set(entries.map(entry => entry.group)).size;
  if (
    entries.length > COPILOT_ARTIFACT_MAX_CHART_POINTS ||
    (type === 'heatmap' && (columns > 20 || rows > 20 || columns * rows > 200))
  ) {
    return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
  }
  if (
    (type === 'treemap' || type === 'funnel') &&
    (entries.some(entry => (entry.value ?? 0) < 0) ||
      !entries.some(entry => (entry.value ?? 0) > 0) ||
      (type === 'funnel' && (entries.length < 2 || entries.length > 8)))
  )
    return invalid();
  entries.sort(
    type === 'heatmap'
      ? (a, b) => a.category.localeCompare(b.category) || String(a.group).localeCompare(String(b.group))
      : (a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)
  );
  const matrix =
    type === 'heatmap'
      ? [...new Set(entries.map(entry => entry.category))].flatMap(category =>
          [...new Set(entries.map(entry => entry.group))].map(group => ({
            category,
            group,
            value: entries.find(entry => entry.category === category && entry.group === group)?.value ?? null
          }))
        )
      : entries;
  return publish(input, source, {
    xKey: 'category',
    xLabel: dimension.label,
    series,
    ...(group ? { groupKey: 'group', groupLabel: group.label } : {}),
    data: matrix.map(entry => ({
      category: entry.category,
      ...(entry.group !== undefined ? { group: entry.group } : {}),
      value0: entry.value
    })),
    scene: chartScene(type, matrix),
    rule:
      type === 'heatmap'
        ? t('Les croisements sans valeur restent distincts des zéros.')
        : t('Les proportions sont calculées à partir des valeurs additives du jeu source.')
  });
}

function plotMeasures(
  input: ChartInput,
  source: AnalysisTable,
  dimension: AnalysisTable['columns'][number],
  measure: AnalysisTable['columns'][number]
) {
  const scatter = input.chartType === 'scatter';
  const specs = [
    { measure: input.measure, form: 'bar' as const, axis: 'primary' as const, aggregation: input.aggregation },
    ...(input.series ?? [])
  ];
  const columns = specs.map(spec => source.columns.find(column => column.key === spec.measure));
  if (
    input.seriesBy ||
    (scatter
      ? !numeric(dimension) || input.aggregation || specs.length !== 1
      : !specs.some(spec => spec.form === 'line') ||
        specs.some(spec => spec.measure === dimension.key) ||
        columns.some(column => !numeric(column)))
  ) {
    return outcome({
      error: 'INVALID_SERIES',
      message: t('Vérifiez les mesures et les axes demandés pour ce graphique.')
    });
  }
  const selected = source.rows.filter(
    row => !input.currency || currencyOf(row.currency) === currencyOf(input.currency)
  );
  const rows = scatter ? selected.filter(row => finite(row[dimension.key]) && finite(row[measure.key])) : selected;
  if (scatter && rows.length > COPILOT_ARTIFACT_MAX_CHART_POINTS) {
    return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
  }
  const monetary = (scatter && dimension.type === 'currency') || columns.some(column => column?.type === 'currency');
  const currencies = monetary ? new Set(rows.map(row => currencyOf(row.currency))) : new Set<string>();
  const units = specs.map((spec, index) => ({ axis: spec.axis ?? 'primary', type: columns[index]?.type }));
  const incompatibleAxis = ['primary', 'secondary'].some(
    axis => new Set(units.filter(unit => unit.axis === axis).map(unit => unit.type)).size > 1
  );
  if (currencies.size > 1 || (!scatter && incompatibleAxis)) {
    return outcome({
      error: 'INCOMPATIBLE_UNITS',
      message: t('Chaque axe doit utiliser une seule unité et une seule devise.')
    });
  }
  const currency = [...currencies][0];
  const label = (column: AnalysisTable['columns'][number]) =>
    [column.label, column.type === 'currency' ? currency : undefined].filter(Boolean).join(' · ');
  if (scatter) {
    return publish(input, source, {
      xKey: 'x',
      xLabel: label(dimension),
      series: [{ key: 'value0', label: label(measure) }],
      data: rows.map(row => ({ x: row[dimension.key], value0: row[measure.key] })),
      rule: t('Chaque point reprend les deux mesures de la même ligne source.')
    });
  }

  const groups = new Map<string, { sum: Prisma.Decimal; count: number }[]>();
  for (const row of rows) {
    const category = String(row[dimension.key] ?? '');
    const buckets = groups.get(category) ?? specs.map(() => ({ sum: new Prisma.Decimal(0), count: 0 }));
    groups.set(category, buckets);
    specs.forEach((spec, index) => {
      const value = row[spec.measure];
      if (!finite(value)) return;
      buckets[index].sum = buckets[index].sum.plus(value);
      buckets[index].count += 1;
    });
  }
  if (groups.size > COPILOT_ARTIFACT_MAX_CHART_POINTS) {
    return outcome({ error: 'TOO_MANY_POINTS', message: t('Le résultat dépasse la capacité de ce graphique.') });
  }
  const data = [...groups].map(([category, buckets]) => ({
    category,
    ...Object.fromEntries(
      buckets.map(({ sum, count }, index) => {
        const value = count ? (specs[index].aggregation === 'average' ? sum.div(count) : sum).toNumber() : null;
        return [`value${index}`, finite(value) ? value : null];
      })
    )
  }));
  if (dimension.key === 'period' || dimension.type === 'date')
    data.sort((a, b) => a.category.localeCompare(b.category));
  return publish(input, source, {
    xKey: 'category',
    xLabel: dimension.label,
    series: specs.map((spec, index) => ({
      key: `value${index}`,
      label: label(columns[index]!),
      form: spec.form,
      axis: spec.axis ?? 'primary'
    })),
    data,
    rule: t('Les séries du graphique combiné utilisent leur agrégation et leur axe respectifs.')
  });
}

export const chartAnalysisTool: CopilotToolDefinition<typeof schema> = {
  name: 'chart_analysis',
  description:
    'Publie un graphique fondé sur un tableau du fil. Pour un taux, utilise aggregation=average hors jauge. scatter trace deux mesures numériques sans agrégation. combo utilise measure pour la barre principale et series pour les autres mesures. heatmap exige seriesBy comme seconde dimension. treemap accepte seriesBy comme groupe parent. funnel affiche de deux à huit étapes. Pour gauge, percent=true exige un taux unique ; targetMeasure référence un objectif fourni par le tableau. currency peut isoler une devise pour ces formes.',
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
      aggregation: { type: 'string', enum: ['sum', 'average'] },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      percent: { type: 'boolean' },
      targetMeasure: { type: 'string' },
      series: {
        type: 'array',
        maxItems: 11,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['measure', 'form'],
          properties: {
            measure: { type: 'string' },
            form: { type: 'string', enum: ['bar', 'line'] },
            axis: { type: 'string', enum: ['primary', 'secondary'] },
            aggregation: { type: 'string', enum: ['sum', 'average'] }
          }
        }
      }
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
    if (isSceneType(input.chartType)) return plotScene(input.chartType, input, source, dimension, measure);
    if (input.percent !== undefined || input.targetMeasure) {
      return outcome({
        error: 'INVALID_SERIES',
        message: t('Vérifiez les mesures et les axes demandés pour ce graphique.')
      });
    }
    if (input.chartType === 'scatter' || input.chartType === 'combo')
      return plotMeasures(input, source, dimension, measure);
    if (input.currency || input.series?.length) {
      return outcome({
        error: 'INVALID_SERIES',
        message: t('Vérifiez les mesures et les axes demandés pour ce graphique.')
      });
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
    const rule =
      input.aggregation === 'average'
        ? t('Les valeurs d’une même catégorie et série sont agrégées par moyenne.')
        : combined
          ? t('Les valeurs d’une même catégorie et série sont additionnées.')
          : undefined;
    return publish(input, source, { xKey, xLabel: dimension.label, series: [...series.values()], data, rule });
  }
};
