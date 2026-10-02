/**
 * Lot 4B : espace personnel et palier gratuit sur base dédiée
 * (`DATABASE_URL_TEST`, voir `npm run test:isolation`). Sans elle : ignoré.
 *
 *  - un seul espace par utilisateur SOUS CONCURRENCE (verrou consultatif) ;
 *  - l'utilisateur n'obtient aucun droit sur un autre tenant ;
 *  - 10 actifs acceptés, le 11e refusé (mode `warn` du test), archivés non
 *    comptés, actif immobilier lié compté une fois, biens sans actif comptés
 *    (création de bien gardée), agence non concernée ;
 *  - 8 créations parallèles depuis 6 actifs : jamais plus de 10 au total ;
 *  - un changement de pack est vu tout de suite.
 */
import '../helpers/app-shims';

// Les gabarits de type de bien sont amorcés par le seed, pas par les migrations : la base de test n'en a pas.
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));
import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { createPersonalSpace } from '../../src/services/personal-space/create-personal-space';
import { getAssetUsage } from '../../src/services/personal-space/free-tier';
import { createAsset } from '../../src/services/patrimoine-assets-service';
import { createProperty } from '../../src/services/property-service';
import { ensurePropertyAsset } from '../../src/lib/patrimoine/property-asset';
import { createAssetSchema } from '../../src/lib/patrimoine/asset-schemas';
import {
  cleanupTenants,
  createPropertyDirect,
  createTenantAdminUser,
  createTestTenant,
  ensureTenantAdminRole
} from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

const EMAIL_DOMAIN = '@personal-space-test.local';

maybeDescribe('espace personnel et palier gratuit (base dédiée)', () => {
  jest.setTimeout(60000);

  const tenantIds: string[] = [];
  const userIds: string[] = [];

  async function newUser(emailVerified = true): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `ps-${randomUUID().slice(0, 8)}${EMAIL_DOMAIN}`,
        passwordHash: null,
        fullName: 'Test espace personnel',
        globalRole: 'USER',
        emailVerified,
        isActive: true
      }
    });
    userIds.push(user.id);
    return user.id;
  }

  async function newSpace(displayName = 'Espace test'): Promise<{ userId: string; tenantId: string }> {
    const userId = await newUser();
    const { result } = await createPersonalSpace(userId, { displayName, country: 'CI' });
    tenantIds.push(result.tenantId);
    return { userId, tenantId: result.tenantId };
  }

  let assetCounter = 0;
  function addAsset(tenantId: string) {
    assetCounter += 1;
    return createAsset(
      tenantId,
      createAssetSchema.parse({ name: `Actif ${assetCounter}`, assetClass: 'OTHER', details: { label: 'Divers' } })
    );
  }

  function propertyInput(title = 'Studio') {
    return {
      propertyType: 'APPARTEMENT',
      ownershipType: 'TENANT',
      title,
      address: '1 rue du Test',
      transactionModes: ['RENTAL']
    } as never;
  }

  const activeAssets = (tenantId: string) => prisma.asset.count({ where: { tenantId, status: { not: 'ARCHIVED' } } });

  beforeAll(async () => {
    await ensureTenantAdminRole();
  });

  afterAll(async () => {
    await cleanupTenants(tenantIds);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('création', () => {
    it('crée tenant PARTICULIER, pack gratuit ACTIVE/BLOCK, membre ACTIF et TENANT_ADMIN de CE tenant seulement', async () => {
      const userId = await newUser();
      const { result } = await createPersonalSpace(userId, {
        displayName: 'Awa Traoré',
        country: 'SN',
        phone: '+221771234567'
      });
      tenantIds.push(result.tenantId);

      expect(result.name).toBe('Awa Traoré');
      expect(result.slug).toMatch(/^awa-traore-[a-z0-9]{6}$/);

      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: result.tenantId } });
      expect(tenant).toMatchObject({
        type: 'PARTICULIER',
        status: 'ACTIVE',
        country: 'SN',
        contactPhone: '+221771234567'
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(tenant.contactEmail).toBe(user.email);

      const subscription = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: result.tenantId },
        include: { items: { include: { catalogItem: { select: { code: true } } } } }
      });
      expect(subscription).toMatchObject({ status: 'ACTIVE', quotaPolicy: 'BLOCK' });
      expect(subscription.items.map(i => i.catalogItem.code)).toEqual(['PARTICULIER_GRATUIT']);

      const modules = await prisma.tenantModule.findMany({ where: { tenantId: result.tenantId, enabled: true } });
      expect(modules.map(m => m.moduleKey)).toEqual(['MODULE_PATRIMOINE']);

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { userId_tenantId: { userId, tenantId: result.tenantId } }
      });
      expect(membership.status).toBe('ACTIVE');

      const roles = await prisma.userRole.findMany({ where: { userId }, include: { role: { select: { key: true } } } });
      // TENANT_ADMIN + PERSONAL_SPACE_OWNER (PATRIMOINE_PERSONAL_*), tous deux sur CE tenant seulement.
      expect(roles).toHaveLength(2);
      expect(roles.every(r => r.tenantId === result.tenantId)).toBe(true);
      expect(roles.map(r => r.role.key).sort()).toEqual(['PERSONAL_SPACE_OWNER', 'TENANT_ADMIN']);
    });

    it('un utilisateur qui a un espace n’obtient aucun droit sur un autre tenant', async () => {
      const agency = await createTestTenant('Agence-PS');
      tenantIds.push(agency.id);
      const { userId, tenantId } = await newSpace();
      expect(await prisma.membership.count({ where: { userId, tenantId: agency.id } })).toBe(0);
      expect(await prisma.userRole.count({ where: { userId, tenantId: agency.id } })).toBe(0);
      expect(await prisma.userRole.count({ where: { userId, tenantId: { not: tenantId } } })).toBe(0);
    });

    it('e-mail non vérifié -> 403 EMAIL_NOT_VERIFIED et aucun tenant', async () => {
      const userId = await newUser(false);
      await expect(createPersonalSpace(userId, { displayName: 'X', country: 'CI' })).rejects.toMatchObject({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED'
      });
      expect(await prisma.membership.count({ where: { userId } })).toBe(0);
    });

    it('un deuxième appel (sans clé) -> 409 PERSONAL_SPACE_EXISTS avec le tenantId existant', async () => {
      const { userId, tenantId } = await newSpace();
      await expect(createPersonalSpace(userId, { displayName: 'Autre', country: 'CI' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'PERSONAL_SPACE_EXISTS',
        data: { tenantId }
      });
    });

    it('une appartenance DÉSACTIVÉE ou un simple invité (sans TENANT_ADMIN) ne bloque plus la création de son propre espace', async () => {
      const first = await newSpace();
      await prisma.membership.update({
        where: { userId_tenantId: { userId: first.userId, tenantId: first.tenantId } },
        data: { status: 'DISABLED' }
      });
      const second = await createPersonalSpace(first.userId, { displayName: 'Nouveau', country: 'CI' });
      tenantIds.push(second.result.tenantId);
      expect(second.result.tenantId).not.toBe(first.tenantId);

      // Un invité (PENDING_INVITE, aucun rôle) d'un espace d'autrui non plus.
      const owner = await newSpace();
      const guest = await newUser();
      await prisma.membership.create({
        data: { userId: guest, tenantId: owner.tenantId, status: 'PENDING_INVITE', invitedBy: owner.userId }
      });
      const guestSpace = await createPersonalSpace(guest, { displayName: 'Invité', country: 'CI' });
      tenantIds.push(guestSpace.result.tenantId);
      expect(guestSpace.result.tenantId).not.toBe(owner.tenantId);

      // Un propriétaire ACTIF reste bloqué.
      await expect(createPersonalSpace(owner.userId, { displayName: 'Bis', country: 'CI' })).rejects.toMatchObject({
        code: 'PERSONAL_SPACE_EXISTS'
      });
    });

    it('même Idempotency-Key : même réponse, un seul tenant', async () => {
      const userId = await newUser();
      const first = await createPersonalSpace(userId, { displayName: 'Idem', country: 'CI' }, 'key-idem-1');
      tenantIds.push(first.result.tenantId);
      const second = await createPersonalSpace(userId, { displayName: 'Idem', country: 'CI' }, 'key-idem-1');
      expect(second).toEqual({ result: first.result, replay: true });
      expect(await prisma.membership.count({ where: { userId } })).toBe(1);
    });

    it('6 créations concurrentes du même utilisateur : une seule réussit, un seul tenant en base', async () => {
      const userId = await newUser();
      const outcomes = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) => createPersonalSpace(userId, { displayName: `Course ${i}`, country: 'CI' }))
      );
      const ok = outcomes.filter(o => o.status === 'fulfilled');
      const ko = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
      ok.forEach(o =>
        tenantIds.push((o as PromiseFulfilledResult<{ result: { tenantId: string } }>).value.result.tenantId)
      );

      expect(ok).toHaveLength(1);
      expect(ko).toHaveLength(5);
      const winner = (ok[0] as PromiseFulfilledResult<{ result: { tenantId: string } }>).value.result.tenantId;
      for (const r of ko) {
        expect(r.reason).toMatchObject({ statusCode: 409, code: 'PERSONAL_SPACE_EXISTS', data: { tenantId: winner } });
      }
      expect(await prisma.membership.count({ where: { userId } })).toBe(1);
      const tenants = await prisma.tenant.count({ where: { type: 'PARTICULIER', memberships: { some: { userId } } } });
      expect(tenants).toBe(1);
    });

    it('deux utilisateurs différents créent chacun leur espace en parallèle', async () => {
      const [a, b] = await Promise.all([newUser(), newUser()]);
      const [ra, rb] = await Promise.all([
        createPersonalSpace(a, { displayName: 'Même nom', country: 'CI' }),
        createPersonalSpace(b, { displayName: 'Même nom', country: 'CI' })
      ]);
      tenantIds.push(ra.result.tenantId, rb.result.tenantId);
      expect(ra.result.tenantId).not.toBe(rb.result.tenantId);
      expect(ra.result.slug).not.toBe(rb.result.slug);
    });
  });

  describe('garde du palier gratuit', () => {
    it('10 actifs acceptés, le 11e refusé en 409 FREE_TIER_LIMIT { limit, used } (mode warn)', async () => {
      const { tenantId } = await newSpace();
      for (let i = 0; i < 10; i += 1) await addAsset(tenantId);
      const error = await addAsset(tenantId).catch((e: unknown) => e);
      expect(error).toMatchObject({ statusCode: 409, code: 'FREE_TIER_LIMIT', data: { limit: 10, used: 10 } });
      expect(await activeAssets(tenantId)).toBe(10);
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({
        plan: 'FREE',
        limit: 10,
        used: 10,
        canAdd: false,
        upgrade: { target: 'PARTICULIER_PLUS', currency: 'XOF' }
      });
    });

    it('un actif archivé libère une place', async () => {
      const { tenantId } = await newSpace();
      for (let i = 0; i < 10; i += 1) await addAsset(tenantId);
      const one = await prisma.asset.findFirstOrThrow({ where: { tenantId } });
      await prisma.asset.update({ where: { id: one.id }, data: { status: 'ARCHIVED' } });
      await expect(addAsset(tenantId)).resolves.toBeDefined();
      await expect(addAsset(tenantId)).rejects.toMatchObject({ code: 'FREE_TIER_LIMIT' });
    });

    it('un actif immobilier lié compte une fois : le bien sans actif compte, son actif créé à la volée ne change pas le compteur', async () => {
      const { tenantId } = await newSpace();
      const property = await createPropertyDirect(tenantId, 'Villa 4B');
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({ used: 1 });
      const first = await ensurePropertyAsset(prisma, tenantId, property);
      const again = await ensurePropertyAsset(prisma, tenantId, property);
      expect(first).not.toBeNull();
      expect(again).toEqual(first);
      expect(await activeAssets(tenantId)).toBe(1);
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({ used: 1 });
    });

    it('un bien archivé sans actif ne compte pas ; un bien archivé ne reçoit pas d’actif au plafond', async () => {
      const { tenantId } = await newSpace();
      const archived = await createPropertyDirect(tenantId, 'Archivée');
      await prisma.property.update({ where: { id: archived }, data: { status: 'ARCHIVED' } });
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({ used: 0 });
      for (let i = 0; i < 10; i += 1) await addAsset(tenantId);
      await expect(ensurePropertyAsset(prisma, tenantId, archived)).resolves.toBeNull();
      expect(await prisma.asset.count({ where: { propertyId: archived } })).toBe(0);
    });

    it('10 biens SANS actif atteignent le plafond : le 11e actif ET le 11e bien sont refusés', async () => {
      const { userId, tenantId } = await newSpace();
      for (let i = 0; i < 10; i += 1) await createPropertyDirect(tenantId, `Bien ${i}`);
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({ used: 10, canAdd: false });
      await expect(addAsset(tenantId)).rejects.toMatchObject({
        statusCode: 409,
        code: 'FREE_TIER_LIMIT',
        data: { limit: 10, used: 10 }
      });
      await expect(createProperty(tenantId, userId, propertyInput(), userId)).rejects.toMatchObject({
        statusCode: 409,
        code: 'FREE_TIER_LIMIT',
        data: { limit: 10, used: 10 }
      });
      expect(await prisma.property.count({ where: { tenantId } })).toBe(10);
    });

    it('à 10/10 : lier un actif immobilier à un bien DÉJÀ compté est accepté (compteur inchangé, jamais bien ET actif)', async () => {
      const { tenantId } = await newSpace();
      const property = await createPropertyDirect(tenantId, 'Déjà compté');
      for (let i = 0; i < 9; i += 1) await addAsset(tenantId);
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({ used: 10 });
      await expect(
        createAsset(
          tenantId,
          createAssetSchema.parse({
            name: 'Maison liée',
            assetClass: 'REAL_ESTATE',
            propertyId: property,
            details: {}
          })
        )
      ).resolves.toBeDefined();
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({ used: 10 });
      // Et ensurePropertyAsset retrouve l'actif lié, sans rien créer.
      await expect(ensurePropertyAsset(prisma, tenantId, property)).resolves.not.toBeNull();
    });

    it('createProperty : 9 biens + 1 actif = 10 ; le 11e bien est refusé, un bien archivé libère une place', async () => {
      const { userId, tenantId } = await newSpace();
      for (let i = 0; i < 9; i += 1) await createProperty(tenantId, userId, propertyInput(`Bien ${i}`), userId);
      await addAsset(tenantId);
      await expect(createProperty(tenantId, userId, propertyInput('Onzième'), userId)).rejects.toMatchObject({
        code: 'FREE_TIER_LIMIT'
      });
      const one = await prisma.property.findFirstOrThrow({ where: { tenantId } });
      await prisma.property.update({ where: { id: one.id }, data: { status: 'ARCHIVED' } });
      await expect(createProperty(tenantId, userId, propertyInput('Douzième'), userId)).resolves.toBeDefined();
    });

    it('concurrence biens + actifs : 8 créations parallèles depuis 6 (plafond 10) -> jamais plus de 10 au total', async () => {
      const { userId, tenantId } = await newSpace();
      for (let i = 0; i < 6; i += 1) await createPropertyDirect(tenantId, `Bien ${i}`);
      const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          i % 2 === 0 ? addAsset(tenantId) : createProperty(tenantId, userId, propertyInput(`Course ${i}`), userId)
        )
      );
      expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(4);
      outcomes
        .filter((o): o is PromiseRejectedResult => o.status === 'rejected')
        .forEach(r => expect(r.reason).toMatchObject({ statusCode: 409, code: 'FREE_TIER_LIMIT' }));
      const usage = await getAssetUsage(tenantId);
      expect(usage.used).toBe(10);
    });

    it('une agence n’est pas concernée : plus de 10 actifs acceptés, plan AGENCY sans limite', async () => {
      const agency = await createTestTenant('Agence-11');
      tenantIds.push(agency.id);
      for (let i = 0; i < 11; i += 1) await addAsset(agency.id);
      expect(await activeAssets(agency.id)).toBe(11);
      await expect(getAssetUsage(agency.id)).resolves.toEqual({
        plan: 'AGENCY',
        limit: null,
        used: 11,
        canAdd: true,
        upgrade: null
      });
    });

    it('concurrence : 8 créations parallèles depuis 6 actifs (plafond 10) -> jamais plus de 10', async () => {
      const { tenantId } = await newSpace();
      for (let i = 0; i < 6; i += 1) await addAsset(tenantId);
      const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => addAsset(tenantId)));
      const ok = outcomes.filter(o => o.status === 'fulfilled').length;
      const ko = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
      expect(ok).toBe(4);
      expect(ko).toHaveLength(4);
      ko.forEach(r => expect(r.reason).toMatchObject({ statusCode: 409, code: 'FREE_TIER_LIMIT' }));
      expect(await activeAssets(tenantId)).toBe(10);
    });

    it('un changement de pack est vu sans attendre le cache : Plus autorise le 11e actif', async () => {
      const { tenantId } = await newSpace();
      for (let i = 0; i < 10; i += 1) await addAsset(tenantId);
      await expect(addAsset(tenantId)).rejects.toMatchObject({ code: 'FREE_TIER_LIMIT' });
      // Lecture de l'usage : remplit le cache des droits (30 s) avec le pack gratuit.
      await getAssetUsage(tenantId);

      const plus = await prisma.catalogItem.findUniqueOrThrow({ where: { code: 'PARTICULIER_PLUS' } });
      const item = await prisma.subscriptionItem.findFirstOrThrow({ where: { tenantId, status: 'ACTIVE' } });
      await prisma.subscriptionItem.update({ where: { id: item.id }, data: { catalogItemId: plus.id } });

      await expect(addAsset(tenantId)).resolves.toBeDefined();
      await expect(getAssetUsage(tenantId)).resolves.toMatchObject({
        plan: 'PAID',
        limit: 100,
        used: 11,
        canAdd: true,
        upgrade: null
      });
    });
  });

  describe('isolation du compteur', () => {
    it('le compteur d’un espace ne compte que ses propres actifs', async () => {
      const a = await newSpace();
      const b = await newSpace();
      await addAsset(a.tenantId);
      await addAsset(a.tenantId);
      await expect(getAssetUsage(a.tenantId)).resolves.toMatchObject({ used: 2 });
      await expect(getAssetUsage(b.tenantId)).resolves.toMatchObject({ used: 0 });
    });

    it('un administrateur d’agence n’est pas membre d’un espace personnel', async () => {
      const agency = await createTestTenant('Agence-Admin-PS');
      tenantIds.push(agency.id);
      const admin = await createTenantAdminUser(agency, 'admin-ps');
      userIds.push(admin.id);
      const space = await newSpace();
      expect(await prisma.membership.count({ where: { userId: admin.id, tenantId: space.tenantId } })).toBe(0);
    });
  });
});
