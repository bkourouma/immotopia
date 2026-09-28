jest.mock('@prisma/client', () => {
  const tx = {
    chargeCall: {
      create: jest.fn(),
      findFirst: jest.fn(),
      // Lus par reconcileOwnerAccountLedgerForLot (rapprochement automatique
      // a chaque ouverture du compte, constat de recette module 7) : par
      // defaut aucun appel/paiement en base, pour ne pas affecter les tests
      // qui n'exercent pas ce chemin.
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn()
    },
    chargePayment: {
      create: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn()
    },
    // Lot S2 : le regle d'un appel se lit dans ses affectations.
    chargePaymentAllocation: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    syndicateLot: {
      findFirst: jest.fn()
    },
    ownerAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn()
    },
    ownerAccountTransaction: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    // Lot S3 : un paiement emet ses recus et quittances dans sa transaction.
    syndicate: {
      findFirst: jest.fn().mockResolvedValue({ name: 'Residence', address: 'Abidjan', mandatingAgencyId: null })
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null)
    },
    syndicChargeReceipt: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({ id: 'doc-1', kind: data.kind, number: data.number }))
    },
    $queryRaw: jest.fn().mockResolvedValue([{ last_value: 1 }]),
    // Verrou consultatif du rapprochement (meme idiome que lib/finance/cash.ts) :
    // no-op ici, ce magasin de test n'a pas de vraie base Postgres.
    $executeRaw: jest.fn()
  };

  const prisma = {
    ...tx,
    syndicate: {
      findFirst: jest.fn()
    },
    ownerAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    ownerAccountTransaction: {
      create: jest.fn(),
      findMany: jest.fn()
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
  createChargeCallAndUpdateStatus,
  createOwnerAccountAdjustmentByLot,
  getOwnerAccountByLot,
  getOwnerAccountStatementByLot,
  recordChargePaymentWithStatusUpdate
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma, __mockTx: mockTx } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
  __mockTx: any;
};

describe('Syndics owner accounts queries - US2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
  });

  it('synchronizes lot account on charge creation (debit)', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1', ownerContactId: 'owner-1' });
    mockTx.chargeCall.create.mockResolvedValue({ id: 'charge-1', lotId: 'lot-1', period: '2026-Q2' });
    // `ensureOwnerAccountForLotTx` cree (ou reutilise) le compte via un seul
    // `upsert` atomique, plutot qu'un `findUnique` puis `create` non-atomique
    // — voir le commentaire sur ce meme upsert dans queries.ts (constat de
    // recette module 3.3 : deux lectures concurrentes du compte d'un lot
    // heurtaient sinon la contrainte unique sur lotId). `appendOwnerAccountTransactionTx`
    // (lib/finance/ledger.ts) relit ensuite ce meme compte PAR IDENTIFIANT
    // (`findUnique({where:{id}})`) pour calculer le solde apres mouvement :
    // les deux mocks coexistent, un par etape.
    mockTx.ownerAccount.upsert.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 0 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'tx-1' });
    mockTx.ownerAccount.update.mockResolvedValue({ id: 'acc-1' });

    await createChargeCallAndUpdateStatus('tenant-1', {
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      period: '2026-Q2',
      amount: 120000,
      currency: 'XOF',
      dueDate: new Date('2026-06-15T00:00:00.000Z')
    });

    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CHARGE_CALL',
          debit: 120000
        })
      })
    );
  });

  it('synchronizes lot account on payment (credit)', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    mockTx.chargeCall.findFirst.mockResolvedValue({
      id: 'charge-1',
      lotId: 'lot-1',
      syndicateId: 'syndic-1',
      amount: 100000
    });
    // Lot S2 : l'appel est relu avec les autres appels du lot pour l'affectation.
    mockTx.chargeCall.findMany.mockResolvedValueOnce([
      {
        id: 'charge-1',
        period: '2026-Q2',
        periodStart: null,
        periodEnd: null,
        dueDate: new Date('2026-06-15T00:00:00.000Z'),
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        amount: 100000,
        currency: 'XOF',
        status: 'PENDING'
      }
    ]);
    mockTx.chargePayment.create.mockResolvedValue({ id: 'pay-1' });
    mockTx.chargeCall.update.mockResolvedValue({ id: 'charge-1', status: 'PARTIAL' });
    mockTx.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1', ownerContactId: 'owner-1' });
    mockTx.ownerAccount.upsert.mockResolvedValue({ id: 'acc-1', balance: 120000 });
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 120000 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'tx-2' });
    mockTx.ownerAccount.update.mockResolvedValue({ id: 'acc-1' });

    await recordChargePaymentWithStatusUpdate('tenant-1', {
      chargeCallId: 'charge-1',
      amount: 40000,
      paidAt: new Date('2026-06-01T00:00:00.000Z'),
      method: 'VIREMENT'
    });

    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT',
          credit: 40000
        })
      })
    );
    // Un seul mouvement de grand livre pour ce paiement.
    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledTimes(1);
    expect(mockTx.chargeCall.update).toHaveBeenCalledWith({ where: { id: 'charge-1' }, data: { status: 'PARTIAL' } });
  });

  it('creates manual adjustment transaction on lot account', async () => {
    mockPrisma.ownerAccount.findFirst.mockResolvedValue({
      id: 'acc-1',
      syndicateId: 'syndic-1',
      lotId: 'lot-1',
      balance: 20000
    });
    mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(mockTx));
    // `syndicateLot.findFirst` n'est pas mocke ici : `ensureOwnerAccountForLotTx`
    // (appelee par `getOwnerAccountByLot`) sort donc avant tout `upsert`, et
    // seule la relecture par identifiant d'`appendOwnerAccountTransactionTx`
    // (`findUnique({where:{id}})`) importe pour ce test.
    mockTx.ownerAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 20000 });
    mockTx.ownerAccountTransaction.create.mockResolvedValue({ id: 'tx-adj-1', type: 'ADJUSTMENT' });
    mockTx.ownerAccount.update.mockResolvedValue({ id: 'acc-1', balance: 25000 });

    const result = await createOwnerAccountAdjustmentByLot('tenant-1', 'syndic-1', 'lot-1', {
      direction: 'DEBIT',
      amount: 5000,
      label: 'Regularisation debit'
    });

    expect(result.id).toBe('tx-adj-1');
    expect(mockTx.ownerAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          debit: 5000
        })
      })
    );
  });

  it('returns account statement with opening and closing balances', async () => {
    mockPrisma.ownerAccount.findFirst.mockResolvedValue({
      id: 'acc-1',
      balance: 30000,
      currency: 'XOF',
      syndicate: { name: 'Residence Demo' },
      lot: { lotNumber: 'A-01' },
      contact: { firstName: 'Awa', lastName: 'Diop' }
    });
    mockPrisma.ownerAccountTransaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        transactionDate: new Date('2026-01-10T00:00:00.000Z'),
        debit: 10000,
        credit: null,
        balanceAfter: 20000,
        label: 'Appel',
        type: 'CHARGE_CALL'
      },
      {
        id: 'tx-2',
        transactionDate: new Date('2026-01-20T00:00:00.000Z'),
        debit: null,
        credit: 5000,
        balanceAfter: 15000,
        label: 'Paiement',
        type: 'PAYMENT'
      }
    ]);

    const statement = await getOwnerAccountStatementByLot('tenant-1', 'syndic-1', 'lot-1');

    expect(statement.summary.openingBalance).toBe(10000);
    expect(statement.summary.closingBalance).toBe(15000);
  });

  it('returns account details for a lot', async () => {
    mockPrisma.ownerAccount.findFirst.mockResolvedValue({
      id: 'acc-1',
      lotId: 'lot-1',
      balance: 25000,
      lot: { lotNumber: 'A-01' },
      contact: { firstName: 'Awa', lastName: 'Diop' }
    });

    const account = await getOwnerAccountByLot('tenant-1', 'syndic-1', 'lot-1');
    expect(account.id).toBe('acc-1');
  });
});
