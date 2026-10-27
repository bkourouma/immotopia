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
  outflowKindsForMethod,
  resolveOutflowTreasuryAccountTx,
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

describe('resolveOutflowTreasuryAccountTx — d’où sort un règlement fournisseur (BUG-2026-09-29-002)', () => {
  const agence = [
    { kind: 'CASH', accountNumber: '5711', label: 'Caisse principale', isDefault: true },
    { kind: 'BANK', accountNumber: '5211', label: 'Banque principale', isDefault: true },
    { kind: 'BANK', accountNumber: '52112', label: 'Ecobank', isDefault: false },
    { kind: 'MOBILE_MONEY', accountNumber: '5522', label: 'Orange Money', isDefault: true, mmOperator: 'ORANGE' },
    { kind: 'CHECKS_TO_CASH', accountNumber: '513', label: 'Chèques à encaisser', isDefault: true }
  ];

  it.each([
    ['CASH', ['CASH']],
    ['BANK_TRANSFER', ['BANK']],
    ['CHECK', ['BANK']],
    ['CARD', ['BANK']],
    ['MOBILE_MONEY', ['MOBILE_MONEY']],
    ['OTHER', ['CASH', 'BANK', 'MOBILE_MONEY']]
  ])('%s sort de %j', (method, kinds) => {
    expect(outflowKindsForMethod(method)).toEqual(kinds);
  });

  it.each([
    ['BANK_TRANSFER', '5211'],
    ['CHECK', '5211'],
    ['CASH', '5711'],
    ['MOBILE_MONEY', '5522']
  ])(
    'sans compte désigné, un règlement en %s sort du compte %s, pas de la caisse par défaut',
    async (method, number) => {
      const tx = fakeTx({ treasury: agence });
      const resolved = await resolveOutflowTreasuryAccountTx(tx, 'tenant-1', { method });
      expect(resolved.accountNumber).toBe(number);
    }
  );

  it('prend le compte désigné quand il correspond au mode (une seconde banque)', async () => {
    const tx = fakeTx({ treasury: agence });
    const ecobank = tx.treasury.find((r: any) => r.accountNumber === '52112')!;
    const resolved = await resolveOutflowTreasuryAccountTx(tx, 'tenant-1', {
      method: 'BANK_TRANSFER',
      treasuryAccountId: ecobank.id
    });
    expect(resolved).toMatchObject({ accountNumber: '52112', journal: 'BANK' });
  });

  it('refuse la caisse pour un virement, et la banque pour des espèces', async () => {
    const tx = fakeTx({ treasury: agence });
    const caisse = tx.treasury.find((r: any) => r.kind === 'CASH')!;
    const banque = tx.treasury.find((r: any) => r.accountNumber === '5211')!;
    await expect(
      resolveOutflowTreasuryAccountTx(tx, 'tenant-1', { method: 'BANK_TRANSFER', treasuryAccountId: caisse.id })
    ).rejects.toThrow('ne correspond pas au mode de règlement');
    await expect(
      resolveOutflowTreasuryAccountTx(tx, 'tenant-1', { method: 'CASH', treasuryAccountId: banque.id })
    ).rejects.toThrow('ne correspond pas au mode de règlement');
  });

  it('un chèque émis ne sort pas des « chèques à encaisser »', async () => {
    const tx = fakeTx({ treasury: agence });
    const cheques = tx.treasury.find((r: any) => r.kind === 'CHECKS_TO_CASH')!;
    await expect(
      resolveOutflowTreasuryAccountTx(tx, 'tenant-1', { method: 'CHECK', treasuryAccountId: cheques.id })
    ).rejects.toThrow('ne correspond pas au mode de règlement');
  });

  it('refuse un compte désactivé et un compte d’une autre agence', async () => {
    const tx = fakeTx({
      treasury: [
        { kind: 'CASH', isActive: false },
        { kind: 'CASH', tenantId: 'autre' }
      ]
    });
    await expect(
      resolveOutflowTreasuryAccountTx(tx, 'tenant-1', { method: 'CASH', treasuryAccountId: 't0' })
    ).rejects.toThrow('désactivé');
    await expect(
      resolveOutflowTreasuryAccountTx(tx, 'tenant-1', { method: 'CASH', treasuryAccountId: 't1' })
    ).rejects.toThrow('Compte de trésorerie introuvable');
  });
});

// Module, pas script : sans cela ses declarations entrent en collision avec
// celles des autres fichiers de test sous ts-jest.
export {};
