/**
 * Balayage B6 (lib/syndics/queries.ts) — deux trous trouves en relisant
 * chaque fonction exportee qui ecrit un identifiant recu du corps de la
 * requete :
 *
 * 1. `createJournalEntryBySyndicate` verifiait que chaque `accountId` de
 *    ligne appartient a la copropriete, mais jamais le `lotId` optionnel de
 *    la ligne : un lot d'une autre copropriete (donc potentiellement d'une
 *    autre agence) pouvait etre attache a une ecriture comptable.
 * 2. `updateBudgetBySyndicate` ecrivait `approvedByResolutionId` tel quel,
 *    sans verifier que cette resolution appartient a une assemblee de la
 *    meme copropriete.
 */

jest.mock('@prisma/client', () => {
  const tx = {
    journalEntry: { create: jest.fn(), findUnique: jest.fn() },
    journalEntryLine: { createMany: jest.fn() }
  };

  const prisma = {
    syndicate: { findFirst: jest.fn() },
    accountingJournal: { findFirst: jest.fn() },
    chartOfAccount: { count: jest.fn() },
    syndicateLot: { count: jest.fn() },
    journalEntry: { create: jest.fn(), findUnique: jest.fn() },
    journalEntryLine: { createMany: jest.fn() },
    syndicateBudget: { findFirst: jest.fn(), update: jest.fn() },
    gMResolution: { findFirst: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx
  };
});

import { createJournalEntryBySyndicate, updateBudgetBySyndicate } from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

describe('createJournalEntryBySyndicate — lotId de chaque ligne verifie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.accountingJournal.findFirst.mockResolvedValue({ id: 'journal-1', fiscalYear: 2026 });
    mockPrisma.chartOfAccount.count.mockResolvedValue(1);
  });

  it("refuse une ligne dont le lotId n'appartient pas a la copropriete", async () => {
    mockPrisma.syndicateLot.count.mockResolvedValue(0); // le lot ne matche pas syndicateId

    await expect(
      createJournalEntryBySyndicate('tenant-1', 'syndic-1', {
        journalId: 'journal-1',
        entryDate: new Date('2026-03-01T00:00:00.000Z'),
        reference: 'JE-003',
        description: 'Ecriture avec lot etranger',
        sourceType: 'MANUAL',
        lines: [{ accountId: 'acc-1', lotId: 'lot-autre-copropriete', debit: 10000, credit: 10000, label: 'X' }]
      })
    ).rejects.toThrow();
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('accepte une ligne dont le lotId appartient bien a la copropriete', async () => {
    mockPrisma.syndicateLot.count.mockResolvedValue(1);
    mockTx.journalEntry.create.mockResolvedValue({ id: 'entry-1' });
    mockTx.journalEntry.findUnique.mockResolvedValue({ id: 'entry-1' });

    const result = await createJournalEntryBySyndicate('tenant-1', 'syndic-1', {
      journalId: 'journal-1',
      entryDate: new Date('2026-03-01T00:00:00.000Z'),
      reference: 'JE-004',
      description: 'Ecriture avec lot valide',
      sourceType: 'MANUAL',
      lines: [{ accountId: 'acc-1', lotId: 'lot-1', debit: 10000, credit: 10000, label: 'X' }]
    });

    expect(result?.id).toBe('entry-1');
  });
});

describe('updateBudgetBySyndicate — approvedByResolutionId verifie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.syndicateBudget.findFirst.mockResolvedValue({ id: 'budget-1', status: 'DRAFT' });
  });

  it("refuse une resolution d'une autre copropriete", async () => {
    mockPrisma.gMResolution.findFirst.mockResolvedValue(null);

    await expect(
      updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', {
        approvedByResolutionId: 'resolution-autre-copropriete',
        status: 'APPROVED'
      })
    ).rejects.toThrow();
    expect(mockPrisma.syndicateBudget.update).not.toHaveBeenCalled();
  });

  it('accepte une resolution de la meme copropriete', async () => {
    mockPrisma.gMResolution.findFirst.mockResolvedValue({ id: 'resolution-1' });
    mockPrisma.syndicateBudget.update.mockResolvedValue({ id: 'budget-1', status: 'APPROVED' });

    const result = await updateBudgetBySyndicate('tenant-1', 'syndic-1', 'budget-1', {
      approvedByResolutionId: 'resolution-1',
      status: 'APPROVED'
    });

    expect(result.status).toBe('APPROVED');
  });
});
