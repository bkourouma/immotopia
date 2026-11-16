import { randomUUID } from 'node:crypto';
import type { AnalysisTable, CopilotToolContext } from '../../src/lib/ai/contracts';
import { showIndicatorsTool } from '../../src/lib/ai/tools/show-indicators';
import { composeReportTool } from '../../src/lib/ai/tools/compose-report';

const sourceId = randomUUID();
const source: AnalysisTable = {
  kind: 'table',
  id: sourceId,
  title: 'Recettes',
  columns: [
    { key: 'period', label: 'Période' },
    { key: 'currency', label: 'Devise' },
    { key: 'amount', label: 'Montant', type: 'currency' }
  ],
  rows: [
    { period: '2026-10', currency: 'XOF', amount: 150 },
    { period: '2026-09', currency: 'XOF', amount: 100 },
    { period: '2026-10', currency: 'EUR', amount: 20 }
  ],
  provenance: {
    source: 'Paiements',
    href: '/tenant/agency/rental/payments',
    period: '2026-10',
    calculatedAt: '2026-11-03T00:00:00Z',
    rules: ['Paiements réussis']
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
  analysisTables: new Map([[sourceId, source]])
};

it('calcule la variation uniquement depuis deux lignes de la même devise', async () => {
  const request = {
    sourceId,
    title: 'Recettes',
    cards: [
      {
        measure: 'amount',
        value: { filters: { period: '2026-10', currency: 'XOF' } },
        comparison: { filters: { period: '2026-09', currency: 'XOF' } }
      }
    ]
  };
  const result = await showIndicatorsTool.execute(request, ctx);
  expect(result.uiEvent).toMatchObject({
    type: 'artifact',
    artifact: {
      kind: 'indicators',
      provenance: source.provenance,
      cards: [{ value: 150, currency: 'XOF', comparison: { value: 100, change: 50 } }]
    }
  });

  const ambiguous = { ...request, cards: [{ measure: 'amount', value: { filters: { period: '2026-10' } } }] };
  await expect(showIndicatorsTool.execute(ambiguous, ctx)).resolves.toMatchObject({
    modelResult: { error: 'UNRESOLVED_VALUE' }
  });
  const differentCurrency = {
    ...request,
    cards: [{ ...request.cards[0], comparison: { filters: { period: '2026-10', currency: 'EUR' } } }]
  };
  await expect(showIndicatorsTool.execute(differentCurrency, ctx)).resolves.toMatchObject({
    modelResult: { error: 'UNRESOLVED_COMPARISON' }
  });
});

it('insère le tableau du serveur et refuse une référence absente de la conversation', async () => {
  const result = await composeReportTool.execute(
    {
      title: 'Bilan',
      blocks: [
        { kind: 'text', content: '## Recettes' },
        { kind: 'table', sourceId }
      ]
    },
    ctx
  );
  expect(result.uiEvent).toMatchObject({
    type: 'artifact',
    artifact: {
      kind: 'document',
      blocks: [
        { kind: 'text', content: '## Recettes' },
        { kind: 'table', table: source }
      ]
    }
  });
  await expect(
    composeReportTool.execute(
      {
        title: 'Bilan',
        blocks: [{ kind: 'table', sourceId: randomUUID() }]
      },
      ctx
    )
  ).rejects.toMatchObject({ statusCode: 404 });
});
