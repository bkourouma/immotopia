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
    },
    syndicateFundMovement: {
      create: jest.fn()
    },
    $transaction: jest.fn(),
    // Verrou de ligne sur le fonds (`lockFundsTx`).
    $queryRaw: jest.fn(async () => [])
  };
  prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));

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
    syndicateFundMovement: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
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

    // S6 : increment atomique, et mouvement trace avec le solde apres.
    expect(mockPrisma.syndicateFund.update).toHaveBeenCalledWith({
      where: { id: 'fund-1' },
      data: { balance: { increment: 50000 } }
    });
    expect(mockPrisma.syndicateFundMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        fundId: 'fund-1',
        direction: 'CREDIT',
        amount: 50000,
        balanceAfter: 150000,
        label: 'Appel de fonds travaux voté en AG',
        sourceType: 'MANUAL_ADJUSTMENT',
        createdById: 'user-1'
      })
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
      data: { balance: { decrement: 15000 } }
    });
    expect(mockPrisma.syndicateFundMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ direction: 'DEBIT', amount: 15000, balanceAfter: -5000 })
    });
    expect(updated.balance).toBe(-5000);
  });

  it("records the initial balance as the fund's OPENING movement (balance = sum of the journal)", async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.syndicateFund.create.mockResolvedValue({
      id: 'fund-1',
      syndicateId: 'syndic-1',
      name: 'Fonds travaux',
      balance: 0,
      currency: 'XOF'
    });
    mockPrisma.syndicateFund.update.mockResolvedValue({ id: 'fund-1', balance: 250000, currency: 'XOF' });

    const fund = await createSyndicateFundBySyndicate(
      'tenant-a',
      'syndic-1',
      { name: 'Fonds travaux', initialBalance: 250000 },
      'user-1'
    );

    expect(mockPrisma.syndicateFund.create).toHaveBeenCalledWith({
      data: { syndicateId: 'syndic-1', name: 'Fonds travaux', balance: 0, currency: 'XOF' }
    });
    expect(mockPrisma.syndicateFund.update).toHaveBeenCalledWith({
      where: { id: 'fund-1' },
      data: { balance: { increment: 250000 } }
    });
    expect(mockPrisma.syndicateFundMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        fundId: 'fund-1',
        direction: 'CREDIT',
        amount: 250000,
        balanceAfter: 250000,
        sourceType: 'OPENING'
      })
    });
    expect(fund.balance).toBe(250000);
  });

  it('records an expense paid by the fund as a MANUAL_EXPENSE debit', async () => {
    mockPrisma.syndicateFund.findFirst.mockResolvedValue({
      id: 'fund-1',
      syndicateId: 'syndic-1',
      name: 'Fonds travaux',
      balance: 100000,
      currency: 'XOF'
    });
    mockPrisma.syndicateFund.update.mockResolvedValue({ id: 'fund-1', balance: 60000 });

    await adjustSyndicateFundBalanceByTenant('tenant-a', 'syndic-1', 'fund-1', {
      direction: 'DEBIT',
      amount: 40000,
      reason: 'Réfection de la toiture',
      kind: 'EXPENSE'
    });

    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockPrisma.syndicateFundMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: 'DEBIT',
        amount: 40000,
        balanceAfter: 60000,
        sourceType: 'MANUAL_EXPENSE'
      })
    });
  });

  it('refuses an expense that would credit the fund', async () => {
    mockPrisma.syndicateFund.findFirst.mockResolvedValue({
      id: 'fund-1',
      syndicateId: 'syndic-1',
      name: 'Fonds travaux',
      balance: 100000,
      currency: 'XOF'
    });

    await expect(
      adjustSyndicateFundBalanceByTenant('tenant-a', 'syndic-1', 'fund-1', {
        direction: 'CREDIT',
        amount: 40000,
        reason: 'Erreur',
        kind: 'EXPENSE'
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(mockPrisma.syndicateFund.update).not.toHaveBeenCalled();
  });
});
