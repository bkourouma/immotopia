import express from 'express';
import request from 'supertest';

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';
const SYNDIC_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('../../src/lib/syndics/queries', () => ({
  listSyndicatesByTenant: jest.fn(),
  getSyndicateWithLotsAndStats: jest.fn(),
  createSyndicateWithDefaults: jest.fn(),
  createSyndicateLot: jest.fn(),
  updateSyndicateLotByTenant: jest.fn(),
  updateSyndicateByTenant: jest.fn(),
  deleteEmptySyndicateByTenant: jest.fn(),
  createServiceProvider: jest.fn(),
  updateServiceProviderByTenant: jest.fn(),
  deleteServiceProviderByTenant: jest.fn(),
  listChargeCallsBySyndicate: jest.fn(),
  getChargeCallByTenant: jest.fn(),
  createChargeCallAndUpdateStatus: jest.fn(),
  recordChargePaymentWithStatusUpdate: jest.fn(),
  listMeetingsBySyndicate: jest.fn(),
  getMeetingByTenant: jest.fn(),
  createMeetingWithResolutions: jest.fn(),
  addResolutionToMeeting: jest.fn(),
  castVoteAndRecomputeResolutionCounters: jest.fn(),
  createMaintenanceContract: jest.fn(),
  getMaintenanceContractByTenant: jest.fn(),
  updateMaintenanceContractByTenant: jest.fn(),
  deleteMaintenanceContractByTenant: jest.fn(),
  listServiceProvidersBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) return [];
    return [{ id: '22222222-2222-4222-8222-222222222222', tenantId, name: 'Nettoyage Plus', category: 'NETTOYAGE' }];
  }),
  listMaintenanceContractsBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) return [];
    return [
      {
        id: 'contract-1',
        syndicateId: SYNDIC_ID,
        providerId: '22222222-2222-4222-8222-222222222222',
        nature: 'Entretien ascenseur',
        status: 'ACTIVE'
      }
    ];
  }),
  listLinkedMaintenanceContractsBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) return [];
    return [
      {
        id: 'link-1',
        syndicateId: SYNDIC_ID,
        maintenanceContractId: 'contract-1',
        contract: {
          id: 'contract-1',
          syndicateId: SYNDIC_ID,
          providerId: '22222222-2222-4222-8222-222222222222',
          nature: 'Entretien ascenseur',
          status: 'ACTIVE'
        }
      }
    ];
  }),
  listCommonAssetsBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) return [];
    return [{ id: 'asset-1', syndicateId: SYNDIC_ID, name: 'Ascenseur', category: 'ELEVATOR' }];
  }),
  listDocumentsBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) return [];
    return [{ id: 'doc-1', syndicateId: SYNDIC_ID, title: 'Reglement', type: 'REGULATION', fileUrl: 'https://example.com/reglement.pdf' }];
  }),
  getFinanceSummaryBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) {
      return { funds: [], totals: { totalFundsBalance: 0, totalCalled: 0, totalPaid: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 } };
    }
    return {
      funds: [{ id: 'fund-1', name: 'Fonds travaux', balance: 1000000, currency: 'XOF' }],
      totals: {
        totalFundsBalance: 1000000,
        totalCalled: 350000,
        totalPaid: 300000,
        totalOutstanding: 50000,
        overdueCount: 1,
        overdueAmount: 50000
      }
    };
  })
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn(),
  notifyMeetingConvocation: jest.fn()
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict } from '../../src/lib/errors';
const mockQueries = jest.requireMock('../../src/lib/syndics/queries') as Record<string, jest.Mock>;

describe('Syndics providers/documents/funds routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  // Sans ce middleware, une erreur typee (throw + asyncHandler, ex. le 409 du
  // refus de suppression d'un prestataire lie) tombe sur le gestionnaire par
  // defaut d'Express au lieu du code et du message attendus.
  app.use(errorHandler);

  it('returns providers/contracts/common assets payload', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.providers).toHaveLength(1);
    expect(response.body.data.contracts).toHaveLength(1);
    expect(response.body.data.commonAssets).toHaveLength(1);
  });

  it('returns contracts list', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/contrats`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data[0].contract.nature).toContain('Entretien');
  });

  it('supports contract CRUD endpoints', async () => {
    mockQueries.createMaintenanceContract.mockResolvedValueOnce({
      id: 'contract-new',
      syndicateId: SYNDIC_ID,
      providerId: '22222222-2222-4222-8222-222222222222',
      nature: 'Sécurité incendie',
      status: 'ACTIVE'
    });
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/contrats`)
      .send({ providerId: '22222222-2222-4222-8222-222222222222', nature: 'Sécurité incendie', startDate: '2026-03-01T00:00:00.000Z' });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.id).toBe('contract-new');

    mockQueries.getMaintenanceContractByTenant.mockResolvedValueOnce({
      id: 'contract-new',
      syndicateId: SYNDIC_ID,
      providerId: '22222222-2222-4222-8222-222222222222',
      nature: 'Sécurité incendie',
      status: 'ACTIVE'
    });
    const getResponse = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/contrats/contract-new`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.success).toBe(true);
    expect(getResponse.body.data.id).toBe('contract-new');

    mockQueries.updateMaintenanceContractByTenant.mockResolvedValueOnce({
      id: 'contract-new',
      syndicateId: SYNDIC_ID,
      providerId: '22222222-2222-4222-8222-222222222222',
      nature: 'Sécurité incendie - MAJ',
      status: 'ACTIVE'
    });
    const patchResponse = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/contrats/contract-new`)
      .send({ nature: 'Sécurité incendie - MAJ' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.success).toBe(true);
    expect(patchResponse.body.data.nature).toContain('MAJ');

    mockQueries.deleteMaintenanceContractByTenant.mockResolvedValueOnce({
      id: 'contract-new',
      syndicateId: SYNDIC_ID,
      providerId: '22222222-2222-4222-8222-222222222222',
      nature: 'Sécurité incendie - MAJ',
      status: 'TERMINATED'
    });
    const deleteResponse = await request(app).delete(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/contrats/contract-new`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
  });

  it('supports provider CRUD endpoints (ecart recette #2, FR-010)', async () => {
    mockQueries.createServiceProvider.mockResolvedValueOnce({
      id: 'provider-new',
      tenantId: TENANT_ID,
      name: 'Ascenseurs Pro',
      specialty: 'Ascenseur',
      email: 'contact@ascenseurspro.test',
      phone: null
    });
    const createResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires`)
      .send({ name: 'Ascenseurs Pro', specialty: 'Ascenseur', email: 'contact@ascenseurspro.test' });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.id).toBe('provider-new');
    expect(mockQueries.createServiceProvider).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ name: 'Ascenseurs Pro', specialty: 'Ascenseur', email: 'contact@ascenseurspro.test' })
    );

    // Nom obligatoire.
    const missingNameResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires`)
      .send({ email: 'contact@ascenseurspro.test' });
    expect(missingNameResponse.status).toBe(400);

    // E-mail invalide si fourni.
    const invalidEmailResponse = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires`)
      .send({ name: 'Ascenseurs Pro', email: 'pas-un-email' });
    expect(invalidEmailResponse.status).toBe(400);
    expect(mockQueries.createServiceProvider).toHaveBeenCalledTimes(1);

    mockQueries.updateServiceProviderByTenant.mockResolvedValueOnce({
      id: 'provider-new',
      tenantId: TENANT_ID,
      name: 'Ascenseurs Pro SARL',
      specialty: 'Ascenseur',
      email: 'contact@ascenseurspro.test',
      phone: '+225 07 00 00 00'
    });
    const patchResponse = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires/provider-new`)
      .send({ name: 'Ascenseurs Pro SARL', phone: '+225 07 00 00 00' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.data.name).toBe('Ascenseurs Pro SARL');
    expect(mockQueries.updateServiceProviderByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      'provider-new',
      expect.objectContaining({ name: 'Ascenseurs Pro SARL', phone: '+225 07 00 00 00' })
    );

    // Isolation multi-tenant : le service leve NotFound pour un prestataire
    // d'une autre agence, la route ne fait que relayer.
    mockQueries.updateServiceProviderByTenant.mockRejectedValueOnce(
      Object.assign(new Error('Prestataire introuvable ou inaccessible'), { status: 404 })
    );
    const otherTenantPatch = await request(app)
      .patch(`/api/tenants/tenant-autre/syndics/${SYNDIC_ID}/prestataires/provider-new`)
      .send({ name: 'Vole' });
    expect(otherTenantPatch.status).toBe(404);

    // Refus de suppression : le prestataire a des contrats ou incidents lies.
    mockQueries.deleteServiceProviderByTenant.mockRejectedValueOnce(
      conflict('Ce prestataire a des contrats ou des incidents lies : il ne peut pas etre supprime.')
    );
    const refusedDelete = await request(app).delete(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires/provider-new`
    );
    expect(refusedDelete.status).toBe(409);
    expect(refusedDelete.body.message).toContain('ne peut pas etre supprime');

    // Suppression possible pour un prestataire sans contrat ni incident.
    mockQueries.deleteServiceProviderByTenant.mockResolvedValueOnce({ id: 'provider-new', name: 'Ascenseurs Pro SARL' });
    const okDelete = await request(app).delete(
      `/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/prestataires/provider-new`
    );
    expect(okDelete.status).toBe(200);
    expect(okDelete.body.success).toBe(true);
  });

  it('refuse la suppression d une copropriete non vide et l accepte une fois vide (ecart recette #8)', async () => {
    mockQueries.deleteEmptySyndicateByTenant.mockRejectedValueOnce(
      conflict(
        'Cette copropriete a des lots, des appels de charges, des assemblees ou des documents : elle ne peut pas etre supprimee.'
      )
    );
    const refused = await request(app).delete(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('ne peut pas etre supprimee');

    mockQueries.deleteEmptySyndicateByTenant.mockResolvedValueOnce({ id: SYNDIC_ID });
    const accepted = await request(app).delete(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.success).toBe(true);
    expect(accepted.body.message).toBe('Copropriete supprimee');
  });

  it('returns documents list', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/documents`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data[0].type).toBe('REGULATION');
  });

  it('returns finance summary', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/finances`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totals.totalOutstanding).toBe(50000);
  });
});
