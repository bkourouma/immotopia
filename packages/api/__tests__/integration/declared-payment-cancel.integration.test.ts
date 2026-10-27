/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T021 : concurrence de l'annulation d'une déclaration sur une BASE
 * RÉELLE (claim `updateMany where status = PENDING`).
 *
 * Même garde que `external-access.db.test.ts` : `DATABASE_URL_TEST` doit égaler
 * `DATABASE_URL` (`npm run test:isolation`) ; sinon la suite est ignorée
 * (`describe.skip`) et `npm test` reste vert.
 */
process.env.TENANT_GUARD_MODE = 'enforce';

import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { cancelDeclaration } from '../../src/lib/syndics/declared-payment/declaration-cancel';
import { createTestTenant, cleanupTenants, createContactDirect, TestTenant } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou exécution hors base dédiée) : declared-payment-cancel.integration.test.ts est ignorée.'
  );
}

maybeDescribe('annulation concurrente d’une déclaration (base réelle)', () => {
  let tenant: TestTenant;
  let contactId: string;
  let syndicateId: string;
  let lotId: string;
  let receivingNumberId: string;
  let scope: any;

  async function createPending(reference: string): Promise<string> {
    const declaration = await prisma.syndicPaymentDeclaration.create({
      data: {
        tenantId: tenant.id,
        syndicateId,
        receivingNumberId,
        receivingOperator: 'ORANGE',
        receivingPhone: '+2250707070712',
        receivingHolderName: 'Syndic test',
        declaredByContactId: contactId,
        payerPhone: '+2250505050512',
        amount: 20000,
        paidAt: new Date(),
        transactionReference: reference,
        lines: { create: [{ tenantId: tenant.id, lotId, amount: 20000 }] }
      }
    });
    return declaration.id;
  }

  beforeAll(async () => {
    tenant = await createTestTenant('Declared Cancel');
    contactId = await createContactDirect(tenant.id, 'Declarant');
    const syndicate = await prisma.syndicate.create({
      data: { tenantId: tenant.id, name: 'Résidence test', address: '1 rue test' }
    });
    syndicateId = syndicate.id;
    const lot = await prisma.syndicateLot.create({
      data: { syndicateId, lotNumber: 'A1', lotType: 'APARTMENT', generalShares: 100 }
    });
    lotId = lot.id;
    const number = await prisma.syndicReceivingNumber.create({
      data: {
        tenantId: tenant.id,
        syndicateId,
        operator: 'ORANGE',
        phoneNumber: '+2250707070712',
        holderName: 'Syndic test',
        treasuryAccountNumber: '55211'
      }
    });
    receivingNumberId = number.id;
    scope = { tenantId: tenant.id, contactIds: [contactId], lots: [], lotIds: [lotId], syndicateIds: [syndicateId] };
  });

  afterAll(async () => {
    if (tenant) await cleanupTenants([tenant.id]);
    await prisma.$disconnect();
  });

  it('deux annulations simultanées : une seule réussit, l’autre reçoit DECLARATION_NOT_PENDING', async () => {
    const id = await createPending(`CANCEL${randomUUID().slice(0, 8).toUpperCase()}`);
    const results = await Promise.allSettled([
      cancelDeclaration({ scope, declarationId: id }),
      cancelDeclaration({ scope, declarationId: id })
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409, code: 'DECLARATION_NOT_PENDING' });
    const row = await prisma.syndicPaymentDeclaration.findFirst({ where: { id, tenantId: tenant.id } });
    expect(row?.status).toBe('CANCELED');
    expect(row?.canceledAt).toBeInstanceOf(Date);
  });

  it('une validation qui prend la main avant l’annulation la fait échouer sans rien écrire', async () => {
    const id = await createPending(`APPROVE${randomUUID().slice(0, 8).toUpperCase()}`);
    const claim = await prisma.syndicPaymentDeclaration.updateMany({
      where: { id, tenantId: tenant.id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedAt: new Date() }
    });
    expect(claim.count).toBe(1);
    await expect(cancelDeclaration({ scope, declarationId: id })).rejects.toMatchObject({
      statusCode: 409,
      code: 'DECLARATION_NOT_PENDING'
    });
    const row = await prisma.syndicPaymentDeclaration.findFirst({ where: { id, tenantId: tenant.id } });
    expect(row?.status).toBe('APPROVED');
    expect(row?.canceledAt).toBeNull();
  });
});
