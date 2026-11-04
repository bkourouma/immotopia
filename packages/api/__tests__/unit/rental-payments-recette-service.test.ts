/**
 * Recette gestion locative 06 — défauts probables des paiements locatifs
 * (affectation d'un paiement non encaissé, transitions de statut libres, devise,
 * seconde affectation, réactivation d'un paiement annulé).
 */
jest.mock('../../src/utils/database', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
const recordAuditEvent = jest.fn(async () => undefined);
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: (...a: any[]) => recordAuditEvent(...(a as [])),
  logAuditEvent: jest.fn()
}));
const appendThirdPartyMovementTx = jest.fn();
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...a: any[]) => appendThirdPartyMovementTx(...a),
  getOrCreateTenantAccountTx: jest.fn()
}));
const annulerPieceTx = jest.fn();
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: (...a: any[]) => annulerPieceTx(...a),
  compteLocataireDuBailTx: jest.fn(),
  compteLocataireTx: jest.fn(async () => 'acc-1'),
  inscrireEcheanceFactureeTx: jest.fn(),
  libellePeriodeEcheance: jest.fn(() => null)
}));

import { RentalPaymentStatus } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import {
  allocatePaymentTx,
  createPayment,
  updatePaymentStatus,
  updatePaymentStatusTx
} from '../../src/services/rental-payment-service';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-A';
type Row = Record<string, any>;

function payment(overrides: Row = {}): Row {
  return {
    id: 'pay-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    renter_client_id: 'client-1',
    amount: 100000,
    method: 'CASH',
    status: 'SUCCESS',
    currency: 'FCFA',
    allocations: [],
    ...overrides
  };
}

function installment(overrides: Row = {}): Row {
  return {
    id: 'inst-1',
    tenant_id: TENANT,
    lease_id: 'lease-1',
    status: 'DUE',
    due_date: new Date(2026, 0, 5),
    amount_rent: 100000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    period_year: 2026,
    period_month: 1,
    ...overrides
  };
}

function makeTx(pay: Row, opts: { existingAllocations?: Row[]; movements?: Row[] } = {}): Row {
  const existing = opts.existingAllocations ?? [];
  return {
    $queryRaw: jest.fn(async () => []),
    rentalPayment: {
      findFirst: jest.fn(async () => pay),
      update: jest.fn(async ({ data }: Row) => ({ ...pay, ...data, allocations: [] }))
    },
    rentalPaymentAllocation: {
      findMany: jest.fn(async ({ where }: Row) =>
        where?.installment_id
          ? existing.filter(a =>
              ([] as any[]).concat(where.installment_id.in ?? where.installment_id).includes(a.installment_id)
            )
          : existing
      ),
      create: jest.fn(async ({ data }: Row) => ({ id: 'al-new', ...data })),
      deleteMany: jest.fn(async () => ({ count: 0 }))
    },
    rentalInstallment: {
      findMany: jest.fn(async () => [installment()]),
      update: jest.fn(async ({ data }: Row) => ({ ...installment(), ...data }))
    },
    rentalDepositMovement: { findMany: jest.fn(async () => []) },
    thirdPartyMovement: {
      count: jest.fn(async () => (opts.movements ?? []).length),
      findMany: jest.fn(async () => opts.movements ?? []),
      findUnique: jest.fn(async () => null)
    }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('affectation d’un paiement (GL-06-033 et suivants)', () => {
  it('refuse d’affecter un paiement qui n’est pas encaissé', async () => {
    const tx = makeTx(payment({ status: 'PENDING' }));

    await expect(
      allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: ['inst-1'] }, 'u1')
    ).rejects.toBeInstanceOf(ConflictError);
    expect(tx.rentalPaymentAllocation.create).not.toHaveBeenCalled();
  });

  it('affecte un paiement encaissé (témoin)', async () => {
    const tx = makeTx(payment());

    const result = await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: ['inst-1'] }, 'u1');

    expect(result.allocations).toHaveLength(1);
  });

  it('verrouille la ligne du paiement (FOR UPDATE) avant de lire le solde disponible', async () => {
    const tx = makeTx(payment());
    const order: string[] = [];
    tx.$queryRaw.mockImplementation(async () => {
      order.push('verrou');
      return [];
    });
    tx.rentalPayment.findFirst.mockImplementation(async () => {
      order.push('lecture');
      return payment();
    });

    await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: ['inst-1'] }, 'u1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings] = tx.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toMatch(/rental_payments[\s\S]*FOR UPDATE/);
    expect(order[0]).toBe('verrou');
    expect(order.indexOf('verrou')).toBeLessThan(order.indexOf('lecture'));
  });

  it('verrouille ensuite les échéances visées, triées par id, avant de les lire (ordre : paiement, échéances)', async () => {
    const A = '00000000-0000-4000-8000-00000000000a';
    const B = '00000000-0000-4000-8000-00000000000b';
    const tx = makeTx(payment());
    const order: string[] = [];
    tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      order.push(strings.join('?').includes('rental_installments') ? 'verrou-echeances' : 'verrou-paiement');
      return [];
    });
    tx.rentalInstallment.findMany.mockImplementation(async () => {
      order.push('lecture-echeances');
      return [installment({ id: A })];
    });

    await allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: [B, A] }, 'u1');

    expect(order.slice(0, 3)).toEqual(['verrou-paiement', 'verrou-echeances', 'lecture-echeances']);
    const [strings] = tx.$queryRaw.mock.calls[1];
    expect(strings.join('?')).toMatch(/rental_installments[\s\S]*tenant_id[\s\S]*ORDER BY id FOR UPDATE/);
  });

  it('dit pourquoi une seconde affectation sur la même échéance est refusée', async () => {
    const tx = makeTx(payment({ amount: 150000 }), {
      existingAllocations: [{ payment_id: 'pay-1', installment_id: 'inst-1', amount: 50000 }]
    });
    tx.rentalInstallment.findMany = jest.fn(async () => [installment({ amount_rent: 200000 })]);

    const promise = allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: ['inst-1'] }, 'u1');

    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await expect(promise).rejects.toThrow('déjà affecté à cette échéance');
    expect(tx.rentalPaymentAllocation.create).not.toHaveBeenCalled();
  });

  it('refuse d’affecter un paiement sans bail (il piocherait dans les échéances de n’importe quel bail)', async () => {
    const tx = makeTx(payment({ lease_id: null }));

    await expect(
      allocatePaymentTx(tx as any, TENANT, 'pay-1', { installmentIds: ['inst-1'] }, 'u1')
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(tx.rentalInstallment.findMany).not.toHaveBeenCalled();
  });
});

describe('transitions de statut manuelles (GL-06-034)', () => {
  function run(from: string, to: RentalPaymentStatus) {
    const tx = makeTx(payment({ status: from }));
    (prisma as any).directDebitRemittanceLine = { findFirst: jest.fn(async () => null) };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx));
    return { tx, promise: updatePaymentStatus(TENANT, 'pay-1', to, 'u1') };
  }

  it.each([
    ['SUCCESS', RentalPaymentStatus.PENDING],
    ['REFUNDED', RentalPaymentStatus.SUCCESS],
    ['REFUNDED', RentalPaymentStatus.CANCELED],
    ['PENDING', RentalPaymentStatus.REFUNDED],
    ['SUCCESS', RentalPaymentStatus.REFUNDED],
    ['SUCCESS', RentalPaymentStatus.PARTIALLY_REFUNDED],
    ['FAILED', RentalPaymentStatus.PENDING],
    ['CANCELED', RentalPaymentStatus.PENDING]
  ])('refuse %s -> %s', async (from, to) => {
    const { tx, promise } = run(from, to);
    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    expect(tx.rentalPayment.update).not.toHaveBeenCalled();
  });

  it.each([
    ['PENDING', RentalPaymentStatus.SUCCESS],
    ['PENDING', RentalPaymentStatus.FAILED],
    ['PENDING', RentalPaymentStatus.CANCELED],
    ['SUCCESS', RentalPaymentStatus.CANCELED],
    ['SUCCESS', RentalPaymentStatus.FAILED],
    ['PARTIALLY_REFUNDED', RentalPaymentStatus.REFUNDED],
    ['CANCELED', RentalPaymentStatus.SUCCESS],
    ['FAILED', RentalPaymentStatus.SUCCESS]
  ])('accepte %s -> %s', async (from, to) => {
    const { tx, promise } = run(from, to);
    await expect(promise).resolves.toBeDefined();
    expect(tx.rentalPayment.update).toHaveBeenCalled();
  });

  it('ne réécrit rien quand le statut demandé est déjà le statut courant (double clic)', async () => {
    const { tx, promise } = run('CANCELED', RentalPaymentStatus.CANCELED);
    await expect(promise).resolves.toBeDefined();
    expect(tx.rentalPayment.update).not.toHaveBeenCalled();
    expect(annulerPieceTx).not.toHaveBeenCalled();
  });
});

describe('changement de statut : verrou et audit', () => {
  it('verrouille la ligne du paiement (FOR UPDATE) AVANT de la lire', async () => {
    const tx = makeTx(payment({ status: 'PENDING' }));
    const order: string[] = [];
    tx.$queryRaw.mockImplementation(async () => {
      order.push('verrou');
      return [];
    });
    tx.rentalPayment.findFirst.mockImplementation(async () => {
      order.push('lecture');
      return payment({ status: 'PENDING' });
    });

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.SUCCESS, 'u1');

    expect(order.slice(0, 2)).toEqual(['verrou', 'lecture']);
    const [strings] = tx.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toMatch(/rental_payments[\s\S]*FOR UPDATE/);
  });

  it('enregistre RENTAL_PAYMENT_STATUS_CHANGED avec l’état précédent quand un acteur change le statut', async () => {
    const canceledAt = new Date('2026-10-01T00:00:00.000Z');
    const tx = makeTx(payment({ status: 'CANCELED', canceled_at: canceledAt, failed_at: null }));

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.SUCCESS, 'u1');

    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: 'u1',
        tenantId: TENANT,
        actionKey: 'RENTAL_PAYMENT_STATUS_CHANGED',
        entityType: 'RENTAL_PAYMENT',
        entityId: 'pay-1',
        payload: { from: 'CANCELED', to: 'SUCCESS', previousCanceledAt: canceledAt, previousFailedAt: null }
      })
    );
  });

  it('n’enregistre rien sans acteur (flux automatique) ni quand le statut ne change pas', async () => {
    await updatePaymentStatusTx(
      makeTx(payment({ status: 'PENDING' })) as any,
      TENANT,
      'pay-1',
      RentalPaymentStatus.SUCCESS
    );
    await updatePaymentStatusTx(
      makeTx(payment({ status: 'SUCCESS' })) as any,
      TENANT,
      'pay-1',
      RentalPaymentStatus.SUCCESS,
      'u1'
    );

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('réactivation d’un paiement annulé (GL-06-039)', () => {
  it('ré-inscrit l’avance sous une clé neuve quand l’ancienne a été contre-passée', async () => {
    const tx = makeTx(payment({ status: 'CANCELED', amount: 300000 }), {
      movements: [
        { sourceId: 'pay-1', type: 'ADVANCE_RECEIVED', debit: null, credit: 300000 },
        { sourceId: 'pay-1', type: 'VOID', debit: 300000, credit: null }
      ]
    });

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.SUCCESS, 'u1');

    const advance = appendThirdPartyMovementTx.mock.calls
      .map(c => c[1])
      .find((m: Row) => m.type === 'ADVANCE_RECEIVED');
    expect(advance).toBeDefined();
    expect(advance.sourceType).toBe('RENTAL_PAYMENT');
    expect(advance.sourceId).not.toBe('pay-1');
    expect(advance.sourceId.startsWith('pay-1:')).toBe(true);
    expect(advance.settled).toBe(300000);
  });

  it('n’ajoute rien quand l’avance est toujours au compte', async () => {
    const tx = makeTx(payment({ status: 'PENDING', amount: 300000 }), {
      movements: [{ sourceId: 'pay-1', type: 'ADVANCE_RECEIVED', debit: null, credit: 300000 }]
    });

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.SUCCESS, 'u1');

    expect(appendThirdPartyMovementTx).not.toHaveBeenCalled();
  });

  it('contre-passe aussi l’avance ré-inscrite à une seconde annulation', async () => {
    const tx = makeTx(payment({ status: 'SUCCESS', amount: 300000 }), {
      movements: [
        { sourceId: 'pay-1', type: 'ADVANCE_RECEIVED', debit: null, credit: 300000 },
        { sourceId: 'pay-1', type: 'VOID', debit: 300000, credit: null },
        { sourceId: 'pay-1:r1', type: 'ADVANCE_RECEIVED', debit: null, credit: 300000 }
      ]
    });

    await updatePaymentStatusTx(tx as any, TENANT, 'pay-1', RentalPaymentStatus.CANCELED, 'u1');

    const voided = annulerPieceTx.mock.calls.map(c => c[1].sourceId);
    expect(voided).toContain('pay-1:r1');
  });
});

describe('devise du paiement (GL-06-012)', () => {
  function prismaWithLease(currency: string) {
    (prisma as any).rentalPayment = { findFirst: jest.fn(async () => null) };
    (prisma as any).rentalLease = {
      findFirst: jest.fn(async () => ({ id: 'lease-1', currency, primary_renter_client_id: 'client-1' }))
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async () => ({ id: 'pay-new' }));
  }

  it('refuse un paiement en EUR sur un bail en FCFA', async () => {
    prismaWithLease('FCFA');

    const promise = createPayment(
      TENANT,
      { leaseId: 'lease-1', method: 'CASH' as any, amount: 100, currency: 'EUR', idempotencyKey: 'k1' },
      'u1'
    );

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow('devise');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepte XOF sur un bail en FCFA (même monnaie)', async () => {
    prismaWithLease('FCFA');

    await expect(
      createPayment(
        TENANT,
        { leaseId: 'lease-1', method: 'CASH' as any, amount: 100, currency: 'XOF', idempotencyKey: 'k2' },
        'u1'
      )
    ).resolves.toBeDefined();
  });

  describe('renterClientId : locataire principal ou co-locataire du bail', () => {
    const AUTRE = 'client-autre';

    function prismaWithRenter(coRenter: Row | null) {
      prismaWithLease('FCFA');
      (prisma as any).tenantClient = { findFirst: jest.fn(async () => ({ id: AUTRE })) };
      (prisma as any).rentalLeaseCoRenter = { findFirst: jest.fn(async () => coRenter) };
    }

    const input = (renterClientId: string) => ({
      leaseId: 'lease-1',
      renterClientId,
      method: 'CASH' as any,
      amount: 100,
      idempotencyKey: 'k-renter'
    });

    it('refuse un client de l’agence qui n’est ni le principal ni un co-locataire du bail', async () => {
      prismaWithRenter(null);

      const promise = createPayment(TENANT, input(AUTRE), 'u1');

      await expect(promise).rejects.toBeInstanceOf(NotFoundError);
      await expect(promise).rejects.toThrow('Locataire introuvable');
      expect((prisma as any).rentalLeaseCoRenter.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { lease_id: 'lease-1', renter_client_id: AUTRE, tenant_id: TENANT }
        })
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepte un co-locataire du bail', async () => {
      prismaWithRenter({ id: 'co-1' });

      await expect(createPayment(TENANT, input(AUTRE), 'u1')).resolves.toBeDefined();
    });

    it('accepte le locataire principal sans chercher parmi les co-locataires', async () => {
      prismaWithRenter(null);
      (prisma as any).tenantClient.findFirst = jest.fn(async () => ({ id: 'client-1' }));

      await expect(createPayment(TENANT, input('client-1'), 'u1')).resolves.toBeDefined();
      expect((prisma as any).rentalLeaseCoRenter.findFirst).not.toHaveBeenCalled();
    });
  });

  it('refuse l’EUR sans bail (le compte du locataire est en FCFA)', async () => {
    (prisma as any).rentalPayment = { findFirst: jest.fn(async () => null) };

    await expect(
      createPayment(TENANT, { method: 'CASH' as any, amount: 100, currency: 'EUR', idempotencyKey: 'k3' }, 'u1')
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
