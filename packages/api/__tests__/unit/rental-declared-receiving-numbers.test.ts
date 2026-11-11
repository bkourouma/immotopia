/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 049, lot 1 : numéros de réception mobile money d'une agence
 * (`lib/rental/declared-payment/receiving-numbers.ts`, contrat §1.1).
 * Prisma est remplacé par un magasin en mémoire : aucune base requise.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const ACTOR = 'user-1';

const store = {
  numbers: [] as Row[],
  declarations: [] as Row[],
  treasury: [] as Row[],
  seq: 0
};

function resetStore() {
  store.numbers = [];
  store.declarations = [];
  store.treasury = [
    { id: 'tr-5522', tenantId: TENANT_A, accountNumber: '5522' },
    { id: 'tr-5521', tenantId: TENANT_A, accountNumber: '5521' }
  ];
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
  rentalReceivingNumber: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.numbers
        .filter(r => matches(r, where))
        .sort(
          (a, b) => Number(b.is_active) - Number(a.is_active) || a.operator.localeCompare(b.operator) || a.seq - b.seq
        )
        .map(r => ({ ...r }))
    ),
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.numbers.find(r => matches(r, where));
      return found ? { ...found } : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      if (
        store.numbers.some(
          r => r.tenant_id === data.tenant_id && r.operator === data.operator && r.phone === data.phone
        )
      ) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      store.seq += 1;
      const now = new Date('2026-11-09T10:00:00Z');
      const row = { id: `num-${store.seq}`, seq: store.seq, sort_order: 0, created_at: now, updated_at: now, ...data };
      store.numbers.push(row);
      return { ...row };
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
  rentalPaymentDeclaration: {
    count: jest.fn(async ({ where }: Row) => store.declarations.filter(r => matches(r, where)).length),
    groupBy: jest.fn(async ({ where }: Row) => {
      const counts = new Map<string, number>();
      for (const row of store.declarations.filter(r => matches(r, where))) {
        counts.set(row.receiving_number_id, (counts.get(row.receiving_number_id) ?? 0) + 1);
      }
      return [...counts.entries()].map(([receiving_number_id, n]) => ({ receiving_number_id, _count: { _all: n } }));
    })
  },
  treasuryAccount: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.treasury.filter(r => r.tenantId === where.tenantId && where.accountNumber.in.includes(r.accountNumber))
    )
  },
  $transaction: jest.fn(async (arg: any) => arg(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const notifyChanged = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/notifications', () => ({
  notifyReceivingNumberChanged: (...a: any[]) => notifyChanged(...a)
}));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

jest.mock('../../src/lib/treasury/accounts', () => {
  const actual = jest.requireActual('../../src/lib/treasury/accounts');
  return {
    ...actual,
    ensureDefaultTreasuryAccountTx: jest.fn(
      async (_tx: unknown, _tenantId: string, _kind: string, operator: string) => ({
        treasuryAccountId: 'tr-x',
        accountNumber: actual.mobileMoneySpec(operator).number
      })
    )
  };
});

import {
  createReceivingNumber,
  deleteReceivingNumber,
  listActiveReceivingNumbers,
  listReceivingNumbers,
  updateReceivingNumber
} from '../../src/lib/rental/declared-payment/receiving-numbers';
import { ensureDefaultTreasuryAccountTx } from '../../src/lib/treasury/accounts';
import { AuditActionKey } from '../../src/types/audit-types';
import { maskPhone } from '../../src/lib/payment-proof/phone';

const body = (over: Row = {}) => ({ operator: 'ORANGE' as const, phone: '07 07 07 07 12', ...over });

async function expectCode(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, code });
}

beforeEach(() => {
  resetStore();
  auditEvents.length = 0;
  notifyChanged.mockClear();
  (ensureDefaultTreasuryAccountTx as jest.Mock).mockClear();
});

describe('createReceivingNumber', () => {
  it('normalise le numéro, dérive le compte de l’opérateur, journalise sans numéro en clair', async () => {
    const created = await createReceivingNumber(TENANT_A, ACTOR, body({ label: ' Caisse loyers ' }));

    expect(ensureDefaultTreasuryAccountTx).toHaveBeenCalledWith(mockPrisma, TENANT_A, 'MOBILE_MONEY', 'ORANGE');
    expect(created).toMatchObject({
      operator: 'ORANGE',
      phone: '+2250707070712',
      label: 'Caisse loyers',
      active: true,
      treasuryAccountNumber: '5522',
      treasuryAccountId: 'tr-5522',
      declarationsCount: 0,
      pendingDeclarations: 0
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      tenantId: TENANT_A,
      actorUserId: ACTOR,
      actionKey: AuditActionKey.RENTAL_RECEIVING_NUMBER_CREATED
    });
    expect(JSON.stringify(auditEvents[0].payload)).not.toContain('0707070712');
    expect(notifyChanged).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, action: 'created', phoneMasked: maskPhone('+2250707070712') })
    );
  });

  it('crée le compte à la demande selon l’opérateur (WAVE = 5521, OTHER = 5529)', async () => {
    const wave = await createReceivingNumber(TENANT_A, ACTOR, body({ operator: 'WAVE' }));
    const other = await createReceivingNumber(TENANT_A, ACTOR, body({ operator: 'OTHER' }));
    expect(wave.treasuryAccountNumber).toBe('5521');
    expect(other.treasuryAccountNumber).toBe('5529');
    expect(other.treasuryAccountId).toBeNull();
  });

  it('refuse un numéro invalide (INVALID_PHONE)', async () => {
    await expectCode(createReceivingNumber(TENANT_A, ACTOR, body({ phone: '12345' })), 400, 'INVALID_PHONE');
  });

  it('refuse un champ inconnu (corps strict)', async () => {
    await expect(createReceivingNumber(TENANT_A, ACTOR, { ...body(), holderName: 'x' })).rejects.toBeDefined();
  });

  it('refuse un doublon (agence, opérateur, numéro normalisé) en 409, même écrit autrement', async () => {
    await createReceivingNumber(TENANT_A, ACTOR, body());
    await expectCode(
      createReceivingNumber(TENANT_A, ACTOR, body({ phone: '+225 0707070712' })),
      409,
      'RENTAL_RECEIVING_NUMBER_DUPLICATE'
    );
    // Autre opérateur ou autre agence : autorisé.
    await expect(createReceivingNumber(TENANT_A, ACTOR, body({ operator: 'WAVE' }))).resolves.toBeDefined();
    await expect(createReceivingNumber(TENANT_B, ACTOR, body())).resolves.toBeDefined();
  });

  it('une course sur l’unicité (P2002) devient aussi un 409', async () => {
    mockPrisma.rentalReceivingNumber.findFirst.mockResolvedValueOnce(null);
    store.numbers.push({
      id: 'x',
      seq: 99,
      tenant_id: TENANT_A,
      operator: 'ORANGE',
      phone: '+2250707070712',
      is_active: true,
      treasury_account_number: '5522',
      created_at: new Date(),
      updated_at: new Date(),
      label: null
    });
    await expectCode(createReceivingNumber(TENANT_A, ACTOR, body()), 409, 'RENTAL_RECEIVING_NUMBER_DUPLICATE');
  });
});

describe('listReceivingNumbers / listActiveReceivingNumbers', () => {
  it('actifs d’abord, avec compteurs de déclarations', async () => {
    const a = await createReceivingNumber(TENANT_A, ACTOR, body({ active: false }));
    const b = await createReceivingNumber(TENANT_A, ACTOR, body({ operator: 'MTN', phone: '05 05 05 05 05' }));
    store.declarations.push(
      { id: 'd1', tenant_id: TENANT_A, receiving_number_id: b.id, status: 'PENDING' },
      { id: 'd2', tenant_id: TENANT_A, receiving_number_id: b.id, status: 'APPROVED' }
    );
    const list = await listReceivingNumbers(TENANT_A);
    expect(list.map(n => n.id)).toEqual([b.id, a.id]);
    expect(list[0]).toMatchObject({ declarationsCount: 2, pendingDeclarations: 1 });

    expect((await listReceivingNumbers(TENANT_A, { active: false })).map(n => n.id)).toEqual([a.id]);
    expect(await listActiveReceivingNumbers(TENANT_A)).toEqual([
      { id: b.id, operator: 'MTN', phone: '+2250505050505', label: null }
    ]);
  });

  it('ne montre jamais les numéros d’une autre agence', async () => {
    await createReceivingNumber(TENANT_B, ACTOR, body());
    expect(await listReceivingNumbers(TENANT_A)).toEqual([]);
    expect(await listActiveReceivingNumbers(TENANT_A)).toEqual([]);
  });
});

describe('updateReceivingNumber', () => {
  it('change opérateur et numéro même avec des déclarations liées ; le compte suit l’opérateur', async () => {
    const created = await createReceivingNumber(TENANT_A, ACTOR, body());
    store.declarations.push({ id: 'd1', tenant_id: TENANT_A, receiving_number_id: created.id, status: 'APPROVED' });
    auditEvents.length = 0;
    notifyChanged.mockClear();

    const updated = await updateReceivingNumber(TENANT_A, ACTOR, created.id, {
      operator: 'MOOV',
      phone: '01 02 03 04 05'
    });

    expect(updated).toMatchObject({ operator: 'MOOV', phone: '+2250102030405', treasuryAccountNumber: '5524' });
    expect(auditEvents[0].actionKey).toBe(AuditActionKey.RENTAL_RECEIVING_NUMBER_UPDATED);
    expect(auditEvents[0].payload).toMatchObject({
      previousPhoneMasked: maskPhone('+2250707070712'),
      newPhoneMasked: maskPhone('+2250102030405')
    });
    expect(notifyChanged).toHaveBeenCalledWith(expect.objectContaining({ action: 'updated', operator: 'MOOV' }));
  });

  it('refuse de rejoindre un doublon (409) et un corps vide (400)', async () => {
    const a = await createReceivingNumber(TENANT_A, ACTOR, body());
    await createReceivingNumber(TENANT_A, ACTOR, body({ phone: '05 05 05 05 05' }));
    await expectCode(
      updateReceivingNumber(TENANT_A, ACTOR, a.id, { phone: '0505050505' }),
      409,
      'RENTAL_RECEIVING_NUMBER_DUPLICATE'
    );
    await expect(updateReceivingNumber(TENANT_A, ACTOR, a.id, {})).rejects.toBeDefined();
  });

  it('une désactivation est journalisée DEACTIVATED et notifiée ; un simple libellé ne notifie pas', async () => {
    const created = await createReceivingNumber(TENANT_A, ACTOR, body());
    auditEvents.length = 0;
    notifyChanged.mockClear();

    await updateReceivingNumber(TENANT_A, ACTOR, created.id, { label: 'Nouveau libellé' });
    expect(notifyChanged).not.toHaveBeenCalled();
    expect(auditEvents[0].actionKey).toBe(AuditActionKey.RENTAL_RECEIVING_NUMBER_UPDATED);

    const off = await updateReceivingNumber(TENANT_A, ACTOR, created.id, { active: false });
    expect(off.active).toBe(false);
    expect(auditEvents[1].actionKey).toBe(AuditActionKey.RENTAL_RECEIVING_NUMBER_DEACTIVATED);
    expect(notifyChanged).toHaveBeenCalledWith(expect.objectContaining({ action: 'deactivated' }));
  });

  it('isolation : le numéro d’une autre agence répond 404 comme un numéro inconnu', async () => {
    const other = await createReceivingNumber(TENANT_B, ACTOR, body());
    await expectCode(
      updateReceivingNumber(TENANT_A, ACTOR, other.id, { label: 'x' }),
      404,
      'RENTAL_RECEIVING_NUMBER_NOT_FOUND'
    );
    await expectCode(
      updateReceivingNumber(TENANT_A, ACTOR, 'inconnu', { label: 'x' }),
      404,
      'RENTAL_RECEIVING_NUMBER_NOT_FOUND'
    );
    expect(store.numbers.find(n => n.id === other.id)!.label).toBeNull();
  });
});

describe('deleteReceivingNumber', () => {
  it('sans déclaration : suppression définitive', async () => {
    const created = await createReceivingNumber(TENANT_A, ACTOR, body());
    auditEvents.length = 0;
    const result = await deleteReceivingNumber(TENANT_A, ACTOR, created.id);
    expect(result).toEqual({ id: created.id, deleted: true, deactivated: false });
    expect(store.numbers).toHaveLength(0);
    expect(auditEvents[0].actionKey).toBe(AuditActionKey.RENTAL_RECEIVING_NUMBER_DEACTIVATED);
  });

  it('avec déclarations liées : désactivation douce, jamais d’erreur', async () => {
    const created = await createReceivingNumber(TENANT_A, ACTOR, body());
    store.declarations.push({ id: 'd1', tenant_id: TENANT_A, receiving_number_id: created.id, status: 'PENDING' });
    auditEvents.length = 0;
    const result = await deleteReceivingNumber(TENANT_A, ACTOR, created.id);
    expect(result).toEqual({ id: created.id, deleted: false, deactivated: true });
    expect(store.numbers).toHaveLength(1);
    expect(store.numbers[0].is_active).toBe(false);
    expect(auditEvents[0].actionKey).toBe(AuditActionKey.RENTAL_RECEIVING_NUMBER_DEACTIVATED);
    expect(notifyChanged).toHaveBeenCalledWith(expect.objectContaining({ action: 'deactivated' }));
  });

  it('une clé étrangère qui refuse la suppression (P2003) retombe sur la désactivation', async () => {
    const created = await createReceivingNumber(TENANT_A, ACTOR, body());
    mockPrisma.rentalReceivingNumber.deleteMany.mockRejectedValueOnce(
      Object.assign(new Error('fk'), { code: 'P2003' })
    );
    const result = await deleteReceivingNumber(TENANT_A, ACTOR, created.id);
    expect(result).toEqual({ id: created.id, deleted: false, deactivated: true });
    expect(store.numbers[0].is_active).toBe(false);
  });

  it('isolation : supprimer le numéro d’une autre agence répond 404 et ne touche à rien', async () => {
    const other = await createReceivingNumber(TENANT_B, ACTOR, body());
    await expectCode(deleteReceivingNumber(TENANT_A, ACTOR, other.id), 404, 'RENTAL_RECEIVING_NUMBER_NOT_FOUND');
    expect(store.numbers).toHaveLength(1);
    expect(store.numbers[0].is_active).toBe(true);
  });
});
