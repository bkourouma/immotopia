/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * D26 : le détail, les commentaires et les pièces d'un ticket contrôlent
 * l'appartenance à N'IMPORTE QUEL bail du périmètre du locataire (H29).
 */
const prismaMock: any = {
  maintenanceTicket: { findFirst: jest.fn() },
  tenantClient: { findFirst: jest.fn().mockResolvedValue(null) },
  crmContact: { findFirst: jest.fn() },
  rentalLease: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

import { findTenantPortalTicket, tenantPortalTicketWhere } from '../../src/lib/maintenance/portal-visibility';
import { TenantPortalController } from '../../src/controllers/tenant-portal-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const L1 = '00000000-0000-4000-8000-000000000001';
const L2 = '00000000-0000-4000-8000-000000000002';
const T1 = '00000000-0000-4000-8000-0000000000a1';

describe('périmètre multi-baux des tickets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('le filtre couvre tous les baux du périmètre, ou le seul bail par défaut', () => {
    expect(tenantPortalTicketWhere({ tenantId: 't', leaseId: L1, leaseIds: [L1, L2] })).toEqual({
      tenant_id: 't',
      OR: [{ lease_id: { in: [L1, L2] } }]
    });
    expect(tenantPortalTicketWhere({ tenantId: 't', leaseId: L1 }).OR).toEqual([{ lease_id: { in: [L1] } }]);
  });

  it("un ticket d'un autre bail du locataire est visible ; hors périmètre : null (404)", async () => {
    prismaMock.maintenanceTicket.findFirst.mockResolvedValueOnce({ id: T1 });
    const found = await findTenantPortalTicket(
      { tenantId: 't', tenantClientId: 'c', leaseId: L1, leaseIds: [L1, L2] },
      T1
    );
    expect(found).toEqual({ id: T1 });
    expect(JSON.stringify(prismaMock.maintenanceTicket.findFirst.mock.calls[0][0].where)).toContain(L2);

    prismaMock.maintenanceTicket.findFirst.mockResolvedValueOnce(null);
    expect(await findTenantPortalTicket({ tenantId: 't', tenantClientId: 'c', leaseId: L1 }, T1)).toBeNull();
  });

  it('périmètre de baux vide : 403, sans repli sur le bail du contexte', async () => {
    prismaMock.rentalLease.findMany.mockResolvedValue([]);
    const res: any = { statusCode: 200, body: undefined, headersSent: false };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: any) => ((res.body = b), res);
    const req: any = {
      tenantPortal: { tenantClientId: 'c', leaseId: L1, tenantId: 't' },
      query: {},
      params: { id: T1 },
      body: {},
      headers: {},
      path: '/x'
    };
    await new TenantPortalController().getMaintenanceTicketDetails(req, res, (err?: unknown) =>
      errorHandler(err as Error, req, res, () => undefined)
    );
    expect(res.statusCode).toBe(403);
  });
});
