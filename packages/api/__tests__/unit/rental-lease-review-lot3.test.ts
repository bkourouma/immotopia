/**
 * Revue fonctionnelle du 2026-11-20, lot 3 (bail, signature côté baux, documents).
 * Chaque cas échouait avant correctif ; Prisma est remplacé par des mocks.
 */

type Row = Record<string, any>;

const store = {
  leases: [] as Row[],
  clients: [] as Row[],
  coRenters: [] as Row[],
  payments: 0,
  depositMovements: 0,
  deposit: null as Row | null
};

const cancelOpen = jest.fn(async (..._args: any[]) => 0);
const leaseDelete = jest.fn(async (..._args: any[]) => undefined);
const leaseUpdate = jest.fn(async ({ data }: Row) => ({ ...store.leases[0], ...data }));

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.leases.find(l => l.id === where.id && l.tenant_id === where.tenant_id) ?? null
    ),
    count: jest.fn(async () => 0),
    update: (...a: any[]) => (leaseUpdate as any)(...a),
    delete: (...a: any[]) => (leaseDelete as any)(...a)
  },
  rentalLeaseCoRenter: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async ({ data }: Row) => {
      store.coRenters.push(data);
      return data;
    })
  },
  tenantClient: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.clients.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    )
  },
  rentalInstallment: { findFirst: jest.fn(async () => null) },
  rentalPayment: { count: jest.fn(async () => store.payments) },
  rentalSecurityDeposit: { findFirst: jest.fn(async () => store.deposit) },
  rentalDepositMovement: { count: jest.fn(async () => store.depositMovements) },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => callback(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: jest.fn(async () => undefined)
}));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(async () => undefined),
  validateStatusTransition: jest.fn(() => ({ valid: true }))
}));
jest.mock('../../src/services/tenant-service', () => ({
  getTenantById: jest.fn(async () => null),
  getOrCreateTenantClientFromContact: jest.fn()
}));
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => undefined)
}));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/lease-lifecycle/period-overlap', () => ({ assertNoLeaseOverlapTx: jest.fn() }));
jest.mock('../../src/lib/lease-lifecycle/service', () => ({ repriceUnstartedInstallmentsTx: jest.fn() }));
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: (...a: any[]) => (cancelOpen as any)(...a)
}));

import { addCoRenter, deleteLease, updateLeaseStatus } from '../../src/services/rental-lease-service';

const TENANT = 'tenant-a';

beforeEach(() => {
  jest.clearAllMocks();
  store.leases = [
    {
      id: 'lease-1',
      tenant_id: TENANT,
      property_id: 'prop-1',
      status: 'ACTIVE',
      lease_number: 'BAIL-2026-0001',
      primary_renter_client_id: 'client-renter',
      owner_client_id: 'client-owner',
      signed_at: null
    }
  ];
  store.clients = [
    { id: 'client-renter', tenantId: TENANT },
    { id: 'client-owner', tenantId: TENANT },
    { id: 'client-other', tenantId: TENANT }
  ];
  store.coRenters = [];
  store.payments = 0;
  store.depositMovements = 0;
  store.deposit = null;
});

describe('addCoRenter : un colocataire ne peut pas être une partie déjà au bail', () => {
  it('refuse le locataire principal comme colocataire', async () => {
    await expect(addCoRenter(TENANT, 'lease-1', 'client-renter', 'u1')).rejects.toThrow(
      'Le colocataire ne peut pas être le locataire principal ni le propriétaire du bail'
    );
    expect(store.coRenters).toHaveLength(0);
  });

  it('refuse le propriétaire comme colocataire', async () => {
    await expect(addCoRenter(TENANT, 'lease-1', 'client-owner', 'u1')).rejects.toThrow(
      'Le colocataire ne peut pas être le locataire principal ni le propriétaire du bail'
    );
    expect(store.coRenters).toHaveLength(0);
  });

  it('refuse un colocataire qui est la même personne (même compte) que le locataire principal', async () => {
    store.leases[0].primaryRenter = { userId: 'user-9' };
    store.clients.push({ id: 'client-same-person', tenantId: TENANT, userId: 'user-9' });
    await expect(addCoRenter(TENANT, 'lease-1', 'client-same-person', 'u1')).rejects.toThrow(
      'Le colocataire ne peut pas être le locataire principal ni le propriétaire du bail'
    );
  });

  it('accepte un tiers', async () => {
    await addCoRenter(TENANT, 'lease-1', 'client-other', 'u1').catch(() => undefined);
    expect(store.coRenters).toHaveLength(1);
  });
});

describe('deleteLease : pas de perte silencieuse de données financières ou signées', () => {
  it('refuse si des paiements sont rattachés au bail', async () => {
    store.payments = 2;
    await expect(deleteLease(TENANT, 'lease-1', 'u1')).rejects.toThrow(
      'Impossible de supprimer le bail : des paiements y sont enregistrés. Annulez le bail plutôt que de le supprimer.'
    );
    expect(leaseDelete).not.toHaveBeenCalled();
  });

  it('refuse si le dépôt de garantie a des mouvements', async () => {
    store.depositMovements = 1;
    await expect(deleteLease(TENANT, 'lease-1', 'u1')).rejects.toThrow(
      'Impossible de supprimer le bail : son dépôt de garantie a des mouvements enregistrés. Annulez le bail plutôt que de le supprimer.'
    );
    expect(leaseDelete).not.toHaveBeenCalled();
  });

  it('refuse si le bail est signé électroniquement', async () => {
    store.leases[0].signed_at = new Date('2026-10-01');
    await expect(deleteLease(TENANT, 'lease-1', 'u1')).rejects.toThrow(
      'Impossible de supprimer le bail : il a été signé électroniquement. Annulez le bail plutôt que de le supprimer.'
    );
    expect(leaseDelete).not.toHaveBeenCalled();
  });

  it('annule les demandes de signature en cours avant de supprimer un bail sans historique', async () => {
    await deleteLease(TENANT, 'lease-1', 'u1');
    expect(cancelOpen).toHaveBeenCalledWith({ tenantId: TENANT, userId: 'u1' }, 'RentalLease', 'lease-1');
    expect(leaseDelete).toHaveBeenCalledTimes(1);
  });
});

describe('updateLeaseStatus : un bail terminé ou annulé ne peut plus être signé', () => {
  it.each(['ENDED', 'CANCELED'])('annule les demandes de signature en cours quand le bail passe à %s', async status => {
    await updateLeaseStatus(TENANT, 'lease-1', status as any, 'u1');
    expect(cancelOpen).toHaveBeenCalledWith({ tenantId: TENANT, userId: 'u1' }, 'RentalLease', 'lease-1');
  });

  it('ne touche pas aux demandes quand le bail est suspendu', async () => {
    await updateLeaseStatus(TENANT, 'lease-1', 'SUSPENDED' as any, 'u1');
    expect(cancelOpen).not.toHaveBeenCalled();
  });
});

describe('createLease : le locataire ne peut pas être le propriétaire du bien', () => {
  const { createLease } = jest.requireActual('../../src/services/rental-lease-service');
  const { getOrCreateTenantClientFromContact } = jest.requireMock('../../src/services/tenant-service');

  const input = (extra: Row = {}) => ({
    propertyId: 'prop-1',
    leaseNumber: 'BAIL-2026-0099',
    startDate: new Date('2026-10-01'),
    dueDayOfMonth: 5,
    rentAmount: 100000,
    ...extra
  });

  beforeEach(() => {
    mockPrisma.property = {
      findFirst: jest.fn(async () => ({
        id: 'prop-1',
        tenantId: TENANT,
        status: 'AVAILABLE',
        transactionModes: ['RENTAL']
      }))
    };
    mockPrisma.crmDeal = { findFirst: jest.fn() };
    mockPrisma.rentalLease.findMany = jest.fn(async () => []);
    mockPrisma.rentalLease.create = jest.fn(async () => ({ id: 'lease-new', lease_number: 'BAIL-2026-0099' }));
    store.clients.push(
      { id: 'client-p1', tenantId: TENANT, userId: 'user-1' },
      { id: 'client-p2', tenantId: TENANT, userId: 'user-1' }
    );
  });

  it('refuse le même client comme locataire et propriétaire', async () => {
    await expect(
      createLease(TENANT, input({ primaryRenterClientId: 'client-renter', ownerClientId: 'client-renter' }), 'u1')
    ).rejects.toThrow('Le locataire ne peut pas être aussi le propriétaire du bien');
  });

  it('refuse deux clients qui sont le même compte utilisateur', async () => {
    await expect(
      createLease(TENANT, input({ primaryRenterClientId: 'client-p1', ownerClientId: 'client-p2' }), 'u1')
    ).rejects.toThrow('Le locataire ne peut pas être aussi le propriétaire du bien');
  });

  it('refuse le même contact CRM comme locataire et propriétaire', async () => {
    await expect(
      createLease(TENANT, input({ primaryRenterContactId: 'contact-1', ownerContactId: 'contact-1' }), 'u1')
    ).rejects.toThrow('Le locataire ne peut pas être aussi le propriétaire du bien');
  });

  it('refuse deux contacts qui résolvent vers le même compte (même e-mail)', async () => {
    getOrCreateTenantClientFromContact
      .mockResolvedValueOnce({ tenantClient: { id: 'tc-renter' }, isNewUser: false, user: { id: 'user-7' } })
      .mockResolvedValueOnce({ tenantClient: { id: 'tc-owner' }, isNewUser: false, user: { id: 'user-7' } });
    await expect(
      createLease(TENANT, input({ primaryRenterContactId: 'contact-1', ownerContactId: 'contact-2' }), 'u1')
    ).rejects.toThrow('Le locataire ne peut pas être aussi le propriétaire du bien');
    expect(mockPrisma.rentalLease.create).not.toHaveBeenCalled();
  });
});
