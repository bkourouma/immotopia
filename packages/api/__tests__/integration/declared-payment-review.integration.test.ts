/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T023 : validation et rejet d'une déclaration sur une BASE RÉELLE
 * (`declaration-review.ts`) : un encaissement par ligne (origine `DECLARED`,
 * écriture 5521x / 450), deux validations concurrentes → une seule gagne,
 * exercice clos, rejet sans écriture et référence libérée après rejet (index
 * unique partiel `syndic_payment_declarations_ref_active_uq`).
 *
 * Même garde que `declared-payment-cancel.integration.test.ts` :
 * `DATABASE_URL_TEST` doit égaler `DATABASE_URL` (`npm run test:isolation`) ;
 * sinon la suite est ignorée (`describe.skip`) et `npm test` reste vert.
 */
process.env.TENANT_GUARD_MODE = 'enforce';

import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { approveDeclaration, rejectDeclaration } from '../../src/lib/syndics/declared-payment/declaration-review';
import { ensureSyndicReceivingAccountTx } from '../../src/lib/syndics/provider-invoice-accounting';
import { CHARGE_PAYMENT_DOCUMENT_TYPE } from '../../src/lib/syndics/charge-collection-accounting';
import {
  createTestTenant,
  createTenantAdminUser,
  cleanupTenants,
  createContactDirect,
  TestTenant
} from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou exécution hors base dédiée) : declared-payment-review.integration.test.ts est ignorée.'
  );
}

const RECEIVING_PHONE = '+2250707070713';
const CLOSED_YEAR = 2025;

const reference = (prefix: string) => `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;

maybeDescribe('validation et rejet d’une déclaration (base réelle)', () => {
  let tenant: TestTenant;
  let managerId: string;
  let contactId: string;
  let syndicateId: string;
  let lotA: string;
  let lotB: string;
  let receivingNumberId: string;
  let treasuryAccountNumber: string;

  async function createCall(lotId: string, amount: number, period: string) {
    const call = await prisma.chargeCall.create({
      data: { syndicateId, lotId, period, amount, dueDate: new Date(Date.now() - 30 * 86_400_000) }
    });
    return call.id;
  }

  async function createPending(params: {
    reference: string;
    lines: Array<{ lotId: string; amount: number; chargeCallIds?: string[] }>;
    paidAt?: Date;
  }): Promise<{ id: string; lineIds: Record<string, string> }> {
    const amount = params.lines.reduce((sum, line) => sum + line.amount, 0);
    const declaration = await prisma.syndicPaymentDeclaration.create({
      data: {
        tenantId: tenant.id,
        syndicateId,
        receivingNumberId,
        receivingOperator: 'ORANGE',
        receivingPhone: RECEIVING_PHONE,
        receivingHolderName: 'Syndic test',
        declaredByContactId: contactId,
        payerPhone: '+2250505050513',
        amount,
        paidAt: params.paidAt ?? new Date(Date.now() - 3_600_000),
        transactionReference: params.reference,
        lines: {
          create: params.lines.map(line => ({
            tenantId: tenant.id,
            lotId: line.lotId,
            amount: line.amount,
            chargeCallIds: line.chargeCallIds ?? []
          }))
        }
      },
      include: { lines: { select: { id: true, lotId: true } } }
    });
    return {
      id: declaration.id,
      lineIds: Object.fromEntries(declaration.lines.map(line => [line.lotId, line.id]))
    };
  }

  const approve = (declarationId: string, extra: Record<string, unknown> = {}) =>
    approveDeclaration({ tenantId: tenant.id, syndicateId, declarationId, actorUserId: managerId, ...extra });

  const paymentsOf = (lineIds: string[]) =>
    prisma.chargePayment.findMany({ where: { idempotencyKey: { in: lineIds.map(id => `DECL-${id}`) } } });

  beforeAll(async () => {
    tenant = await createTestTenant('Declared Review');
    managerId = (await createTenantAdminUser(tenant, 'declared-review')).id;
    contactId = await createContactDirect(tenant.id, 'Declarant');
    const syndicate = await prisma.syndicate.create({
      data: { tenantId: tenant.id, name: 'Résidence validation', address: '2 rue test' }
    });
    syndicateId = syndicate.id;
    const first = await prisma.syndicateLot.create({
      data: { syndicateId, lotNumber: 'A1', lotType: 'APARTMENT', generalShares: 100 }
    });
    const second = await prisma.syndicateLot.create({
      data: { syndicateId, lotNumber: 'B1', lotType: 'APARTMENT', generalShares: 100 }
    });
    [lotA, lotB] = [first.id, second.id].sort();

    const account = await prisma.$transaction(tx =>
      ensureSyndicReceivingAccountTx(tx, tenant.id, syndicateId, { operator: 'ORANGE', phoneNumber: RECEIVING_PHONE })
    );
    treasuryAccountNumber = account.accountNumber;
    const number = await prisma.syndicReceivingNumber.create({
      data: {
        tenantId: tenant.id,
        syndicateId,
        operator: 'ORANGE',
        phoneNumber: RECEIVING_PHONE,
        holderName: 'Syndic test',
        treasuryAccountNumber
      }
    });
    receivingNumberId = number.id;

    await prisma.syndicateBudget.create({
      data: { syndicateId, fiscalYear: CLOSED_YEAR, label: 'Exercice clos', status: 'CLOSED', totalAmount: 0 }
    });
  });

  afterAll(async () => {
    if (tenant) {
      // Les lignes de déclaration retiennent leurs lots (`onDelete: Restrict`) : on les retire d'abord.
      await prisma.syndicPaymentDeclaration.deleteMany({ where: { tenantId: tenant.id } });
      await cleanupTenants([tenant.id]);
    }
    if (managerId) await prisma.user.deleteMany({ where: { id: managerId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('un encaissement par ligne, origine DECLARED, écriture 5521x / 450 rattachée au lot, excédent en avance', async () => {
    const callA = await createCall(lotA, 20000, '2026-T3-A');
    const callB = await createCall(lotB, 10000, '2026-T3-B');
    const ref = reference('MULTI');
    const declaration = await createPending({
      reference: ref,
      lines: [
        { lotId: lotB, amount: 15000, chargeCallIds: [callB] },
        { lotId: lotA, amount: 20000, chargeCallIds: [callA] }
      ]
    });

    const result = await approve(declaration.id);

    const row = await prisma.syndicPaymentDeclaration.findFirst({
      where: { id: declaration.id, tenantId: tenant.id },
      include: { lines: true }
    });
    expect(row).toMatchObject({ status: 'APPROVED', reviewedByUserId: managerId });
    expect(Number(row!.acceptedAmount)).toBe(35000);

    const payments = await paymentsOf(Object.values(declaration.lineIds));
    expect(payments).toHaveLength(2);
    for (const payment of payments) {
      expect(payment).toMatchObject({
        origin: 'DECLARED',
        method: 'MOBILE_MONEY',
        reference: ref,
        providerTransactionId: null,
        createdById: managerId
      });
      const line = row!.lines.find(l => l.lotId === payment.lotId)!;
      expect(line.chargePaymentId).toBe(payment.id);
      expect(Number(line.acceptedAmount)).toBe(Number(payment.amount));

      const entry = await prisma.journalEntry.findFirst({
        where: { tenantId: tenant.id, documentType: CHARGE_PAYMENT_DOCUMENT_TYPE, documentId: payment.id },
        include: { lines: { include: { account: { select: { accountNumber: true } } } } }
      });
      expect(entry).not.toBeNull();
      const debit = entry!.lines.find(l => Number(l.debit) > 0)!;
      const credit = entry!.lines.find(l => Number(l.credit) > 0)!;
      expect(debit.account.accountNumber).toBe(treasuryAccountNumber);
      expect(Number(debit.debit)).toBe(Number(payment.amount));
      expect(credit.account.accountNumber).toBe('450');
      expect(credit.lotId).toBe(payment.lotId);
    }
    // 15 000 sur un appel de 10 000 : 5 000 restent en avance du lot B.
    const paymentB = payments.find(p => p.lotId === lotB)!;
    expect(Number(paymentB.unallocatedAmount)).toBe(5000);

    expect(result.documents.length).toBeGreaterThanOrEqual(2);
    expect(result.documentRefs.every(doc => ['RECEIPT', 'QUITTANCE'].includes(doc.kind))).toBe(true);
  });

  it('deux validations simultanées : une seule gagne, un seul encaissement', async () => {
    const declaration = await createPending({ reference: reference('RACE'), lines: [{ lotId: lotA, amount: 5000 }] });

    const results = await Promise.allSettled([approve(declaration.id), approve(declaration.id)]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ statusCode: 409, code: 'DECLARATION_NOT_PENDING' });
    expect(await paymentsOf(Object.values(declaration.lineIds))).toHaveLength(1);
  });

  it('exercice clos à la date déclarée : rien n’est enregistré ; une date corrigée dans un exercice ouvert passe', async () => {
    const closedDate = new Date(Date.UTC(CLOSED_YEAR, 11, 15, 10, 0, 0));
    const declaration = await createPending({
      reference: reference('CLOSED'),
      lines: [{ lotId: lotB, amount: 4000 }],
      paidAt: closedDate
    });

    await expect(approve(declaration.id)).rejects.toMatchObject({ statusCode: 409 });
    let row = await prisma.syndicPaymentDeclaration.findFirst({ where: { id: declaration.id, tenantId: tenant.id } });
    expect(row).toMatchObject({ status: 'PENDING', reviewedAt: null, acceptedPaidAt: null });
    expect(await paymentsOf(Object.values(declaration.lineIds))).toHaveLength(0);

    const openDate = new Date(Date.now() - 3_600_000);
    await approve(declaration.id, {
      correction: { paidAt: openDate.toISOString() },
      note: 'Date ramenée dans l’exercice ouvert, relevé du jour.'
    });
    row = await prisma.syndicPaymentDeclaration.findFirst({ where: { id: declaration.id, tenantId: tenant.id } });
    expect(row?.status).toBe('APPROVED');
    expect(row?.paidAt).toEqual(closedDate);
    expect(row?.acceptedPaidAt).toEqual(openDate);
    const [payment] = await paymentsOf(Object.values(declaration.lineIds));
    expect(payment.paidAt).toEqual(openDate);
  });

  it('rejet : aucune écriture, et la référence redevient libre', async () => {
    const ref = reference('REJECT');
    const declaration = await createPending({ reference: ref, lines: [{ lotId: lotA, amount: 3000 }] });

    // Tant qu'elle est PENDING, la référence est prise sur ce numéro de réception.
    await expect(createPending({ reference: ref, lines: [{ lotId: lotB, amount: 3000 }] })).rejects.toMatchObject({
      code: 'P2002'
    });

    await rejectDeclaration({
      tenantId: tenant.id,
      syndicateId,
      declarationId: declaration.id,
      actorUserId: managerId,
      reason: 'NOT_FOUND',
      note: 'Aucun transfert reçu sur le relevé du jour.'
    });

    const row = await prisma.syndicPaymentDeclaration.findFirst({
      where: { id: declaration.id, tenantId: tenant.id },
      include: { lines: true }
    });
    expect(row).toMatchObject({ status: 'REJECTED', rejectReason: 'NOT_FOUND', acceptedAmount: null });
    expect(row!.lines.every(line => line.chargePaymentId === null && line.acceptedAmount === null)).toBe(true);
    expect(await paymentsOf(Object.values(declaration.lineIds))).toHaveLength(0);

    // REJECTED est hors de l'index partiel : une nouvelle déclaration peut porter la même référence.
    const again = await createPending({ reference: ref, lines: [{ lotId: lotA, amount: 3000 }] });
    expect(again.id).not.toBe(declaration.id);

    await expect(approve(declaration.id)).rejects.toMatchObject({ statusCode: 409, code: 'DECLARATION_NOT_PENDING' });
  });
});
