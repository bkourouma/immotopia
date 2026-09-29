/**
 * Tests du service des scénarios enregistrés (lot 3). Prisma est remplacé par un
 * magasin en mémoire qui applique l'unicité (tenantId, name) comme PostgreSQL.
 */
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SCENARIO_MISSING = '99999999-9999-4999-8999-999999999999';
const ASSET = '11111111-1111-4111-8111-111111111111';

const store = { patrimonyScenario: [] as Row[], asset: [] as Row[], propertyLoan: [] as Row[] };
/** Journal des appels qui doivent se faire DANS la transaction, dans l'ordre. */
const txLog: string[] = [];
let seq = 0;

const known = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });
const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Row[]).some(clause => matches(row, clause));
    return value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value;
  });

const scenarioDelegate = {
  findFirst: jest.fn(async ({ where }: Row) => {
    const found = store.patrimonyScenario.find(r => matches(r, where));
    return found ? { ...found } : null;
  }),
  findMany: jest.fn(async ({ where }: Row) =>
    store.patrimonyScenario
      .filter(r => matches(r, where))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(r => ({ ...r }))
  ),
  count: jest.fn(async ({ where }: Row) => store.patrimonyScenario.filter(r => matches(r, where)).length),
  create: jest.fn(async ({ data }: Row) => {
    if (store.patrimonyScenario.some(r => r.tenantId === data.tenantId && r.name === data.name)) throw known('P2002');
    seq += 1;
    const row = {
      id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      schemaVersion: 1,
      createdAt: new Date(2026, 0, seq),
      updatedAt: new Date(2026, 0, seq),
      ...data
    };
    store.patrimonyScenario.push(row);
    return { ...row };
  }),
  update: jest.fn(async ({ where, data }: Row) => {
    const row = store.patrimonyScenario.find(r => matches(r, where));
    if (!row) throw known('P2025');
    if (
      data.name &&
      store.patrimonyScenario.some(r => r !== row && r.tenantId === row.tenantId && r.name === data.name)
    )
      throw known('P2002');
    Object.assign(row, data, { updatedAt: new Date() });
    return { ...row };
  }),
  delete: jest.fn(async ({ where }: Row) => {
    const index = store.patrimonyScenario.findIndex(r => matches(r, where));
    if (index < 0) throw known('P2025');
    return store.patrimonyScenario.splice(index, 1)[0];
  })
};

const prismaMock: Row = {
  patrimonyScenario: scenarioDelegate,
  asset: { findMany: jest.fn(async ({ where }: Row) => store.asset.filter(r => matches(r, where))) },
  assetValuation: { findMany: jest.fn(async () => []) },
  propertyLoan: { findMany: jest.fn(async ({ where }: Row) => store.propertyLoan.filter(r => matches(r, where))) },
  $transaction: jest.fn()
};
// Transaction interactive : le verrou, le comptage et la création passent tous par `tx`.
const tx: Row = {
  $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    txLog.push(`lock:${strings.join('?')}:${values.join(',')}`);
    return 0;
  }),
  patrimonyScenario: {
    count: jest.fn(async (args: Row) => {
      txLog.push('count');
      return scenarioDelegate.count(args);
    }),
    create: jest.fn(async (args: Row) => {
      txLog.push('create');
      return scenarioDelegate.create(args);
    })
  }
};
prismaMock.$transaction.mockImplementation(async (callback: (client: Row) => Promise<unknown>) => callback(tx));

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
const mockAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (entry: unknown) => mockAudit(entry) }));

import {
  MAX_SCENARIOS_PER_TENANT,
  createScenario,
  deleteScenario,
  getScenario,
  listScenarios,
  runScenario,
  updateScenario
} from '../../src/services/patrimoine-projections/scenario-service';

const body = (name: string, extra: Row = {}) => ({
  name,
  horizonYears: 10,
  baseScenario: 'CENTRAL' as const,
  ...extra
});

function seedAsset(row: Row): Row {
  const asset = {
    tenantId: TENANT_A,
    name: 'Villa',
    assetClass: 'REAL_ESTATE',
    status: 'ACTIVE',
    currency: 'XOF',
    exchangeRateToXof: null,
    disposedAt: null,
    propertyId: null,
    details: {},
    ...row
  };
  store.asset.push(asset);
  return asset;
}

beforeEach(() => {
  store.patrimonyScenario = [];
  store.asset = [];
  store.propertyLoan = [];
  txLog.length = 0;
  prismaMock.$transaction.mockClear();
  prismaMock.asset.findMany.mockClear();
  seq = 0;
  mockAudit.mockClear();
  Object.values(scenarioDelegate).forEach(fn => fn.mockClear());
});

describe('CRUD', () => {
  it('crée, lit, liste (récents d’abord), modifie et supprime', async () => {
    const created = await createScenario(TENANT_A, body('Plan A', { assumptions: { inflationPercent: 5 } }), 'user-1');
    expect(created).toMatchObject({
      name: 'Plan A',
      horizonYears: 10,
      baseScenario: 'CENTRAL',
      assumptions: { inflationPercent: 5 },
      operations: []
    });
    await createScenario(TENANT_A, body('Plan B'));
    expect((await listScenarios(TENANT_A)).map(s => s.name)).toEqual(['Plan B', 'Plan A']);
    expect(await getScenario(TENANT_A, created.id)).toEqual(created);
    const updated = await updateScenario(TENANT_A, created.id, { name: 'Plan A2', horizonYears: 15 });
    expect(updated).toMatchObject({ name: 'Plan A2', horizonYears: 15, baseScenario: 'CENTRAL' });
    await deleteScenario(TENANT_A, created.id);
    await expect(getScenario(TENANT_A, created.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('n’expose aucun champ interne', async () => {
    const created = await createScenario(TENANT_A, body('Plan A'), 'user-1');
    expect(Object.keys(created).sort()).toEqual(
      ['assumptions', 'baseScenario', 'createdAt', 'horizonYears', 'id', 'name', 'operations', 'updatedAt'].sort()
    );
    expect(store.patrimonyScenario[0].createdByUserId).toBe('user-1');
    const select = scenarioDelegate.create.mock.calls[0][0].select;
    expect(select.schemaVersion).toBeUndefined();
    expect(select.createdByUserId).toBeUndefined();
  });

  it('tout where porte le tenantId, y compris update et delete', async () => {
    const created = await createScenario(TENANT_A, body('Plan A'));
    await getScenario(TENANT_A, created.id);
    await listScenarios(TENANT_A);
    await updateScenario(TENANT_A, created.id, { name: 'Autre' });
    await deleteScenario(TENANT_A, created.id);
    for (const fn of [scenarioDelegate.findFirst, scenarioDelegate.findMany, scenarioDelegate.count]) {
      for (const [args] of fn.mock.calls) expect(args.where.tenantId).toBe(TENANT_A);
    }
    expect(scenarioDelegate.update.mock.calls[0][0].where).toEqual({ id: created.id, tenantId: TENANT_A });
    expect(scenarioDelegate.delete.mock.calls[0][0].where).toEqual({ id: created.id, tenantId: TENANT_A });
  });

  it('un scénario d’une autre agence est introuvable, comme un identifiant inexistant', async () => {
    const other = await createScenario(TENANT_B, body('Secret'));
    const attempts = [
      (id: string) => getScenario(TENANT_A, id),
      (id: string) => updateScenario(TENANT_A, id, { name: 'X' }),
      (id: string) => deleteScenario(TENANT_A, id),
      (id: string) => runScenario(TENANT_A, id)
    ];
    for (const attempt of attempts) {
      const foreign = await attempt(other.id).catch(error => ({ status: error.statusCode, message: error.message }));
      const missing = await attempt(SCENARIO_MISSING).catch(error => ({
        status: error.statusCode,
        message: error.message
      }));
      expect(foreign).toEqual({ status: 404, message: 'Scénario introuvable.' });
      expect(foreign).toEqual(missing);
    }
    expect(store.patrimonyScenario).toHaveLength(1);
    expect(await listScenarios(TENANT_A)).toEqual([]);
  });

  it('refuse un nom déjà pris (409) à la création et à la modification, jamais un 500', async () => {
    await createScenario(TENANT_A, body('Plan A'));
    const second = await createScenario(TENANT_A, body('Plan B'));
    await expect(createScenario(TENANT_A, body('Plan A'))).rejects.toMatchObject({ statusCode: 409 });
    await expect(updateScenario(TENANT_A, second.id, { name: 'Plan A' })).rejects.toMatchObject({ statusCode: 409 });
    // Le même nom dans une autre agence est permis.
    await expect(createScenario(TENANT_B, body('Plan A'))).resolves.toMatchObject({ name: 'Plan A' });
  });

  it('plafonne à 100 scénarios par agence (409)', async () => {
    expect(MAX_SCENARIOS_PER_TENANT).toBe(100);
    for (let i = 0; i < MAX_SCENARIOS_PER_TENANT; i += 1) {
      store.patrimonyScenario.push({
        id: `s-${i}`,
        tenantId: TENANT_A,
        name: `N${i}`,
        horizonYears: 5,
        baseScenario: 'CENTRAL',
        assumptions: {},
        operations: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    await expect(createScenario(TENANT_A, body('Un de trop'))).rejects.toMatchObject({ statusCode: 409 });
    await expect(createScenario(TENANT_B, body('Autre agence'))).resolves.toBeDefined();
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it('refuse un PATCH vide (400) et un horizon plus court que les opérations enregistrées (422)', async () => {
    const created = await createScenario(
      TENANT_A,
      body('Plan A', { operations: [{ type: 'MONTHLY_SAVING', fromYear: 8, amount: 1000 }] })
    );
    await expect(updateScenario(TENANT_A, created.id, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateScenario(TENANT_A, created.id, { horizonYears: 5 })).rejects.toMatchObject({
      statusCode: 422,
      errors: [{ field: 'operations.0.fromYear', message: expect.any(String) }]
    });
    expect(store.patrimonyScenario[0].horizonYears).toBe(10);
  });
});

describe('audit', () => {
  it('audite les trois écritures : identifiants et noms de champs, jamais de montant ni de nom saisi', async () => {
    const created = await createScenario(
      TENANT_A,
      body('Nom confidentiel', {
        operations: [{ type: 'BUY_ASSET', year: 1, assetClass: 'REAL_ESTATE', name: 'Villa secrète', price: 123456789 }]
      }),
      'user-1'
    );
    await updateScenario(TENANT_A, created.id, { name: 'Autre nom confidentiel', horizonYears: 12 }, 'user-1');
    await deleteScenario(TENANT_A, created.id, 'user-1');

    expect(mockAudit.mock.calls.map(([entry]) => entry)).toEqual([
      expect.objectContaining({
        actionKey: 'PATRIMOINE_SCENARIO_CREATED',
        tenantId: TENANT_A,
        actorUserId: 'user-1',
        entityType: 'PatrimonyScenario',
        entityId: created.id,
        payload: { baseScenario: 'CENTRAL' }
      }),
      expect.objectContaining({
        actionKey: 'PATRIMOINE_SCENARIO_UPDATED',
        entityId: created.id,
        payload: { changedFields: ['horizonYears', 'name'] }
      }),
      expect.objectContaining({ actionKey: 'PATRIMOINE_SCENARIO_DELETED', entityId: created.id, payload: null })
    ]);
    const serialized = JSON.stringify(mockAudit.mock.calls);
    expect(serialized).not.toMatch(/confidentiel|secrète|123456789/);
  });

  it('un refus n’émet aucun audit', async () => {
    const created = await createScenario(TENANT_A, body('Plan A'));
    mockAudit.mockClear();
    await createScenario(TENANT_A, body('Plan A')).catch(() => undefined);
    await updateScenario(TENANT_A, SCENARIO_MISSING, { name: 'X' }).catch(() => undefined);
    await updateScenario(TENANT_A, created.id, {}).catch(() => undefined);
    await deleteScenario(TENANT_A, SCENARIO_MISSING).catch(() => undefined);
    await deleteScenario(TENANT_B, created.id).catch(() => undefined);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe('exécution (run) et JSON corrompu', () => {
  it('recharge le patrimoine et rend une référence disparue en OPERATION_NOT_APPLICABLE', async () => {
    seedAsset({ id: ASSET });
    const created = await createScenario(
      TENANT_A,
      body('Vente', { operations: [{ type: 'SELL_ASSET', year: 1, assetId: ASSET }] })
    );
    store.asset = []; // l'actif disparaît après l'enregistrement
    const result = await runScenario(TENANT_A, created.id, { compareScenarios: true });
    expect(result.base.points).toHaveLength(11);
    expect(result.simulated?.warnings).toContainEqual({
      code: 'OPERATION_NOT_APPLICABLE',
      index: 0,
      reason: 'ASSET_NOT_FOUND'
    });
    expect(Object.keys(result.byScenario ?? {}).sort()).toEqual(['CENTRAL', 'OPTIMISTIC', 'PRUDENT']);
    expect(mockAudit).toHaveBeenCalledTimes(1); // la seule création : run n'écrit ni n'audite
  });

  it('un actif désormais archivé devient ASSET_NOT_ACTIVE (avertissement)', async () => {
    seedAsset({ id: ASSET, status: 'ARCHIVED' });
    const created = await createScenario(
      TENANT_A,
      body('Vente', { operations: [{ type: 'SELL_ASSET', year: 1, assetId: ASSET }] })
    );
    const result = await runScenario(TENANT_A, created.id);
    expect(result.simulated?.warnings).toContainEqual({
      code: 'OPERATION_NOT_APPLICABLE',
      index: 0,
      reason: 'ASSET_NOT_ACTIVE'
    });
  });

  it('un JSON corrompu : run répond 422 explicite, la liste et la lecture renvoient le lisible', async () => {
    const good = await createScenario(TENANT_A, body('Sain'));
    store.patrimonyScenario.push({
      id: '00000000-0000-4000-8000-0000000000aa',
      tenantId: TENANT_A,
      name: 'Corrompu',
      horizonYears: 10,
      baseScenario: 'CENTRAL',
      assumptions: { inflationPercent: 'beaucoup', extra: true },
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 100 }, { type: 'INCONNU' }, 'n’importe quoi'],
      schemaVersion: 1,
      createdAt: new Date(2027, 0, 1),
      updatedAt: new Date(2027, 0, 1)
    });
    store.patrimonyScenario.push({
      id: '00000000-0000-4000-8000-0000000000ab',
      tenantId: TENANT_A,
      name: 'Pas un tableau',
      horizonYears: 10,
      baseScenario: 'CENTRAL',
      assumptions: 'abc',
      operations: { not: 'an array' },
      schemaVersion: 1,
      createdAt: new Date(2027, 0, 2),
      updatedAt: new Date(2027, 0, 2)
    });

    const list = await listScenarios(TENANT_A);
    expect(list).toHaveLength(3);
    const corrupt = list.find(s => s.name === 'Corrompu');
    expect(corrupt).toMatchObject({
      assumptions: {},
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 100 }]
    });
    expect(list.find(s => s.name === 'Pas un tableau')).toMatchObject({ assumptions: {}, operations: [] });
    expect(list.find(s => s.id === good.id)).toBeDefined();

    const failure = await runScenario(TENANT_A, '00000000-0000-4000-8000-0000000000aa').catch(error => error);
    expect(failure.statusCode).toBe(422);
    expect(failure.errors.length).toBeGreaterThan(0);
    expect(failure.errors.every((e: Row) => typeof e.field === 'string' && typeof e.message === 'string')).toBe(true);
    const notArray = await runScenario(TENANT_A, '00000000-0000-4000-8000-0000000000ab').catch(error => error);
    expect(notArray.statusCode).toBe(422);
  });
});

describe('plafond sous verrou consultatif', () => {
  it('prend le verrou (par agence) avant le comptage, puis crée, dans la même transaction', async () => {
    await createScenario(TENANT_A, body('Plan A'));
    expect(txLog).toEqual([`lock:SELECT pg_advisory_xact_lock(hashtext(?)):${TENANT_A}`, 'count', 'create']);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('un refus pour plafond atteint se fait sous verrou et ne crée rien', async () => {
    for (let i = 0; i < MAX_SCENARIOS_PER_TENANT; i += 1) {
      store.patrimonyScenario.push({ id: `s-${i}`, tenantId: TENANT_A, name: `N${i}` });
    }
    await expect(createScenario(TENANT_A, body('Un de trop'))).rejects.toMatchObject({ statusCode: 409 });
    expect(txLog).toEqual([expect.stringMatching(/^lock:/), 'count']);
    expect(store.patrimonyScenario).toHaveLength(MAX_SCENARIOS_PER_TENANT);
  });
});

describe('références vérifiées à l’enregistrement', () => {
  const LOAN_A = '22222222-2222-4222-8222-222222222222';
  const LOAN_B = '33333333-3333-4333-8333-333333333333';
  const ASSET_B = '44444444-4444-4444-8444-444444444444';
  const MISSING = '55555555-5555-4555-8555-555555555555';

  const attempt = (operations: Row[], run = createScenario) =>
    run(TENANT_A, body('Plan', { operations }) as any).then(
      () => null,
      (error: any) => ({ status: error.statusCode, message: error.message, errors: error.errors })
    );

  beforeEach(() => {
    seedAsset({ id: ASSET });
    seedAsset({ id: ASSET_B, tenantId: TENANT_B });
    store.propertyLoan.push({ id: LOAN_A, tenantId: TENANT_A }, { id: LOAN_B, tenantId: TENANT_B });
  });

  it('accepte les actifs et dettes de l’agence', async () => {
    await expect(
      createScenario(
        TENANT_A,
        body('Plan', {
          operations: [
            { type: 'SELL_ASSET', year: 1, assetId: ASSET },
            { type: 'PREPAY_LOAN', year: 2, loanId: LOAN_A, amount: 1 }
          ]
        })
      )
    ).resolves.toMatchObject({ name: 'Plan' });
  });

  it('un actif d’une autre agence donne EXACTEMENT la même réponse qu’un actif inexistant', async () => {
    const foreign = await attempt([{ type: 'SELL_ASSET', year: 1, assetId: ASSET_B }]);
    const missing = await attempt([{ type: 'SELL_ASSET', year: 1, assetId: MISSING }]);
    expect(foreign).toEqual({
      status: 422,
      message: expect.any(String),
      errors: [{ field: 'operations.0.assetId', message: 'Actif introuvable' }]
    });
    expect(foreign).toEqual(missing);
    expect(store.patrimonyScenario).toHaveLength(0);
  });

  it('une dette d’une autre agence donne la même réponse qu’une dette inexistante', async () => {
    const ops = (loanId: string) => [
      { type: 'MONTHLY_SAVING', fromYear: 1, amount: 1 },
      { type: 'PREPAY_LOAN', year: 1, loanId, amount: 1 }
    ];
    const foreign = await attempt(ops(LOAN_B));
    const missing = await attempt(ops(MISSING));
    expect(foreign?.errors).toEqual([{ field: 'operations.1.loanId', message: 'Dette introuvable' }]);
    expect(foreign).toEqual(missing);
  });

  it('un identifiant qui n’est pas un UUID est refusé sans requête invalide', async () => {
    const result = await attempt([{ type: 'SELL_ASSET', year: 1, assetId: 'pas-un-uuid' }]);
    expect(result?.errors).toEqual([{ field: 'operations.0.assetId', message: 'Actif introuvable' }]);
  });

  it('une dette synthétique sim-loan-<i> visant un TAKE_LOAN de la liste reste valide', async () => {
    const takeLoan = { type: 'TAKE_LOAN', year: 1, amount: 1000, annualRatePercent: 0, termYears: 5 };
    await expect(
      createScenario(
        TENANT_A,
        body('Plan', { operations: [takeLoan, { type: 'PREPAY_LOAN', year: 2, loanId: 'sim-loan-0', amount: 10 }] })
      )
    ).resolves.toBeDefined();
    const wrong = await attempt([
      { type: 'MONTHLY_SAVING', fromYear: 1, amount: 1 },
      { type: 'PREPAY_LOAN', year: 2, loanId: 'sim-loan-0', amount: 10 }
    ]);
    expect(wrong?.errors).toEqual([{ field: 'operations.1.loanId', message: 'Dette introuvable' }]);
  });

  it('les requêtes de vérification portent le tenantId', async () => {
    await attempt([{ type: 'SELL_ASSET', year: 1, assetId: ASSET_B }]);
    const [[assetArgs]] = prismaMock.asset.findMany.mock.calls.slice(-1);
    expect(assetArgs.where.tenantId).toBe(TENANT_A);
  });

  it('PATCH : mêmes vérifications, et rien n’est modifié en cas de refus', async () => {
    const created = await createScenario(TENANT_A, body('Plan'));
    const foreign = await updateScenario(TENANT_A, created.id, {
      operations: [{ type: 'SELL_ASSET', year: 1, assetId: ASSET_B }]
    }).catch(error => ({ status: error.statusCode, errors: error.errors }));
    const missing = await updateScenario(TENANT_A, created.id, {
      operations: [{ type: 'SELL_ASSET', year: 1, assetId: MISSING }]
    }).catch(error => ({ status: error.statusCode, errors: error.errors }));
    expect(foreign).toEqual({ status: 422, errors: [{ field: 'operations.0.assetId', message: 'Actif introuvable' }] });
    expect(foreign).toEqual(missing);
    expect(scenarioDelegate.update).not.toHaveBeenCalled();
  });

  it('PATCH sans opérations ne vérifie aucune référence', async () => {
    const created = await createScenario(TENANT_A, body('Plan'));
    prismaMock.asset.findMany.mockClear();
    await updateScenario(TENANT_A, created.id, { name: 'Autre' });
    expect(prismaMock.asset.findMany).not.toHaveBeenCalled();
  });
});

describe('PATCH d’opérations seules : horizon enregistré', () => {
  it('refuse (422) une année au-delà de l’horizon enregistré, sans rien modifier', async () => {
    const created = await createScenario(TENANT_A, body('Plan', { horizonYears: 5 }));
    const failure = await updateScenario(TENANT_A, created.id, {
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 8, amount: 100 }]
    }).catch(error => error);
    expect(failure.statusCode).toBe(422);
    expect(failure.errors).toEqual([{ field: 'operations.0.fromYear', message: expect.any(String) }]);
    expect(scenarioDelegate.update).not.toHaveBeenCalled();
    expect(store.patrimonyScenario[0].operations).toEqual([]);
  });

  it('accepte des opérations qui tiennent dans l’horizon enregistré', async () => {
    const created = await createScenario(TENANT_A, body('Plan', { horizonYears: 5 }));
    const updated = await updateScenario(TENANT_A, created.id, {
      operations: [{ type: 'MONTHLY_SAVING', fromYear: 5, amount: 100 }]
    });
    expect(updated.operations).toHaveLength(1);
  });
});
