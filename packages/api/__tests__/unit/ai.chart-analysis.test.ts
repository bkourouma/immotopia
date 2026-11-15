import { randomUUID } from 'node:crypto';
import type { AnalysisTable, CopilotArtifact, CopilotToolContext } from '../../src/lib/ai/contracts';
import { chartAnalysisTool } from '../../src/lib/ai/tools/chart-analysis';

const id = randomUUID();
const table: Extract<CopilotArtifact, { kind: 'table' }> = {
  kind: 'table',
  id,
  title: 'Encaissements',
  columns: [
    { key: 'period', label: 'Période' },
    { key: 'amount', label: 'Montant', type: 'currency' }
  ],
  rows: [
    { period: '2025-10', amount: 1000, currency: 'XOF' },
    { period: '2025-10', amount: 40, currency: 'EUR' },
    { period: '2025-11', amount: 750, currency: 'XOF' }
  ],
  provenance: {
    source: 'Paiements',
    href: '/tenant/agency/rental/payments',
    period: '2025-11',
    calculatedAt: '2025-12-01',
    rules: []
  }
};
const ctx: CopilotToolContext = {
  tenantId: 'agency',
  userId: 'owner',
  conversationId: 'chat',
  requestId: 'turn',
  permissions: new Set(['PROPERTIES_VIEW']),
  seenLeaseIds: new Set(),
  signal: new AbortController().signal,
  analysisTables: new Map([[id, table]])
};
const input = {
  sourceId: id,
  title: 'Encaissements',
  dimension: 'period',
  measure: 'amount',
  chartType: 'bar' as const
};

it('reprend les valeurs calculées avec une série par devise et la provenance du tableau', async () => {
  const result = await chartAnalysisTool.execute(input, ctx);
  expect(result.uiEvent).toMatchObject({
    type: 'artifact',
    artifact: {
      kind: 'chart',
      provenance: table.provenance,
      series: [
        { key: 'value0', label: 'Montant · XOF' },
        { key: 'value1', label: 'Montant · EUR' }
      ],
      data: [
        { category: '2025-10', value0: 1000, value1: 40 },
        { category: '2025-11', value0: 750 }
      ]
    }
  });
});

it('refuse un tableau étranger à la conversation', async () => {
  await expect(chartAnalysisTool.execute({ ...input, sourceId: randomUUID() }, ctx)).rejects.toMatchObject({
    statusCode: 404
  });
});

const sourceId = '00000000-0000-4000-8000-000000000001';
const source: AnalysisTable = {
  kind: 'table',
  id: sourceId,
  title: 'Loyers',
  columns: [
    { key: 'period', label: 'Période' },
    { key: 'zone', label: 'Zone' },
    { key: 'amount', label: 'Montant', type: 'currency' }
  ],
  rows: [
    { period: '2026-09', zone: 'A', currency: 'XOF', amount: 8 },
    { period: '2026-09', zone: 'A', currency: 'XOF', amount: 2 },
    { period: '2026-09', zone: 'B', currency: 'XOF', amount: 6 },
    { period: '2026-10', zone: 'A', currency: 'XOF', amount: 12 },
    { period: '2026-10', zone: 'B', currency: 'XOF', amount: 0 }
  ],
  provenance: { ...table.provenance!, period: '2026-09' },
  query: { tool: 'rental_receipts', month: '2026-09' }
};

const context: CopilotToolContext = {
  tenantId: 'tenant',
  userId: 'user',
  requestId: 'request',
  conversationId: 'thread',
  signal: new AbortController().signal,
  permissions: new Set(['PROPERTIES_VIEW']),
  seenLeaseIds: new Set(),
  analysisTables: new Map([[sourceId, source]])
};

function run(override: Record<string, unknown>, data = source) {
  const input = chartAnalysisTool.inputSchema.parse({
    sourceId,
    title: 'Encaissements',
    dimension: 'period',
    measure: 'amount',
    chartType: 'bar',
    ...override
  });
  return chartAnalysisTool.execute(input, { ...context, analysisTables: new Map([[sourceId, data]]) });
}

it('agrège les catégories et permet de choisir la série sans perdre les zéros', async () => {
  const result = await run({ seriesBy: 'zone', chartType: 'stacked_area' });
  expect(result.uiEvent).toMatchObject({
    type: 'artifact',
    artifact: {
      chartType: 'stacked_area',
      data: [
        { category: '2026-09', value0: 10, value1: 6 },
        { category: '2026-10', value0: 12, value1: 0 }
      ],
      provenance: { rules: ['Les valeurs d’une même catégorie et série sont additionnées.'] },
      replay: { source: source.query, input: { chartType: 'stacked_area', seriesBy: 'zone' } }
    }
  });
  const average = await run({ chartType: 'area', aggregation: 'average' });
  expect(average.uiEvent).toMatchObject({
    artifact: {
      data: [
        { category: '2026-09', value0: 16 / 3 },
        { category: '2026-10', value0: 6 }
      ]
    }
  });
});

it('sépare les montants par devise et refuse l’empilement ou les parts entre devises', async () => {
  const dataset = { ...source, rows: [...source.rows, { period: '2026-09', zone: 'B', currency: 'EUR', amount: 7 }] };
  const grouped = await run({ chartType: 'horizontal_bar' }, dataset);
  expect(grouped.uiEvent).toMatchObject({
    artifact: {
      data: [
        { category: '2026-09', value0: 16, value1: 7 },
        { category: '2026-10', value0: 12 }
      ]
    }
  });
  for (const chartType of ['stacked_bar', 'donut']) {
    expect((await run({ chartType }, dataset)).modelResult).toMatchObject({ error: 'INCOMPATIBLE_UNITS' });
  }
});

it('produit un anneau si le jeu satisfait les contraintes des graphiques en parts', async () => {
  expect((await run({ chartType: 'donut' })).uiEvent).toMatchObject({
    artifact: {
      chartType: 'donut',
      data: [
        { category: '2026-09', value0: 16 },
        { category: '2026-10', value0: 12 }
      ]
    }
  });
  const negative = { ...source, rows: [...source.rows, { period: '2026-11', zone: 'A', currency: 'XOF', amount: -1 }] };
  expect((await run({ chartType: 'pie' }, negative)).modelResult).toMatchObject({ error: 'INVALID_PARTS' });
  expect((await run({ chartType: 'stacked_area' }, negative)).modelResult).toMatchObject({ error: 'NEGATIVE_AREA' });
});

it('garde les points de même abscisse et écarte les paires incomplètes du nuage', async () => {
  const dataset: AnalysisTable = {
    ...source,
    columns: [...source.columns, { key: 'surfaces', label: 'Surface', type: 'number' }],
    rows: [
      { surfaces: 0, amount: 7, currency: 'XOF' },
      { surfaces: 0, amount: 2, currency: 'XOF' },
      { surfaces: 30, amount: null, currency: 'XOF' },
      { surfaces: 40, amount: 11, currency: 'EUR' }
    ]
  };
  const args = { chartType: 'scatter', dimension: 'surfaces' };
  expect((await run(args, dataset)).modelResult).toMatchObject({ error: 'INCOMPATIBLE_UNITS' });
  const result = await run({ ...args, currency: 'XOF' }, dataset);
  expect(result.uiEvent).toMatchObject({
    artifact: {
      xLabel: 'Surface',
      series: [{ label: 'Montant · XOF' }],
      data: [
        { x: 0, value0: 7 },
        { x: 0, value0: 2 }
      ]
    }
  });
});

it('mélange barres et courbes sur des axes distincts et applique l’agrégat de chaque série', async () => {
  const dataset: AnalysisTable = {
    ...source,
    columns: [...source.columns, { key: 'rate', label: 'Taux', type: 'number' }],
    rows: [
      { period: '2026-10', amount: 80, rate: 60, currency: 'XOF' },
      { period: '2026-10', amount: 120, rate: 90, currency: 'XOF' },
      { period: '2026-11', amount: 180, rate: null, currency: 'XOF' }
    ]
  };
  const series = [{ measure: 'rate', form: 'line', axis: 'secondary', aggregation: 'average' }];
  const chart = await run({ chartType: 'combo', series }, dataset);
  expect(chart.uiEvent).toMatchObject({
    artifact: {
      series: [
        { key: 'value0', form: 'bar', axis: 'primary' },
        { key: 'value1', form: 'line', axis: 'secondary' }
      ],
      data: [
        { category: '2026-10', value0: 200, value1: 75 },
        { category: '2026-11', value0: 180, value1: null }
      ],
      replay: { input: { series } }
    }
  });
  expect(
    (await run({ chartType: 'combo', series: [{ ...series[0], axis: 'primary' }] }, dataset)).modelResult
  ).toMatchObject({ error: 'INCOMPATIBLE_UNITS' });
});
