jest.mock('@prisma/client', () => {
  const tx = {
    journalEntry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    journalEntryLine: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const prisma = {
    syndicate: {
      findFirst: jest.fn(),
    },
    chartOfAccount: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    accountingJournal: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    journalEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    journalEntryLine: {
      findMany: jest.fn(),
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
  createAccountingJournalBySyndicate,
  createChartOfAccountBySyndicate,
  createJournalEntryBySyndicate,
  getTrialBalanceBySyndicate,
  lockJournalEntryBySyndicate,
  listChartOfAccountsBySyndicate,
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

describe('Syndics accounting queries - US3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('lists chart of accounts scoped to syndicate', async () => {
    mockPrisma.chartOfAccount.findMany.mockResolvedValue([{ id: 'acc-1', accountNumber: '401' }]);
    const result = await listChartOfAccountsBySyndicate('tenant-1', 'syndic-1');
    expect(result).toHaveLength(1);
    expect(mockPrisma.chartOfAccount.findMany).toHaveBeenCalled();
  });

  it('creates accounting account', async () => {
    mockPrisma.chartOfAccount.create.mockResolvedValue({ id: 'acc-new', accountNumber: '411' });
    const result = await createChartOfAccountBySyndicate('tenant-1', 'syndic-1', {
      accountNumber: '411',
      accountName: 'Clients coproprietaires',
      accountClass: 4,
      accountType: 'ASSET',
    });
    expect(result.id).toBe('acc-new');
  });

  it('creates accounting journal', async () => {
    mockPrisma.accountingJournal.create.mockResolvedValue({ id: 'journal-1', code: 'JG' });
    const result = await createAccountingJournalBySyndicate('tenant-1', 'syndic-1', {
      journalType: 'GENERAL',
      label: 'Journal general',
      code: 'JG',
      fiscalYear: 2026,
    });
    expect(result.id).toBe('journal-1');
  });

  it('rejects unbalanced journal entry', async () => {
    await expect(
      createJournalEntryBySyndicate('tenant-1', 'syndic-1', {
        journalId: 'journal-1',
        entryDate: new Date('2026-03-01T00:00:00.000Z'),
        reference: 'JE-001',
        description: 'Ecriture non equilibree',
        sourceType: 'MANUAL',
        lines: [
          { accountId: 'acc-1', debit: 10000, credit: 0, label: 'Debit' },
          { accountId: 'acc-2', debit: 0, credit: 9000, label: 'Credit' },
        ],
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('creates balanced journal entry with lines', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockPrisma.accountingJournal.findFirst.mockResolvedValue({ id: 'journal-1', fiscalYear: 2026 });
    mockPrisma.chartOfAccount.count.mockResolvedValue(2);
    mockTx.journalEntry.create.mockResolvedValue({ id: 'entry-1' });
    mockTx.journalEntry.findUnique.mockResolvedValue({ id: 'entry-1', lines: [] });

    const result = await createJournalEntryBySyndicate('tenant-1', 'syndic-1', {
      journalId: 'journal-1',
      entryDate: new Date('2026-03-01T00:00:00.000Z'),
      reference: 'JE-002',
      description: 'Ecriture equilibree',
      sourceType: 'MANUAL',
      lines: [
        { accountId: 'acc-1', debit: 10000, credit: 0, label: 'Debit' },
        { accountId: 'acc-2', debit: 0, credit: 10000, label: 'Credit' },
      ],
    });

    expect(mockTx.journalEntryLine.createMany).toHaveBeenCalled();
    expect(result?.id).toBe('entry-1');
  });

  it('locks accounting entry', async () => {
    mockPrisma.journalEntry.findFirst.mockResolvedValue({ id: 'entry-1', isLocked: false });
    mockPrisma.journalEntry.update.mockResolvedValue({ id: 'entry-1', isLocked: true });
    const result = await lockJournalEntryBySyndicate('tenant-1', 'syndic-1', 'entry-1');
    expect(result?.isLocked).toBe(true);
  });

  it('computes trial balance and confirms balanced totals', async () => {
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([
      { accountId: 'acc-1', debit: 10000, credit: 0, account: { accountNumber: '401', accountName: 'Fournisseurs' } },
      { accountId: 'acc-2', debit: 0, credit: 10000, account: { accountNumber: '512', accountName: 'Banque' } },
    ]);
    const result = await getTrialBalanceBySyndicate('tenant-1', 'syndic-1');
    expect(result.totals.isBalanced).toBe(true);
  });
});
