import { Readable } from 'node:stream';
import { Workbook } from 'exceljs';
import { artifactColumnGroups, artifactExportSections } from '../../src/lib/ai/artifact-pdf';
import { buildArtifactXlsx } from '../../src/lib/ai/artifact-spreadsheet';
import type { AnalysisTable, CopilotToolContext } from '../../src/lib/ai/contracts';
import { pivotAnalysisTool, pivotInputSchema } from '../../src/lib/ai/tools/pivot-analysis';

const sourceId = '44444444-4444-4444-8444-444444444444';
const source: AnalysisTable = {
  kind: 'table',
  id: sourceId,
  title: 'Source',
  columns: [
    { key: 'zone', label: 'Zone' },
    { key: 'period', label: 'Période' },
    { key: 'currency', label: 'Devise' },
    { key: 'amount', label: 'Montant', type: 'currency' }
  ],
  rows: [
    { zone: 'Étage', period: '2026-09', currency: 'XOF', amount: 2 },
    { zone: 'Étage', period: '2026-09', currency: 'XOF', amount: 4 },
    { zone: 'Annexe', period: '2026-09', currency: 'XOF', amount: 12 },
    { zone: 'Étage', period: '2026-10', currency: 'XOF', amount: 10 },
    { zone: 'Étage', period: '2026-10', currency: 'EUR', amount: 70 }
  ],
  provenance: {
    source: 'Source',
    href: '/tenant/t1/properties',
    period: '2026',
    calculatedAt: '2026-11-15T00:00:00Z',
    rules: []
  }
};

const input = {
  sourceId,
  title: 'Synthèse',
  rows: ['zone'],
  columns: ['period'],
  values: [{ key: 'amount', operation: 'average' }]
};

function run(overrides: Record<string, unknown>, dataset = source) {
  const context: CopilotToolContext = {
    tenantId: 'tenant',
    userId: 'user',
    permissions: new Set(['PROPERTIES_VIEW']),
    requestId: 'request',
    conversationId: 'conversation',
    signal: new AbortController().signal,
    seenLeaseIds: new Set(),
    analysisTables: new Map([[sourceId, dataset]])
  };
  return pivotAnalysisTool.execute(pivotInputSchema.parse({ ...input, ...overrides }), context);
}

function tableFrom(result: Awaited<ReturnType<typeof run>>): AnalysisTable {
  if (result.uiEvent?.type !== 'artifact' || result.uiEvent.artifact.kind !== 'table') {
    throw new Error('tableau croisé attendu');
  }
  return result.uiEvent.artifact;
}

it('calcule la moyenne totale sur les lignes source et laisse les croisements absents vides', async () => {
  const filters = [{ key: 'currency', op: 'in', value: ['XOF'] }];
  const table = tableFrom(await run({ filters }));
  const [, september, october] = table.columns.map(column => column.key);
  expect(table).toMatchObject({
    rows: [
      { zone: 'Annexe', [september]: 12, [october]: null },
      { zone: 'Étage', [september]: 3, [october]: 10 }
    ],
    totals: { zone: 'Total', [september]: 6, [october]: 10 }
  });
  const later = tableFrom(
    await run({ filters }, { ...source, rows: source.rows.filter(row => row.period === '2026-10') })
  );
  expect(later.columns.at(-1)?.key).toBe(october);
});

it('dissocie les devises et omet un total monétaire mélangé', async () => {
  const missing = await run({});
  expect(missing.modelResult).toEqual({ error: 'PIVOT_REQUIRES_CURRENCY_DIMENSION' });
  const separated = tableFrom(await run({ rows: ['currency', 'zone'] }));
  const [, , september, october] = separated.columns.map(column => column.key);
  expect(separated).toMatchObject({
    rows: expect.arrayContaining([
      { currency: 'EUR', zone: 'Étage', [september]: null, [october]: 70 },
      { currency: 'XOF', zone: 'Étage', [september]: 3, [october]: 10 }
    ]),
    totals: { currency: 'Total', [september]: 6, [october]: null }
  });
});

it('filtre le texte sans accents, ignore un filtre invalide et calcule les quatre autres agrégats', async () => {
  const result = await run({
    columns: [],
    filters: [
      { key: 'zone', op: 'contains', value: 'etage' },
      { key: 'currency', op: 'eq', value: 'XOF' },
      { key: 'amount', op: 'between', value: [0, 12] },
      { key: 'amount', op: 'in', value: 7 }
    ],
    values: ['sum', 'min', 'max', 'count'].map(operation => ({ key: 'amount', operation }))
  });
  expect(result.uiEvent).toMatchObject({
    artifact: { rows: [{ zone: 'Étage', pivot_0: 16, pivot_1: 2, pivot_2: 10, pivot_3: 3 }] }
  });
});

it('refuse un jeu partiel ou un résultat trop large', async () => {
  expect((await run({}, { ...source, truncated: true })).modelResult).toEqual({ error: 'INCOMPLETE_DATASET' });
  const rows = Array.from({ length: 50 }, (_, period) => ({ zone: 'Annexe', period, amount: period, currency: 'XOF' }));
  expect((await run({}, { ...source, rows })).modelResult).toEqual({ error: 'TOO_MANY_PIVOT_COLUMNS' });
});

it('répète toutes les dimensions sur les pages et conserve le total numérique dans Excel', async () => {
  expect(artifactColumnGroups(8, 3)).toEqual([
    [0, 1, 2, 3, 4, 5],
    [0, 1, 2, 6, 7]
  ]);
  const artifact = tableFrom(await run({ rows: ['zone', 'currency'] }));
  const [grid] = artifactExportSections(artifact);
  expect(grid).toMatchObject({ dimensionColumns: 2, hasTotals: true });
  const workbook = new Workbook();
  await workbook.xlsx.read(Readable.from([await buildArtifactXlsx(artifact)]));
  const sheet = workbook.worksheets[0];
  expect(sheet.getCell('A6').value).toBe('Total');
  expect(sheet.getCell('C6').value).toBe(6);
  expect(sheet.getCell('D6').value).toBeNull();
});
