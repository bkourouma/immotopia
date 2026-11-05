/**
 * Listes du portail locataire : paramètres de recherche (échéances, historique
 * des paiements, tickets). Le périmètre reste le bail de la session.
 */
const installmentFindMany = jest.fn();
const installmentCount = jest.fn();
const paymentFindMany = jest.fn();
const paymentAggregate = jest.fn();
const declarationFindMany = jest.fn();
const ticketFindMany = jest.fn();
const ticketCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: {
      findMany: (...a: unknown[]) => installmentFindMany(...a),
      count: (...a: unknown[]) => installmentCount(...a)
    },
    rentalPayment: {
      findMany: (...a: unknown[]) => paymentFindMany(...a),
      aggregate: (...a: unknown[]) => paymentAggregate(...a)
    },
    rentalPaymentDeclaration: { findMany: (...a: unknown[]) => declarationFindMany(...a) },
    maintenanceTicket: {
      findMany: (...a: unknown[]) => ticketFindMany(...a),
      count: (...a: unknown[]) => ticketCount(...a)
    }
  }
}));

const VISIBILITY = { OR: [{ lease_id: 'L1' }, { tenant_contact_id: 'C1' }] };
jest.mock('../../src/lib/maintenance/portal-visibility', () => ({
  tenantPortalTicketFilter: jest.fn(async () => VISIBILITY),
  findTenantPortalTicket: jest.fn(),
  resolveTenantPortalCrmContactId: jest.fn()
}));

import { TenantPortalService } from '../../src/services/tenant-portal-service';
import {
  buildInstallmentSearchClauses,
  parseTenantPortalInstallmentsQuery,
  parseTenantPortalMaintenanceQuery,
  parseTenantPortalPaymentsQuery
} from '../../src/services/portal-list-filters/tenant-portal-list-filters';
import { BadRequestError } from '../../src/middleware/error-middleware';

const service = new TenantPortalService();

beforeEach(() => {
  installmentFindMany.mockReset().mockResolvedValue([]);
  installmentCount.mockReset().mockResolvedValue(0);
  paymentFindMany.mockReset().mockResolvedValue([]);
  paymentAggregate.mockReset().mockResolvedValue({ _sum: { amount: 0 } });
  declarationFindMany.mockReset().mockResolvedValue([]);
  ticketFindMany.mockReset().mockResolvedValue([]);
  ticketCount.mockReset().mockResolvedValue(0);
});

describe('getInstallments : where', () => {
  const whereOf = () => installmentFindMany.mock.calls[0][0].where;

  it('sans filtre : seulement le bail et l agence de la session', async () => {
    await service.getInstallments('TC1', 'L1', 'T1');
    expect(whereOf()).toEqual({ lease_id: 'L1', tenant_id: 'T1' });
  });

  it('statuts en liste : le bail de la session reste dans le where', async () => {
    await service.getInstallments('TC1', 'L1', 'T1', { status: ['DUE', 'OVERDUE'], search: '2026-10' });
    const where = whereOf();
    expect(where.lease_id).toBe('L1');
    expect(where.tenant_id).toBe('T1');
    expect(where.status).toEqual({ in: ['DUE', 'OVERDUE'] });
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { items: { some: { label: { contains: '2026-10', mode: 'insensitive' } } } },
        { period_year: 2026, period_month: 10 }
      ])
    );
  });

  it('un leaseId ou propertyId reçu dans les filtres ne change pas le where', async () => {
    await service.getInstallments('TC1', 'L1', 'T1', { leaseId: 'AUTRE', propertyId: 'P9' } as any);
    expect(whereOf()).toEqual({ lease_id: 'L1', tenant_id: 'T1' });
  });

  it('recherche insensible à la casse sur le libellé des lignes', () => {
    expect(buildInstallmentSearchClauses('Loyer')[0]).toEqual({
      items: { some: { label: { contains: 'Loyer', mode: 'insensitive' } } }
    });
  });

  it('reconnaît un nom de mois français, avec ou sans accent', () => {
    expect(buildInstallmentSearchClauses('Février 2026')).toContainEqual({ period_month: 2, period_year: 2026 });
    expect(buildInstallmentSearchClauses('aout')).toContainEqual({ period_month: 8 });
  });

  it('dates : bornes sur l échéance', async () => {
    await service.getInstallments('TC1', 'L1', 'T1', { startDate: '2026-01-01', endDate: '2026-03-31' });
    expect(whereOf().due_date).toEqual({ gte: new Date('2026-01-01'), lte: new Date('2026-03-31') });
  });
});

describe('getPaymentHistory : recherche sur les deux sources', () => {
  const paymentWhere = () => paymentFindMany.mock.calls[0][0].where;
  const declarationWhere = () => declarationFindMany.mock.calls[0][0].where;

  it('le bail et l agence de la session restent dans les deux where', async () => {
    await service.getPaymentHistory('TC1', 'L1', 'T1', { search: 'wave', method: ['CASH', 'CARD'] });
    expect(paymentWhere()).toMatchObject({ lease_id: 'L1', tenant_id: 'T1', method: { in: ['CASH', 'CARD'] } });
    expect(declarationWhere()).toMatchObject({ lease_id: 'L1', tenant_id: 'T1', declared_by: 'TC1' });
  });

  it('recherche insensible à la casse sur la référence, paiements et déclarations', async () => {
    await service.getPaymentHistory('TC1', 'L1', 'T1', { search: 'Ref-01' });
    const contains = { contains: 'Ref-01', mode: 'insensitive' };
    expect(paymentWhere().AND[0].OR).toEqual([{ psp_reference: contains }, { psp_transaction_id: contains }]);
    expect(declarationWhere().AND[0].OR).toEqual([{ reference: contains }, { notes: contains }]);
  });

  it('le total reflète la recherche : il compte les lignes filtrées des deux sources', async () => {
    paymentFindMany.mockResolvedValue([
      {
        id: 'p1',
        amount: 100,
        method: 'CASH',
        status: 'SUCCESS',
        currency: 'FCFA',
        psp_reference: 'REF-01',
        psp_transaction_id: null,
        succeeded_at: new Date('2026-02-01'),
        initiated_at: new Date('2026-02-01'),
        allocations: []
      }
    ]);
    declarationFindMany.mockResolvedValue([
      {
        id: 'd1',
        amount: 50,
        payment_method: 'MOBILE_MONEY',
        status: 'PENDING',
        reference: 'REF-02',
        payment_date: new Date('2026-02-05')
      }
    ]);
    const out = await service.getPaymentHistory('TC1', 'L1', 'T1', { search: 'ref' }, { page: 1, limit: 1 });
    expect(out.pagination.total).toBe(2);
    expect(out.pagination.totalPages).toBe(2);
    expect(out.payments).toHaveLength(1);
    expect(out.payments[0].id).toBe('d1');
  });

  it('un leaseId reçu dans les filtres ne change pas le where', async () => {
    await service.getPaymentHistory('TC1', 'L1', 'T1', { leaseId: 'AUTRE' } as any);
    expect(paymentWhere()).toEqual({ lease_id: 'L1', tenant_id: 'T1' });
  });

  it('méthode : appliquée aussi aux déclarations (payment_method, mêmes valeurs d enum)', async () => {
    await service.getPaymentHistory('TC1', 'L1', 'T1', { method: ['CASH', 'CARD'] });
    expect(declarationWhere().payment_method).toEqual({ in: ['CASH', 'CARD'] });
    await service.getPaymentHistory('TC1', 'L1', 'T1', { method: 'CASH' });
    expect(declarationFindMany.mock.calls[1][0].where.payment_method).toEqual({ in: ['CASH'] });
  });

  it('période : appliquée aux déclarations (payment_date), bornes exactes du jour', async () => {
    const { startDate, endDate } = parseTenantPortalPaymentsQuery({ startDate: '2026-01-01', endDate: '2026-03-31' });
    await service.getPaymentHistory('TC1', 'L1', 'T1', { startDate, endDate });
    const expected = {
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-03-31T23:59:59.999Z')
    };
    expect(declarationWhere().payment_date).toEqual(expected);
    expect(paymentWhere().succeeded_at).toEqual(expected);
  });

  it('sans méthode ni période : les déclarations ne reçoivent ni payment_method ni payment_date', async () => {
    await service.getPaymentHistory('TC1', 'L1', 'T1', {});
    expect(declarationWhere()).toEqual({ lease_id: 'L1', tenant_id: 'T1', declared_by: 'TC1' });
  });
});

describe('getMaintenanceTickets : where', () => {
  const whereOf = () => ticketFindMany.mock.calls[0][0].where;

  it('sans filtre : la visibilité seule', async () => {
    await service.getMaintenanceTickets('TC1', 'L1', 'T1');
    expect(whereOf()).toEqual(VISIBILITY);
  });

  it('la visibilité reste en tête d un AND, son OR n est pas écrasé par la recherche', async () => {
    await service.getMaintenanceTickets('TC1', 'L1', 'T1', {
      status: ['DECLARED', 'ASSIGNED'],
      category: ['PLUMBING'],
      priority: ['HIGH', 'URGENT'],
      search: 'Fuite'
    });
    const where = whereOf();
    expect(where.AND[0]).toEqual(VISIBILITY);
    expect(where.AND).toContainEqual({ status: { in: ['DECLARED', 'ASSIGNED'] } });
    expect(where.AND).toContainEqual({ category: { in: ['PLUMBING'] } });
    expect(where.AND).toContainEqual({ priority: { in: ['HIGH', 'URGENT'] } });
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: 'Fuite', mode: 'insensitive' } },
        { description: { contains: 'Fuite', mode: 'insensitive' } }
      ]
    });
  });

  it('le résumé reste calculé sur la visibilité seule', async () => {
    await service.getMaintenanceTickets('TC1', 'L1', 'T1', { search: 'x' });
    expect(ticketFindMany.mock.calls[1][0].where).toEqual(VISIBILITY);
  });

  it('un propertyId ou leaseId reçu ne change pas le where', async () => {
    await service.getMaintenanceTickets('TC1', 'L1', 'T1', { propertyId: 'P9', leaseId: 'X' } as any);
    expect(whereOf()).toEqual(VISIBILITY);
  });
});

describe('analyse des paramètres', () => {
  it('CSV : doublons et valeurs vides ignorés, recherche rognée', () => {
    expect(parseTenantPortalInstallmentsQuery({ status: 'DUE,PAID,DUE', search: '  ', startDate: '' })).toMatchObject({
      status: ['DUE', 'PAID'],
      search: undefined,
      startDate: undefined
    });
    expect(parseTenantPortalPaymentsQuery({ method: 'CASH,CARD', search: ' abc ' })).toMatchObject({
      method: ['CASH', 'CARD'],
      search: 'abc'
    });
    expect(
      parseTenantPortalMaintenanceQuery({ category: 'AC', priority: 'LOW,HIGH', status: 'RESOLVED' })
    ).toMatchObject({ category: ['AC'], priority: ['LOW', 'HIGH'], status: ['RESOLVED'] });
  });

  it('dates : un jour seul couvre la journée entière (borne lte à 23:59:59.999Z)', () => {
    const parsed = parseTenantPortalInstallmentsQuery({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(parsed.startDate).toBe('2026-03-01T00:00:00.000Z');
    expect(parsed.endDate).toBe('2026-03-31T23:59:59.999Z');
    expect(new Date(parsed.endDate as string)).toEqual(new Date('2026-03-31T23:59:59.999Z'));
    expect(parseTenantPortalPaymentsQuery({ endDate: '2026-03-31' }).endDate).toBe('2026-03-31T23:59:59.999Z');
  });

  it('dates : 2026-13-45 et 2026-02-31 sont refusés (400)', () => {
    expect(() => parseTenantPortalPaymentsQuery({ startDate: '2026-13-45' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalPaymentsQuery({ endDate: '2026-02-31' })).toThrow(BadRequestError);
  });

  it('les paramètres de périmètre inconnus sont ignorés', () => {
    const parsed = parseTenantPortalMaintenanceQuery({ leaseId: 'X', propertyId: 'P9' });
    expect(parsed).not.toHaveProperty('leaseId');
    expect(parsed).not.toHaveProperty('propertyId');
  });

  it('valeur invalide : 400', () => {
    expect(() => parseTenantPortalInstallmentsQuery({ status: 'BOGUS' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalInstallmentsQuery({ startDate: 'hier' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalInstallmentsQuery({ endDate: '2026-13-45' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalPaymentsQuery({ method: 'BITCOIN' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalMaintenanceQuery({ priority: 'CRITICAL' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalMaintenanceQuery({ category: 'X' })).toThrow(BadRequestError);
    expect(() => parseTenantPortalMaintenanceQuery({ search: 'a'.repeat(201) })).toThrow(BadRequestError);
  });
});
