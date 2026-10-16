/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042 - reversements du compte de collecte PaySecureHub (5525 -> 521).
 *
 *   Agence A - copropriete S1 : lot L1.
 *   Agence B - copropriete SB.
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

import { recordLotPayment } from '../../src/lib/syndics/charge-allocation';
import { reverseSyndicEntryTx } from '../../src/lib/syndics/provider-invoice-accounting';
import {
  getCollectionBalance,
  listGatewayPayouts,
  normalizePayoutReference,
  recordGatewayPayout
} from '../../src/lib/syndics/online-payment/payout';
import { createChargeCallAndUpdateStatus } from '../../src/lib/syndics/queries';
import { BadRequestError, ConflictError, ErrorCode, NotFoundError } from '../../src/middleware/error-middleware';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(2);
const L1 = id(11);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

function seed() {
  mockPrisma.reset();
  mockPrisma.syndicate.rows.push(
    { id: S1, tenantId: TENANT_A, name: 'Residence A', status: 'ACTIVE' },
    { id: SB, tenantId: TENANT_B, name: 'Residence B', status: 'ACTIVE' }
  );
  const awa = { id: 'contact-awa', firstName: 'Awa', lastName: 'Kone', legalName: null, email: null };
  mockPrisma.syndicateLot.rows.push({
    id: L1,
    syndicateId: S1,
    lotNumber: 'A-01',
    ownerContactId: awa.id,
    coownerId: awa.id,
    owner: awa,
    coowner: awa,
    syndicate: { tenantId: TENANT_A }
  });
}

function linkOnCreate(model: any, augment: (row: any) => void) {
  const original = model.create.getMockImplementation();
  model.create.mockImplementation(async (args: any) => {
    const result = await original(args);
    augment(model.rows[model.rows.length - 1]);
    return result;
  });
}
linkOnCreate(mockPrisma.chargeCall, row => {
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: TENANT_A, name: 'Residence A' };
});
linkOnCreate(mockPrisma.chargePayment, row => {
  const lot = mockPrisma.syndicateLot.rows.find(candidate => candidate.id === row.lotId);
  row.lot = { syndicateId: lot?.syndicateId, syndicate: lot?.syndicate };
});

/** Encaisse `amount` sur le 5525 (appel de meme montant, paiement en ligne). */
async function collect(amount: number, paidAt = '2026-03-10', key = `IMS-${amount}`) {
  await createChargeCallAndUpdateStatus(TENANT_A, {
    syndicateId: S1,
    lotId: L1,
    period: `P-${key}`,
    amount,
    currency: 'XOF',
    dueDate: d('2026-03-05')
  });
  await recordLotPayment({
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId: L1,
    amount,
    paidAt: d(paidAt),
    method: 'MOBILE_MONEY',
    reference: key,
    idempotencyKey: key,
    origin: 'ONLINE',
    treasuryAccountNumber: '5525'
  });
}

const payout = (extra: Partial<Parameters<typeof recordGatewayPayout>[0]> = {}) =>
  recordGatewayPayout({
    tenantId: TENANT_A,
    syndicateId: S1,
    amount: 30000,
    date: d('2026-03-20'),
    reference: ' vir-001 ',
    note: 'Virement de mars',
    actorUserId: 'user-1',
    ...extra
  });

const cancel = (entryId: string) =>
  mockPrisma.$transaction((tx: any) =>
    reverseSyndicEntryTx(tx, {
      tenantId: TENANT_A,
      entryId,
      date: d('2026-03-25'),
      description: 'annulation',
      documentType: 'SYNDIC_GATEWAY_PAYOUT_CANCEL'
    })
  );

const accountId = (number: string, tenantId = TENANT_A, syndicateId = S1) =>
  mockPrisma.chartOfAccount.rows.find(
    row => row.tenantId === tenantId && row.syndicateId === syndicateId && row.accountNumber === number
  )?.id;
const balanceOf = (number: string) =>
  mockPrisma.journalEntryLine.rows
    .filter(line => line.accountId === accountId(number))
    .reduce((total, line) => total + Number(line.debit) - Number(line.credit), 0);
const payoutEntries = () => mockPrisma.journalEntry.rows.filter(row => row.documentType === 'SYNDIC_GATEWAY_PAYOUT');

beforeEach(seed);

describe('getCollectionBalance', () => {
  it('vaut 0 sans compte 5525 et ne cree rien', async () => {
    expect(await getCollectionBalance(mockPrisma as any, TENANT_A, S1)).toBe(0);
    expect(mockPrisma.chartOfAccount.rows).toHaveLength(0);
  });

  it('suit les encaissements en ligne et les reversements', async () => {
    await collect(50000);
    expect(await getCollectionBalance(mockPrisma as any, TENANT_A, S1)).toBe(50000);
    await payout();
    expect(await getCollectionBalance(mockPrisma as any, TENANT_A, S1)).toBe(20000);
  });

  it('repond 404 pour une copropriete d une autre agence', async () => {
    await expect(getCollectionBalance(mockPrisma as any, TENANT_B, S1)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('recordGatewayPayout', () => {
  it('ecrit debit 521 / credit 5525 equilibre, journal banque, reference normalisee', async () => {
    await collect(50000);

    const result = await payout();

    expect(result).toMatchObject({
      reference: 'VIR-001',
      amount: 30000,
      date: '2026-03-20',
      collectionBalanceAfter: 20000
    });
    const entry = payoutEntries()[0];
    expect(entry.id).toBe(result.entryId);
    expect(entry.isLocked).toBe(true);
    const lines = mockPrisma.journalEntryLine.rows.filter(line => line.entryId === entry.id);
    expect(lines).toHaveLength(2);
    expect(lines.find(line => line.accountId === accountId('521'))).toMatchObject({ debit: 30000, credit: 0 });
    expect(lines.find(line => line.accountId === accountId('5525'))).toMatchObject({ debit: 0, credit: 30000 });
    expect(balanceOf('521')).toBe(30000);
    expect(balanceOf('5525')).toBe(20000);
    expect(mockPrisma.accountingJournal.rows.map(row => row.code)).toEqual(['BQ']);
  });

  it('refuse un montant superieur au solde du 5525 (PAYOUT_EXCEEDS_COLLECTED, 400)', async () => {
    await collect(10000);

    await expect(payout({ amount: 10000.01 })).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCode.PAYOUT_EXCEEDS_COLLECTED
    });
    expect(payoutEntries()).toHaveLength(0);
  });

  it('refuse tout reversement sans encaissement et ne cree aucun compte', async () => {
    await expect(payout()).rejects.toMatchObject({ code: ErrorCode.PAYOUT_EXCEEDS_COLLECTED });
    expect(mockPrisma.chartOfAccount.rows).toHaveLength(0);
  });

  it('accepte exactement le solde', async () => {
    await collect(10000);
    const result = await payout({ amount: 10000 });
    expect(result.collectionBalanceAfter).toBe(0);
  });

  it('refuse une reference deja utilisee, quelle que soit la casse (PAYOUT_DUPLICATE, 409)', async () => {
    await collect(50000);
    await payout({ amount: 10000, reference: 'VIR-001' });

    await expect(payout({ amount: 5000, reference: 'vir-001' })).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.PAYOUT_DUPLICATE
    });
    expect(await getCollectionBalance(mockPrisma as any, TENANT_A, S1)).toBe(40000);
  });

  it('un reversement annule libere sa reference', async () => {
    await collect(50000);
    const first = await payout({ amount: 10000, reference: 'VIR-001' });
    await cancel(first.entryId);

    expect(await getCollectionBalance(mockPrisma as any, TENANT_A, S1)).toBe(50000);
    await expect(payout({ amount: 10000, reference: 'VIR-001' })).resolves.toMatchObject({ amount: 10000 });
  });

  it('la reference est propre a la copropriete : l autre agence est jugee sur son propre solde', async () => {
    await collect(50000);
    await payout({ reference: 'VIR-001', amount: 10000 });

    await expect(payout({ tenantId: TENANT_B, syndicateId: SB, reference: 'VIR-001' })).rejects.toMatchObject({
      code: ErrorCode.PAYOUT_EXCEEDS_COLLECTED
    });
  });

  it('exercice clos : ConflictError, rien d ecrit', async () => {
    await collect(50000);
    mockPrisma.syndicateBudget.rows.push({ id: id(90), syndicateId: S1, fiscalYear: 2026, status: 'CLOSED' });

    await expect(payout()).rejects.toBeInstanceOf(ConflictError);
    expect(payoutEntries()).toHaveLength(0);
  });

  it('valide montant, reference et note (400)', async () => {
    await collect(50000);
    await expect(payout({ amount: 0 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(payout({ amount: -5 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(payout({ reference: '   ' })).rejects.toBeInstanceOf(BadRequestError);
    await expect(payout({ reference: 'x'.repeat(121) })).rejects.toBeInstanceOf(BadRequestError);
    await expect(payout({ note: 'n'.repeat(251) })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('isolation : une copropriete d une autre agence repond 404', async () => {
    await collect(50000);
    await expect(payout({ tenantId: TENANT_B, syndicateId: S1 })).rejects.toBeInstanceOf(NotFoundError);
    expect(payoutEntries()).toHaveLength(0);
  });
});

describe('listGatewayPayouts', () => {
  it('liste du plus recent au plus ancien, avec note, sans les reversements annules', async () => {
    await collect(90000);
    await payout({ amount: 10000, reference: 'A-1', date: d('2026-03-10'), note: null });
    const second = await payout({ amount: 20000, reference: 'B-2', date: d('2026-03-15'), note: 'Mars | partie 2' });
    const third = await payout({ amount: 5000, reference: 'C-3', date: d('2026-03-12') });
    await cancel(third.entryId);

    const { items } = await listGatewayPayouts(TENANT_A, S1);

    expect(items.map(item => item.reference)).toEqual(['B-2', 'A-1']);
    expect(items[0]).toMatchObject({
      entryId: second.entryId,
      amount: 20000,
      date: '2026-03-15',
      note: 'Mars | partie 2'
    });
    expect(items[1].note).toBeNull();
  });

  it('ne montre rien d une autre copropriete et repond 404 hors agence', async () => {
    await collect(50000);
    await payout({ amount: 1000 });

    await expect(listGatewayPayouts(TENANT_B, S1)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listGatewayPayouts(TENANT_B, SB)).items).toEqual([]);
  });

  it('accepte une limite hors bornes sans erreur', async () => {
    expect((await listGatewayPayouts(TENANT_A, S1, { limit: 9999 })).items).toEqual([]);
  });
});

describe('normalizePayoutReference', () => {
  it('rogne et met en majuscules', () => {
    expect(normalizePayoutReference('  vir-2026/01 ')).toBe('VIR-2026/01');
  });
});
