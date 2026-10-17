/**
 * Base en mémoire pour les tests du retour banque (spec 042, P3).
 *
 * Applique les filtres d'agence (`tenantId`), la mise à jour conditionnelle des
 * `updateMany` (`count` réel), l'incrément atomique et la restauration de l'état
 * quand une transaction échoue. Les tests l'atteignent par
 * `jest.mock('../../src/utils/database', () => ({ prisma: require(...).harness.db }))`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export const TENANT = 'tenant-a';
export const OTHER_TENANT = 'tenant-b';
export const NOW = new Date('2026-10-28T09:00:00Z');
/** Date de prélèvement de la remise de test. */
export const COLLECTION = new Date('2026-10-26T00:00:00Z');
export const REMITTANCE = '22222222-2222-4222-8222-222222222222';
export const OTHER_REMITTANCE = '33333333-3333-4333-8333-333333333333';
export const MANDATE_A = '44444444-4444-4444-8444-444444444441';
export const MANDATE_B = '44444444-4444-4444-8444-444444444442';

export const lineId = (n: number) => `55555555-5555-4555-8555-55555555555${n}`;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === 'OR') return (expected as Row[]).some(clause => matches(row, clause));
    const actual = row[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === 'object') {
      if ('in' in expected) return (expected.in as unknown[]).includes(actual);
      if ('not' in expected) return actual !== expected.not;
    }
    return actual === expected;
  });
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      row[key] = (row[key] ?? 0) + value.increment;
    } else if (value !== undefined) {
      row[key] = value;
    }
  }
}

export interface ReturnState {
  remittances: Row[];
  lines: Row[];
  mandates: Row[];
  imports: Row[];
  debtors: Row[];
  contacts: Row[];
  users: Row[];
}

export function createReturnHarness() {
  const state: ReturnState & { failOnLine: string | null } = {
    remittances: [],
    lines: [],
    mandates: [],
    imports: [],
    debtors: [],
    contacts: [],
    users: [],
    failOnLine: null
  };
  let counter = 0;

  const creditor = { id: 'creditor-1', treasuryAccountId: 'treasury-1', rejectFeeAmount: 0, maxConsecutiveRejects: 2 };

  const lineView = (line: Row): Row => {
    const mandate = state.mandates.find(entry => entry.id === line.mandateId);
    const debtor = state.debtors.find(entry => entry.id === line.debtorClientId) as Row;
    return {
      ...line,
      mandate,
      debtor: { id: debtor.id, details: debtor.details ?? null, user: { fullName: debtor.fullName } }
    };
  };

  const remittanceView = (row: Row): Row => ({
    ...row,
    creditor: { ...creditor, ...(row.creditorOverride ?? {}) },
    tenant: { name: 'Agence Test' }
  });

  const snapshot = () => structuredClone({ ...state });

  const db: Row = {
    $transaction: jest.fn(async (fn: (tx: Row) => unknown) => {
      const before = snapshot();
      try {
        return await fn(db);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    }),
    directDebitRemittance: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const found = state.remittances.find(row => matches(row, where));
        return found ? remittanceView(found) : null;
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        state.remittances
          .filter(row => matches(row, where))
          .map(row => ({
            ...row,
            lines: state.lines
              .filter(line => line.remittanceId === row.id)
              .map(lineView)
              .filter(line => !where?.__lineNumbers || where.__lineNumbers.includes(line.lineNumber))
          }))
      ),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = state.remittances.filter(row => matches(row, where));
        rows.forEach(row => applyData(row, data));
        return { count: rows.length };
      })
    },
    directDebitRemittanceLine: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const found = state.lines.find(row => matches(row, where));
        return found ? lineView(found) : null;
      }),
      findMany: jest.fn(async ({ where, orderBy }: Row) => {
        let rows = state.lines.filter(row => matches(row, where));
        if (orderBy?.lineNumber === 'asc') rows = [...rows].sort((a, b) => a.lineNumber - b.lineNumber);
        return rows.map(lineView);
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        if (state.failOnLine && where.id === state.failOnLine && data.status) throw new Error('panne simulée');
        const rows = state.lines.filter(row => matches(row, where));
        rows.forEach(row => applyData(row, data));
        return { count: rows.length };
      })
    },
    directDebitMandate: {
      findFirst: jest.fn(async ({ where }: Row) => state.mandates.find(row => matches(row, where)) ?? null),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = state.mandates.filter(row => matches(row, where));
        rows.forEach(row => applyData(row, data));
        return { count: rows.length };
      })
    },
    directDebitReturnImport: {
      create: jest.fn(async ({ data }: Row) => {
        counter += 1;
        const row = {
          id: `import-${counter}`,
          settledCount: 0,
          rejectedCount: 0,
          skippedCount: 0,
          errorCount: 0,
          createdAt: new Date(NOW),
          ...data
        };
        state.imports.push(row);
        return { id: row.id };
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = state.imports.filter(row => matches(row, where));
        rows.forEach(row => applyData(row, data));
        return { count: rows.length };
      }),
      count: jest.fn(async ({ where }: Row) => state.imports.filter(row => matches(row, where)).length),
      findMany: jest.fn(async ({ where, skip = 0, take = 100 }: Row) =>
        state.imports
          .filter(row => matches(row, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take)
      )
    },
    user: {
      findMany: jest.fn(async ({ where }: Row) => state.users.filter(row => matches(row, where)))
    },
    tenantClient: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const debtor = state.debtors.find(row => matches(row, { id: where.id }));
        return debtor
          ? { id: debtor.id, details: debtor.details ?? null, user: { fullName: debtor.fullName, email: debtor.email } }
          : null;
      }),
      findMany: jest.fn(async ({ where }: Row) =>
        state.debtors
          .filter(row => where.id.in.includes(row.id))
          .map(row => ({ id: row.id, details: row.details ?? null, user: { email: row.email ?? null } }))
      )
    },
    crmContact: {
      findMany: jest.fn(async ({ where }: Row) => state.contacts.filter(row => matches(row, where)))
    }
  };

  /** Une remise `SUBMITTED` de trois lignes, deux mandats, deux débiteurs. */
  function reset(over: { remittanceStatus?: string; creditor?: Row } = {}) {
    counter = 0;
    state.failOnLine = null;
    state.imports = [];
    state.users = [{ id: 'user-1', fullName: 'Gestionnaire Test' }];
    state.contacts = [];
    state.debtors = [
      { id: 'client-1', fullName: 'Awa Traoré', email: 'awa.traore@example.test' },
      { id: 'client-2', fullName: 'Koffi Yao', email: null, details: { crmContactId: 'contact-2' } }
    ];
    state.contacts = [{ id: 'contact-2', tenantId: TENANT, email: 'koffi.yao@example.test' }];
    state.mandates = [
      {
        id: MANDATE_A,
        tenantId: TENANT,
        year: 2026,
        sequence: 1,
        status: 'ACTIVE',
        ibanLast4: '0589',
        consecutiveRejects: 0
      },
      {
        id: MANDATE_B,
        tenantId: TENANT,
        year: 2026,
        sequence: 2,
        status: 'ACTIVE',
        ibanLast4: '1234',
        consecutiveRejects: 0
      }
    ];
    state.remittances = [
      {
        id: REMITTANCE,
        tenantId: TENANT,
        scope: 'RENTAL_LEASE',
        year: 2026,
        sequence: 1,
        status: over.remittanceStatus ?? 'SUBMITTED',
        collectionDate: new Date(COLLECTION),
        lineCount: 3,
        totalAmount: 300000,
        creditorOverride: over.creditor ?? {}
      },
      {
        id: OTHER_REMITTANCE,
        tenantId: OTHER_TENANT,
        scope: 'RENTAL_LEASE',
        year: 2026,
        sequence: 1,
        status: 'SUBMITTED',
        collectionDate: new Date(COLLECTION),
        lineCount: 1,
        totalAmount: 100000
      }
    ];
    const line = (n: number, over: Row = {}) => ({
      id: lineId(n),
      tenantId: TENANT,
      remittanceId: REMITTANCE,
      lineNumber: n,
      status: 'PENDING',
      amount: 100000,
      mandateId: n === 2 ? MANDATE_B : MANDATE_A,
      leaseId: `lease-${n}`,
      installmentId: `inst-${n}`,
      debtorClientId: n === 2 ? 'client-2' : 'client-1',
      rentalPaymentId: null,
      activeKey: `inst-${n}`,
      settledAt: null,
      rejectedAt: null,
      rejectFeeAmount: null,
      ...over
    });
    state.lines = [
      line(1),
      line(2),
      line(3),
      {
        ...line(1, { id: lineId(9), remittanceId: OTHER_REMITTANCE, tenantId: OTHER_TENANT, lineNumber: 1 })
      }
    ];
  }

  return { state, db, reset, matches };
}

export const harness = createReturnHarness();
