/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/secure-links — extension du lot B3 : portée EXTERNAL_ACCESS_GRANT,
 * plafond d'expiration (`maxExpiresAt`), révocation par objet et comptage des
 * liens actifs. Mock à la frontière `utils/database` et `audit-service`.
 */

const fns: Record<string, jest.Mock> = {};
const delegateFn = (key: string) => {
  fns[key] = jest.fn();
  return (...a: any[]) => fns[key](...a);
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    secureLink: {
      create: delegateFn('create'),
      findMany: delegateFn('findMany'),
      updateMany: delegateFn('updateMany'),
      groupBy: delegateFn('groupBy')
    }
  }
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a)
}));

import { env } from '../../src/config/env';
import { BadRequestError } from '../../src/middleware/error-middleware';
import {
  buildSecureLinkUrl,
  countActiveSecureLinksByObject,
  createSecureLink,
  revokeSecureLinksForObject
} from '../../src/lib/secure-links';
import { hashToken } from '../../src/lib/secure-links/token';

const TENANT = 'tenant-a';
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(fns)) fn.mockReset();
});

describe('portée EXTERNAL_ACCESS_GRANT', () => {
  it('l’URL partagée porte le jeton dans le FRAGMENT, vers /acces-partage', () => {
    const url = buildSecureLinkUrl('EXTERNAL_ACCESS_GRANT', 'abc123');
    expect(url).toBe(`${env.FRONTEND_URL.replace(/\/+$/, '')}/acces-partage#abc123`);
    expect(url).not.toContain('?');
    expect(new globalThis.URL(url).search).toBe('');
    // L'autre portée garde son URL.
    expect(buildSecureLinkUrl('OWNER_MONTHLY_REPORT', 'abc')).toMatch(/\/rapport-proprietaire#abc$/);
  });

  it('un lien de cette portée est stocké haché, avec le type d’objet du grant', async () => {
    fns.create.mockResolvedValue({ id: 'link-1' });
    const created = await createSecureLink({
      tenantId: TENANT,
      scope: 'EXTERNAL_ACCESS_GRANT',
      objectType: 'ExternalAccessGrant',
      objectId: 'grant-1',
      createdByUserId: 'u1'
    });
    const data = fns.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: TENANT,
      scope: 'EXTERNAL_ACCESS_GRANT',
      objectType: 'ExternalAccessGrant',
      objectId: 'grant-1'
    });
    expect(data.tokenHash).toBe(hashToken(created.token));
    expect(JSON.stringify(data)).not.toContain(created.token);
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toContain(created.token);
    expect(created.url).toMatch(/\/acces-partage#/);
  });
});

describe('createSecureLink : plafond maxExpiresAt', () => {
  const base = {
    tenantId: TENANT,
    scope: 'EXTERNAL_ACCESS_GRANT' as const,
    objectType: 'ExternalAccessGrant',
    objectId: 'g'
  };

  it('le lien ne vit jamais au-delà de l’expiration du grant', async () => {
    fns.create.mockResolvedValue({ id: 'l' });
    const cap = new Date(Date.now() + 2 * DAY);
    const created = await createSecureLink({ ...base, ttlDays: 20, maxExpiresAt: cap });
    expect(created.expiresAt.getTime()).toBe(cap.getTime());
    expect(fns.create.mock.calls[0][0].data.expiresAt.getTime()).toBe(cap.getTime());
  });

  it('une expiration de grant plus lointaine que la durée du lien ne la rallonge pas', async () => {
    fns.create.mockResolvedValue({ id: 'l' });
    const before = Date.now();
    const created = await createSecureLink({ ...base, ttlDays: 3, maxExpiresAt: new Date(Date.now() + 200 * DAY) });
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3 * DAY);
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3 * DAY);
  });

  it('un grant permanent (plafond nul) garde la durée maximale du lien, jamais un jeton éternel', async () => {
    fns.create.mockResolvedValue({ id: 'l' });
    const created = await createSecureLink({ ...base, ttlDays: env.SECURE_LINK_MAX_TTL_DAYS, maxExpiresAt: null });
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + env.SECURE_LINK_MAX_TTL_DAYS * DAY);
  });

  it('un plafond déjà passé est refusé : aucun lien, aucune écriture', async () => {
    await expect(createSecureLink({ ...base, maxExpiresAt: new Date(Date.now() - 1000) })).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(fns.create).not.toHaveBeenCalled();
  });

  it('la durée maximale reste appliquée', async () => {
    await expect(createSecureLink({ ...base, ttlDays: env.SECURE_LINK_MAX_TTL_DAYS + 1 })).rejects.toBeInstanceOf(
      BadRequestError
    );
  });
});

describe('revokeSecureLinksForObject', () => {
  it('révoque tous les liens actifs de l’objet, filtré par agence, et journalise chacun sans jeton', async () => {
    fns.findMany.mockResolvedValue([
      { id: 'l1', scope: 'EXTERNAL_ACCESS_GRANT' },
      { id: 'l2', scope: 'EXTERNAL_ACCESS_GRANT' }
    ]);
    fns.updateMany.mockResolvedValue({ count: 2 });

    const count = await revokeSecureLinksForObject(TENANT, 'ExternalAccessGrant', 'grant-1', 'u1');

    expect(count).toBe(2);
    expect(fns.findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      objectType: 'ExternalAccessGrant',
      objectId: 'grant-1',
      revokedAt: null
    });
    expect(fns.findMany.mock.calls[0][0].select).toEqual({ id: true, scope: true });
    expect(fns.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1', 'l2'] }, tenantId: TENANT, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(logAuditEvent).toHaveBeenCalledTimes(2);
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      actorUserId: 'u1',
      tenantId: TENANT,
      actionKey: 'SECURE_LINK_REVOKED',
      entityType: 'SecureLink',
      entityId: 'l1',
      payload: { linkId: 'l1', scope: 'EXTERNAL_ACCESS_GRANT', objectType: 'ExternalAccessGrant', objectId: 'grant-1' }
    });
    expect(JSON.stringify(logAuditEvent.mock.calls)).not.toMatch(/token/i);
  });

  it('aucun lien actif : rien n’est écrit ni journalisé (idempotent)', async () => {
    fns.findMany.mockResolvedValue([]);
    await expect(revokeSecureLinksForObject(TENANT, 'ExternalAccessGrant', 'g', null)).resolves.toBe(0);
    expect(fns.updateMany).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('un autre objet ou une autre agence ne sont jamais ciblés (le filtre porte les trois clés)', async () => {
    fns.findMany.mockResolvedValue([]);
    await revokeSecureLinksForObject('tenant-b', 'ExternalAccessGrant', 'grant-1', null);
    expect(fns.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-b');
  });
});

describe('countActiveSecureLinksByObject', () => {
  it('compte par objet, liens non révoqués et non échus, filtré par agence et portée', async () => {
    fns.groupBy.mockResolvedValue([
      { objectId: 'g1', _count: { _all: 2 } },
      { objectId: 'g2', _count: { _all: 1 } }
    ]);
    const counts = await countActiveSecureLinksByObject(TENANT, 'EXTERNAL_ACCESS_GRANT', 'ExternalAccessGrant', [
      'g1',
      'g2',
      'g3'
    ]);
    expect(counts.get('g1')).toBe(2);
    expect(counts.get('g2')).toBe(1);
    expect(counts.get('g3')).toBeUndefined();
    const where = fns.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: TENANT,
      scope: 'EXTERNAL_ACCESS_GRANT',
      objectType: 'ExternalAccessGrant',
      objectId: { in: ['g1', 'g2', 'g3'] },
      revokedAt: null
    });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('liste vide : aucune requête', async () => {
    const counts = await countActiveSecureLinksByObject(TENANT, 'EXTERNAL_ACCESS_GRANT', 'ExternalAccessGrant', []);
    expect(counts.size).toBe(0);
    expect(fns.groupBy).not.toHaveBeenCalled();
  });
});
