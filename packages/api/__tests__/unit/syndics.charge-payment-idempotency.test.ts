/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Audit 2026-10 : idempotence d'un paiement manuel de charges. Une cle fournie
 * par le client (corps ou en-tete `Idempotency-Key`) est stockee scopee par
 * agence ; un rejeu du meme lot renvoie le paiement deja enregistre, une cle
 * prise par un autre lot repond 409, une course (P2002) se resout de la meme facon.
 */

import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
(mockPrisma as any).syndicPaymentDeclaration = { findMany: jest.fn(async () => []) };
(mockPrisma as any).paymentSchedule = { findMany: jest.fn(async () => []) };
(mockPrisma as any).reminderConfig = { findMany: jest.fn(async () => []) };
(mockPrisma as any).syndicDeclaredPaymentSettings = { findFirst: jest.fn(async () => null) };

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
import { lotPaymentSchema } from '../../src/lib/syndics/charge-allocation-schemas';
import { createChargeCallAndUpdateStatus } from '../../src/lib/syndics/queries';
import { recordLotPaymentHandler } from '../../src/controllers/syndic-lot-payments-controller';
import { ConflictError } from '../../src/middleware/error-middleware';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(2);
const L1 = id(11);
const L2 = id(12);
const LB = id(13);
const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const KEY = 'client-key-0001';

const syndicates: Record<string, { tenantId: string; name: string }> = {
  [S1]: { tenantId: TENANT_A, name: 'Residence A' },
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

function lotRow(lotId: string, syndicateId: string, lotNumber: string) {
  const owner = {
    id: `contact-${lotNumber}`,
    firstName: 'Awa',
    lastName: 'Kone',
    legalName: null,
    email: 'awa@example.test'
  };
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

linkOnCreate(mockPrisma.chargeCall, row => {
  row.status = row.status ?? 'PENDING';
  row.syndicate = { tenantId: syndicates[row.syndicateId].tenantId, name: syndicates[row.syndicateId].name };
});
linkOnCreate(mockPrisma.chargePayment, row => {
  const lot = mockPrisma.syndicateLot.rows.find(candidate => candidate.id === row.lotId);
  row.lot = { syndicateId: lot?.syndicateId, syndicate: lot?.syndicate };
});

beforeEach(() => {
  mockPrisma.reset();
  for (const [syndicId, info] of Object.entries(syndicates)) {
    mockPrisma.syndicate.rows.push({ id: syndicId, tenantId: info.tenantId, name: info.name, status: 'ACTIVE' });
  }
  mockPrisma.syndicateLot.rows.push(lotRow(L1, S1, 'A-01'), lotRow(L2, S1, 'A-02'), lotRow(LB, SB, 'B-01'));
});

const createCall = (lotId: string, period: string, amount: number, syndicateId = S1) =>
  createChargeCallAndUpdateStatus(syndicates[syndicateId].tenantId, {
    syndicateId,
    lotId,
    period,
    amount,
    currency: 'XOF',
    dueDate: d('2026-01-05')
  });

function pay(lotId: string, extra: Partial<LotPaymentInput> = {}): LotPaymentInput {
  return {
    tenantId: TENANT_A,
    syndicateId: S1,
    lotId,
    amount: 4000,
    paidAt: d('2026-01-10'),
    method: 'VIREMENT',
    reference: null,
    actorUserId: 'user-1',
    clientIdempotencyKey: KEY,
    ...extra
  };
}

const p2002 = (target: string) =>
  Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: [target] } });

describe('recordLotPayment - cle d idempotence client', () => {
  it('(a) la meme cle sur le meme lot ne cree qu un paiement et renvoie le paiement existant', async () => {
    const call = await createCall(L1, '2026-01', 10000);

    const first = await recordLotPayment(pay(L1));
    const second = await recordLotPayment(pay(L1));

    expect(first.replayed).toBeUndefined();
    expect(second.replayed).toBe(true);
    expect(mockPrisma.chargePayment.rows).toHaveLength(1);
    expect(mockPrisma.chargePaymentAllocation.rows).toHaveLength(1);
    expect(mockPrisma.ownerAccountTransaction.rows.filter(row => row.type === 'PAYMENT')).toHaveLength(1);
    expect(second.payment).toMatchObject({ id: first.payment.id, lotId: L1, amount: 4000, chargeCallId: call.id });
    expect(second.allocations.map(a => [a.chargeCallId, a.amount, a.source])).toEqual(
      first.allocations.map(a => [a.chargeCallId, a.amount, a.source])
    );
    expect(second.documents.map(doc => doc.id)).toEqual(first.documents.map(doc => doc.id));
  });

  it('stocke la cle scopee par agence, jamais la cle brute', async () => {
    await recordLotPayment(pay(L1));
    expect(mockPrisma.chargePayment.rows[0].idempotencyKey).toBe(`${TENANT_A}:${KEY}`);
  });

  it('sans cle, deux paiements identiques restent deux paiements (comportement inchange)', async () => {
    await recordLotPayment(pay(L1, { clientIdempotencyKey: undefined }));
    await recordLotPayment(pay(L1, { clientIdempotencyKey: undefined }));
    expect(mockPrisma.chargePayment.rows).toHaveLength(2);
  });

  it('(b) une cle deja utilisee sur un autre lot repond 409 sans rien ecrire', async () => {
    await recordLotPayment(pay(L1));
    const error = await recordLotPayment(pay(L2)).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.statusCode).toBe(409);
    expect(mockPrisma.chargePayment.rows).toHaveLength(1);
  });

  it('(c) deux agences avec la meme cle client ne se heurtent pas', async () => {
    await recordLotPayment(pay(L1));
    const other = await recordLotPayment(pay(LB, { tenantId: TENANT_B, syndicateId: SB }));
    expect(other.replayed).toBeUndefined();
    expect(mockPrisma.chargePayment.rows.map(row => row.idempotencyKey).sort()).toEqual([
      `${TENANT_A}:${KEY}`,
      `${TENANT_B}:${KEY}`
    ]);
  });

  it('(d) une course (P2002 sur idempotency_key) rejoue le paiement gagnant', async () => {
    await createCall(L1, '2026-01', 10000);
    const winner = await recordLotPayment(pay(L1));
    // Notre lecture prealable ne voit rien, puis l ecriture se heurte a la ligne de l autre requete.
    mockPrisma.chargePayment.findFirst.mockImplementationOnce(async () => null);
    mockPrisma.chargePayment.create.mockImplementationOnce(async () => {
      throw p2002('idempotency_key');
    });

    const raced = await recordLotPayment(pay(L1));

    expect(raced.replayed).toBe(true);
    expect(raced.payment.id).toBe(winner.payment.id);
    expect(mockPrisma.chargePayment.rows).toHaveLength(1);
  });

  it('(d) une course contre un paiement d un autre lot repond 409', async () => {
    await recordLotPayment(pay(L1));
    mockPrisma.chargePayment.findFirst.mockImplementationOnce(async () => null);
    mockPrisma.chargePayment.create.mockImplementationOnce(async () => {
      throw p2002('idempotency_key');
    });
    await expect(recordLotPayment(pay(L2))).rejects.toBeInstanceOf(ConflictError);
  });

  it('un autre P2002 (cle absente en base) est propage tel quel', async () => {
    mockPrisma.chargePayment.create.mockImplementationOnce(async () => {
      throw p2002('provider_transaction_id');
    });
    await expect(recordLotPayment(pay(L1))).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('lotPaymentSchema - idempotencyKey', () => {
  const base = { amount: 100, paidAt: '2026-01-10', method: 'VIREMENT' };

  it('(e) accepte une cle sure et la rogne', () => {
    expect(lotPaymentSchema.parse({ ...base, idempotencyKey: '  abc-123_XYZ.4:5 ' }).idempotencyKey).toBe(
      'abc-123_XYZ.4:5'
    );
    expect(lotPaymentSchema.parse(base).idempotencyKey).toBeUndefined();
  });

  it('(e) refuse une cle trop courte, trop longue ou aux caracteres exotiques', () => {
    for (const idempotencyKey of ['short', 'a'.repeat(101), 'avec espace ici', 'clef/slash/01', 'cle-accentuee-é']) {
      expect(lotPaymentSchema.safeParse({ ...base, idempotencyKey }).success).toBe(false);
    }
  });
});

describe('recordLotPaymentHandler - 200 / 201 et en-tete Idempotency-Key', () => {
  const makeReq = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    ({
      params: { tenantId: TENANT_A, syndicId: S1, lotId: L1 },
      body: { amount: 100, paidAt: '2026-01-10', method: 'VIREMENT', ...body },
      user: { userId: 'user-1' },
      header: (name: string) => headers[name]
    }) as any;
  const run = async (req: any) => {
    const res: any = {};
    res.status = jest.fn(() => res);
    await new Promise<void>((resolve, reject) => {
      res.json = jest.fn(() => {
        resolve();
        return res;
      });
      recordLotPaymentHandler(req, res, (error: unknown) => (error ? reject(error) : resolve()));
    });
    return res;
  };

  it('(f) 201 a la creation puis 200 au rejeu, cle lue dans l en-tete', async () => {
    const first = await run(makeReq({}, { 'Idempotency-Key': 'header-key-001' }));
    const second = await run(makeReq({}, { 'Idempotency-Key': 'header-key-001' }));
    expect(first.status).toHaveBeenCalledWith(201);
    expect(second.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.chargePayment.rows).toHaveLength(1);
    expect(mockPrisma.chargePayment.rows[0].idempotencyKey).toBe(`${TENANT_A}:header-key-001`);
  });

  it('(f) la cle du corps l emporte sur l en-tete', async () => {
    await run(makeReq({ idempotencyKey: 'body-key-0001' }, { 'Idempotency-Key': 'header-key-001' }));
    expect(mockPrisma.chargePayment.rows[0].idempotencyKey).toBe(`${TENANT_A}:body-key-0001`);
  });

  it('(f) un en-tete invalide est refuse avant toute ecriture', async () => {
    await expect(run(makeReq({}, { 'Idempotency-Key': 'court' }))).rejects.toBeDefined();
    expect(mockPrisma.chargePayment.rows).toHaveLength(0);
  });
});
