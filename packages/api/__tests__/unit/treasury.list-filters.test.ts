/**
 * Filtres de liste de la trésorerie (virements internes et versements DGI) :
 * chaque paramètre atteint le `where` Prisma, toujours avec `tenantId`, et une
 * valeur invalide donne une ZodError (400 via le middleware d'erreurs).
 */

const transferFindMany = jest.fn(async (..._a: any[]) => [] as any[]);
const remittanceFindMany = jest.fn(async (..._a: any[]) => [] as any[]);
const transferCount = jest.fn(async (..._a: any[]) => 502);
const remittanceCount = jest.fn(async (..._a: any[]) => 502);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    treasuryTransfer: {
      findMany: (...a: any[]) => transferFindMany(...a),
      count: (...a: any[]) => transferCount(...a)
    },
    taxRemittance: {
      findMany: (...a: any[]) => remittanceFindMany(...a),
      count: (...a: any[]) => remittanceCount(...a)
    },
    treasuryAccount: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => []) }
  }
}));
jest.mock('../../src/lib/finance/accounting', () => ({ postDocumentEntryTx: jest.fn() }));
jest.mock('../../src/lib/owner-account/sync', () => ({ reverseDocumentEntryTx: jest.fn() }));
jest.mock('../../src/lib/owner-account/accounts', () => ({ journalResolver: () => async () => 'journal-1' }));
jest.mock('../../src/lib/settings/finance-settings', () => ({
  DEFAULT_WITHHOLDING_ACCOUNT: '4478',
  getAgencyFinanceSettings: async () => ({})
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTransfers, listTaxRemittances } = require('../../src/lib/treasury/service');

const TREASURY_ACCOUNT = '11111111-1111-4111-8111-111111111111';
const transfersWhere = (fn: jest.Mock) => (fn.mock.calls[0][0] as any).where;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listTransfers — filtres', () => {
  it('sans paramètre : where identique à l’actuel', async () => {
    await listTransfers('t1');
    expect(transfersWhere(transferFindMany)).toEqual({ tenantId: 't1' });
    expect((transferFindMany.mock.calls[0][0] as any).take).toBeUndefined();
  });

  it('chaînes vides ignorées', async () => {
    await listTransfers('t1', { from: '', to: '', accountId: '', status: '', search: '  ' });
    expect(transfersWhere(transferFindMany)).toEqual({ tenantId: 't1' });
  });

  it('from / to : bornes sur transferredAt, to inclus jusqu’à la fin du jour', async () => {
    await listTransfers('t1', { from: '2026-09-01', to: '2026-09-30' });
    expect(transfersWhere(transferFindMany)).toEqual({
      tenantId: 't1',
      transferredAt: { gte: new Date('2026-09-01T00:00:00.000Z'), lte: new Date('2026-09-30T23:59:59.999Z') }
    });
  });

  it('accountId : compte source OU destination, avec tenantId', async () => {
    await listTransfers('t1', { accountId: TREASURY_ACCOUNT });
    expect(transfersWhere(transferFindMany)).toEqual({
      tenantId: 't1',
      OR: [{ fromTreasuryAccountId: TREASURY_ACCOUNT }, { toTreasuryAccountId: TREASURY_ACCOUNT }]
    });
  });

  it('status : valeurs multiples séparées par des virgules', async () => {
    await listTransfers('t1', { status: 'VALIDATED,VOIDED' });
    expect(transfersWhere(transferFindMany)).toEqual({ tenantId: 't1', status: { in: ['VALIDATED', 'VOIDED'] } });
  });

  it('search : référence ou notes, insensible à la casse, sans écraser le OR du compte', async () => {
    await listTransfers('t1', { search: '  loyer ', accountId: TREASURY_ACCOUNT });
    const where = transfersWhere(transferFindMany);
    expect(where.tenantId).toBe('t1');
    expect(where.OR).toHaveLength(2);
    expect(where.AND).toEqual([
      {
        OR: [
          { reference: { contains: 'loyer', mode: 'insensitive' } },
          { notes: { contains: 'loyer', mode: 'insensitive' } }
        ]
      }
    ]);
  });

  it('page et montant filtrent au serveur avant la limite', async () => {
    const res = await listTransfers('t1', { page: '26', limit: '20', minAmount: '0', maxAmount: '500000' });
    expect(transfersWhere(transferFindMany)).toEqual({ tenantId: 't1', amount: { gte: 0, lte: 500000 } });
    expect(transferFindMany.mock.calls[0][0] as any).toMatchObject({ skip: 500, take: 20 });
    expect(res.total).toBe(502);
  });

  it.each([
    ['date mal formée', { from: '01/09/2026' }],
    ['date inexistante', { to: '2026-13-45' }],
    ['31 février (deviendrait le 3 mars)', { from: '2026-02-31' }],
    ['from après to', { from: '2026-10-01', to: '2026-09-01' }],
    ['compte non uuid', { accountId: 'abc' }],
    ['statut inconnu', { status: 'VALIDATED,FOO' }],
    ['recherche trop longue', { search: 'x'.repeat(101) }],
    ['bornes de montant inversées', { minAmount: '500', maxAmount: '100' }]
  ])('valeur invalide (%s) : ZodError', async (_label, filters) => {
    await expect(listTransfers('t1', filters)).rejects.toMatchObject({ name: 'ZodError' });
    expect(transferFindMany).not.toHaveBeenCalled();
  });
});

describe('listTransfers — vraie date', () => {
  it('2026-02-28 est acceptée', async () => {
    await listTransfers('t1', { from: '2026-02-28', to: '2026-02-28' });
    expect(transfersWhere(transferFindMany)).toEqual({
      tenantId: 't1',
      transferredAt: { gte: new Date('2026-02-28T00:00:00.000Z'), lte: new Date('2026-02-28T23:59:59.999Z') }
    });
  });

  it('2026-02-29 (année non bissextile) est refusée', async () => {
    await expect(listTransfers('t1', { to: '2026-02-29' })).rejects.toMatchObject({ name: 'ZodError' });
  });
});

describe('listTaxRemittances — filtres', () => {
  it('sans paramètre : where identique à l’actuel', async () => {
    await listTaxRemittances('t1');
    expect(transfersWhere(remittanceFindMany)).toEqual({ tenantId: 't1' });
  });

  it('from / to / status / treasuryAccountId atteignent le where avec tenantId', async () => {
    await listTaxRemittances('t1', {
      from: '2026-01-01',
      to: '2026-01-31',
      status: 'VOIDED',
      treasuryAccountId: TREASURY_ACCOUNT
    });
    expect(transfersWhere(remittanceFindMany)).toEqual({
      tenantId: 't1',
      paidAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
      status: { in: ['VOIDED'] },
      treasuryAccountId: TREASURY_ACCOUNT
    });
  });

  it('la page 26 des versements dépasse l’ancien plafond sans perdre le total', async () => {
    const res = await listTaxRemittances('t1', { page: '26', limit: '20' });
    expect(remittanceFindMany.mock.calls[0][0] as any).toMatchObject({ skip: 500, take: 20 });
    expect(res.total).toBe(502);
  });

  it.each([
    ['from après to', { from: '2026-02-01', to: '2026-01-01' }],
    ['31 février (deviendrait le 3 mars)', { from: '2026-02-31' }],
    ['mois et jour impossibles', { to: '2026-13-45' }],
    ['statut inconnu', { status: 'PAID' }],
    ['compte non uuid', { treasuryAccountId: '1' }]
  ])('valeur invalide (%s) : ZodError', async (_label, filters) => {
    await expect(listTaxRemittances('t1', filters)).rejects.toMatchObject({ name: 'ZodError' });
    expect(remittanceFindMany).not.toHaveBeenCalled();
  });
});

describe('listTaxRemittances — vraie date', () => {
  it('2026-02-28 est acceptée', async () => {
    await listTaxRemittances('t1', { from: '2026-02-28' });
    expect(transfersWhere(remittanceFindMany)).toEqual({
      tenantId: 't1',
      paidAt: { gte: new Date('2026-02-28T00:00:00.000Z') }
    });
  });
});
