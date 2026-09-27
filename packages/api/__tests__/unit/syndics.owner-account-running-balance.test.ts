import {
  applyChronologicalBalances,
  chronologicalBalanceStrictlyBefore,
  computeChronologicalBalances,
  openingBalanceOf
} from '../../src/lib/syndics/owner-account-running-balance';

/**
 * BUG-2026-09-27-006 : solde cumulé du compte de lot recalculé dans l'ordre
 * chronologique de la date affichée, l'ordre de création départageant.
 * `balanceAfter` stocké = ordre d'écriture (appel créé avant les paiements).
 */
const movements = [
  {
    id: 'appel',
    transactionDate: new Date('2026-10-15'),
    createdAt: new Date('2026-09-20T10:00:00Z'),
    debit: 60000,
    credit: null,
    balanceAfter: 60000
  },
  {
    id: 'p1',
    transactionDate: new Date('2026-09-27'),
    createdAt: new Date('2026-09-27T09:00:00Z'),
    debit: null,
    credit: 20000,
    balanceAfter: 40000
  },
  {
    id: 'p2',
    transactionDate: new Date('2026-09-27'),
    createdAt: new Date('2026-09-27T11:00:00Z'),
    debit: null,
    credit: 55000,
    balanceAfter: -15000
  }
];

describe('Solde cumulé chronologique du compte de lot', () => {
  it('cumule par date affichée puis par ordre de création', () => {
    const balances = computeChronologicalBalances(movements);
    expect(balances.get('p1')).toBe(-20000);
    expect(balances.get('p2')).toBe(-75000);
    expect(balances.get('appel')).toBe(-15000);
  });

  it('part du solde d’origine du compte (reprise sans mouvement)', () => {
    const withOpening = movements.map(m => ({ ...m, balanceAfter: Number(m.balanceAfter) + 10000 }));
    expect(openingBalanceOf(withOpening)).toBe(10000);
    expect(computeChronologicalBalances(withOpening).get('appel')).toBe(-5000);
    expect(openingBalanceOf([])).toBe(0);
  });

  it('remplace le solde stocké des seules lignes affichées', () => {
    const rows = [{ id: 'appel', balanceAfter: 60000, label: 'Appel' }];
    expect(applyChronologicalBalances(rows, movements)).toEqual([
      { id: 'appel', balanceAfter: -15000, label: 'Appel' }
    ]);
  });

  it('calcule le solde strictement avant une date', () => {
    expect(chronologicalBalanceStrictlyBefore(movements, new Date('2026-10-01'))).toBe(-75000);
    expect(chronologicalBalanceStrictlyBefore(movements, new Date('2026-09-01'))).toBe(0);
  });
});
