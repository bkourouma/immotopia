/**
 * Lot 040 — concurrence du stock sur base RÉELLE (spec 040 : A10, B3-R2,
 * B7 critère 5).
 *
 * Ce que seuls des verrous PostgreSQL peuvent prouver, et qu'aucun magasin en
 * mémoire ne simule :
 *
 * - A10-1 : 100 sacs, deux sorties de 60 lancées en parallèle → une seule
 *   réussit, l'autre reçoit `409 STOCK_INSUFFICIENT` ; solde final 40, un seul
 *   mouvement ;
 * - A10-2 : deux transferts croisés A→B et B→A simultanés se terminent sans
 *   interblocage (verrous de solde triés) ;
 * - B7-5 : deux rebuts simultanés qui atteignent tous deux le cumul du mois
 *   passent sans `P2002` et n'ouvrent qu'UNE alerte de cumul ;
 * - B3-R2 : deux envois simultanés de la même sortie (même `clientRequestId`)
 *   n'écrivent qu'un mouvement et rendent le même bon ;
 * - A6 / A10-R2 : deux retours fournisseur simultanés du même article d'une
 *   facture, depuis DEUX lieux, qui dépasseraient ensemble le reçu → un seul
 *   passe (verrou `stock-invoice`, que les verrous de solde par couple ne
 *   remplacent pas).
 *
 * La course clôture / transfert entrant (A7, critère 9) est couverte par
 * `stock-cloture-concurrence.test.ts` (territoire API-2).
 *
 * Base : DEDIEE aux tests, via `DATABASE_URL_TEST` (env.example), exactement
 * comme `isolation.test.ts` : absente, ou exécution hors du lanceur
 * (`__tests__/helpers/run-isolation-tests.js`), la suite est ignorée
 * (`describe.skip`).
 */

import { randomUUID } from 'crypto';

import { prisma } from '../../src/utils/database';
import {
  recordStockIssue,
  recordStockReceipt,
  recordStockScrap,
  recordStockSupplierReturn
} from '../../src/lib/finance/stock-mouvements';
import { createSupplierTx } from '../../src/lib/finance/suppliers';
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
      'stock-concurrence.test.ts est ignoree. Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

const TODAY = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

maybeDescribe('Stock — concurrence sur base réelle (A10, B3-R2, B7)', () => {
  jest.setTimeout(60_000);

  let tenant: TestTenant;
  let user: TestUser;
  let ctx: StockCallerContext;
  let siteId: string;
  let costCategoryId: string;

  async function newItem(): Promise<string> {
    const item = await prisma.stockItem.create({
      data: { tenantId: tenant.id, reference: `CIM-${randomUUID().slice(0, 6)}`, label: 'Ciment CPJ 45', unit: 'sac' }
    });
    return item.id;
  }

  async function newLocation(label: string): Promise<string> {
    const location = await prisma.stockLocation.create({
      data: { tenantId: tenant.id, kind: 'WAREHOUSE', label: `${label} ${randomUUID().slice(0, 6)}` }
    });
    return location.id;
  }

  async function seedBalance(itemId: string, locationId: string, quantity: number, value: number): Promise<void> {
    await prisma.stockBalance.create({
      data: { tenantId: tenant.id, itemId, locationId, quantity, value, currency: 'XOF' }
    });
  }

  async function quantityOf(itemId: string, locationId: string): Promise<number> {
    const row = await prisma.stockBalance.findFirst({ where: { tenantId: tenant.id, itemId, locationId } });
    return Number(row?.quantity ?? 0);
  }

  function issueOf(itemId: string, locationId: string, quantity: number, clientRequestId?: string) {
    return recordStockIssue(tenant.id, ctx, {
      locationId,
      siteId,
      issueDate: TODAY,
      requestedBy: 'Chef de chantier',
      lines: [{ itemId, quantity, costCategoryId }],
      ...(clientRequestId ? { clientRequestId } : {})
    });
  }

  beforeAll(async () => {
    tenant = await createTestTenant('Stock concurrence');
    user = await createTenantAdminUser(tenant, 'stock-concurrence');
    ctx = {
      userId: user.id,
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
    siteId = (await prisma.constructionSite.create({ data: { tenantId: tenant.id, name: 'Chantier concurrence' } })).id;
    costCategoryId = (await prisma.costCategory.create({ data: { tenantId: tenant.id, label: 'Gros œuvre' } })).id;

    // Amorçage séquentiel du journal et du plan de comptes : leur création
    // paresseuse n'est pas l'objet de ces tests.
    const itemId = await newItem();
    const locationId = await newLocation('Amorçage');
    await seedBalance(itemId, locationId, 1, 1_000);
    await issueOf(itemId, locationId, 1);
  });

  afterAll(async () => {
    if (!tenant) return;
    const tenantId = tenant.id;
    const steps: Array<() => Promise<unknown>> = [
      () => prisma.stockAlert.deleteMany({ where: { tenantId } }),
      () => prisma.costAllocation.deleteMany({ where: { tenantId } }),
      () => prisma.stockMovement.deleteMany({ where: { tenantId } }),
      () => prisma.journalEntryLine.deleteMany({ where: { entry: { tenantId } } }),
      () => prisma.journalEntry.deleteMany({ where: { tenantId } }),
      () => prisma.stockSlip.deleteMany({ where: { tenantId } }),
      () => prisma.thirdPartyMovement.deleteMany({ where: { tenantId } }),
      () => prisma.supplierInvoice.deleteMany({ where: { tenantId } }),
      () => prisma.supplier.deleteMany({ where: { tenantId } }),
      () => prisma.thirdPartyAccount.deleteMany({ where: { tenantId } }),
      () => prisma.stockBalance.deleteMany({ where: { tenantId } }),
      () => prisma.stockClientRequest.deleteMany({ where: { tenantId } }),
      () => prisma.stockItem.deleteMany({ where: { tenantId } }),
      () => prisma.stockLocation.deleteMany({ where: { tenantId } }),
      () => prisma.costCategory.deleteMany({ where: { tenantId } }),
      () => prisma.constructionSite.deleteMany({ where: { tenantId } })
    ];
    for (const step of steps) {
      await step().catch(() => undefined);
    }
    await cleanupTenants([tenantId]);
  });

  it('A10-1 : deux sorties de 60 sur 100 sacs en parallèle → une seule passe, solde 40, un seul mouvement', async () => {
    const itemId = await newItem();
    const locationId = await newLocation('Magasin A10-1');
    await seedBalance(itemId, locationId, 100, 500_000);

    const results = await Promise.allSettled([issueOf(itemId, locationId, 60), issueOf(itemId, locationId, 60)]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409, code: 'STOCK_INSUFFICIENT' });
    expect(await quantityOf(itemId, locationId)).toBe(40);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, itemId, type: 'ISSUE' } })).toBe(1);
  });

  it('A10-2 : deux transferts croisés A→B et B→A simultanés se terminent sans interblocage', async () => {
    const itemId = await newItem();
    const a = await newLocation('Lieu A');
    const b = await newLocation('Lieu B');
    await seedBalance(itemId, a, 50, 250_000);
    await seedBalance(itemId, b, 50, 250_000);
    const transferOf = (from: string, to: string) =>
      recordStockTransfer(tenant.id, ctx, {
        fromLocationId: from,
        toLocationId: to,
        itemId,
        quantity: 10,
        transferDate: TODAY,
        reasonCode: 'REBALANCING',
        requestedBy: 'Magasinier'
      });

    const results = await Promise.all([transferOf(a, b), transferOf(b, a), transferOf(a, b), transferOf(b, a)]);

    expect(results.every(r => r.status === 201)).toBe(true);
    expect((await quantityOf(itemId, a)) + (await quantityOf(itemId, b))).toBe(100);
    expect(await quantityOf(itemId, a)).toBe(50);
  });

  it('B7-5 : deux rebuts simultanés qui atteignent le cumul du mois passent sans P2002 et n’ouvrent qu’une alerte', async () => {
    const itemId = await newItem();
    const locationId = await newLocation('Magasin rebuts');
    await seedBalance(itemId, locationId, 100, 1_000_000);
    const scrapOf = () =>
      recordStockScrap(tenant.id, ctx, { locationId, itemId, quantity: 20, scrapDate: TODAY, reasonCode: 'BREAKAGE' });

    await scrapOf();
    await scrapOf();
    const results = await Promise.allSettled([scrapOf(), scrapOf()]);

    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    const alerts = await prisma.stockAlert.findMany({
      where: { tenantId: tenant.id, locationId, kind: 'LARGE_SCRAP' }
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].dedupeKey.startsWith(`SCRAP_CUMUL:${locationId}:`)).toBe(true);
  });

  it('A6 / A10-R2 : deux retours simultanés du même article depuis deux lieux, au-delà du reçu → un seul passe', async () => {
    const itemId = await newItem();
    const recu = await newLocation('Magasin réception');
    const autre = await newLocation('Magasin second');
    const supplier = await prisma.$transaction(tx =>
      createSupplierTx(tx, tenant.id, {
        name: `Fournisseur concurrence ${randomUUID().slice(0, 6)}`,
        kind: 'MATERIALS' as any
      })
    );
    const invoice = await prisma.supplierInvoice.create({
      data: {
        tenantId: tenant.id,
        supplierId: supplier.id,
        invoiceDate: TODAY,
        reference: `FAC-RET-${randomUUID().slice(0, 6)}`,
        amount: 100_000,
        status: 'VALIDATED',
        createdByUserId: user.id,
        validatedByUserId: user.id,
        validatedAt: new Date()
      }
    });
    // 10 sacs reçus sur la facture, au premier lieu seulement ; le second lieu
    // a du stock d'une autre provenance : chaque retour de 8 tient dans son
    // solde et dans le reçu, mais pas les deux ensemble (8 + 8 > 10).
    await recordStockReceipt(tenant.id, ctx, {
      locationId: recu,
      supplierInvoiceId: invoice.id,
      receiptDate: TODAY,
      lines: [{ itemId, quantity: 10, unitCost: 5_000 }]
    });
    await seedBalance(itemId, autre, 20, 100_000);
    const returnOf = (locationId: string) =>
      recordStockSupplierReturn(tenant.id, ctx, {
        locationId,
        supplierInvoiceId: invoice.id,
        itemId,
        quantity: 8,
        returnDate: TODAY,
        reasonCode: 'NON_CONFORMING'
      });

    const results = await Promise.allSettled([returnOf(recu), returnOf(autre)]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409, code: 'STOCK_RETURN_EXCEEDS_RECEIVED' });
    expect(
      await prisma.stockMovement.count({
        where: { tenantId: tenant.id, itemId, supplierInvoiceId: invoice.id, type: 'SUPPLIER_RETURN' }
      })
    ).toBe(1);
  });

  it('B3-R2 : deux envois simultanés de la même sortie → un seul mouvement, le même bon, 201 puis 200', async () => {
    const itemId = await newItem();
    const locationId = await newLocation('Magasin rejeu');
    await seedBalance(itemId, locationId, 10, 10_000);
    const clientRequestId = randomUUID();

    const [first, second] = await Promise.all([
      issueOf(itemId, locationId, 1, clientRequestId),
      issueOf(itemId, locationId, 1, clientRequestId)
    ]);

    expect(first.data.slip.id).toBe(second.data.slip.id);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(await prisma.stockMovement.count({ where: { tenantId: tenant.id, itemId, type: 'ISSUE' } })).toBe(1);
    expect(await quantityOf(itemId, locationId)).toBe(9);
  });
});
