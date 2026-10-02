/**
 * Lecteur du journal côté PLATEFORME (ADR-006, phase 4) : aucun filtre implicite,
 * curseur, identité complète, parcours par lots pour l'export.
 */
const auditFindMany = jest.fn();
const auditCount = jest.fn();
const userFindMany = jest.fn();
const tenantFindMany = jest.fn();
const enrich = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    auditLog: {
      findMany: (...a: unknown[]) => auditFindMany(...a),
      count: (...a: unknown[]) => auditCount(...a)
    },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    tenant: { findMany: (...a: unknown[]) => tenantFindMany(...a) }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  enrichAuditLogsWithResourceLabels: (...a: unknown[]) => enrich(...a)
}));

import {
  buildPlatformAuditWhere,
  countPlatformAuditLogs,
  getPlatformAuditLogs,
  iteratePlatformAuditLogs,
  PLATFORM_AUDIT_MAX_LIMIT
} from '../../src/services/audit-platform-read-service';
import { decodeAuditCursor, encodeAuditCursor } from '../../src/services/audit-read-service';

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    actorUserId: 'u1',
    tenantId: 'tenant-A',
    actionKey: 'PROPERTY_CREATED',
    entityType: 'PROPERTY',
    entityId: 'p1',
    ipAddress: '10.0.0.1',
    userAgent: 'ua',
    payload: { title: 'T' },
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    scope: 'TENANT',
    visibility: 'TENANT',
    category: 'DATA',
    outcome: 'SUCCESS',
    actorType: 'USER',
    actorLabel: 'agent@a.test',
    requestId: 'req-1',
    source: 'http',
    changes: null,
    ...overrides
  };
}

beforeEach(() => {
  [auditFindMany, auditCount, userFindMany, tenantFindMany, enrich].forEach(m => m.mockReset());
  auditFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  tenantFindMany.mockResolvedValue([]);
  enrich.mockResolvedValue(new Map());
});

describe('buildPlatformAuditWhere', () => {
  it('sans filtre : aucune restriction (la plateforme lit tout)', () => {
    expect(buildPlatformAuditWhere({})).toEqual({});
  });

  it('pose chaque filtre demandé, et seulement ceux-là', () => {
    expect(
      buildPlatformAuditWhere({
        tenantId: 't1',
        scope: 'PLATFORM',
        visibility: 'PLATFORM_ONLY',
        category: 'SECURITY',
        outcome: 'DENIED',
        actorType: 'SUPER_ADMIN',
        actionKey: 'ACCESS_DENIED',
        actorUserId: 'u1',
        entityType: 'Route',
        entityId: 'x',
        requestId: 'req-9'
      })
    ).toEqual({
      tenantId: 't1',
      scope: 'PLATFORM',
      visibility: 'PLATFORM_ONLY',
      category: 'SECURITY',
      outcome: 'DENIED',
      actorType: 'SUPER_ADMIN',
      actionKey: 'ACCESS_DENIED',
      actorUserId: 'u1',
      entityType: 'Route',
      entityId: 'x',
      requestId: 'req-9'
    });
  });

  it('combine période et curseur', () => {
    const cursor = { createdAt: new Date('2026-10-01T00:00:00.000Z'), id: 'z' };
    const where = buildPlatformAuditWhere(
      { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30') },
      cursor
    );
    expect(where.AND).toEqual([
      { createdAt: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') } },
      { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: 'z' } }] }
    ]);
  });
});

describe('getPlatformAuditLogs', () => {
  it('trie par date puis identifiant et demande une ligne de plus que la page', async () => {
    await getPlatformAuditLogs({ limit: 10 });
    expect(auditFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 11
    });
  });

  it('borne la taille de page', async () => {
    await getPlatformAuditLogs({ limit: 1_000_000 });
    expect(auditFindMany.mock.calls[0][0].take).toBe(PLATFORM_AUDIT_MAX_LIMIT + 1);
  });

  it('renvoie un curseur seulement quand il reste des lignes', async () => {
    auditFindMany.mockResolvedValueOnce([
      row('c', { createdAt: new Date('2026-10-01T10:00:03Z') }),
      row('b', { createdAt: new Date('2026-10-01T10:00:02Z') }),
      row('a', { createdAt: new Date('2026-10-01T10:00:01Z') })
    ]);
    const page = await getPlatformAuditLogs({ limit: 2 });
    expect(page.logs.map(l => l.id)).toEqual(['c', 'b']);
    expect(decodeAuditCursor(page.nextCursor as string)).toEqual({
      createdAt: new Date('2026-10-01T10:00:02Z'),
      id: 'b'
    });

    auditFindMany.mockResolvedValueOnce([row('a')]);
    expect((await getPlatformAuditLogs({ limit: 2 })).nextCursor).toBeNull();
  });

  it('applique le curseur reçu', async () => {
    const cursor = encodeAuditCursor({ createdAt: new Date('2026-10-01T10:00:00Z'), id: 'k' });
    await getPlatformAuditLogs({ cursor });
    expect(auditFindMany.mock.calls[0][0].where.AND).toBeDefined();
  });

  it('montre tout à la plateforme : identité, agence, IP et navigateur, y compris du personnel', async () => {
    auditFindMany.mockResolvedValueOnce([
      row('s', { actorType: 'SUPER_ADMIN', actorUserId: 'staff-1', actorLabel: 'staff@immotopia.test' }),
      row('p', { tenantId: null, scope: 'PLATFORM', visibility: 'PLATFORM_ONLY' })
    ]);
    userFindMany.mockResolvedValueOnce([{ id: 'staff-1', email: 'staff@immotopia.test', fullName: 'Staff' }]);
    tenantFindMany.mockResolvedValueOnce([{ id: 'tenant-A', name: 'Agence A' }]);

    const { logs } = await getPlatformAuditLogs();
    expect(logs[0]).toMatchObject({
      actorType: 'SUPER_ADMIN',
      user: { email: 'staff@immotopia.test' },
      actorLabel: 'staff@immotopia.test',
      tenant: { name: 'Agence A' },
      ipAddress: '10.0.0.1',
      userAgent: 'ua',
      visibility: 'TENANT'
    });
    expect(logs[1]).toMatchObject({ scope: 'PLATFORM', visibility: 'PLATFORM_ONLY', tenantId: undefined });
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['staff-1', 'u1'] } },
      select: { id: true, email: true, fullName: true }
    });
  });

  it('les libellés de ressource ne sont PAS bornés à une agence (vue plateforme)', async () => {
    auditFindMany.mockResolvedValueOnce([row('a')]);
    await getPlatformAuditLogs();
    expect(enrich.mock.calls[0][1]).toBeUndefined();
  });
});

describe('countPlatformAuditLogs', () => {
  it('compte avec les mêmes filtres que la lecture', async () => {
    auditCount.mockResolvedValue(42);
    expect(await countPlatformAuditLogs({ category: 'AUTH' })).toBe(42);
    expect(auditCount).toHaveBeenCalledWith({ where: { category: 'AUTH' } });
  });
});

describe('iteratePlatformAuditLogs', () => {
  const batchOf = (n: number, prefix = 'r') =>
    Array.from({ length: n }, (_, i) => row(`${prefix}${i}`, { createdAt: new Date(2026, 9, 1, 0, 0, 100 - i) }));

  it('lit par lots de 1 000 en suivant le curseur, et s’arrête sur un lot incomplet', async () => {
    auditFindMany.mockResolvedValueOnce(batchOf(1000, 'a')).mockResolvedValueOnce(batchOf(300, 'b'));
    const sizes: number[] = [];
    for await (const batch of iteratePlatformAuditLogs({})) sizes.push(batch.length);

    expect(sizes).toEqual([1000, 300]);
    expect(auditFindMany).toHaveBeenCalledTimes(2);
    expect(auditFindMany.mock.calls[0][0].take).toBe(1000);
    // le deuxième lot repart du dernier de l'état précédent (curseur posé)
    expect(auditFindMany.mock.calls[1][0].where.AND).toBeDefined();
  });

  it('respecte le plafond de lignes, même au milieu d’un lot', async () => {
    auditFindMany.mockResolvedValueOnce(batchOf(1000, 'a')).mockResolvedValueOnce(batchOf(500, 'b'));
    let total = 0;
    for await (const batch of iteratePlatformAuditLogs({}, 1500)) total += batch.length;
    expect(total).toBe(1500);
    expect(auditFindMany.mock.calls[1][0].take).toBe(500);
  });

  it('ne produit rien quand le journal est vide', async () => {
    const batches: unknown[] = [];
    for await (const batch of iteratePlatformAuditLogs({})) batches.push(batch);
    expect(batches).toEqual([]);
  });
});
