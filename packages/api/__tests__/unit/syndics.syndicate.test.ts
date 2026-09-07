jest.mock('@prisma/client', () => {
  const prisma: any = {
    property: {
      findFirst: jest.fn()
    },
    crmContact: {
      findFirst: jest.fn()
    },
    crmContactRole: {
      findFirst: jest.fn(),
      create: jest.fn()
    },
    syndicate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn()
    },
    syndicateLot: {
      create: jest.fn()
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma
  };
});

import {
  createSyndicateLot,
  createSyndicateWithDefaults,
  listSyndicatesByTenant
} from '../../src/lib/syndics/queries';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as {
  __mockPrisma: {
    property: {
      findFirst: jest.Mock;
    };
    crmContact: {
      findFirst: jest.Mock;
    };
    crmContactRole: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    syndicate: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    syndicateLot: {
      create: jest.Mock;
    };
  };
};

describe('Syndics queries - US1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a syndicate scoped to the tenant', async () => {
    (mockPrisma.property.findFirst as jest.Mock).mockResolvedValue({
      id: 'property-imm-1',
      propertyType: 'IMMEUBLE'
    });
    (mockPrisma.syndicate.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.syndicate.create as jest.Mock).mockResolvedValue({
      id: 'syndic-1',
      tenantId: 'tenant-a',
      name: 'Residence Les Jardins',
      address: 'Dakar'
    });

    const result = await createSyndicateWithDefaults('tenant-a', {
      propertyId: 'property-imm-1',
      name: 'Residence Les Jardins',
      address: 'Dakar'
    });

    expect(mockPrisma.syndicate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        propertyId: 'property-imm-1',
        name: 'Residence Les Jardins',
        address: 'Dakar'
      })
    });
    expect(result.id).toBe('syndic-1');
  });

  it('lists syndicates with tenant isolation in query filter', async () => {
    (mockPrisma.syndicate.findMany as jest.Mock).mockResolvedValue([]);

    await listSyndicatesByTenant('tenant-a');

    expect(mockPrisma.syndicate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a' }
      })
    );
  });

  it('creates a lot only if the syndicate belongs to the tenant', async () => {
    (mockPrisma.syndicate.findFirst as jest.Mock).mockResolvedValue({ id: 'syndic-1', propertyId: 'property-imm-1' });
    (mockPrisma.property.findFirst as jest.Mock).mockResolvedValue({
      id: 'property-lot-1',
      containerParentId: 'property-imm-1'
    });
    (mockPrisma.syndicateLot.create as jest.Mock).mockResolvedValue({
      id: 'lot-1',
      syndicateId: 'syndic-1',
      lotNumber: 'A-01'
    });

    const result = await createSyndicateLot('tenant-a', {
      syndicateId: 'syndic-1',
      propertyId: 'property-lot-1',
      lotNumber: 'A-01',
      lotType: 'APARTMENT' as any,
      tantiemes: 100
    });

    expect(mockPrisma.syndicate.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'syndic-1',
        tenantId: 'tenant-a'
      },
      select: { id: true, propertyId: true }
    });
    expect(mockPrisma.syndicateLot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        syndicateId: 'syndic-1',
        lotNumber: 'A-01'
      })
    });
    expect(result.id).toBe('lot-1');
  });

  it('rejects lot creation when syndicate is from another tenant', async () => {
    (mockPrisma.syndicate.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      createSyndicateLot('tenant-a', {
        syndicateId: 'syndic-other-tenant',
        propertyId: 'property-lot-2',
        lotNumber: 'B-11',
        lotType: 'APARTMENT' as any,
        tantiemes: 90
      })
    ).rejects.toMatchObject({
      status: 404
    });

    expect(mockPrisma.syndicateLot.create).not.toHaveBeenCalled();
  });
});
