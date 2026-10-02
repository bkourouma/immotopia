/**
 * Lot 1 multi-actifs — cycle de vie du bien et de son actif REAL_ESTATE, sur
 * base dédiée (`DATABASE_URL_TEST`, même garde que `isolation.test.ts`) :
 *  - un bien valorisé APRÈS la migration apparaît dans la valeur nette ;
 *  - `ensurePropertyAsset` est idempotente et étanche entre agences ;
 *  - supprimer un bien qui porte un actif et des valorisations réussit
 *    (`assets.property_id` en ON DELETE CASCADE) ;
 *  - les CHECK de la migration restent en place.
 *
 * Lancement : `DATABASE_URL_TEST=... TEST_DATABASE_URL=... DATABASE_URL=...
 * npx jest __tests__/integration/patrimoine.property-asset.integration.test.ts`
 * (voir `__tests__/helpers/run-isolation-tests.js` pour le mécanisme).
 */
import '../helpers/app-shims';
import { prisma } from '../../src/utils/database';
import { ensurePropertyAsset } from '../../src/lib/patrimoine/property-asset';
import { createPropertyValuation } from '../../src/lib/patrimoine/queries';
import { getNetWorth } from '../../src/services/patrimoine-assets-service';
import { deleteProperty } from '../../src/services/property-service';
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

maybeDescribe('patrimoine — actif REAL_ESTATE du bien (base dédiée)', () => {
  jest.setTimeout(30000);

  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let adminA: TestUser;

  beforeAll(async () => {
    tenantA = await createTestTenant('PropAsset A');
    tenantB = await createTestTenant('PropAsset B');
    adminA = await createTenantAdminUser(tenantA, 'prop-asset-a');
  });

  afterAll(async () => {
    await cleanupTenants([tenantA?.id, tenantB?.id].filter(Boolean));
    await prisma.$disconnect();
  });

  it('un bien valorisé après coup apparaît dans la valeur nette, sans doublon', async () => {
    const propertyId = await createPropertyDirect(tenantA.id, 'Villa tardive');
    expect(await prisma.asset.count({ where: { propertyId } })).toBe(0);

    await createPropertyValuation(tenantA.id, propertyId, {
      valuatedAt: new Date('2026-01-01'),
      estimatedValue: 50_000_000,
      currency: 'XOF',
      method: 'MANUAL'
    });
    await createPropertyValuation(tenantA.id, propertyId, {
      valuatedAt: new Date('2026-02-01'),
      estimatedValue: 60_000_000,
      currency: 'XOF',
      method: 'MANUAL'
    });

    const assets = await prisma.asset.findMany({ where: { propertyId } });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ tenantId: tenantA.id, assetClass: 'REAL_ESTATE', currency: 'XOF' });
    // Les valorisations restent sur propertyId, jamais sur assetId.
    expect(await prisma.assetValuation.count({ where: { assetId: assets[0].id } })).toBe(0);

    const netWorth = await getNetWorth(tenantA.id, {});
    expect(netWorth.totalAssets).toBe(60_000_000);
  });

  it('ensurePropertyAsset est idempotente, y compris en parallèle', async () => {
    const propertyId = await createPropertyDirect(tenantA.id, 'Course');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ensurePropertyAsset(prisma, tenantA.id, propertyId))
    );
    expect(new Set(results.map(r => r?.id)).size).toBe(1);
    expect(await prisma.asset.count({ where: { propertyId } })).toBe(1);
    await prisma.$transaction(async tx => {
      await ensurePropertyAsset(tx, tenantA.id, propertyId);
    });
    expect(await prisma.asset.count({ where: { propertyId } })).toBe(1);
  });

  it("ne crée rien pour un bien d'une autre agence", async () => {
    const propertyId = await createPropertyDirect(tenantB.id, 'Bien de B');
    expect(await ensurePropertyAsset(prisma, tenantA.id, propertyId)).toBeNull();
    expect(await prisma.asset.count({ where: { propertyId } })).toBe(0);
  });

  it('supprimer un bien qui porte un actif et des valorisations réussit', async () => {
    const propertyId = await createPropertyDirect(tenantA.id, 'À supprimer');
    await createPropertyValuation(tenantA.id, propertyId, {
      valuatedAt: new Date('2026-01-01'),
      estimatedValue: 10_000_000,
      currency: 'XOF',
      method: 'MANUAL'
    });
    expect(await prisma.asset.count({ where: { propertyId } })).toBe(1);

    await deleteProperty(propertyId, tenantA.id, adminA.id, adminA.id);

    expect(await prisma.property.count({ where: { id: propertyId } })).toBe(0);
    expect(await prisma.asset.count({ where: { propertyId } })).toBe(0);
    expect(await prisma.assetValuation.count({ where: { propertyId } })).toBe(0);
  });

  it('les CHECK de la migration restent en place', async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('assets_property_only_real_estate_chk', 'asset_valuations_one_target_chk')
    `;
    expect(rows.map(r => r.conname).sort()).toEqual([
      'asset_valuations_one_target_chk',
      'assets_property_only_real_estate_chk'
    ]);
    const [fk] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'assets_property_id_fkey'
    `;
    expect(fk.def).toContain('ON DELETE CASCADE');
  });
});
