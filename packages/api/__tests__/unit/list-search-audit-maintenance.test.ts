/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recherche multicritères (lot DIV-C) : journal d'activité de l'agence
 * (`search`) et tickets de maintenance (`search`, `category`, `dateFrom/dateTo`).
 */
import './../helpers/app-shims';
import express from 'express';
import request from 'supertest';

const ticketFindMany = jest.fn();
const ticketCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    maintenanceTicket: {
      findMany: (...a: any[]) => ticketFindMany(...a),
      count: (...a: any[]) => ticketCount(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  enrichAuditLogsWithResourceLabels: jest.fn(async () => new Map())
}));
jest.mock('../../src/services/maintenance-notification-service', () => ({
  sendTicketCreatedNotification: jest.fn(),
  sendStatusChangeNotification: jest.fn()
}));

import { buildTenantAuditWhere } from '../../src/services/audit-read-service';
import { tenantAuditQuerySchema } from '../../src/lib/audit/tenant-audit-schemas';
import { getAllTickets, getTenantTickets } from '../../src/services/maintenance-ticket-service';
import * as ticketController from '../../src/controllers/maintenance-ticket-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

describe('journal d’activité — search', () => {
  it('cherche dans l’action, la ressource, l’identifiant et l’acteur, sans quitter l’agence', () => {
    const where = buildTenantAuditWhere('tenant-A', { search: ' connexion ' });
    expect(where.tenantId).toBe('tenant-A');
    expect(where.visibility).toBe('TENANT');
    expect(where.AND).toEqual([
      {
        OR: [
          { actionKey: { contains: 'connexion', mode: 'insensitive' } },
          { entityType: { contains: 'connexion', mode: 'insensitive' } },
          { entityId: { contains: 'connexion', mode: 'insensitive' } },
          { actorLabel: { contains: 'connexion', mode: 'insensitive' }, actorType: { not: 'SUPER_ADMIN' } }
        ]
      }
    ]);
  });

  it('sans recherche ni période, le where reste celui de l’agence', () => {
    expect(buildTenantAuditWhere('tenant-A', { search: '   ' })).toEqual({
      tenantId: 'tenant-A',
      visibility: 'TENANT'
    });
  });

  it('le schéma accepte search, le rogne, ignore le vide et refuse plus de 100 caractères', () => {
    expect(tenantAuditQuerySchema.parse({ search: '  login ' }).search).toBe('login');
    expect(tenantAuditQuerySchema.parse({ search: '' }).search).toBeUndefined();
    expect(tenantAuditQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    // Le schéma reste strict : tenantId ne passe toujours pas.
    expect(tenantAuditQuerySchema.safeParse({ search: 'a', tenantId: 'autre' }).success).toBe(false);
    // Dates : vraies dates du calendrier seulement.
    expect(tenantAuditQuerySchema.safeParse({ startDate: '2026-02-31' }).success).toBe(false);
    expect(tenantAuditQuerySchema.safeParse({ endDate: '2026-13-45' }).success).toBe(false);
    expect(tenantAuditQuerySchema.safeParse({ endDate: '2026-02-28' }).success).toBe(true);
  });
});

describe('service des tickets — where', () => {
  beforeEach(() => {
    ticketFindMany.mockReset().mockResolvedValue([]);
    ticketCount.mockReset().mockResolvedValue(0);
  });

  it('getAllTickets : recherche libre, catégorie et assignedVendorId restent dans le where de l’agence', async () => {
    await getAllTickets('t1', {
      search: 'fuite',
      category: 'PLUMBING' as any,
      assignedVendorId: 'v-etranger',
      propertyId: 'p-etranger'
    });
    const where = ticketFindMany.mock.calls[0][0].where;
    expect(where.tenant_id).toBe('t1');
    expect(where.category).toBe('PLUMBING');
    expect(where.assigned_vendor_id).toBe('v-etranger');
    expect(where.property_id).toBe('p-etranger');
    const contains = { contains: 'fuite', mode: 'insensitive' };
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { title: contains },
        { description: contains },
        { property: { is: { OR: [{ title: contains }, { address: contains }, { internalReference: contains }] } } },
        { assignedVendor: { is: { name: contains } } }
      ])
    );
  });

  it('getTenantTickets : priorité, catégorie, recherche et période en plus des filtres existants', async () => {
    const dateFrom = new Date('2026-10-01T00:00:00.000Z');
    const dateTo = new Date('2026-10-31T23:59:59.999Z');
    await getTenantTickets('t1', {
      status: 'DECLARED' as any,
      priority: 'HIGH' as any,
      search: 'clim',
      dateFrom,
      dateTo
    });
    const where = ticketFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenant_id: 't1',
      status: 'DECLARED',
      priority: 'HIGH',
      created_at: { gte: dateFrom, lte: dateTo }
    });
    expect(where.OR).toBeDefined();
  });

  it('sans filtre, le where ne porte que l’agence', async () => {
    await getAllTickets('t1', {});
    expect(ticketFindMany.mock.calls[0][0].where).toEqual({ tenant_id: 't1' });
  });
});

describe('contrôleur des tickets — validation', () => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.tenantContext = { tenantId: 't1' };
    req.user = { userId: 'u1' };
    next();
  });
  app.get('/admin/tickets', ticketController.listAllTicketsHandler);
  app.get('/tenant/tickets', ticketController.listTenantTicketsHandler);
  app.use(errorHandler);

  beforeEach(() => {
    ticketFindMany.mockReset().mockResolvedValue([]);
    ticketCount.mockReset().mockResolvedValue(0);
  });

  it('transmet recherche, catégorie et période (la fin couvre toute la journée)', async () => {
    const res = await request(app).get(
      '/admin/tickets?search=%20fuite%20&category=PLUMBING&dateFrom=2026-10-01&dateTo=2026-10-31&priority=HIGH'
    );
    expect(res.status).toBe(200);
    const where = ticketFindMany.mock.calls[0][0].where;
    expect(where.category).toBe('PLUMBING');
    expect(where.priority).toBe('HIGH');
    expect(where.created_at.gte).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(where.created_at.lte).toEqual(new Date('2026-10-31T23:59:59.999Z'));
    expect(where.OR[0]).toEqual({ title: { contains: 'fuite', mode: 'insensitive' } });
  });

  it.each([
    '/admin/tickets?category=CUISINE',
    '/admin/tickets?dateFrom=pas-une-date',
    '/admin/tickets?dateTo=2026-02-31',
    '/admin/tickets?dateFrom=2026-13-45',
    `/admin/tickets?search=${'a'.repeat(101)}`,
    '/tenant/tickets?priority=MAX',
    '/tenant/tickets?dateFrom=n-importe-quoi'
  ])('%s répond 400 sans interroger la base', async url => {
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  it('la liste côté locataire accepte la recherche', async () => {
    const res = await request(app).get('/tenant/tickets?search=porte&category=AC');
    expect(res.status).toBe(200);
    const where = ticketFindMany.mock.calls[0][0].where;
    expect(where.category).toBe('AC');
    expect(where.OR).toBeDefined();
  });
});
