/**
 * Lecteur du journal côté agence (ADR-006) : étanchéité, pagination par
 * curseur, identité du personnel de la plateforme.
 *
 * Aucune base : `prisma` et l'enrichissement de libellés sont simulés, on
 * vérifie ce que le service DEMANDE à la base et ce qu'il renvoie.
 */
const auditFindMany = jest.fn();
const userFindMany = jest.fn();
const enrich = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    auditLog: { findMany: (...args: unknown[]) => auditFindMany(...args) },
    user: { findMany: (...args: unknown[]) => userFindMany(...args) }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  enrichAuditLogsWithResourceLabels: (...args: unknown[]) => enrich(...args)
}));

import {
  buildTenantAuditWhere,
  decodeAuditCursor,
  encodeAuditCursor,
  getTenantAuditLogs,
  TENANT_AUDIT_MAX_LIMIT
} from '../../src/services/audit-read-service';
import { BadRequestError } from '../../src/middleware/error-middleware';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
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
  auditFindMany.mockReset();
  userFindMany.mockReset();
  enrich.mockReset();
  auditFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  enrich.mockResolvedValue(new Map());
});

describe('buildTenantAuditWhere', () => {
  it('pose toujours l’agence et la visibilité TENANT', () => {
    expect(buildTenantAuditWhere('tenant-A', {})).toEqual({ tenantId: 'tenant-A', visibility: 'TENANT' });
  });

  it('ne laisse aucun filtre remplacer l’agence ni la visibilité', () => {
    // Un appelant mal intentionné (ou une régression) qui ferait passer ces
    // champs dans `filters` : ils ne sont pas lus.
    const hostile = { tenantId: 'tenant-B', visibility: 'PLATFORM_ONLY', category: 'AUTH' } as any;
    const where = buildTenantAuditWhere('tenant-A', hostile);
    expect(where.tenantId).toBe('tenant-A');
    expect(where.visibility).toBe('TENANT');
    expect(where.category).toBe('AUTH');
  });

  it('combine filtres, période et curseur', () => {
    const cursor = { createdAt: new Date('2026-10-01T00:00:00.000Z'), id: 'z' };
    const where = buildTenantAuditWhere(
      'tenant-A',
      { outcome: 'DENIED', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30') },
      cursor
    );
    expect(where).toMatchObject({ tenantId: 'tenant-A', visibility: 'TENANT', outcome: 'DENIED' });
    expect(where.AND).toEqual([
      { createdAt: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') } },
      { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: 'z' } }] }
    ]);
  });
});

describe('curseur', () => {
  it('fait l’aller-retour', () => {
    const source = { createdAt: new Date('2026-10-01T10:00:00.123Z'), id: 'abc' };
    expect(decodeAuditCursor(encodeAuditCursor(source))).toEqual(source);
  });

  it.each(['', 'pas-du-base64', Buffer.from('{}').toString('base64url'), Buffer.from('[1]').toString('base64url')])(
    'refuse un curseur mal formé (%j)',
    raw => {
      expect(() => decodeAuditCursor(raw)).toThrow(BadRequestError);
    }
  );

  it('refuse une date illisible', () => {
    const raw = Buffer.from(JSON.stringify({ t: 'hier', i: 'x' })).toString('base64url');
    expect(() => decodeAuditCursor(raw)).toThrow(BadRequestError);
  });
});

describe('getTenantAuditLogs', () => {
  it('interroge la base avec l’agence, la visibilité, un tri stable et limit + 1', async () => {
    await getTenantAuditLogs('tenant-A', { limit: 10 });
    expect(auditFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-A', visibility: 'TENANT' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 11
    });
  });

  it('borne la taille de page', async () => {
    await getTenantAuditLogs('tenant-A', { limit: 100000 });
    expect(auditFindMany.mock.calls[0][0].take).toBe(TENANT_AUDIT_MAX_LIMIT + 1);
    await getTenantAuditLogs('tenant-A', { limit: 0 });
    expect(auditFindMany.mock.calls[1][0].take).toBe(2);
  });

  it('renvoie un curseur seulement quand il reste des lignes', async () => {
    auditFindMany.mockResolvedValueOnce([
      row({ id: 'c', createdAt: new Date('2026-10-01T10:00:03Z') }),
      row({ id: 'b', createdAt: new Date('2026-10-01T10:00:02Z') }),
      row({ id: 'a', createdAt: new Date('2026-10-01T10:00:01Z') })
    ]);
    const page = await getTenantAuditLogs('tenant-A', { limit: 2 });
    expect(page.logs.map(l => l.id)).toEqual(['c', 'b']);
    expect(decodeAuditCursor(page.nextCursor as string)).toEqual({
      createdAt: new Date('2026-10-01T10:00:02Z'),
      id: 'b'
    });

    auditFindMany.mockResolvedValueOnce([row({ id: 'a' })]);
    expect((await getTenantAuditLogs('tenant-A', { limit: 2 })).nextCursor).toBeNull();
  });

  it('borne l’enrichissement de libellés à l’agence lue', async () => {
    auditFindMany.mockResolvedValueOnce([row()]);
    await getTenantAuditLogs('tenant-A');
    expect(enrich.mock.calls[0][1]).toBe('tenant-A');
  });

  it('résout les acteurs avec un select explicite (jamais passwordHash)', async () => {
    auditFindMany.mockResolvedValueOnce([row()]);
    userFindMany.mockResolvedValueOnce([{ id: 'u1', email: 'agent@a.test', fullName: 'Agent A' }]);
    const page = await getTenantAuditLogs('tenant-A');
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1'] } },
      select: { id: true, email: true, fullName: true }
    });
    expect(page.logs[0].user).toEqual({ id: 'u1', email: 'agent@a.test', fullName: 'Agent A' });
    expect(JSON.stringify(page)).not.toMatch(/passwordHash/);
  });

  it('n’expose ni identité, ni IP, ni agent du personnel de la plateforme', async () => {
    auditFindMany.mockResolvedValueOnce([
      row({ actorType: 'SUPER_ADMIN', actorUserId: 'staff-1', actorLabel: 'staff@immotopia.test' })
    ]);
    const page = await getTenantAuditLogs('tenant-A');
    expect(userFindMany).not.toHaveBeenCalled();
    const [log] = page.logs;
    expect(log.actorType).toBe('SUPER_ADMIN');
    expect(log.user).toBeUndefined();
    expect(log.actorLabel).toBeUndefined();
    expect(log.ipAddress).toBeUndefined();
    expect(log.userAgent).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(/staff@immotopia|staff-1|10\.0\.0\.1/);
  });

  it('un curseur invalide est une 400 avant toute requête', async () => {
    await expect(getTenantAuditLogs('tenant-A', { cursor: 'n-importe-quoi' })).rejects.toThrow(BadRequestError);
    expect(auditFindMany).not.toHaveBeenCalled();
  });
});
