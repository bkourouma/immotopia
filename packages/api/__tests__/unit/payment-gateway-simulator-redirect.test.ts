/**
 * Lot C5 (spec 039) — redirection finale du simulateur PaySecureHub.
 *
 * Un checkout issu d'un lien de paiement (secureLinkId non nul) revient sur la
 * page publique de statut ; un checkout du portail locataire revient sur le
 * portail, comme avant.
 */

import type { Request, Response } from 'express';
import { env } from '../../src/config/env';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: jest.fn(),
  allocatePaymentTx: jest.fn()
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ ensureChartAccountTx: jest.fn() }));
jest.mock('../../src/services/platform-payment-service', () => ({
  findPlatformSimulatorCheckout: jest.fn(),
  reconcilePlatformCheckoutPublic: jest.fn(),
  recordPlatformSimulatedOutcome: jest.fn()
}));
jest.mock('../../src/lib/payment-gateway/platform-account', () => ({ platformReturnUrl: jest.fn() }));

const findSimulatorCheckout = jest.fn();
const reconcileCheckoutPublic = jest.fn();
const recordSimulatedOutcome = jest.fn();
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  ...jest.requireActual('../../src/lib/payment-gateway/checkout'),
  findSimulatorCheckout: (...a: any[]) => findSimulatorCheckout(...a),
  reconcileCheckoutPublic: (...a: any[]) => reconcileCheckoutPublic(...a),
  recordSimulatedOutcome: (...a: any[]) => recordSimulatedOutcome(...a)
}));

import { simulatorActionHandler } from '../../src/controllers/payment-gateway-public-controller';

const CODE = 'IMT-abcdefghij0123456789';
const base = env.FRONTEND_URL.replace(/\/$/, '');

async function runAction(outcome: string): Promise<{ status: number; url: string }> {
  return new Promise((resolve, reject) => {
    const req = { params: { codePaiement: CODE, outcome } } as unknown as Request;
    const res = { redirect: (status: number, url: string) => resolve({ status, url }) } as unknown as Response;
    simulatorActionHandler(req, res, (error?: unknown) => (error ? reject(error) : undefined));
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  reconcileCheckoutPublic.mockResolvedValue(null);
  recordSimulatedOutcome.mockResolvedValue(undefined);
});

describe('simulatorActionHandler — redirection finale', () => {
  it('checkout issu d’un lien : 303 vers /payer/statut?paiement=<code>', async () => {
    findSimulatorCheckout.mockResolvedValue({ codePaiement: CODE, tenantId: 'tenant-a', secureLinkId: 'link-1' });

    const result = await runAction('success');

    expect(result).toEqual({ status: 303, url: `${base}/payer/statut?paiement=${CODE}` });
    expect(result.url).not.toContain('#');
    expect(recordSimulatedOutcome).toHaveBeenCalledWith(expect.objectContaining({ secureLinkId: 'link-1' }), 'SUCCESS');
    expect(reconcileCheckoutPublic).toHaveBeenCalledWith(CODE);
  });

  it('checkout du portail : 303 vers /tenant/payments?paiement=<code>', async () => {
    findSimulatorCheckout.mockResolvedValue({ codePaiement: CODE, tenantId: 'tenant-a', secureLinkId: null });

    const result = await runAction('canceled');

    expect(result).toEqual({ status: 303, url: `${base}/tenant/payments?paiement=${CODE}` });
  });

  it('un échec de rapprochement n’empêche pas la redirection', async () => {
    findSimulatorCheckout.mockResolvedValue({ codePaiement: CODE, tenantId: 'tenant-a', secureLinkId: 'link-1' });
    reconcileCheckoutPublic.mockRejectedValue(new Error('réseau'));

    await expect(runAction('failed')).resolves.toMatchObject({ status: 303 });
  });
});
