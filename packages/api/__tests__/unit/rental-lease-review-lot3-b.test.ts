/**
 * Revue fonctionnelle du 2026-11-20, lot 3 (suite) : contrôleur de modification
 * du bail, source de signature « bail », rattachement d'un document.
 */

type Row = Record<string, any>;

const updateLease = jest.fn(async (..._args: any[]) => ({ id: 'lease-1', installmentsRepriced: 0 }));
jest.mock('../../src/services/rental-lease-service', () => ({
  createLease: jest.fn(),
  getLeaseById: jest.fn(),
  updateLease: (...a: any[]) => (updateLease as any)(...a),
  listLeases: jest.fn(),
  updateLeaseStatus: jest.fn(),
  addCoRenter: jest.fn(),
  removeCoRenter: jest.fn(),
  listCoRenters: jest.fn(),
  deleteLease: jest.fn()
}));

const leaseRow: Row = { id: 'lease-1', status: 'ACTIVE', signed_at: null };
const installmentRow: Row = { id: 'inst-1', tenant_id: 'tenant-a', lease_id: 'lease-1' };
const paymentRow: Row = { id: 'pay-1', tenant_id: 'tenant-a', lease_id: 'lease-1' };
const documentCreate = jest.fn(async ({ data }: Row) => ({ id: 'doc-1', ...data }));

const mockPrisma: Row = {
  rentalLease: { findFirst: jest.fn(async () => ({ ...leaseRow })) },
  rentalInstallment: { findFirst: jest.fn(async () => ({ ...installmentRow })) },
  rentalPayment: { findFirst: jest.fn(async () => ({ ...paymentRow })) },
  rentalDocument: { count: jest.fn(async () => 0), create: (...a: any[]) => (documentCreate as any)(...a) }
};
jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/lib/signature/cancel', () => ({ cancelOpenRequestsForTarget: jest.fn() }));

import { updateLeaseHandler } from '../../src/controllers/rental-controller';
import { generateDocument } from '../../src/services/rental-document-service';
import { leaseContractSource } from '../../src/lib/signature/sources/lease-contract';

function run(handler: any, req: Row): Promise<{ status?: number; body?: any; error?: any }> {
  return new Promise(resolve => {
    const res: Row = {
      status(code: number) {
        res.code = code;
        return res;
      },
      json(body: any) {
        resolve({ status: res.code ?? 200, body });
        return res;
      }
    };
    handler(req, res, (error: any) => resolve({ error }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  leaseRow.signed_at = null;
  leaseRow.status = 'ACTIVE';
});

describe('PATCH bail : une date vide ne part pas en base', () => {
  const req = (body: Row) => ({
    params: { tenantId: 'tenant-a', leaseId: 'lease-1' },
    crmTenantId: 'tenant-a',
    user: { userId: 'u1' },
    body
  });

  it('traite une date vide comme absente (inchangée), pas comme une chaîne envoyée au service', async () => {
    const result = await run(updateLeaseHandler, req({ endDate: '', moveInDate: '  ', notes: 'x' }));
    expect(result.error).toBeUndefined();
    const data = updateLease.mock.calls[0][2] as Row;
    expect('endDate' in data).toBe(false);
    expect('moveInDate' in data).toBe(false);
    expect(data.notes).toBe('x');
  });

  it('garde null comme « retirer la date »', async () => {
    await run(updateLeaseHandler, req({ endDate: null }));
    expect((updateLease.mock.calls[0][2] as Row).endDate).toBeNull();
  });
});

describe('source de signature « bail » : pas de seconde signature', () => {
  const ctx: any = { tenantId: 'tenant-a', userId: 'u1' };

  it('refuse (409) un bail déjà signé', async () => {
    leaseRow.signed_at = new Date('2026-10-01');
    await expect(leaseContractSource.assertTarget(ctx, 'lease-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ce bail est déjà signé : il ne peut pas être envoyé une seconde fois en signature.'
    });
  });

  it('accepte un bail actif non signé', async () => {
    await expect(leaseContractSource.assertTarget(ctx, 'lease-1')).resolves.toBeUndefined();
  });
});

describe('generateDocument : échéance et paiement doivent appartenir au bail désigné', () => {
  it("refuse l'échéance d'un autre bail de l'agence", async () => {
    installmentRow.lease_id = 'lease-2';
    await expect(
      generateDocument('tenant-a', 'RENT_RECEIPT' as any, 'lease-1', 'inst-1', undefined, undefined, undefined, 'u1')
    ).rejects.toThrow('Échéance introuvable');
    expect(documentCreate).not.toHaveBeenCalled();
    installmentRow.lease_id = 'lease-1';
  });

  it("refuse le paiement d'un autre bail de l'agence", async () => {
    paymentRow.lease_id = 'lease-2';
    await expect(
      generateDocument('tenant-a', 'RENT_RECEIPT' as any, 'lease-1', undefined, 'pay-1', undefined, undefined, 'u1')
    ).rejects.toThrow('Paiement introuvable');
    expect(documentCreate).not.toHaveBeenCalled();
    paymentRow.lease_id = 'lease-1';
  });

  it('accepte des références cohérentes', async () => {
    await generateDocument('tenant-a', 'RENT_RECEIPT' as any, 'lease-1', 'inst-1', 'pay-1', undefined, undefined, 'u1');
    expect(documentCreate).toHaveBeenCalledTimes(1);
  });
});
