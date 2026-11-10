/**
 * requireTenantAccess : un non-membre recoit TOUJOURS la meme reponse
 * (statut ET corps), que l'agence existe, n'existe pas ou soit suspendue
 * (BUG-2026-10-19-009 : pas d'oracle d'existence d'identifiant d'agence).
 */
import type { Request, Response } from 'express';

const mockMembershipFind = jest.fn();
const mockClientFind = jest.fn();
const mockUserRoleFind = jest.fn();
const mockGetTenantAccessInfo = jest.fn();
const mockUserFind = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    membership: { findUnique: (...a: unknown[]) => mockMembershipFind(...a) },
    tenantClient: { findUnique: (...a: unknown[]) => mockClientFind(...a) },
    userRole: { findMany: (...a: unknown[]) => mockUserRoleFind(...a) },
    user: { findUnique: (...a: unknown[]) => mockUserFind(...a) }
  }
}));
jest.mock('../../src/utils/tenant-access', () => ({
  getTenantAccessInfo: (...a: unknown[]) => mockGetTenantAccessInfo(...a)
}));

import { requireTenantAccess } from '../../src/middleware/tenant-middleware';

const TENANT = '11111111-1111-4111-8111-111111111111';

function run(globalRole = 'USER', input: { params?: object; body?: object; query?: object } = {}) {
  const req = {
    user: { userId: 'u1', globalRole },
    params: input.params ?? { tenantId: TENANT },
    body: input.body ?? {},
    query: input.query ?? {}
  } as unknown as Request;
  const out: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    }
  } as unknown as Response;
  const next = jest.fn();
  return { req, res, next, out, call: () => requireTenantAccess(req, res, next) };
}

describe('requireTenantAccess : refus uniforme', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockMembershipFind.mockResolvedValue(null);
    mockClientFind.mockResolvedValue(null);
    mockUserRoleFind.mockResolvedValue([]);
  });

  async function denied(info: unknown) {
    mockGetTenantAccessInfo.mockResolvedValue(info);
    const r = run();
    await r.call();
    expect(r.next).not.toHaveBeenCalled();
    return r.out;
  }

  it('non-membre : meme statut et meme corps (existante, inexistante, suspendue)', async () => {
    const existing = await denied({ status: 'ACTIVE', type: 'AGENCY' });
    const missing = await denied(null);
    const suspended = await denied({ status: 'SUSPENDED', type: 'AGENCY' });

    expect(existing.status).toBe(403);
    expect(existing.body).toEqual({ success: false, message: "Vous n'avez pas accès à ce tenant." });
    expect(existing.body).not.toHaveProperty('code');
    expect(JSON.stringify(missing)).toBe(JSON.stringify(existing));
    expect(JSON.stringify(suspended)).toBe(JSON.stringify(existing));
  });

  it("pas d'oracle temporel : mêmes lectures (membership, client) pour les trois refus non-membre", async () => {
    const calls: Array<[number, number]> = [];
    for (const info of [{ status: 'ACTIVE', type: 'AGENCY' }, null, { status: 'SUSPENDED', type: 'AGENCY' }]) {
      mockMembershipFind.mockClear();
      mockClientFind.mockClear();
      mockGetTenantAccessInfo.mockClear();
      await denied(info);
      calls.push([mockMembershipFind.mock.calls.length, mockClientFind.mock.calls.length]);
      expect(mockGetTenantAccessInfo).not.toHaveBeenCalled();
    }
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toEqual(calls[0]);
    expect(calls[0]).toEqual([1, 1]);
  });

  it.each([
    ['tableau dans la query', { query: { tenantId: ['a', 'b'] } }],
    ['objet dans la query', { query: { tenantId: { $ne: 'x' } } }],
    ['objet dans le body', { body: { tenantId: { id: 'x' } } }]
  ])('identifiant non textuel (%s) : refus uniforme, aucune lecture en base', async (_nom, input) => {
    const r = run('USER', { params: {}, ...input });
    await r.call();
    expect(r.next).not.toHaveBeenCalled();
    expect(r.out.status).toBe(403);
    expect(r.out.body).toEqual({ success: false, message: "Vous n'avez pas accès à ce tenant." });
    expect(mockMembershipFind).not.toHaveBeenCalled();
    expect(mockClientFind).not.toHaveBeenCalled();
    expect(mockGetTenantAccessInfo).not.toHaveBeenCalled();
  });

  it('membre inactif sans client : refus uniforme', async () => {
    mockMembershipFind.mockResolvedValue({ status: 'SUSPENDED' });
    const out = await denied({ status: 'SUSPENDED', type: 'AGENCY' });
    expect(out.status).toBe(403);
    expect(out.body).not.toHaveProperty('code');
  });

  it('membre actif + agence suspendue : 403 TENANT_SUSPENDED', async () => {
    mockMembershipFind.mockResolvedValue({ status: 'ACTIVE' });
    mockGetTenantAccessInfo.mockResolvedValue({ status: 'SUSPENDED', type: 'AGENCY' });
    const r = run();
    await r.call();
    expect(r.out.status).toBe(403);
    expect(r.out.body).toMatchObject({ success: false, code: 'TENANT_SUSPENDED' });
    expect(r.next).not.toHaveBeenCalled();
  });

  it('membre actif + agence disparue : refus uniforme', async () => {
    mockMembershipFind.mockResolvedValue({ status: 'ACTIVE' });
    const out = await denied(null);
    expect(out.status).toBe(403);
    expect(out.body).toEqual({ success: false, message: "Vous n'avez pas accès à ce tenant." });
  });

  it('membre actif : next appelé, contexte posé', async () => {
    mockMembershipFind.mockResolvedValue({ status: 'ACTIVE' });
    mockUserRoleFind.mockResolvedValue([{ role: { scope: 'TENANT' } }]);
    mockGetTenantAccessInfo.mockResolvedValue({ status: 'ACTIVE', type: 'AGENCY' });
    const r = run();
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.req.tenantContext).toEqual({
      tenantId: TENANT,
      role: null,
      isCollaborator: true,
      isClient: false,
      tenantType: 'AGENCY'
    });
  });

  it('client (TenantClient) : next appelé, clientType posé', async () => {
    mockClientFind.mockResolvedValue({ clientType: 'BUYER' });
    mockGetTenantAccessInfo.mockResolvedValue({ status: 'ACTIVE', type: 'AGENCY' });
    const r = run();
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.req.tenantContext).toEqual({
      tenantId: TENANT,
      role: null,
      isCollaborator: false,
      isClient: true,
      clientType: 'BUYER',
      tenantType: 'AGENCY'
    });
  });

  it('client + agence suspendue : TENANT_SUSPENDED', async () => {
    mockClientFind.mockResolvedValue({ clientType: 'BUYER' });
    mockGetTenantAccessInfo.mockResolvedValue({ status: 'SUSPENDED', type: 'AGENCY' });
    const r = run();
    await r.call();
    expect(r.out.body).toMatchObject({ code: 'TENANT_SUSPENDED' });
  });

  it("super-admin (confirme en base) sur agence inexistante : passe, sans lecture de l'agence ni d'adhesion", async () => {
    mockUserFind.mockResolvedValue({ globalRole: 'SUPER_ADMIN', isActive: true });
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.req.tenantContext).toMatchObject({ tenantId: TENANT, isSuperAdmin: true });
    expect(mockGetTenantAccessInfo).not.toHaveBeenCalled();
    expect(mockMembershipFind).not.toHaveBeenCalled();
  });
});

describe('requireTenantAccess : contournement super-admin relu en base (AUTH-08)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockMembershipFind.mockResolvedValue(null);
    mockClientFind.mockResolvedValue(null);
    mockUserRoleFind.mockResolvedValue([]);
    mockGetTenantAccessInfo.mockResolvedValue({ status: 'ACTIVE', type: 'AGENCY' });
  });

  it('super-admin actif en base : passe, relecture avec select explicite', async () => {
    mockUserFind.mockResolvedValue({ globalRole: 'SUPER_ADMIN', isActive: true });
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.req.tenantContext).toMatchObject({ tenantId: TENANT, isSuperAdmin: true });
    expect(mockUserFind).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { globalRole: true, isActive: true }
    });
  });

  it.each([
    ['retrograde en base', { globalRole: 'USER', isActive: true }],
    ['desactive en base', { globalRole: 'SUPER_ADMIN', isActive: false }],
    ['compte disparu', null]
  ])('jeton SUPER_ADMIN mais %s : pas de contournement, refus uniforme', async (_nom, row) => {
    mockUserFind.mockResolvedValue(row);
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).not.toHaveBeenCalled();
    expect(r.out.status).toBe(403);
    expect(r.out.body).toEqual({ success: false, message: "Vous n'avez pas accès à ce tenant." });
  });

  it('retrograde mais membre actif : cheminement normal (sans isSuperAdmin)', async () => {
    mockUserFind.mockResolvedValue({ globalRole: 'USER', isActive: true });
    mockMembershipFind.mockResolvedValue({ status: 'ACTIVE' });
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.req.tenantContext?.isSuperAdmin).toBeUndefined();
  });

  it('super-admin DESACTIVE en base mais membre actif : refus uniforme, pas de repli sur l’adhesion', async () => {
    mockUserFind.mockResolvedValue({ globalRole: 'SUPER_ADMIN', isActive: false });
    mockMembershipFind.mockResolvedValue({ status: 'ACTIVE' });
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).not.toHaveBeenCalled();
    expect(r.out.status).toBe(403);
    expect(r.out.body).toEqual({ success: false, message: "Vous n'avez pas accès à ce tenant." });
    expect(mockMembershipFind).not.toHaveBeenCalled();
  });

  it('erreur de lecture en base : refus uniforme (fail-closed), aucun detail', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUserFind.mockRejectedValue(new Error('connexion base: secret-detail'));
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).not.toHaveBeenCalled();
    expect(r.out.status).toBe(403);
    expect(JSON.stringify(r.out.body)).not.toContain('secret-detail');
  });

  it('utilisateur ordinaire : aucune relecture du compte', async () => {
    const r = run('USER');
    await r.call();
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('contexte deja resolu : raccourci de cache, pas de relecture', async () => {
    const r = run('SUPER_ADMIN');
    r.req.tenantContext = { tenantId: TENANT, role: null, isCollaborator: true, isClient: false, isSuperAdmin: true };
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(mockUserFind).not.toHaveBeenCalled();
  });
});
