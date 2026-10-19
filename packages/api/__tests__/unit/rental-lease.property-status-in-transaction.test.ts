/**
 * Audit lot B — le statut du bien passe dans la transaction de creation du bail.
 * Avant : mise a jour hors transaction, echec avale en logger.warn (bail cree,
 * bien reste « disponible »). Apres : meme client de transaction, et un echec
 * annule la creation.
 */

const tx = { rentalLease: { create: jest.fn() } };
const transaction = jest.fn(async (callback: (t: any) => any) => callback(tx));
const propertyFindFirst = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (...args: any[]) => (transaction as any)(...args),
    property: { findFirst: propertyFindFirst },
    rentalLease: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => [])
    },
    tenantClient: {
      findFirst: jest.fn(async () => ({ id: 'client-loc', tenant_id: 'tenant-1', tenantId: 'tenant-1' }))
    },
    crmDeal: { findFirst: jest.fn() }
  }
}));

jest.mock('../../src/lib/subscription/enforcement', () => ({ getSubscriptionEnforcement: () => 'off' }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(async () => ({ ownAssetsOnly: false }))
}));
jest.mock('../../src/services/tenant-service', () => ({
  getOrCreateTenantClientFromContact: jest.fn(),
  getTenantById: jest.fn()
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendAccountCreationEmail: jest.fn(), sendEmail: jest.fn() }
}));
const warn = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: (...a: any[]) => warn(...a), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn()
}));
const updatePropertyStatus = jest.fn();
// Reproduit la matrice reelle pour les cas utiles : ARCHIVED et SOLD ne passent
// pas a RENTED (voir ALLOWED_TRANSITIONS dans property-status-service.ts).
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: (...a: any[]) => updatePropertyStatus(...a),
  validateStatusTransition: (from: string, to: string) =>
    from === to || (to === 'RENTED' && (from === 'SOLD' || from === 'ARCHIVED'))
      ? { valid: false, error: `Invalid status transition from ${from} to ${to}` }
      : { valid: true }
}));
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn().mockResolvedValue(undefined)
}));

import { createLease } from '../../src/services/rental-lease-service';

const TENANT = 'tenant-1';

function leaseInput(): any {
  return {
    propertyId: 'bien-1',
    leaseNumber: 'BAIL-2026-0001',
    startDate: new Date('2026-10-01'),
    dueDayOfMonth: 1,
    rentAmount: 900000,
    primaryRenterClientId: 'client-loc'
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({
    id: 'bien-1',
    tenantId: TENANT,
    status: 'AVAILABLE',
    transactionModes: ['RENTAL']
  });
  tx.rentalLease.create.mockResolvedValue({ id: 'lease-1', lease_number: 'BAIL-2026-0001' });
});

describe('createLease — statut du bien dans la transaction', () => {
  it('met a jour le statut du bien avec le client de transaction', async () => {
    await createLease(TENANT, leaseInput(), 'user-actor').catch(() => undefined);

    expect(updatePropertyStatus).toHaveBeenCalledTimes(1);
    const args = updatePropertyStatus.mock.calls[0];
    expect(args[0]).toBe('bien-1');
    expect(args[1]).toBe('RENTED');
    expect(args[2]).toBe(TENANT);
    expect(args[6]).toBe(tx);
  });

  it('rejette si la mise a jour du statut echoue (plus de warn silencieux)', async () => {
    updatePropertyStatus.mockRejectedValue(new Error('Transition interdite'));

    await expect(createLease(TENANT, leaseInput(), 'user-actor')).rejects.toThrow('Transition interdite');
    expect(warn).not.toHaveBeenCalledWith('Could not update property status after lease creation', expect.anything());
  });

  it('ne touche pas au statut si le bien est deja dans le statut cible', async () => {
    propertyFindFirst.mockResolvedValue({
      id: 'bien-1',
      tenantId: TENANT,
      status: 'RENTED',
      transactionModes: ['RENTAL']
    });
    await createLease(TENANT, leaseInput(), 'user-actor').catch(() => undefined);
    expect(updatePropertyStatus).not.toHaveBeenCalled();
  });

  it.each(['ARCHIVED', 'SOLD'])(
    'cree le bail sans changer le statut quand la transition depuis %s est invalide',
    async status => {
      propertyFindFirst.mockResolvedValue({
        id: 'bien-1',
        tenantId: TENANT,
        status,
        ownershipType: 'TENANT',
        transactionModes: ['RENTAL']
      });
      const result = await createLease(TENANT, leaseInput(), 'user-actor');
      expect(tx.rentalLease.create).toHaveBeenCalledTimes(1);
      expect(updatePropertyStatus).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('transition non permise'),
        expect.objectContaining({ from: status, to: 'RENTED' })
      );
    }
  );
});
