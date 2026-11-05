/**
 * Relevé de compte filtré par texte : le « solde après » de chaque ligne
 * retenue est celui de la suite COMPLÈTE de la période (jamais recalculé sur
 * les lignes filtrées), les soldes d'ouverture et de clôture ne bougent pas,
 * et chaque requête porte `tenantId`.
 */

const accountFindFirst = jest.fn();
const movementFindMany = jest.fn();
const movementAggregate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    thirdPartyAccount: { findFirst: (...a: any[]) => accountFindFirst(...a) },
    thirdPartyMovement: {
      findMany: (...a: any[]) => movementFindMany(...a),
      aggregate: (...a: any[]) => movementAggregate(...a)
    }
  }
}));

import { searchAccountStatement } from '../../src/lib/finance/statement-search';
import { accountStatementQuerySchema } from '../../src/lib/finance/schemas';

const T = 't1';
const mov = (id: string, day: number, label: string, debit: number, credit: number) => ({
  id,
  accountId: 'acc-1',
  tenantId: T,
  movementDate: new Date(Date.UTC(2026, 0, day)),
  createdAt: new Date(Date.UTC(2026, 0, day)),
  type: debit ? 'INSTALLMENT' : 'PAYMENT',
  debit: debit || null,
  credit: credit || null,
  balanceAfter: 999_999, // valeur figée volontairement fausse : jamais utilisée
  label,
  sourceType: 'X',
  sourceId: `s-${id}`,
  leaseId: null
});

// Soldes courants de la suite complète : 100000, 60000, 160000, 165000, 105000.
const MOUVEMENTS = [
  mov('m1', 1, 'Loyer janvier', 100_000, 0),
  mov('m2', 2, 'Règlement janvier', 0, 40_000),
  mov('m3', 3, 'Loyer février', 100_000, 0),
  mov('m4', 4, 'Pénalité de retard', 5_000, 0),
  mov('m5', 5, 'Règlement février', 0, 60_000)
];
const ASOF = new Date(Date.UTC(2026, 11, 31));

beforeEach(() => {
  jest.clearAllMocks();
  accountFindFirst.mockResolvedValue({ id: 'acc-1', label: 'Mariam', currency: 'XOF', kind: 'TENANT' });
  movementFindMany.mockImplementation(async (args: any) => {
    const contains: string | undefined = args.where.label?.contains;
    return MOUVEMENTS.filter(m => !contains || m.label.toLowerCase().includes(contains.toLowerCase()));
  });
  movementAggregate.mockResolvedValue({ _sum: { debit: 205_000, credit: 100_000 } });
});

describe('searchAccountStatement', () => {
  it('garde le solde après de la suite complète sur les lignes retenues, total et totaux filtrés justes', async () => {
    const r = await searchAccountStatement(T, 'acc-1', { search: 'loyer', asOf: ASOF });

    expect(r.movements.map(m => m.id)).toEqual(['m1', 'm3']);
    expect(r.movements.map(m => m.balanceAfter)).toEqual([100_000, 160_000]);
    expect(r.total).toBe(2);
    expect(r.filteredTotals).toEqual({ debit: 200_000, credit: 0 });
  });

  it('ouverture et clôture sont celles du relevé non filtré', async () => {
    const r = await searchAccountStatement(T, 'acc-1', { search: 'loyer', asOf: ASOF });
    expect(r.openingBalance).toBe(0);
    expect(r.closingBalance).toBe(105_000);
  });

  it('avec une période, l’ouverture est le solde avant la borne et les soldes en partent', async () => {
    movementAggregate.mockImplementation(async (args: any) =>
      args.where.movementDate.lt
        ? { _sum: { debit: 50_000, credit: 0 } }
        : { _sum: { debit: 255_000, credit: 100_000 } }
    );
    const r = await searchAccountStatement(T, 'acc-1', {
      range: { from: new Date(Date.UTC(2026, 0, 1)) },
      search: 'pénalité',
      asOf: ASOF
    });
    expect(r.openingBalance).toBe(50_000);
    expect(r.closingBalance).toBe(155_000);
    // 50000 + 100000 − 40000 + 100000 + 5000
    expect(r.movements[0].balanceAfter).toBe(215_000);
  });

  it('tenantId figure dans chaque where', async () => {
    await searchAccountStatement(T, 'acc-1', { search: 'loyer', asOf: ASOF });
    expect(accountFindFirst.mock.calls[0][0].where).toEqual({ id: 'acc-1', tenantId: T });
    for (const call of movementFindMany.mock.calls) expect(call[0].where.tenantId).toBe(T);
    for (const call of movementAggregate.mock.calls) expect(call[0].where.tenantId).toBe(T);
    const avecTexte = movementFindMany.mock.calls.find(c => c[0].where.label);
    expect(avecTexte?.[0].where.label).toEqual({ contains: 'loyer', mode: 'insensitive' });
  });

  it('compte d’une autre agence : introuvable, rien n’est lu', async () => {
    accountFindFirst.mockResolvedValue(null);
    await expect(searchAccountStatement('autre', 'acc-1', { search: 'loyer', asOf: ASOF })).rejects.toMatchObject({
      status: 404,
      message: 'Compte de tiers introuvable ou inaccessible'
    });
    expect(movementFindMany).not.toHaveBeenCalled();
  });

  it('pagination skip/take sur les lignes retenues, soldes de la suite complète', async () => {
    const page2 = await searchAccountStatement(T, 'acc-1', { search: 'règlement', skip: 1, take: 1, asOf: ASOF });
    expect(page2.movements.map(m => m.id)).toEqual(['m5']);
    expect(page2.movements[0].balanceAfter).toBe(105_000);
    expect(page2.total).toBe(2);
    // Totaux de TOUTES les lignes retenues, pas de la page.
    expect(page2.filteredTotals).toEqual({ debit: 0, credit: 100_000 });
  });
});

describe('accountStatementQuerySchema — search', () => {
  it('trim, vide = absent, plus de 100 caractères refusé (ZodError → 400)', () => {
    expect(accountStatementQuerySchema.parse({ search: '  Loyer ' }).search).toBe('Loyer');
    expect(accountStatementQuerySchema.parse({ search: '  ' }).search).toBeUndefined();
    expect(() => accountStatementQuerySchema.parse({ search: 'x'.repeat(101) })).toThrow(
      expect.objectContaining({ name: 'ZodError' })
    );
  });
});
