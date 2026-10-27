/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T062 : lecture IA d'une capture (`lib/syndics/declared-payment/proof-read.ts`).
 * Prisma, le fournisseur de vision et les fichiers sont simulés.
 */

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const SYNDIC = 'syndic-1';
const NOW = new Date('2026-10-17T12:00:00.000Z');

const store = {
  rules: { enabled: true, aiPrefillEnabled: true } as Row,
  reads: [] as Row[],
  readsThisMonth: 0,
  contactReadsThisMonth: 0,
  numbers: [] as Row[],
  declarations: [] as Row[]
};

const mockPrisma: Row = {
  syndicReceivingNumber: { findMany: jest.fn(async () => store.numbers) },
  syndicPaymentDeclaration: {
    findFirst: jest.fn(async ({ where }: Row) =>
      store.declarations.find(d => d.transactionReference === where.transactionReference) ? { id: 'd1' } : null
    )
  },
  syndicPaymentProofRead: {
    count: jest.fn(async ({ where }: Row) => (where.contactId ? store.contactReadsThisMonth : store.readsThisMonth)),
    create: jest.fn(async ({ data }: Row) => {
      store.reads.push({ ...data });
      return data;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const row = store.reads.find(r => r.id === where.id);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      store.reads = store.reads.filter(r => r.id !== where.id);
      return { count: 1 };
    })
  },
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(async (fn: (tx: Row) => Promise<unknown>) => fn(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

const mockFeature = jest.fn(async () => undefined);
jest.mock('../../src/lib/syndics/declared-payment/settings', () => ({
  AI_READS_MONTHLY_QUOTA: 300,
  assertSyndicFeatureForDeclared: (...args: unknown[]) => mockFeature(...(args as [])),
  getDeclaredPaymentRules: jest.fn(async () => store.rules)
}));

const mockPrepare = jest.fn();
const mockSaveTemp = jest.fn();
const mockDiscard = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/proof-files', () => ({
  prepareProofFile: (...args: unknown[]) => mockPrepare(...args),
  saveTempProofRead: (...args: unknown[]) => mockSaveTemp(...args),
  discardTempProof: (...args: unknown[]) => mockDiscard(...args)
}));

const mockAnalyze = jest.fn();
let configured = true;
jest.mock('../../src/lib/syndics/declared-payment/vision', () => ({
  getPaymentProofVisionProvider: () => ({ id: 'fake', model: 'fake-1', analyze: mockAnalyze }),
  isPaymentProofVisionConfigured: () => configured
}));

import {
  isAiPrefillOfferedToCoOwner,
  normalizePaidAt,
  readPaymentProof
} from '../../src/lib/syndics/declared-payment/proof-read';

const scope: any = {
  tenantId: TENANT,
  contactIds: ['contact-1'],
  lots: [{ lotId: 'lot-1', syndicateId: SYNDIC, contactId: 'contact-1' }],
  lotIds: ['lot-1'],
  syndicateIds: [SYNDIC]
};

const file = { buffer: Buffer.from('png') };
const okRead = (over: Row = {}) => ({
  ok: true,
  provider: 'fake',
  model: 'fake-1',
  latencyMs: 12,
  result: {
    quality: 'OK',
    operator: 'ORANGE',
    amount: 25000,
    paidAt: '2026-10-17T10:00:00',
    transactionReference: 'ci241017.1000.a12345',
    payerPhone: '07 07 07 07 07',
    recipientPhone: '01 01 01 01 01',
    recipientName: 'SYNDIC',
    confidence: { amount: 0.9, payerPhone: 0.8 },
    ...over
  }
});

const run = (over: Row = {}) => readPaymentProof({ scope, syndicateId: SYNDIC, file, now: NOW, ...over });

beforeEach(() => {
  store.rules = { enabled: true, aiPrefillEnabled: true };
  store.reads = [];
  store.readsThisMonth = 0;
  store.contactReadsThisMonth = 0;
  mockDiscard.mockReset().mockResolvedValue(true);
  store.numbers = [{ id: 'num-1', phoneNumber: '+2250101010101' }];
  store.declarations = [];
  configured = true;
  auditEvents.length = 0;
  mockFeature.mockReset().mockResolvedValue(undefined);
  mockPrepare.mockReset().mockReturnValue({ buffer: Buffer.from('png'), mimeType: 'image/png', sha256: 'sha' });
  mockSaveTemp.mockReset().mockResolvedValue({ fileUrl: '/uploads/syndics/payment-proofs/tmp/tenant-a/x.png' });
  mockAnalyze.mockReset().mockResolvedValue(okRead());
  mockPrisma.syndicPaymentProofRead.count.mockClear();
});

describe('readPaymentProof', () => {
  it('lit la capture, normalise les valeurs et reconnaît le numéro de réception', async () => {
    const reading = await run();
    expect(reading).toMatchObject({
      quality: 'OK',
      operator: 'ORANGE',
      amount: 25000,
      paidAt: '2026-10-17T10:00:00.000Z',
      transactionReference: 'CI241017.1000.A12345',
      payerPhone: '+2250707070707',
      recipientPhone: '+2250101010101',
      matchedReceivingNumberId: 'num-1',
      warnings: []
    });
    expect(reading.readId).toEqual(expect.any(String));
    expect(reading.confidence).toEqual({ amount: 0.9, payerPhone: 0.8 });
    expect(mockAnalyze).toHaveBeenCalledWith({ image: expect.any(Buffer), mimeType: 'image/png' }, expect.anything());
  });

  it('enregistre la lecture : empreinte, fournisseur, issue, capture temporaire 24 h, résultat', async () => {
    const { readId } = await run();
    expect(store.reads).toHaveLength(1);
    expect(store.reads[0]).toMatchObject({
      id: readId,
      tenantId: TENANT,
      syndicateId: SYNDIC,
      contactId: 'contact-1',
      sha256: 'sha',
      provider: 'fake',
      outcome: 'OK',
      latencyMs: 12,
      tempFileUrl: '/uploads/syndics/payment-proofs/tmp/tenant-a/x.png'
    });
    expect(store.reads[0].expiresAt).toEqual(new Date(NOW.getTime() + 24 * 3_600_000));
    expect(store.reads[0].result).toMatchObject({ amount: 25000, recipientPhone: '+2250101010101' });
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('audit sans valeur lue : noms des champs seulement', async () => {
    await run();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({ actionKey: 'SYNDIC_PAYMENT_PROOF_READ', tenantId: TENANT });
    const text = JSON.stringify(auditEvents[0]);
    for (const secret of ['25000', 'CI241017', '0707070707', '0101010101', 'SYNDIC"']) {
      expect(text).not.toContain(secret);
    }
    expect(auditEvents[0].payload.fields).toEqual(
      expect.arrayContaining(['amount', 'transactionReference', 'payerPhone'])
    );
  });

  it('bénéficiaire inconnu : avertissement R28', async () => {
    mockAnalyze.mockResolvedValue(okRead({ recipientPhone: '05 05 05 05 05' }));
    const reading = await run();
    expect(reading.warnings).toEqual(['RECIPIENT_NOT_A_RECEIVING_NUMBER']);
    expect(reading.matchedReceivingNumberId).toBeNull();
  });

  it('référence déjà déclarée : avertissement R28', async () => {
    store.declarations = [{ transactionReference: 'CI241017.1000.A12345' }];
    expect((await run()).warnings).toEqual(['REFERENCE_ALREADY_DECLARED']);
  });

  it('valeurs hors normes écartées : montant, date trop ancienne ou future, téléphone invalide', async () => {
    mockAnalyze.mockResolvedValue(
      okRead({ amount: 9_999_999, paidAt: '2025-01-01', payerPhone: '12345', transactionReference: '!!' })
    );
    expect(await run()).toMatchObject({
      quality: 'OK',
      amount: null,
      paidAt: null,
      payerPhone: null,
      transactionReference: null
    });
  });

  it('panne du fournisseur : 200 UNREADABLE, champs à null, issue FAILED, pas d’exception (R30)', async () => {
    mockAnalyze.mockResolvedValue({
      ok: false,
      reason: 'TIMEOUT',
      provider: 'fake',
      model: 'fake-1',
      latencyMs: 20000
    });
    const reading = await run();
    expect(reading).toMatchObject({ quality: 'UNREADABLE', amount: null, operator: null, warnings: [] });
    expect(store.reads[0]).toMatchObject({ outcome: 'FAILED', latencyMs: 20000 });
  });

  it('capture sans paiement : NOT_A_PAYMENT, issue enregistrée', async () => {
    mockAnalyze.mockResolvedValue(okRead({ quality: 'NOT_A_PAYMENT', amount: null }));
    expect((await run()).quality).toBe('NOT_A_PAYMENT');
    expect(store.reads[0].outcome).toBe('NOT_A_PAYMENT');
  });

  it('pose le chemin de la capture en base AVANT l’appel au modèle', async () => {
    let seenAtCall: unknown = 'jamais appelé';
    mockAnalyze.mockImplementation(async () => {
      seenAtCall = store.reads[0]?.tempFileUrl;
      return okRead();
    });
    await run();
    expect(seenAtCall).toBe('/uploads/syndics/payment-proofs/tmp/tenant-a/x.png');
    expect(store.reads[0].tempFileUrl).toBe('/uploads/syndics/payment-proofs/tmp/tenant-a/x.png');
  });

  it('erreur après l’écriture de la capture : fichier supprimé, chemin effacé en base, erreur relayée', async () => {
    mockPrisma.syndicReceivingNumber.findMany.mockRejectedValueOnce(new Error('base HS'));
    await expect(run()).rejects.toThrow('base HS');
    expect(mockDiscard).toHaveBeenCalledWith(TENANT, '/uploads/syndics/payment-proofs/tmp/tenant-a/x.png');
    expect(store.reads[0].tempFileUrl).toBeNull();
  });

  it('chemin non posé en base (échec) : fichier supprimé et lecture retirée', async () => {
    mockPrisma.syndicPaymentProofRead.updateMany.mockRejectedValueOnce(new Error('base HS'));
    await expect(run()).rejects.toThrow('base HS');
    expect(mockDiscard).toHaveBeenCalled();
    expect(store.reads).toHaveLength(0);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('plafond mensuel par contact atteint : 429 sans appel au modèle', async () => {
    store.contactReadsThisMonth = 30;
    await expect(run()).rejects.toMatchObject({ statusCode: 429, code: 'PROOF_READ_QUOTA_EXCEEDED' });
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(store.reads).toHaveLength(0);
  });

  it('le quota ne compte que les lectures qui ont appelé le modèle (hors DISABLED)', async () => {
    await run();
    for (const [args] of mockPrisma.syndicPaymentProofRead.count.mock.calls) {
      expect(args.where.outcome).toEqual({ not: 'DISABLED' });
    }
  });

  it('référence déjà déclarée : contrôle limité à la copropriété', async () => {
    store.declarations = [{ transactionReference: 'CI241017.1000.A12345' }];
    await run();
    expect(mockPrisma.syndicPaymentDeclaration.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC
    });
  });

  it('quota mensuel atteint : 429 PROOF_READ_QUOTA_EXCEEDED, le modèle n’est pas appelé', async () => {
    store.readsThisMonth = 300;
    await expect(run()).rejects.toMatchObject({ statusCode: 429, code: 'PROOF_READ_QUOTA_EXCEEDED' });
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(store.reads).toHaveLength(0);
  });

  it.each([
    [
      'aucun fournisseur',
      () => {
        configured = false;
      }
    ],
    [
      'interrupteur coupé',
      () => {
        store.rules = { enabled: true, aiPrefillEnabled: false };
      }
    ],
    [
      'paiement déclaré désactivé',
      () => {
        store.rules = { enabled: false, aiPrefillEnabled: true };
      }
    ]
  ])('%s : 409 PROOF_READ_UNAVAILABLE, rien d’écrit ni d’appelé', async (_name, setup) => {
    setup();
    await expect(run()).rejects.toMatchObject({ statusCode: 409, code: 'PROOF_READ_UNAVAILABLE' });
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(store.reads).toHaveLength(0);
  });

  it('copropriété hors périmètre : 404, comme une copropriété inconnue', async () => {
    await expect(run({ syndicateId: 'syndic-9' })).rejects.toMatchObject({ statusCode: 404 });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('droit SYNDIC refusé : l’erreur du moteur remonte', async () => {
    mockFeature.mockRejectedValue(Object.assign(new Error('no'), { statusCode: 403 }));
    await expect(run()).rejects.toMatchObject({ statusCode: 403 });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('fichier absent ou invalide : erreur de capture, pas de lecture réservée', async () => {
    await expect(run({ file: null })).rejects.toMatchObject({ statusCode: 400, code: 'DECLARATION_PROOF_INVALID' });
    mockPrepare.mockImplementation(() => {
      throw Object.assign(new Error('type'), { statusCode: 400, code: 'DECLARATION_PROOF_INVALID' });
    });
    await expect(run()).rejects.toMatchObject({ code: 'DECLARATION_PROOF_INVALID' });
    expect(store.reads).toHaveLength(0);
  });

  it('écriture de la capture temporaire en échec : la lecture réservée est retirée', async () => {
    mockSaveTemp.mockRejectedValue(new Error('disque'));
    await expect(run()).rejects.toThrow('disque');
    expect(store.reads).toHaveLength(0);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });
});

describe('normalizePaidAt', () => {
  it.each([
    ['2026-10-17T10:00:00Z', '2026-10-17T10:00:00.000Z'],
    ['2026-10-17T11:00:00+01:00', '2026-10-17T10:00:00.000Z'],
    ['2026-10-17 10:00:00', '2026-10-17T10:00:00.000Z'],
    ['2026-10-17', '2026-10-17T00:00:00.000Z']
  ])('%s', (raw, expected) => {
    expect(normalizePaidAt(raw, NOW)).toBe(expected);
  });

  it.each([null, '', 'hier', '2026-10-17T12:30:00Z', '2026-06-01T10:00:00Z'])('hors fenêtre ou illisible : %p', raw => {
    expect(normalizePaidAt(raw, NOW)).toBeNull();
  });
});

describe('isAiPrefillOfferedToCoOwner', () => {
  const base = { aiPrefillAvailable: true, aiPrefillEnabled: true, aiReadsThisMonth: 10, aiReadsMonthlyQuota: 300 };
  it('proposé quand tout est réuni', () => expect(isAiPrefillOfferedToCoOwner(base)).toBe(true));
  it('non proposé sans fournisseur, interrupteur coupé ou quota atteint', () => {
    expect(isAiPrefillOfferedToCoOwner({ ...base, aiPrefillAvailable: false })).toBe(false);
    expect(isAiPrefillOfferedToCoOwner({ ...base, aiPrefillEnabled: false })).toBe(false);
    expect(isAiPrefillOfferedToCoOwner({ ...base, aiReadsThisMonth: 300 })).toBe(false);
  });
});
