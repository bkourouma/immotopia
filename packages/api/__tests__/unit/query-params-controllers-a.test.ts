/**
 * Lot C : un paramètre de requête invalide (enum, entier) sur les listes CRM,
 * maintenance, location et biens répond 400 typé, sans appeler le service ;
 * un paramètre valide traverse tel quel.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

const mockSvc = {
  listContacts: jest.fn(),
  listDeals: jest.fn(),
  listActivities: jest.fn(),
  getAllTickets: jest.fn(),
  getTenantTickets: jest.fn(),
  getPropertyMaintenanceHistory: jest.fn(),
  getPaymentDeclarations: jest.fn(),
  listLeases: jest.fn(),
  listPayments: jest.fn(),
  listDocuments: jest.fn(),
  listInstallments: jest.fn(),
  listProperties: jest.fn(),
  createProperty: jest.fn()
};

jest.mock('../../src/services/crm-contact-service', () => ({
  listContacts: (...a: any[]) => mockSvc.listContacts(...a)
}));
jest.mock('../../src/services/crm-deal-service', () => ({ listDeals: (...a: any[]) => mockSvc.listDeals(...a) }));
jest.mock('../../src/services/crm-activity-service', () => ({
  listActivities: (...a: any[]) => mockSvc.listActivities(...a)
}));
jest.mock('../../src/services/maintenance-ticket-service', () => ({
  getAllTickets: (...a: any[]) => mockSvc.getAllTickets(...a),
  getTenantTickets: (...a: any[]) => mockSvc.getTenantTickets(...a),
  getPropertyMaintenanceHistory: (...a: any[]) => mockSvc.getPropertyMaintenanceHistory(...a)
}));
jest.mock('../../src/services/rental-payment-declaration-service', () => ({
  getPaymentDeclarations: (...a: any[]) => mockSvc.getPaymentDeclarations(...a)
}));
jest.mock('../../src/services/rental-lease-service', () => ({ listLeases: (...a: any[]) => mockSvc.listLeases(...a) }));
jest.mock('../../src/services/rental-payment-service', () => ({
  listPayments: (...a: any[]) => mockSvc.listPayments(...a)
}));
jest.mock('../../src/services/rental-document-service', () => ({
  listDocuments: (...a: any[]) => mockSvc.listDocuments(...a)
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  listInstallments: (...a: any[]) => mockSvc.listInstallments(...a)
}));
jest.mock('../../src/services/property-service', () => ({
  listProperties: (...a: any[]) => mockSvc.listProperties(...a),
  createProperty: (...a: any[]) => mockSvc.createProperty(...a)
}));

import { listContactsHandler, listDealsHandler, listActivitiesHandler } from '../../src/controllers/crm-controller';
import {
  listAllTicketsHandler,
  listTenantTicketsHandler,
  getPropertyMaintenanceHistoryHandler
} from '../../src/controllers/maintenance-ticket-controller';
import { listPaymentDeclarationsHandler } from '../../src/controllers/rental-payment-declaration-controller';
import { listLeasesHandler } from '../../src/controllers/rental-controller';
import { listPaymentsHandler } from '../../src/controllers/rental-payment-controller';
import { listDocumentsHandler } from '../../src/controllers/rental-document-controller';
import { listInstallmentsHandler } from '../../src/controllers/rental-installment-controller';
import { listPropertiesHandler, createPropertyHandler } from '../../src/controllers/property-controller';

function run(handler: any, query: Record<string, string>, params: Record<string, string> = {}, body: any = {}) {
  const req: any = {
    query,
    params: { tenantId: 'tenant-a', ...params },
    body,
    tenantContext: { tenantId: 'tenant-a' },
    user: { userId: 'user-1' },
    headers: {}
  };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  // `asyncHandler` confie l'erreur typée à `next` : on applique son statut.
  const next = (err: any) => {
    res.statusCode = err?.statusCode ?? 500;
    res.body = { success: false, message: err?.message };
  };
  return Promise.resolve(handler(req, res, next)).then(() => res);
}

const emptyList = {
  contacts: [],
  deals: [],
  activities: [],
  tickets: [],
  declarations: [],
  data: [],
  properties: [],
  total: 0,
  pagination: {}
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockSvc).forEach(fn => fn.mockResolvedValue(emptyList));
  mockSvc.getPropertyMaintenanceHistory.mockResolvedValue([]);
});

describe.each([
  ['crm contacts ?status', listContactsHandler, { status: 'NOPE' }, mockSvc.listContacts],
  ['crm deals ?stage', listDealsHandler, { stage: 'NOPE' }, mockSvc.listDeals],
  ['crm deals ?type', listDealsHandler, { type: 'NOPE' }, mockSvc.listDeals],
  ['crm activités ?type', listActivitiesHandler, { type: 'NOPE' }, mockSvc.listActivities],
  ['tickets admin ?status', listAllTicketsHandler, { status: 'NOPE' }, mockSvc.getAllTickets],
  ['tickets admin ?priority', listAllTicketsHandler, { priority: 'NOPE' }, mockSvc.getAllTickets],
  ['tickets locataire ?status', listTenantTicketsHandler, { status: 'NOPE' }, mockSvc.getTenantTickets],
  [
    'historique bien ?category',
    getPropertyMaintenanceHistoryHandler,
    { category: 'NOPE' },
    mockSvc.getPropertyMaintenanceHistory
  ],
  ['déclarations ?status', listPaymentDeclarationsHandler, { status: 'NOPE' }, mockSvc.getPaymentDeclarations],
  ['baux ?status', listLeasesHandler, { status: 'NOPE' }, mockSvc.listLeases],
  ['paiements ?status', listPaymentsHandler, { status: 'NOPE' }, mockSvc.listPayments],
  ['paiements ?method', listPaymentsHandler, { method: 'NOPE' }, mockSvc.listPayments],
  ['documents ?type', listDocumentsHandler, { type: 'NOPE' }, mockSvc.listDocuments],
  ['documents ?status', listDocumentsHandler, { status: 'NOPE' }, mockSvc.listDocuments],
  ['échéances ?status', listInstallmentsHandler, { status: 'NOPE' }, mockSvc.listInstallments],
  ['échéances ?year', listInstallmentsHandler, { year: 'abc' }, mockSvc.listInstallments],
  ['échéances ?month', listInstallmentsHandler, { month: '13' }, mockSvc.listInstallments],
  ['biens ?propertyType', listPropertiesHandler, { propertyType: 'NOPE' }, mockSvc.listProperties],
  ['biens ?status', listPropertiesHandler, { status: 'NOPE' }, mockSvc.listProperties],
  ['biens ?transactionMode', listPropertiesHandler, { transactionMode: 'NOPE' }, mockSvc.listProperties]
])('%s invalide', (_name, handler, query, service) => {
  it('répond 400 sans appeler le service', async () => {
    const res = await run(handler, query as Record<string, string>, { propertyId: 'p1' });
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(service).not.toHaveBeenCalled();
  });
});

describe('paramètres valides ou vides', () => {
  it('échéances : status valide + year/month entiers traversent en nombres', async () => {
    const res = await run(listInstallmentsHandler, { status: 'PAID', year: '2026', month: '3' });
    expect(res.statusCode).toBe(200);
    expect(mockSvc.listInstallments.mock.calls[0][1]).toMatchObject({ status: 'PAID', year: 2026, month: 3 });
  });

  it('échéances : paramètres vides = pas de filtre', async () => {
    const res = await run(listInstallmentsHandler, { status: '', year: '', month: '' });
    expect(res.statusCode).toBe(200);
    const filters = mockSvc.listInstallments.mock.calls[0][1];
    expect(filters.status).toBeUndefined();
    expect(filters.year).toBeUndefined();
    expect(filters.month).toBeUndefined();
  });

  it('contacts : status valide transmis', async () => {
    const res = await run(listContactsHandler, { status: 'LEAD' });
    expect(res.statusCode).toBe(200);
    expect(mockSvc.listContacts.mock.calls[0][1].status).toBe('LEAD');
  });

  it('biens : filtres valides transmis', async () => {
    const res = await run(listPropertiesHandler, { propertyType: 'MAISON_VILLA', status: 'AVAILABLE' });
    expect(res.statusCode).toBe(200);
    expect(mockSvc.listProperties.mock.calls[0][2]).toMatchObject({
      propertyType: 'MAISON_VILLA',
      status: 'AVAILABLE'
    });
  });
});

describe('devise par défaut des biens', () => {
  it('sans currency, le bien est créé en XOF', async () => {
    mockSvc.createProperty.mockResolvedValue({ id: 'p1' });
    await run(createPropertyHandler, {}, {}, { title: 'Villa', propertyType: 'MAISON' });
    expect(mockSvc.createProperty).toHaveBeenCalled();
    const data = mockSvc.createProperty.mock.calls[0].find((a: any) => a && typeof a === 'object' && 'currency' in a);
    expect(data.currency).toBe('XOF');
  });
});
