jest.mock('@prisma/client', () => {
  const prisma = {
    syndicate: {
      findFirst: jest.fn()
    },
    syndicateFund: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma
  };
});

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

import {
  adjustSyndicateFundBalanceByTenant,
  createSyndicateFundBySyndicate,
  renameSyndicateFundByTenant
} from '../../src/lib/syndics/queries';
import { logAuditEvent } from '../../src/services/audit-service';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as {
  __mockPrisma: {
    syndicate: { findFirst: jest.Mock };
    syndicateFund: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
};

describe('Syndicate funds queries - FR-013', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a fund with a zero balance by default when the syndicate belongs to the tenant', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.syndicateFund.create.mockResolvedValue({
      id: 'fund-1',
      syndicateId: 'syndic-1',
      name: 'Compte courant',
      balance: 0,
      currency: 'XOF'
    });

    const fund = await createSyndicateFundBySyndicate('tenant-a', 'syndic-1', { name: 'Compte courant' }, 'user-1');

    expect(mockPrisma.syndicateFund.create).toHaveBeenCalledWith({
      data: { syndicateId: 'syndic-1', name: 'Compte courant', balance: 0, currency: 'XOF' }
    });
    expect(fund.id).toBe('fund-1');
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDICATE_FUND_CREATED', entityId: 'fund-1' })
    );
  });

  it('rejects fund creation when the syndicate does not belong to the tenant', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValue(null);

    await expect(
      createSyndicateFundBySyndicate('tenant-a', 'syndic-other-tenant', { name: 'Compte courant' })
    ).rejects.toMatchObject({ status: 403, code: 'TENANT_ISOLATION_ERROR' });

    expect(mockPrisma.syndicateFund.create).not.toHaveBeenCalled();
  });

  it('rejects renaming a fund that belongs to another tenant the same way as a missing fund', async () => {
    mockPrisma.syndicateFund.findFirst.mockResolvedValue(null);

    await expect(
      renameSyndicateFundByTenant('tenant-a', 'syndic-1', 'fund-of-another-tenant', { name: 'Nouveau nom' })
    ).rejects.toMatchObject({ status: 404 });

    expect(mockPrisma.syndicateFund.update).not.toHaveBeenCalled();
  });

  it('adjusts the balance upward on CREDIT and logs the reason', async () => {
    mockPrisma.syndicateFund.findFirst.mockResolvedValue({
      id: 'fund-1',
      syndicateId: 'syndic-1',
      name: 'Fonds travaux',
      balance: 100000,
      currency: 'XOF'
    });
    mockPrisma.syndicateFund.update.mockResolvedValue({ id: 'fund-1', balance: 150000 });

    await adjustSyndicateFundBalanceByTenant(
      'tenant-a',
      'syndic-1',
      'fund-1',
      { direction: 'CREDIT', amount: 50000, reason: 'Appel de fonds travaux voté en AG' },
      'user-1'
    );

    expect(mockPrisma.syndicateFund.update).toHaveBeenCalledWith({
      where: { id: 'fund-1' },
      data: { balance: 150000 }
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SYNDICATE_FUND_BALANCE_ADJUSTED',
        payload: expect.objectContaining({
          direction: 'CREDIT',
          amount: 50000,
          reason: 'Appel de fonds travaux voté en AG',
          previousBalance: 100000,
          newBalance: 150000
        })
      })
    );
  });

  it('adjusts the balance downward on DEBIT, even below zero (no floor)', async () => {
    mockPrisma.syndicateFund.findFirst.mockResolvedValue({
      id: 'fund-1',
      syndicateId: 'syndic-1',
      name: 'Compte courant',
      balance: 10000,
      currency: 'XOF'
    });
    mockPrisma.syndicateFund.update.mockResolvedValue({ id: 'fund-1', balance: -5000 });

    const updated = await adjustSyndicateFundBalanceByTenant('tenant-a', 'syndic-1', 'fund-1', {
      direction: 'DEBIT',
      amount: 15000,
      reason: 'Avance de tresorerie'
    });

    expect(mockPrisma.syndicateFund.update).toHaveBeenCalledWith({
      where: { id: 'fund-1' },
      data: { balance: -5000 }
    });
    expect(updated.balance).toBe(-5000);
  });
});
