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

const store = { patrimonyScenario: [] as Row[], asset: [] as Row[] };
let seq = 0;

const known = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });
const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);

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
  propertyLoan: { findMany: jest.fn(async () => []) }
};

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

beforeEach(() => {
  store.patrimonyScenario = [];
  store.asset = [];
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
    const created = await createScenario(
      TENANT_A,
      body('Vente', { operations: [{ type: 'SELL_ASSET', year: 1, assetId: ASSET }] })
    );
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
    store.asset.push({
      id: ASSET,
      tenantId: TENANT_A,
      name: 'Villa',
      assetClass: 'REAL_ESTATE',
      status: 'ARCHIVED',
      currency: 'XOF',
      exchangeRateToXof: null,
      disposedAt: null,
      propertyId: null,
      details: {}
    });
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
