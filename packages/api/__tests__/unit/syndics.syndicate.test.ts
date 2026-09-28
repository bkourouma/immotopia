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
      count: jest.fn(async () => 0),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    syndicateLot: {
      create: jest.fn(),
      // `syncSyndicateLotCount` recompte les lots puis met a jour le syndicat
      // depuis le commit 3b568c5 ; le mock ne l'avait pas suivi.
      count: jest.fn(async () => 1)
    },
    // Comptes utilises par `deleteEmptySyndicateByTenant` (ecart recette #8) :
    // par defaut vides, chaque test « non vide » les override explicitement.
    syndicateBudget: { count: jest.fn(async () => 0) },
    chargeCall: { count: jest.fn(async () => 0) },
    generalMeeting: { count: jest.fn(async () => 0) },
    syndicateDocument: { count: jest.fn(async () => 0) },
    maintenanceContract: { count: jest.fn(async () => 0) },
    syndicateIncident: { count: jest.fn(async () => 0) },
    serviceProvider: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
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

// Suite de l'audit S1 : le logo prive de la copropriete supprimee est aussi
// supprime, mais jamais via un vrai acces disque dans ce test unitaire.
jest.mock('../../src/lib/documents/branding-storage', () => ({
  deleteBrandingImage: jest.fn(async () => undefined)
}));
const mockBrandingStorage = jest.requireMock('../../src/lib/documents/branding-storage') as {
  deleteBrandingImage: jest.Mock;
};
const mockLotRegistry = jest.requireMock('../../src/services/lot-registry-service') as {
  syncLotActivationsTx: jest.Mock;
  assertCapacityTx: jest.Mock;
};

import {
  createSyndicateLot,
  createSyndicateWithDefaults,
  createServiceProvider,
  updateServiceProviderByTenant,
  deleteServiceProviderByTenant,
  deleteEmptySyndicateByTenant,
  importLotsFromPropertiesBySyndicate,
  listSyndicatesByTenant
} from '../../src/lib/syndics/queries';

// Typage volontairement large (`any`) au-dela des champs deja types : ce mock
// gagne un modele a chaque ecart couvert, et dupliquer son type ici a chaque
// fois serait plus fragile que la verite du mock lui-meme.
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
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    syndicateLot: {
      create: jest.Mock;
      count: jest.Mock;
    };
    syndicateBudget: { count: jest.Mock };
    chargeCall: { count: jest.Mock };
    generalMeeting: { count: jest.Mock };
    syndicateDocument: { count: jest.Mock };
    maintenanceContract: { count: jest.Mock };
    syndicateIncident: { count: jest.Mock };
    serviceProvider: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
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

  it('lists syndicates with tenant isolation in query filter, on findMany AND count', async () => {
    (mockPrisma.syndicate.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.syndicate.count as jest.Mock).mockResolvedValue(0);

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
    // Ecart recette (lot syndic-ecarts, T1) : le compte total suit le meme
    // filtre tenant que la page, sinon `total` mentirait sur ce que voit une
    // autre agence.
    expect(mockPrisma.syndicate.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' })
      })
    );
  });

  it('applies the requested page/limit to skip/take and returns the pagination envelope', async () => {
    (mockPrisma.syndicate.findMany as jest.Mock).mockResolvedValue([{ id: 'syn-1' }, { id: 'syn-2' }]);
    (mockPrisma.syndicate.count as jest.Mock).mockResolvedValue(12);

    const result = await listSyndicatesByTenant('tenant-a', { page: 2, limit: 5 });

    expect(mockPrisma.syndicate.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }));
    expect(result).toEqual({
      items: [{ id: 'syn-1' }, { id: 'syn-2' }],
      total: 12,
      page: 2,
      limit: 5,
      totalPages: 3
    });
  });

  it('defaults to page 1 / limit 20 when no pagination is given', async () => {
    (mockPrisma.syndicate.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.syndicate.count as jest.Mock).mockResolvedValue(0);

    const result = await listSyndicatesByTenant('tenant-a');

    expect(mockPrisma.syndicate.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(result).toMatchObject({ page: 1, limit: 20 });
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

  it('creates a lot without a linked property (parking/cellar, écart recette MC1/MP1) without looking up any property', async () => {
    (mockPrisma.syndicate.findFirst as jest.Mock).mockResolvedValue({ id: 'syndic-1', propertyId: 'property-imm-1' });
    (mockPrisma.syndicateLot.create as jest.Mock).mockResolvedValue({
      id: 'lot-mp1',
      syndicateId: 'syndic-1',
      lotNumber: 'MP1'
    });

    const result = await createSyndicateLot('tenant-a', {
      syndicateId: 'syndic-1',
      lotNumber: 'MP1',
      lotType: 'PARKING' as any,
      tantiemes: 5
    });

    expect(mockPrisma.property.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.syndicateLot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        syndicateId: 'syndic-1',
        propertyId: null,
        lotNumber: 'MP1',
        lotType: 'PARKING'
      })
    });
    expect(result.id).toBe('lot-mp1');
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
    mockPrisma.property.findFirst.mockResolvedValueOnce({
      id: 'prop-9',
      containerParentId: null,
      propertyType: 'APPARTEMENT'
    });
    mockPrisma.syndicateLot.create.mockResolvedValueOnce({ id: 'lot-9' });
    await createSyndicateLot('tenant-1', {
      syndicateId: 'syn-1',
      propertyId: 'prop-9',
      lotNumber: 'A9',
      lotType: 'APARTMENT' as any,
      tantiemes: 100
    });
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenCalledWith(expect.anything(), 'tenant-1', {
      syndicateLotIds: ['lot-9']
    });
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
    mockLotRegistry.syncLotActivationsTx.mockImplementation(
      async (_tx: unknown, _t: string, scope: { syndicateLotIds: string[] }) => {
        if (scope.syndicateLotIds[0] === 'lot-p2') return { activated: [], deactivated: [], quota: null };
        if (room === 0) throw new QuotaExceededError({ capacityKey: 'LOTS', limit: 10, used: 10, requested: 1 });
        room -= 1;
        return { activated: [`P:${scope.syndicateLotIds[0]}`], deactivated: [], quota: { decision: 'ALLOW' } };
      }
    );

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
    mockLotRegistry.syncLotActivationsTx.mockResolvedValue({
      activated: [],
      deactivated: [],
      quota: { decision: 'BILL' }
    });
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

describe('Suppression d une copropriete vide uniquement (ecart recette #8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Vide par defaut : chaque test « non vide » override le compte qui l'interesse.
    mockPrisma.syndicateBudget.count.mockResolvedValue(0);
    mockPrisma.chargeCall.count.mockResolvedValue(0);
    mockPrisma.generalMeeting.count.mockResolvedValue(0);
    mockPrisma.syndicateDocument.count.mockResolvedValue(0);
    mockPrisma.maintenanceContract.count.mockResolvedValue(0);
    mockPrisma.syndicateIncident.count.mockResolvedValue(0);
    mockPrisma.syndicateLot.count.mockResolvedValue(0);
  });

  it('refuse (404) une copropriete d une autre agence, introuvable pour ce tenant', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValueOnce(null);

    await expect(deleteEmptySyndicateByTenant('tenant-a', 'syn-other')).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.syndicate.delete).not.toHaveBeenCalled();
  });

  it('refuse (409) si la copropriete a au moins un lot', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    mockPrisma.syndicateLot.count.mockResolvedValueOnce(2);

    await expect(deleteEmptySyndicateByTenant('tenant-a', 'syn-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.syndicate.delete).not.toHaveBeenCalled();
  });

  it('refuse (409) si la copropriete a au moins un appel de charges, meme sans lot', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    mockPrisma.chargeCall.count.mockResolvedValueOnce(1);

    await expect(deleteEmptySyndicateByTenant('tenant-a', 'syn-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.syndicate.delete).not.toHaveBeenCalled();
  });

  it('supprime une copropriete sans aucune donnee liee (lots, budgets, charges, AG, documents, contrats, incidents)', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValueOnce({ id: 'syn-1' });
    mockPrisma.syndicate.delete.mockResolvedValueOnce({ id: 'syn-1' });

    const result = await deleteEmptySyndicateByTenant('tenant-a', 'syn-1');

    expect(mockPrisma.syndicate.delete).toHaveBeenCalledWith({ where: { id: 'syn-1', tenantId: 'tenant-a' } });
    expect(mockLotRegistry.syncLotActivationsTx).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-a',
      expect.anything(),
      { reason: 'SYNDICATE_DELETED' }
    );
    expect(result.id).toBe('syn-1');
    // Pas de logo pour cette copropriete : rien a supprimer sur le disque.
    expect(mockBrandingStorage.deleteBrandingImage).toHaveBeenCalledWith('tenant-a', undefined);
  });

  it('supprime aussi le logo prive de la copropriete apres sa suppression en base', async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValueOnce({
      id: 'syn-1',
      logoPath: 'branding/tenant-a/syndicates/syn-1/logo-abc.png'
    });
    mockPrisma.syndicate.delete.mockResolvedValueOnce({ id: 'syn-1' });

    await deleteEmptySyndicateByTenant('tenant-a', 'syn-1');

    expect(mockPrisma.syndicate.delete).toHaveBeenCalledWith({ where: { id: 'syn-1', tenantId: 'tenant-a' } });
    expect(mockBrandingStorage.deleteBrandingImage).toHaveBeenCalledWith(
      'tenant-a',
      'branding/tenant-a/syndicates/syn-1/logo-abc.png'
    );
  });
});

describe('Prestataires rattaches a l agence (ecart recette #2, FR-010)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cree un prestataire rattache au tenant', async () => {
    mockPrisma.serviceProvider.create.mockResolvedValueOnce({
      id: 'prov-1',
      tenantId: 'tenant-a',
      name: 'Nettoyage Plus'
    });

    const result = await createServiceProvider('tenant-a', { name: 'Nettoyage Plus' });

    expect(mockPrisma.serviceProvider.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-a', name: 'Nettoyage Plus' })
    });
    expect(result.id).toBe('prov-1');
  });

  it('refuse (404) la mise a jour d un prestataire d une autre agence', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValueOnce(null);

    await expect(
      updateServiceProviderByTenant('tenant-a', 'prov-autre-agence', { name: 'Vole' })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.serviceProvider.update).not.toHaveBeenCalled();
  });

  it('refuse (409) la suppression d un prestataire encore lie a un contrat', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValueOnce({ id: 'prov-1' });
    mockPrisma.maintenanceContract.count.mockResolvedValueOnce(1);
    mockPrisma.syndicateIncident.count.mockResolvedValueOnce(0);

    await expect(deleteServiceProviderByTenant('tenant-a', 'prov-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.serviceProvider.delete).not.toHaveBeenCalled();
  });

  it('refuse (409) la suppression d un prestataire encore lie a un incident', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValueOnce({ id: 'prov-1' });
    mockPrisma.maintenanceContract.count.mockResolvedValueOnce(0);
    mockPrisma.syndicateIncident.count.mockResolvedValueOnce(1);

    await expect(deleteServiceProviderByTenant('tenant-a', 'prov-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.serviceProvider.delete).not.toHaveBeenCalled();
  });

  it('supprime un prestataire sans contrat ni incident lie', async () => {
    mockPrisma.serviceProvider.findFirst.mockResolvedValueOnce({ id: 'prov-1' });
    mockPrisma.maintenanceContract.count.mockResolvedValueOnce(0);
    mockPrisma.syndicateIncident.count.mockResolvedValueOnce(0);
    mockPrisma.serviceProvider.delete.mockResolvedValueOnce({ id: 'prov-1' });

    const result = await deleteServiceProviderByTenant('tenant-a', 'prov-1');

    expect(mockPrisma.serviceProvider.delete).toHaveBeenCalledWith({ where: { id: 'prov-1' } });
    expect(result.id).toBe('prov-1');
  });
});
