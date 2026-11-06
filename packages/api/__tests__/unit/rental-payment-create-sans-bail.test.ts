/**
 * BUG-2026-11-04-033 : un paiement manuel sans bail (ni locataire) était créé
 * puis ne pouvait plus être affecté. Le contrôleur le refuse en 400, et le bail
 * reçu est vérifié comme appartenant à l'agence par le service.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

const mockCreatePayment = jest.fn();
jest.mock('../../src/services/rental-payment-service', () => ({
  createPayment: (...a: any[]) => mockCreatePayment(...a),
  allocatePayment: jest.fn(),
  updatePaymentStatus: jest.fn(),
  getPaymentById: jest.fn(),
  listPayments: jest.fn()
}));
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  getCheckoutForPayment: jest.fn(),
  reconcileCheckout: jest.fn(),
  toOnlineCheckoutSummaryDto: jest.fn()
}));

import { BadRequestError } from '../../src/middleware/error-middleware';
import { createPaymentHandler } from '../../src/controllers/rental-payment-controller';

const UUID = '11111111-1111-4111-8111-111111111111';

async function run(body: any) {
  const req: any = {
    params: {},
    body,
    query: {},
    headers: {},
    tenantContext: { tenantId: 'tenant-a' },
    user: { userId: 'u1' }
  };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: any) => ((res.body = b), res);
  const next = jest.fn();
  await createPaymentHandler(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

beforeEach(() => jest.clearAllMocks());

describe('POST /rental/payments — bail obligatoire', () => {
  it('refuse un paiement sans bail par une 400 claire, sans appeler le service', async () => {
    const { error } = await run({ method: 'CASH', amount: 5000 });
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Choisissez le bail concerné par ce paiement');
    expect(mockCreatePayment).not.toHaveBeenCalled();
  });

  it('avec un bail, délègue au service (qui filtre le bail par agence)', async () => {
    mockCreatePayment.mockResolvedValue({ id: 'p1' });
    const { res, error } = await run({ method: 'CASH', amount: 5000, leaseId: UUID });
    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(mockCreatePayment).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ leaseId: UUID }), 'u1');
  });
});
