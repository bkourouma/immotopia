/**
 * Revue d'effectivité maintenance (lot 4, 2026-11-20) : contrat HTTP du contrôleur de tickets.
 * Un corps ou un filtre illisible est un 400 (jamais un 500), et les écritures
 * renvoient aussi les champs camelCase que décrit `TicketResponse` côté web.
 * Services remplacés : aucune base n'est requise.
 */
const mockPrisma: Record<string, any> = {
  maintenanceTicket: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  crmContact: { findFirst: jest.fn() }
};
const mockCreateTicket = jest.fn();
const mockAddComment = jest.fn();
const mockGetAllTickets = jest.fn();
const mockGetTenantTickets = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/maintenance-ticket-service', () => ({
  createTicket: (...a: unknown[]) => mockCreateTicket(...a),
  getTenantTickets: (...a: unknown[]) => mockGetTenantTickets(...a),
  getAllTickets: (...a: unknown[]) => mockGetAllTickets(...a),
  getTicketById: jest.fn(),
  cancelTicket: jest.fn(),
  deleteTicket: jest.fn(),
  updateTenantTicket: jest.fn(),
  updateTicket: jest.fn(),
  getPropertyMaintenanceHistory: jest.fn()
}));
jest.mock('../../src/services/maintenance-comment-service', () => ({
  addComment: (...a: unknown[]) => mockAddComment(...a),
  addManagerComment: jest.fn()
}));

import * as handlers from '../../src/controllers/maintenance-ticket-controller';

const TENANT = 'tenant-a';
const UUID = '3f6b0f6e-9b1e-4c1c-8a52-0c1f2f4b9a11';

function resMock() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('contrôleur de tickets : requête illisible', () => {
  const baseReq = (over: Record<string, unknown> = {}): any => ({
    params: { tenantId: TENANT, ticketId: UUID },
    query: {},
    body: {},
    user: { userId: 'u1' },
    crmTenantId: TENANT,
    ...over
  });

  it('création : un titre trop court répond 400 avec le motif, sans 500', async () => {
    const res = resMock();
    await handlers.createTicketHandler(
      baseReq({
        body: {
          title: 'ab',
          category: 'PLUMBING',
          priority: 'LOW',
          description: 'Une description assez longue',
          propertyId: UUID
        }
      }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toContain('au moins 3 caractères');
    expect(body.errors[0].field).toBe('title');
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('création : un champ absent répond 400', async () => {
    const res = resMock();
    await handlers.createTicketHandler(baseReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('création : la réponse porte les champs camelCase du contrat web ET les clés d’origine', async () => {
    mockCreateTicket.mockResolvedValue({
      id: UUID,
      tenant_id: TENANT,
      property_id: 'p1',
      title: 'Fuite',
      status: 'DECLARED',
      declared_at: new Date('2026-11-20T10:00:00Z'),
      created_at: new Date('2026-11-20T10:00:00Z'),
      updated_at: new Date('2026-11-20T10:00:00Z')
    });
    const res = resMock();
    await handlers.createTicketHandler(
      baseReq({
        body: {
          title: 'Fuite',
          category: 'PLUMBING',
          priority: 'LOW',
          description: 'Fuite sous évier',
          propertyId: UUID
        }
      }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const { data } = res.json.mock.calls[0][0];
    expect(data.propertyId).toBe('p1');
    expect(data.declaredAt).toBeInstanceOf(Date);
    expect(data.property_id).toBe('p1');
  });

  it('commentaire vide : 400, pas 500', async () => {
    mockPrisma.maintenanceTicket.findFirst.mockResolvedValue({ tenant_contact_id: 'c1' });
    const res = resMock();
    await handlers.addCommentHandler(baseReq({ body: { content: '' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('liste agence : assignedVendorId mal formé répond 400 sans interroger la base', async () => {
    const res = resMock();
    await handlers.listAllTicketsHandler(baseReq({ query: { assignedVendorId: 'pas-un-uuid' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetAllTickets).not.toHaveBeenCalled();
  });

  it('liste « locataire » : leaseId mal formé ou répété répond 400', async () => {
    for (const leaseId of ['abc', ['a', 'b']]) {
      const res = resMock();
      await handlers.listTenantTicketsHandler(baseReq({ query: { leaseId } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockGetTenantTickets).not.toHaveBeenCalled();
  });

  it('liste agence : un assignedVendorId valide est transmis au service', async () => {
    mockGetAllTickets.mockResolvedValue({ tickets: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    const res = resMock();
    await handlers.listAllTicketsHandler(baseReq({ query: { assignedVendorId: UUID } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetAllTickets.mock.calls[0][1]).toMatchObject({ assignedVendorId: UUID });
  });
});
