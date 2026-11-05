/**
 * Portail propriétaire : recherche, statuts multiples, pagination optionnelle
 * et périmètre des cinq listes (échéances, paiements, tickets, documents, baux).
 *
 * Prisma est remplacé par des `jest.fn()` : on vérifie le `where` transmis, la
 * tranche servie et que le `summary` reste calculé sur toutes les lignes.
 */

const findManyInstallments = jest.fn();
const findManyPayments = jest.fn();
const findManyTickets = jest.fn();
const findManyDocuments = jest.fn();
const findManyLeases = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: { findMany: (...a: unknown[]) => findManyInstallments(...a) },
    rentalPayment: { findMany: (...a: unknown[]) => findManyPayments(...a) },
    maintenanceTicket: { findMany: (...a: unknown[]) => findManyTickets(...a) },
    rentalDocument: { findMany: (...a: unknown[]) => findManyDocuments(...a) },
    rentalLease: { findMany: (...a: unknown[]) => findManyLeases(...a) }
  }
}));
jest.mock('../../src/utils/report-generator', () => ({}));
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));

import { OwnerPortalService } from '../../src/services/owner-portal-service';
import {
  parseOwnerPortalDocumentsQuery,
  parseOwnerPortalInstallmentsQuery,
  parseOwnerPortalLeasesQuery,
  parseOwnerPortalMaintenanceQuery,
  parseOwnerPortalPaymentsQuery
} from '../../src/services/portal-list-filters/owner-portal-list-filters';
import { BadRequestError } from '../../src/middleware/error-middleware';

const service = new OwnerPortalService();
const T = 'tenant-1';
const MINE = ['prop-1', 'prop-2'];
const OTHER_OWNER_PROPERTY = 'prop-autre-proprietaire';
const LEASE_UUID = '3f2b8c1e-9d4a-4c55-8a6e-0b1c2d3e4f50';

const person = { user: { fullName: 'Awa Kone' } };
const property = { id: 'prop-1', address: 'Rue 1', title: 'Villa', internalReference: null };

function installment(id: string, status = 'DUE'): any {
  return {
    id,
    status,
    period_month: 1,
    period_year: 2026,
    due_date: new Date('2026-01-05T00:00:00.000Z'),
    amount_rent: 100,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    payments: [],
    penalties: [],
    lease: { property, primaryRenter: person }
  };
}

function payment(id: string): any {
  return {
    id,
    amount: 50,
    method: 'CASH',
    status: 'SUCCESS',
    succeeded_at: new Date('2026-01-05T00:00:00.000Z'),
    initiated_at: new Date('2026-01-05T00:00:00.000Z'),
    lease: { property, primaryRenter: person }
  };
}

function lease(id: string, status = 'ACTIVE'): any {
  return {
    id,
    status,
    start_date: new Date('2025-01-01T00:00:00.000Z'),
    end_date: null,
    rent_amount: 100,
    property,
    primaryRenter: person
  };
}

function ticket(id: string, status = 'DECLARED'): any {
  return {
    id,
    title: 'Fuite',
    category: 'PLUMBING',
    priority: 'HIGH',
    status,
    created_at: new Date('2026-01-05T00:00:00.000Z'),
    property
  };
}

function document(id: string, type = 'RENT_RECEIPT'): any {
  return { id, type, status: 'FINAL', title: `Doc ${id}`, document_number: `N-${id}`, file_path: null, file_url: null };
}

beforeEach(() => {
  for (const fn of [findManyInstallments, findManyPayments, findManyTickets, findManyDocuments, findManyLeases]) {
    fn.mockReset().mockResolvedValue([]);
  }
});

const whereOf = (fn: jest.Mock) => fn.mock.calls[0][0].where;
const ilike = (value: string) => ({ contains: value, mode: 'insensitive' });

describe('périmètre : un identifiant reçu n élargit jamais la requête', () => {
  it('baux : bien d un autre propriétaire -> vide, prisma non appelé', async () => {
    const result = await service.getLeases(MINE, T, { propertyId: OTHER_OWNER_PROPERTY });
    expect(result.leases).toEqual([]);
    expect(result.summary).toEqual({ active: 0, ended: 0, suspended: 0 });
    expect(findManyLeases).not.toHaveBeenCalled();
  });

  it('baux : bien du propriétaire -> restreint à ce bien', async () => {
    await service.getLeases(MINE, T, { propertyId: 'prop-2' });
    expect(whereOf(findManyLeases)).toMatchObject({ tenant_id: T, property_id: 'prop-2' });
  });

  it('baux : sans bien reçu, le périmètre complet', async () => {
    await service.getLeases(MINE, T, {});
    expect(whereOf(findManyLeases)).toEqual({ tenant_id: T, property_id: { in: MINE } });
  });

  it('tickets : bien d un autre propriétaire -> vide, prisma non appelé', async () => {
    const result = await service.getMaintenanceTickets(MINE, T, { propertyId: OTHER_OWNER_PROPERTY });
    expect(result.tickets).toEqual([]);
    expect(result.summary.total).toBe(0);
    expect(findManyTickets).not.toHaveBeenCalled();
  });

  it('tickets : bien du propriétaire -> restreint à ce bien', async () => {
    await service.getMaintenanceTickets(MINE, T, { propertyId: 'prop-1' });
    expect(whereOf(findManyTickets)).toMatchObject({ tenant_id: T, property_id: 'prop-1' });
  });

  it('documents : bien d un autre propriétaire -> vide, prisma non appelé', async () => {
    const result = await service.getDocuments(MINE, T, { propertyId: OTHER_OWNER_PROPERTY });
    expect(result).toMatchObject({ documents: [], groupedByType: {} });
    expect(findManyDocuments).not.toHaveBeenCalled();
  });

  it('documents : bien du propriétaire -> restreint à ce bien seul', async () => {
    await service.getDocuments(MINE, T, { propertyId: 'prop-1' });
    const json = JSON.stringify(whereOf(findManyDocuments).OR);
    expect(json).toContain('prop-1');
    expect(json).not.toContain('prop-2');
  });

  it('documents : bail reçu combiné (ET) avec le périmètre, jamais seul', async () => {
    await service.getDocuments(MINE, T, { leaseId: LEASE_UUID });
    const where = whereOf(findManyDocuments);
    expect(where.lease_id).toBe(LEASE_UUID);
    expect(JSON.stringify(where.OR)).toContain('prop-1');
    expect(JSON.stringify(where.OR)).toContain('prop-2');
  });

  it('documents : identifiant de bail mal formé -> vide, prisma non appelé', async () => {
    const result = await service.getDocuments(MINE, T, { leaseId: 'pas-un-uuid' });
    expect(result.documents).toEqual([]);
    expect(findManyDocuments).not.toHaveBeenCalled();
  });

  it('échéances et paiements : bien hors périmètre -> vide, prisma non appelé', async () => {
    const inst = await service.getInstallments(MINE, T, { propertyId: OTHER_OWNER_PROPERTY });
    const pay = await service.getPayments(MINE, T, { propertyId: OTHER_OWNER_PROPERTY });
    expect(inst.installments).toEqual([]);
    expect(pay.payments).toEqual([]);
    expect(findManyInstallments).not.toHaveBeenCalled();
    expect(findManyPayments).not.toHaveBeenCalled();
  });

  it('une réponse vide porte aussi la pagination', async () => {
    const result = await service.getMaintenanceTickets(MINE, T, {
      propertyId: OTHER_OWNER_PROPERTY,
      page: 2,
      limit: 20
    });
    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 0, totalPages: 0 });
  });
});

describe('recherche libre : where Prisma', () => {
  it('échéances : bien et locataire, périmètre conservé', async () => {
    await service.getInstallments(MINE, T, { search: 'awa' });
    const where = whereOf(findManyInstallments);
    expect(where.lease).toEqual({ property_id: { in: MINE } });
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { lease: { property: { title: ilike('awa') } } },
        { lease: { property: { address: ilike('awa') } } },
        { lease: { primaryRenter: { user: { fullName: ilike('awa') } } } }
      ])
    );
  });

  it('paiements : référence, et l intervalle de dates (OR) n est pas écrasé', async () => {
    await service.getPayments(MINE, T, {
      search: 'ref-9',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z')
    });
    const where = whereOf(findManyPayments);
    expect(where.OR).toHaveLength(2);
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { psp_reference: ilike('ref-9') },
        { lease: { primaryRenter: { user: { fullName: ilike('ref-9') } } } }
      ])
    );
  });

  it('tickets : titre et adresse du bien', async () => {
    await service.getMaintenanceTickets(MINE, T, { search: 'fuite' });
    const where = whereOf(findManyTickets);
    expect(where.property_id).toEqual({ in: MINE });
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([{ title: ilike('fuite') }, { property: { address: ilike('fuite') } }])
    );
  });

  it('documents : titre et numéro, en ET avec le OR de périmètre (non écrasé)', async () => {
    await service.getDocuments(MINE, T, { search: 'quit' });
    const where = whereOf(findManyDocuments);
    expect(where.OR).toHaveLength(3);
    expect(where.AND[0].OR).toEqual([{ title: ilike('quit') }, { document_number: ilike('quit') }]);
  });

  it('baux : bien et locataire', async () => {
    await service.getLeases(MINE, T, { search: 'kone' });
    expect(whereOf(findManyLeases).AND[0].OR).toEqual(
      expect.arrayContaining([
        { property: { address: ilike('kone') } },
        { primaryRenter: { user: { fullName: ilike('kone') } } }
      ])
    );
  });
});

describe('statuts multiples', () => {
  it('liste -> { in: [...] }', async () => {
    await service.getInstallments(MINE, T, { status: ['DUE', 'OVERDUE'] as any });
    expect(whereOf(findManyInstallments).status).toEqual({ in: ['DUE', 'OVERDUE'] });

    await service.getMaintenanceTickets(MINE, T, {
      status: ['DECLARED', 'ASSIGNED'] as any,
      category: ['PLUMBING'] as any,
      priority: ['HIGH', 'URGENT'] as any
    });
    const where = whereOf(findManyTickets);
    expect(where.status).toEqual({ in: ['DECLARED', 'ASSIGNED'] });
    expect(where.category).toEqual({ in: ['PLUMBING'] });
    expect(where.priority).toEqual({ in: ['HIGH', 'URGENT'] });

    await service.getPayments(MINE, T, { method: ['CASH', 'CARD'] as any });
    expect(whereOf(findManyPayments).method).toEqual({ in: ['CASH', 'CARD'] });

    await service.getDocuments(MINE, T, { documentType: ['RENT_RECEIPT', 'STATEMENT'] as any });
    expect(whereOf(findManyDocuments).type).toEqual({ in: ['RENT_RECEIPT', 'STATEMENT'] });

    await service.getLeases(MINE, T, { status: ['ACTIVE', 'ENDED'] as any });
    expect(whereOf(findManyLeases).status).toEqual({ in: ['ACTIVE', 'ENDED'] });
  });
});

describe('pagination optionnelle', () => {
  it('sans limit : liste entière, pagination avec limit = total', async () => {
    findManyInstallments.mockResolvedValue([installment('a'), installment('b'), installment('c')]);
    const result = await service.getInstallments(MINE, T, {});
    expect(result.installments).toHaveLength(3);
    expect(result.pagination).toEqual({ page: 1, limit: 3, total: 3, totalPages: 1 });
  });

  it('3 échéances, limit 2 : 2 lignes, summary calculé sur les 3', async () => {
    findManyInstallments.mockResolvedValue([installment('a'), installment('b'), installment('c', 'PAID')]);
    const result = await service.getInstallments(MINE, T, { page: 1, limit: 2 });
    expect(result.installments.map(i => i.id)).toEqual(['a', 'b']);
    expect(result.summary.total).toBe(3);
    expect(result.summary.paid).toBe(1);
    expect(result.summary.totalAmount).toBe(300);
    expect(result.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('page 2 : la dernière ligne', async () => {
    findManyPayments.mockResolvedValue([payment('a'), payment('b'), payment('c')]);
    const result = await service.getPayments(MINE, T, { page: 2, limit: 2 });
    expect(result.payments.map(p => p.id)).toEqual(['c']);
    expect(result.summary.total).toBe(3);
    expect(result.summary.totalAmount).toBe(150);
    expect(result.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('tickets : summary sur toutes les lignes', async () => {
    findManyTickets.mockResolvedValue([ticket('a'), ticket('b', 'RESOLVED'), ticket('c', 'RESOLVED')]);
    const result = await service.getMaintenanceTickets(MINE, T, { page: 1, limit: 1 });
    expect(result.tickets).toHaveLength(1);
    expect(result.summary).toMatchObject({ total: 3, open: 1, resolved: 2 });
    expect(result.pagination?.totalPages).toBe(3);
  });

  it('baux : summary sur toutes les lignes', async () => {
    findManyLeases.mockResolvedValue([lease('a'), lease('b', 'ENDED'), lease('c', 'SUSPENDED')]);
    const result = await service.getLeases(MINE, T, { page: 1, limit: 2 });
    expect(result.leases).toHaveLength(2);
    expect(result.summary).toEqual({ active: 1, ended: 1, suspended: 1 });
  });

  it('baux : l élément porte l identifiant du bien (deux lots d une même adresse se distinguent)', async () => {
    findManyLeases.mockResolvedValue([lease('a')]);
    const result = await service.getLeases(MINE, T, {});
    expect(result.leases[0].propertyId).toBe(property.id);
  });

  it('documents : groupedByType sur toutes les lignes, documents tranchés', async () => {
    findManyDocuments.mockResolvedValue([document('a'), document('b'), document('c', 'STATEMENT')]);
    const result = await service.getDocuments(MINE, T, { page: 1, limit: 2 });
    expect(result.documents).toHaveLength(2);
    expect(result.groupedByType.RENT_RECEIPT).toHaveLength(2);
    expect(result.groupedByType.STATEMENT).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });
});

describe('validation des paramètres : parseOwnerPortal…Query', () => {
  it('CSV : doublons et valeurs vides ignorés, recherche rognée', () => {
    expect(parseOwnerPortalInstallmentsQuery({ status: 'DUE,OVERDUE,DUE', search: '  awa  ' })).toMatchObject({
      status: ['DUE', 'OVERDUE'],
      search: 'awa'
    });
    const empty = parseOwnerPortalInstallmentsQuery({ status: '', search: '   ', startDate: '' });
    expect(empty).toEqual({});
  });

  it('dates : jour aaaa-mm-jj et date ISO acceptés, rendus en Date', () => {
    const parsed = parseOwnerPortalPaymentsQuery({ startDate: '2026-01-01', endDate: '2026-01-31T12:00:00.000Z' });
    expect(parsed.startDate).toEqual(new Date('2026-01-01'));
    expect(parsed.endDate).toEqual(new Date('2026-01-31T12:00:00.000Z'));
  });

  it('dates : un jour seul couvre la journée entière (fin à 23:59:59.999Z)', () => {
    const parsed = parseOwnerPortalPaymentsQuery({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(parsed.startDate).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(parsed.endDate).toEqual(new Date('2026-03-31T23:59:59.999Z'));
    expect(parseOwnerPortalInstallmentsQuery({ endDate: '2026-03-31' }).endDate?.toISOString()).toBe(
      '2026-03-31T23:59:59.999Z'
    );
  });

  it('dates : 2026-13-45 est refusé (400)', () => {
    expect(() => parseOwnerPortalPaymentsQuery({ endDate: '2026-13-45' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalInstallmentsQuery({ startDate: '2026-13-45' })).toThrow(BadRequestError);
  });

  it('page et limit convertis en nombres', () => {
    expect(parseOwnerPortalLeasesQuery({ page: '2', limit: '20' })).toMatchObject({ page: 2, limit: 20 });
  });

  it('valeur invalide : 400', () => {
    expect(() => parseOwnerPortalInstallmentsQuery({ status: 'BOGUS' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalInstallmentsQuery({ status: 'DUE,BOGUS' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalInstallmentsQuery({ startDate: 'hier' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalPaymentsQuery({ endDate: '2026-02-31' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalPaymentsQuery({ method: 'BITCOIN' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalMaintenanceQuery({ priority: 'MAX' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalMaintenanceQuery({ category: 'JARDIN' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalDocumentsQuery({ documentType: 'FACTURE' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalLeasesQuery({ status: 'X' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalLeasesQuery({ limit: '0' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalLeasesQuery({ limit: '101' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalLeasesQuery({ page: '0' })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalDocumentsQuery({ search: 'x'.repeat(201) })).toThrow(BadRequestError);
    expect(() => parseOwnerPortalDocumentsQuery({ propertyId: 'p'.repeat(65) })).toThrow(BadRequestError);
  });
});
