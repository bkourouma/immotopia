/**
 * BUG-2026-09-29-010 : un prestataire en doublon (casse/espaces ignorés) est
 * refusé par une ConflictError 409 typée, avec errors[{ field: 'name' }], au
 * lieu d'un 500 générique. Un P2002 (index unique) donne la même réponse.
 */
const mockPrisma: Record<string, any> = {
  serviceProvider: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  maintenanceVendor: { upsert: jest.fn() }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { ConflictError } from '../../src/middleware/error-middleware';
import { createVendor, updateVendor } from '../../src/services/maintenance-vendor-service';
import { createVendorHandler } from '../../src/controllers/maintenance-vendor-controller';

describe('prestataire de maintenance en doublon', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuse la création par ConflictError 409 portant errors[name]', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValue({ id: 'p1', name: 'Plomberie Express' });
    const error = await createVendor('tenant-a', { name: '  plomberie express  ' } as any).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain('existe déjà');
    expect(error.errors).toEqual([{ field: 'name', message: error.message }]);
    expect(mockPrisma.serviceProvider.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: 'tenant-a',
      name: { equals: 'plomberie express', mode: 'insensitive' }
    });
    expect(mockPrisma.serviceProvider.create).not.toHaveBeenCalled();
  });

  it('traduit un P2002 concurrent en ConflictError', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValue(null);
    mockPrisma.serviceProvider.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createVendor('tenant-a', { name: 'Nouveau' } as any)).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuse la modification vers un nom déjà pris', async () => {
    mockPrisma.serviceProvider.findFirst
      .mockResolvedValueOnce({ id: 'p2', tenantId: 'tenant-a', name: 'Autre' })
      .mockResolvedValueOnce({ id: 'p1', name: 'Plomberie Express' });
    await expect(updateVendor('tenant-a', 'p2', { name: 'PLOMBERIE EXPRESS' } as any, 'u1')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('le contrôleur confie la ConflictError au middleware (pas de 500)', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValue({ id: 'p1', name: 'Plomberie Express' });
    const req: any = {
      params: { tenantId: 'tenant-a' },
      body: { name: 'Plomberie Express' },
      user: { userId: 'u1' },
      crmTenantId: 'tenant-a'
    };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await createVendorHandler(req, res, next);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
  });
});
