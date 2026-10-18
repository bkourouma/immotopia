jest.mock('@prisma/client', () => {
  const tx = {
    journalEntry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    },
    journalEntryLine: {
      createMany: jest.fn(),
      findMany: jest.fn()
    }
  };

  const prisma = {
    syndicate: {
      findFirst: jest.fn()
    },
    chartOfAccount: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn()
    },
    accountingJournal: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn()
    },
    journalEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    },
    journalEntryLine: {
      findMany: jest.fn(),
      createMany: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx
  };
});

import {
  createAccountingJournalBySyndicate,
  createChartOfAccountBySyndicate,
  createJournalEntryBySyndicate,
  getTrialBalanceBySyndicate,
  lockJournalEntryBySyndicate,
  listChartOfAccountsBySyndicate
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
      accountType: 'ASSET'
    });
    expect(result.id).toBe('acc-new');
  });

  it('creates accounting journal', async () => {
    mockPrisma.accountingJournal.create.mockResolvedValue({ id: 'journal-1', code: 'JG' });
    const result = await createAccountingJournalBySyndicate('tenant-1', 'syndic-1', {
      journalType: 'GENERAL',
      label: 'Journal general',
      code: 'JG',
      fiscalYear: 2026
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
          { accountId: 'acc-2', debit: 0, credit: 9000, label: 'Credit' }
        ]
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
        { accountId: 'acc-2', debit: 0, credit: 10000, label: 'Credit' }
      ]
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
      { accountId: 'acc-2', debit: 0, credit: 10000, account: { accountNumber: '512', accountName: 'Banque' } }
    ]);
    const result = await getTrialBalanceBySyndicate('tenant-1', 'syndic-1');
    expect(result.totals.isBalanced).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spec 047 (T010) : sous-comptes 5521x des numeros de reception mobile money
// ---------------------------------------------------------------------------

import { createFakePrisma, matchesWhere } from '../helpers/fake-prisma';
import {
  ensureSyndicAccountsTx,
  ensureSyndicReceivingAccountTx,
  isReceivingAccountNumber
} from '../../src/lib/syndics/provider-invoice-accounting';

describe('Sous-comptes de reception mobile money (hypothese H1)', () => {
  const fake: any = createFakePrisma();
  const receivingNumbers: { rows: any[]; findFirst: jest.Mock } = {
    rows: [],
    findFirst: jest.fn(async ({ where }: any) => receivingNumbers.rows.find(row => matchesWhere(row, where)) ?? null)
  };
  fake.syndicReceivingNumber = receivingNumbers;

  const S1 = '00000000-0000-4000-8000-000000000001';
  const S2 = '00000000-0000-4000-8000-000000000002';
  const PHONE_A = '+2250707070712';
  const PHONE_B = '+2250505050534';

  const accountsOf = (syndicateId: string | null) =>
    fake.chartOfAccount.rows.filter((row: any) => (row.syndicateId ?? null) === syndicateId);
  const ensure = (syndicateId: string, operator: string, phoneNumber: string) =>
    ensureSyndicReceivingAccountTx(fake, 'tenant-a', syndicateId, { operator: operator as any, phoneNumber });
  // Simule l'enregistrement du numero (fait par receiving-numbers.ts) apres l'allocation du compte.
  const register = (syndicateId: string, operator: string, phoneNumber: string, treasuryAccountNumber: string) =>
    receivingNumbers.rows.push({ tenantId: 'tenant-a', syndicateId, operator, phoneNumber, treasuryAccountNumber });

  beforeEach(() => {
    fake.reset();
    receivingNumbers.rows = [];
  });

  it('cree le sous-compte 55211 dans le plan de la copropriete, sous un 552 nouveau, jamais dans celui du cabinet', async () => {
    const result = await ensure(S1, 'ORANGE', PHONE_A);

    expect(result.accountNumber).toBe('55211');
    const created = accountsOf(S1).find((row: any) => row.accountNumber === '55211');
    expect(created).toMatchObject({
      id: result.accountId,
      scope: 'SYNDICATE',
      tenantId: 'tenant-a',
      accountClass: 5,
      accountType: 'ASSET',
      accountName: 'Orange Money 07 •• •• •• 12'
    });
    const parent = accountsOf(S1).find((row: any) => row.accountNumber === '552');
    expect(parent).toMatchObject({ accountClass: 5, accountType: 'ASSET' });
    expect(created.parentAccountId).toBe(parent.id);
    // Aucun compte du plan du cabinet (sans copropriete).
    expect(accountsOf(null)).toHaveLength(0);
  });

  it('un autre numero de la meme copropriete prend le rang suivant et reutilise le 552', async () => {
    const first = await ensure(S1, 'ORANGE', PHONE_A);
    register(S1, 'ORANGE', PHONE_A, first.accountNumber);

    const second = await ensure(S1, 'MTN', PHONE_B);

    expect(second.accountNumber).toBe('55212');
    expect(second.accountId).not.toBe(first.accountId);
    expect(accountsOf(S1).filter((row: any) => row.accountNumber === '552')).toHaveLength(1);
    expect(accountsOf(S1).find((row: any) => row.accountNumber === '55212').accountName).toBe(
      'MTN MoMo 05 •• •• •• 34'
    );
  });

  it('le meme numero dans la meme copropriete reutilise son compte sans rien creer', async () => {
    const first = await ensure(S1, 'ORANGE', PHONE_A);
    register(S1, 'ORANGE', PHONE_A, first.accountNumber);
    const before = fake.chartOfAccount.rows.length;

    const again = await ensure(S1, 'ORANGE', PHONE_A);

    expect(again).toEqual(first);
    expect(fake.chartOfAccount.rows).toHaveLength(before);
  });

  it('le meme numero dans deux copropriétés : un compte dans chacune, rang 1 chacune', async () => {
    const inS1 = await ensure(S1, 'WAVE', PHONE_A);
    register(S1, 'WAVE', PHONE_A, inS1.accountNumber);
    const inS2 = await ensure(S2, 'WAVE', PHONE_A);

    expect(inS1.accountNumber).toBe('55211');
    expect(inS2.accountNumber).toBe('55211');
    expect(inS1.accountId).not.toBe(inS2.accountId);
    expect(accountsOf(S1).some((row: any) => row.id === inS2.accountId)).toBe(false);
    expect(accountsOf(S2).some((row: any) => row.id === inS2.accountId)).toBe(true);
  });

  it('un 552 existant est le parent ; aucun compte existant n est modifie ; le rang suit le plus grand', async () => {
    fake.chartOfAccount.rows.push(
      {
        id: 'acc-552',
        tenantId: 'tenant-a',
        syndicateId: S1,
        scope: 'SYNDICATE',
        accountNumber: '552',
        accountName: 'Mon 552',
        accountClass: 5,
        accountType: 'ASSET'
      },
      {
        id: 'acc-55213',
        tenantId: 'tenant-a',
        syndicateId: S1,
        scope: 'SYNDICATE',
        accountNumber: '55213',
        accountName: 'Ancien',
        accountClass: 5,
        accountType: 'ASSET'
      },
      {
        id: 'acc-5525',
        tenantId: 'tenant-a',
        syndicateId: S1,
        scope: 'SYNDICATE',
        accountNumber: '5525',
        accountName: 'PaySecureHub',
        accountClass: 5,
        accountType: 'ASSET'
      }
    );
    const snapshot = JSON.stringify(fake.chartOfAccount.rows);

    const result = await ensure(S1, 'MOOV', PHONE_B);

    expect(result.accountNumber).toBe('55214');
    expect(fake.chartOfAccount.rows.find((row: any) => row.id === result.accountId).parentAccountId).toBe('acc-552');
    expect(JSON.stringify(fake.chartOfAccount.rows.slice(0, 3))).toBe(snapshot);
    expect(accountsOf(S1).filter((row: any) => row.accountNumber === '552')).toHaveLength(1);
  });

  it('prend un verrou consultatif de transaction avant d allouer le rang', async () => {
    fake.$executeRaw.mockClear();
    await ensure(S1, 'ORANGE', PHONE_A);
    expect(fake.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('isReceivingAccountNumber reconnait 5521 suivi d un rang, pas 5525 ni 521', () => {
    expect(isReceivingAccountNumber('55211')).toBe(true);
    expect(isReceivingAccountNumber('552110')).toBe(true);
    expect(isReceivingAccountNumber('5521')).toBe(false);
    expect(isReceivingAccountNumber('5525')).toBe(false);
    expect(isReceivingAccountNumber('521')).toBe(false);
    expect(isReceivingAccountNumber(null)).toBe(false);
  });

  it('ensureSyndicAccountsTx ignore toujours un numero hors graines (le 5521x se cherche, il ne se seme pas)', async () => {
    const index = await ensureSyndicAccountsTx(fake, 'tenant-a', S1, ['450', '55211' as any]);
    expect([...index.keys()]).toEqual(['450']);
  });
});
