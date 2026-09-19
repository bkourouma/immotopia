/**
 * Les deux gardes transverses ne refont pas leur travail dans une même
 * requête.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce fichier existe
 * ---------------------------------------------------------------------------
 *
 * Douze routeurs du module financier sont montés sur `/api`, et chacun pose sa
 * propre garde sur le préfixe `/tenants/:tenantId/finance`. Express exécute le
 * `use` de **chaque** routeur dont le préfixe correspond, jusqu'à trouver la
 * route qui répond.
 *
 * Conséquence, accumulée un sous-lot à la fois sans que rien ne la signale :
 * une seule requête financière vérifiait le jeton jusqu'à douze fois, et
 * `requireTenantAccess` — qui fait **deux** requêtes en base — tournait
 * jusqu'à douze fois aussi. Soit vingt-quatre allers-retours en base, dont
 * vingt-deux pour rien.
 *
 * Aucun test ne pouvait le voir : chaque suite d'API monte **un** routeur, et
 * le défaut ne naît que de leur accumulation dans `index.ts`. C'est l'agent du
 * référentiel du stock qui l'a relevé, en lisant un fichier qui ne lui
 * appartenait pas.
 *
 * Ce fichier épingle le comportement corrigé, pour que personne ne le
 * « simplifie » en retirant les deux court-circuits.
 */

const findUnique = jest.fn();
const findMany = jest.fn();
const tenantClientFindUnique = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    membership: { findUnique: (...a: any[]) => findUnique(...a) },
    userRole: { findMany: (...a: any[]) => findMany(...a) },
    tenantClient: { findUnique: (...a: any[]) => tenantClientFindUnique(...a) }
  }
}));

const verifyToken = jest.fn();

jest.mock('../../src/utils/jwt-utils', () => ({
  verifyToken: (...a: any[]) => verifyToken(...a)
}));

import { authenticate } from '../../src/middleware/auth-middleware';
import { requireTenantAccess } from '../../src/middleware/tenant-middleware';

type Row = Record<string, any>;

function reponseFactice() {
  const res: Row = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  verifyToken.mockReturnValue({ userId: 'user-1', globalRole: 'USER' });
  findUnique.mockResolvedValue({ status: 'ACTIVE' });
  findMany.mockResolvedValue([{ role: { scope: 'TENANT' } }]);
  tenantClientFindUnique.mockResolvedValue(null);
});

describe('authenticate — une seule fois par requête', () => {
  it('vérifie le jeton au premier passage', () => {
    const req: Row = { cookies: { accessToken: 'jeton' }, headers: {} };
    const next = jest.fn();

    authenticate(req as any, reponseFactice() as any, next);

    expect(verifyToken).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'user-1', globalRole: 'USER' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('ne le revérifie pas aux onze passages suivants', () => {
    const req: Row = { cookies: { accessToken: 'jeton' }, headers: {} };
    const next = jest.fn();

    // Douze routeurs finance montés sur `/api`, c'est douze passages.
    for (let i = 0; i < 12; i += 1) {
      authenticate(req as any, reponseFactice() as any, next);
    }

    expect(verifyToken).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(12);
  });

  it('refuse toujours une requête sans jeton', () => {
    const req: Row = { cookies: {}, headers: {} };
    const res = reponseFactice();
    const next = jest.fn();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuse toujours un jeton invalide', () => {
    verifyToken.mockReturnValue(null);
    const req: Row = { cookies: { accessToken: 'jeton-pourri' }, headers: {} };
    const res = reponseFactice();
    const next = jest.fn();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireTenantAccess — une seule fois par requête et par tenant', () => {
  function requete(): Row {
    return {
      user: { userId: 'user-1', globalRole: 'USER' },
      params: { tenantId: 'tenant-A' },
      body: {},
      query: {},
      originalUrl: '/api/tenants/tenant-A/finance/stock/items'
    };
  }

  it('interroge la base au premier passage', async () => {
    const req = requete();
    const next = jest.fn();

    await requireTenantAccess(req as any, reponseFactice() as any, next);

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(req.tenantContext.tenantId).toBe('tenant-A');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("n'interroge plus la base aux onze passages suivants", async () => {
    const req = requete();
    const next = jest.fn();

    for (let i = 0; i < 12; i += 1) {
      await requireTenantAccess(req as any, reponseFactice() as any, next);
    }

    // C'EST LE CONSTAT DU FICHIER. Avant le court-circuit : douze appels a
    // `membership.findUnique` et douze a `userRole.findMany`, pour une seule
    // requete HTTP.
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(12);
  });

  it('revérifie quand le tenant change, et ne se fie pas au seul contexte', async () => {
    const req = requete();
    const next = jest.fn();

    await requireTenantAccess(req as any, reponseFactice() as any, next);

    // Le cas n'existe pas aujourd'hui, mais s'en remettre a cela serait poser
    // un piege pour plus tard : c'est le TENANT qui est compare, pas la seule
    // presence du contexte.
    req.params.tenantId = 'tenant-B';
    await requireTenantAccess(req as any, reponseFactice() as any, next);

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(req.tenantContext.tenantId).toBe('tenant-B');
  });

  it('refuse toujours un utilisateur sans acces, meme apres un passage precedent', async () => {
    findUnique.mockResolvedValue(null);
    tenantClientFindUnique.mockResolvedValue(null);

    const req = requete();
    const res = reponseFactice();
    const next = jest.fn();

    await requireTenantAccess(req as any, res as any, next);
    await requireTenantAccess(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    // Le contexte n'a jamais ete pose, donc le court-circuit ne s'applique
    // pas : le refus est reevalue, et il refuse encore.
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
