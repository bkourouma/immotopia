import { randomUUID } from 'node:crypto';
import type { CopilotArtifact, CopilotToolContext } from '../../src/lib/ai/contracts';
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
