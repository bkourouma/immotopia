/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T017 : numéros de réception mobile money
 * (`lib/syndics/declared-payment/receiving-numbers.ts`, contrats §1.1 à 1.4).
 * Prisma est remplacé par un magasin en mémoire : aucune base requise.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SYNDIC_A1 = '11111111-1111-4111-8111-111111111111';
const SYNDIC_A2 = '22222222-2222-4222-8222-222222222222';
const SYNDIC_B = '33333333-3333-4333-8333-333333333333';
const ACTOR = 'user-1';

const store = {
  syndicates: [] as Row[],
  numbers: [] as Row[],
  declarations: [] as Row[],
  accounts: [] as Row[],
  lines: [] as Row[],
  seq: 0
};

function resetStore() {
  store.syndicates = [
    { id: SYNDIC_A1, tenantId: TENANT_A },
    { id: SYNDIC_A2, tenantId: TENANT_A },
    { id: SYNDIC_B, tenantId: TENANT_B }
  ];
  store.numbers = [];
  store.declarations = [];
  store.accounts = [];
  store.lines = [];
  store.seq = 0;
}

function matchValue(actual: any, expected: any): boolean {
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    if ('in' in expected) return expected.in.includes(actual);
    if ('not' in expected) return actual !== expected.not;
  }
  return actual === expected;
}
const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, value]) => value === undefined || matchValue(row[key], value));

const mockPrisma: Row = {
  syndicate: { findFirst: jest.fn(async ({ where }: Row) => store.syndicates.find(r => matches(r, where)) ?? null) },
  syndicReceivingNumber: {
    findMany: jest.fn(async ({ where }: Row) => {
      const found = store.numbers.filter(r => matches(r, where));
      return [...found].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.seq - b.seq
      );
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.numbers.find(r => matches(r, where));
      return found ? { ...found } : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      if (
        store.numbers.some(
          r => r.syndicateId === data.syndicateId && r.operator === data.operator && r.phoneNumber === data.phoneNumber
        )
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      store.seq += 1;
      const row = {
        id: `num-${store.seq}`,
        seq: store.seq,
        label: null,
        sortOrder: 0,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        updatedAt: new Date('2026-10-01T10:00:00Z'),
        ...data
      };
      store.numbers.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = store.numbers.filter(r => matches(r, where));
      found.forEach(r => Object.assign(r, data));
      return { count: found.length };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const before = store.numbers.length;
      store.numbers = store.numbers.filter(r => !matches(r, where));
      return { count: before - store.numbers.length };
    })
  },
  syndicPaymentDeclaration: {
    count: jest.fn(async ({ where }: Row) => store.declarations.filter(r => matches(r, where)).length),
    groupBy: jest.fn(async ({ where }: Row) => {
      const counts = new Map<string, number>();
      for (const row of store.declarations.filter(r => matches(r, where))) {
        counts.set(row.receivingNumberId, (counts.get(row.receivingNumberId) ?? 0) + 1);
      }
      return [...counts.entries()].map(([receivingNumberId, n]) => ({ receivingNumberId, _count: { _all: n } }));
    })
  },
  chartOfAccount: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.accounts.filter(
        r =>
          r.tenantId === where.tenantId &&
          r.syndicateId === where.syndicateId &&
          where.accountNumber.in.includes(r.accountNumber)
      )
    )
  },
  journalEntryLine: {
    groupBy: jest.fn(async ({ where }: Row) => {
      const ids: string[] = where.accountId.in;
      return ids
        .map(accountId => {
          const lines = store.lines.filter(l => l.accountId === accountId);
          if (lines.length === 0) return null;
          return {
            accountId,
            _sum: {
              debit: lines.reduce((s, l) => s + l.debit, 0),
              credit: lines.reduce((s, l) => s + l.credit, 0)
            }
          };
        })
        .filter(Boolean);
    })
  },
  $transaction: jest.fn(async (arg: any) => arg(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

const ensureAccount = jest.fn();
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({
  ensureSyndicReceivingAccountTx: (...args: unknown[]) => ensureAccount(...args)
}));

import {
  createReceivingNumber,
  deleteReceivingNumber,
  getActiveReceivingNumber,
  listActiveReceivingNumbersForPortal,
  listReceivingNumbers,
  updateReceivingNumber
} from '../../src/lib/syndics/declared-payment/receiving-numbers';
import { AuditActionKey } from '../../src/types/audit-types';

const base = { tenantId: TENANT_A, syndicateId: SYNDIC_A1, actorUserId: ACTOR };
const body = (over: Row = {}) => ({
  operator: 'ORANGE' as const,
  phoneNumber: '07 07 07 07 12',
  holderName: 'Syndic Les Palmiers',
  ...over
});

async function expectCode(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, code });
}

beforeEach(() => {
  resetStore();
  auditEvents.length = 0;
  ensureAccount.mockReset();
  ensureAccount.mockImplementation(async () => ({ accountId: 'acc-1', accountNumber: '55211' }));
});

describe('createReceivingNumber', () => {
  it('alloue le sous-compte, normalise le numéro et journalise sans numéro en clair', async () => {
    const created = await createReceivingNumber({ ...base, body: body() });

    expect(ensureAccount).toHaveBeenCalledWith(mockPrisma, TENANT_A, SYNDIC_A1, {
      operator: 'ORANGE',
      phoneNumber: '+2250707070712'
    });
    expect(created).toMatchObject({
      phoneNumber: '+2250707070712',
      treasuryAccountNumber: '55211',
      isActive: true,
      treasuryBalance: 0,
      sharedWithCount: 0,
      pendingDeclarations: 0
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].actionKey).toBe(AuditActionKey.SYNDIC_RECEIVING_NUMBER_CREATED);
    expect(JSON.stringify(auditEvents[0])).not.toContain('0707070712');
  });

  it('refuse un doublon (même copropriété, opérateur et numéro) avec 409', async () => {
    await createReceivingNumber({ ...base, body: body() });
    await expectCode(
      createReceivingNumber({ ...base, body: body({ phoneNumber: '+225 0707070712' }) }),
      409,
      'RECEIVING_NUMBER_DUPLICATE'
    );
  });

  it("traduit l'unicité Prisma (P2002) d'une création concurrente en 409", async () => {
    ensureAccount.mockImplementation(async () => {
      // Le concurrent a gagné entre le contrôle explicite et l'insertion.
      store.numbers.push({
        id: 'x',
        syndicateId: SYNDIC_A1,
        tenantId: TENANT_A,
        operator: 'ORANGE',
        phoneNumber: '+2250707070712'
      });
      return { accountId: 'acc-1', accountNumber: '55211' };
    });
    await expectCode(createReceivingNumber({ ...base, body: body() }), 409, 'RECEIVING_NUMBER_DUPLICATE');
  });

  it('autorise le même numéro chez un autre opérateur', async () => {
    await createReceivingNumber({ ...base, body: body() });
    await expect(createReceivingNumber({ ...base, body: body({ operator: 'WAVE' }) })).resolves.toBeDefined();
  });

  it('refuse un téléphone invalide avec 400 INVALID_PHONE', async () => {
    await expectCode(createReceivingNumber({ ...base, body: body({ phoneNumber: '12345' }) }), 400, 'INVALID_PHONE');
    expect(ensureAccount).not.toHaveBeenCalled();
  });

  it("répond 404 pour une copropriété d'une autre agence", async () => {
    await expectCode(createReceivingNumber({ ...base, syndicateId: SYNDIC_B, body: body() }), 404, 'NOT_FOUND');
    expect(store.numbers).toHaveLength(0);
  });

  it('rejette un champ inconnu (corps strict)', async () => {
    await expect(
      createReceivingNumber({ ...base, body: body({ treasuryAccountNumber: '5521' }) })
    ).rejects.toMatchObject({ name: 'ZodError' });
  });
});

describe('listReceivingNumbers', () => {
  it('trie les actifs d’abord puis par sortOrder, avec solde, partage et déclarations en attente', async () => {
    const a = await createReceivingNumber({ ...base, body: body({ phoneNumber: '0707070712' }) });
    ensureAccount.mockImplementation(async () => ({ accountId: 'acc-2', accountNumber: '55212' }));
    const b = await createReceivingNumber({ ...base, body: body({ operator: 'MTN', phoneNumber: '0505050512' }) });
    await updateReceivingNumber({ ...base, numberId: a.id, body: { sortOrder: 5 } });
    await updateReceivingNumber({ ...base, numberId: b.id, body: { isActive: false } });
    // Même téléphone dans deux autres copropriétés : un autre syndic de l'agence compte, pas l'autre agence.
    store.numbers.push(
      {
        id: 'o1',
        tenantId: TENANT_A,
        syndicateId: SYNDIC_A2,
        operator: 'ORANGE',
        phoneNumber: '+2250707070712',
        seq: 90
      },
      {
        id: 'o2',
        tenantId: TENANT_A,
        syndicateId: SYNDIC_A2,
        operator: 'WAVE',
        phoneNumber: '+2250707070712',
        seq: 91
      },
      {
        id: 'o3',
        tenantId: TENANT_B,
        syndicateId: SYNDIC_B,
        operator: 'ORANGE',
        phoneNumber: '+2250707070712',
        seq: 92
      }
    );
    store.declarations.push(
      { id: 'd1', tenantId: TENANT_A, syndicateId: SYNDIC_A1, receivingNumberId: a.id, status: 'PENDING' },
      { id: 'd2', tenantId: TENANT_A, syndicateId: SYNDIC_A1, receivingNumberId: a.id, status: 'APPROVED' }
    );
    store.accounts.push({ id: 'acc-1', tenantId: TENANT_A, syndicateId: SYNDIC_A1, accountNumber: '55211' });
    store.lines.push({ accountId: 'acc-1', debit: 60000, credit: 0 }, { accountId: 'acc-1', debit: 0, credit: 15000 });

    const list = await listReceivingNumbers(TENANT_A, SYNDIC_A1);

    expect(list.map(n => n.id)).toEqual([a.id, b.id]);
    expect(list[0]).toMatchObject({ treasuryBalance: 45000, sharedWithCount: 1, pendingDeclarations: 1 });
    expect(list[1]).toMatchObject({ isActive: false, treasuryBalance: 0, pendingDeclarations: 0 });
  });

  it("répond 404 pour une copropriété d'une autre agence", async () => {
    await expectCode(listReceivingNumbers(TENANT_A, SYNDIC_B), 404, 'NOT_FOUND');
  });
});

describe('updateReceivingNumber', () => {
  it("refuse de changer l'opérateur ou le numéro s'il existe une déclaration", async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    store.declarations.push({
      id: 'd1',
      tenantId: TENANT_A,
      syndicateId: SYNDIC_A1,
      receivingNumberId: n.id,
      status: 'REJECTED'
    });

    await expectCode(
      updateReceivingNumber({ ...base, numberId: n.id, body: { operator: 'MTN' } }),
      409,
      'RECEIVING_NUMBER_IN_USE'
    );
    await expectCode(
      updateReceivingNumber({ ...base, numberId: n.id, body: { phoneNumber: '0505050512' } }),
      409,
      'RECEIVING_NUMBER_IN_USE'
    );
    // Un libellé reste modifiable.
    await expect(
      updateReceivingNumber({ ...base, numberId: n.id, body: { label: 'Principal' } })
    ).resolves.toMatchObject({
      label: 'Principal'
    });
  });

  it('change le numéro quand aucune déclaration ne le référence', async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    const updated = await updateReceivingNumber({ ...base, numberId: n.id, body: { phoneNumber: '0505050512' } });
    expect(updated.phoneNumber).toBe('+2250505050512');
    expect(auditEvents.at(-1)?.actionKey).toBe(AuditActionKey.SYNDIC_RECEIVING_NUMBER_UPDATED);
  });

  it('autorise la désactivation même avec des déclarations PENDING (audit DEACTIVATED)', async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    store.declarations.push({
      id: 'd1',
      tenantId: TENANT_A,
      syndicateId: SYNDIC_A1,
      receivingNumberId: n.id,
      status: 'PENDING'
    });

    const updated = await updateReceivingNumber({ ...base, numberId: n.id, body: { isActive: false } });

    expect(updated).toMatchObject({ isActive: false, pendingDeclarations: 1 });
    expect(auditEvents.at(-1)?.actionKey).toBe(AuditActionKey.SYNDIC_RECEIVING_NUMBER_DEACTIVATED);
  });

  it('refuse un changement qui crée un doublon', async () => {
    await createReceivingNumber({ ...base, body: body() });
    ensureAccount.mockImplementation(async () => ({ accountId: 'acc-2', accountNumber: '55212' }));
    const second = await createReceivingNumber({ ...base, body: body({ phoneNumber: '0505050512' }) });
    await expectCode(
      updateReceivingNumber({ ...base, numberId: second.id, body: { phoneNumber: '0707070712' } }),
      409,
      'RECEIVING_NUMBER_DUPLICATE'
    );
  });

  it("répond 404 pour un numéro d'une autre copropriété ou d'une autre agence", async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    await expectCode(
      updateReceivingNumber({ ...base, syndicateId: SYNDIC_A2, numberId: n.id, body: { label: 'x' } }),
      404,
      'NOT_FOUND'
    );
    await expectCode(
      updateReceivingNumber({
        ...base,
        tenantId: TENANT_B,
        syndicateId: SYNDIC_B,
        numberId: n.id,
        body: { label: 'x' }
      }),
      404,
      'NOT_FOUND'
    );
  });
});

describe('deleteReceivingNumber', () => {
  it('supprime un numéro sans déclaration et journalise la suppression', async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    await deleteReceivingNumber({ ...base, numberId: n.id });
    expect(store.numbers).toHaveLength(0);
    expect(auditEvents.at(-1)).toMatchObject({
      actionKey: AuditActionKey.SYNDIC_RECEIVING_NUMBER_UPDATED,
      payload: expect.objectContaining({ reason: 'deleted' })
    });
  });

  it('refuse la suppression quand une déclaration le référence', async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    store.declarations.push({
      id: 'd1',
      tenantId: TENANT_A,
      syndicateId: SYNDIC_A1,
      receivingNumberId: n.id,
      status: 'CANCELED'
    });
    await expectCode(deleteReceivingNumber({ ...base, numberId: n.id }), 409, 'RECEIVING_NUMBER_IN_USE');
    expect(store.numbers).toHaveLength(1);
  });

  it('traduit la clé étrangère (déclaration concurrente) en RECEIVING_NUMBER_IN_USE', async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    mockPrisma.syndicReceivingNumber.deleteMany.mockRejectedValueOnce(
      Object.assign(new Error('fk'), { code: 'P2003' })
    );
    await expectCode(deleteReceivingNumber({ ...base, numberId: n.id }), 409, 'RECEIVING_NUMBER_IN_USE');
  });

  it('répond 404 pour un numéro inconnu', async () => {
    await expectCode(deleteReceivingNumber({ ...base, numberId: 'nope' }), 404, 'NOT_FOUND');
  });
});

describe('vue portail et numéro actif', () => {
  it('ne liste que les numéros actifs', async () => {
    const a = await createReceivingNumber({ ...base, body: body() });
    ensureAccount.mockImplementation(async () => ({ accountId: 'acc-2', accountNumber: '55212' }));
    await createReceivingNumber({ ...base, body: body({ operator: 'MTN', isActive: false }) });
    const portal = await listActiveReceivingNumbersForPortal(TENANT_A, SYNDIC_A1);
    expect(portal.map(n => n.id)).toEqual([a.id]);
    expect(portal[0]).not.toHaveProperty('treasuryAccountNumber');
  });

  it('getActiveReceivingNumber renvoie la ligne active de la copropriété', async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    await expect(getActiveReceivingNumber(mockPrisma as any, TENANT_A, SYNDIC_A1, n.id)).resolves.toMatchObject({
      id: n.id,
      treasuryAccountNumber: '55211'
    });
  });

  it("lève RECEIVING_NUMBER_INACTIVE pour un numéro désactivé, d'une autre copropriété ou d'une autre agence", async () => {
    const n = await createReceivingNumber({ ...base, body: body() });
    await updateReceivingNumber({ ...base, numberId: n.id, body: { isActive: false } });
    await expectCode(
      getActiveReceivingNumber(mockPrisma as any, TENANT_A, SYNDIC_A1, n.id),
      400,
      'RECEIVING_NUMBER_INACTIVE'
    );

    await updateReceivingNumber({ ...base, numberId: n.id, body: { isActive: true } });
    await expectCode(
      getActiveReceivingNumber(mockPrisma as any, TENANT_A, SYNDIC_A2, n.id),
      400,
      'RECEIVING_NUMBER_INACTIVE'
    );
    await expectCode(
      getActiveReceivingNumber(mockPrisma as any, TENANT_B, SYNDIC_A1, n.id),
      400,
      'RECEIVING_NUMBER_INACTIVE'
    );
  });
});
