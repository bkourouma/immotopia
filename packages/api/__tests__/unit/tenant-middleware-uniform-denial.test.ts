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

jest.mock('../../src/utils/database', () => ({
  prisma: {
    membership: { findUnique: (...a: unknown[]) => mockMembershipFind(...a) },
    tenantClient: { findUnique: (...a: unknown[]) => mockClientFind(...a) },
    userRole: { findMany: (...a: unknown[]) => mockUserRoleFind(...a) }
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

  it('super-admin sur agence inexistante : passe, sans lecture en base', async () => {
    const r = run('SUPER_ADMIN');
    await r.call();
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(r.req.tenantContext).toMatchObject({ tenantId: TENANT, isSuperAdmin: true });
    expect(mockGetTenantAccessInfo).not.toHaveBeenCalled();
    expect(mockMembershipFind).not.toHaveBeenCalled();
  });
});
