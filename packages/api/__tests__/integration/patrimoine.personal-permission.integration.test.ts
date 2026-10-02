/**
 * Permissions PATRIMOINE_PERSONAL_VIEW / _EDIT sur base dédiée
 * (`DATABASE_URL_TEST`, voir `npm run test:isolation`). Sans elle : ignoré.
 *
 *  - un administrateur d'agence (PROPERTIES_* sans PATRIMOINE_PERSONAL_*) est
 *    refusé (403) sur les données personnelles, en lecture comme en écriture,
 *    et rien n'est créé ;
 *  - le propriétaire d'un espace PARTICULIER (créé par le service) y accède ;
 *  - étanchéité inter-espaces : le propriétaire de P n'atteint pas Q, et ne voit
 *    jamais les actifs de Q, même avec l'identifiant exact (404) ;
 *  - rattrapage idempotent des espaces existants : n'ajoute le rôle qu'aux
 *    administrateurs d'espaces PARTICULIER, jamais à une agence ;
 *  - aucun rôle d'agence (TENANT_ADMIN) ne porte les deux permissions.
 */
import '../helpers/app-shims';
import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/database';
import { generateAccessToken } from '../../src/utils/jwt-utils';
import { createPersonalSpace } from '../../src/services/personal-space/create-personal-space';
import { invalidateAllUserPermissionCache } from '../../src/services/permission-service';
import {
  grantPersonalPermissionsToExistingSpaces,
  PERSONAL_SPACE_OWNER_ROLE_KEY
} from '../../src/lib/patrimoine/personal-permissions';
import {
  cleanupTenants,
  createParticulierTenant,
  createTenantAdminUser,
  createTestTenant,
  ensureTenantAdminRole,
  TestTenant,
  TestUser
} from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

const EMAIL_DOMAIN = '@personal-permission-test.local';
const BASE = (tenantId: string) => `/api/tenants/${tenantId}/patrimoine`;

maybeDescribe('permissions personnelles du patrimoine (base dédiée)', () => {
  jest.setTimeout(60000);

  const tenantIds: string[] = [];
  const userIds: string[] = [];

  let agencyA: TestTenant;
  let adminA: TestUser;
  let spaceP: { tenantId: string; user: TestUser };
  let spaceQ: { tenantId: string; user: TestUser };

  async function newSpace(displayName: string): Promise<{ tenantId: string; user: TestUser }> {
    const email = `pp-${randomUUID().slice(0, 8)}${EMAIL_DOMAIN}`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: null,
        fullName: displayName,
        globalRole: 'USER',
        emailVerified: true,
        isActive: true
      }
    });
    userIds.push(user.id);
    const { result } = await createPersonalSpace(user.id, { displayName, country: 'CI' });
    tenantIds.push(result.tenantId);
    const token = generateAccessToken({ userId: user.id, email, globalRole: 'USER' });
    return { tenantId: result.tenantId, user: { id: user.id, email, authHeader: `Bearer ${token}` } };
  }

  const asset = (name: string) => ({ name, assetClass: 'OTHER', details: { label: 'Divers' } });
  const get = (user: TestUser, path: string) => request(app).get(path).set('Authorization', user.authHeader);
  const post = (user: TestUser, path: string, body: unknown) =>
    request(app)
      .post(path)
      .set('Authorization', user.authHeader)
      .send(body as object);

  beforeAll(async () => {
    await ensureTenantAdminRole();
    agencyA = await createTestTenant('Agence-PP');
    tenantIds.push(agencyA.id);
    adminA = await createTenantAdminUser(agencyA, 'admin-pp');
    userIds.push(adminA.id);
    spaceP = await newSpace('Espace P');
    spaceQ = await newSpace('Espace Q');
  });

  afterAll(async () => {
    await cleanupTenants(tenantIds);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('administrateur d’agence : refusé sur les données personnelles', () => {
    it.each([
      ['/usage'],
      ['/net-worth'],
      ['/net-worth/history'],
      ['/net-worth/export?format=xlsx'],
      ['/assets'],
      ['/debts'],
      ['/entities'],
      ['/scenarios']
    ])('GET %s -> 403 PATRIMOINE_PERSONAL_VIEW', async path => {
      const res = await get(adminA, `${BASE(agencyA.id)}${path}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('PATRIMOINE_PERSONAL_VIEW');
    });

    it('POST /assets -> 403 PATRIMOINE_PERSONAL_EDIT et aucun actif créé', async () => {
      const res = await post(adminA, `${BASE(agencyA.id)}/assets`, asset('Refusé'));
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('PATRIMOINE_PERSONAL_EDIT');
      expect(await prisma.asset.count({ where: { tenantId: agencyA.id } })).toBe(0);
    });

    it('garde ses droits immobiliers : vue consolidée des biens (PROPERTIES_VIEW) toujours ouverte', async () => {
      const res = await get(adminA, `${BASE(agencyA.id)}/overview`);
      expect(res.status).toBe(200);
    });

    it('ni TENANT_ADMIN ni aucun rôle d’agence ne porte les permissions personnelles', async () => {
      const rows = await prisma.rolePermission.findMany({
        where: { permission: { key: { startsWith: 'PATRIMOINE_PERSONAL_' } } },
        select: { role: { select: { key: true } }, permission: { select: { key: true } } }
      });
      expect(rows.map(r => r.role.key)).toEqual([PERSONAL_SPACE_OWNER_ROLE_KEY, PERSONAL_SPACE_OWNER_ROLE_KEY]);
      expect(rows.map(r => r.permission.key).sort()).toEqual(['PATRIMOINE_PERSONAL_EDIT', 'PATRIMOINE_PERSONAL_VIEW']);
    });
  });

  describe('propriétaire d’un espace PARTICULIER', () => {
    it('crée, lit et retrouve ses actifs', async () => {
      const created = await post(spaceP.user, `${BASE(spaceP.tenantId)}/assets`, asset('Compte P'));
      expect(created.status).toBe(201);
      const list = await get(spaceP.user, `${BASE(spaceP.tenantId)}/assets`);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).toContain(created.body.data.id);
      expect((await get(spaceP.user, `${BASE(spaceP.tenantId)}/net-worth`)).status).toBe(200);
    });
  });

  describe('étanchéité inter-espaces', () => {
    it('le propriétaire de P appelle l’URL de Q -> 403, rien n’est créé chez Q', async () => {
      const res = await post(spaceP.user, `${BASE(spaceQ.tenantId)}/assets`, asset('Intrus'));
      expect(res.status).toBe(403);
      expect(await prisma.asset.count({ where: { tenantId: spaceQ.tenantId } })).toBe(0);
      expect((await get(spaceP.user, `${BASE(spaceQ.tenantId)}/assets`)).status).toBe(403);
    });

    it('Q ne voit pas les actifs de P, même avec leur identifiant exact (404)', async () => {
      const created = await post(spaceP.user, `${BASE(spaceP.tenantId)}/assets`, asset('Secret P'));
      expect(created.status).toBe(201);
      const list = await get(spaceQ.user, `${BASE(spaceQ.tenantId)}/assets`);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(created.body.data.id);
      const direct = await get(spaceQ.user, `${BASE(spaceQ.tenantId)}/assets/${created.body.data.id}`);
      expect(direct.status).toBe(404);
    });

    it('le rôle personnel de P ne donne aucun droit sur l’agence A ni sur Q', async () => {
      expect(
        await prisma.userRole.count({ where: { userId: spaceP.user.id, tenantId: { not: spaceP.tenantId } } })
      ).toBe(0);
      expect((await get(spaceP.user, `${BASE(agencyA.id)}/assets`)).status).toBe(403);
    });
  });

  describe('rattrapage des espaces PARTICULIER existants', () => {
    it('donne le rôle aux administrateurs d’espaces PARTICULIER, jamais à une agence, et reste idempotent', async () => {
      // Espace créé « à l'ancienne » (avant la permission) : TENANT_ADMIN seul.
      const legacy = await createParticulierTenant('Legacy-PP');
      tenantIds.push(legacy.id);
      const legacyAdmin = await createTenantAdminUser(legacy, 'legacy-pp');
      userIds.push(legacyAdmin.id);

      expect((await get(legacyAdmin, `${BASE(legacy.id)}/assets`)).status).toBe(403);

      const first = await grantPersonalPermissionsToExistingSpaces(prisma);
      expect(first.admins).toBeGreaterThanOrEqual(3); // P, Q, legacy
      invalidateAllUserPermissionCache(legacyAdmin.id);
      expect((await get(legacyAdmin, `${BASE(legacy.id)}/assets`)).status).toBe(200);

      const rolesBefore = await prisma.userRole.count({ where: { role: { key: PERSONAL_SPACE_OWNER_ROLE_KEY } } });
      await grantPersonalPermissionsToExistingSpaces(prisma);
      expect(await prisma.userRole.count({ where: { role: { key: PERSONAL_SPACE_OWNER_ROLE_KEY } } })).toBe(
        rolesBefore
      );

      // L'agence n'a rien reçu.
      expect(
        await prisma.userRole.count({ where: { tenantId: agencyA.id, role: { key: PERSONAL_SPACE_OWNER_ROLE_KEY } } })
      ).toBe(0);
      invalidateAllUserPermissionCache(adminA.id);
      expect((await get(adminA, `${BASE(agencyA.id)}/assets`)).status).toBe(403);
    });
  });
});
