/**
 * lib/secure-links — génération, vérification, consultation, révocation, liste.
 *
 * Mock à la frontière `utils/database` et `services/audit-service`
 * (.claude/rules/testing.md). Aucune base réelle.
 */

import crypto from 'crypto';

const create = jest.fn();
const findUnique = jest.fn();
const findFirst = jest.fn();
const findMany = jest.fn();
const updateMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    secureLink: {
      create: (...a: any[]) => create(...a),
      findUnique: (...a: any[]) => findUnique(...a),
      findFirst: (...a: any[]) => findFirst(...a),
      findMany: (...a: any[]) => findMany(...a),
      updateMany: (...a: any[]) => updateMany(...a)
    }
  }
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a)
}));

const loggerCalls: unknown[][] = [];
jest.mock('../../src/utils/logger', () => {
  const record = (...a: unknown[]) => {
    loggerCalls.push(a);
  };
  return { logger: { info: record, warn: record, error: record, debug: record } };
});

import { env } from '../../src/config/env';
import { NotFoundError, BadRequestError } from '../../src/middleware/error-middleware';
import { getTenantContext } from '../../src/utils/tenant-context';
import {
  buildSecureLinkUrl,
  createSecureLink,
  listSecureLinks,
  recordSecureLinkView,
  revokeSecureLink,
  verifySecureLink
} from '../../src/lib/secure-links';
import { hashToken, hashesMatch } from '../../src/lib/secure-links/token';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const DAY = 24 * 60 * 60 * 1000;

function row(token: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    tenantId: TENANT_A,
    scope: 'OWNER_MONTHLY_REPORT',
    objectType: 'OwnerStatement',
    objectId: 'stmt-1',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + DAY),
    revokedAt: null,
    tenant: { isActive: true, status: 'ACTIVE' },
    ...overrides
  };
}

async function created() {
  create.mockResolvedValueOnce({ id: 'link-1' });
  return createSecureLink({
    tenantId: TENANT_A,
    scope: 'OWNER_MONTHLY_REPORT',
    objectType: 'OwnerStatement',
    objectId: 'stmt-1',
    createdByUserId: 'user-1'
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  loggerCalls.length = 0;
});

describe('createSecureLink', () => {
  it('génère un jeton de 32 octets en base64url, distinct de son empreinte', async () => {
    const link = await created();
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(link.token, 'base64url')).toHaveLength(32);

    const data = create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(crypto.createHash('sha256').update(link.token).digest('hex'));
    expect(data.tokenHash).not.toBe(link.token);
  });

  it('deux liens ont deux jetons différents', async () => {
    const a = await created();
    const b = await created();
    expect(a.token).not.toBe(b.token);
  });

  it("n'écrit le jeton en clair ni dans Prisma, ni dans l'audit, ni dans les journaux", async () => {
    const link = await created();
    expect(JSON.stringify(create.mock.calls)).not.toContain(link.token);
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(link.token);
    expect(JSON.stringify(loggerCalls)).not.toContain(link.token);
    // ni son empreinte dans l'audit
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(hashToken(link.token));
  });

  it('journalise la création sans jeton ni empreinte', async () => {
    await created();
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry).toMatchObject({
      actorUserId: 'user-1',
      tenantId: TENANT_A,
      actionKey: 'SECURE_LINK_CREATED',
      entityType: 'SecureLink',
      entityId: 'link-1'
    });
    expect(entry.payload).toMatchObject({
      linkId: 'link-1',
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement'
    });
    expect(Object.keys(entry.payload)).not.toEqual(expect.arrayContaining(['token', 'tokenHash']));
  });

  it("construit l'URL avec le jeton dans le fragment", async () => {
    const link = await created();
    expect(link.url).toBe(`${env.FRONTEND_URL.replace(/\/+$/, '')}/rapport-proprietaire#${link.token}`);
    expect(new URL(link.url).search).toBe('');
    expect(buildSecureLinkUrl('OWNER_MONTHLY_REPORT', 'abc')).toContain('#abc');
  });

  it('applique la durée par défaut', async () => {
    const before = Date.now();
    const link = await created();
    const days = Math.min(env.SECURE_LINK_DEFAULT_TTL_DAYS, env.SECURE_LINK_MAX_TTL_DAYS);
    expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + days * DAY - 1000);
    expect(link.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + days * DAY + 1000);
  });

  it('accepte ttlDays dans [1, max] et refuse hors bornes', async () => {
    create.mockResolvedValue({ id: 'link-1' });
    const base = {
      tenantId: TENANT_A,
      scope: 'OWNER_MONTHLY_REPORT' as const,
      objectType: 'OwnerStatement',
      objectId: 's'
    };
    await expect(createSecureLink({ ...base, ttlDays: 1 })).resolves.toBeDefined();
    await expect(createSecureLink({ ...base, ttlDays: env.SECURE_LINK_MAX_TTL_DAYS })).resolves.toBeDefined();
    await expect(createSecureLink({ ...base, ttlDays: 0 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(createSecureLink({ ...base, ttlDays: -3 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(createSecureLink({ ...base, ttlDays: 1.5 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(createSecureLink({ ...base, ttlDays: env.SECURE_LINK_MAX_TTL_DAYS + 1 })).rejects.toBeInstanceOf(
      BadRequestError
    );
  });
});

describe('verifySecureLink', () => {
  const TOKEN = crypto.randomBytes(32).toString('base64url');

  async function failure(token: string, scope: 'OWNER_MONTHLY_REPORT' = 'OWNER_MONTHLY_REPORT') {
    try {
      await verifySecureLink(token, scope);
    } catch (error) {
      return error as NotFoundError;
    }
    throw new Error('aurait dû refuser');
  }

  it('accepte un jeton valide et ne renvoie ni empreinte ni jeton', async () => {
    findUnique.mockResolvedValueOnce(row(TOKEN));
    const verified = await verifySecureLink(TOKEN, 'OWNER_MONTHLY_REPORT');
    expect(verified).toEqual({
      id: 'link-1',
      tenantId: TENANT_A,
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      expiresAt: expect.any(Date)
    });
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashToken(TOKEN) });
    expect(JSON.stringify(findUnique.mock.calls)).not.toContain(TOKEN);
  });

  it('refuse de la même façon : inconnu, expiré, révoqué, autre portée, agence suspendue ou inactive, forme invalide', async () => {
    const scenarios: Array<() => Promise<NotFoundError>> = [
      async () => {
        findUnique.mockResolvedValueOnce(null);
        return failure(TOKEN);
      },
      async () => {
        findUnique.mockResolvedValueOnce(row(TOKEN, { expiresAt: new Date(Date.now() - 1000) }));
        return failure(TOKEN);
      },
      async () => {
        findUnique.mockResolvedValueOnce(row(TOKEN, { revokedAt: new Date() }));
        return failure(TOKEN);
      },
      async () => {
        findUnique.mockResolvedValueOnce(row(TOKEN, { scope: 'AUTRE_PORTEE' }));
        return failure(TOKEN);
      },
      async () => {
        findUnique.mockResolvedValueOnce(row(TOKEN, { tenant: { isActive: true, status: 'SUSPENDED' } }));
        return failure(TOKEN);
      },
      async () => {
        findUnique.mockResolvedValueOnce(row(TOKEN, { tenant: { isActive: false, status: 'ACTIVE' } }));
        return failure(TOKEN);
      },
      async () => {
        // empreinte stockée différente de celle recalculée
        findUnique.mockResolvedValueOnce(row(TOKEN, { tokenHash: hashToken('autre') }));
        return failure(TOKEN);
      },
      async () => failure('court'),
      async () => failure('a'.repeat(500)),
      async () => failure('caractères invalides !!!!!!!!!!!!!!!!')
    ];

    const errors: NotFoundError[] = [];
    for (const run of scenarios) errors.push(await run());

    for (const error of errors) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Lien invalide ou expiré.');
    }
    expect(new Set(errors.map(e => e.message)).size).toBe(1);
    expect(new Set(errors.map(e => (e as any).code)).size).toBe(1);
  });

  it("n'a aucun effet de bord (ni écriture, ni audit)", async () => {
    findUnique.mockResolvedValueOnce(row(TOKEN));
    await verifySecureLink(TOKEN, 'OWNER_MONTHLY_REPORT');
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('compare les empreintes à temps constant (timingSafeEqual) et refuse longueurs ou formats différents', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const h = hashToken('x');
    expect(hashesMatch(h, h)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(hashesMatch(h, hashToken('y'))).toBe(false);
    expect(hashesMatch(h, 'abcd')).toBe(false);
    expect(hashesMatch('', '')).toBe(false);
    spy.mockRestore();
  });
});

describe('recordSecureLinkView', () => {
  const verified = {
    id: 'link-1',
    tenantId: TENANT_A,
    scope: 'OWNER_MONTHLY_REPORT' as const,
    objectType: 'OwnerStatement',
    objectId: 'stmt-1',
    expiresAt: new Date(Date.now() + DAY)
  };

  it("incrémente le compteur dans le contexte de l'agence du lien et journalise", async () => {
    let seenContext: string | undefined;
    updateMany.mockImplementationOnce(async () => {
      seenContext = getTenantContext()?.tenantId;
      return { count: 1 };
    });

    await recordSecureLinkView(verified, { ip: '203.0.113.9', userAgent: 'UA/1.0' });

    expect(seenContext).toBe(TENANT_A);
    const call = updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'link-1', tenantId: TENANT_A });
    expect(call.data.viewCount).toEqual({ increment: 1 });
    expect(call.data.lastViewedAt).toBeInstanceOf(Date);

    const entry = logAuditEvent.mock.calls[0][0];
    expect(entry).toMatchObject({
      actionKey: 'SECURE_LINK_VIEWED',
      tenantId: TENANT_A,
      entityType: 'SecureLink',
      entityId: 'link-1',
      ipAddress: '203.0.113.9',
      userAgent: 'UA/1.0'
    });
    expect(entry.payload).toEqual({
      linkId: 'link-1',
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: 'stmt-1'
    });
  });
});

describe('revokeSecureLink', () => {
  it('révoque et journalise le lien de sa propre agence', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'link-1',
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      revokedAt: null
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await revokeSecureLink(TENANT_A, 'link-1', 'user-1');

    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 'link-1', tenantId: TENANT_A });
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 'link-1', tenantId: TENANT_A, revokedAt: null });
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      actorUserId: 'user-1',
      tenantId: TENANT_A,
      actionKey: 'SECURE_LINK_REVOKED'
    });
  });

  it('avec `onObject` : un seul appel filtré sur {id, tenantId, objectType, objectId}', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'link-1',
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      revokedAt: null
    });
    updateMany.mockResolvedValueOnce({ count: 1 });

    await revokeSecureLink(TENANT_A, 'link-1', 'user-1', { objectType: 'OwnerStatement', objectId: 'stmt-1' });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'link-1',
      tenantId: TENANT_A,
      objectType: 'OwnerStatement',
      objectId: 'stmt-1'
    });
  });

  it("avec `onObject` : un lien d'un autre relevé répond NotFoundError, rien écrit", async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(
      revokeSecureLink(TENANT_A, 'link-1', 'user-1', { objectType: 'OwnerStatement', objectId: 'autre' })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("l'agence A ne peut pas révoquer le lien de l'agence B (NotFoundError, rien écrit)", async () => {
    findFirst.mockImplementationOnce(async ({ where }: any) => (where.tenantId === TENANT_B ? { id: 'link-b' } : null));
    await expect(revokeSecureLink(TENANT_A, 'link-b', 'user-1')).rejects.toBeInstanceOf(NotFoundError);
    expect(updateMany).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('est idempotent quand le lien est déjà révoqué', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'link-1',
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      revokedAt: new Date()
    });
    await expect(revokeSecureLink(TENANT_A, 'link-1', 'user-1')).resolves.toBeUndefined();
    expect(updateMany).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('listSecureLinks', () => {
  it('filtre par agence, ne sélectionne ni jeton ni empreinte et calcule le statut', async () => {
    const now = Date.now();
    const base = {
      scope: 'OWNER_MONTHLY_REPORT',
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      createdAt: new Date(now),
      createdByUserId: 'user-1',
      viewCount: 0,
      lastViewedAt: null
    };
    findMany.mockResolvedValueOnce([
      { ...base, id: 'a', expiresAt: new Date(now + DAY), revokedAt: null },
      { ...base, id: 'b', expiresAt: new Date(now - DAY), revokedAt: null },
      { ...base, id: 'c', expiresAt: new Date(now + DAY), revokedAt: new Date() }
    ]);

    const result = await listSecureLinks(TENANT_A, {
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      activeOnly: true
    });

    const args = findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      tenantId: TENANT_A,
      objectType: 'OwnerStatement',
      objectId: 'stmt-1',
      revokedAt: null
    });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.select.tokenHash).toBeUndefined();
    expect(Object.keys(args.select)).not.toContain('token');
    expect(result.map(r => r.status)).toEqual(['ACTIVE', 'EXPIRED', 'REVOKED']);
    for (const item of result) {
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('tokenHash');
    }
  });
});
