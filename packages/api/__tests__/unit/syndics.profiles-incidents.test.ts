jest.mock('@prisma/client', () => {
  const prisma = {
    syndicate: {
      findFirst: jest.fn(),
    },
    syndicateLot: {
      findFirst: jest.fn(),
    },
    lotOwnerProfile: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    lotTenantProfile: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    syndicateIncident: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    budgetLineItem: {
      findFirst: jest.fn(),
    },
    maintenanceContract: {
      findFirst: jest.fn(),
    },
    incidentCostImputation: {
      create: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma,
  };
});

import {
  addIncidentImputationBySyndicate,
  createIncidentBySyndicate,
  createLotOwnerProfileBySyndicate,
  listLotOwnerProfilesBySyndicate,
  listLotTenantProfilesBySyndicate,
  updateIncidentBySyndicate,
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as {
  __mockPrisma: any;
};

describe('Syndics profiles/incidents queries - US5', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.syndicate.findFirst.mockResolvedValue({ id: 'syndic-1' });
    mockPrisma.syndicateLot.findFirst.mockResolvedValue({ id: 'lot-1' });
  });

  it('lists owner and tenant profiles', async () => {
    mockPrisma.lotOwnerProfile.findMany.mockResolvedValue([{ id: 'owner-profile-1' }]);
    mockPrisma.lotTenantProfile.findMany.mockResolvedValue([{ id: 'tenant-profile-1' }]);
    const owners = await listLotOwnerProfilesBySyndicate('tenant-1', 'syndic-1');
    const tenants = await listLotTenantProfilesBySyndicate('tenant-1', 'syndic-1');
    expect(owners).toHaveLength(1);
    expect(tenants).toHaveLength(1);
  });

  it('creates owner profile with portal access token', async () => {
    mockPrisma.lotOwnerProfile.create.mockResolvedValue({ id: 'owner-profile-1', portalAccessEnabled: true });
    const profile = await createLotOwnerProfileBySyndicate('tenant-1', 'syndic-1', {
      lotId: 'lot-1',
      contactId: 'contact-1',
      ownershipPercentage: 100,
      ownedSince: new Date('2026-01-01T00:00:00.000Z'),
      portalAccessEnabled: true,
    });
    expect(profile.id).toBe('owner-profile-1');
    expect(mockPrisma.lotOwnerProfile.create).toHaveBeenCalled();
  });

  it('creates and updates incident', async () => {
    mockPrisma.syndicateIncident.create.mockResolvedValue({ id: 'incident-1', status: 'REPORTED' });
    mockPrisma.syndicateIncident.findFirst.mockResolvedValue({ id: 'incident-1' });
    mockPrisma.syndicateIncident.update.mockResolvedValue({ id: 'incident-1', status: 'IN_PROGRESS' });

    const created = await createIncidentBySyndicate('tenant-1', 'syndic-1', {
      reportedByContactId: 'contact-1',
      lotId: 'lot-1',
      incidentType: 'LEAK',
      description: 'Fuite',
      urgency: 'HIGH',
      reportedAt: new Date('2026-03-06T00:00:00.000Z'),
    });
    expect(created.id).toBe('incident-1');

    const updated = await updateIncidentBySyndicate('tenant-1', 'syndic-1', 'incident-1', {
      status: 'IN_PROGRESS',
    });
    expect(updated.status).toBe('IN_PROGRESS');
  });

  it('adds incident imputation', async () => {
    mockPrisma.syndicateIncident.findFirst.mockResolvedValue({ id: 'incident-1' });
    mockPrisma.budgetLineItem.findFirst.mockResolvedValue({ id: 'line-1' });
    mockPrisma.incidentCostImputation.create.mockResolvedValue({ id: 'imp-1', amount: 15000 });

    const imputation = await addIncidentImputationBySyndicate('tenant-1', 'syndic-1', 'incident-1', {
      imputationType: 'SYNDICATE_BUDGET',
      amount: 15000,
      budgetLineId: 'line-1',
      notes: 'A imputer au budget maintenance',
    });
    expect(imputation.id).toBe('imp-1');
  });
});

