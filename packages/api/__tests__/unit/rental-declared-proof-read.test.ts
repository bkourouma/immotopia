/* eslint-disable @typescript-eslint/no-explicit-any */
/** Contrat 049 §1.5 : lecture IA de la capture (désactivée, quota, panne = UNREADABLE). */
type Row = Record<string, any>;

const state = {
  settings: { enabled: true, ai_prefill_enabled: true } as Row | null,
  tenantReads: 0,
  contactReads: 0,
  configured: true,
  analyze: jest.fn()
};

const mockPrisma: Row = {
  rentalDeclaredPaymentSettings: { findFirst: jest.fn(async () => state.settings) },
  rentalPaymentProofRead: {
    count: jest.fn(async ({ where }: Row) => (where.renter_client_id ? state.contactReads : state.tenantReads)),
    create: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 1 })),
    deleteMany: jest.fn(async () => ({ count: 1 }))
  },
  rentalReceivingNumber: { findMany: jest.fn(async () => [{ id: 'num-1', phone: '+2250700000001' }]) },
  rentalPaymentDeclaration: { findFirst: jest.fn(async () => null) },
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(async (fn: any) => fn(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/lib/payment-proof/vision', () => ({
  getPaymentProofVisionProvider: () => ({ id: 'fake', model: 'fake', analyze: (...a: any[]) => state.analyze(...a) }),
  isPaymentProofVisionConfigured: () => state.configured
}));
jest.mock('../../src/lib/rental/declared-payment/proof-files', () => ({
  prepareProofFile: jest.fn(() => ({
    buffer: Buffer.from('img'),
    mimeType: 'image/jpeg',
    sha256: 'h',
    kind: 'jpeg',
    sizeBytes: 3
  })),
  saveTempProofRead: jest.fn(async () => ({ fileUrl: '/uploads/portal/payments/tmp/t/r.jpg', sha256: 'h' })),
  discardTempProof: jest.fn(async () => true)
}));

import { readRentalProof } from '../../src/lib/rental/declared-payment/proof-read';
import { ErrorCode } from '../../src/middleware/error-middleware';

const call = () =>
  readRentalProof({
    tenantId: 'tenant-a',
    tenantClientId: 'client-1',
    file: { buffer: Buffer.from('x'), mimetype: 'image/jpeg' }
  });

beforeEach(() => {
  jest.clearAllMocks();
  state.settings = { enabled: true, ai_prefill_enabled: true };
  state.tenantReads = 0;
  state.contactReads = 0;
  state.configured = true;
  state.analyze.mockResolvedValue({
    ok: true,
    provider: 'fake',
    model: 'fake',
    latencyMs: 12,
    result: {
      quality: 'OK',
      operator: 'ORANGE',
      amount: 150000,
      paidAt: new Date(Date.now() - 3_600_000).toISOString(),
      transactionReference: 'cp2611.0901',
      payerPhone: '0700000009',
      recipientPhone: '0700000001',
      recipientName: null,
      confidence: { amount: 0.9, transactionReference: 0.8 }
    }
  });
});

describe('readRentalProof', () => {
  it('rend les champs lus, le numéro reconnu et la certitude de la référence', async () => {
    const out = await call();
    expect(out).toMatchObject({
      quality: 'OK',
      operator: 'ORANGE',
      amount: 150000,
      reference: 'CP2611.0901',
      matchedReceivingNumberId: 'num-1',
      warnings: []
    });
    expect(out.confidence).toMatchObject({ amount: 0.9, reference: 0.8 });
  });

  it('409 DISABLED si le réglage est coupé ou sans fournisseur', async () => {
    state.settings = { enabled: true, ai_prefill_enabled: false };
    await expect(call()).rejects.toMatchObject({ statusCode: 409, code: ErrorCode.RENTAL_PROOF_READ_DISABLED });
    state.settings = { enabled: true, ai_prefill_enabled: true };
    state.configured = false;
    await expect(call()).rejects.toMatchObject({ code: ErrorCode.RENTAL_PROOF_READ_DISABLED });
    expect(state.analyze).not.toHaveBeenCalled();
  });

  it('429 avec data.scope quand un quota mensuel est atteint', async () => {
    state.contactReads = 30;
    await expect(call()).rejects.toMatchObject({
      statusCode: 429,
      code: ErrorCode.RENTAL_PROOF_READ_QUOTA_EXCEEDED,
      data: { scope: 'CONTACT_MONTH' }
    });
    state.contactReads = 0;
    state.tenantReads = 300;
    await expect(call()).rejects.toMatchObject({ data: { scope: 'TENANT_MONTH' } });
  });

  it('une panne du fournisseur répond UNREADABLE, champs à null', async () => {
    state.analyze.mockResolvedValue({ ok: false, reason: 'ERROR', provider: 'fake', model: 'fake', latencyMs: 5 });
    const out = await call();
    expect(out).toMatchObject({ quality: 'UNREADABLE', amount: null, reference: null, confidence: {}, warnings: [] });
  });
});
