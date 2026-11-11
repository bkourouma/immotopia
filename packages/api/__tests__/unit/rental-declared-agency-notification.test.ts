/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E-mail immédiat à l'agence (extrait de l'ancien declarePayment) : envoyé aux
 * administrateurs et au propriétaire du bail, désactivable, et jamais bloquant.
 */
const getConfig = jest.fn();
const sendToAgency = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    tenantClient: { findFirst: jest.fn(async () => ({ user: { fullName: 'Awa Traoré' } })) },
    rentalLease: {
      findUnique: jest.fn(async () => ({
        owner_client_id: 'owner-1',
        property: { title: 'Villa', internalReference: 'V1', owner: null, containerParent: null },
        ownerClient: { id: 'owner-1', user: { fullName: 'Mme Propriétaire', email: 'proprio@example.com' } }
      }))
    },
    role: { findUnique: jest.fn(async () => ({ id: 'role-admin' })) },
    userRole: { findMany: jest.fn(async () => [{ userId: 'u-admin' }]) },
    user: {
      findMany: jest.fn(async () => [{ id: 'u-admin', email: 'admin@example.com', fullName: 'Admin' }]),
      findFirst: jest.fn(async () => null)
    },
    tenant: { findUnique: jest.fn(async () => ({ name: 'Agence A', contactEmail: null })) }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: (...a: any[]) => getConfig(...a)
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendPaymentDeclarationToAgency: (...a: any[]) => sendToAgency(...a) }
}));
jest.mock('../../src/utils/property-display', () => ({ getPropertyDisplayLabel: () => 'Villa' }));

import { notifyAgencyOfDeclaration } from '../../src/lib/rental/declared-payment/agency-notification';

const params = {
  tenantId: 'tenant-a',
  leaseId: 'lease-1',
  declarationId: 'decl-1',
  tenantClientId: 'client-1',
  leaseNumber: 'B-042',
  details: {
    amount: 100000,
    paymentDate: '2026-11-01',
    paymentMethod: 'CASH',
    transactionPhone: '0700000001',
    reference: null
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  getConfig.mockResolvedValue({ enabled: true });
  sendToAgency.mockResolvedValue(undefined);
});

describe('notifyAgencyOfDeclaration', () => {
  it('écrit aux administrateurs ET au propriétaire (téléphone masqué pour lui)', async () => {
    await notifyAgencyOfDeclaration(params);
    expect(getConfig).toHaveBeenCalledWith('tenant-a', 'PAYMENT_DECLARATION_AGENCY');
    expect(sendToAgency).toHaveBeenCalledTimes(2);
    expect(sendToAgency.mock.calls[0][0]).toBe('admin@example.com');
    expect(sendToAgency.mock.calls[0][4]).toMatchObject({ paymentMethod: 'CASH', transactionPhone: '0700000001' });
    expect(sendToAgency.mock.calls[1][0]).toBe('proprio@example.com');
    expect(sendToAgency.mock.calls[1][4].transactionPhone).toMatch(/0001$/);
    expect(sendToAgency.mock.calls[1][4].transactionPhone).not.toBe('0700000001');
  });

  it('notification désactivée : aucun envoi', async () => {
    getConfig.mockResolvedValue({ enabled: false });
    await notifyAgencyOfDeclaration(params);
    expect(sendToAgency).not.toHaveBeenCalled();
  });

  it("une erreur d'envoi est ignorée : la fonction ne lève jamais", async () => {
    sendToAgency.mockRejectedValue(new Error('SMTP down'));
    await expect(notifyAgencyOfDeclaration(params)).resolves.toBeUndefined();
    getConfig.mockRejectedValue(new Error('config en panne'));
    await expect(notifyAgencyOfDeclaration(params)).resolves.toBeUndefined();
  });
});
