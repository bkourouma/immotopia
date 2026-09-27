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
  archiveSyndicateByTenant: jest.fn(),
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
  }),
  listFundsBySyndicate: jest.fn(async (tenantId: string) => {
    if (tenantId !== TENANT_ID) return [];
    return [{ id: 'fund-1', syndicateId: SYNDIC_ID, name: 'Fonds travaux', balance: 1000000, currency: 'XOF' }];
  }),
  createSyndicateFundBySyndicate: jest.fn(),
  renameSyndicateFundByTenant: jest.fn(),
  adjustSyndicateFundBalanceByTenant: jest.fn()
}));

jest.mock('../../src/lib/syndics/notifications', () => ({
  notifyChargeCall: jest.fn(),
  notifyMeetingConvocation: jest.fn()
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
const mockQueries = jest.requireMock('../../src/lib/syndics/queries') as Record<string, jest.Mock>;

describe('Syndics providers/documents/funds routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  // Sans ce middleware, une erreur zod (validation du motif obligatoire pour
  // l'ajustement de fonds) tombe sur le gestionnaire par defaut d'Express au
  // lieu de renvoyer un JSON avec le bon statut — voir
  // __tests__/api/syndics.accounting.characterization.test.ts.
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

  it('returns funds list', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/fonds`);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data[0].name).toBe('Fonds travaux');
  });

  it('creates a fund', async () => {
    mockQueries.createSyndicateFundBySyndicate.mockResolvedValueOnce({
      id: 'fund-new',
      syndicateId: SYNDIC_ID,
      name: 'Compte courant',
      balance: 0,
      currency: 'XOF'
    });

    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/fonds`)
      .send({ name: 'Compte courant' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('fund-new');
    expect(mockQueries.createSyndicateFundBySyndicate).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      expect.objectContaining({ name: 'Compte courant' }),
      'user-1'
    );
  });

  it('renames a fund', async () => {
    mockQueries.renameSyndicateFundByTenant.mockResolvedValueOnce({
      id: 'fund-1',
      syndicateId: SYNDIC_ID,
      name: 'Fonds travaux (renomme)',
      balance: 1000000,
      currency: 'XOF'
    });

    const response = await request(app)
      .patch(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/fonds/fund-1`)
      .send({ name: 'Fonds travaux (renomme)' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Fonds travaux (renomme)');
  });

  it('adjusts a fund balance with a mandatory reason', async () => {
    mockQueries.adjustSyndicateFundBalanceByTenant.mockResolvedValueOnce({
      id: 'fund-1',
      syndicateId: SYNDIC_ID,
      name: 'Fonds travaux',
      balance: 1050000,
      currency: 'XOF'
    });

    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/fonds/fund-1/ajustement`)
      .send({ direction: 'CREDIT', amount: 50000, reason: 'Appel de fonds travaux vote en AG' });

    expect(response.status).toBe(200);
    expect(response.body.data.balance).toBe(1050000);
    expect(mockQueries.adjustSyndicateFundBalanceByTenant).toHaveBeenCalledWith(
      TENANT_ID,
      SYNDIC_ID,
      'fund-1',
      { direction: 'CREDIT', amount: 50000, reason: 'Appel de fonds travaux vote en AG' },
      'user-1'
    );
  });

  it('rejects a fund balance adjustment without a reason', async () => {
    // Reinitialise le compteur d'appels : le test precedent a deja appele
    // cette fonction avec succes, et ce fichier ne fait pas de
    // `jest.clearAllMocks()` global entre les cas.
    mockQueries.adjustSyndicateFundBalanceByTenant.mockClear();

    const response = await request(app)
      .post(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/fonds/fund-1/ajustement`)
      .send({ direction: 'DEBIT', amount: 10000 });

    expect(response.status).toBe(400);
    expect(mockQueries.adjustSyndicateFundBalanceByTenant).not.toHaveBeenCalled();
  });
});
