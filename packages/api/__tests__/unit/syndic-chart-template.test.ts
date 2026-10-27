import { SYNDIC_ACCOUNT_SEEDS } from '../../src/lib/syndics/provider-invoice-accounting';
import { SYNDIC_CHART_TEMPLATE, ensureSyndicChartTemplateTx } from '../../src/lib/syndics/syndic-chart-template';

type Row = {
  id: string;
  tenantId: string;
  syndicateId: string;
  accountNumber: string;
  accountName: string;
  parentAccountId: string | null;
};

function makeTx(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  let seq = 0;
  const findMany = jest.fn(async ({ where }: any) =>
    rows
      .filter(r => r.tenantId === where.tenantId && r.syndicateId === where.syndicateId)
      .map(r => ({ id: r.id, accountNumber: r.accountNumber }))
  );
  const create = jest.fn(async ({ data }: any) => {
    const row: Row = { id: `new-${++seq}`, parentAccountId: null, ...data };
    rows.push(row);
    return { id: row.id };
  });
  const order: string[] = [];
  const executeRaw = jest.fn(async (..._args: any[]) => {
    order.push('lock');
    return 1;
  });
  findMany.mockImplementationOnce(async ({ where }: any) => {
    order.push('read');
    return rows
      .filter(r => r.tenantId === where.tenantId && r.syndicateId === where.syndicateId)
      .map(r => ({ id: r.id, accountNumber: r.accountNumber }));
  });
  return {
    tx: { chartOfAccount: { findMany, create }, $executeRaw: executeRaw } as any,
    rows,
    findMany,
    create,
    executeRaw,
    order
  };
}

describe('SYNDIC_CHART_TEMPLATE', () => {
  it('a des numéros uniques et une taille raisonnable', () => {
    const numbers = SYNDIC_CHART_TEMPLATE.map(a => a.accountNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.length).toBeGreaterThanOrEqual(50);
    expect(numbers.length).toBeLessThanOrEqual(90);
  });

  it('place chaque parent avant ses enfants', () => {
    const seen = new Set<string>();
    for (const a of SYNDIC_CHART_TEMPLATE) {
      if (a.parent) expect(seen.has(a.parent)).toBe(true);
      seen.add(a.accountNumber);
    }
  });

  it('a une classe cohérente avec le numéro', () => {
    for (const a of SYNDIC_CHART_TEMPLATE) expect(a.accountClass).toBe(Number(a.accountNumber[0]));
  });

  it('inclut chaque SYNDIC_ACCOUNT_SEEDS à l’identique', () => {
    for (const seed of SYNDIC_ACCOUNT_SEEDS) {
      const found = SYNDIC_CHART_TEMPLATE.find(a => a.accountNumber === seed.accountNumber);
      expect(found).toBeDefined();
      expect(found).toMatchObject({
        accountName: seed.accountName,
        accountClass: seed.accountClass,
        accountType: seed.accountType
      });
      if (seed.parent) expect(found!.parent).toBe(seed.parent);
    }
  });
});

describe('ensureSyndicChartTemplateTx', () => {
  it('crée tout au premier appel, rien au second', async () => {
    const { tx, rows, create } = makeTx();
    const first = await ensureSyndicChartTemplateTx(tx, 't1', 's1');
    expect(first).toEqual({ created: SYNDIC_CHART_TEMPLATE.length, skipped: 0, total: SYNDIC_CHART_TEMPLATE.length });
    create.mockClear();
    const second = await ensureSyndicChartTemplateTx(tx, 't1', 's1');
    expect(second).toEqual({ created: 0, skipped: SYNDIC_CHART_TEMPLATE.length, total: SYNDIC_CHART_TEMPLATE.length });
    expect(create).not.toHaveBeenCalled();
    expect(new Set(rows.map(r => r.accountNumber)).size).toBe(rows.length);
  });

  it('résout parentAccountId, y compris vers un parent déjà existant, sans modifier l’existant', async () => {
    const existing: Row = {
      id: 'old-401',
      tenantId: 't1',
      syndicateId: 's1',
      accountNumber: '401',
      accountName: 'Nom personnalisé',
      parentAccountId: null
    };
    const other: Row = { ...existing, id: 'other', tenantId: 't2', accountNumber: '40' };
    const { tx, rows, create } = makeTx([existing, other]);
    const result = await ensureSyndicChartTemplateTx(tx, 't1', 's1');
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(SYNDIC_CHART_TEMPLATE.length - 1);
    expect(rows.find(r => r.id === 'old-401')).toMatchObject({
      accountName: 'Nom personnalisé',
      parentAccountId: null
    });
    expect(create.mock.calls.every(([arg]: any) => arg.data.accountNumber !== '401')).toBe(true);
    const byNumber = new Map(rows.filter(r => r.tenantId === 't1').map(r => [r.accountNumber, r]));
    expect(byNumber.get('6241')!.parentAccountId).toBe(byNumber.get('624')!.id);
    expect(byNumber.get('5525')!.parentAccountId).toBe(byNumber.get('552')!.id);
    // le compte 40 d'une autre agence n'est ni lu ni réutilisé
    expect(byNumber.get('40')!.id).not.toBe('other');
  });

  it('filtre par tenantId ET syndicateId et crée en portée SYNDICATE', async () => {
    const { tx, findMany, create } = makeTx();
    await ensureSyndicChartTemplateTx(tx, 't1', 's1');
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', syndicateId: 's1' });
    for (const [arg] of create.mock.calls as any[]) {
      expect(arg.data).toMatchObject({ tenantId: 't1', syndicateId: 's1', scope: 'SYNDICATE' });
    }
  });
});
