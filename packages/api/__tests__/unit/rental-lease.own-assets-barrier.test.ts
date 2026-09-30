/**
 * BUG-2026-09-30-020 — un bail refuse par la barriere « detenu en propre » ne
 * doit laisser AUCUNE trace : ni TenantClient, ni compte utilisateur, ni
 * invitation, ni e-mail. Avant correction, le client (et le compte) du
 * locataire principal etaient crees AVANT le controle de la barriere.
 *
 * `own-assets-barrier-service.ts` n'est pas mocke ; seuls l'enforcement et les
 * droits le sont (meme convention que `property-service.own-assets-barrier.test.ts`).
 */

const getEntitlementsMock = jest.fn();

jest.mock('../../src/lib/subscription/enforcement', () => ({
  getSubscriptionEnforcement: () => 'enforce'
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlementsMock(...args)
}));

const transaction = jest.fn(async (callback: (tx: any) => any) => callback({}));
const userCreate = jest.fn();
const tenantClientCreate = jest.fn();
const propertyFindFirst = jest.fn();
const leaseFindFirst = jest.fn(async (..._a: any[]): Promise<any> => null);
const leaseCount = jest.fn(async (..._a: any[]) => 0);
const tenantClientFindFirst = jest.fn(async (..._a: any[]): Promise<any> => null);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (...args: any[]) => (transaction as any)(...args),
    user: { create: userCreate },
    tenantClient: { create: tenantClientCreate, findFirst: tenantClientFindFirst },
    property: { findFirst: propertyFindFirst },
    rentalLease: { findFirst: leaseFindFirst, count: leaseCount, findMany: jest.fn(async () => []) },
    crmDeal: { findFirst: jest.fn() }
  }
}));

const getOrCreateTenantClientFromContact = jest.fn();
jest.mock('../../src/services/tenant-service', () => ({
  getOrCreateTenantClientFromContact: (...args: any[]) => getOrCreateTenantClientFromContact(...args),
  getTenantById: jest.fn()
}));

const sendAccountCreationEmail = jest.fn();
const sendEmail = jest.fn();
jest.mock('../../src/services/email-service', () => ({
  emailService: {
    sendAccountCreationEmail: (...a: any[]) => sendAccountCreationEmail(...a),
    sendEmail: (...a: any[]) => sendEmail(...a)
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn()
}));
jest.mock('../../src/services/property-status-service', () => ({ updatePropertyStatus: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn().mockResolvedValue(undefined)
}));

import { createLease } from '../../src/services/rental-lease-service';
import { OwnAssetsOnlyError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-patrimoine';

function lease(overrides: Record<string, unknown> = {}): any {
  return {
    propertyId: 'bien-1',
    startDate: new Date('2026-10-01'),
    dueDayOfMonth: 1,
    rentAmount: 900000,
    primaryRenterContactId: 'contact-locataire',
    ownerContactId: 'contact-tiers',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  propertyFindFirst.mockResolvedValue({ id: 'bien-1', tenantId: TENANT, transactionModes: ['RENTAL'] });
});

describe('createLease — barriere « detenu en propre » avant toute ecriture', () => {
  it('refuse un proprietaire tiers sans creer client, compte, invitation ni e-mail', async () => {
    getEntitlementsMock.mockResolvedValue({ tenantId: TENANT, enforcement: 'enforce', ownAssetsOnly: true });

    await expect(createLease(TENANT, lease(), 'user-actor')).rejects.toBeInstanceOf(OwnAssetsOnlyError);

    expect(getOrCreateTenantClientFromContact).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(tenantClientCreate).not.toHaveBeenCalled();
    expect(sendAccountCreationEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('refuse un proprietaire tiers designe par son client, sans rien ecrire', async () => {
    getEntitlementsMock.mockResolvedValue({ tenantId: TENANT, enforcement: 'enforce', ownAssetsOnly: true });

    await expect(
      createLease(TENANT, lease({ ownerContactId: undefined, ownerClientId: 'client-tiers' }), 'user-actor')
    ).rejects.toBeInstanceOf(OwnAssetsOnlyError);

    expect(getOrCreateTenantClientFromContact).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("un bailleur inconnu de l'agence refuse le bail avant toute creation de client locataire", async () => {
    getEntitlementsMock.mockResolvedValue({ tenantId: TENANT, enforcement: 'enforce', ownAssetsOnly: false });
    tenantClientFindFirst.mockResolvedValue(null);

    await expect(
      createLease(TENANT, lease({ ownerContactId: undefined, ownerClientId: 'client-etranger' }), 'user-actor')
    ).rejects.toThrow();

    expect(getOrCreateTenantClientFromContact).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('cree le client du locataire dans la transaction du bail, jamais avant', async () => {
    getEntitlementsMock.mockResolvedValue({ tenantId: TENANT, enforcement: 'enforce', ownAssetsOnly: false });
    getOrCreateTenantClientFromContact.mockRejectedValue(new Error('echec en cours de route'));

    await expect(createLease(TENANT, lease({ ownerContactId: undefined }), 'user-actor')).rejects.toThrow(
      'echec en cours de route'
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(getOrCreateTenantClientFromContact).toHaveBeenCalledWith(
      TENANT,
      'contact-locataire',
      'RENTER',
      expect.objectContaining({ db: expect.anything() })
    );
    expect(sendAccountCreationEmail).not.toHaveBeenCalled();
  });
});
