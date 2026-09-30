/**
 * BUG-2026-09-28-026 : un même bail doit donner le MÊME solde dans le relevé du
 * portail locataire / l'écran du compte (getAccountStatement), la balance
 * clients (getClientsBalance) et le relevé DOCX (amountDueAt). Les loyers
 * futurs ne sont pas débités ; les pénalités et l'avance sont comptées.
 */

type Row = Record<string, any>;

const NOW = new Date('2026-09-30T10:00:00Z');
const account = {
  id: 'acc-1',
  tenantId: 'T',
  kind: 'TENANT',
  tenantClientId: 'cli-1',
  label: 'Yao',
  currency: 'FCFA',
  balance: 0
};
const movements: Row[] = [];

const inWindow = (m: Row, f?: Row) => {
  if (!f) return true;
  const v = m.movementDate.getTime();
  return (!f.gte || v >= f.gte.getTime()) && (!f.lte || v <= f.lte.getTime()) && (!f.lt || v < f.lt.getTime());
};
const rowsOf = (where: Row) => movements.filter(m => m.tenantId === where.tenantId && inWindow(m, where.movementDate));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    thirdPartyAccount: {
      findFirst: jest.fn(async () => account),
      findMany: jest.fn(async () => [account])
    },
    thirdPartyMovement: {
      aggregate: jest.fn(async ({ where }: Row) => {
        const rows = rowsOf(where);
        return {
          _sum: {
            debit: rows.reduce((s, m) => s + (m.debit ?? 0), 0),
            credit: rows.reduce((s, m) => s + (m.credit ?? 0), 0)
          }
        };
      }),
      groupBy: jest.fn(async ({ where }: Row) => {
        const rows = rowsOf(where);
        return rows.length
          ? [
              {
                accountId: 'acc-1',
                _sum: {
                  debit: rows.reduce((s, m) => s + (m.debit ?? 0), 0),
                  credit: rows.reduce((s, m) => s + (m.credit ?? 0), 0)
                }
              }
            ]
          : [];
      }),
      findMany: jest.fn(async ({ where, skip = 0, take = 1000 }: Row) =>
        rowsOf(where)
          .sort((a, b) => a.movementDate.getTime() - b.movementDate.getTime())
          .slice(skip, skip + take)
      ),
      count: jest.fn(async ({ where }: Row) => rowsOf(where).length)
    },
    rentalLease: { findMany: jest.fn(async () => []) }
  }
}));

import { getAccountStatement, getClientsBalance } from '../../src/lib/finance/reports';
import { amountDueAt } from '../../src/lib/finance/installment-status';

const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));

function mv(movementDate: Date, debit: number | null, credit: number | null, createdOrder: number): Row {
  return {
    id: `m${createdOrder}`,
    tenantId: 'T',
    accountId: 'acc-1',
    movementDate,
    type: 'X',
    debit,
    credit,
    // balanceAfter volontairement FAUX (ordre d'écriture, comme en base).
    balanceAfter: 9_999_999,
    label: 'x',
    sourceType: 'S',
    sourceId: `s${createdOrder}`,
    leaseId: 'lease-1',
    createdAt: new Date(createdOrder)
  };
}

// 12 échéances de 220 000 : 09/2026 échue, 11 futures (débitées en base, dates futures).
const installments = Array.from({ length: 12 }, (_, i) => ({
  due_date: at(2026 + Math.floor((8 + i) / 12), ((8 + i) % 12) + 1, 5),
  amount_rent: 200000,
  amount_service: 20000,
  amount_other_fees: 0,
  penalty_amount: i === 0 ? 11000 : 0,
  amount_paid: i === 0 ? 100000 : 0
}));

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
  });
  jest.setSystemTime(NOW);
  installments.forEach((inst, i) => movements.push(mv(inst.due_date, 220000, null, i + 1)));
  movements.push(mv(at(2026, 9, 28), 11000, null, 20)); // pénalité
  movements.push(mv(at(2026, 9, 20), null, 100000, 21)); // règlement
});
afterAll(() => jest.useRealTimers());

describe('un même bail, trois lecteurs, un même solde', () => {
  // Échu : 220 000 + pénalité 11 000 − règlement 100 000 = 131 000.
  const ATTENDU = 131000;

  it('relevé du portail / écran du compte : clôture chronologique, loyers futurs exclus', async () => {
    const statement = await getAccountStatement('T', 'acc-1');

    expect(statement.closingBalance).toBe(ATTENDU);
    expect(statement.movements).toHaveLength(3);
    expect(statement.movements[statement.movements.length - 1].balanceAfter).toBe(ATTENDU);
  });

  it('balance clients : même solde', async () => {
    const balance = await getClientsBalance('T');

    expect(balance.lines[0].balance).toBe(ATTENDU);
    expect(balance.totalBalance).toBe(ATTENDU);
  });

  it('relevé DOCX : Σ dû exigible − Σ payé = même solde', () => {
    const solde =
      installments.reduce((s, i) => s + amountDueAt(i, NOW), 0) - installments.reduce((s, i) => s + i.amount_paid, 0);

    expect(solde).toBe(ATTENDU);
  });
});
