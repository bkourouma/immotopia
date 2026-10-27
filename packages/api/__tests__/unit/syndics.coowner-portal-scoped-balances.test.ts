import { computeScopedBalances, scopedBalanceOf } from '../../src/lib/syndics/coowner-portal';
import {
  scopedStatementBalances,
  statementBalances,
  statementStart,
  type StatementRow
} from '../../src/lib/syndics/coowner-portal-statement';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

const d = (day: string) => new Date(`${day}T00:00:00.000Z`);

// Ancien propriétaire : dette de 80000 en mars. Nouveau propriétaire depuis le 01/07.
const movements = [
  {
    id: 'm1',
    transactionDate: d('2026-03-01'),
    createdAt: d('2026-03-01'),
    debit: 100000,
    credit: null,
    balanceAfter: 100000
  },
  {
    id: 'm2',
    transactionDate: d('2026-04-01'),
    createdAt: d('2026-04-01'),
    debit: null,
    credit: 20000,
    balanceAfter: 80000
  },
  {
    id: 'm3',
    transactionDate: d('2026-07-01'),
    createdAt: d('2026-07-01'),
    debit: 30000,
    credit: null,
    balanceAfter: 110000
  },
  {
    id: 'm4',
    transactionDate: d('2026-08-01'),
    createdAt: d('2026-08-01'),
    debit: null,
    credit: 10000,
    balanceAfter: 100000
  }
];
const SINCE = d('2026-07-01');

describe('computeScopedBalances / scopedBalanceOf', () => {
  it('cumul parti de zéro à la borne, sans la dette de l’ancien propriétaire', () => {
    const balances = computeScopedBalances(movements, SINCE);
    expect([...balances.entries()]).toEqual([
      ['m3', 30000],
      ['m4', 20000]
    ]);
    expect(scopedBalanceOf(movements, SINCE)).toBe(20000);
  });

  it('la borne est inclusive', () => {
    expect(computeScopedBalances(movements, d('2026-08-01')).get('m4')).toBe(-10000);
  });

  it('ordre chronologique, pas ordre de saisie', () => {
    const shuffled = [movements[3], movements[2]];
    expect(computeScopedBalances(shuffled, SINCE).get('m3')).toBe(30000);
    expect(computeScopedBalances(shuffled, SINCE).get('m4')).toBe(20000);
  });

  it('aucun mouvement dans le périmètre : solde nul', () => {
    expect(scopedBalanceOf(movements, d('2027-01-01'))).toBe(0);
    expect(computeScopedBalances([], SINCE).size).toBe(0);
  });
});

describe('statementStart', () => {
  it('sans borne : la période demandée telle quelle, ou null', () => {
    expect(statementStart(d('2026-02-01'), null)).toEqual(d('2026-02-01'));
    expect(statementStart(undefined, null)).toBeNull();
  });

  it('avec borne : jamais avant la borne', () => {
    expect(statementStart(d('2026-02-01'), SINCE)).toEqual(SINCE);
    expect(statementStart(undefined, SINCE)).toEqual(SINCE);
    expect(statementStart(d('2026-09-01'), SINCE)).toEqual(d('2026-09-01'));
  });
});

describe('relevé borné', () => {
  const row = (id: string): StatementRow => {
    const m = movements.find(candidate => candidate.id === id)!;
    return { ...m, type: 'X', label: id } as unknown as StatementRow;
  };

  it('ouverture à zéro à la borne, lignes et clôture du périmètre', () => {
    const result = scopedStatementBalances([row('m3'), row('m4')], movements, SINCE, SINCE);
    expect(result.opening).toBe(0);
    expect(result.rows.map(r => Number(r.balanceAfter))).toEqual([30000, 20000]);
    expect(result.closing).toBe(20000);
  });

  it('période démarrant plus tard : ouverture = solde du périmètre juste avant', () => {
    const result = scopedStatementBalances([row('m4')], movements, d('2026-07-15'), SINCE);
    expect(result.opening).toBe(30000);
    expect(result.closing).toBe(20000);
  });

  it('sans ligne : ouverture = clôture = solde du périmètre avant le début', () => {
    const result = scopedStatementBalances([], movements, d('2026-09-01'), SINCE);
    expect(result).toEqual({ rows: [], opening: 20000, closing: 20000 });
  });

  it('sans borne, statementBalances reste celui de tout le compte', () => {
    const result = statementBalances([row('m3'), row('m4')], movements, new Date(0));
    expect(result.opening).toBe(80000);
    expect(result.closing).toBe(100000);
  });
});
