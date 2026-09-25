/**
 * Tests de `middleware/tenant-portal-access.ts` et
 * `middleware/owner-portal-access.ts` (lot B3 — un client peut être rattaché
 * à plusieurs agences ; lot D1 — contexte d'agence posé pour le garde-fou).
 *
 * Couvre : l'en-tête `X-Portal-Tenant-Id`, la résolution déterministe par
 * défaut (agence la plus ancienne, non suspendue), le refus d'une agence
 * suspendue, le filtre des biens par agence côté portail propriétaire, et la
 * visibilité du contexte AsyncLocalStorage en aval après un `await`.
 */

const tenantClientFindMany = jest.fn();
const rentalLeaseFindFirst = jest.fn();
const rentalLeaseFindMany = jest.fn();
const propertyFindMany = jest.fn();
const executeRaw = jest.fn(async (..._args: any[]) => undefined);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    tenantClient: { findMany: (...a: any[]) => tenantClientFindMany(...a) },
    rentalLease: {
      findFirst: (...a: any[]) => rentalLeaseFindFirst(...a),
      findMany: (...a: any[]) => rentalLeaseFindMany(...a)
    },
    property: { findMany: (...a: any[]) => propertyFindMany(...a) },
    $executeRaw: (strings: TemplateStringsArray, ...values: any[]) => executeRaw(strings, ...values)
  }
}));

import { requireTenantPortalAccess } from '../../src/middleware/tenant-portal-access';
import { requireOwnerPortalAccess } from '../../src/middleware/owner-portal-access';
import { getCurrentTenantId } from '../../src/utils/tenant-context';

type Row = Record<string, any>;

function reponseFactice() {
  const res: Row = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function requeteAvecEnTete(userId: string, headerTenantId?: string): Row {
  return {
    user: { userId },
    headers: headerTenantId ? { 'x-portal-tenant-id': headerTenantId } : {}
  };
}

/** `next` asynchrone qui n'observe le contexte qu'après un vrai `await` (D1). */
function nextQuiLitLeContexteApresAwait() {
  let vu: string | undefined = 'PAS_APPELE';
  let resoudre!: () => void;
  const fini = new Promise<void>(resolve => {
    resoudre = resolve;
  });
  const next = jest.fn(() =>
    Promise.resolve()
      .then(() => new Promise(r => setTimeout(r, 0)))
      .then(() => {
        vu = getCurrentTenantId();
        resoudre();
      })
  );
  return { next, fini, lire: () => vu };
}

beforeEach(() => {
  jest.clearAllMocks();
  executeRaw.mockResolvedValue(undefined);
});

describe('requireTenantPortalAccess — résolution du TenantClient (B3)', () => {
  const clientAncien = {
    id: 'client-old',
    tenantId: 'tenant-old',
    createdAt: new Date('2025-01-01'),
    tenant: { status: 'ACTIVE' }
  };
  const clientRecent = {
    id: 'client-new',
    tenantId: 'tenant-new',
    createdAt: new Date('2026-01-01'),
    tenant: { status: 'ACTIVE' }
  };
  const clientSuspendu = {
    id: 'client-susp',
    tenantId: 'tenant-susp',
    createdAt: new Date('2024-01-01'), // le plus ancien, mais suspendu
    tenant: { status: 'SUSPENDED' }
  };

  it("sans en-tête : choisit l'agence la plus ancienne NON suspendue, pas la plus ancienne tout court", async () => {
    tenantClientFindMany.mockResolvedValue([clientSuspendu, clientAncien, clientRecent]);
    rentalLeaseFindFirst.mockResolvedValue({ id: 'lease-1' });

    const req = requeteAvecEnTete('user-1');
    const res = reponseFactice();
    const { next, fini, lire } = nextQuiLitLeContexteApresAwait();

    await requireTenantPortalAccess(req as any, res as any, next);
    await fini;

    expect(req.tenantPortal.tenantId).toBe('tenant-old');
    expect(req.tenantPortal.availableTenantIds).toEqual(['tenant-susp', 'tenant-old', 'tenant-new']);
    expect(lire()).toBe('tenant-old'); // D1 : visible en aval après await.
  });

  it("en-tête X-Portal-Tenant-Id : prend le TenantClient de CETTE agence", async () => {
    tenantClientFindMany.mockResolvedValue([clientAncien, clientRecent]);
    rentalLeaseFindFirst.mockResolvedValue({ id: 'lease-1' });

    const req = requeteAvecEnTete('user-1', 'tenant-new');
    const res = reponseFactice();
    const { next, fini, lire } = nextQuiLitLeContexteApresAwait();

    await requireTenantPortalAccess(req as any, res as any, next);
    await fini;

    expect(req.tenantPortal.tenantId).toBe('tenant-new');
    expect(lire()).toBe('tenant-new');
  });

  it("en-tête pour une agence où l'utilisateur n'a pas de compte : 403", async () => {
    tenantClientFindMany.mockResolvedValue([clientAncien]);

    const req = requeteAvecEnTete('user-1', 'tenant-inconnue');
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("en-tête pour une agence suspendue : 403 TENANT_SUSPENDED", async () => {
    tenantClientFindMany.mockResolvedValue([clientSuspendu]);

    const req = requeteAvecEnTete('user-1', 'tenant-susp');
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TENANT_SUSPENDED' }));
  });

  it('toutes les agences suspendues (sans en-tête) : 403 TENANT_SUSPENDED', async () => {
    tenantClientFindMany.mockResolvedValue([clientSuspendu]);

    const req = requeteAvecEnTete('user-1');
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TENANT_SUSPENDED' }));
  });

  it('aucun TenantClient : 403 générique', async () => {
    tenantClientFindMany.mockResolvedValue([]);

    const req = requeteAvecEnTete('user-1');
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('agence résolue mais aucun bail actif : 403', async () => {
    tenantClientFindMany.mockResolvedValue([clientAncien]);
    rentalLeaseFindFirst.mockResolvedValue(null);

    const req = requeteAvecEnTete('user-1');
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Aucun bail actif trouvé.' }));
  });

  it('le bail actif est cherché avec tenant_id égal à l’agence résolue', async () => {
    tenantClientFindMany.mockResolvedValue([clientAncien]);
    rentalLeaseFindFirst.mockResolvedValue({ id: 'lease-1' });

    const req = requeteAvecEnTete('user-1');
    const { next, fini } = nextQuiLitLeContexteApresAwait();
    await requireTenantPortalAccess(req as any, reponseFactice() as any, next);
    await fini;

    expect(rentalLeaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenant_id: 'tenant-old' }) })
    );
  });
});

describe('requireOwnerPortalAccess — résolution + filtre des biens par agence (B3)', () => {
  const ownerAncien = {
    id: 'owner-old',
    userId: 'user-1',
    tenantId: 'tenant-old',
    createdAt: new Date('2025-01-01'),
    tenant: { status: 'ACTIVE' }
  };
  const ownerRecent = {
    id: 'owner-new',
    userId: 'user-1',
    tenantId: 'tenant-new',
    createdAt: new Date('2026-01-01'),
    tenant: { status: 'ACTIVE' }
  };

  beforeEach(() => {
    propertyFindMany.mockResolvedValue([]);
    rentalLeaseFindMany.mockResolvedValue([]);
  });

  it("aucun TenantClient OWNER : 403 (même si le client existe pour un autre clientType)", async () => {
    // tenantClient.findMany est déjà filtré par clientType: OWNER côté
    // middleware — le mock simule la base qui ne renvoie donc rien ici.
    tenantClientFindMany.mockResolvedValue([]);

    const req = requeteAvecEnTete('user-1');
    const res = reponseFactice();
    const next = jest.fn();

    await requireOwnerPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(tenantClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientType: 'OWNER' }) })
    );
  });

  it("sans en-tête : agence la plus ancienne non suspendue, et les biens sont filtrés sur CETTE agence", async () => {
    tenantClientFindMany.mockResolvedValue([ownerAncien, ownerRecent]);
    propertyFindMany.mockResolvedValue([{ id: 'prop-1' }]);
    rentalLeaseFindMany.mockResolvedValue([{ property_id: 'prop-2' }]);

    const req = requeteAvecEnTete('user-1');
    const { next, fini, lire } = nextQuiLitLeContexteApresAwait();

    await requireOwnerPortalAccess(req as any, reponseFactice() as any, next);
    await fini;

    expect(req.ownerPortal.tenantId).toBe('tenant-old');
    expect(req.ownerPortal.propertyIds.sort()).toEqual(['prop-1', 'prop-2']);
    expect(req.ownerPortal.availableTenantIds).toEqual(['tenant-old', 'tenant-new']);
    expect(lire()).toBe('tenant-old');

    // B3 a) : les deux requêtes de résolution des biens portent bien le
    // filtre d'agence — avant ce lot, la première n'en portait aucun.
    expect(propertyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerUserId: 'user-1', tenantId: 'tenant-old' })
      })
    );
    expect(rentalLeaseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ owner_client_id: 'owner-old', tenant_id: 'tenant-old' })
      })
    );
  });

  it('en-tête X-Portal-Tenant-Id : bascule sur cette agence et ses biens', async () => {
    tenantClientFindMany.mockResolvedValue([ownerAncien, ownerRecent]);
    propertyFindMany.mockResolvedValue([{ id: 'prop-new' }]);

    const req = requeteAvecEnTete('user-1', 'tenant-new');
    const { next, fini } = nextQuiLitLeContexteApresAwait();

    await requireOwnerPortalAccess(req as any, reponseFactice() as any, next);
    await fini;

    expect(req.ownerPortal.tenantId).toBe('tenant-new');
    expect(propertyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-new' }) })
    );
  });

  it('agence suspendue : 403 TENANT_SUSPENDED, aucune recherche de biens', async () => {
    tenantClientFindMany.mockResolvedValue([{ ...ownerAncien, tenant: { status: 'SUSPENDED' } }]);

    const req = requeteAvecEnTete('user-1');
    const res = reponseFactice();
    const next = jest.fn();

    await requireOwnerPortalAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TENANT_SUSPENDED' }));
    expect(propertyFindMany).not.toHaveBeenCalled();
  });
});
