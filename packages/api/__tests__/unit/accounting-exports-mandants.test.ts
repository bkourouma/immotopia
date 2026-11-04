/**
 * Lectures paginées des mandants (lot C, comptabilité rapide) : soldes par
 * propriétaire, grand livre d'un propriétaire, balance auxiliaire paginée.
 * Prisma est mocké ; les agrégats sont fournis tels que Postgres les rendrait.
 */

const mockPrisma = {
  agencyFinanceSettings: { findUnique: jest.fn() },
  chartOfAccount: { findFirst: jest.fn() },
  journalEntryLine: { groupBy: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
  thirdPartyAccount: { findMany: jest.fn(), findFirst: jest.fn() },
  $queryRaw: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  getMandantOwnersPage,
  getMandantOwnerLedger,
  getMandantTrialBalancePage,
  getMandantSubledger,
  mandantOwnerLedgerTable,
  mandantTrialBalancePageTable
} = require('../../src/lib/accounting-exports/mandants');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NotFoundError } = require('../../src/middleware/error-middleware');

const TENANT = 'tenant-1';
const FUNDS_ID = '00000000-0000-0000-0000-0000000000f1';
const OWNER_A = '00000000-0000-0000-0000-00000000000a';
const OWNER_B = '00000000-0000-0000-0000-00000000000b';
const OWNER_C = '00000000-0000-0000-0000-00000000000c';

const period = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-12-31T23:59:59.999Z'),
  fromLabel: '2026-01-01',
  toLabel: '2026-12-31'
};

const sum = (debit: number, credit: number, count?: number) => ({
  _sum: { debit, credit },
  ...(count === undefined ? {} : { _count: { _all: count } })
});

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.agencyFinanceSettings.findUnique.mockResolvedValue(null);
  mockPrisma.chartOfAccount.findFirst.mockResolvedValue({
    id: FUNDS_ID,
    accountNumber: '4731',
    accountName: 'Fonds des propriétaires'
  });
});

/** groupBy : `opening` avant la période, `during` sur la période (reconnu à `entryDate.lt` / `gte`). */
function mockGroupBy(opening: unknown[], during: unknown[]) {
  mockPrisma.journalEntryLine.groupBy.mockImplementation(async (args: any) =>
    args.where.entry.entryDate.lt ? opening : during
  );
}

describe('getMandantOwnersPage', () => {
  function seedOwners() {
    mockGroupBy(
      [
        { thirdPartyAccountId: OWNER_B, ...sum(0, 500) },
        { thirdPartyAccountId: null, ...sum(0, 40) }
      ],
      [
        { thirdPartyAccountId: OWNER_A, ...sum(100, 1000) },
        { thirdPartyAccountId: OWNER_B, ...sum(200, 300) },
        { thirdPartyAccountId: OWNER_C, ...sum(0, 0) },
        { thirdPartyAccountId: null, ...sum(10, 0) }
      ]
    );
    mockPrisma.thirdPartyAccount.findMany.mockResolvedValue([
      { id: OWNER_A, label: 'Zoé Kouassi' },
      { id: OWNER_B, label: 'Édouard Bamba' }
    ]);
    // Solde général du 4731 : 900 + 600 + 30 = 1530, le compte est équilibré.
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue({ _sum: { debit: 310, credit: 1840 } });
  }

  it('trie par libellé, « Non réparti » en dernier, et calcule les soldes par agrégats', async () => {
    seedOwners();
    const page = await getMandantOwnersPage(TENANT, period, {}, { page: 1, limit: 10 });

    expect(page.items.map((r: any) => r.ownerLabel)).toEqual(['Édouard Bamba', 'Zoé Kouassi', 'Non réparti']);
    expect(page.items[0]).toMatchObject({
      ownerKey: OWNER_B,
      openingBalance: 500,
      totalDebit: 200,
      totalCredit: 300,
      closingBalance: 600
    });
    expect(page.items[2]).toMatchObject({ ownerKey: 'non-reparti', thirdPartyAccountId: null, closingBalance: 30 });
    // Le propriétaire sans solde ni mouvement n'apparaît pas.
    expect(page.items.some((r: any) => r.ownerKey === OWNER_C)).toBe(false);
    expect(page).toMatchObject({
      mode: 'owners',
      from: '2026-01-01',
      to: '2026-12-31',
      accountNumber: '4731',
      accountName: 'Fonds des propriétaires',
      total: 3,
      page: 1,
      limit: 10
    });
    expect(page.totals).toEqual({ openingBalance: 540, totalDebit: 310, totalCredit: 1300, closingBalance: 1530 });
    expect(page.control).toEqual({ auxiliaryBalance: 1530, generalBalance: 1530, difference: 0, isBalanced: true });
    // Aucune ligne n'est chargée : seulement des groupBy.
    expect(mockPrisma.journalEntryLine.groupBy).toHaveBeenCalledTimes(2);
  });

  it('pagine avec le total du serveur', async () => {
    seedOwners();
    const page = await getMandantOwnersPage(TENANT, period, {}, { page: 2, limit: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((r: any) => r.ownerLabel)).toEqual(['Non réparti']);
    expect(page.page).toBe(2);
    expect(page.limit).toBe(2);
  });

  it("renvoie tout avec 'all'", async () => {
    seedOwners();
    const page = await getMandantOwnersPage(TENANT, period, {}, 'all');
    expect(page.items).toHaveLength(3);
    expect(page.limit).toBe(3);
  });

  it('filtre par libellé sans accent ni casse, totaux du filtre mais contrôle sur tous', async () => {
    seedOwners();
    const page = await getMandantOwnersPage(TENANT, period, { search: 'edouard' }, { page: 1, limit: 10 });
    expect(page.items.map((r: any) => r.ownerLabel)).toEqual(['Édouard Bamba']);
    expect(page.total).toBe(1);
    expect(page.totals.closingBalance).toBe(600);
    expect(page.control.auxiliaryBalance).toBe(1530);
  });

  it('retrouve « Non réparti » par son libellé', async () => {
    seedOwners();
    const page = await getMandantOwnersPage(TENANT, period, { search: 'NON rép' }, { page: 1, limit: 10 });
    expect(page.items.map((r: any) => r.ownerKey)).toEqual(['non-reparti']);
  });

  it('signale une différence avec le solde général', async () => {
    seedOwners();
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 1500 } });
    const page = await getMandantOwnersPage(TENANT, period, {}, { page: 1, limit: 10 });
    expect(page.control).toEqual({ auxiliaryBalance: 1530, generalBalance: 1500, difference: 30, isBalanced: false });
  });

  it("filtre les libellés et les lignes sur l'agence", async () => {
    seedOwners();
    await getMandantOwnersPage(TENANT, period, {}, 'all');
    expect(mockPrisma.thirdPartyAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) })
    );
    const where = mockPrisma.journalEntryLine.groupBy.mock.calls[0][0].where;
    expect(where.account).toEqual({ tenantId: TENANT, scope: 'OPERATIONS' });
    expect(where.entry.tenantId).toBe(TENANT);
  });
});

describe('getMandantOwnerLedger', () => {
  it("refuse un propriétaire d'une autre agence comme un inexistant", async () => {
    mockPrisma.thirdPartyAccount.findFirst.mockResolvedValue(null);
    await expect(getMandantOwnerLedger(TENANT, period, OWNER_A, {}, { page: 1, limit: 10 })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(mockPrisma.thirdPartyAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OWNER_A, tenantId: TENANT } })
    );
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  function seedLedger() {
    mockPrisma.thirdPartyAccount.findFirst.mockResolvedValue({ id: OWNER_A, label: 'Zoé Kouassi' });
    mockGroupBy(
      [{ fundsNature: 'CURRENT', ...sum(0, 100) }],
      [
        { fundsNature: 'CURRENT', ...sum(30, 70, 2) },
        { fundsNature: null, ...sum(0, 20, 1) },
        { fundsNature: 'DEPOSIT', ...sum(0, 500, 1) }
      ]
    );
  }

  it('assemble synthèse par nature et solde progressif avec l’ouverture de la nature', async () => {
    seedLedger();
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: 'l1',
        entry_date: new Date('2026-02-01T00:00:00Z'),
        journal_code: 'BQ',
        reference: 'P-1',
        label: 'Loyer',
        nature: 'CURRENT',
        debit: '0.00',
        credit: '70.00',
        cumul: '70.00'
      },
      {
        id: 'l2',
        entry_date: new Date('2026-02-02T00:00:00Z'),
        journal_code: 'BQ',
        reference: 'P-2',
        label: null,
        nature: 'DEPOSIT',
        debit: '0.00',
        credit: '500.00',
        cumul: '500.00'
      }
    ]);

    const page = await getMandantOwnerLedger(TENANT, period, OWNER_A, {}, { page: 1, limit: 2 });

    // CURRENT : ouverture 100 ; les 20 sans nature s'y ajoutent (comptés CURRENT).
    expect(page.natures).toEqual([
      {
        nature: 'CURRENT',
        natureLabel: expect.any(String),
        openingBalance: 100,
        totalDebit: 30,
        totalCredit: 90,
        closingBalance: 160
      },
      {
        nature: 'DEPOSIT',
        natureLabel: expect.any(String),
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 500,
        closingBalance: 500
      }
    ]);
    expect(page.total).toBe(4);
    expect(page.items[0]).toMatchObject({ id: 'l1', date: '2026-02-01T00:00:00.000Z', balance: 170, credit: 70 });
    expect(page.items[1]).toMatchObject({ id: 'l2', label: '', balance: 500, nature: 'DEPOSIT' });
    expect(page.owner).toEqual({ ownerKey: OWNER_A, thirdPartyAccountId: OWNER_A, ownerLabel: 'Zoé Kouassi' });
    expect(page).toMatchObject({ mode: 'owner', page: 1, limit: 2 });
  });

  it('écrit un SQL filtré par agence, fenêtré par nature et paginé par paramètres', async () => {
    seedLedger();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await getMandantOwnerLedger(TENANT, period, OWNER_A, {}, { page: 3, limit: 25 });

    const query = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(query.text).toContain('PARTITION BY f.nature');
    expect(query.text).toMatch(/e\.tenant_id = \$\d+/);
    expect(query.text).toMatch(/a\.tenant_id = \$\d+/);
    expect(query.text).toContain('journal_entries');
    expect(query.text).toContain('chart_of_accounts');
    expect(query.text).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(query.text).toContain('l.third_party_account_id = $');
    expect(query.text).not.toContain('IS NULL');
    expect(query.values).toEqual(expect.arrayContaining([TENANT, OWNER_A, FUNDS_ID, 25, 50]));
    expect(query.text).toMatch(/e\.entry_date >= .*::timestamp/);
    expect(query.text).toMatch(/e\.entry_date <= .*::timestamp/);
    expect(query.values).toEqual(expect.arrayContaining([period.from.toISOString(), period.to.toISOString()]));
    expect(query.values.some((v: unknown) => v instanceof Date)).toBe(false);
    // Rien n'est concaténé dans le texte SQL.
    expect(query.text).not.toContain(TENANT);
    expect(query.text).not.toContain(OWNER_A);
  });

  it("'non-reparti' lit les lignes sans compte de tiers, sans chercher de propriétaire", async () => {
    mockGroupBy([], [{ fundsNature: 'CURRENT', ...sum(0, 10, 1) }]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const page = await getMandantOwnerLedger(TENANT, period, 'non-reparti', {}, 'all');

    expect(mockPrisma.thirdPartyAccount.findFirst).not.toHaveBeenCalled();
    const query = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(query.text).toContain('l.third_party_account_id IS NULL');
    expect(query.text).not.toContain('LIMIT');
    expect(mockPrisma.journalEntryLine.groupBy.mock.calls[0][0].where.thirdPartyAccountId).toBeNull();
    expect(page.owner).toEqual({ ownerKey: 'non-reparti', thirdPartyAccountId: null, ownerLabel: 'Non réparti' });
  });

  it('applique le filtre de nature après la fenêtre', async () => {
    seedLedger();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const page = await getMandantOwnerLedger(TENANT, period, OWNER_A, { nature: 'DEPOSIT' }, { page: 1, limit: 10 });

    const query = mockPrisma.$queryRaw.mock.calls[0][0];
    expect(query.text).toMatch(/WHERE r\.nature = \$\d+/);
    expect(query.values).toContain('DEPOSIT');
    expect(page.total).toBe(1);
    // La synthèse garde toutes les natures.
    expect(page.natures).toHaveLength(2);
  });
});

describe('getMandantTrialBalancePage', () => {
  function seedTrial() {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([
      { thirdPartyAccountId: OWNER_A, fundsNature: 'CURRENT', ...sum(0, 100) },
      { thirdPartyAccountId: OWNER_A, fundsNature: 'DEPOSIT', ...sum(0, 50) },
      { thirdPartyAccountId: OWNER_B, fundsNature: 'UNALLOCATED', ...sum(0, 20) },
      { thirdPartyAccountId: null, fundsNature: null, ...sum(5, 0) }
    ]);
    mockPrisma.thirdPartyAccount.findMany.mockResolvedValue([
      { id: OWNER_A, label: 'Zoé Kouassi' },
      { id: OWNER_B, label: 'Albert Yao' }
    ]);
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue({ _sum: { debit: 5, credit: 170 } });
  }
  const asOf = { date: new Date('2026-12-31T23:59:59.999Z'), label: '2026-12-31' };

  it('pagine, ajoute ownerKey, totalise le filtre et contrôle sur tous', async () => {
    seedTrial();
    const page = await getMandantTrialBalancePage(TENANT, asOf, { search: 'zoe' }, { page: 1, limit: 10 });

    expect(page.items).toEqual([
      {
        ownerKey: OWNER_A,
        thirdPartyAccountId: OWNER_A,
        ownerLabel: 'Zoé Kouassi',
        current: 100,
        deposit: 50,
        unallocated: 0,
        total: 150
      }
    ]);
    expect(page.total).toBe(1);
    expect(page.date).toBe('2026-12-31');
    expect(page.totals).toEqual({ current: 100, deposit: 50, unallocated: 0, total: 150 });
    expect(page.control).toEqual({ auxiliaryBalance: 165, generalBalance: 165, difference: 0, isBalanced: true });
  });

  it('range « Non réparti » en dernier avec sa clé', async () => {
    seedTrial();
    const page = await getMandantTrialBalancePage(TENANT, asOf, {}, { page: 2, limit: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((r: any) => r.ownerKey)).toEqual(['non-reparti']);
  });
});

describe('tables d’export', () => {
  it('grand livre d’un propriétaire : ouverture, lignes, clôture par nature', () => {
    const table = mandantOwnerLedgerTable({
      mode: 'owner',
      from: '2026-01-01',
      to: '2026-12-31',
      owner: { ownerKey: OWNER_A, thirdPartyAccountId: OWNER_A, ownerLabel: 'Zoé Kouassi' },
      natures: [
        {
          nature: 'CURRENT',
          natureLabel: 'Compte courant',
          openingBalance: 100,
          totalDebit: 30,
          totalCredit: 70,
          closingBalance: 140
        }
      ],
      items: [
        {
          id: 'l1',
          date: '2026-02-01T00:00:00.000Z',
          journalCode: 'BQ',
          reference: 'P-1',
          label: 'Loyer',
          nature: 'CURRENT',
          natureLabel: 'Compte courant',
          debit: 0,
          credit: 70,
          balance: 170
        }
      ],
      total: 1,
      page: 1,
      limit: 1
    });
    expect(table.headers).toEqual([
      'Date',
      'Journal',
      'Pièce',
      'Mandant',
      'Nature',
      'Libellé',
      'Débit',
      'Crédit',
      'Solde'
    ]);
    expect(table.money).toEqual([6, 7, 8]);
    expect(table.rows).toEqual([
      ['', '', '', 'Zoé Kouassi', 'Compte courant', 'Solde d’ouverture', '', '', 100],
      ['01/02/2026', 'BQ', 'P-1', 'Zoé Kouassi', 'Compte courant', 'Loyer', 0, 70, 170],
      ['', '', '', 'Zoé Kouassi', 'Compte courant', 'Total et solde de clôture', 30, 70, 140]
    ]);
  });

  it('balance auxiliaire paginée : lignes puis total', () => {
    const table = mandantTrialBalancePageTable({
      date: '2026-12-31',
      accountNumber: '4731',
      accountName: 'Fonds',
      items: [
        {
          ownerKey: OWNER_A,
          thirdPartyAccountId: OWNER_A,
          ownerLabel: 'Zoé Kouassi',
          current: 100,
          deposit: 50,
          unallocated: 0,
          total: 150
        }
      ],
      total: 1,
      page: 1,
      limit: 1,
      totals: { current: 100, deposit: 50, unallocated: 0, total: 150 },
      control: { auxiliaryBalance: 150, generalBalance: 150, difference: 0, isBalanced: true }
    });
    expect(table.headers).toEqual(['Mandant', 'Compte courant', 'Dépôt de garantie', 'À affecter', 'Total']);
    expect(table.rows).toEqual([
      ['Zoé Kouassi', 100, 50, 0, 150],
      ['Total', 100, 50, 0, 150]
    ]);
  });
});

describe('export du grand livre d un proprietaire filtre par nature', () => {
  const summary = (nature: string, natureLabel: string) => ({
    nature,
    natureLabel,
    openingBalance: 10,
    totalDebit: 0,
    totalCredit: 5,
    closingBalance: 15
  });
  const line = (id: string, nature: string, natureLabel: string) => ({
    id,
    date: '2026-02-01T00:00:00.000Z',
    journalCode: 'BQ',
    reference: id,
    label: 'L',
    nature,
    natureLabel,
    debit: 0,
    credit: 5,
    balance: 15
  });
  const data: any = {
    mode: 'owner',
    from: '2026-01-01',
    to: '2026-12-31',
    owner: { ownerKey: OWNER_A, thirdPartyAccountId: OWNER_A, ownerLabel: 'Zoe' },
    natures: [summary('CURRENT', 'Compte courant'), summary('DEPOSIT', 'Depot de garantie')],
    items: [line('c1', 'CURRENT', 'Compte courant'), line('d1', 'DEPOSIT', 'Depot de garantie')],
    total: 2,
    page: 1,
    limit: 2
  };

  it('sans filtre : toutes les natures', () => {
    const natures = new Set(mandantOwnerLedgerTable(data).rows.map((r: any[]) => r[4]));
    expect(natures).toEqual(new Set(['Compte courant', 'Depot de garantie']));
  });

  it('nature filtree : seule cette nature (ouverture, lignes, cloture)', () => {
    const rows = mandantOwnerLedgerTable(data, 'DEPOSIT').rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r: any[]) => r[4] === 'Depot de garantie')).toBe(true);
  });
});

describe('getMandantSubledger', () => {
  it('additionne l’ouverture d’une ligne historique (nature NULL) et d’une ligne CURRENT du même propriétaire', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([
      { thirdPartyAccountId: OWNER_A, fundsNature: null, ...sum(0, 40) },
      { thirdPartyAccountId: OWNER_A, fundsNature: 'CURRENT', ...sum(0, 60) }
    ]);
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([]);
    mockPrisma.thirdPartyAccount.findMany.mockResolvedValue([{ id: OWNER_A, label: 'Zoé Kouassi' }]);
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue({ _sum: { debit: 0, credit: 100 } });

    const sub = await getMandantSubledger(TENANT, period);

    expect(sub.owners).toHaveLength(1);
    expect(sub.owners[0].openingBalance).toBe(100);
    expect(sub.totals.closingBalance).toBe(100);
    expect(sub.control).toEqual({ auxiliaryBalance: 100, generalBalance: 100, difference: 0, isBalanced: true });
  });
});
