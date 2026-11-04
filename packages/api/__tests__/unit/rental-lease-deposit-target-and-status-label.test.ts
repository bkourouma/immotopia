/**
 * BUG-2026-11-04-012 : modifier le dépôt de garantie du bail met à jour la
 * cible (`target_amount`) du dépôt déjà créé, dans la même transaction.
 * BUG-2026-11-03-032 : un changement de statut refusé nomme les statuts en
 * français (« Actif », « Brouillon »), pas en codes bruts.
 */

type Row = Record<string, any>;

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(async () => ({ id: 'mv' })),
  getOrCreateTenantAccountTx: jest.fn(async () => ({ id: 'acc-1' }))
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));
jest.mock('../../src/services/tenant-service', () => ({ getTenantById: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({ assertThirdPartyAllowedForTenant: jest.fn() }));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(),
  validateStatusTransition: jest.fn()
}));

const EXISTING = {
  id: 'lease-1',
  tenant_id: 'tenant-A',
  status: 'ACTIVE',
  start_date: new Date(Date.UTC(2026, 0, 1)),
  end_date: new Date(Date.UTC(2027, 11, 31)),
  rent_amount: 75000,
  service_charge_amount: 0,
  security_deposit_amount: 400000,
  primary_renter_client_id: 'client-1'
};

const calls: string[] = [];

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async () => ({ ...EXISTING })),
    update: jest.fn(async ({ data }: Row) => {
      calls.push('lease.update');
      return { ...EXISTING, ...data, id: 'lease-1', documents: [] };
    })
  },
  rentalSecurityDeposit: {
    updateMany: jest.fn(async () => {
      calls.push('deposit.updateMany');
      return { count: 1 };
    })
  },
  leaseEvent: { findMany: jest.fn(async () => []) },
  rentalInstallment: { findMany: jest.fn(async () => []) },
  user: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));

import { updateLease, updateLeaseStatus } from '../../src/services/rental-lease-service';

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
});

describe('updateLease — dépôt de garantie modifié (BUG-2026-11-04-012)', () => {
  it('aligne la cible du dépôt existant sur le nouveau montant, dans la même transaction', async () => {
    await updateLease('tenant-A', 'lease-1', { securityDepositAmount: 450000 }, 'user-1');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.rentalSecurityDeposit.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.rentalSecurityDeposit.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ lease_id: 'lease-1', tenant_id: 'tenant-A' });
    expect(Number(arg.data.target_amount)).toBe(450000);
    // Avant la mise à jour du bail : sa relation `deposit` relue porte la nouvelle cible.
    expect(calls).toEqual(['deposit.updateMany', 'lease.update']);
  });

  it('ne touche pas au dépôt quand le montant du dépôt n’est pas modifié', async () => {
    await updateLease('tenant-A', 'lease-1', { notes: 'x' }, 'user-1');
    expect(mockPrisma.rentalSecurityDeposit.updateMany).not.toHaveBeenCalled();
  });
});

describe('updateLeaseStatus — statut refusé (BUG-2026-11-03-032)', () => {
  it('nomme les statuts en français', async () => {
    await expect(updateLeaseStatus('tenant-A', 'lease-1', 'DRAFT' as any, 'user-1')).rejects.toThrow(
      'Changement de statut invalide : de Actif à Brouillon'
    );
  });
});
