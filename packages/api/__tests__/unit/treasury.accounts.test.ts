/**
 * Résolution du compte de trésorerie d'une pièce — lot 10.
 *
 * Trois règles qu'une erreur suffirait à casser en silence : chaque moyen de
 * paiement a sa nature de compte, un compte désigné doit correspondre au moyen,
 * et une agence dont la caisse 571 porte déjà des écritures la garde.
 */

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  allowedKindsForMethod,
  defaultKindForMethod,
  ensureDefaultTreasuryAccountTx,
  resolveTreasuryAccountTx
} = require('../../src/lib/treasury/accounts');

interface Row {
  id: string;
  tenantId: string;
  kind: string;
  label: string;
  accountNumber: string;
  chartOfAccountId: string;
  mmOperator: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
}

function fakeTx(options: { treasury?: Partial<Row>[]; chart?: string[]; chartWithLines?: string[] } = {}) {
  const treasury: Row[] = (options.treasury ?? []).map((row, index) => ({
    id: `t${index}`,
    tenantId: 'tenant-1',
    kind: 'CASH',
    label: 'Caisse',
    accountNumber: '5711',
    chartOfAccountId: `c${index}`,
    mmOperator: null,
    isDefault: true,
    isActive: true,
    createdAt: new Date(2026, 0, index + 1),
    ...row
  }));
  const chart = new Map((options.chart ?? []).map(n => [n, { id: `coa-${n}`, accountName: `Compte ${n}` }]));
  const withLines = new Set(options.chartWithLines ?? []);
  const matches = (row: Row, where: any) => Object.entries(where).every(([key, value]) => (row as any)[key] === value);

  return {
    treasury,
    treasuryAccount: {
      findFirst: jest.fn(async ({ where }: any) => {
        const found = treasury.filter(row => matches(row, where));
        found.sort(
          (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime()
        );
        return found[0] ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row: Row = { id: `new-${data.accountNumber}`, createdAt: new Date(), isActive: true, ...data };
        treasury.push(row);
        return row;
      })
    },
    chartOfAccount: {
      findFirst: jest.fn(async ({ where }: any) => chart.get(where.accountNumber) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: `coa-${data.accountNumber}`, accountName: data.accountName };
        chart.set(data.accountNumber, created);
        return created;
      })
    },
    journalEntryLine: {
      findFirst: jest.fn(async ({ where }: any) => {
        const number = Array.from(chart.entries()).find(([, v]) => v.id === where.accountId)?.[0];
        return number && withLines.has(number) ? { id: 'line' } : null;
      })
    }
  };
}

describe('natures de compte par moyen de paiement', () => {
  it.each([
    ['CASH', 'CASH'],
    ['BANK_TRANSFER', 'BANK'],
    ['MOBILE_MONEY', 'MOBILE_MONEY'],
    ['CHECK', 'CHECKS_TO_CASH'],
    ['CARD', 'CARDS_TO_CASH'],
    ['OTHER', 'BANK']
  ])('%s va par défaut en %s', (method, kind) => {
    expect(defaultKindForMethod(method)).toBe(kind);
  });

  it('accepte qu’un chèque soit remis directement en banque, pas en caisse', () => {
    expect(allowedKindsForMethod('CHECK')).toEqual(['CHECKS_TO_CASH', 'BANK']);
  });
});

describe('ensureDefaultTreasuryAccountTx', () => {
  it('ouvre 5711 « Caisse principale » dans une agence neuve', async () => {
    const tx = fakeTx();
    const resolved = await ensureDefaultTreasuryAccountTx(tx, 'tenant-1', 'CASH');
    expect(resolved).toMatchObject({ accountNumber: '5711', kind: 'CASH', journal: 'CASH' });
    expect(tx.treasury[0]).toMatchObject({ isDefault: true, label: 'Caisse principale' });
  });

  it('garde la caisse 571 quand elle porte déjà des écritures', async () => {
    const tx = fakeTx({ chart: ['571'], chartWithLines: ['571'] });
    const resolved = await ensureDefaultTreasuryAccountTx(tx, 'tenant-1', 'CASH');
    expect(resolved.accountNumber).toBe('571');
    expect(resolved.chartOfAccountId).toBe('coa-571');
  });

  it('ignore un 571 vierge et ouvre 5711', async () => {
    const tx = fakeTx({ chart: ['571'] });
    const resolved = await ensureDefaultTreasuryAccountTx(tx, 'tenant-1', 'CASH');
    expect(resolved.accountNumber).toBe('5711');
  });

  it('ouvre un portefeuille Mobile Money par opérateur, en classe 55', async () => {
    const tx = fakeTx();
    const wave = await ensureDefaultTreasuryAccountTx(tx, 'tenant-1', 'MOBILE_MONEY', 'WAVE');
    const orange = await ensureDefaultTreasuryAccountTx(tx, 'tenant-1', 'MOBILE_MONEY', 'ORANGE');
    expect(wave).toMatchObject({ accountNumber: '5521', journal: 'BANK' });
    expect(orange.accountNumber).toBe('5522');
  });

  it('prend le compte par défaut que l’agence a configuré', async () => {
    const tx = fakeTx({
      treasury: [
        { kind: 'BANK', accountNumber: '52111', label: 'SGBCI', isDefault: false },
        { kind: 'BANK', accountNumber: '52112', label: 'Ecobank', isDefault: true }
      ]
    });
    const resolved = await ensureDefaultTreasuryAccountTx(tx, 'tenant-1', 'BANK');
    expect(resolved.accountNumber).toBe('52112');
  });
});

describe('resolveTreasuryAccountTx', () => {
  it('refuse une caisse pour un virement bancaire', async () => {
    const tx = fakeTx({ treasury: [{ kind: 'CASH' }] });
    await expect(
      resolveTreasuryAccountTx(tx, 'tenant-1', { method: 'BANK_TRANSFER', treasuryAccountId: 't0' })
    ).rejects.toThrow('ne correspond pas au moyen de paiement');
  });

  it('refuse un compte d’une autre agence', async () => {
    const tx = fakeTx({ treasury: [{ tenantId: 'autre' }] });
    await expect(resolveTreasuryAccountTx(tx, 'tenant-1', { method: 'CASH', treasuryAccountId: 't0' })).rejects.toThrow(
      'Compte de trésorerie introuvable'
    );
  });
});
