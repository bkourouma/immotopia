/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T023 : validation et rejet d'une déclaration par le gestionnaire
 * (`lib/syndics/declared-payment/declaration-review.ts`, contrats §1.9, §1.10,
 * §3.3, §3.5), sur une base en mémoire. `$transaction` restaure l'état sur
 * exception : on vérifie ainsi que « toutes les lignes ou aucune » tient, claim
 * compris. L'affectation réelle (appels, avance) est testée avec
 * `charge-allocation` ; ici `recordLotPaymentTx` est simulé.
 */

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SYNDIC = 'syndic-1';
const MANAGER = 'manager-1';
// Volontairement dans le désordre par rapport à l'ordre des verrous.
const LOT_A = '00000000-0000-4000-8000-00000000000a';
const LOT_B = '00000000-0000-4000-8000-00000000000b';
const RECEIVING_PHONE = '+2250707070712';
const PAYER_PHONE = '+2250505050512';
const DECLARED_AT = new Date('2026-10-10T09:30:00.000Z');
const NOW = new Date('2026-10-17T12:00:00.000Z');

interface Store {
  declarations: Row[];
  lots: Row[];
  calls: Row[];
  payments: Row[];
  auditRows: Row[];
}

const mockState = {
  store: { declarations: [], lots: [], calls: [], payments: [], auditRows: [] } as Store,
  /** Simule une autre décision qui prend la main juste avant le claim. */
  beforeClaim: null as null | (() => void),
  lockOrder: [] as string[],
  txOptions: [] as Row[],
  paymentSeq: 0
};

const clone = <T>(value: T): T => structuredClone(value);

const findDeclaration = (where: Row) =>
  mockState.store.declarations.find(
    d =>
      d.id === where.id &&
      d.tenantId === where.tenantId &&
      (where.syndicateId === undefined || d.syndicateId === where.syndicateId)
  );

const findLine = (id: string) => {
  for (const declaration of mockState.store.declarations) {
    const line = declaration.lines.find((l: Row) => l.id === id);
    if (line) return { declaration, line };
  }
  return null;
};

const declarationModel = {
  // Renvoie les lignes dans l'ordre d'insertion : le module doit trier lui-même.
  findFirst: jest.fn(async ({ where }: Row) => {
    const found = findDeclaration(where);
    return found ? clone(found) : null;
  }),
  updateMany: jest.fn(async ({ where, data }: Row) => {
    if (mockState.beforeClaim) {
      const hook = mockState.beforeClaim;
      mockState.beforeClaim = null;
      hook();
    }
    const found = mockState.store.declarations.filter(
      d =>
        d.id === where.id &&
        d.tenantId === where.tenantId &&
        d.syndicateId === where.syndicateId &&
        d.status === where.status
    );
    found.forEach(d => Object.assign(d, data));
    return { count: found.length };
  })
};

const mockTx: Row = {
  syndicPaymentDeclaration: declarationModel,
  syndicateLot: {
    findMany: jest.fn(async ({ where }: Row) =>
      mockState.store.lots
        .filter(l => where.id.in.includes(l.id) && l.syndicateId === where.syndicateId)
        .map(l => ({ id: l.id }))
    )
  },
  chargeCall: {
    findMany: jest.fn(async ({ where }: Row) =>
      mockState.store.calls
        .filter(c => where.id.in.includes(c.id) && c.syndicateId === where.syndicateId)
        .map(c => ({ id: c.id, lotId: c.lotId }))
    )
  },
  chargePayment: {
    findMany: jest.fn(async ({ where }: Row) =>
      mockState.store.payments.filter(p => where.idempotencyKey.in.includes(p.idempotencyKey))
    )
  },
  syndicPaymentDeclarationLine: {
    update: jest.fn(async ({ where, data }: Row) => {
      const found = findLine(where.id);
      if (!found || found.declaration.tenantId !== where.tenantId) throw new Error('ligne introuvable');
      Object.assign(found.line, data);
      return found.line;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      let count = 0;
      for (const id of where.id.in) {
        const found = findLine(id);
        if (found && found.declaration.tenantId === where.tenantId && found.declaration.id === where.declarationId) {
          Object.assign(found.line, data);
          count += 1;
        }
      }
      return { count };
    })
  }
};

// Transactions sérialisées (comme l'attente du verrou de ligne du claim) ; annulation = état restauré.
let mockTxQueue: Promise<unknown> = Promise.resolve();
const mockPrisma: Row = {
  syndicPaymentDeclaration: declarationModel,
  $transaction: jest.fn((fn: (tx: Row) => Promise<unknown>, options?: Row) => {
    const run = async () => {
      mockState.txOptions.push(options ?? {});
      const snapshot = clone(mockState.store);
      try {
        return await fn(mockTx);
      } catch (error) {
        mockState.store = snapshot;
        throw error;
      }
    };
    const result = mockTxQueue.then(run, run);
    mockTxQueue = result.catch(() => undefined);
    return result;
  })
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const mockAudit = { queued: [] as Row[] };
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => mockAudit.queued.push(entry),
  recordAuditEvent: async (_tx: unknown, entry: Row) => {
    mockState.store.auditRows.push(clone(entry));
  }
}));

const mockRecordLotPaymentTx = jest.fn(async (_tx: unknown, input: Row) => {
  if (!mockState.lockOrder.includes(input.lotId)) throw new Error('lot non verrouillé avant encaissement');
  const chosen = mockState.store.calls.filter(c =>
    input.chargeCallIds.length > 0 ? input.chargeCallIds.includes(c.id) : c.lotId === input.lotId
  );
  const outstanding = chosen.reduce((sum, c) => sum + c.outstanding, 0);
  const advance = Math.max(0, input.amount - outstanding);
  mockState.paymentSeq += 1;
  const id = `pay-${mockState.paymentSeq}`;
  mockState.store.payments.push({ id, ...clone(input) });
  return {
    record: { id, unallocatedAmount: advance },
    result: { payment: { id, amount: input.amount }, allocations: [], advance, lotAdvanceBalance: advance }
  };
});
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  recordLotPaymentTx: (...args: any[]) => (mockRecordLotPaymentTx as any)(...args),
  lockLotTx: async (_tx: unknown, lotId: string) => {
    mockState.lockOrder.push(lotId);
  },
  compareLotIdsForLocking: (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
}));

const mockIssueReceipts = jest.fn(async (_tx: unknown, input: Row) => [
  { id: `doc-${input.paymentId}`, kind: 'RECEIPT', number: `RC-${input.paymentId}`, extra: 'interne' }
]);
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: (...args: any[]) => (mockIssueReceipts as any)(...args),
  toDocumentRefs: (docs: Row[]) => docs.map(({ id, kind, number }) => ({ id, kind, number }))
}));

const mockAssertFiscalYearOpen = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({
  assertFiscalYearOpenTx: (...args: any[]) => (mockAssertFiscalYearOpen as any)(...args),
  isReceivingAccountNumber: (value: unknown) => typeof value === 'string' && /^5521\d+$/.test(value)
}));

import { Prisma } from '@prisma/client';
import { ConflictError } from '../../src/middleware/error-middleware';
import { approveDeclaration, rejectDeclaration } from '../../src/lib/syndics/declared-payment/declaration-review';
import { AuditActionKey } from '../../src/types/audit-types';

const store = () => mockState.store;
const declaration = () => store().declarations[0];
const lineOf = (lotId: string) => declaration().lines.find((l: Row) => l.lotId === lotId);

function seed(over: Row = {}) {
  mockState.store = {
    declarations: [
      {
        id: 'decl-1',
        tenantId: TENANT,
        syndicateId: SYNDIC,
        status: 'PENDING',
        amount: 30000,
        paidAt: DECLARED_AT,
        transactionReference: 'MP261010.0930.A12345',
        receivingPhone: RECEIVING_PHONE,
        payerPhone: PAYER_PHONE,
        proofFileUrl: 'uploads/syndics/payment-proofs/x.png',
        receivingNumber: { id: 'num-1', tenantId: TENANT, syndicateId: SYNDIC, treasuryAccountNumber: '55212' },
        acceptedAmount: null,
        acceptedPaidAt: null,
        reviewNote: null,
        reviewedByUserId: null,
        reviewedAt: null,
        rejectReason: null,
        // Lot B AVANT lot A : l'ordre des verrous doit être rétabli par le module.
        lines: [
          {
            id: 'line-b',
            lotId: LOT_B,
            amount: 10000,
            chargeCallIds: ['call-b1'],
            acceptedAmount: null,
            chargePaymentId: null
          },
          { id: 'line-a', lotId: LOT_A, amount: 20000, chargeCallIds: [], acceptedAmount: null, chargePaymentId: null }
        ],
        ...over
      }
    ],
    lots: [
      { id: LOT_A, syndicateId: SYNDIC },
      { id: LOT_B, syndicateId: SYNDIC }
    ],
    calls: [
      { id: 'call-a1', lotId: LOT_A, syndicateId: SYNDIC, outstanding: 15000 },
      { id: 'call-a2', lotId: LOT_A, syndicateId: SYNDIC, outstanding: 15000 },
      { id: 'call-b1', lotId: LOT_B, syndicateId: SYNDIC, outstanding: 10000 }
    ],
    payments: [],
    auditRows: []
  };
}

const approve = (over: Row = {}) =>
  approveDeclaration({
    tenantId: TENANT,
    syndicateId: SYNDIC,
    declarationId: 'decl-1',
    actorUserId: MANAGER,
    now: NOW,
    ...over
  });

const reject = (over: Row = {}) =>
  rejectDeclaration({
    tenantId: TENANT,
    syndicateId: SYNDIC,
    declarationId: 'decl-1',
    actorUserId: MANAGER,
    reason: 'NOT_FOUND',
    note: 'Aucun transfert reçu sur le relevé Orange Money du 10/10.',
    now: NOW,
    ...over
  });

async function expectAppError(promise: Promise<unknown>, statusCode: number, code?: string) {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

function expectNothingRecorded() {
  expect(declaration().status).toBe('PENDING');
  expect(declaration().reviewedAt).toBeNull();
  expect(store().payments).toHaveLength(0);
  expect(store().auditRows).toHaveLength(0);
  for (const line of declaration().lines) {
    expect(line.chargePaymentId).toBeNull();
    expect(line.acceptedAmount).toBeNull();
  }
}

const NOTE = 'Montant corrigé après relevé : frais opérateur déduits.';

beforeEach(() => {
  seed();
  mockState.beforeClaim = null;
  mockState.lockOrder = [];
  mockState.txOptions = [];
  mockState.paymentSeq = 0;
  mockAudit.queued.length = 0;
  jest.clearAllMocks();
  mockAssertFiscalYearOpen.mockImplementation(async () => undefined);
});

describe('approveDeclaration : validation telle que déclarée', () => {
  it('un encaissement par ligne, origine DECLARED, clé DECL-<ligne>, compte du numéro, date déclarée', async () => {
    const result = await approve();

    expect(mockRecordLotPaymentTx).toHaveBeenCalledTimes(2);
    const calls = mockRecordLotPaymentTx.mock.calls.map(call => call[1]);
    // Ordre croissant des lotId, quel que soit l'ordre des lignes en base.
    expect(calls.map(c => c.lotId)).toEqual([LOT_A, LOT_B]);
    expect(calls[0]).toEqual({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      lotId: LOT_A,
      amount: 20000,
      paidAt: DECLARED_AT,
      method: 'MOBILE_MONEY',
      reference: 'MP261010.0930.A12345',
      chargeCallIds: [],
      actorUserId: MANAGER,
      idempotencyKey: 'DECL-line-a',
      providerTransactionId: null,
      origin: 'DECLARED',
      treasuryAccountNumber: '55212'
    });
    expect(calls[1]).toMatchObject({
      lotId: LOT_B,
      amount: 10000,
      chargeCallIds: ['call-b1'],
      idempotencyKey: 'DECL-line-b',
      origin: 'DECLARED',
      method: 'MOBILE_MONEY',
      treasuryAccountNumber: '55212'
    });

    expect(declaration()).toMatchObject({
      status: 'APPROVED',
      reviewedByUserId: MANAGER,
      reviewedAt: NOW,
      acceptedAmount: 30000,
      acceptedPaidAt: DECLARED_AT,
      reviewNote: null
    });
    expect(lineOf(LOT_A)).toMatchObject({ chargePaymentId: 'pay-1', acceptedAmount: 20000 });
    expect(lineOf(LOT_B)).toMatchObject({ chargePaymentId: 'pay-2', acceptedAmount: 10000 });

    expect(mockIssueReceipts).toHaveBeenCalledTimes(2);
    expect(mockIssueReceipts.mock.calls[0][1]).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      lotId: LOT_A,
      paymentId: 'pay-1',
      actorUserId: MANAGER,
      issuedAt: NOW
    });
    expect(result.declarationId).toBe('decl-1');
    expect(result.documents.map(d => d.id)).toEqual(['doc-pay-1', 'doc-pay-2']);
    expect(result.documentRefs).toEqual([
      { id: 'doc-pay-1', kind: 'RECEIPT', number: 'RC-pay-1' },
      { id: 'doc-pay-2', kind: 'RECEIPT', number: 'RC-pay-2' }
    ]);
  });

  it('verrouille tous les lots dans l’ordre croissant AVANT le premier encaissement', async () => {
    await approve();
    // Les deux verrous sont pris d'emblée, puis le mock de recordLotPaymentTx le vérifie.
    expect(mockState.lockOrder).toEqual([LOT_A, LOT_B]);
  });

  it('une seule transaction, avec un délai adapté à dix lignes ; contrôle d’exercice sur la date retenue', async () => {
    await approve();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockState.txOptions[0]).toEqual({ maxWait: 10_000, timeout: 60_000 });
    expect(mockAssertFiscalYearOpen).toHaveBeenCalledWith(mockTx, SYNDIC, DECLARED_AT);
  });

  it('ne fait ni envoi ni notification et n’utilise pas la file d’audit asynchrone', async () => {
    await approve();
    expect(mockAudit.queued).toHaveLength(0);
    expect(store().auditRows).toHaveLength(1);
  });

  it('un appel visé soldé entre-temps ne bloque pas : tout le montant part en avance (R13)', async () => {
    store().calls.find(c => c.id === 'call-b1')!.outstanding = 0;
    const result = await approve();
    expect(declaration().status).toBe('APPROVED');
    const lotB = mockRecordLotPaymentTx.mock.calls.find(call => call[1].lotId === LOT_B)!;
    expect(lotB[1]).toMatchObject({ amount: 10000, chargeCallIds: ['call-b1'] });
    expect(result.documents).toHaveLength(2);
  });

  it('un appel visé disparu depuis la déclaration est écarté sans bloquer', async () => {
    store().calls = store().calls.filter(c => c.id !== 'call-b1');
    await approve();
    const lotB = mockRecordLotPaymentTx.mock.calls.find(call => call[1].lotId === LOT_B)!;
    expect(lotB[1].chargeCallIds).toEqual([]);
    expect(declaration().status).toBe('APPROVED');
  });

  it('excédent : le montant supérieur au reste dû est encaissé en entier (l’avance est faite par l’allocation)', async () => {
    declaration().lines[1].amount = 50000;
    declaration().amount = 60000;
    await approve();
    const lotA = mockRecordLotPaymentTx.mock.calls.find(call => call[1].lotId === LOT_A)!;
    expect(lotA[1].amount).toBe(50000);
    const recorded = await mockRecordLotPaymentTx.mock.results[0].value;
    expect(recorded.result.advance).toBe(20000);
    expect(declaration().acceptedAmount).toBe(60000);
  });

  it('une note facultative est enregistrée nettoyée', async () => {
    await approve({ note: '  Conforme au relevé.  ' });
    expect(declaration().reviewNote).toBe('Conforme au relevé.');
  });

  it('une correction vide ({} ou null) vaut une validation telle que déclarée, sans note obligatoire', async () => {
    await approve({ correction: {} });
    expect(declaration().status).toBe('APPROVED');
    seed();
    await approve({ correction: null });
    expect(declaration().status).toBe('APPROVED');
  });
});

describe('approveDeclaration : correction (R18)', () => {
  const allLines = (a: number, b: number, extra: Row = {}) => [
    { lineId: 'line-a', acceptedAmount: a, ...(extra.a ?? {}) },
    { lineId: 'line-b', acceptedAmount: b, ...(extra.b ?? {}) }
  ];

  it('paiement partiel : montant retenu inférieur, montant déclaré conservé, note enregistrée', async () => {
    await approve({ correction: { lines: allLines(12000, 10000) }, note: NOTE });
    const lotA = mockRecordLotPaymentTx.mock.calls.find(call => call[1].lotId === LOT_A)!;
    expect(lotA[1].amount).toBe(12000);
    expect(declaration()).toMatchObject({ status: 'APPROVED', amount: 30000, acceptedAmount: 22000, reviewNote: NOTE });
    expect(lineOf(LOT_A)).toMatchObject({ amount: 20000, acceptedAmount: 12000 });
  });

  it('refuse un total retenu supérieur au total déclaré : 400 DECLARATION_AMOUNT_TOO_HIGH, rien d’enregistré', async () => {
    await expectAppError(
      approve({ correction: { lines: allLines(20000, 10001) }, note: NOTE }),
      400,
      'DECLARATION_AMOUNT_TOO_HIGH'
    );
    expectNothingRecorded();
  });

  it('autorise la répartition entre lots (R18) tant que le total ne dépasse pas le déclaré', async () => {
    await approve({ correction: { lines: allLines(25000, 5000) }, note: NOTE });
    expect(lineOf(LOT_A)).toMatchObject({ amount: 20000, acceptedAmount: 25000 });
    expect(declaration().acceptedAmount).toBe(30000);
  });

  it('refuse un montant retenu au-delà du plafond (5 000 000) : 400 DECLARATION_AMOUNT_TOO_HIGH', async () => {
    await expectAppError(
      approve({ correction: { lines: allLines(5_000_001, 0) }, note: NOTE }),
      400,
      'DECLARATION_AMOUNT_TOO_HIGH'
    );
    expectNothingRecorded();
  });

  it('refuse un entier non sûr, décimal, négatif ou infini : 400 VALIDATION_ERROR', async () => {
    for (const bad of [2 ** 60, 12.5, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      await expectAppError(approve({ correction: { lines: allLines(bad, 0) }, note: NOTE }), 400, 'VALIDATION_ERROR');
    }
    expectNothingRecorded();
  });

  it('une ligne à 0 n’est pas encaissée : montant retenu 0, aucun paiement, aucun document', async () => {
    const result = await approve({ correction: { lines: allLines(20000, 0) }, note: NOTE });
    expect(mockRecordLotPaymentTx).toHaveBeenCalledTimes(1);
    expect(mockRecordLotPaymentTx.mock.calls[0][1].lotId).toBe(LOT_A);
    expect(mockState.lockOrder).toEqual([LOT_A]);
    expect(lineOf(LOT_B)).toMatchObject({ acceptedAmount: 0, chargePaymentId: null });
    expect(declaration().acceptedAmount).toBe(20000);
    expect(result.documents).toHaveLength(1);
  });

  it('date corrigée : toutes les lignes s’enregistrent à la date retenue, la date déclarée reste', async () => {
    const paidAt = '2026-10-11T08:00:00+00:00';
    await approve({ correction: { paidAt }, note: NOTE });
    for (const call of mockRecordLotPaymentTx.mock.calls) {
      expect(call[1].paidAt).toEqual(new Date(paidAt));
    }
    expect(mockAssertFiscalYearOpen).toHaveBeenCalledWith(mockTx, SYNDIC, new Date(paidAt));
    expect(declaration().paidAt).toEqual(DECLARED_AT);
    expect(declaration().acceptedPaidAt).toEqual(new Date(paidAt));
  });

  it('appels corrigés du lot de la ligne : transmis tels quels ; [] = plus anciens d’abord', async () => {
    await approve({
      correction: { lines: allLines(20000, 10000, { a: { chargeCallIds: ['call-a2'] }, b: { chargeCallIds: [] } }) },
      note: NOTE
    });
    const byLot = new Map(mockRecordLotPaymentTx.mock.calls.map(call => [call[1].lotId, call[1]]));
    expect(byLot.get(LOT_A)!.chargeCallIds).toEqual(['call-a2']);
    expect(byLot.get(LOT_B)!.chargeCallIds).toEqual([]);
  });

  it('appel corrigé d’un autre lot : 404 et rien n’est enregistré (claim annulé)', async () => {
    await expectAppError(
      approve({ correction: { lines: allLines(20000, 10000, { a: { chargeCallIds: ['call-b1'] } }) }, note: NOTE }),
      404
    );
    expect(mockRecordLotPaymentTx).not.toHaveBeenCalled();
    expectNothingRecorded();
  });

  it('appel corrigé d’une autre copropriété : 404', async () => {
    store().calls.push({ id: 'call-x', lotId: LOT_A, syndicateId: 'syndic-2', outstanding: 5000 });
    await expectAppError(
      approve({ correction: { lines: allLines(20000, 10000, { a: { chargeCallIds: ['call-x'] } }) }, note: NOTE }),
      404
    );
    expectNothingRecorded();
  });

  it('correction sans note : 400 VALIDATION_ERROR, aucune transaction', async () => {
    await expectAppError(approve({ correction: { lines: allLines(12000, 10000) } }), 400, 'VALIDATION_ERROR');
    await expectAppError(
      approve({ correction: { lines: allLines(12000, 10000) }, note: '  court  ' }),
      400,
      'VALIDATION_ERROR'
    );
    await expectAppError(
      approve({ correction: { lines: allLines(12000, 10000) }, note: 'x'.repeat(501) }),
      400,
      'VALIDATION_ERROR'
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expectNothingRecorded();
  });

  it('correction qui ne couvre pas toutes les lignes, ligne en double ou inconnue : 400', async () => {
    await expectAppError(
      approve({ correction: { lines: [{ lineId: 'line-a', acceptedAmount: 20000 }] }, note: NOTE }),
      400,
      'VALIDATION_ERROR'
    );
    await expectAppError(
      approve({
        correction: {
          lines: [
            { lineId: 'line-a', acceptedAmount: 20000 },
            { lineId: 'line-a', acceptedAmount: 10000 }
          ]
        },
        note: NOTE
      }),
      400,
      'VALIDATION_ERROR'
    );
    await expectAppError(
      approve({
        correction: {
          lines: [
            { lineId: 'line-a', acceptedAmount: 20000 },
            { lineId: 'line-z', acceptedAmount: 10000 }
          ]
        },
        note: NOTE
      }),
      400,
      'VALIDATION_ERROR'
    );
    await expectAppError(approve({ correction: { lines: [] }, note: NOTE }), 400, 'VALIDATION_ERROR');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('toutes les lignes à 0 : 400', async () => {
    await expectAppError(approve({ correction: { lines: allLines(0, 0) }, note: NOTE }), 400, 'VALIDATION_ERROR');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('montant négatif ou décimal : 400', async () => {
    await expectAppError(approve({ correction: { lines: allLines(-1, 10000) }, note: NOTE }), 400, 'VALIDATION_ERROR');
    await expectAppError(
      approve({ correction: { lines: allLines(100.5, 10000) }, note: NOTE }),
      400,
      'VALIDATION_ERROR'
    );
  });

  it('date corrigée dans le futur (> 10 min) : 400 DECLARATION_DATE_OUT_OF_RANGE ; illisible : 400 VALIDATION_ERROR', async () => {
    const future = new Date(NOW.getTime() + 11 * 60_000).toISOString();
    await expectAppError(approve({ correction: { paidAt: future }, note: NOTE }), 400, 'DECLARATION_DATE_OUT_OF_RANGE');
    await expectAppError(approve({ correction: { paidAt: 'pas une date' }, note: NOTE }), 400, 'VALIDATION_ERROR');
    // Tolérance de 10 minutes.
    const nearFuture = new Date(NOW.getTime() + 9 * 60_000).toISOString();
    await approve({ correction: { paidAt: nearFuture }, note: NOTE });
    expect(declaration().status).toBe('APPROVED');
  });
});

describe('approveDeclaration : atomicité et concurrence (R16, R19)', () => {
  it('exercice clos à la date retenue : l’erreur d’exercice remonte, rien n’est enregistré', async () => {
    mockAssertFiscalYearOpen.mockImplementation(async () => {
      throw new ConflictError('Exercice clos : aucune écriture ne peut y être passée');
    });
    await expect(approve()).rejects.toBeInstanceOf(ConflictError);
    expect(mockRecordLotPaymentTx).not.toHaveBeenCalled();
    expectNothingRecorded();
    expect(declaration().paidAt).toEqual(DECLARED_AT);
  });

  it('claim perdu (autre décision concurrente) : 409 DECLARATION_NOT_PENDING sans aucun encaissement', async () => {
    mockState.beforeClaim = () => {
      declaration().status = 'APPROVED';
    };
    await expectAppError(approve(), 409, 'DECLARATION_NOT_PENDING');
    expect(mockRecordLotPaymentTx).not.toHaveBeenCalled();
    expect(mockAssertFiscalYearOpen).not.toHaveBeenCalled();
    expect(store().payments).toHaveLength(0);
  });

  it('deux validations simultanées : une seule gagne, l’autre reçoit 409', async () => {
    const results = await Promise.allSettled([approve(), approve()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ statusCode: 409, code: 'DECLARATION_NOT_PENDING' });
    expect(store().payments).toHaveLength(2);
    expect(store().auditRows).toHaveLength(1);
  });

  it('déclaration déjà traitée : 409 avant toute transaction', async () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELED']) {
      seed({ status });
      await expectAppError(approve(), 409, 'DECLARATION_NOT_PENDING');
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('déclaration d’une autre agence ou d’une autre copropriété : 404', async () => {
    await expectAppError(approve({ tenantId: OTHER_TENANT }), 404);
    await expectAppError(approve({ syndicateId: 'syndic-2' }), 404);
    await expectAppError(approve({ declarationId: 'decl-inconnue' }), 404);
    expectNothingRecorded();
  });

  it('échec sur la seconde ligne : la première est annulée avec le claim (toutes ou aucune)', async () => {
    mockRecordLotPaymentTx.mockImplementationOnce(async (_tx: unknown, input: Row) => {
      mockState.store.payments.push({ id: 'pay-x', ...clone(input) });
      return {
        record: { id: 'pay-x', unallocatedAmount: 0 },
        result: { payment: { id: 'pay-x', amount: input.amount }, allocations: [], advance: 0, lotAdvanceBalance: 0 }
      };
    });
    mockRecordLotPaymentTx.mockImplementationOnce(async () => {
      throw new Error('panne');
    });
    await expect(approve()).rejects.toThrow('panne');
    expectNothingRecorded();
  });

  it('clé DECL-<ligne> déjà portée par un paiement : 409, rien n’est enregistré', async () => {
    store().payments.push({ id: 'pay-old', idempotencyKey: 'DECL-line-b', lotId: LOT_B });
    await expectAppError(approve(), 409, 'DECLARATION_NOT_PENDING');
    expect(mockRecordLotPaymentTx).not.toHaveBeenCalled();
    expect(declaration().status).toBe('PENDING');
    expect(store().payments.map(p => p.id)).toEqual(['pay-old']);
  });

  it('course sur la clé d’idempotence (P2002) : 409 et tout est annulé, aucun rattachement', async () => {
    mockRecordLotPaymentTx.mockImplementationOnce(async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['idempotency_key'] }
      });
    });
    await expectAppError(approve(), 409, 'DECLARATION_NOT_PENDING');
    expectNothingRecorded();
  });

  it('numéro de réception sans sous-compte 5521x : 404 avant la transaction', async () => {
    declaration().receivingNumber.treasuryAccountNumber = '521';
    await expectAppError(approve(), 404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('lot d’une ligne qui n’est plus dans la copropriété : 404 et rien n’est enregistré', async () => {
    store().lots = store().lots.filter(l => l.id !== LOT_B);
    await expectAppError(approve(), 404);
    expectNothingRecorded();
  });
});

describe('approveDeclaration : audit (§3.5)', () => {
  it('trace critique dans la transaction : identifiants et montants, sans téléphone, référence, capture ni note', async () => {
    await approve({
      correction: {
        lines: [
          { lineId: 'line-a', acceptedAmount: 20000 },
          { lineId: 'line-b', acceptedAmount: 0 }
        ]
      },
      note: NOTE
    });
    expect(store().auditRows).toHaveLength(1);
    const entry = store().auditRows[0];
    expect(entry).toMatchObject({
      actorUserId: MANAGER,
      tenantId: TENANT,
      actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_APPROVED,
      entityId: 'decl-1',
      payload: {
        declarationId: 'decl-1',
        syndicateId: SYNDIC,
        status: 'APPROVED',
        declaredAmount: 30000,
        acceptedAmount: 20000,
        corrected: true,
        paidAtChanged: false,
        chargePaymentIds: ['pay-1']
      }
    });
    const serialized = JSON.stringify(entry);
    for (const forbidden of [RECEIVING_PHONE, PAYER_PHONE, '0707070712', 'payment-proofs', NOTE, 'MP261010']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('validation telle que déclarée : corrected false', async () => {
    await approve();
    expect(store().auditRows[0].payload).toMatchObject({ corrected: false, chargePaymentIds: ['pay-1', 'pay-2'] });
  });
});

describe('rejectDeclaration (R20)', () => {
  it('passe REJECTED avec motif et note, sans écriture comptable ni ligne touchée', async () => {
    await expect(reject()).resolves.toEqual({ declarationId: 'decl-1' });
    expect(declaration()).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'NOT_FOUND',
      reviewNote: 'Aucun transfert reçu sur le relevé Orange Money du 10/10.',
      reviewedByUserId: MANAGER,
      reviewedAt: NOW,
      acceptedAmount: null,
      acceptedPaidAt: null
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecordLotPaymentTx).not.toHaveBeenCalled();
    expect(mockIssueReceipts).not.toHaveBeenCalled();
    expect(store().payments).toHaveLength(0);
    for (const line of declaration().lines) expect(line).toMatchObject({ acceptedAmount: null, chargePaymentId: null });
  });

  it('audit : motif et identifiants, sans la note libre ni téléphone', async () => {
    await reject({ reason: 'AMOUNT_MISMATCH' });
    expect(mockAudit.queued).toHaveLength(1);
    const entry = mockAudit.queued[0];
    expect(entry).toMatchObject({
      actorUserId: MANAGER,
      tenantId: TENANT,
      actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_REJECTED,
      entityId: 'decl-1',
      payload: { declarationId: 'decl-1', syndicateId: SYNDIC, status: 'REJECTED', reason: 'AMOUNT_MISMATCH' }
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('Orange Money du 10/10');
    expect(serialized).not.toContain(PAYER_PHONE);
  });

  it('note trop courte, trop longue ou absente : 400 ; motif inconnu : 400', async () => {
    await expectAppError(reject({ note: 'trop court'.slice(0, 9) }), 400, 'VALIDATION_ERROR');
    await expectAppError(reject({ note: 'x'.repeat(501) }), 400, 'VALIDATION_ERROR');
    await expectAppError(reject({ note: undefined }), 400, 'VALIDATION_ERROR');
    await expectAppError(reject({ reason: 'PAS_UN_MOTIF' }), 400, 'VALIDATION_ERROR');
    expect(declaration().status).toBe('PENDING');
    expect(declarationModel.updateMany).not.toHaveBeenCalled();
  });

  it('claim perdu : 409 DECLARATION_NOT_PENDING', async () => {
    mockState.beforeClaim = () => {
      declaration().status = 'CANCELED';
    };
    await expectAppError(reject(), 409, 'DECLARATION_NOT_PENDING');
    expect(declaration().status).toBe('CANCELED');
    expect(mockAudit.queued).toHaveLength(0);
  });

  it('déjà traitée : 409 ; autre agence ou copropriété : 404', async () => {
    seed({ status: 'APPROVED' });
    await expectAppError(reject(), 409, 'DECLARATION_NOT_PENDING');
    seed();
    await expectAppError(reject({ tenantId: OTHER_TENANT }), 404);
    await expectAppError(reject({ syndicateId: 'syndic-2' }), 404);
    expect(declaration().status).toBe('PENDING');
  });

  it('une déclaration rejetée ne peut plus être validée', async () => {
    await reject();
    await expectAppError(approve(), 409, 'DECLARATION_NOT_PENDING');
    expect(store().payments).toHaveLength(0);
  });
});
