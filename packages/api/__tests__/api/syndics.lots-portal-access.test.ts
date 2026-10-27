/**
 * Etat de l'acces au portail copropriétaire sur la fiche de la copropriete
 * (« Résumé des lots ») et sur la page « Lots » : meme source que la colonne
 * « Portail » de « Profils et incidents » (`LotOwnerProfile.portalAccessEnabled`),
 * renvoye par les lectures existantes — aucune route ajoutee.
 */
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

const mockGetSyndicate = jest.fn();

jest.mock('../../src/lib/syndics/queries', () => ({
  getSyndicateWithLotsAndStats: (...args: unknown[]) => mockGetSyndicate(...args)
}));

import syndicRoutes from '../../src/routes/syndic-routes';

const profile = (id: string, last: string, pct: number, extra: Record<string, unknown> = {}) => ({
  id,
  contactId: `c-${id}`,
  ownershipPercentage: pct,
  ownedSince: '2021-07-02T00:00:00.000Z',
  ownedUntil: null,
  isActive: true,
  portalAccessEnabled: false,
  contact: { id: `c-${id}`, firstName: 'Prénom', lastName: last, legalName: null, email: null },
  ...extra
});

const lot = (id: string, lotNumber: string, ownerProfiles: unknown[]) => ({
  id,
  syndicateId: SYNDIC_ID,
  lotNumber,
  lotType: 'APARTMENT',
  generalShares: 100,
  ownerProfiles
});

describe('Etat d’acces au portail par lot (fiche et page « Lots »)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSyndicate.mockResolvedValue({
      id: SYNDIC_ID,
      tenantId: TENANT_ID,
      name: 'Résidence Les Jacarandas',
      logoPath: null,
      mandatingAgency: null,
      lots: [
        lot('lot-actif', 'A-01', [profile('a', 'Kouadio', 100, { portalAccessEnabled: true })]),
        lot('lot-inactif', 'A-02', [profile('b', 'Bamba', 100)]),
        lot('lot-partiel', 'A-03', [
          profile('c', 'Traoré', 60, { portalAccessEnabled: true }),
          profile('d', 'Coulibaly', 40)
        ]),
        lot('lot-sans-profil', 'A-04', []),
        // Un ancien proprietaire garde son acces ouvert : il ne compte pas pour le lot.
        lot('lot-ancien', 'A-05', [
          profile('e', 'Actuel', 100),
          profile('f', 'Ancien', 100, { ownedUntil: '2022-01-01T00:00:00.000Z', portalAccessEnabled: true })
        ])
      ]
    });
  });

  const portalAccessByLot = (lots: any[]) => Object.fromEntries(lots.map(item => [item.lotNumber, item.portalAccess]));

  const expected = {
    'A-01': { status: 'ACTIVE', activeCount: 1, ownerCount: 1 },
    'A-02': { status: 'INACTIVE', activeCount: 0, ownerCount: 1 },
    'A-03': { status: 'PARTIAL', activeCount: 1, ownerCount: 2 },
    'A-04': { status: 'NONE', activeCount: 0, ownerCount: 0 },
    'A-05': { status: 'INACTIVE', activeCount: 0, ownerCount: 1 }
  };

  it('GET .../lots renvoie l’etat d’acces au portail de chaque lot', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}/lots`);

    expect(response.status).toBe(200);
    expect(mockGetSyndicate).toHaveBeenCalledWith(TENANT_ID, SYNDIC_ID);
    expect(portalAccessByLot(response.body.data)).toEqual(expected);
  });

  it('GET .../syndics/:id renvoie les memes lots (proprietaires et acces portail) pour le « Résumé des lots »', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Résidence Les Jacarandas');
    expect(portalAccessByLot(response.body.data.lots)).toEqual(expected);

    const partial = response.body.data.lots.find((item: any) => item.lotNumber === 'A-03');
    expect(partial.ownersLabel).toBe('Prénom Traoré (60 %), Prénom Coulibaly (40 %)');
    expect(partial.owners.map((owner: any) => owner.portalAccessEnabled)).toEqual([true, false]);
  });

  it('ne renvoie jamais les profils proprietaires bruts ni de secret', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}`);

    for (const item of response.body.data.lots) {
      expect(item).not.toHaveProperty('ownerProfiles');
    }
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|portalAccessToken/);
  });

  it('GET .../syndics/:id sans lots chargés reste inchangé', async () => {
    mockGetSyndicate.mockResolvedValue({ id: SYNDIC_ID, tenantId: TENANT_ID, name: 'Vide', logoPath: null });

    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics/${SYNDIC_ID}`);

    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('lots');
  });
});
