/**
 * Balayage B6 — `GET /tenants/:tenantId/properties/:id/status/history` :
 * comme les mandats, la route n'est protegee que par
 * `enforcePropertyTenantIsolation` (verifie qu'un contexte tenant existe,
 * jamais que `:id` lui appartient). `getStatusHistoryHandler` ne lisait meme
 * pas `tenantId` et appelait `getStatusHistory(propertyId, limit)` sans
 * aucune verification d'agence : n'importe quel utilisateur authentifie
 * pouvait lire l'historique de statut d'un bien d'une autre agence en
 * connaissant son id.
 */

const getPropertyById = jest.fn();
const propertyStatusHistoryFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    propertyStatusHistory: { findMany: (...a: any[]) => propertyStatusHistoryFindMany(...a) }
  }
}));

jest.mock('../../src/services/property-service', () => ({
  getPropertyById: (...a: any[]) => getPropertyById(...a)
}));

import { getStatusHistory } from '../../src/services/property-status-service';
import { getStatusHistoryHandler } from '../../src/controllers/property-status-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('getStatusHistory (service) — isolation par agence', () => {
  it("refuse de lire l'historique d'un bien d'une autre agence", async () => {
    getPropertyById.mockResolvedValue(null);

    await expect(getStatusHistory('p1', 'tenant-A')).rejects.toThrow();
    expect(propertyStatusHistoryFindMany).not.toHaveBeenCalled();
  });

  it("lit l'historique d'un bien de sa propre agence", async () => {
    getPropertyById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-A' });
    propertyStatusHistoryFindMany.mockResolvedValue([{ id: 'h1' }]);

    const history = await getStatusHistory('p1', 'tenant-A');
    expect(history).toHaveLength(1);
  });
});

describe('getStatusHistoryHandler (controller) — tenantId requis', () => {
  it('400 quand aucun contexte tenant n\'est disponible', async () => {
    const req: any = { params: { id: 'p1' }, tenantContext: undefined, query: {} };
    const res = mockRes();

    await getStatusHistoryHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPropertyById).not.toHaveBeenCalled();
  });
});
