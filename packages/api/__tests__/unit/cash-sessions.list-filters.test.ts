/**
 * Filtres de l'historique des sessions de caisse : validation Zod (400) et
 * `where` Prisma toujours borné par `tenantId`.
 */

const sessionFindMany = jest.fn(async (..._a: any[]) => [] as any[]);
const userFindMany = jest.fn(async (..._a: any[]) => [] as any[]);
const treasuryFindMany = jest.fn(async (..._a: any[]) => [] as any[]);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    cashSession: { findMany: (...a: any[]) => sessionFindMany(...a) },
    user: { findMany: (...a: any[]) => userFindMany(...a) },
    treasuryAccount: { findMany: (...a: any[]) => treasuryFindMany(...a) }
  }
}));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn() }));
jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureDefaultTreasuryAccountTx: jest.fn(async () => ({ treasuryAccountId: 'default-cash', label: 'Caisse' })),
  ensureChartAccountTx: jest.fn(),
  journalForKind: jest.fn()
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listSessions } = require('../../src/lib/cash-sessions/service');

const CASH_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const sessionWhere = () => (sessionFindMany.mock.calls[0][0] as any).where;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listSessions — filtres', () => {
  it('sans paramètre : where identique à l’actuel', async () => {
    await listSessions('t1', {});
    expect(sessionWhere()).toEqual({ tenantId: 't1' });
    expect((sessionFindMany.mock.calls[0][0] as any).take).toBe(200);
  });

  it('chaînes vides ignorées', async () => {
    await listSessions('t1', { status: '', cashierUserId: '', from: '', to: '', treasuryAccountId: '' });
    expect(sessionWhere()).toEqual({ tenantId: 't1' });
  });

  it('status, cashierUserId, treasuryAccountId, from, to atteignent le where avec tenantId', async () => {
    await listSessions('t1', {
      status: 'CLOSED',
      cashierUserId: 'u1',
      treasuryAccountId: CASH_ACCOUNT,
      from: '2026-09-01',
      to: '2026-09-30'
    });
    expect(sessionWhere()).toEqual({
      tenantId: 't1',
      status: 'CLOSED',
      cashierUserId: 'u1',
      treasuryAccountId: CASH_ACCOUNT,
      openedAt: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T23:59:59.999Z') }
    });
  });

  it('2026-02-28 est acceptée', async () => {
    await listSessions('t1', { from: '2026-02-28', to: '2026-02-28' });
    expect(sessionWhere()).toEqual({
      tenantId: 't1',
      openedAt: { gte: new Date('2026-02-28T00:00:00.000Z'), lte: new Date('2026-02-28T23:59:59.999Z') }
    });
  });

  it.each([
    ['statut inconnu', { status: 'FOO' }],
    ['date mal formée', { from: 'demain' }],
    ['31 février (deviendrait le 3 mars)', { from: '2026-02-31' }],
    ['mois et jour impossibles', { to: '2026-13-45' }],
    ['from après to', { from: '2026-10-01', to: '2026-09-01' }],
    ['compte non uuid', { treasuryAccountId: 'x' }]
  ])('valeur invalide (%s) : ZodError', async (_label, filters) => {
    await expect(listSessions('t1', filters)).rejects.toMatchObject({ name: 'ZodError' });
    expect(sessionFindMany).not.toHaveBeenCalled();
  });
});

describe('listSessions — hasDifference', () => {
  it('true et 1 ajoutent le filtre d’écart non nul', async () => {
    await listSessions('t1', { hasDifference: 'true' });
    expect(sessionWhere()).toEqual({ tenantId: 't1', difference: { not: 0 } });
    sessionFindMany.mockClear();
    await listSessions('t1', { hasDifference: '1' });
    expect(sessionWhere()).toEqual({ tenantId: 't1', difference: { not: 0 } });
  });

  it.each([[undefined], [''], ['false'], ['0']])('%p : pas de filtre', async v => {
    await listSessions('t1', { hasDifference: v });
    expect(sessionWhere()).toEqual({ tenantId: 't1' });
  });

  it('valeur invalide : ZodError', async () => {
    await expect(listSessions('t1', { hasDifference: 'abc' })).rejects.toMatchObject({ name: 'ZodError' });
    expect(sessionFindMany).not.toHaveBeenCalled();
  });
});

describe('listSessions — search', () => {
  const row = (n: number, over: Record<string, unknown> = {}) => ({
    id: `s${n}`,
    tenantId: 't1',
    year: 2025,
    sequence: n,
    cashierUserId: 'u1',
    treasuryAccountId: null,
    validatedByUserId: null,
    status: 'CLOSED',
    openedAt: new Date(2025, 0, 1),
    openingFloat: 0,
    openingNote: null,
    closedAt: null,
    expectedBreakdown: { receipts: 0, disbursements: 0, amount: 0, lines: [] },
    countedAmount: null,
    denominations: null,
    difference: null,
    differenceReason: null,
    validatedAt: null,
    ...over
  });
  // 250 sessions récentes (2026) puis 3 anciennes (2025), triées openedAt desc.
  const recent = Array.from({ length: 250 }, (_, i) => row(i + 1, { id: `r${i}`, year: 2026 }));
  const old = [row(3), row(2), row(1)];
  const all = [...recent, ...old];

  beforeEach(() => {
    userFindMany.mockImplementation(async () => [{ id: 'u1', fullName: 'Awa Koné', email: 'awa@x.ci' }]);
    treasuryFindMany.mockImplementation(async () => []);
    sessionFindMany.mockImplementation(async (arg: any) => {
      if (arg.select) return all;
      if (!arg.where.id) return [];
      const ids: string[] = arg.where.id.in;
      return all.filter(s => ids.includes(s.id));
    });
  });

  it('numéro ancien retrouvé malgré 250 sessions plus récentes, insensible à la casse', async () => {
    const res = await listSessions('t1', { search: 'cai-2025-0003' });
    expect(res.map((s: any) => s.number)).toEqual(['CAI-2025-0003']);
  });

  it('nom du caissier, insensible à la casse', async () => {
    const res = await listSessions('t1', { search: '  AWA kon ' });
    expect(res).toHaveLength(200);
    expect(res[0].cashierName).toBe('Awa Koné');
  });

  it('libellé de caisse (compte désigné et caisse par défaut)', async () => {
    treasuryFindMany.mockImplementation(async () => [{ id: 'acc1', label: 'Coffre Plateau' }]);
    sessionFindMany.mockImplementation(async (arg: any) => {
      const list = [row(1, { id: 'a', treasuryAccountId: 'acc1' }), row(2, { id: 'b' })];
      if (arg.select) return list;
      return list.filter(s => arg.where.id.in.includes(s.id));
    });
    const byLabel = await listSessions('t1', { search: 'coffre plat' });
    expect(byLabel.map((s: any) => s.id)).toEqual(['a']);
    const byDefault = await listSessions('t1', { search: 'CAISSE' });
    expect(byDefault.map((s: any) => s.id)).toEqual(['b']);
  });

  it('aucun résultat : pas de seconde requête', async () => {
    const res = await listSessions('t1', { search: 'zzz-introuvable' });
    expect(res).toEqual([]);
    expect(sessionFindMany).toHaveBeenCalledTimes(1);
  });

  it('toutes les requêtes portent tenantId et les filtres', async () => {
    await listSessions('t1', { search: 'cai-2025', hasDifference: 'true', status: 'CLOSED' });
    expect(sessionFindMany).toHaveBeenCalledTimes(2);
    for (const call of sessionFindMany.mock.calls) {
      expect((call[0] as any).where.tenantId).toBe('t1');
    }
    expect((sessionFindMany.mock.calls[0][0] as any).where).toMatchObject({
      status: 'CLOSED',
      difference: { not: 0 }
    });
  });

  it('insensible aux accents dans les deux sens', async () => {
    const res = await listSessions('t1', { search: 'kone' });
    expect(res[0].cashierName).toBe('Awa Koné');
    userFindMany.mockImplementation(async () => [{ id: 'u1', fullName: 'Awa Kone', email: 'awa@x.ci' }]);
    const res2 = await listSessions('t1', { search: 'KONÉ' });
    expect(res2[0].cashierName).toBe('Awa Kone');
  });

  it('ordre de la première passe conservé, id étranger à la première passe ignoré', async () => {
    const first = [row(3, { id: 'x3' }), row(2, { id: 'x2' }), row(1, { id: 'x1' })];
    const intruder = row(9, { id: 'x9' });
    sessionFindMany.mockImplementation(async (arg: any) => {
      if (arg.select) return first;
      return [first[2], intruder, first[0], first[1]];
    });
    const res = await listSessions('t1', { search: 'koné' });
    expect(res.map((s: any) => s.id)).toEqual(['x3', 'x2', 'x1']);
    expect(res.map((s: any) => s.id)).not.toContain('x9');
  });

  it('search vide : chemin inchangé, une requête, take 200', async () => {
    await listSessions('t1', { search: '   ' });
    expect(sessionFindMany).toHaveBeenCalledTimes(1);
    expect((sessionFindMany.mock.calls[0][0] as any).take).toBe(200);
  });
});
