jest.mock('@prisma/client', () => {
  const tx = {
    latePaymentPenalty: {
      create: jest.fn(),
      update: jest.fn(),
    },
    paymentReminder: {
      count: jest.fn(),
      create: jest.fn(),
    },
    paymentSchedule: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    paymentScheduleInstalment: {
      createMany: jest.fn(),
    },
  };

  const prisma = {
    syndicate: {
      findFirst: jest.fn(),
    },
    chargeCall: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    paymentReminder: {
      count: jest.fn(),
      create: jest.fn(),
    },
    latePaymentPenalty: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    paymentSchedule: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    paymentScheduleInstalment: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx,
  };
});

import {
  createLatePaymentPenaltyForChargeCall,
  createManualReminderForChargeCall,
  createPaymentScheduleForChargeCall,
  runReminderBatchForSyndicate,
  waiveLatePaymentPenaltyByTenant,
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: {
    syndicate: { findFirst: jest.Mock };
    chargeCall: { findFirst: jest.Mock; findMany: jest.Mock };
    paymentReminder: { count: jest.Mock; create: jest.Mock };
    latePaymentPenalty: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    paymentSchedule: { create: jest.Mock; findUnique: jest.Mock };
    paymentScheduleInstalment: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  __mockTx: {
    latePaymentPenalty: { create: jest.Mock; update: jest.Mock };
    paymentReminder: { count: jest.Mock; create: jest.Mock };
    paymentSchedule: { create: jest.Mock; findUnique: jest.Mock };
    paymentScheduleInstalment: { createMany: jest.Mock };
  };
};

describe('Syndics recovery queries - US1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('creates a manual reminder when outstanding amount exists', async () => {
    mockPrisma.chargeCall.findFirst.mockResolvedValue({
      id: 'charge-1',
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      amount: 100000,
      allocations: [{ amount: 10000 }],
    });
    mockPrisma.paymentReminder.create.mockResolvedValue({
      id: 'rem-1',
      chargeCallId: 'charge-1',
      lotId: 'lot-1',
      reminderLevel: 1,
      channel: 'EMAIL',
      status: 'SENT',
    });

    const result = await createManualReminderForChargeCall('tenant-1', 'syndic-1', 'charge-1', {
      reminderLevel: 1,
      channel: 'EMAIL',
    });

    expect(mockPrisma.paymentReminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargeCallId: 'charge-1',
          lotId: 'lot-1',
        }),
      })
    );
    expect(result.id).toBe('rem-1');
  });

  it('creates reminders in batch and returns created ids', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockPrisma.chargeCall.findMany.mockResolvedValue([
      {
        id: 'charge-1',
        lotId: 'lot-1',
        amount: 100000,
        allocations: [{ amount: 0 }],
      },
      {
        id: 'charge-2',
        lotId: 'lot-2',
        amount: 100000,
        allocations: [{ amount: 100000 }],
      },
    ]);
    mockTx.paymentReminder.count.mockResolvedValue(1);
    mockTx.paymentReminder.create.mockResolvedValue({
      id: 'rem-101',
    });

    const result = await runReminderBatchForSyndicate('tenant-1', 'syndic-1');

    expect(result.processedCalls).toBe(2);
    expect(result.remindersCreated).toBe(1);
    expect(result.createdReminderIds).toEqual(['rem-101']);
  });

  it('creates penalty from charge call outstanding amount', async () => {
    mockPrisma.chargeCall.findFirst.mockResolvedValue({
      id: 'charge-1',
      lotId: 'lot-1',
      dueDate: new Date('2026-01-01T00:00:00.000Z'),
      amount: 100000,
      allocations: [{ amount: 20000 }],
    });
    mockTx.latePaymentPenalty.create.mockResolvedValue({
      id: 'pen-1',
      penaltyAmount: 2000,
    });

    const result = await createLatePaymentPenaltyForChargeCall('tenant-1', 'syndic-1', 'charge-1', {
      penaltyRate: 5,
    });

    expect(mockTx.latePaymentPenalty.create).toHaveBeenCalled();
    expect(result.id).toBe('pen-1');
  });

  it('waives a penalty scoped to tenant and syndicate', async () => {
    mockPrisma.latePaymentPenalty.findFirst.mockResolvedValue({ id: 'pen-1' });
    mockTx.latePaymentPenalty.update.mockResolvedValue({
      id: 'pen-1',
      waived: true,
      waivedReason: 'Accord amiable',
    });

    const result = await waiveLatePaymentPenaltyByTenant('tenant-1', 'syndic-1', 'pen-1', 'Accord amiable');

    expect(mockTx.latePaymentPenalty.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pen-1' },
        data: expect.objectContaining({ waived: true }),
      })
    );
    expect(result.waived).toBe(true);
  });

  it('creates payment schedule and instalments', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockPrisma.chargeCall.findFirst.mockResolvedValue({
      id: 'charge-1',
      lotId: 'lot-1',
      amount: 100000,
      allocations: [{ amount: 10000 }],
    });
    mockTx.paymentSchedule.create.mockResolvedValue({ id: 'sched-1' });
    mockTx.paymentSchedule.findUnique.mockResolvedValue({
      id: 'sched-1',
      instalments: [{ id: 'inst-1' }, { id: 'inst-2' }],
    });

    const result = await createPaymentScheduleForChargeCall('tenant-1', 'syndic-1', 'charge-1', {
      totalAmount: 90000,
      instalments: [
        { dueDate: new Date('2026-04-10T00:00:00.000Z'), amount: 45000 },
        { dueDate: new Date('2026-05-10T00:00:00.000Z'), amount: 45000 },
      ],
    });

    expect(mockTx.paymentScheduleInstalment.createMany).toHaveBeenCalled();
    expect(result?.id).toBe('sched-1');
  });
});
