/**
 * Balayage B6 — `GET /tenants/:tenantId/properties/:id/mandates` : la route
 * n'est protegee que par `enforcePropertyTenantIsolation`, qui verifie
 * seulement qu'un contexte tenant existe, jamais que `:id` lui appartient.
 * Avant correction, `getPropertyMandates(propertyId)` ne prenait meme pas de
 * `tenantId` et renvoyait tous les mandats actifs du bien, quelle que soit
 * l'agence appelante — un utilisateur authentifie pouvait donc lire, pour un
 * `id` de bien trouve ailleurs, quelles AUTRES agences detiennent un mandat
 * dessus (nom de l'agence, coordonnees du proprietaire).
 *
 * `property-mandate-service.ts` porte une erreur TypeScript ancienne
 * (`CreateMandateRequest` sans champ `scope`, utilise par `createMandate`)
 * que `ts-jest` refuse des qu'un test l'importe, meme pour tester une autre
 * fonction du meme fichier (`tsc --noEmit` en mode projet complet la tolere,
 * pas la compilation par-fichier de `ts-jest` — meme situation que
 * `services/audit-service.ts` documentee en tete de
 * `lib/patrimoine/queries.ts`). Ce test verifie donc la plomberie au niveau
 * du controleur, service mocke, plutot que d'importer le service reel.
 */

const getPropertyMandates = jest.fn();

jest.mock('../../src/services/property-mandate-service', () => ({
  createMandate: jest.fn(),
  revokeMandate: jest.fn(),
  getPropertyMandates: (...a: any[]) => getPropertyMandates(...a),
  getTenantMandates: jest.fn()
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  getTenantIdFromRequest: (req: any) => req.tenantContext?.tenantId
}));

import { getPropertyMandatesHandler } from '../../src/controllers/property-mandate-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('getPropertyMandatesHandler — le tenantId du contexte scope la lecture', () => {
  it("passe le tenantId de l'agence appelante au service, jamais un tenantId forge ailleurs", async () => {
    getPropertyMandates.mockResolvedValue([{ id: 'mandate-A', tenantId: 'tenant-A' }]);

    const req: any = {
      params: { tenantId: 'tenant-A', id: 'p1' },
      tenantContext: { tenantId: 'tenant-A' }
    };
    const res = mockRes();

    const next = jest.fn();
    await getPropertyMandatesHandler(req, res, next);

    expect(getPropertyMandates).toHaveBeenCalledWith('p1', 'tenant-A');
    expect(next).not.toHaveBeenCalled();
  });

  it("renvoie une erreur quand le service refuse l'acces (bien d'une autre agence)", async () => {
    getPropertyMandates.mockRejectedValue(new Error('Property not found or access denied'));

    const req: any = {
      params: { tenantId: 'tenant-A', id: 'p-autre-agence' },
      tenantContext: { tenantId: 'tenant-A' }
    };
    const res = mockRes();

    const next = jest.fn();
    await getPropertyMandatesHandler(req, res, next);

    // asyncHandler : l'erreur part vers errorHandler, jamais de message brut ici.
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
