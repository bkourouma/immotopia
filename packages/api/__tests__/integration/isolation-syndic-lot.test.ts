/**
 * Audit securite 2026-11-09, TEN-02 : un lot de copropriete ne peut pas etre
 * rattache (PATCH) a un bien d'une autre agence. Meme style que isolation.test.ts :
 * base DEDIEE via `npm run test:isolation` (`DATABASE_URL_TEST`), sinon ignore.
 */

import '../helpers/app-shims';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/database';
import {
  createTestTenant,
  createTenantAdminUser,
  createPropertyDirect,
  cleanupTenants,
  TestTenant,
  TestUser
} from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

maybeDescribe("TEN-02 : lot de copropriete et bien d'une autre agence", () => {
  jest.setTimeout(30000);

  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let adminA: TestUser;
  const createdTenantIds: string[] = [];
  const createdSyndicateIds: string[] = [];
  let syndicateId: string;
  let lotId: string;
  let propertyOfB: string;
  let propertyOfA: string;

  beforeAll(async () => {
    tenantA = await createTestTenant('Agence-A-lot');
    tenantB = await createTestTenant('Agence-B-lot');
    createdTenantIds.push(tenantA.id, tenantB.id);
    adminA = await createTenantAdminUser(tenantA, 'admin-a-lot');
    propertyOfA = await createPropertyDirect(tenantA.id, 'Bien A');
    propertyOfB = await createPropertyDirect(tenantB.id, 'Bien B');
    const syndicate = await prisma.syndicate.create({
      data: { tenantId: tenantA.id, name: 'Copro A', address: '1 rue du Test' }
    });
    createdSyndicateIds.push(syndicate.id);
    syndicateId = syndicate.id;
    const lot = await prisma.syndicateLot.create({
      data: { syndicateId, lotNumber: 'A-01', lotType: 'APARTMENT', generalShares: 100 }
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    try {
      await prisma.syndicateLot.deleteMany({ where: { syndicateId: { in: createdSyndicateIds } } });
      await prisma.syndicate.deleteMany({ where: { id: { in: createdSyndicateIds } } });
      await cleanupTenants(createdTenantIds);
    } finally {
      await prisma.$disconnect();
    }
  });

  const url = () => `/api/tenants/${tenantA.id}/syndics/${syndicateId}/lots/${lotId}`;

  it("PATCH avec le propertyId d'une autre agence -> 404 et le lot reste inchange", async () => {
    const res = await request(app)
      .patch(url())
      .set({ Authorization: adminA.authHeader })
      .send({ propertyId: propertyOfB });
    expect(res.status).toBe(404);
    const lot = await prisma.syndicateLot.findUnique({ where: { id: lotId }, select: { propertyId: true } });
    expect(lot?.propertyId).toBeNull();
  });

  it("PATCH avec un bien de l'agence -> 200", async () => {
    const res = await request(app)
      .patch(url())
      .set({ Authorization: adminA.authHeader })
      .send({ propertyId: propertyOfA });
    expect(res.status).toBe(200);
    const lot = await prisma.syndicateLot.findUnique({ where: { id: lotId }, select: { propertyId: true } });
    expect(lot?.propertyId).toBe(propertyOfA);
  });
});
