/**
 * Trésorerie de l'agence (`lib/treasury/service.ts`) — lot 10.
 *
 * Même esprit que `finance.suppliers.test.ts` : Prisma est remplacé par un
 * magasin en mémoire, et le moteur comptable (`postDocumentEntryTx`) ainsi
 * que la contre-passation (`reverseDocumentEntryTx`) sont mockés — ce fichier
 * ne teste pas leur calcul, seulement la façon dont la trésorerie les
 * orchestre : solde d'un compte, numérotation séquentielle par année,
 * équilibre des lignes envoyées, et le refus d'un versement DGI qui dépasse
 * le dû.
 */

const postDocumentEntryTx = jest.fn(async (..._args: any[]) => ({ entryId: 'entry-1', totalDebit: 0, totalCredit: 0 }));
const reverseDocumentEntryTx = jest.fn(async (..._args: any[]) => undefined);

jest.mock('../../src/lib/finance/accounting', () => ({
  postDocumentEntryTx: (...args: any[]) => postDocumentEntryTx(...args)
}));

jest.mock('../../src/lib/owner-account/sync', () => ({
  reverseDocumentEntryTx: (...args: any[]) => reverseDocumentEntryTx(...args)
}));

jest.mock('../../src/lib/owner-account/accounts', () => ({
  journalResolver: () => async () => 'journal-1'
}));

jest.mock('../../src/lib/settings/finance-settings', () => ({
  DEFAULT_WITHHOLDING_ACCOUNT: '4478',
  getAgencyFinanceSettings: async () => ({
    withholdingEnabled: true,
    withholdingAccountNumber: '4478'
  })
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire pour `../../src/utils/database`
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  treasuryAccounts: [] as Row[],
  treasuryTransfers: [] as Row[],
  taxRemittances: [] as Row[],
  rentWithholdings: [] as Row[],
  chartOfAccounts: [] as Row[],
  journalEntryLines: [] as Row[],
  users: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function matchesFlat(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'account' && condition && typeof condition === 'object') {
      const account = store.chartOfAccounts.find(c => c.id === row.accountId);
      return account ? matchesFlat(account, condition) : false;
    }
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return (condition.in as any[]).includes(row[key]);
      if ('not' in condition) return row[key] !== condition.not;
      return true;
    }
    if (condition === null) return row[key] === null || row[key] === undefined;
    return row[key] === condition;
  });
}

function ensureChartAccount(tenantId: string, number: string, name: string) {
  let account = store.chartOfAccounts.find(c => c.tenantId === tenantId && c.accountNumber === number);
  if (!account) {
    account = { id: nextId('coa'), tenantId, accountNumber: number, accountName: name, scope: 'OPERATIONS' };
    store.chartOfAccounts.push(account);
  }
  return account;
}

const mockPrisma: Row = {
  treasuryAccount: {
    findMany: jest.fn(async ({ where, orderBy }: Row = {}) => {
      let rows = store.treasuryAccounts.filter(r => matchesFlat(r, where));
      if (orderBy) rows = [...rows];
      return rows;
    }),
    findFirst: jest.fn(async ({ where }: Row) => store.treasuryAccounts.find(r => matchesFlat(r, where)) ?? null),
    count: jest.fn(async ({ where }: Row) => store.treasuryAccounts.filter(r => matchesFlat(r, where)).length),
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: nextId('trea'),
        isActive: true,
        isDefault: false,
        mmOperator: null,
        bankName: null,
        bankAccountRef: null,
        createdAt: new Date(),
        ...data
      };
      store.treasuryAccounts.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.treasuryAccounts.find(r => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.treasuryAccounts.filter(r => matchesFlat(r, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    })
  },
  treasuryTransfer: {
    findMany: jest.fn(async ({ where }: Row = {}) =>
      store.treasuryTransfers
        .filter(r => matchesFlat(r, where))
        .sort((a, b) => b.transferredAt.getTime() - a.transferredAt.getTime())
    ),
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      let rows = store.treasuryTransfers.filter(r => matchesFlat(r, where));
      if (orderBy?.sequence === 'desc') rows = rows.sort((a, b) => b.sequence - a.sequence);
      return rows[0] ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('vir'), status: 'VALIDATED', voidReason: null, voidedAt: null, ...data };
      store.treasuryTransfers.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.treasuryTransfers.find(r => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },
  taxRemittance: {
    findMany: jest.fn(async ({ where }: Row = {}) =>
      store.taxRemittances.filter(r => matchesFlat(r, where)).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())
    ),
    findFirst: jest.fn(async ({ where, orderBy }: Row) => {
      let rows = store.taxRemittances.filter(r => matchesFlat(r, where));
      if (orderBy?.sequence === 'desc') rows = rows.sort((a, b) => b.sequence - a.sequence);
      return rows[0] ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('dgi'), status: 'VALIDATED', voidReason: null, voidedAt: null, ...data };
      store.taxRemittances.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.taxRemittances.find(r => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.taxRemittances.filter(r => matchesFlat(r, where));
      return { _sum: { amount: rows.reduce((s, r) => s + Number(r.amount), 0) } };
    })
  },
  rentWithholding: {
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.rentWithholdings.filter(r => matchesFlat(r, where));
      return { _sum: { amount: rows.reduce((s, r) => s + Number(r.amount), 0) } };
    })
  },
  chartOfAccount: {
    findFirst: jest.fn(async ({ where }: Row) => store.chartOfAccounts.find(c => matchesFlat(c, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) => store.chartOfAccounts.filter(c => matchesFlat(c, where))),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('coa'), ...data };
      store.chartOfAccounts.push(created);
      return created;
    })
  },
  journalEntryLine: {
    // Solde d'un compte du plan : même calcul que `groupBy`, pour UN compte
    // (contrôle de solde avant une sortie, `lib/treasury/balance.ts`).
    aggregate: jest.fn(async ({ where }: Row) => {
      const lines = store.journalEntryLines.filter(l => l.accountId === where.accountId);
      return {
        _sum: {
          debit: lines.reduce((s, l) => s + Number(l.debit ?? 0), 0),
          credit: lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
        }
      };
    }),
    groupBy: jest.fn(async ({ where }: Row) => {
      const accountIds: string[] = where.accountId?.in ?? [];
      return accountIds.map(accountId => {
        const lines = store.journalEntryLines.filter(l => l.accountId === accountId);
        return {
          accountId,
          _sum: {
            debit: lines.reduce((s, l) => s + Number(l.debit ?? 0), 0),
            credit: lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
          }
        };
      });
    })
  },
  user: {
    findMany: jest.fn(async ({ where }: Row) => store.users.filter(u => matchesFlat(u, where)))
  },
  // Verrou consultatif du contrôle de solde : sans objet en mémoire, mais son
  // appel est vérifié (il doit précéder la lecture du solde).
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(async (fn: (tx: Row) => Promise<any>) => fn(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const service = require('../../src/lib/treasury/service');

const TENANT = 'tenant-1';

beforeEach(() => {
  store.treasuryAccounts = [];
  store.treasuryTransfers = [];
  store.taxRemittances = [];
  store.rentWithholdings = [];
  store.chartOfAccounts = [];
  store.journalEntryLines = [];
  store.users = [];
  store.seq = 0;
  postDocumentEntryTx.mockClear();
  reverseDocumentEntryTx.mockClear();
});

function addAccount(overrides: Row = {}) {
  const chart = ensureChartAccount(TENANT, overrides.accountNumber ?? '5711', 'Caisse principale');
  const account = {
    id: nextId('trea'),
    tenantId: TENANT,
    kind: 'CASH',
    label: 'Caisse principale',
    accountNumber: '5711',
    chartOfAccountId: chart.id,
    mmOperator: null,
    bankName: null,
    bankAccountRef: null,
    isDefault: true,
    isActive: true,
    createdAt: new Date(),
    ...overrides
  };
  store.treasuryAccounts.push(account);
  return account;
}

/** Approvisionne un compte : une ligne au débit de son compte du plan. */
function fund(account: Row, amount: number) {
  store.journalEntryLines.push({ accountId: account.chartOfAccountId, debit: amount, credit: 0 });
}

describe('listAccounts — solde et création à la volée', () => {
  it('crée les comptes CASH et BANK par défaut quand l’agence n’en a aucun', async () => {
    const accounts = await service.listAccounts(TENANT);
    expect(accounts.map((a: Row) => a.kind).sort()).toEqual(['BANK', 'CASH']);
    expect(accounts.every((a: Row) => a.balance === 0)).toBe(true);
  });

  it('calcule le solde débit - crédit des lignes du compte du plan', async () => {
    const account = addAccount();
    store.journalEntryLines.push(
      { accountId: account.chartOfAccountId, debit: 10_000, credit: 0 },
      { accountId: account.chartOfAccountId, debit: 0, credit: 4_000 }
    );
    const accounts = await service.listAccounts(TENANT);
    const dto = accounts.find((a: Row) => a.id === account.id);
    expect(dto.balance).toBe(6_000);
  });
});

describe('createAccount — numéro conforme à la nature', () => {
  it('refuse un numéro qui ne correspond pas à la nature', async () => {
    await expect(
      service.createAccount(TENANT, { kind: 'BANK', label: 'Banque', accountNumber: '5711' })
    ).rejects.toThrow('doit commencer par');
  });

  it('refuse un numéro déjà pris par l’agence', async () => {
    addAccount({ accountNumber: '5211' });
    await expect(
      service.createAccount(TENANT, { kind: 'BANK', label: 'Autre banque', accountNumber: '5211' })
    ).rejects.toThrow('porte déjà le numéro');
  });
});

describe('Virements — numérotation VIR-AAAA-NNNN et équilibre', () => {
  it('numérote séquentiellement par année et poste une écriture équilibrée', async () => {
    const from = addAccount({ accountNumber: '5711', kind: 'CASH', label: 'Caisse' });
    const to = addAccount({ accountNumber: '5211', kind: 'BANK', label: 'Banque' });
    fund(from, 100_000);

    const first = await service.createTransfer(TENANT, 'user-1', {
      fromTreasuryAccountId: from.id,
      toTreasuryAccountId: to.id,
      amount: 50_000,
      transferredAt: '2026-01-15'
    });
    const second = await service.createTransfer(TENANT, 'user-1', {
      fromTreasuryAccountId: from.id,
      toTreasuryAccountId: to.id,
      amount: 20_000,
      transferredAt: '2026-02-01'
    });

    expect(first.number).toBe('VIR-2026-0001');
    expect(second.number).toBe('VIR-2026-0002');

    const lines = (postDocumentEntryTx.mock.calls[0] as any[])[1].lines;
    const totalDebit = lines.reduce((s: number, l: Row) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s: number, l: Row) => s + (l.credit ?? 0), 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(50_000);
  });

  it('refuse un virement entre deux comptes identiques', async () => {
    const account = addAccount();
    await expect(
      service.createTransfer(TENANT, 'user-1', {
        fromTreasuryAccountId: account.id,
        toTreasuryAccountId: account.id,
        amount: 1_000,
        transferredAt: '2026-01-01'
      })
    ).rejects.toThrow('différents');
  });

  it('contre-passe l’écriture à l’annulation', async () => {
    const from = addAccount({ accountNumber: '5711', kind: 'CASH' });
    const to = addAccount({ accountNumber: '5211', kind: 'BANK' });
    fund(from, 5_000);
    const transfer = await service.createTransfer(TENANT, 'user-1', {
      fromTreasuryAccountId: from.id,
      toTreasuryAccountId: to.id,
      amount: 1_000,
      transferredAt: '2026-01-01'
    });
    const voided = await service.voidTransfer(TENANT, 'user-2', transfer.id, { reason: 'Erreur de saisie' });
    expect(voided.status).toBe('VOIDED');
    expect(reverseDocumentEntryTx).toHaveBeenCalledTimes(1);

    await expect(service.voidTransfer(TENANT, 'user-2', transfer.id, { reason: 'Encore' })).rejects.toThrow(
      'déjà annulé'
    );
  });
});

describe('Versements DGI — refus au-delà du dû', () => {
  it('refuse un versement supérieur au montant dû', async () => {
    const treasury = addAccount({ accountNumber: '5711', kind: 'CASH' });
    store.rentWithholdings.push({ tenantId: TENANT, amount: 10_000 });

    await expect(
      service.createTaxRemittance(TENANT, 'user-1', {
        amount: 15_000,
        paidAt: '2026-01-31',
        periodLabel: 'Janvier 2026',
        treasuryAccountId: treasury.id
      })
    ).rejects.toThrow('dépasse le montant dû');
  });

  it('accepte un versement dans la limite du dû et numérote DGI-AAAA-NNNN', async () => {
    const treasury = addAccount({ accountNumber: '5711', kind: 'CASH' });
    fund(treasury, 50_000);
    store.rentWithholdings.push({ tenantId: TENANT, amount: 10_000 });

    const remittance = await service.createTaxRemittance(TENANT, 'user-1', {
      amount: 6_000,
      paidAt: '2026-01-31',
      periodLabel: 'Janvier 2026',
      treasuryAccountId: treasury.id
    });
    expect(remittance.number).toBe('DGI-2026-0001');

    const lines = (postDocumentEntryTx.mock.calls[0] as any[])[1].lines;
    const totalDebit = lines.reduce((s: number, l: Row) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s: number, l: Row) => s + (l.credit ?? 0), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it('calcule un résumé de retenue cohérent', async () => {
    const treasury = addAccount({ accountNumber: '5711', kind: 'CASH' });
    fund(treasury, 50_000);
    store.rentWithholdings.push({ tenantId: TENANT, amount: 10_000 });
    await service.createTaxRemittance(TENANT, 'user-1', {
      amount: 4_000,
      paidAt: '2026-01-31',
      periodLabel: 'Janvier 2026',
      treasuryAccountId: treasury.id
    });

    const summary = await service.getWithholdingSummary(TENANT);
    expect(summary.collected).toBe(10_000);
    expect(summary.remitted).toBe(4_000);
    expect(summary.due).toBe(6_000);
    expect(summary.accountNumber).toBe('4478');
  });
});

describe('Sorties de trésorerie — jamais de solde négatif (BUG-2026-09-29-003)', () => {
  const transferBody = (from: Row, to: Row, amount: number) => ({
    fromTreasuryAccountId: from.id,
    toTreasuryAccountId: to.id,
    amount,
    transferredAt: '2026-01-15'
  });
  const spaces = (text: string) => text.replace(/[\s\u00a0\u202f]/g, ' ');

  it('refuse un virement depuis un compte vide, sans rien écrire', async () => {
    const from = addAccount({ accountNumber: '55221', kind: 'MOBILE_MONEY', label: 'Orange Money OI Agence' });
    const to = addAccount({ accountNumber: '5711', kind: 'CASH', label: 'Caisse principale' });

    await expect(service.createTransfer(TENANT, 'user-1', transferBody(from, to, 20_000))).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Solde insuffisant')
    });
    expect(store.treasuryTransfers).toHaveLength(0);
    expect(postDocumentEntryTx).not.toHaveBeenCalled();
  });

  it('le message nomme le compte, le solde disponible et le montant demandé', async () => {
    const from = addAccount({ accountNumber: '5711', kind: 'CASH', label: 'Caisse principale' });
    const to = addAccount({ accountNumber: '5211', kind: 'BANK', label: 'Banque' });
    fund(from, 6_000);

    const erreur = await service
      .createTransfer(TENANT, 'user-1', transferBody(from, to, 20_000))
      .catch((e: Error) => e);
    expect(erreur.message).toContain('Caisse principale');
    expect(spaces(erreur.message)).toContain('6 000 FCFA disponibles');
    expect(spaces(erreur.message)).toContain('20 000 FCFA demandés');
  });

  it('refuse un virement depuis un compte déjà négatif', async () => {
    const from = addAccount({ accountNumber: '5711', kind: 'CASH' });
    const to = addAccount({ accountNumber: '5211', kind: 'BANK' });
    store.journalEntryLines.push({ accountId: from.chartOfAccountId, debit: 0, credit: 6_000 });
    await expect(service.createTransfer(TENANT, 'user-1', transferBody(from, to, 1))).rejects.toMatchObject({
      status: 400
    });
  });

  it('accepte un virement qui vide exactement le compte (solde final nul)', async () => {
    const from = addAccount({ accountNumber: '5711', kind: 'CASH' });
    const to = addAccount({ accountNumber: '5211', kind: 'BANK' });
    fund(from, 20_000);
    await expect(service.createTransfer(TENANT, 'user-1', transferBody(from, to, 20_000))).resolves.toMatchObject({
      amount: 20_000
    });
  });

  it('prend le verrou du compte AVANT de lire le solde, dans la même transaction', async () => {
    const from = addAccount({ accountNumber: '5711', kind: 'CASH' });
    const to = addAccount({ accountNumber: '5211', kind: 'BANK' });
    fund(from, 20_000);
    mockPrisma.$executeRaw.mockClear();
    mockPrisma.journalEntryLine.aggregate.mockClear();
    await service.createTransfer(TENANT, 'user-1', transferBody(from, to, 5_000));
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.journalEntryLine.aggregate.mock.invocationCallOrder[0]
    );
  });

  it('refuse un versement DGI que la caisse ne peut pas couvrir', async () => {
    const treasury = addAccount({ accountNumber: '5711', kind: 'CASH', label: 'Caisse principale' });
    fund(treasury, 2_000);
    store.rentWithholdings.push({ tenantId: TENANT, amount: 10_000 });
    await expect(
      service.createTaxRemittance(TENANT, 'user-1', {
        amount: 6_000,
        paidAt: '2026-01-31',
        periodLabel: 'Janvier 2026',
        treasuryAccountId: treasury.id
      })
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Solde insuffisant') });
    expect(store.taxRemittances).toHaveLength(0);
  });
});

// Module, pas script : sans cela ses declarations entrent en collision avec
// celles des autres fichiers de test sous ts-jest.
export {};
