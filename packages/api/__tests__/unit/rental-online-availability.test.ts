/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §2.8 : règle unique de disponibilité du paiement en ligne locatif
 * (config active ET simulateur autorisé ET droit RENTAL), et `isConfigUsable` durci.
 */

const mockState = {
  config: null as any,
  tenant: { status: 'ACTIVE' } as any,
  entitlements: { enforcement: 'enforce' } as any,
  entitlementsError: false,
  decision: { allowed: true } as any,
  simulator: true
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    paymentGatewayConfig: { findUnique: jest.fn(async () => mockState.config) },
    tenant: { findUnique: jest.fn(async () => mockState.tenant) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/config/env', () => ({
  env: { PAYSECUREHUB_BASE_URL: 'https://psh.test', PAYSECUREHUB_TIMEOUT_MS: 1000 },
  get paymentGatewaySimulatorAvailable() {
    return mockState.simulator;
  }
}));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(async () => {
    if (mockState.entitlementsError) throw new Error('boom');
    return mockState.entitlements;
  })
}));
jest.mock('../../src/lib/subscription/feature-access', () => ({
  evaluateFeatureAccess: jest.fn(() => mockState.decision)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({
  decryptSecret: (v: string) => v,
  isEncryptionAvailable: () => true
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ ensureChartAccountTx: jest.fn() }));

import {
  assertRentalOnlinePaymentAllowed,
  assertRentalOnlinePaymentUsable,
  resolveRentalOnlineAvailability
} from '../../src/lib/payment-gateway/availability';
import { isConfigUsable } from '../../src/lib/payment-gateway/config';

const cfg = (over: Record<string, unknown> = {}) => ({
  tenantId: 'T1',
  mode: 'LIVE',
  isActive: true,
  merchantId: 'M1',
  apiKeyEncrypted: 'k',
  feesPaidBy: 'CLIENT',
  ...over
});

beforeEach(() => {
  mockState.config = cfg();
  mockState.tenant = { status: 'ACTIVE' };
  mockState.entitlements = { enforcement: 'enforce' };
  mockState.entitlementsError = false;
  mockState.decision = { allowed: true };
  mockState.simulator = true;
});

describe('resolveRentalOnlineAvailability', () => {
  it('usable : config active, droit RENTAL', async () => {
    const r = await resolveRentalOnlineAvailability('T1');
    expect(r).toMatchObject({ usable: true, unavailableReason: null, mode: 'LIVE', simulated: false });
  });

  it('NOT_CONFIGURED sans ligne', async () => {
    mockState.config = null;
    expect(await resolveRentalOnlineAvailability('T1')).toMatchObject({
      usable: false,
      unavailableReason: 'NOT_CONFIGURED',
      mode: null
    });
  });

  it('INACTIVE', async () => {
    mockState.config = cfg({ isActive: false });
    expect((await resolveRentalOnlineAvailability('T1')).unavailableReason).toBe('INACTIVE');
  });

  it('SIMULATOR_FORBIDDEN quand le serveur interdit le simulateur', async () => {
    mockState.config = cfg({ mode: 'SIMULATOR' });
    mockState.simulator = false;
    expect(await resolveRentalOnlineAvailability('T1')).toMatchObject({
      usable: false,
      unavailableReason: 'SIMULATOR_FORBIDDEN',
      simulated: true
    });
  });

  it('simulateur autorisé : usable et simulated', async () => {
    mockState.config = cfg({ mode: 'SIMULATOR' });
    expect(await resolveRentalOnlineAvailability('T1')).toMatchObject({ usable: true, simulated: true });
  });

  it('SUBSCRIPTION : droit RENTAL refusé en enforce', async () => {
    mockState.decision = { allowed: false, code: 'X', moduleKey: 'rental' };
    expect((await resolveRentalOnlineAvailability('T1')).unavailableReason).toBe('SUBSCRIPTION');
  });

  it('warn : le refus est journalisé mais le paiement reste disponible', async () => {
    mockState.entitlements = { enforcement: 'warn' };
    mockState.decision = { allowed: false, code: 'X', moduleKey: 'rental' };
    expect((await resolveRentalOnlineAvailability('T1')).usable).toBe(true);
  });

  it('off : aucun contrôle d’abonnement', async () => {
    mockState.entitlements = { enforcement: 'off' };
    mockState.decision = { allowed: false };
    expect((await resolveRentalOnlineAvailability('T1')).usable).toBe(true);
  });

  it('agence suspendue : SUBSCRIPTION', async () => {
    mockState.tenant = { status: 'SUSPENDED' };
    expect((await resolveRentalOnlineAvailability('T1')).unavailableReason).toBe('SUBSCRIPTION');
  });
});

describe('gardes', () => {
  it('assertRentalOnlinePaymentAllowed : 403 RENTAL_FEATURE_DENIED', async () => {
    mockState.decision = { allowed: false };
    await expect(assertRentalOnlinePaymentAllowed('T1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'RENTAL_FEATURE_DENIED'
    });
  });

  it('assertRentalOnlinePaymentUsable : 400 RENTAL_ONLINE_PAYMENT_UNAVAILABLE, jamais de repli', async () => {
    mockState.config = null;
    await expect(assertRentalOnlinePaymentUsable('T1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'RENTAL_ONLINE_PAYMENT_UNAVAILABLE'
    });
  });
});

describe('isConfigUsable', () => {
  it('simulateur interdit => inutilisable', () => {
    mockState.simulator = false;
    expect(isConfigUsable(cfg({ mode: 'SIMULATOR' }) as any)).toBe(false);
  });
  it('simulateur autorisé => utilisable', () => {
    expect(isConfigUsable(cfg({ mode: 'SIMULATOR' }) as any)).toBe(true);
  });
  it('LIVE sans clé => inutilisable', () => {
    expect(isConfigUsable(cfg({ apiKeyEncrypted: null }) as any)).toBe(false);
  });
});
