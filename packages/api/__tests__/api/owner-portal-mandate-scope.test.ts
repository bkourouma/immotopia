/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-30-057 — périmètre du portail propriétaire : un bien CLIENT
 * (`tenantId` nul) sous mandat de gestion ACTIF de l'agence apparaît sur le
 * portail ; tout le reste est exclu (autre propriétaire, autre agence, mandat
 * résilié, échu, non commencé, mandat d'une autre agence). Pile réelle :
 * `requireOwnerPortalAccess` + fonction de périmètre partagée, base en
 * mémoire de `helpers/fake-prisma.ts`.
 */

import express from 'express';
import request from 'supertest';
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId, globalRole: 'USER' };
    next();
  }
}));

import ownerPortalRoutes from '../../src/routes/owner-portal-routes';
import { errorHandler } from '../../src/middleware/error-middleware';
import { resolveOwnerPortalPropertyIds } from '../../src/lib/owner-portal-scope';

const app = express();
app.use(express.json());
app.use('/api/portal/owner', ownerPortalRoutes);
app.use(errorHandler);

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const AWA = 'user-awa';
const FANTA = 'user-fanta';

const DAY = 24 * 3600 * 1000;
const past = new Date(Date.now() - 30 * DAY);
const future = new Date(Date.now() + 30 * DAY);

function mandate(propertyId: string, overrides: Record<string, any> = {}) {
  return {
    id: `m-${propertyId}-${Math.random()}`,
    propertyId,
    tenantId: TENANT_A,
    ownerUserId: AWA,
    startDate: past,
    endDate: null,
    isActive: true,
    revokedAt: null,
    ...overrides
  };
}

function clientProperty(id: string, ownerUserId = AWA) {
  return {
    id,
    ownershipType: 'CLIENT',
    tenantId: null,
    ownerUserId,
    title: id,
    address: 'x',
    locationZone: 'x'
  };
}

beforeEach(() => {
  mockPrisma.reset();
  mockPrisma.tenant.rows.push({ id: TENANT_A, status: 'ACTIVE' }, { id: TENANT_B, status: 'ACTIVE' });
  mockPrisma.tenantClient.rows.push({
    id: 'tc-awa-a',
    userId: AWA,
    tenantId: TENANT_A,
    clientType: 'OWNER',
    createdAt: new Date('2026-01-01'),
    tenant: { status: 'ACTIVE' }
  });
  mockPrisma.property.rows.push(
    clientProperty('duplex'), // mandat actif de A : visible
    clientProperty('resilie'), // mandat révoqué
    clientProperty('inactif'), // mandat isActive=false
    clientProperty('echu'), // mandat échu
    clientProperty('futur'), // mandat pas encore commencé
    clientProperty('autre-agence'), // mandat de B uniquement
    clientProperty('sans-mandat'), // aucun mandat
    clientProperty('de-fanta', FANTA) // autre propriétaire, mandat actif de A
  );
  mockPrisma.propertyMandate.rows.push(
    mandate('duplex'),
    mandate('resilie', { revokedAt: past }),
    mandate('inactif', { isActive: false }),
    mandate('echu', { endDate: new Date(Date.now() - DAY) }),
    mandate('futur', { startDate: future }),
    mandate('autre-agence', { tenantId: TENANT_B }),
    mandate('de-fanta', { ownerUserId: FANTA })
  );
});

describe('resolveOwnerPortalPropertyIds', () => {
  it('inclut le bien CLIENT sous mandat actif et exclut tout le reste', async () => {
    const ids = await resolveOwnerPortalPropertyIds({ userId: AWA, tenantClientId: 'tc-awa-a', tenantId: TENANT_A });
    expect(ids).toEqual(['duplex']);
  });

  it('un mandat encore valable à échéance future reste actif', async () => {
    mockPrisma.propertyMandate.rows.find((m: any) => m.propertyId === 'duplex')!.endDate = future;
    const ids = await resolveOwnerPortalPropertyIds({ userId: AWA, tenantClientId: 'tc-awa-a', tenantId: TENANT_A });
    expect(ids).toEqual(['duplex']);
  });

  it("le mandat d'une autre agence sur le même propriétaire ne donne rien à l'agence A", async () => {
    const ids = await resolveOwnerPortalPropertyIds({ userId: AWA, tenantClientId: 'tc-awa-a', tenantId: TENANT_A });
    expect(ids).not.toContain('autre-agence');
  });

  it('un bien CLIENT loué sans mandat actif reste exclu', async () => {
    mockPrisma.rentalLease.rows.push(
      { id: 'l1', tenant_id: TENANT_A, owner_client_id: 'tc-awa-a', property_id: 'resilie' },
      { id: 'l2', tenant_id: TENANT_A, owner_client_id: 'tc-awa-a', property_id: 'duplex' }
    );
    const ids = await resolveOwnerPortalPropertyIds({ userId: AWA, tenantClientId: 'tc-awa-a', tenantId: TENANT_A });
    expect(ids.sort()).toEqual(['duplex']);
  });
});

describe('portail propriétaire — /patrimoine alimenté par le même périmètre', () => {
  it('liste le bien sous mandat, jamais les autres', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine').set('x-test-user', AWA);
    expect(res.status).toBe(200);
    expect(res.body.data.properties.map((p: any) => p.id)).toEqual(['duplex']);
  });

  it('bien sous mandat → 200', async () => {
    const res = await request(app).get('/api/portal/owner/patrimoine/properties/duplex').set('x-test-user', AWA);
    expect(res.status).toBe(200);
  });

  it.each(['resilie', 'echu', 'autre-agence', 'sans-mandat', 'de-fanta', 'inexistant'])(
    'bien hors périmètre (%s) → même 404 qu’un objet inexistant',
    async propertyId => {
      const res = await request(app)
        .get(`/api/portal/owner/patrimoine/properties/${propertyId}`)
        .set('x-test-user', AWA);
      const unknown = await request(app)
        .get('/api/portal/owner/patrimoine/properties/n-existe-pas')
        .set('x-test-user', AWA);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(unknown.body);
    }
  );
});
