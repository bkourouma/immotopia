/**
 * Paramètre `search` des balances clients : validation Zod et transmission au
 * `where` des comptes TENANT (libellé du compte tiers), toujours avec tenantId.
 */

const accountFindMany = jest.fn(async (..._a: any[]) => [] as any[]);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    thirdPartyAccount: { findMany: (...a: any[]) => accountFindMany(...a) },
    thirdPartyMovement: { groupBy: jest.fn(async () => []) },
    rentalInstallment: { findMany: jest.fn(async () => []) }
  }
}));

import { getClientsAgingBalance, getClientsBalance } from '../../src/lib/finance/reports';
import { clientsAgingBalanceQuerySchema, clientsBalanceQuerySchema } from '../../src/lib/finance/schemas';

const whereOf = () => (accountFindMany.mock.calls[0][0] as any).where;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getClientsBalance — search', () => {
  it('sans search : where identique à l’actuel', async () => {
    await getClientsBalance('t1', {});
    expect(whereOf()).toEqual({ tenantId: 't1', kind: 'TENANT' });
  });

  it('search : contains insensible à la casse sur le libellé, avec tenantId', async () => {
    await getClientsBalance('t1', { search: 'diallo' });
    expect(whereOf()).toEqual({
      tenantId: 't1',
      kind: 'TENANT',
      label: { contains: 'diallo', mode: 'insensitive' }
    });
  });
});

describe('getClientsAgingBalance — search', () => {
  it('transmet search à getClientsBalance', async () => {
    await getClientsAgingBalance('t1', { search: 'koné' });
    expect(whereOf()).toEqual({
      tenantId: 't1',
      kind: 'TENANT',
      label: { contains: 'koné', mode: 'insensitive' }
    });
  });
});

describe('schémas de requête — search', () => {
  it.each([
    ['balance', clientsBalanceQuerySchema],
    ['balance âgée', clientsAgingBalanceQuerySchema]
  ])('%s : trim, vide = absent, > 100 caractères refusé', (_label, schema) => {
    expect((schema as any).parse({ search: '  Diallo ' }).search).toBe('Diallo');
    expect((schema as any).parse({ search: '   ' }).search).toBeUndefined();
    expect((schema as any).parse({}).search).toBeUndefined();
    expect(() => (schema as any).parse({ search: 'x'.repeat(101) })).toThrow();
  });
});
