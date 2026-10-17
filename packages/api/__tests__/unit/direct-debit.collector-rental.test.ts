/**
 * Encaisseur des loyers (spec 042, P3, data-model §8.6).
 *
 * Les services financiers (paiement, grand livre, génération de documents) sont
 * simulés : le test vérifie qu'ils sont appelés dans la bonne recette et avec les
 * bons arguments, pas leur propre logique (couverte par leurs suites).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const mockServices = {
  updateStatus: jest.fn(),
  allocate: jest.fn(),
  account: jest.fn(),
  movement: jest.fn(),
  generate: jest.fn()
};
const mockCalls: string[] = [];

const mockState: {
  leases: Row[];
  installments: Row[];
  payments: Row[];
  items: Row[];
  documents: Row[];
} = { leases: [], installments: [], payments: [], items: [], documents: [] };

const mockMatches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, expected]) => expected === undefined || row[key] === expected);

const mockTx: Row = {
  rentalLease: {
    findFirst: jest.fn(async ({ where }: Row) => mockState.leases.find(row => mockMatches(row, where)) ?? null)
  },
  rentalInstallment: {
    findFirst: jest.fn(async ({ where }: Row) => mockState.installments.find(row => mockMatches(row, where)) ?? null),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = mockState.installments.filter(row => mockMatches(row, where));
      rows.forEach(row => {
        row.amount_other_fees += data.amount_other_fees.increment;
      });
      return { count: rows.length };
    })
  },
  rentalInstallmentItem: {
    findMany: jest.fn(async ({ where }: Row) => mockState.items.filter(row => mockMatches(row, where))),
    create: jest.fn(async ({ data }: Row) => {
      mockState.items.push({ id: `item-${mockState.items.length + 1}`, ...data });
      return data;
    })
  },
  rentalPayment: {
    create: jest.fn(async ({ data }: Row) => {
      mockCalls.push('create');
      const row = { id: `pay-${mockState.payments.length + 1}`, ...data };
      mockState.payments.push(row);
      return { id: row.id };
    }),
    findFirst: jest.fn(async ({ where }: Row) => mockState.payments.find(row => mockMatches(row, where)) ?? null)
  },
  rentalDocument: {
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = mockState.documents.filter(row => mockMatches(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    }),
    findFirst: jest.fn(async ({ where }: Row) => mockState.documents.find(row => mockMatches(row, where)) ?? null)
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockTx }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: (...args: unknown[]) => mockServices.updateStatus(...args),
  allocatePaymentTx: (...args: unknown[]) => mockServices.allocate(...args)
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  compteLocataireDuBailTx: (...args: unknown[]) => mockServices.account(...args)
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: unknown[]) => mockServices.movement(...args)
}));
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: (...args: unknown[]) => mockServices.generate(...args)
}));
jest.mock('../../src/lib/ai/advisory-lock', () => ({
  withExclusiveSection: jest.fn(async (key: string, fn: () => Promise<unknown>) => {
    mockCalls.push(`lock:${key}`);
    return fn();
  })
}));

import { NotFoundError } from '../../src/middleware/error-middleware';
import { logger } from '../../src/utils/logger';
import { withExclusiveSection } from '../../src/lib/ai/advisory-lock';
import { rentalCollector } from '../../src/lib/direct-debit/collectors/rental';
import { getCollector, type CollectorContext, type CollectorLine } from '../../src/lib/direct-debit/collectors';

const TENANT = 'tenant-a';
const NOW = new Date('2026-10-28T09:00:00Z');
const SETTLED_AT = new Date('2026-10-27T00:00:00Z');
const ctx: CollectorContext = { tenantId: TENANT, actorUserId: 'user-1', now: NOW };

const collectorLine = (over: Partial<CollectorLine> = {}): CollectorLine => ({
  id: 'line-1',
  tenantId: TENANT,
  remittanceId: 'rem-1',
  reference: 'PRL-2026-0001-001',
  mandateId: 'mandate-1',
  amount: 160000,
  scope: 'RENTAL_LEASE',
  leaseId: 'lease-1',
  installmentId: 'inst-1',
  lotId: null,
  chargeCallIds: [],
  syndicateId: null,
  rentalPaymentId: null,
  chargePaymentId: null,
  treasuryAccountId: 'treasury-1',
  ...over
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockState.leases = [
    { id: 'lease-1', tenant_id: TENANT, currency: 'FCFA', primary_renter_client_id: 'client-1' },
    { id: 'lease-x', tenant_id: 'tenant-b', currency: 'FCFA', primary_renter_client_id: 'client-x' }
  ];
  mockState.installments = [
    {
      id: 'inst-1',
      tenant_id: TENANT,
      lease_id: 'lease-1',
      status: 'DUE',
      currency: 'FCFA',
      period_year: 2026,
      period_month: 10,
      amount_other_fees: 0
    }
  ];
  mockState.payments = [];
  mockState.items = [];
  mockState.documents = [];
  mockServices.updateStatus.mockImplementation(async () => {
    mockCalls.push('status');
    return {};
  });
  mockServices.allocate.mockImplementation(async () => {
    mockCalls.push('allocate');
    return {};
  });
  mockServices.account.mockResolvedValue({ accountId: 'account-1', tenantClientId: 'client-1' });
  mockServices.movement.mockResolvedValue({});
  mockServices.generate.mockResolvedValue({ id: 'doc-1' });
});

describe('encaisseur RENTAL_LEASE / règlement', () => {
  it('est l’encaisseur du périmètre des loyers et garde la clé d’activité', () => {
    expect(getCollector('RENTAL_LEASE')).toBe(rentalCollector);
    expect(rentalCollector.keepsActiveKeyOnSettle).toBe(true);
    expect(() => getCollector('SYNDIC_LOT')).toThrow();
  });

  it('crée le paiement PENDING, le passe SUCCESS puis le ventile, dans cet ordre', async () => {
    const result = await rentalCollector.settleTx(mockTx as any, ctx, collectorLine(), SETTLED_AT);

    expect(result.rentalPaymentId).toBe('pay-1');
    expect(mockCalls.slice(0, 3)).toEqual(['create', 'status', 'allocate']);
    expect(mockState.payments[0]).toMatchObject({
      tenant_id: TENANT,
      lease_id: 'lease-1',
      renter_client_id: 'client-1',
      method: 'DIRECT_DEBIT',
      status: 'PENDING',
      currency: 'FCFA',
      treasury_account_id: 'treasury-1',
      idempotency_key: 'direct-debit-line:line-1',
      psp_reference: 'PRL-2026-0001-001',
      succeeded_at: SETTLED_AT,
      created_by_user_id: 'user-1'
    });
    expect(Number(mockState.payments[0].amount)).toBe(160000);
    // Jamais `psp_transaction_id` : unique et réservé aux agrégateurs de paiement.
    expect(mockState.payments[0]).not.toHaveProperty('psp_transaction_id');

    expect(mockServices.updateStatus).toHaveBeenCalledWith(mockTx, TENANT, 'pay-1', 'SUCCESS', 'user-1');
    expect(mockServices.allocate).toHaveBeenCalledWith(
      mockTx,
      TENANT,
      'pay-1',
      { installmentIds: ['inst-1'], amounts: { 'inst-1': 160000 } },
      'user-1'
    );
  });

  it('garde le montant en avance quand rien n’est allouable', async () => {
    mockServices.allocate.mockRejectedValue(new Error('Aucune échéance trouvée'));
    const result = await rentalCollector.settleTx(mockTx as any, ctx, collectorLine(), SETTLED_AT);
    expect(result.rentalPaymentId).toBe('pay-1');
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ tenantId: TENANT }));
  });

  it('refuse un bail ou une échéance qui n’est pas de l’agence (404)', async () => {
    await expect(
      rentalCollector.settleTx(mockTx as any, ctx, collectorLine({ leaseId: 'lease-x' }), SETTLED_AT)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      rentalCollector.settleTx(mockTx as any, ctx, collectorLine({ installmentId: 'inst-x' }), SETTLED_AT)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      rentalCollector.settleTx(mockTx as any, { ...ctx, tenantId: 'tenant-b' }, collectorLine(), SETTLED_AT)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockState.payments).toHaveLength(0);
  });

  describe('quittance après le commit', () => {
    it('génère la quittance sous verrou quand aucune quittance FINAL n’existe', async () => {
      const result = await rentalCollector.settleTx(mockTx as any, ctx, collectorLine(), SETTLED_AT);
      expect(mockServices.generate).not.toHaveBeenCalled();
      await result.afterCommit?.();
      expect(withExclusiveSection).toHaveBeenCalledWith(
        `direct-debit-receipt:${TENANT}:pay-1`,
        expect.any(Function),
        expect.any(Object)
      );
      expect(mockServices.generate).toHaveBeenCalledWith(
        TENANT,
        'RENT_RECEIPT',
        'pay-1',
        undefined,
        { installmentId: 'inst-1' },
        'user-1'
      );
    });

    it('est idempotente : une quittance FINAL existante n’est pas régénérée', async () => {
      const result = await rentalCollector.settleTx(mockTx as any, ctx, collectorLine(), SETTLED_AT);
      mockState.documents.push({
        id: 'doc-1',
        tenant_id: TENANT,
        payment_id: 'pay-1',
        type: 'RENT_RECEIPT',
        status: 'FINAL'
      });
      await result.afterCommit?.();
      expect(mockServices.generate).not.toHaveBeenCalled();
    });

    it('journalise l’absence de modèle sans lever', async () => {
      mockServices.generate.mockRejectedValue(new Error('Aucun modèle de quittance'));
      const result = await rentalCollector.settleTx(mockTx as any, ctx, collectorLine(), SETTLED_AT);
      await expect(result.afterCommit?.()).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('sans utilisateur à l’origine du constat, aucune quittance n’est fabriquée', async () => {
      const result = await rentalCollector.settleTx(
        mockTx as any,
        { ...ctx, actorUserId: null },
        collectorLine(),
        SETTLED_AT
      );
      await result.afterCommit?.();
      expect(mockServices.generate).not.toHaveBeenCalled();
      expect(mockServices.allocate.mock.calls[0][4]).toBe('system');
    });
  });
});

describe('encaisseur RENTAL_LEASE / contre-passation', () => {
  beforeEach(() => {
    mockState.payments = [{ id: 'pay-1', tenant_id: TENANT, status: 'SUCCESS' }];
    mockState.documents = [
      { id: 'doc-1', tenant_id: TENANT, payment_id: 'pay-1', type: 'RENT_RECEIPT', status: 'FINAL' },
      { id: 'doc-2', tenant_id: TENANT, payment_id: 'pay-1', type: 'RENT_RECEIPT', status: 'VOID' },
      { id: 'doc-3', tenant_id: TENANT, payment_id: 'pay-2', type: 'RENT_RECEIPT', status: 'FINAL' }
    ];
  });

  it('passe le paiement FAILED et annule les quittances FINAL de ce paiement seulement', async () => {
    await rentalCollector.reverseTx(mockTx as any, ctx, collectorLine({ rentalPaymentId: 'pay-1' }));
    expect(mockServices.updateStatus).toHaveBeenCalledWith(mockTx, TENANT, 'pay-1', 'FAILED', 'user-1');
    expect(mockState.documents.map(doc => doc.status)).toEqual(['VOID', 'VOID', 'FINAL']);
  });

  it('un paiement déjà FAILED n’est pas rejoué mais ses quittances sont annulées', async () => {
    mockState.payments[0].status = 'FAILED';
    await rentalCollector.reverseTx(mockTx as any, ctx, collectorLine({ rentalPaymentId: 'pay-1' }));
    expect(mockServices.updateStatus).not.toHaveBeenCalled();
    expect(mockState.documents[0].status).toBe('VOID');
  });

  it('un paiement d’une autre agence ou inconnu : 404 ; sans paiement lié : rien', async () => {
    await expect(
      rentalCollector.reverseTx(
        mockTx as any,
        { ...ctx, tenantId: 'tenant-b' },
        collectorLine({ rentalPaymentId: 'pay-1' })
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      rentalCollector.reverseTx(mockTx as any, ctx, collectorLine({ rentalPaymentId: 'pay-9' }))
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(rentalCollector.reverseTx(mockTx as any, ctx, collectorLine())).resolves.toEqual({});
    expect(mockServices.updateStatus).not.toHaveBeenCalled();
  });
});

describe('encaisseur RENTAL_LEASE / frais de rejet', () => {
  it('ajoute l’article, majore les autres frais et inscrit le mouvement de compte', async () => {
    const result = await rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine(), 2500);

    expect(result).toEqual({ appliedAmount: 2500 });
    expect(mockState.installments[0].amount_other_fees).toBe(2500);
    expect(mockState.items).toHaveLength(1);
    expect(mockState.items[0]).toMatchObject({
      tenant_id: TENANT,
      installment_id: 'inst-1',
      charge_type: 'OTHER',
      label: 'Frais de rejet de prélèvement',
      metadata: { kind: 'DIRECT_DEBIT_REJECT_FEE', lineId: 'line-1' }
    });
    expect(Number(mockState.items[0].amount)).toBe(2500);
    expect(mockServices.account).toHaveBeenCalledWith(mockTx, TENANT, 'lease-1');
    expect(mockServices.movement).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        accountId: 'account-1',
        tenantId: TENANT,
        type: 'ADJUSTMENT',
        billed: 2500,
        sourceType: 'DIRECT_DEBIT_REJECT_FEE',
        sourceId: 'line-1',
        leaseId: 'lease-1'
      })
    );
  });

  it('est idempotent : un frais déjà ajouté pour la ligne n’est pas compté deux fois', async () => {
    await rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine(), 2500);
    const again = await rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine(), 2500);
    expect(again.appliedAmount).toBe(2500);
    expect(mockState.items).toHaveLength(1);
    expect(mockState.installments[0].amount_other_fees).toBe(2500);
    expect(mockServices.movement).toHaveBeenCalledTimes(1);
    // Une autre ligne de la même échéance (échéance représentée puis rejetée à nouveau) paie son propre frais.
    await rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine({ id: 'line-2' }), 2500);
    expect(mockState.items).toHaveLength(2);
    expect(mockState.installments[0].amount_other_fees).toBe(5000);
  });

  it('une échéance encore brouillon n’est pas facturée : pas de mouvement en double', async () => {
    mockState.installments[0].status = 'DRAFT';
    await rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine(), 2500);
    expect(mockState.installments[0].amount_other_fees).toBe(2500);
    expect(mockServices.movement).not.toHaveBeenCalled();
  });

  it('un frais nul ne touche à rien ; une échéance étrangère donne 404', async () => {
    expect(await rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine(), 0)).toEqual({
      appliedAmount: 0
    });
    expect(mockState.items).toHaveLength(0);
    await expect(
      rentalCollector.applyRejectFeeTx(mockTx as any, ctx, collectorLine({ installmentId: 'inst-x' }), 2500)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
