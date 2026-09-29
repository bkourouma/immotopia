/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-29-010 — un prestataire en doublon répondait 500 « Échec de la
 * création du prestataire » : le service levait une `Error` « …existe deja… »
 * (sans accent) que le contrôleur cherchait sous « existe déjà ». Le refus est
 * maintenant une `ConflictError` typée : 409 et message français explicite,
 * à la création comme à la modification.
 */

import express from 'express';
import request from 'supertest';

const providers: Array<Record<string, any>> = [];

const mockPrisma: Record<string, any> = {
  serviceProvider: {
    findFirst: jest.fn(async ({ where }: any) => {
      const wanted = where.name?.equals?.toLowerCase();
      return (
        providers.find(
          p =>
            p.tenantId === where.tenantId &&
            (wanted === undefined || p.name.toLowerCase() === wanted) &&
            (where.id?.not === undefined || p.id !== where.id.not) &&
            (typeof where.id !== 'string' || p.id === where.id)
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: any) => {
      const created = { id: `p-${providers.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      providers.push(created);
      return created;
    }),
    update: jest.fn(async () => {
      throw new Error('ne doit pas être atteint');
    })
  },
  maintenanceVendor: { upsert: jest.fn(async ({ create }: any) => ({ ...create })) }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { createVendorHandler, updateVendorHandler } from '../../src/controllers/maintenance-vendor-controller';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { userId: 'user-1' };
  req.tenantContext = { tenantId: 'tenant-a' };
  next();
});
app.post('/vendors', createVendorHandler);
app.patch('/vendors/:vendorId', updateVendorHandler);

beforeEach(() => {
  providers.length = 0;
  providers.push(
    { id: 'p-1', tenantId: 'tenant-a', name: 'Plomberie Express OI', phone: null, email: null, specialty: null },
    { id: 'p-2', tenantId: 'tenant-a', name: 'Électricité Bamba', phone: null, email: null, specialty: null }
  );
  jest.clearAllMocks();
});

describe('prestataire en doublon : 409 explicite, jamais 500', () => {
  it('la création refuse un nom déjà pris dans l’agence (casse ignorée)', async () => {
    const res = await request(app).post('/vendors').send({ name: 'plomberie express oi' });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Un prestataire nommé « plomberie express oi » existe déjà dans votre agence.');
    expect(mockPrisma.serviceProvider.create).not.toHaveBeenCalled();
  });

  it('la modification refuse le nom d’un autre prestataire (409)', async () => {
    const res = await request(app).patch('/vendors/p-2').send({ name: 'Plomberie Express OI' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('existe déjà dans votre agence');
    expect(mockPrisma.serviceProvider.update).not.toHaveBeenCalled();
  });

  it('un nom déjà pris dans une autre agence ne gêne pas', async () => {
    providers.push({ id: 'p-9', tenantId: 'tenant-b', name: 'Peinture Kouassi' });

    const res = await request(app).post('/vendors').send({ name: 'Peinture Kouassi' });

    expect(res.status).toBe(201);
  });
});
