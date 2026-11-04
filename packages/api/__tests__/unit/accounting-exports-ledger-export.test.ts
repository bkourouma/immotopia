/**
 * `getGeneralLedger` (export du grand livre sans compte choisi) : la recherche
 * du récapitulatif s'applique (numéro en préfixe, intitulé en sous-chaîne).
 */

export {};

const mockPrisma = {
  journalEntryLine: { groupBy: jest.fn(), findMany: jest.fn() },
  chartOfAccount: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getGeneralLedger } = require('../../src/lib/accounting-exports/service');

const period = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-12-31T23:59:59.999Z'),
  fromLabel: '2026-01-01',
  toLabel: '2026-12-31'
};

const ACCOUNTS = [
  { id: 'a411', accountNumber: '411000', accountName: 'Clients locataires' },
  { id: 'a512', accountNumber: '512000', accountName: 'Banque' },
  { id: 'a706', accountNumber: '706000', accountName: 'Honoraires clients' }
];

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
  mockPrisma.journalEntryLine.findMany.mockResolvedValue(
    ACCOUNTS.map((a, i) => ({
      id: `l${i}`,
      accountId: a.id,
      label: 'x',
      debit: 10,
      credit: 0,
      fundsNature: null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
      thirdParty: null,
      entry: {
        id: `e${i}`,
        entryDate: new Date('2026-02-01T00:00:00Z'),
        createdAt: new Date('2026-02-01T00:00:00Z'),
        reference: `P${i}`,
        journal: { code: 'VT' }
      }
    }))
  );
  mockPrisma.chartOfAccount.findMany.mockResolvedValue(ACCOUNTS);
});

const numbers = async (search?: string) =>
  (await getGeneralLedger('t1', period, search)).accounts.map((a: any) => a.accountNumber);

describe('getGeneralLedger - recherche', () => {
  it('sans recherche : tous les comptes', async () => {
    expect(await numbers()).toEqual(['411000', '512000', '706000']);
    expect(await numbers('   ')).toEqual(['411000', '512000', '706000']);
  });

  it('"41" : numéro en préfixe uniquement', async () => {
    expect(await numbers('41')).toEqual(['411000']);
  });

  it('par intitulé, sans casse, en sous-chaîne ; la saisie est rognée', async () => {
    expect(await numbers(' CLIENTS ')).toEqual(['411000', '706000']);
    expect(await numbers('banq')).toEqual(['512000']);
  });

  it('aucune correspondance : aucun compte', async () => {
    expect(await numbers('zzz')).toEqual([]);
  });
});
