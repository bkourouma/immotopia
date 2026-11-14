import { Prisma } from '@prisma/client';
import type { CopilotToolContext } from '../../src/lib/ai/contracts';
import { closedMonthBounds, rentalArrearsTool } from '../../src/lib/ai/tools/rental-arrears';

const mockFindMany = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { rentalInstallment: { findMany: (...args: unknown[]) => mockFindMany(...args) } }
}));

const ctx: CopilotToolContext = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  permissions: new Set(['RENTAL_INSTALLMENTS_VIEW']),
  signal: new AbortController().signal,
  seenLeaseIds: new Set()
};
const amount = (value: number) => new Prisma.Decimal(value);
const installment = (paid: number, currency = 'FCFA') => ({
  currency,
  amount_rent: amount(1000),
  amount_service: amount(100),
  amount_other_fees: amount(0),
  penalty_amount: amount(20),
  amount_paid: amount(paid),
  lease: { property: { id: 'property-1', internalReference: 'B01', title: 'Villa' } }
});

describe('Analyse des échéances locatives', () => {
  beforeEach(() => mockFindMany.mockReset());

  it('résout le dernier mois clos au changement d’année', () => {
    expect(closedMonthBounds(undefined, new Date('2026-01-01T12:00:00Z'))).toEqual({
      start: new Date('2025-12-01T00:00:00Z'),
      end: new Date('2026-01-01T00:00:00Z'),
      period: '2025-12'
    });
    expect(() => closedMonthBounds('2026-01', new Date('2026-01-09T12:00:00Z'))).toThrow();
  });

  it('calcule les soldes partiels, exclut les échéances soldées et sépare les devises', async () => {
    mockFindMany.mockResolvedValue([
      installment(320),
      installment(1120),
      installment(20, 'EUR'),
      installment(0, 'XOF')
    ]);
    const { uiEvent } = await rentalArrearsTool.execute({ month: '2025-07' }, ctx);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'tenant-1',
          lease: { tenant_id: 'tenant-1', property: { tenantId: 'tenant-1' } },
          due_date: { gte: new Date('2025-07-01T00:00:00Z'), lt: new Date('2025-08-01T00:00:00Z') }
        })
      })
    );
    expect(uiEvent).toMatchObject({
      type: 'artifact',
      artifact: {
        kind: 'table',
        provenance: { period: '2025-07' },
        rows: [
          { currency: 'EUR', balance: 1100, count: 1 },
          { currency: 'XOF', balance: 1920, count: 2 }
        ]
      }
    });
  });

  it('refuse une lecture sans permission avant l’accès aux données', async () => {
    await expect(rentalArrearsTool.execute({}, { ...ctx, permissions: new Set() })).rejects.toMatchObject({
      statusCode: 403
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
