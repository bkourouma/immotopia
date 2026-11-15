import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { currentAssistantLanguage, t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import type { AnalysisTable, ArtifactCell, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
const operations = ['sum', 'average', 'min', 'max', 'count'] as const;
const comparisons = ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'between'] as const;
const cell = z.union([z.string().max(500), z.number().finite(), z.null()]);
export const pivotInputSchema = z
  .object({
    sourceId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    rows: z.array(key).min(1).max(3),
    columns: z.array(key).max(2).default([]),
    values: z
      .array(z.object({ key, operation: z.enum(operations) }).strict())
      .min(1)
      .max(6),
    filters: z
      .array(z.object({ key, op: z.enum(comparisons), value: z.union([cell, z.array(cell).min(1).max(100)]) }).strict())
      .max(10)
      .default([])
  })
  .strict();

type PivotInput = z.infer<typeof pivotInputSchema>;
type Row = AnalysisTable['rows'][number];
type Column = AnalysisTable['columns'][number];
type Measure = { column: Column; operation: (typeof operations)[number] };
type Bucket = {
  count: number;
  sum: Prisma.Decimal;
  min: number;
  max: number;
  currency?: string;
  mixedCurrency: boolean;
};
type Group = { dimension: ArtifactCell[]; cells: Map<string, Bucket[]> };

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

function validFilter({ op, value }: PivotInput['filters'][number]): boolean {
  if (op === 'in') return Array.isArray(value);
  if (op === 'between') return Array.isArray(value) && value.length === 2 && compare(value[0], value[1]) !== undefined;
  if (Array.isArray(value)) return false;
  if (op === 'contains') return typeof value === 'string';
  return value !== null || op === 'eq' || op === 'ne';
}

function compare(a: ArtifactCell, b: ArtifactCell): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return undefined;
}

function matches(row: Row, filter: PivotInput['filters'][number]): boolean {
  const actual = row[filter.key] ?? null;
  const { op, value } = filter;
  if (Array.isArray(value)) {
    if (op === 'in') return value.includes(actual);
    if (op !== 'between' || value.length !== 2) return true;
    const lower = compare(actual, value[0]);
    const upper = compare(actual, value[1]);
    return lower !== undefined && upper !== undefined && lower >= 0 && upper <= 0;
  }
  if (op === 'eq') return actual === value;
  if (op === 'ne') return actual !== value;
  if (op === 'contains')
    return typeof value !== 'string' || (typeof actual === 'string' && fold(actual).includes(fold(value)));
  const order = compare(actual, value);
  if (order === undefined) return false;
  if (op === 'gt') return order > 0;
  if (op === 'gte') return order >= 0;
  if (op === 'lt') return order < 0;
  if (op === 'lte') return order <= 0;
  return true;
}

function addRow(target: Map<string, Bucket[]>, columnKey: string, measures: Measure[], row: Row) {
  let buckets = target.get(columnKey);
  if (!buckets) {
    buckets = measures.map(() => ({
      count: 0,
      sum: new Prisma.Decimal(0),
      min: Infinity,
      max: -Infinity,
      mixedCurrency: false
    }));
    target.set(columnKey, buckets);
  }
  for (const [index, measure] of measures.entries()) {
    const bucket = buckets[index];
    const value = row[measure.column.key];
    if (value == null) continue;
    if (measure.operation === 'count') {
      bucket.count += 1;
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (measure.column.type === 'currency') {
      const currency = row.currency === 'FCFA' ? 'XOF' : row.currency;
      if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) bucket.mixedCurrency = true;
      else {
        bucket.mixedCurrency ||= bucket.currency !== undefined && currency !== bucket.currency;
        bucket.currency ??= currency;
      }
    }
    bucket.count += 1;
    bucket.sum = bucket.sum.plus(value);
    bucket.min = Math.min(bucket.min, value);
    bucket.max = Math.max(bucket.max, value);
  }
}

function aggregate(bucket: Bucket | undefined, operation: Measure['operation']): ArtifactCell {
  if (operation === 'count') return bucket?.count ?? 0;
  if (!bucket?.count || bucket.mixedCurrency) return null;
  if (operation === 'min') return bucket.min;
  if (operation === 'max') return bucket.max;
  const result = (operation === 'sum' ? bucket.sum : bucket.sum.div(bucket.count)).toNumber();
  return Number.isFinite(result) ? result : null;
}

const MAX_COLUMNS = 50;
const permission = 'PROPERTIES_VIEW';

export const pivotAnalysisTool: CopilotToolDefinition<typeof pivotInputSchema> = {
  name: 'pivot_analysis',
  description:
    'Construit un tableau croisé et ses totaux à partir d’un jeu déjà calculé dans le fil. Indique les clés exactes des dimensions et des mesures. Ajoute la dimension currency lorsque le jeu contient plusieurs devises. Fournis des clés et des agrégats, jamais des chiffres à afficher.',
  inputSchema: pivotInputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['sourceId', 'title', 'rows', 'values'],
    properties: {
      sourceId: { type: 'string', format: 'uuid' },
      title: { type: 'string', maxLength: 120 },
      rows: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
      columns: { type: 'array', maxItems: 2, items: { type: 'string' } },
      values: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          required: ['key', 'operation'],
          additionalProperties: false,
          properties: { key: { type: 'string' }, operation: { type: 'string', enum: operations } }
        }
      },
      filters: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          required: ['key', 'op', 'value'],
          additionalProperties: false,
          properties: {
            key: { type: 'string' },
            op: { type: 'string', enum: comparisons },
            value: {
              anyOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'null' },
                { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] } }
              ]
            }
          }
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
    if (source.dimensionColumns || source.query?.tool === 'pivot_analysis') {
      return outcome({ error: 'PIVOT_REQUIRES_ORIGINAL_DATASET' });
    }

    const byKey = new Map(source.columns.map(column => [column.key, column]));
    const dimensions = [...input.rows, ...input.columns];
    if (new Set(dimensions).size !== dimensions.length || dimensions.some(name => !byKey.has(name))) {
      return outcome({ error: 'UNKNOWN_DIMENSION' });
    }
    const measures: Measure[] = [];
    for (const value of input.values) {
      const column = byKey.get(value.key);
      if (!column || (value.operation !== 'count' && column.type !== 'number' && column.type !== 'currency')) {
        return outcome({ error: 'UNKNOWN_MEASURE' });
      }
      measures.push({ column, operation: value.operation });
    }

    const filters = input.filters.filter(filter => byKey.has(filter.key) && validFilter(filter));
    const money = measures.some(measure => measure.column.type === 'currency' && measure.operation !== 'count');
    const currencies = new Set<string>();
    const rowGroups = new Map<string, Group>();
    const columnGroups = new Map<string, ArtifactCell[]>();
    const columnTotals = new Map<string, Bucket[]>();
    if (!input.columns.length) columnGroups.set('[]', []);
    for (const row of source.rows) {
      if (!filters.every(filter => matches(row, filter))) continue;
      if (money && typeof row.currency === 'string') currencies.add(row.currency === 'FCFA' ? 'XOF' : row.currency);
      const dimension = input.rows.map(name => row[name] ?? null);
      const columnDimension = input.columns.map(name => row[name] ?? null);
      const rowKey = JSON.stringify(dimension);
      const columnKey = JSON.stringify(columnDimension);
      const group = rowGroups.get(rowKey) ?? { dimension, cells: new Map<string, Bucket[]>() };
      rowGroups.set(rowKey, group);
      columnGroups.set(columnKey, columnDimension);
      if (input.rows.length + columnGroups.size * measures.length > MAX_COLUMNS) {
        return outcome({ error: 'TOO_MANY_PIVOT_COLUMNS' });
      }
      addRow(group.cells, columnKey, measures, row);
      addRow(columnTotals, columnKey, measures, row);
    }
    if (currencies.size > 1 && !dimensions.includes('currency')) {
      return outcome({ error: 'PIVOT_REQUIRES_CURRENCY_DIMENSION' });
    }
    const onlyCurrency = currencies.size === 1 ? [...currencies][0] : undefined;
    const compareText = new Intl.Collator(currentAssistantLanguage(), { numeric: true, sensitivity: 'base' }).compare;
    function order(a: ArtifactCell[], b: ArtifactCell[]) {
      for (const [i, value] of a.entries()) {
        if (value === b[i]) continue;
        if (value === null) return 1;
        if (b[i] === null) return -1;
        const delta =
          typeof value === 'number' && typeof b[i] === 'number'
            ? value - b[i]
            : compareText(String(value), String(b[i]));
        if (delta) return delta;
      }
      return 0;
    }
    const labels = {
      sum: t('Somme'),
      average: t('Valeur moyenne'),
      min: t('Minimum'),
      max: t('Maximum'),
      count: t('Nombre')
    };
    const outputColumns = [...columnGroups]
      .sort((a, b) => order(a[1], b[1]))
      .flatMap(([columnKey, cells]) =>
        measures.map(({ column, operation }, index) => {
          const suffix = input.columns.length
            ? createHash('sha256')
                .update(JSON.stringify([columnKey, index]))
                .digest('hex')
                .slice(0, 24)
            : String(index);
          let outputKey = `pivot_${suffix}`;
          // Les clés de dimension appartiennent au jeu et peuvent être choisies dans un fichier importé.
          while (input.rows.includes(outputKey)) outputKey += '_';
          const prefix = cells.map(value => value ?? t('Non renseigné'));
          const unit =
            !dimensions.includes('currency') && onlyCurrency && column.type === 'currency' && operation !== 'count'
              ? ` (${onlyCurrency})`
              : '';
          return {
            columnKey,
            index,
            operation,
            column: {
              key: outputKey,
              label: [...prefix, `${column.label} · ${labels[operation]}${unit}`].join(' / '),
              type: operation === 'count' ? ('number' as const) : column.type
            }
          };
        })
      );
    const valuesFor = (source: Map<string, Bucket[]>) =>
      Object.fromEntries(
        outputColumns.map(({ column, columnKey, index, operation }) => [
          column.key,
          aggregate(source.get(columnKey)?.[index], operation)
        ])
      );
    const rows = [...rowGroups.values()]
      .sort((a, b) => order(a.dimension, b.dimension))
      .map(group => ({
        ...Object.fromEntries(input.rows.map((name, index) => [name, group.dimension[index]])),
        ...valuesFor(group.cells)
      }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: input.title,
      columns: [
        ...input.rows.map(name => {
          const { key, label, type } = byKey.get(name)!;
          return { key, label, type };
        }),
        ...outputColumns.map(item => item.column)
      ],
      rows,
      totals: { [input.rows[0]]: t('Total'), ...valuesFor(columnTotals) },
      dimensionColumns: input.rows.length,
      provenance: {
        ...source.provenance,
        rules: [
          ...source.provenance.rules,
          t('Le total reprend les lignes source après filtrage.'),
          ...(money ? [t('Les montants de devises différentes ou inconnues restent séparés.')] : [])
        ]
      },
      ...(source.query ? { query: { tool: 'pivot_analysis' as const, source: source.query, input } } : {})
    };
    return outcome(
      {
        artifactId: artifact.id,
        count: rows.length,
        columns: artifact.columns.map(column => column.key),
        totals: artifact.totals
      },
      { type: 'artifact', artifact }
    );
  }
};
