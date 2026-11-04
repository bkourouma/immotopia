/**
 * Filtres de l'historique des sessions de caisse : validation Zod (400) et
 * `where` Prisma toujours borné par `tenantId`.
 */

const sessionFindMany = jest.fn(async (..._a: any[]) => [] as any[]);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    cashSession: { findMany: (...a: any[]) => sessionFindMany(...a) },
    user: { findMany: jest.fn(async () => []) },
    treasuryAccount: { findMany: jest.fn(async () => []) }
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

  it.each([
    ['statut inconnu', { status: 'FOO' }],
    ['date mal formée', { from: 'demain' }],
    ['from après to', { from: '2026-10-01', to: '2026-09-01' }],
    ['compte non uuid', { treasuryAccountId: 'x' }]
  ])('valeur invalide (%s) : ZodError', async (_label, filters) => {
    await expect(listSessions('t1', filters)).rejects.toMatchObject({ name: 'ZodError' });
    expect(sessionFindMany).not.toHaveBeenCalled();
  });
});
