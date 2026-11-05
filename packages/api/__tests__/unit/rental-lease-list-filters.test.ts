/**
 * Listes Baux et Échéances : recherche libre étendue (bien, locataire) et période
 * d'échéance. Prisma est mocké ; on contrôle le `where` produit et la validation (400).
 */
const leaseFindMany = jest.fn();
const leaseCount = jest.fn();
const installmentFindMany = jest.fn();
const installmentCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: {
      findMany: (...a: unknown[]) => leaseFindMany(...a),
      count: (...a: unknown[]) => leaseCount(...a)
    },
    rentalInstallment: {
      findMany: (...a: unknown[]) => installmentFindMany(...a),
      count: (...a: unknown[]) => installmentCount(...a)
    }
  }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(),
  validateStatusTransition: jest.fn()
}));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/tenant-service', () => ({ getTenantById: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({ assertThirdPartyAllowedForTenant: jest.fn() }));
jest.mock('../../src/services/rental-document-service', () => ({ toRentalDocumentDto: jest.fn() }));

import { listLeases } from '../../src/services/rental-lease-service';
import { listInstallments } from '../../src/services/rental-installment-service';
import {
  parseInstallmentListExtras,
  parseLeaseListExtras,
  applyInstallmentListExtras
} from '../../src/lib/rental/lease-list-filters';
import { BadRequestError } from '../../src/middleware/error-middleware';

describe('listLeases : where', () => {
  beforeEach(() => {
    leaseFindMany.mockReset().mockResolvedValue([]);
    leaseCount.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => leaseFindMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listLeases('T1');
    expect(whereOf()).toEqual({ tenant_id: 'T1' });
  });

  it('un identifiant reçu reste dans le where de l agence', async () => {
    await listLeases('T1', { propertyId: 'P9', primaryRenterClientId: 'C3' });
    expect(whereOf()).toEqual({ tenant_id: 'T1', property_id: 'P9', primary_renter_client_id: 'C3' });
  });

  it('la recherche couvre n° de bail, bien et locataire, sans OR racine', async () => {
    await listLeases('T1', { search: 'koné', status: 'ACTIVE' as any });
    const where = whereOf();
    expect(where.tenant_id).toBe('T1');
    expect(where.status).toBe('ACTIVE');
    expect(where.OR).toBeUndefined();
    const or = where.AND[0].OR;
    expect(or).toContainEqual({ lease_number: { contains: 'koné', mode: 'insensitive' } });
    expect(or).toContainEqual({ property: { title: { contains: 'koné', mode: 'insensitive' } } });
    expect(or).toContainEqual({ property: { address: { contains: 'koné', mode: 'insensitive' } } });
    expect(or).toContainEqual({ property: { internalReference: { contains: 'koné', mode: 'insensitive' } } });
    expect(or).toContainEqual({ primaryRenter: { user: { fullName: { contains: 'koné', mode: 'insensitive' } } } });
    expect(or).toContainEqual({ primaryRenter: { user: { email: { contains: 'koné', mode: 'insensitive' } } } });
  });
});

describe('listInstallments : where', () => {
  beforeEach(() => {
    installmentFindMany.mockReset().mockResolvedValue([]);
    installmentCount.mockReset().mockResolvedValue(0);
  });
  const whereOf = () => installmentFindMany.mock.calls[0][0].where;

  it('sans filtre : seulement l agence', async () => {
    await listInstallments('T1');
    expect(whereOf()).toEqual({ tenant_id: 'T1' });
  });

  it('un identifiant reçu reste dans le where de l agence', async () => {
    await listInstallments('T1', { leaseId: 'L1', renterClientId: 'C2' });
    expect(whereOf()).toEqual({ tenant_id: 'T1', lease_id: 'L1', lease: { primary_renter_client_id: 'C2' } });
  });

  it('la recherche passe par le bail ; le OR du statut en retard est conservé (AND)', async () => {
    await listInstallments('T1', { status: 'OVERDUE' as any, search: 'villa' });
    const where = whereOf();
    expect(where.tenant_id).toBe('T1');
    expect(where.OR).toHaveLength(2);
    const or = where.AND[0].OR;
    expect(or).toContainEqual({ lease: { lease_number: { contains: 'villa', mode: 'insensitive' } } });
    expect(or).toContainEqual({ lease: { property: { title: { contains: 'villa', mode: 'insensitive' } } } });
    expect(or).toContainEqual({
      lease: { primaryRenter: { user: { fullName: { contains: 'villa', mode: 'insensitive' } } } }
    });
  });

  it('la période d échéance est inclusive et n écrase pas le filtre de retard', async () => {
    await listInstallments('T1', { overdue: true, dueFrom: '2026-01-01', dueTo: '2026-01-31' });
    const where = whereOf();
    expect(where.due_date.lt).toBeInstanceOf(Date);
    expect(where.AND).toEqual([
      { due_date: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') } }
    ]);
  });

  it('applyInstallmentListExtras complète un AND existant', () => {
    const where: any = { tenant_id: 'T1', AND: [{ x: 1 }] };
    applyInstallmentListExtras(where, { dueFrom: '2026-02-01' });
    expect(where.AND).toEqual([{ x: 1 }, { due_date: { gte: new Date('2026-02-01T00:00:00.000Z') } }]);
  });
});

describe('parse des paramètres', () => {
  it('search : trim, vide = absent', () => {
    expect(parseLeaseListExtras({ search: '  aya ' })).toEqual({ search: 'aya' });
    expect(parseLeaseListExtras({ search: '  ' })).toEqual({ search: undefined });
  });

  it('échéances : jours valides acceptés', () => {
    expect(parseInstallmentListExtras({ dueFrom: '2026-01-01', dueTo: '2026-01-31' })).toMatchObject({
      dueFrom: '2026-01-01',
      dueTo: '2026-01-31'
    });
  });

  it('valeur invalide : 400', () => {
    expect(() => parseLeaseListExtras({ search: ['a', 'b'] as any })).toThrow(BadRequestError);
    expect(() => parseLeaseListExtras({ search: 'x'.repeat(201) })).toThrow(BadRequestError);
    expect(() => parseInstallmentListExtras({ dueFrom: 'hier' })).toThrow(BadRequestError);
    expect(() => parseInstallmentListExtras({ dueFrom: '2026-02-31' })).toThrow(BadRequestError);
    expect(() => parseInstallmentListExtras({ dueFrom: '2026-03-02', dueTo: '2026-03-01' })).toThrow(BadRequestError);
  });
});
