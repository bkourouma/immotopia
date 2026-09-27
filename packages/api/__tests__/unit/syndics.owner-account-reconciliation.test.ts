/**
 * Constat de recette, module 7 : le compte d'un lot ne débitait que les
 * appels créés par « Nouvel appel de charges » (appel direct). Les appels
 * générés depuis une campagne budgétaire (`generateChargeCallsFromBudget`)
 * passaient par un `createMany` qui ne touchait jamais le grand livre —
 * corrigé pour tout nouvel appel, et rattrapé pour les appels déjà générés
 * via `reconcileOwnerAccountLedgerForLot`.
 *
 * Ce fichier teste les trois garanties demandées : un appel de campagne
 * débite le compte, le rapprochement est idempotent (deux passages ne créent
 * pas de doublon), et l'isolation par tenant est respectée.
 */

jest.mock('@prisma/client', () => {
  const tx = {
    syndicateBudget: {
      findFirst: jest.fn()
    },
    chargeCallBatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      // Lot S4 : garde anti-doublon de période (aucun lot existant par défaut).
      findFirst: jest.fn()
    },
    chargeCall: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    chargePayment: {
      findMany: jest.fn().mockResolvedValue([])
    },
    syndicateLot: {
      findFirst: jest.fn()
    },
    crmContact: {
      findFirst: jest.fn().mockResolvedValue(null)
    },
    ownerAccount: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn()
    },
    ownerAccountTransaction: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    $executeRaw: jest.fn()
  };

  const prisma = {
    ...tx,
    syndicate: {
      findFirst: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
    __mockTx: tx
  };
});

import { generateChargeCallsFromBudget, reconcileOwnerAccountLedgerForLot } from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const SYNDIC_ID = 'syndic-1';
const LOT_ID = 'lot-1';

describe('Ledger du compte de lot — appels de campagne et rapprochement (module 7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: SYNDIC_ID });
    mockTx.chargeCall.findMany.mockResolvedValue([]);
    mockTx.chargePayment.findMany.mockResolvedValue([]);
    mockTx.ownerAccountTransaction.findMany.mockResolvedValue([]);
  });

  it('un appel de charges genere depuis une campagne budgetaire debite le compte du lot', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: SYNDIC_ID });
    mockTx.syndicateBudget.findFirst.mockResolvedValue({
      id: 'budget-1',
      status: 'APPROVED',
      totalAmount: 100000,
      currency: 'XOF',
      allocations: [{ lotId: LOT_ID, totalAllocated: 100000 }]
    });
    mockTx.chargeCallBatch.create.mockResolvedValue({ id: 'batch-1' });
    mockTx.chargeCall.create.mockResolvedValue({ id: 'charge-1', lotId: LOT_ID });
    mockTx.syndicateLot.findFirst.mockResolvedValue({
      id: LOT_ID,
      coownerId: 'contact-1',
      ownerContactId: 'contact-1'
    });
    mockTx.ownerAccount.upsert.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'ledger-1' });
    mockTx.chargeCallBatch.findUnique.mockResolvedValue({ id: 'batch-1', chargeCalls: [{ id: 'charge-1' }] });

    await generateChargeCallsFromBudget(TENANT_ID, SYNDIC_ID, 'budget-1', {
      label: 'Campagne 2026',
      period: '2026-Q2',
      dueDate: new Date('2026-04-30T00:00:00.000Z'),
      batchType: 'REGULAR'
    });

    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'acc-1',
          type: 'CHARGE_CALL',
          debit: 100000,
          sourceId: 'charge-1'
        })
      })
    );
  });

  it('le rapprochement rattrape un appel et un paiement sans ecriture, sans jamais dupliquer sur un second passage', async () => {
    mockTx.syndicateLot.findFirst.mockResolvedValue({
      id: LOT_ID,
      coownerId: 'contact-1',
      ownerContactId: 'contact-1'
    });
    mockTx.ownerAccount.upsert.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.chargeCall.findMany.mockResolvedValue([
      { id: 'charge-1', amount: 100000, period: '2026-Q1', dueDate: new Date('2026-01-01T00:00:00.000Z') }
    ]);
    mockTx.chargePayment.findMany.mockResolvedValue([
      { id: 'pay-1', amount: 30000, paidAt: new Date('2026-01-15T00:00:00.000Z'), reference: null }
    ]);
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'ledger-new' });

    // Premier passage : rien n'existe encore dans le grand livre.
    mockTx.ownerAccountTransaction.findMany.mockResolvedValueOnce([]);

    const first = await reconcileOwnerAccountLedgerForLot(TENANT_ID, SYNDIC_ID, LOT_ID);

    expect(first).toEqual({ accountId: 'acc-1', created: 2 });
    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledTimes(2);
    expect(mockTx.ownerAccountTransaction.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ type: 'CHARGE_CALL', debit: 100000, sourceId: 'charge-1' })
      })
    );
    expect(mockTx.ownerAccountTransaction.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ type: 'PAYMENT', credit: 30000, sourceId: 'pay-1' })
      })
    );

    // Second passage : le grand livre porte desormais les deux ecritures
    // creees ci-dessus (simule ici puisque le mock ne persiste rien de
    // lui-meme) — rien de nouveau ne doit etre insere.
    mockTx.ownerAccountTransaction.create.mockClear();
    mockTx.ownerAccountTransaction.findMany.mockResolvedValueOnce([
      { sourceId: 'charge-1', type: 'CHARGE_CALL' },
      { sourceId: 'pay-1', type: 'PAYMENT' }
    ]);

    const second = await reconcileOwnerAccountLedgerForLot(TENANT_ID, SYNDIC_ID, LOT_ID);

    expect(second).toEqual({ accountId: 'acc-1', created: 0 });
    expect(mockTx.ownerAccountTransaction.create).not.toHaveBeenCalled();
  });

  it("n'expose ni ne rapproche rien pour un lot d'une autre agence", async () => {
    mockTx.syndicateLot.findFirst.mockImplementation(async (args: any) => {
      if (args.where.syndicate?.tenantId !== TENANT_ID) {
        return null;
      }
      return { id: LOT_ID, coownerId: 'contact-1', ownerContactId: 'contact-1' };
    });
    mockTx.chargeCall.findMany.mockResolvedValue([
      { id: 'charge-1', amount: 100000, period: '2026-Q1', dueDate: new Date('2026-01-01T00:00:00.000Z') }
    ]);

    const result = await reconcileOwnerAccountLedgerForLot(OTHER_TENANT_ID, SYNDIC_ID, LOT_ID);

    expect(result).toEqual({ accountId: null, created: 0 });
    expect(mockTx.chargeCall.findMany).not.toHaveBeenCalled();
    expect(mockTx.ownerAccountTransaction.create).not.toHaveBeenCalled();
  });
});
