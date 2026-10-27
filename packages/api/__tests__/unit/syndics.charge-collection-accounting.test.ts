/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-30-086 — un encaissement d'appel de charges laisse une ecriture
 * dans la comptabilite de la copropriete (debit banque / credit
 * coproprietaires), une seule par paiement, equilibree, idempotente et
 * contre-passable.
 *
 *   Agence A — copropriete S1 : lot L1 (Awa).
 *   Agence B — copropriete SB : lot LB.
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: jest.fn(async () => undefined) },
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({ enabled: true, subjectOverride: null, bodyHtmlOverride: null }))
}));
jest.mock('../../src/services/whatsapp-notification-send-service', () => ({
  sendWhatsappNotification: jest.fn(async () => false)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), flushAuditQueue: jest.fn() }));

import { recordLotPayment, type LotPaymentInput } from '../../src/lib/syndics/charge-allocation';
import {
  chargePaymentEntryReference,
  isCashMethod,
  postChargePaymentEntryTx,
  reverseChargePaymentEntryTx
} from '../../src/lib/syndics/charge-collection-accounting';
import { createChargeCallAndUpdateStatus } from '../../src/lib/syndics/queries';
import { ConflictError } from '../../src/middleware/error-middleware';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(2);
const L1 = id(11);
const LB = id(13);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

const syndicates: Record<string, { tenantId: string; name: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence Les Palmiers' },
  [SB]: { tenantId: TENANT_B, name: 'Residence B' }
};

function linkOnCreate(model: any, augment: (row: any) => void) {
  const original = model.create.getMockImplementation();
  model.create.mockImplementation(async (args: any) => {
    const result = await original(args);
    augment(model.rows[model.rows.length - 1]);
    return result;
  });
}

function lotRow(lotId: string, syndicateId: string, lotNumber: string, owner: any) {
  return {
    id: lotId,
    syndicateId,
    lotNumber,
    ownerContactId: owner.id,
    coownerId: owner.id,
    owner,
    coowner: owner,
    syndicate: { tenantId: syndicates[syndicateId].tenantId }
  };
}

function seed() {
  mockPrisma.reset();
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({ id: syndicId, tenantId: info.tenantId, name: info.name, status: 'ACTIVE' });
  }
  const awa = { id: 'contact-awa', firstName: 'Awa', lastName: 'Kone', legalName: null, email: 'awa@example.test' };
  const bintou = { id: 'contact-b', firstName: 'Bintou', lastName: 'Diallo', legalName: null, email: null };
  mockPrisma.syndicateLot.rows.push(lotRow(L1, S1, 'A-01', awa), lotRow(LB, SB, 'B-01', bintou));
}

linkOnCreate(mockPrisma.chargeCall, row => {
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
});
linkOnCreate(mockPrisma.chargePayment, row => {
  const lot = mockPrisma.syndicateLot.rows.find(candidate => candidate.id === row.lotId);
  row.lot = { syndicateId: lot?.syndicateId, syndicate: lot?.syndicate };
});

const createCall = (lotId: string, period: string, amount: number, syndicateId = S1) =>
  createChargeCallAndUpdateStatus(syndicates[syndicateId].tenantId, {
    syndicateId,
    lotId,
    period,
    amount,
    currency: 'XOF',
    dueDate: d('2026-03-05')
  });

function pay(amount: number, paidAt: string, extra: Partial<LotPaymentInput> = {}): LotPaymentInput {
  return {
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId: L1,
    amount,
    paidAt: d(paidAt),
    method: 'VIREMENT',
    reference: null,
    actorUserId: 'user-1',
    ...extra
  };
}

const accountId = (tenantId: string, syndicateId: string, number: string) =>
  mockPrisma.chartOfAccount.rows.find(
    row => row.tenantId === tenantId && row.syndicateId === syndicateId && row.accountNumber === number
  )?.id;
const linesOf = (accountNumber: string, tenantId = TENANT_A, syndicateId = S1) =>
  mockPrisma.journalEntryLine.rows.filter(line => line.accountId === accountId(tenantId, syndicateId, accountNumber));
const sum = (rows: any[], field: 'debit' | 'credit') => rows.reduce((total, row) => total + Number(row[field]), 0);
const balance = (accountNumber: string, tenantId = TENANT_A, syndicateId = S1) => {
  const lines = linesOf(accountNumber, tenantId, syndicateId);
  return sum(lines, 'debit') - sum(lines, 'credit');
};
const entryLines = (entryId: string) => mockPrisma.journalEntryLine.rows.filter(line => line.entryId === entryId);

beforeEach(seed);

describe('encaissement d un appel de charges — ecriture de la copropriete', () => {
  it('appel de 100 000 encaisse en 60 000 puis 40 000 : 2 ecritures equilibrees, banque 100 000, lot a 0', async () => {
    await createCall(L1, '2026-03', 100000);

    await recordLotPayment(pay(60000, '2026-03-10', { reference: 'VIR-1' }));
    await recordLotPayment(pay(40000, '2026-03-20'));

    const entries = mockPrisma.journalEntry.rows;
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map(entry => entry.reference)).size).toBe(2);
    expect(entries.every(entry => entry.sourceType === 'CHARGE_PAYMENT' && entry.isLocked)).toBe(true);
    for (const entry of entries) {
      const lines = entryLines(entry.id);
      expect(lines).toHaveLength(2);
      expect(sum(lines, 'debit')).toBe(sum(lines, 'credit'));
    }
    expect(entries.map(entry => sum(entryLines(entry.id), 'debit'))).toEqual([60000, 40000]);

    // Banque : 100 000 au debit. Coproprietaires : 100 000 au credit, ligne du lot.
    expect(balance('521')).toBe(100000);
    expect(balance('450')).toBe(-100000);
    expect(linesOf('450').every(line => line.lotId === L1)).toBe(true);
    // Journal : somme des debits = somme des credits.
    expect(sum(mockPrisma.journalEntryLine.rows, 'debit')).toBe(sum(mockPrisma.journalEntryLine.rows, 'credit'));
    // Solde du lot : appel de 100 000 entierement regle.
    const account = mockPrisma.ownerAccount.rows.find(row => row.lotId === L1);
    expect(Number(account?.balance)).toBe(0);
    // Journal bancaire et comptes crees une seule fois.
    expect(mockPrisma.accountingJournal.rows.map(row => row.code)).toEqual(['BQ']);
    expect(mockPrisma.chartOfAccount.rows.map(row => row.accountNumber).sort()).toEqual(['450', '521']);
  });

  it('une avance imputee plus tard n ecrit rien : l argent n est arrive qu une fois', async () => {
    await recordLotPayment(pay(5000, '2026-03-01'));
    expect(mockPrisma.journalEntry.rows).toHaveLength(1);

    await createCall(L1, '2026-04', 5000);

    expect(mockPrisma.journalEntry.rows).toHaveLength(1);
    expect(balance('521')).toBe(5000);
  });

  it('idempotent : un meme paiement ne produit jamais deux ecritures', async () => {
    await createCall(L1, '2026-03', 10000);
    const recorded = await recordLotPayment(pay(10000, '2026-03-10'));
    const paymentId = recorded.payment.id as string;

    const again = await mockPrisma.$transaction((tx: any) =>
      postChargePaymentEntryTx(tx, {
        tenantId: TENANT_A,
        syndicateId: S1,
        lotId: L1,
        paymentId,
        amount: 10000,
        paidAt: d('2026-03-10')
      })
    );

    expect(mockPrisma.journalEntry.rows).toHaveLength(1);
    expect(again).toBe(mockPrisma.journalEntry.rows[0].id);
    expect(mockPrisma.journalEntry.rows[0].reference).toBe(chargePaymentEntryReference(paymentId));
  });

  it('annulation : contre-passation equilibree qui garde le lot, sans effet la seconde fois', async () => {
    await createCall(L1, '2026-03', 10000);
    const recorded = await recordLotPayment(pay(10000, '2026-03-10'));
    const paymentId = recorded.payment.id as string;
    const cancel = () =>
      mockPrisma.$transaction((tx: any) =>
        reverseChargePaymentEntryTx(tx, {
          tenantId: TENANT_A,
          paymentId,
          date: d('2026-03-12'),
          reason: 'cheque impaye'
        })
      );

    const reversalId = await cancel();

    expect(reversalId).toBeTruthy();
    expect(mockPrisma.journalEntry.rows).toHaveLength(2);
    expect(mockPrisma.journalEntry.rows[0].voidedByEntryId).toBe(reversalId);
    expect(balance('521')).toBe(0);
    expect(balance('450')).toBe(0);
    expect(linesOf('450').every(line => line.lotId === L1)).toBe(true);
    expect(await cancel()).toBeNull();
    expect(mockPrisma.journalEntry.rows).toHaveLength(2);
  });

  it('un reglement en especes passe par la caisse (571, journal CAI)', async () => {
    await createCall(L1, '2026-03', 10000);
    await recordLotPayment(pay(10000, '2026-03-10', { method: 'ESPECES' }));

    expect(balance('571')).toBe(10000);
    expect(balance('521')).toBe(0);
    expect(mockPrisma.accountingJournal.rows.map(row => row.code)).toEqual(['CAI']);
    expect(isCashMethod('Espèces')).toBe(true);
    expect(isCashMethod('VIREMENT')).toBe(false);
  });

  it('exercice clos : refuse l ecriture (409) et n ecrit rien de comptable', async () => {
    await createCall(L1, '2026-03', 10000);
    mockPrisma.syndicateBudget.rows.push({ id: id(90), syndicateId: S1, fiscalYear: 2026, status: 'CLOSED' });

    await expect(recordLotPayment(pay(10000, '2026-03-10'))).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.journalEntry.rows).toHaveLength(0);
  });

  it('isolation : chaque agence a ses propres comptes, journaux et ecritures', async () => {
    await createCall(L1, '2026-03', 10000);
    await createCall(LB, '2026-03', 7000, SB);

    await recordLotPayment(pay(10000, '2026-03-10'));
    await recordLotPayment(pay(7000, '2026-03-11', { tenantId: TENANT_B, syndicateId: SB, lotId: LB }));

    expect(balance('521', TENANT_A, S1)).toBe(10000);
    expect(balance('521', TENANT_B, SB)).toBe(7000);
    expect(accountId(TENANT_A, S1, '521')).not.toBe(accountId(TENANT_B, SB, '521'));
    expect(mockPrisma.journalEntry.rows.filter(entry => entry.tenantId === TENANT_A)).toHaveLength(1);
    expect(mockPrisma.journalEntry.rows.filter(entry => entry.tenantId === TENANT_B)).toHaveLength(1);
    expect(linesOf('450', TENANT_B, SB).every(line => line.lotId === LB)).toBe(true);
  });
});

describe('encaissement en ligne — compte 5525 et champs de paiement (spec 042)', () => {
  const online = (extra: Partial<LotPaymentInput> = {}) =>
    pay(10000, '2026-03-10', {
      method: 'MOBILE_MONEY',
      reference: 'IMS-ABCDEF',
      actorUserId: undefined,
      idempotencyKey: 'IMS-ABCDEF',
      providerTransactionId: 'TX-1',
      origin: 'ONLINE',
      treasuryAccountNumber: '5525',
      ...extra
    });

  it('debite le 5525 (journal banque), cree a la demande, avec le libelle du lot et du code', async () => {
    await createCall(L1, '2026-03', 10000);

    const recorded = await recordLotPayment(online());

    expect(balance('5525')).toBe(10000);
    expect(balance('521')).toBe(0);
    expect(balance('450')).toBe(-10000);
    expect(mockPrisma.accountingJournal.rows.map(row => row.code)).toEqual(['BQ']);
    const account = mockPrisma.chartOfAccount.rows.find(row => row.accountNumber === '5525');
    expect(account).toMatchObject({
      accountName: 'PaySecureHub (mobile money)',
      accountClass: 5,
      accountType: 'ASSET'
    });
    const entry = mockPrisma.journalEntry.rows[0];
    expect(entry.description).toContain('lot A-01');
    expect(entry.description).toContain('(IMS-ABCDEF)');
    expect(recorded.payment.id).toBeTruthy();
  });

  it('ecrit cle d idempotence, transaction fournisseur, provenance, et createdById nul sans acteur', async () => {
    await createCall(L1, '2026-03', 10000);

    await recordLotPayment(online());

    expect(mockPrisma.chargePayment.rows[0]).toMatchObject({
      idempotencyKey: 'IMS-ABCDEF',
      providerTransactionId: 'TX-1',
      origin: 'ONLINE',
      createdById: null
    });
  });

  it('sans ces champs, le comportement est inchange (521, aucune cle, provenance par defaut)', async () => {
    await createCall(L1, '2026-03', 10000);

    await recordLotPayment(pay(10000, '2026-03-10'));

    expect(balance('521')).toBe(10000);
    expect(mockPrisma.chartOfAccount.rows.some(row => row.accountNumber === '5525')).toBe(false);
    const payment = mockPrisma.chargePayment.rows[0];
    expect(payment.idempotencyKey).toBeUndefined();
    expect(payment.providerTransactionId).toBeUndefined();
    expect(payment.origin).toBeUndefined();
  });

  it('un acteur facultatif : le compte explicite l emporte sur method=ESPECES', async () => {
    await createCall(L1, '2026-03', 10000);

    await recordLotPayment(online({ method: 'ESPECES' }));

    expect(balance('5525')).toBe(10000);
    expect(balance('571')).toBe(0);
  });

  it('exercice clos : ConflictError 409 reconnaissable, rien d ecrit', async () => {
    await createCall(L1, '2026-03', 10000);
    mockPrisma.syndicateBudget.rows.push({ id: id(90), syndicateId: S1, fiscalYear: 2026, status: 'CLOSED' });

    await expect(recordLotPayment(online())).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.journalEntry.rows).toHaveLength(0);
  });
});

describe('encaissement declare — sous-compte 5521x (spec 047)', () => {
  const declared = (extra: Partial<LotPaymentInput> = {}) =>
    pay(10000, '2026-03-10', {
      method: 'MOBILE_MONEY',
      reference: 'MP260310ABC',
      actorUserId: 'user-1',
      idempotencyKey: 'DECL-line-1',
      origin: 'DECLARED',
      treasuryAccountNumber: '55211',
      ...extra
    });
  const addReceivingAccount = (number: string, syndicateId = S1, tenantId = TENANT_A) =>
    mockPrisma.chartOfAccount.rows.push({
      id: id(500 + Number(number.slice(-1))),
      tenantId,
      syndicateId,
      scope: 'SYNDICATE',
      accountNumber: number,
      accountName: 'Orange Money 07 •• •• •• 12',
      accountClass: 5,
      accountType: 'ASSET'
    });

  it('debite le 5521x, credite le 450 du lot, journal banque, libelle « (mobile money REF) »', async () => {
    await createCall(L1, '2026-03', 10000);
    addReceivingAccount('55211');

    const recorded = await recordLotPayment(declared());

    expect(recorded.payment.id).toBeTruthy();
    expect(balance('55211')).toBe(10000);
    expect(balance('450')).toBe(-10000);
    expect(balance('521')).toBe(0);
    expect(linesOf('450').every(line => line.lotId === L1)).toBe(true);
    expect(mockPrisma.accountingJournal.rows.map(row => row.code)).toEqual(['BQ']);
    const entry = mockPrisma.journalEntry.rows[0];
    expect(entry.description).toBe('Encaissement appel de charges - lot A-01 (mobile money MP260310ABC)');
    expect(entryLines(entry.id)).toHaveLength(2);
    expect(mockPrisma.chargePayment.rows[0]).toMatchObject({
      origin: 'DECLARED',
      method: 'MOBILE_MONEY',
      reference: 'MP260310ABC',
      idempotencyKey: 'DECL-line-1'
    });
    // Le sous-compte n'est jamais cree par l'encaissement.
    expect(mockPrisma.chartOfAccount.rows.filter(row => row.accountNumber === '55211')).toHaveLength(1);
  });

  it('un 5521x l emporte sur method=ESPECES : jamais la caisse', async () => {
    await createCall(L1, '2026-03', 10000);
    addReceivingAccount('55211');

    await recordLotPayment(declared({ method: 'ESPECES' }));

    expect(balance('55211')).toBe(10000);
    expect(balance('571')).toBe(0);
    expect(mockPrisma.accountingJournal.rows.map(row => row.code)).toEqual(['BQ']);
  });

  it('sans reference, le libelle reste « (mobile money) »', async () => {
    await createCall(L1, '2026-03', 10000);
    addReceivingAccount('55211');

    await recordLotPayment(declared({ reference: null }));

    expect(mockPrisma.journalEntry.rows[0].description).toBe('Encaissement appel de charges - lot A-01 (mobile money)');
  });

  it('compte absent de la copropriete (ou d une autre) : NotFoundError 404, rien d ecrit', async () => {
    await createCall(L1, '2026-03', 10000);
    addReceivingAccount('55211', SB, TENANT_B);

    await expect(recordLotPayment(declared())).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.journalEntry.rows).toHaveLength(0);
    expect(mockPrisma.chartOfAccount.rows.some(row => row.syndicateId === S1 && row.accountNumber === '55211')).toBe(
      false
    );
  });

  it('exercice clos : toujours refuse (409) pour un 5521x', async () => {
    await createCall(L1, '2026-03', 10000);
    addReceivingAccount('55211');
    mockPrisma.syndicateBudget.rows.push({ id: id(90), syndicateId: S1, fiscalYear: 2026, status: 'CLOSED' });

    await expect(recordLotPayment(declared())).rejects.toBeInstanceOf(ConflictError);
    expect(mockPrisma.journalEntry.rows).toHaveLength(0);
  });

  it('idempotent : une seconde ecriture du meme paiement renvoie la premiere', async () => {
    await createCall(L1, '2026-03', 10000);
    addReceivingAccount('55211');
    const recorded = await recordLotPayment(declared());

    const again = await mockPrisma.$transaction((tx: any) =>
      postChargePaymentEntryTx(tx, {
        tenantId: TENANT_A,
        syndicateId: S1,
        lotId: L1,
        paymentId: recorded.payment.id as string,
        amount: 10000,
        paidAt: d('2026-03-10'),
        treasuryAccountNumber: '55211'
      })
    );

    expect(mockPrisma.journalEntry.rows).toHaveLength(1);
    expect(again).toBe(mockPrisma.journalEntry.rows[0].id);
  });

  it('521, 571 et 5525 restent inchanges : libelle « (REF) » sans mention mobile money', async () => {
    await createCall(L1, '2026-03', 30000);
    await recordLotPayment(pay(10000, '2026-03-10', { reference: 'VIR-9' }));
    await recordLotPayment(pay(10000, '2026-03-11', { method: 'ESPECES', reference: 'REC-1' }));
    await recordLotPayment(
      pay(10000, '2026-03-12', { method: 'MOBILE_MONEY', reference: 'IMS-1', treasuryAccountNumber: '5525' })
    );

    expect(balance('521')).toBe(10000);
    expect(balance('571')).toBe(10000);
    expect(balance('5525')).toBe(10000);
    const labels = mockPrisma.journalEntry.rows.map(entry => entry.description);
    expect(labels).toEqual([
      'Encaissement appel de charges - lot A-01 (VIR-9)',
      'Encaissement appel de charges - lot A-01 (REC-1)',
      'Encaissement appel de charges - lot A-01 (IMS-1)'
    ]);
  });
});
