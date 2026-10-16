/**
 * Les contrôleurs de dépôt de garantie et de paiement laissent passer les
 * erreurs typées au middleware : un introuvable reste 404, un conflit 409
 * (avant : toute `Error` devenait un 400).
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

const mockCreateDepositMovement = jest.fn();
const mockUpdatePaymentStatus = jest.fn();
const mockGetPaymentById = jest.fn();
jest.mock('../../src/services/rental-deposit-service', () => ({
  createDeposit: jest.fn(),
  getDeposit: jest.fn(),
  createDepositMovement: (...a: any[]) => mockCreateDepositMovement(...a),
  listDepositMovements: jest.fn(),
  computeDepositBalance: jest.fn()
}));
jest.mock('../../src/services/rental-payment-service', () => ({
  createPayment: jest.fn(),
  allocatePayment: jest.fn(),
  updatePaymentStatus: (...a: any[]) => mockUpdatePaymentStatus(...a),
  getPaymentById: (...a: any[]) => mockGetPaymentById(...a),
  listPayments: jest.fn()
}));
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  getCheckoutForPayment: jest.fn(),
  reconcileCheckout: jest.fn(),
  toOnlineCheckoutSummaryDto: jest.fn()
}));

import { ConflictError, NotFoundError, UnauthorizedError } from '../../src/middleware/error-middleware';
import { createDepositMovementHandler } from '../../src/controllers/rental-deposit-controller';
import { getPaymentHandler, updatePaymentStatusHandler } from '../../src/controllers/rental-payment-controller';

const UUID = '11111111-1111-4111-8111-111111111111';

async function run(handler: any, opts: { params?: any; body?: any; user?: boolean } = {}) {
  const req: any = {
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
    headers: {},
    tenantContext: { tenantId: 'tenant-a' },
    user: opts.user === false ? undefined : { userId: 'u1' }
  };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: any) => ((res.body = b), res);
  const next = jest.fn();
  await handler(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

beforeEach(() => jest.clearAllMocks());

describe('erreurs typées des contrôleurs locatifs', () => {
  it('un dépôt introuvable lève un NotFoundError (404), pas un 400', async () => {
    mockCreateDepositMovement.mockRejectedValue(new NotFoundError('Dépôt de garantie introuvable'));
    const { error } = await run(createDepositMovementHandler, {
      params: { depositId: UUID },
      body: { type: 'COLLECT', amount: 100 }
    });
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.statusCode).toBe(404);
  });

  it('un conflit sur le statut de paiement reste un ConflictError (409)', async () => {
    mockUpdatePaymentStatus.mockRejectedValue(new ConflictError('déjà restitué'));
    const { error } = await run(updatePaymentStatusHandler, {
      params: { paymentId: UUID },
      body: { status: 'CANCELED' }
    });
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
  });

  it('un corps invalide lève un ZodError que le middleware traduit en 400', async () => {
    const { error } = await run(createDepositMovementHandler, {
      params: { depositId: UUID },
      body: { type: 'INCONNU', amount: -1 }
    });
    expect(error?.name).toBe('ZodError');
    expect(mockCreateDepositMovement).not.toHaveBeenCalled();
  });

  it('sans utilisateur : 401', async () => {
    const { error } = await run(updatePaymentStatusHandler, { params: { paymentId: UUID }, user: false });
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('un paiement absent : NotFoundError ; présent : réponse de succès inchangée', async () => {
    mockGetPaymentById.mockResolvedValueOnce(null);
    expect((await run(getPaymentHandler, { params: { paymentId: UUID } })).error).toBeInstanceOf(NotFoundError);

    mockGetPaymentById.mockResolvedValueOnce({ id: UUID, onlineCheckout: null });
    const { res, error } = await run(getPaymentHandler, { params: { paymentId: UUID } });
    expect(error).toBeUndefined();
    expect(res.body).toEqual({ success: true, data: { id: UUID, onlineCheckout: null } });
  });
});
