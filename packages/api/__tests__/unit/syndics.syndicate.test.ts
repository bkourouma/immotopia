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
      create: jest.fn(),
      update: jest.fn()
    },
    syndicateLot: {
      create: jest.fn(),
      // `syncSyndicateLotCount` recompte les lots puis met a jour le syndicat
      // depuis le commit 3b568c5 ; le mock ne l'avait pas suivi.
      count: jest.fn(async () => 1)
    },
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma))
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma
  };
});

// Registre des lots de l'abonnement (vague 2, lot B) : remplace par des
// espions. Son comportement est couvert par lot-registry.sync.test.ts ; ici,
// on verifie seulement que chaque operation l'appelle dans sa transaction.
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn(async () => ({ activated: [], deactivated: [], quota: null })),
  assertCapacityTx: jest.fn(async () => ({ decision: 'ALLOW' })),
  resolveLotScope: jest.fn(async (_tx: unknown, _tenantId: string, scope: unknown) => scope),
  ACTIVE_SYNDICATE_STATUSES: ['ACTIVE', 'IN_DISPUTE'],
  LOT_QUOTA_REACHED_REASON: 'Quota de lots atteint'
}));
const mockLotRegistry = jest.requireMock('../../src/services/lot-registry-service') as {
  syncLotActivationsTx: jest.Mock;
  assertCapacityTx: jest.Mock;
};

import {
  createSyndicateLot,
  createSyndicateWithDefaults,
  importLotsFromPropertiesBySyndicate,
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
      update: jest.Mock;
    };
    syndicateLot: {
      create: jest.Mock;
      count: jest.Mock;
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

    // On assere l'invariant que ce test surveille — l'isolation par agence est
    // dans le filtre — et non la forme exacte de la requete : depuis 3b568c5
    // elle porte aussi un filtre de statut et une pagination, ce qui faisait
    // echouer l'egalite stricte sans qu'aucune isolation ne soit rompue.
    expect(mockPrisma.syndicate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' })
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


describe('registre des lots et capacité COPROPRIETES (vague 2, lot B)', () => {
  it('la création d’une copropriété contrôle la capacité COPROPRIETES dans sa transaction', async () => {
    mockLotRegistry.assertCapacityTx.mockClear();
    mockPrisma.syndicate.create.mockResolvedValueOnce({ id: 'syn-q', tenantId: 'tenant-1' });
    await createSyndicateWithDefaults('tenant-1', { name: 'Résidence Q' });
    expect(mockLotRegistry.assertCapacityTx).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'COPROPRIETES');
  });

  it('un lot de copropriété créé entre au registre dans la même transaction', async () => {
    mockLotRegistry.syncLotActivationsTx.mockClear();
    mockPrisma.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1', propertyId: null });
    mockPrisma.property.findFirst.mockResolvedValueOnce({ id: 'prop-9', containerParentId: null, propertyType: 'APPARTEMENT' });
    mockPrisma.syndicateLot.create.mockResolvedValueOnce({ id: 'lot-9' });
    await createSyndicateLot('tenant-1', {
      syndicateId: 'syn-1',
      propertyId: 'prop-9',
      lotNumber: 'A9',
      lotType: 'APARTMENT' as any,
      tantiemes: 100
    });
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenCalledWith(expect.anything(), 'tenant-1', { syndicateLotIds: ['lot-9'] });
  });
});

describe('import de lots par lots et quota (vague 2, lot B)', () => {
  function arrangeImport() {
    const prisma = mockPrisma as any;
    prisma.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    prisma.property.findMany = jest.fn(async () => [
      { id: 'p1', propertyType: 'APPARTEMENT', internalReference: 'A1', title: 'A1', owner: null },
      { id: 'p2', propertyType: 'PARKING_BOX', internalReference: 'P1', title: 'P1', owner: null },
      { id: 'p3', propertyType: 'APPARTEMENT', internalReference: 'A2', title: 'A2', owner: null },
      { id: 'p4', propertyType: 'BUREAU', internalReference: 'B1', title: 'B1', owner: null }
    ]);
    prisma.crmContact.findMany = jest.fn(async () => []);
    prisma.syndicateLot.findMany = jest.fn(async () => []);
    prisma.syndicateLot.create.mockImplementation(async ({ data }: any) => ({ id: `lot-${data.propertyId}` }));
    prisma.syndicate.update.mockResolvedValue({});
    return prisma;
  }

  it('BLOCK (enforce) : import jusqu’a la limite, lignes restantes ecartees « Quota de lots atteint »', async () => {
    arrangeImport();
    const { QuotaExceededError } = jest.requireActual('../../src/middleware/error-middleware');
    // Il reste UNE place : le parking ne consomme rien (il passe), le deuxieme lot principal depasse.
    let room = 1;
    mockLotRegistry.syncLotActivationsTx.mockReset();
    mockLotRegistry.syncLotActivationsTx.mockImplementation(async (_tx: unknown, _t: string, scope: { syndicateLotIds: string[] }) => {
      if (scope.syndicateLotIds[0] === 'lot-p2') return { activated: [], deactivated: [], quota: null };
      if (room === 0) throw new QuotaExceededError({ capacityKey: 'LOTS', limit: 10, used: 10, requested: 1 });
      room -= 1;
      return { activated: [`P:${scope.syndicateLotIds[0]}`], deactivated: [], quota: { decision: 'ALLOW' } };
    });

    const result = await importLotsFromPropertiesBySyndicate('tenant-1', 'syn-1', ['p1', 'p2', 'p3', 'p4']);

    expect(result.created!.map(c => c.propertyId)).toEqual(['p1', 'p2']);
    expect(result.skipped).toEqual([
      { propertyId: 'p3', reason: 'Quota de lots atteint' },
      { propertyId: 'p4', reason: 'Quota de lots atteint' }
    ]);
    // Chaque ligne a sa propre transaction : l'echec de p3 n'annule pas p1.
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenCalledTimes(4);
  });

  it('BILL_OVERAGE : tout passe', async () => {
    arrangeImport();
    mockLotRegistry.syncLotActivationsTx.mockReset();
    mockLotRegistry.syncLotActivationsTx.mockResolvedValue({ activated: [], deactivated: [], quota: { decision: 'BILL' } });
    const result = await importLotsFromPropertiesBySyndicate('tenant-1', 'syn-1', ['p1', 'p2', 'p3', 'p4']);
    expect(result.created).toHaveLength(4);
    expect(result.skipped).toEqual([]);
  });

  it('une autre erreur n’est pas maquillee en quota', async () => {
    arrangeImport();
    mockLotRegistry.syncLotActivationsTx.mockReset();
    mockLotRegistry.syncLotActivationsTx.mockRejectedValueOnce(new Error('panne'));
    await expect(importLotsFromPropertiesBySyndicate('tenant-1', 'syn-1', ['p1'])).rejects.toThrow('panne');
  });
});
