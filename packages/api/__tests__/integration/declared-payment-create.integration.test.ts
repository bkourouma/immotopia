/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T020 : création concurrente de déclarations sur une BASE RÉELLE
 * (index unique partiel `syndic_payment_declarations_ref_active_uq`, limite de
 * 10 déclarations PENDING par lot sous verrou consultatif).
 *
 * Même garde que `declared-payment-cancel.integration.test.ts` :
 * `DATABASE_URL_TEST` doit égaler `DATABASE_URL` (`npm run test:isolation`) ;
 * sinon la suite est ignorée (`describe.skip`) et `npm test` reste vert.
 */
process.env.TENANT_GUARD_MODE = 'enforce';

import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { createDeclaration } from '../../src/lib/syndics/declared-payment/declaration-create';
import { createTestTenant, cleanupTenants, createContactDirect, TestTenant } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou exécution hors base dédiée) : declared-payment-create.integration.test.ts est ignorée.'
  );
}

maybeDescribe('création concurrente de déclarations (base réelle)', () => {
  let tenant: TestTenant;
  let contactId: string;
  let syndicateId: string;
  const lotIds: string[] = [];
  let receivingNumberId: string;
  let scope: any;

  const ref = (prefix: string) => `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;

  const declare = (lotId: string, reference: string) =>
    createDeclaration({
      tenantId: tenant.id,
      syndicateId,
      actor: { type: 'COOWNER', scope, contactId },
      input: {
        receivingNumberId,
        payerPhone: '0505050505',
        amount: 20000,
        paidAt: new Date().toISOString(),
        transactionReference: reference,
        lines: [{ lotId, amount: 20000, chargeCallIds: [] }]
      }
    });

  beforeAll(async () => {
    tenant = await createTestTenant('Declared Create');
    contactId = await createContactDirect(tenant.id, 'Declarant');
    const syndicate = await prisma.syndicate.create({
      data: { tenantId: tenant.id, name: 'Résidence test', address: '1 rue test' }
    });
    syndicateId = syndicate.id;
    for (let i = 0; i < 2; i += 1) {
      const lot = await prisma.syndicateLot.create({
        data: { syndicateId, lotNumber: `A${i + 1}`, lotType: 'APARTMENT', generalShares: 100 }
      });
      lotIds.push(lot.id);
    }
    const number = await prisma.syndicReceivingNumber.create({
      data: {
        tenantId: tenant.id,
        syndicateId,
        operator: 'ORANGE',
        phoneNumber: '+2250707070713',
        holderName: 'Syndic test',
        treasuryAccountNumber: '55211'
      }
    });
    receivingNumberId = number.id;
    await prisma.syndicDeclaredPaymentSettings.create({ data: { tenantId: tenant.id, syndicateId, enabled: true } });
    scope = {
      tenantId: tenant.id,
      contactIds: [contactId],
      lots: lotIds.map(lotId => ({
        lotId,
        syndicateId,
        contactId,
        ownershipPercentage: 100,
        ownedSince: new Date(0),
        visibleSince: null
      })),
      lotIds,
      syndicateIds: [syndicateId]
    };
  });

  afterAll(async () => {
    if (tenant) await cleanupTenants([tenant.id]);
    await prisma.$disconnect();
  });

  it('deux déclarations simultanées de même référence : une seule est créée, l’autre reçoit DECLARATION_REFERENCE_USED', async () => {
    const reference = ref('RACE');
    const results = await Promise.allSettled([declare(lotIds[0], reference), declare(lotIds[1], reference)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409, code: 'DECLARATION_REFERENCE_USED' });
    const rows = await prisma.syndicPaymentDeclaration.findMany({
      where: { tenantId: tenant.id, transactionReference: reference }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'PENDING', receivingPhone: '+2250707070713' });
  });

  it('une référence annulée redevient libre', async () => {
    const reference = ref('FREE');
    const { declarationId } = await declare(lotIds[0], reference);
    await prisma.syndicPaymentDeclaration.updateMany({
      where: { id: declarationId, tenantId: tenant.id },
      data: { status: 'CANCELED', canceledAt: new Date() }
    });
    await expect(declare(lotIds[0], reference)).resolves.toBeDefined();
  });

  it('la limite de 10 déclarations PENDING par lot tient face à des créations simultanées', async () => {
    const lot = await prisma.syndicateLot.create({
      data: { syndicateId, lotNumber: `L${randomUUID().slice(0, 4)}`, lotType: 'APARTMENT', generalShares: 100 }
    });
    scope.lots.push({
      lotId: lot.id,
      syndicateId,
      contactId,
      ownershipPercentage: 100,
      ownedSince: new Date(0),
      visibleSince: null
    });
    scope.lotIds.push(lot.id);
    const results = await Promise.allSettled(Array.from({ length: 13 }, () => declare(lot.id, ref('LIM'))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(10);
    for (const r of results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]) {
      expect(r.reason).toMatchObject({ statusCode: 409, code: 'DECLARATION_PENDING_LIMIT' });
    }
    expect(
      await prisma.syndicPaymentDeclarationLine.count({
        where: { tenantId: tenant.id, lotId: lot.id, declaration: { status: 'PENDING' } }
      })
    ).toBe(10);
  });
});
