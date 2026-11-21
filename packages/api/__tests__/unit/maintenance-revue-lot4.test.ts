/**
 * Revue d'effectivité maintenance (lot 4, 2026-11-20) : non-régressions.
 *
 *  1. Un corps de requête illisible (Zod) est un 400, pas un 500.
 *  2. Un identifiant de ticket / prestataire qui n'est pas un UUID est un 404 ;
 *     un filtre `leaseId` / `assignedVendorId` mal formé est un 400.
 *  3. La liste d'assignation (`getActiveVendors`) ne réactive plus un prestataire
 *     désactivé.
 *  4. Désactiver / supprimer un prestataire assigné est un 400 typé (le contrôleur
 *     cherchait des mots accentués absents du message : 500) ; un ticket annulé
 *     ne retient pas le prestataire.
 *  5. L'annulation par l'agence date `canceled_at` ; l'annulation par la route
 *     « locataire » avertit comme les autres changements de statut.
 *
 * Prisma est remplacé : aucune base n'est requise.
 */
import express from 'express';
import request from 'supertest';

const mockPrisma: Record<string, any> = {
  maintenanceTicket: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
  maintenanceTicketStatusHistory: { create: jest.fn() },
  maintenanceTicketComment: { create: jest.fn() },
  maintenanceVendor: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  serviceProvider: { findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  maintenanceContract: { count: jest.fn() },
  crmContact: { findFirst: jest.fn() },
  membership: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn()
};

const mockSendStatusChange = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/maintenance-notification-service', () => ({
  sendTicketCreatedNotification: jest.fn().mockResolvedValue(undefined),
  sendStatusChangeNotification: (...args: unknown[]) => mockSendStatusChange(...args)
}));

import { MaintenanceTicketStatus } from '@prisma/client';
import { BadRequestError, errorHandler } from '../../src/middleware/error-middleware';
import { cancelTicket, updateTicket } from '../../src/services/maintenance-ticket-service';
import { deactivateVendor, deleteVendor, getActiveVendors } from '../../src/services/maintenance-vendor-service';
import {
  deactivateVendorHandler,
  deleteVendorHandler,
  createVendorHandler
} from '../../src/controllers/maintenance-vendor-controller';
import { parseUuidQuery, uuidPathParam } from '../../src/utils/maintenance-params';

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
  mockPrisma.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(mockPrisma) : arg));
  mockSendStatusChange.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// 1 et 2. Contrôleurs : validation de la requête
// ---------------------------------------------------------------------------
describe('identifiants de chemin et de filtre', () => {
  it('parseUuidQuery : absent → undefined, valide → valeur, sinon BadRequestError', () => {
    expect(parseUuidQuery(undefined, 'leaseId')).toBeUndefined();
    expect(parseUuidQuery('', 'leaseId')).toBeUndefined();
    expect(parseUuidQuery(UUID, 'leaseId')).toBe(UUID);
    expect(() => parseUuidQuery('x', 'leaseId')).toThrow(BadRequestError);
    expect(() => parseUuidQuery([UUID, UUID], 'leaseId')).toThrow(BadRequestError);
  });

  it('un ticketId qui n’est pas un UUID répond 404 (jamais 500) ; un UUID passe', async () => {
    const app = express();
    const router = express.Router({ mergeParams: true });
    router.param('ticketId', uuidPathParam('Ticket introuvable'));
    router.get('/tickets/:ticketId', (_req, res) => res.json({ ok: true }));
    app.use(router);
    app.use(errorHandler as any);

    const bad = await request(app).get('/tickets/abc');
    expect(bad.status).toBe(404);
    const good = await request(app).get(`/tickets/${UUID}`);
    expect(good.status).toBe(200);
  });

  it('les routes agence déclarent la garde sur ticketId et vendorId', () => {
    // Le routeur exporte ses sous-routeurs montés : on vérifie que les gardes sont posées.
    const source = require('fs').readFileSync(require.resolve('../../src/routes/maintenance-routes'), 'utf8') as string;
    expect(source).toMatch(/tenantRouter\.param\('ticketId'/);
    expect(source).toMatch(/adminRouter\.param\('ticketId'/);
    expect(source).toMatch(/adminRouter\.param\('vendorId'/);
  });
});

// ---------------------------------------------------------------------------
// 3. Prestataires
// ---------------------------------------------------------------------------
describe('liste d’assignation des prestataires', () => {
  const provider = (id: string, name: string) => ({
    id,
    tenantId: TENANT,
    name,
    phone: null,
    email: null,
    specialty: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const mirror = (id: string, isActive: boolean) => ({
    id,
    tenant_id: TENANT,
    name: id,
    phone: null,
    email: null,
    address: null,
    specialties: [],
    is_active: isActive,
    created_at: new Date(),
    updated_at: new Date()
  });

  it('ne réactive pas un prestataire désactivé et ne l’affiche pas', async () => {
    mockPrisma.serviceProvider.findMany.mockResolvedValue([provider('v1', 'Actif'), provider('v2', 'Désactivé')]);
    mockPrisma.maintenanceVendor.findMany.mockResolvedValue([mirror('v1', true), mirror('v2', false)]);

    const vendors = await getActiveVendors(TENANT);

    expect(vendors.map(v => v.id)).toEqual(['v1']);
    expect(mockPrisma.maintenanceVendor.upsert).not.toHaveBeenCalled();
  });

  it('crée le miroir d’un prestataire partagé qui n’en a pas encore', async () => {
    mockPrisma.serviceProvider.findMany.mockResolvedValue([provider('v1', 'Nouveau')]);
    mockPrisma.maintenanceVendor.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([mirror('v1', true)]);
    mockPrisma.maintenanceVendor.upsert.mockResolvedValue(mirror('v1', true));

    const vendors = await getActiveVendors(TENANT);

    expect(mockPrisma.maintenanceVendor.upsert).toHaveBeenCalledTimes(1);
    expect(vendors.map(v => v.id)).toEqual(['v1']);
  });
});

describe('désactivation et suppression d’un prestataire', () => {
  beforeEach(() => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValue({ id: 'v1', tenantId: TENANT, name: 'Plombier' });
  });

  it('désactiver : seuls les tickets ouverts comptent (pas les annulés)', async () => {
    mockPrisma.maintenanceTicket.count.mockResolvedValue(0);
    mockPrisma.maintenanceVendor.upsert.mockResolvedValue({ id: 'v1', is_active: false, specialties: [] });

    await deactivateVendor(TENANT, 'v1', 'u1');

    const where = mockPrisma.maintenanceTicket.count.mock.calls[0][0].where;
    expect(where.tenant_id).toBe(TENANT);
    expect(where.status.in).toEqual(
      expect.arrayContaining([
        MaintenanceTicketStatus.DECLARED,
        MaintenanceTicketStatus.IN_PROGRESS,
        MaintenanceTicketStatus.ASSIGNED
      ])
    );
    expect(where.status.in).not.toContain(MaintenanceTicketStatus.CANCELED);
    expect(where.status.in).not.toContain(MaintenanceTicketStatus.RESOLVED);
  });

  it('désactiver un prestataire assigné : BadRequestError 400 typée', async () => {
    mockPrisma.maintenanceTicket.count.mockResolvedValue(2);
    const error = await deactivateVendor(TENANT, 'v1', 'u1').catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.statusCode).toBe(400);
  });

  it('le contrôleur répond 400 (et non 500) pour un prestataire assigné', async () => {
    mockPrisma.maintenanceTicket.count.mockResolvedValue(2);
    for (const handler of [deactivateVendorHandler, deleteVendorHandler]) {
      const res = resMock();
      await handler(
        {
          params: { tenantId: TENANT, vendorId: 'v1' },
          user: { userId: 'u1' },
          query: {},
          body: {},
          crmTenantId: TENANT
        } as any,
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toContain('ticket(s)');
    }
  });

  it('supprimer un prestataire lié à un contrat syndic : 400', async () => {
    mockPrisma.maintenanceTicket.count.mockResolvedValue(0);
    mockPrisma.maintenanceContract.count.mockResolvedValue(1);
    const error = await deleteVendor(TENANT, 'v1', 'u1').catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
  });

  it('prestataire inexistant ou d’une autre agence : 404', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValue(null);
    const res = resMock();
    await deactivateVendorHandler(
      {
        params: { tenantId: TENANT, vendorId: 'v9' },
        user: { userId: 'u1' },
        query: {},
        body: {},
        crmTenantId: TENANT
      } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('création : un corps illisible est confié au middleware central (400), pas un 500', async () => {
    const res = resMock();
    const next = jest.fn();
    await createVendorHandler(
      { params: { tenantId: TENANT }, body: { name: 'x' }, user: { userId: 'u1' }, crmTenantId: TENANT } as any,
      res,
      next
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

// ---------------------------------------------------------------------------
// 5. Annulation
// ---------------------------------------------------------------------------
describe('annulation d’un ticket', () => {
  const ticket = (status: string) => ({
    id: UUID,
    tenant_id: TENANT,
    status,
    canceled_at: null,
    in_progress_at: null,
    assigned_at: null,
    resolved_at: null,
    assigned_vendor_id: null,
    assigned_to_user_id: null
  });

  it('l’agence qui annule via la fiche gestionnaire date l’annulation', async () => {
    mockPrisma.maintenanceTicket.findFirst.mockResolvedValue(ticket('DECLARED'));
    mockPrisma.maintenanceTicket.update.mockImplementation(async ({ data }: any) => ({
      ...ticket('DECLARED'),
      ...data
    }));

    await updateTicket(TENANT, UUID, { status: 'CANCELED' } as any, 'u1');

    const data = mockPrisma.maintenanceTicket.update.mock.calls[0][0].data;
    expect(data.status).toBe('CANCELED');
    expect(data.canceled_at).toBeInstanceOf(Date);
    expect(mockSendStatusChange).toHaveBeenCalledWith(TENANT, UUID, 'DECLARED', 'CANCELED');
  });

  it('la route « locataire » avertit comme les autres changements de statut', async () => {
    mockPrisma.maintenanceTicket.findFirst.mockResolvedValue(ticket('IN_PROGRESS'));
    mockPrisma.maintenanceTicket.update.mockResolvedValue({ ...ticket('CANCELED'), property: null });

    await cancelTicket(TENANT, UUID, undefined, 'u1');

    expect(mockSendStatusChange).toHaveBeenCalledWith(TENANT, UUID, 'IN_PROGRESS', 'CANCELED');
  });

  it('un ticket introuvable lève une erreur 404 typée (message inchangé)', async () => {
    mockPrisma.maintenanceTicket.findFirst.mockResolvedValue(null);
    const error = await cancelTicket(TENANT, UUID).catch(e => e);
    expect(error.status).toBe(404);
    expect(error.message).toBe('Ticket introuvable');
  });

  it('un ticket résolu ne s’annule pas : 400 typé', async () => {
    mockPrisma.maintenanceTicket.findFirst.mockResolvedValue(ticket('RESOLVED'));
    const error = await cancelTicket(TENANT, UUID).catch(e => e);
    expect(error.status).toBe(400);
  });
});
