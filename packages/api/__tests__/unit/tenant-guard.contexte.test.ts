/**
 * D1 — le contexte d'agence posé par `requireTenantAccess`
 * (middleware/tenant-middleware.ts) doit rester visible en aval, y compris
 * après un `await` dans un contrôleur `asyncHandler` : c'est précisément ce
 * que l'ancien `withTenantContext` (jamais monté, voir
 * middleware/tenant-isolation-middleware.ts) était censé garantir, et ne
 * garantissait pas puisqu'il n'était monté nulle part.
 *
 * Même style de mock que `middleware.gardes-idempotentes.test.ts` (qui
 * épingle le court-circuit de `requireTenantAccess` — ne pas le casser) : un
 * magasin en mémoire minimal derrière `utils/database`.
 */

const membershipFindUnique = jest.fn();
const userRoleFindMany = jest.fn();
const tenantClientFindUnique = jest.fn();
const tenantFindUnique = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    membership: { findUnique: (...a: any[]) => membershipFindUnique(...a) },
    userRole: { findMany: (...a: any[]) => userRoleFindMany(...a) },
    tenantClient: { findUnique: (...a: any[]) => tenantClientFindUnique(...a) },
    tenant: { findUnique: (...a: any[]) => tenantFindUnique(...a) }
  }
}));

import { requireTenantAccess } from '../../src/middleware/tenant-middleware';
import { getCurrentTenantId } from '../../src/utils/tenant-context';

type Row = Record<string, any>;

function reponseFactice() {
  const res: Row = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

/** `next` asynchrone qui n'observe le contexte qu'après un vrai `await`. */
function nextQuiLitLeContexteApresAwait() {
  let vu: string | undefined = 'PAS_APPELE';
  let resoudre!: () => void;
  const fini = new Promise<void>(resolve => {
    resoudre = resolve;
  });

  const next = jest.fn(() => {
    return Promise.resolve()
      .then(() => new Promise(r => setTimeout(r, 0)))
      .then(() => {
        vu = getCurrentTenantId();
        resoudre();
      });
  });

  return { next, fini, lire: () => vu };
}

beforeEach(() => {
  jest.clearAllMocks();
  membershipFindUnique.mockResolvedValue({ status: 'ACTIVE' });
  userRoleFindMany.mockResolvedValue([{ role: { scope: 'TENANT' } }]);
  tenantClientFindUnique.mockResolvedValue(null);
  tenantFindUnique.mockResolvedValue({ status: 'ACTIVE' });
});

describe("requireTenantAccess pose le contexte d'agence pour toute la suite de la chaîne", () => {
  it('adhésion active : getCurrentTenantId() est visible après un await, dans le handler suivant', async () => {
    const req: Row = {
      user: { userId: 'user-1', globalRole: 'USER' },
      params: { tenantId: 'tenant-A' },
      body: {},
      query: {},
      originalUrl: '/api/tenants/tenant-A/properties'
    };
    const { next, fini, lire } = nextQuiLitLeContexteApresAwait();

    await requireTenantAccess(req as any, reponseFactice() as any, next);
    await fini;

    expect(lire()).toBe('tenant-A');
    // Le contexte ne fuit pas hors de `runWithTenantContext` : une fois la
    // chaîne terminée, on est revenu hors contexte.
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it('super-admin : le contexte est posé aussi (isSuperAdmin: true)', async () => {
    const req: Row = {
      user: { userId: 'admin-1', globalRole: 'SUPER_ADMIN' },
      params: { tenantId: 'tenant-A' },
      body: {},
      query: {},
      originalUrl: '/api/tenants/tenant-A/properties'
    };
    const { next, fini, lire } = nextQuiLitLeContexteApresAwait();

    await requireTenantAccess(req as any, reponseFactice() as any, next);
    await fini;

    expect(lire()).toBe('tenant-A');
    // Aucune requête base n'était nécessaire pour le super-admin.
    expect(tenantFindUnique).not.toHaveBeenCalled();
  });

  it('TenantClient historique : le contexte est posé aussi', async () => {
    membershipFindUnique.mockResolvedValue(null);
    tenantClientFindUnique.mockResolvedValue({ id: 'client-1', clientType: 'OWNER' });

    const req: Row = {
      user: { userId: 'user-2', globalRole: 'USER' },
      params: { tenantId: 'tenant-A' },
      body: {},
      query: {},
      originalUrl: '/api/tenants/tenant-A/properties'
    };
    const { next, fini, lire } = nextQuiLitLeContexteApresAwait();

    await requireTenantAccess(req as any, reponseFactice() as any, next);
    await fini;

    expect(lire()).toBe('tenant-A');
  });

  it('court-circuit (contexte déjà résolu pour ce tenant) : le contexte reste posé au passage suivant', async () => {
    const req: Row = {
      user: { userId: 'user-1', globalRole: 'USER' },
      params: { tenantId: 'tenant-A' },
      body: {},
      query: {},
      originalUrl: '/api/tenants/tenant-A/finance/stock/items'
    };

    // Premier passage : pose req.tenantContext.
    const premier = nextQuiLitLeContexteApresAwait();
    await requireTenantAccess(req as any, reponseFactice() as any, premier.next);
    await premier.fini;
    expect(premier.lire()).toBe('tenant-A');

    // Deuxième passage (deuxième routeur monté sur /api) : court-circuit,
    // mais le contexte AsyncLocalStorage doit être reposé pour CE passage-là
    // aussi, pas seulement pour le premier.
    membershipFindUnique.mockClear();
    const second = nextQuiLitLeContexteApresAwait();
    await requireTenantAccess(req as any, reponseFactice() as any, second.next);
    await second.fini;

    expect(second.lire()).toBe('tenant-A');
    // Le court-circuit ne recontacte pas la base.
    expect(membershipFindUnique).not.toHaveBeenCalled();
  });

  it('accès refusé : aucun contexte posé, next jamais appelé', async () => {
    membershipFindUnique.mockResolvedValue(null);
    tenantClientFindUnique.mockResolvedValue(null);

    const req: Row = {
      user: { userId: 'user-3', globalRole: 'USER' },
      params: { tenantId: 'tenant-A' },
      body: {},
      query: {},
      originalUrl: '/api/tenants/tenant-A/properties'
    };
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getCurrentTenantId()).toBeUndefined();
  });
});
