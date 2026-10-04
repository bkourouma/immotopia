/**
 * Lot 040 — clôture de chantier et inventaire sur base RÉELLE (spec 040 :
 * A7 critère 9, A7-R3 bis, A1-R3 « dérogation testée en base »).
 *
 * Ce que seule une vraie base prouve :
 *
 * - A7-9 : une clôture de chantier et un transfert VERS le lieu de ce chantier
 *   lancés en parallèle → l'un des deux échoue (verrou `stock-site`) ; jamais
 *   un chantier clos qui porte du stock reçu après sa clôture ;
 * - A7-6 : la clôture est refusée tant que le lieu porte du stock ou n'a pas
 *   d'inventaire de clôture validé depuis sa dernière entrée ;
 * - A1-R3 : la dérogation se lit dans les tables (`Membership`, `User`,
 *   `UserRole`, `RolePermission`), jamais dans le cache des permissions —
 *   un autre validateur actif l'interdit, désactivé il l'ouvre.
 *
 * Base : DÉDIÉE aux tests, via `DATABASE_URL_TEST` (env.example), exactement
 * comme `isolation.test.ts` : absente, ou exécution hors du lanceur
 * (`__tests__/helpers/run-isolation-tests.js`), la suite est ignorée
 * (`describe.skip`).
 */

import { randomUUID } from 'crypto';

import { prisma } from '../../src/utils/database';
import { closeSiteTx } from '../../src/lib/finance/site-closing';
import {
  closeStockCountTx,
  createStockCountTx,
  hasOtherActiveCountValidator,
  setStockCountLineTx,
  validateStockCountTx
} from '../../src/lib/finance/stock-inventaire';
import { recordStockTransfer } from '../../src/lib/finance/stock-transferts';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';
import { cleanupTenants, createTenantAdminUser, createTestTenant, TestTenant, TestUser } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou execution hors `npm run test:isolation`) : ' +
      'stock-cloture-concurrence.test.ts est ignoree. Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

const TODAY = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

maybeDescribe('Stock — clôture de chantier et inventaire sur base réelle (A7, A1-R3)', () => {
  jest.setTimeout(60_000);

  let tenant: TestTenant;
  let admin: TestUser;
  let ctx: StockCallerContext;
  let validatorRoleId: string;

  async function newItem(): Promise<string> {
    const item = await prisma.stockItem.create({
      data: { tenantId: tenant.id, reference: `CIM-${randomUUID().slice(0, 6)}`, label: 'Ciment CPJ 45', unit: 'sac' }
    });
    return item.id;
  }

  async function newWarehouse(): Promise<string> {
    const location = await prisma.stockLocation.create({
      data: { tenantId: tenant.id, kind: 'WAREHOUSE', label: `Magasin ${randomUUID().slice(0, 6)}` }
    });
    return location.id;
  }

  async function newSiteWithLocation(): Promise<{ siteId: string; locationId: string }> {
    const site = await prisma.constructionSite.create({
      data: { tenantId: tenant.id, name: `Chantier ${randomUUID().slice(0, 6)}`, stockEnabledAt: new Date() }
    });
    const location = await prisma.stockLocation.create({
      data: { tenantId: tenant.id, kind: 'SITE', label: `Lieu ${site.name}`, siteId: site.id }
    });
    return { siteId: site.id, locationId: location.id };
  }

  async function seedBalance(itemId: string, locationId: string, quantity: number, value: number): Promise<void> {
    await prisma.stockBalance.create({
      data: { tenantId: tenant.id, itemId, locationId, quantity, value, currency: 'XOF' }
    });
  }

  /** Un membre actif de l'agence dont le rôle porte STOCK_COUNT_VALIDATE, lu en base. */
  async function newValidator(prefix: string, tenantId = tenant.id): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `${prefix}-${randomUUID().slice(0, 8)}@isolation-test.local`, fullName: prefix, isActive: true }
    });
    await prisma.membership.create({ data: { userId: user.id, tenantId, status: 'ACTIVE', acceptedAt: new Date() } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: validatorRoleId, tenantId } });
    return user.id;
  }

  beforeAll(async () => {
    tenant = await createTestTenant('Stock cloture');
    admin = await createTenantAdminUser(tenant, 'stock-cloture');
    ctx = {
      userId: admin.id,
      valuesVisible: true,
      canValidateCount: true,
      canReceive: true,
      canIssue: true,
      canTransfer: true,
      canCount: true,
      canDispose: true,
      canManageTakers: true,
      canViewAlerts: true,
      canManageSettings: true
    };
    const permission = await prisma.permission.upsert({
      where: { key: 'STOCK_COUNT_VALIDATE' },
      update: {},
      create: { key: 'STOCK_COUNT_VALIDATE', description: 'Valider un inventaire' }
    });
    const role = await prisma.role.create({
      data: { key: `TEST_STOCK_VALIDATEUR_${randomUUID().slice(0, 8)}`, name: 'Validateur de test', scope: 'TENANT' }
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    validatorRoleId = role.id;
  });

  afterAll(async () => {
    if (!tenant) return;
    const tenantId = tenant.id;
    const steps: Array<() => Promise<unknown>> = [
      () => prisma.auditLog.deleteMany({ where: { tenantId } }),
      () => prisma.stockAlert.deleteMany({ where: { tenantId } }),
      () => prisma.stockMovement.deleteMany({ where: { tenantId } }),
      () => prisma.journalEntryLine.deleteMany({ where: { entry: { tenantId } } }),
      () => prisma.journalEntry.deleteMany({ where: { tenantId } }),
      () => prisma.stockSlip.deleteMany({ where: { tenantId } }),
      () => prisma.stockCountLine.deleteMany({ where: { count: { tenantId } } }),
      () => prisma.stockCount.deleteMany({ where: { tenantId } }),
      () => prisma.stockBalance.deleteMany({ where: { tenantId } }),
      () => prisma.stockClientRequest.deleteMany({ where: { tenantId } }),
      () => prisma.stockItem.deleteMany({ where: { tenantId } }),
      () => prisma.stockLocation.deleteMany({ where: { tenantId } }),
      () => prisma.constructionSite.deleteMany({ where: { tenantId } }),
      () => prisma.userRole.deleteMany({ where: { roleId: validatorRoleId } }),
      () => prisma.rolePermission.deleteMany({ where: { roleId: validatorRoleId } }),
      () => prisma.role.deleteMany({ where: { id: validatorRoleId } })
    ];
    for (const step of steps) {
      await step().catch(() => undefined);
    }
    await cleanupTenants([tenantId]);
  });

  it('A7-9 : clôture et transfert vers le lieu du chantier en parallèle → l’un des deux échoue', async () => {
    const itemId = await newItem();
    const warehouseId = await newWarehouse();
    const { siteId, locationId } = await newSiteWithLocation();
    await seedBalance(itemId, warehouseId, 50, 250_000);

    const results = await Promise.allSettled([
      prisma.$transaction(tx => closeSiteTx(tx, tenant.id, siteId, { closedByUserId: admin.id })),
      recordStockTransfer(tenant.id, ctx, {
        fromLocationId: warehouseId,
        toLocationId: locationId,
        itemId,
        quantity: 10,
        transferDate: TODAY,
        reasonCode: 'SITE_SUPPLY',
        requestedBy: 'Chef de chantier'
      })
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const site = await prisma.constructionSite.findFirst({ where: { id: siteId, tenantId: tenant.id } });
    const onSite = await prisma.stockBalance.findFirst({ where: { tenantId: tenant.id, itemId, locationId } });
    // Jamais les deux : un chantier clos ne porte pas une entrée reçue en même temps que sa clôture.
    expect(Boolean(site?.closedAt) && Number(onSite?.quantity ?? 0) > 0).toBe(false);
  });

  it('A7-6 : stock résiduel puis inventaire de clôture validé et transfert du reste → la clôture passe', async () => {
    const itemId = await newItem();
    const warehouseId = await newWarehouse();
    const { siteId, locationId } = await newSiteWithLocation();
    await recordStockTransfer(tenant.id, ctx, {
      fromLocationId: await (async () => {
        await seedBalance(itemId, warehouseId, 12, 60_000);
        return warehouseId;
      })(),
      toLocationId: locationId,
      itemId,
      quantity: 12,
      transferDate: TODAY,
      reasonCode: 'SITE_SUPPLY',
      requestedBy: 'Chef de chantier'
    });

    await expect(
      prisma.$transaction(tx => closeSiteTx(tx, tenant.id, siteId, { closedByUserId: admin.id }))
    ).rejects.toMatchObject({ statusCode: 409 });

    const counter = await newValidator('compteur');
    const count = await prisma.$transaction(tx =>
      createStockCountTx(tx, tenant.id, { locationId, countedAt: TODAY, createdByUserId: counter, kind: 'CLOSING' })
    );
    await prisma.$transaction(tx =>
      setStockCountLineTx(tx, tenant.id, count.id, { itemId, countedQuantity: 12, countedByUserId: counter })
    );
    await prisma.$transaction(tx => closeStockCountTx(tx, tenant.id, count.id, counter));
    await prisma.$transaction(tx => validateStockCountTx(tx, tenant.id, count.id, admin.id));
    await recordStockTransfer(tenant.id, ctx, {
      fromLocationId: locationId,
      toLocationId: warehouseId,
      itemId,
      quantity: 12,
      transferDate: TODAY,
      reasonCode: 'SITE_EVACUATION',
      requestedBy: 'Chef de chantier'
    });

    await expect(
      prisma.$transaction(tx => closeSiteTx(tx, tenant.id, siteId, { closedByUserId: admin.id }))
    ).resolves.toMatchObject({ siteId });
  });

  it('A1-R3 : la dérogation se lit en base — un validateur actif l’interdit, désactivé il l’ouvre', async () => {
    // Une agence à part, où seuls Awa et Koffi portent le droit de valider.
    const isolated = await createTestTenant('Stock derogation');
    try {
      const awa = await newValidator('awa', isolated.id);
      const koffi = await newValidator('koffi', isolated.id);
      await expect(hasOtherActiveCountValidator(prisma, isolated.id, awa)).resolves.toBe(true);

      // A1-4 : adhésion désactivée.
      await prisma.membership.updateMany({
        where: { userId: koffi, tenantId: isolated.id },
        data: { status: 'DISABLED' }
      });
      await expect(hasOtherActiveCountValidator(prisma, isolated.id, awa)).resolves.toBe(false);

      // A1-7 : adhésion active, compte désactivé.
      await prisma.membership.updateMany({
        where: { userId: koffi, tenantId: isolated.id },
        data: { status: 'ACTIVE' }
      });
      await prisma.user.update({ where: { id: koffi }, data: { isActive: false } });
      await expect(hasOtherActiveCountValidator(prisma, isolated.id, awa)).resolves.toBe(false);

      // A1-R4 : le personnel de la plateforme ne compte pas.
      await prisma.user.update({ where: { id: koffi }, data: { isActive: true, globalRole: 'SUPER_ADMIN' } });
      await expect(hasOtherActiveCountValidator(prisma, isolated.id, awa)).resolves.toBe(false);
    } finally {
      await prisma.userRole.deleteMany({ where: { tenantId: isolated.id } }).catch(() => undefined);
      await cleanupTenants([isolated.id]);
    }
  });
});
