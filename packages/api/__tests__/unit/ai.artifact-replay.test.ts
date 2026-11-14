import { Prisma } from '@prisma/client';
import { replayArtifact } from '../../src/lib/ai/artifact-replay';
import { rentalReceiptsTool } from '../../src/lib/ai/tools/rental-receipts';
import { buildArtifactCsv } from '../../src/lib/ai/artifact-spreadsheet';
import type { AnalysisTable } from '../../src/lib/ai/contracts';

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
