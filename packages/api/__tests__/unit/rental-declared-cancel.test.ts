/* eslint-disable @typescript-eslint/no-explicit-any */
/** Contrat 049 §1.4 : annulation d'une déclaration par son déclarant. */
type Row = Record<string, any>;

const store = { declarations: [] as Row[] };

const mockPrisma: Row = {
  rentalPaymentDeclaration: {
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.declarations.find(
          r =>
            r.id === where.id &&
            r.tenant_id === where.tenant_id &&
            r.declared_by === where.declared_by &&
            where.lease_id.in.includes(r.lease_id)
        ) ?? null
    ),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = store.declarations.filter(
        r => r.id === where.id && r.tenant_id === where.tenant_id && r.status === where.status
      );
      found.forEach(r => Object.assign(r, data));
      return { count: found.length };
    })
  }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
const audit: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (e: Row) => audit.push(e) }));

import { cancelRentalDeclaration } from '../../src/lib/rental/declared-payment/declaration-cancel';
import { ErrorCode } from '../../src/middleware/error-middleware';

const params = (over: Row = {}) => ({
  tenantId: 'tenant-a',
  tenantClientId: 'client-1',
  leaseIds: ['lease-1'],
  declarationId: 'decl-1',
  ...over
});

beforeEach(() => {
  audit.length = 0;
  store.declarations = [
    {
      id: 'decl-1',
      tenant_id: 'tenant-a',
      declared_by: 'client-1',
      lease_id: 'lease-1',
      status: 'PENDING',
      amount: 1000
    }
  ];
});

describe('cancelRentalDeclaration', () => {
  it('annule une déclaration PENDING du déclarant et journalise', async () => {
    await expect(cancelRentalDeclaration(params())).resolves.toEqual({ declarationId: 'decl-1' });
    expect(store.declarations[0]).toMatchObject({ status: 'CANCELED' });
    expect(store.declarations[0].canceled_at).toBeInstanceOf(Date);
    expect(audit[0]).toMatchObject({ actionKey: 'RENTAL_PAYMENT_DECLARATION_CANCELED', tenantId: 'tenant-a' });
  });

  it('répond 409 ALREADY_REVIEWED si elle a déjà quitté PENDING', async () => {
    store.declarations[0].status = 'APPROVED';
    await expect(cancelRentalDeclaration(params())).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.RENTAL_DECLARATION_ALREADY_REVIEWED
    });
  });

  it('répond 404 pour un autre locataire, un autre bail ou une autre agence', async () => {
    await expect(cancelRentalDeclaration(params({ tenantClientId: 'client-2' }))).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(cancelRentalDeclaration(params({ leaseIds: ['lease-9'] }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(cancelRentalDeclaration(params({ tenantId: 'tenant-b' }))).rejects.toMatchObject({ statusCode: 404 });
    expect(store.declarations[0].status).toBe('PENDING');
  });
});
