/**
 * M4 : un `page=abc` (ou une page/limit aberrante) sur les listes des
 * prestataires, échéances et paiements répond 400, jamais 500.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

const mockListVendors = jest.fn();
const mockListInstallments = jest.fn();
const mockListPayments = jest.fn();
jest.mock('../../src/services/maintenance-vendor-service', () => ({
  listVendors: (...a: any[]) => mockListVendors(...a)
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  listInstallments: (...a: any[]) => mockListInstallments(...a)
}));
jest.mock('../../src/services/rental-payment-service', () => ({
  listPayments: (...a: any[]) => mockListPayments(...a)
}));

import { listVendorsHandler } from '../../src/controllers/maintenance-vendor-controller';
import { listInstallmentsHandler } from '../../src/controllers/rental-installment-controller';
import { listPaymentsHandler } from '../../src/controllers/rental-payment-controller';

function run(handler: any, query: Record<string, string>) {
  const req: any = { query, params: {}, tenantContext: { tenantId: 'tenant-a' }, headers: {} };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return handler(req, res).then(() => res);
}

describe.each([
  ['prestataires', listVendorsHandler, mockListVendors],
  ['échéances', listInstallmentsHandler, mockListInstallments],
  ['paiements', listPaymentsHandler, mockListPayments]
])('liste des %s : pagination invalide', (_name, handler, service) => {
  beforeEach(() => jest.clearAllMocks());

  it.each([{ page: 'abc' }, { limit: '100000' }, { page: '1e29' }])('répond 400 pour %j', async query => {
    const res = await run(handler, query as unknown as Record<string, string>);
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(service).not.toHaveBeenCalled();
  });
});
