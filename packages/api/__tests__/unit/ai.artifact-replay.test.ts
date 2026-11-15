import { Prisma } from '@prisma/client';
import { replayArtifact } from '../../src/lib/ai/artifact-replay';
import { rentalReceiptsTool } from '../../src/lib/ai/tools/rental-receipts';
import { buildArtifactCsv } from '../../src/lib/ai/artifact-spreadsheet';
import type { AnalysisTable } from '../../src/lib/ai/contracts';
import { chartAnalysisTool } from '../../src/lib/ai/tools/chart-analysis';
import { showIndicatorsTool } from '../../src/lib/ai/tools/show-indicators';

const mockGroupBy = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { rentalPayment: { groupBy: (...args: unknown[]) => mockGroupBy(...args) } }
}));

const stored: AnalysisTable = {
  kind: 'table',
  id: 'saved',
  title: 'Encaissements',
  columns: [{ key: 'amount', label: 'Montant', type: 'currency' }],
  rows: [{ amount: 100 }],
  query: { tool: 'rental_receipts', month: '2025-06' }
};
const scope = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  conversationId: 'thread',
  permissions: new Set(['RENTAL_PAYMENTS_VIEW']),
  tools: [rentalReceiptsTool]
};
beforeEach(() => mockGroupBy.mockReset());

it('rejoue le mois enregistré dans le périmètre courant et utilise les nouveaux montants dans le CSV', async () => {
  mockGroupBy.mockResolvedValue([{ currency: 'XOF', _sum: { amount: new Prisma.Decimal(275) }, _count: { _all: 1 } }]);
  const fresh = await replayArtifact(stored, scope);
  expect(mockGroupBy).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      where: {
        tenant_id: 'tenant-a',
        status: 'SUCCESS',
        succeeded_at: { gte: new Date('2025-06-01T00:00:00Z'), lt: new Date('2025-07-01T00:00:00Z') }
      }
    })
  );
  expect(fresh).toMatchObject({ id: stored.id, rows: [{ amount: 275 }, { amount: 275 }, { amount: 275 }] });
  expect(buildArtifactCsv(fresh).toString()).toContain(';275;');
});

it('refuse le recalcul sans outil autorisé avant de consulter les paiements', async () => {
  await expect(replayArtifact(stored, { ...scope, tools: [] })).rejects.toMatchObject({ statusCode: 403 });
  expect(mockGroupBy).not.toHaveBeenCalled();
});

it('partage des graphiques et indicateurs fraîchement calculés sans titre privé ni paramètres internes', async () => {
  mockGroupBy.mockResolvedValue([{ currency: 'XOF', _sum: { amount: new Prisma.Decimal(275) }, _count: { _all: 1 } }]);
  const sourceId = '06c96ee8-5aa9-468f-887e-d8c823a27b96';
  const title = 'Titre privé';
  const permissions = new Set([...scope.permissions, 'PROPERTIES_VIEW']);
  const tools = [...scope.tools, chartAnalysisTool, showIndicatorsTool];
  const chart = await replayArtifact(
    {
      kind: 'chart',
      id: 'chart',
      title,
      chartType: 'bar',
      xKey: 'category',
      series: [],
      data: [{ value0: 100 }],
      replay: {
        tool: 'chart_analysis',
        source: stored.query!,
        input: { title, sourceId, chartType: 'bar', dimension: 'period', measure: 'amount' }
      }
    },
    { ...scope, permissions, tools },
    true
  );
  expect(chart).toMatchObject({
    kind: 'chart',
    id: 'chart',
    data: expect.arrayContaining([{ category: '2025-06', value0: 275 }])
  });
  expect(chart.title).not.toBe(title);
  expect(chart).not.toHaveProperty('replay');
  const indicators = await replayArtifact(
    {
      kind: 'indicators',
      id: 'indicators',
      title,
      cards: [{ label: 'Ancienne valeur', value: 100 }],
      replay: {
        tool: 'show_indicators',
        source: stored.query!,
        input: {
          title,
          sourceId,
          cards: [{ measure: 'amount', value: { filters: { currency: 'XOF', period: '2025-06' } } }]
        }
      }
    },
    { ...scope, permissions, tools },
    true
  );
  expect(indicators).toMatchObject({ kind: 'indicators', cards: [{ value: 275, currency: 'XOF' }] });
  expect(indicators.title).not.toBe(title);
  expect(indicators).not.toHaveProperty('replay');
});

it('partage uniquement les tableaux autorisés d’un rapport et retire les requêtes de la réponse', async () => {
  mockGroupBy.mockResolvedValue([]);
  const artifact = await replayArtifact(
    {
      kind: 'document',
      id: 'report',
      title: 'Titre privé',
      blocks: [
        { kind: 'text', content: 'Note confidentielle' },
        { kind: 'table', table: { ...stored, query: undefined } },
        { kind: 'table', table: { ...stored, query: { tool: 'rental_arrears', month: '2025-06' } } },
        { kind: 'table', table: stored }
      ]
    },
    scope,
    true
  );
  expect(artifact).toMatchObject({ kind: 'document', blocks: [{ kind: 'table', table: { id: stored.id, rows: [] } }] });
  expect(JSON.stringify(artifact)).not.toMatch(/Titre privé|Note confidentielle|"query"/);
  await expect(
    replayArtifact({ kind: 'markdown', id: 'private', title: 'Titre', content: 'Privé' }, scope, true)
  ).rejects.toMatchObject({ statusCode: 422 });
});
