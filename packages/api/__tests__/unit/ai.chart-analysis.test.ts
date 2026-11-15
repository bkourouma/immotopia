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
it('trace une carte de chaleur avec des cellules distinctes pour zéro et les croisements manquants', async () => {
  const dataset = {
    ...source,
    rows: [
      { period: '2026-09', zone: 'A', currency: 'XOF', amount: 0 },
      { period: '2026-10', zone: 'B', currency: 'XOF', amount: -6 },
      { period: '2026-10', zone: 'B', currency: 'XOF', amount: -4 }
    ]
  };
  const result = await run({ chartType: 'heatmap', seriesBy: 'zone' }, dataset);
  expect(result.uiEvent).toMatchObject({
    artifact: {
      groupKey: 'group',
      groupLabel: 'Zone',
      data: [
        { category: '2026-09', group: 'A', value0: 0 },
        { category: '2026-09', group: 'B', value0: null },
        { category: '2026-10', group: 'A', value0: null },
        { category: '2026-10', group: 'B', value0: -10 }
      ],
      scene: {
        marks: expect.arrayContaining([
          expect.objectContaining({ tip: '2026-09 · A: 0', color: 'f6f6f6' }),
          expect.objectContaining({ tip: '2026-10 · A: —', color: 'E7EDF4' })
        ])
      }
    }
  });
});

it('trace un treemap hiérarchique et classe les étapes de l’entonnoir par valeur', async () => {
  const tree = await run({ chartType: 'treemap', seriesBy: 'zone' });
  expect(tree.uiEvent).toMatchObject({
    artifact: {
      groupLabel: 'Zone',
      scene: { marks: expect.arrayContaining([expect.objectContaining({ tip: 'A · 2026-10: 12' })]) }
    }
  });
  const funnel = await run({ chartType: 'funnel', dimension: 'zone' });
  expect(funnel.uiEvent).toMatchObject({
    artifact: {
      data: [
        { category: 'A', value0: 22 },
        { category: 'B', value0: 6 }
      ],
      scene: { marks: expect.arrayContaining([expect.objectContaining({ tip: 'A', w: 355 })]) }
    }
  });
});

it('utilise le taux fourni et valide la cible de la jauge sans fabriquer de seuil', async () => {
  const dataset: AnalysisTable = {
    ...source,
    columns: [
      ...source.columns,
      { key: 'rate', label: 'Taux', type: 'number' },
      { key: 'goal', label: 'Cible', type: 'number' }
    ],
    rows: [{ period: '2026-10', rate: 75, goal: 90 }]
  };
  const args = { chartType: 'gauge', measure: 'rate', percent: true, targetMeasure: 'goal' };
  expect((await run(args, dataset)).uiEvent).toMatchObject({
    artifact: {
      data: [{ category: '2026-10', value0: 75, target: 90 }],
      scene: { marks: expect.arrayContaining([expect.objectContaining({ text: 'Objectif : 90 %' })]) }
    }
  });
  expect(
    (await run(args, { ...dataset, rows: [...dataset.rows, { period: '2026-09', rate: 82, goal: 90 }] })).modelResult
  ).toMatchObject({ error: 'INVALID_SERIES' });
  const noGoal = await run({ chartType: 'gauge' });
  expect(noGoal.uiEvent).toMatchObject({ artifact: { data: [{ category: 'Total', value0: 28 }] } });
  expect(JSON.stringify(noGoal.uiEvent)).not.toContain('Objectif');
});
it('regroupe le reste d’un Top N additif et omet le reste d’une moyenne', async () => {
  const args = { dimension: 'zone', chartType: 'bar', limit: 1 };
  expect((await run(args)).uiEvent).toMatchObject({
    artifact: {
      data: [
        { category: 'A', value0: 22 },
        { category: 'Autres', value0: 6 }
      ],
      notices: [
        'Le graphique est limité à une catégorie.',
        'Les valeurs additives restantes sont regroupées dans « Autres ».'
      ],
      replay: { input: { limit: 1 } }
    }
  });
  expect((await run({ ...args, aggregation: 'average' })).uiEvent).toMatchObject({
    artifact: {
      data: [{ category: 'A', value0: 22 / 3 }],
      notices: ['Le graphique est limité à une catégorie.']
    }
  });
});

it('conserve les dernières périodes même si un ancien mois a une valeur supérieure', async () => {
  expect((await run({ chartType: 'line', limit: 1 })).uiEvent).toMatchObject({
    artifact: {
      data: [{ category: '2026-10', value0: 12 }],
      notices: ['Seule la période la plus récente est affichée.']
    }
  });
});

it('convertit neuf parts en barres horizontales et annonce le changement', async () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({ zone: `Zone ${index}`, amount: index + 1, currency: 'XOF' }));
  const result = await run({ chartType: 'pie', dimension: 'zone' }, { ...source, rows });
  expect(result.uiEvent).toMatchObject({
    artifact: {
      chartType: 'horizontal_bar',
      notices: ['Plus de huit parts : le graphique est présenté en barres horizontales.'],
      replay: { input: { chartType: 'pie' } }
    }
  });
});
