/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M2 — démarrage d'un paiement en ligne d'appels de charges
 * (`startSyndicCheckout`), sur la base en mémoire de `syndics.online-payment-fixtures`.
 */

import { createEngineDb, IDS, SYNDIC_KEY } from './syndics.online-payment-fixtures';

const db = createEngineDb();
const mockDb = db;

jest.mock('../../src/utils/database', () => ({ prisma: mockDb.prisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockDb.engine.logAuditEvent(...a)
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  sumAllocationsByCall: (...a: any[]) => (mockDb.engine.sumAllocationsByCall as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({
  decryptSecret: (value: string) => value.replace(/^enc:/, '')
}));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => mockDb.engine.client
}));

import { startSyndicCheckout, syndicCheckoutReturnUrl } from '../../src/lib/syndics/online-payment/checkout-start';
import type { StartSyndicCheckoutParams } from '../../src/lib/syndics/online-payment/checkout-start';
import { isSyndicCodePaiement } from '../../src/lib/payment-gateway/codes';

const base = (overrides: Partial<StartSyndicCheckoutParams> = {}): StartSyndicCheckoutParams => ({
  tenantId: IDS.T1,
  syndicateId: IDS.S1,
  lotId: IDS.L1,
  chargeCallIds: [IDS.C1, IDS.C2],
  origin: 'PORTAL',
  tenantClientId: 'client-1',
  payerContactId: IDS.AWA,
  ...overrides
});

async function expectAppError(promise: Promise<unknown>, statusCode: number, code?: string) {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

beforeEach(() => {
  db.reset();
  db.engine.client.buildAway.mockResolvedValue({
    url: 'http://localhost:8001/api/payment-gateway/simulator/X',
    tokens: 'tok-1',
    code: '00',
    message: null
  });
});

describe('startSyndicCheckout — montant et périmètre', () => {
  it('recalcule le montant côté serveur (reste dû des affectations) et le transmet au fournisseur', async () => {
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 5000 });

    const { checkout, reused } = await startSyndicCheckout(base());

    expect(reused).toBe(false);
    expect(Number(checkout.amount)).toBe(45000);
    expect(checkout.status).toBe('PENDING');
    expect(checkout.origin).toBe('PORTAL');
    expect(checkout.configId).toBe(IDS.CFG1);
    expect(checkout.chargeCallIds).toEqual([IDS.C1, IDS.C2]);
    expect(isSyndicCodePaiement(checkout.codePaiement)).toBe(true);
    expect(checkout.checkoutUrl).toContain('/simulator/');
    expect(db.engine.client.buildAway).toHaveBeenCalledTimes(1);
    const [, request] = db.engine.client.buildAway.mock.calls[0];
    expect(request).toMatchObject({
      montant: 45000,
      codePaiement: checkout.codePaiement,
      nomUsager: 'Kone',
      prenomUsager: 'Awa',
      urlRetour: syndicCheckoutReturnUrl({ origin: 'PORTAL', codePaiement: checkout.codePaiement })
    });
    expect(db.engine.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_ONLINE_PAYMENT_STARTED', tenantId: IDS.T1 })
    );
  });

  it('arrondit à l’entier (FCFA) la somme des restes dus', async () => {
    db.store.calls.find(c => c.id === IDS.C1)!.amount = 30000.4;
    db.store.calls.find(c => c.id === IDS.C2)!.amount = 20000.4;

    const { checkout } = await startSyndicCheckout(base());

    expect(Number(checkout.amount)).toBe(50001);
  });

  it('un appel d’un autre lot de la même copropriété est un 404, sans tentative ni appel fournisseur', async () => {
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: [IDS.C1, IDS.C3] })), 404);
    expect(db.store.checkouts).toHaveLength(0);
    expect(db.engine.client.buildAway).not.toHaveBeenCalled();
  });

  it('un appel d’une autre copropriété de l’agence est un 404', async () => {
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: [IDS.C4] })), 404);
  });

  it('un appel d’une autre agence est un 404 (comme un appel inexistant)', async () => {
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: [IDS.CB] })), 404);
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: ['00000000-0000-4000-8000-0000000000ff'] })), 404);
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('un lot d’une autre agence (ou d’une autre copropriété) est un 404', async () => {
    await expectAppError(startSyndicCheckout(base({ lotId: IDS.LB, chargeCallIds: [IDS.CB] })), 404);
    await expectAppError(startSyndicCheckout(base({ lotId: IDS.L3, chargeCallIds: [IDS.C4] })), 404);
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('refuse un appel déjà soldé, une devise étrangère et un reste dû nul', async () => {
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 30000 });
    await expectAppError(startSyndicCheckout(base()), 400, 'CHARGE_CALL_ALREADY_SETTLED');

    db.reset();
    db.store.calls.find(c => c.id === IDS.C2)!.currency = 'EUR';
    await expectAppError(startSyndicCheckout(base()), 400, 'ONLINE_PAYMENT_CURRENCY_UNSUPPORTED');

    // 0,40 FCFA restant : pas soldé, mais arrondi à 0 => rien à payer.
    db.reset();
    db.store.calls.find(c => c.id === IDS.C1)!.amount = 0.4;
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: [IDS.C1] })), 400, 'ONLINE_PAYMENT_NOTHING_DUE');
  });

  it('refuse 0 et plus de 24 appels (400)', async () => {
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: [] })), 400);
    const many = Array.from(
      { length: 25 },
      (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`
    );
    await expectAppError(startSyndicCheckout(base({ chargeCallIds: many })), 400);
  });
});

describe('startSyndicCheckout — configuration de la copropriété, jamais de repli', () => {
  it('copropriété sans configuration : 400 ONLINE_PAYMENT_UNAVAILABLE même si l’agence a un compte actif', async () => {
    await expectAppError(
      startSyndicCheckout(base({ syndicateId: IDS.S2, lotId: IDS.L3, chargeCallIds: [IDS.C4] })),
      400,
      'ONLINE_PAYMENT_UNAVAILABLE'
    );
    expect(db.store.checkouts).toHaveLength(0);
    expect(db.engine.client.buildAway).not.toHaveBeenCalled();
    expect(db.prisma.paymentGatewayConfig.findUnique).not.toHaveBeenCalled();
  });

  it('configuration inactive, ou LIVE sans clé : indisponible', async () => {
    db.store.configs[0].isActive = false;
    await expectAppError(startSyndicCheckout(base()), 400, 'ONLINE_PAYMENT_UNAVAILABLE');

    db.store.configs[0].isActive = true;
    db.store.configs[0].mode = 'LIVE';
    db.store.configs[0].merchantId = 'M';
    db.store.configs[0].apiKeyEncrypted = null;
    await expectAppError(startSyndicCheckout(base()), 400, 'ONLINE_PAYMENT_UNAVAILABLE');
  });

  it('droit SYNDIC absent de l’abonnement : 403 SYNDIC_FEATURE_DENIED, rien n’est créé', async () => {
    db.engine.evaluateSchedulingGate.mockResolvedValue('SUBSCRIPTION_DENIED');
    await expectAppError(startSyndicCheckout(base()), 403, 'SYNDIC_FEATURE_DENIED');
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('transmet au fournisseur la clé de la COPROPRIÉTÉ, jamais celle de l’agence', async () => {
    db.setLive();
    // En LIVE, seule une URL https est acceptée.
    db.engine.client.buildAway.mockResolvedValue({
      url: 'https://pay.example/checkout/1',
      tokens: 't',
      code: '00',
      message: null
    });

    const { checkout } = await startSyndicCheckout(base());

    expect(checkout.checkoutUrl).toBe('https://pay.example/checkout/1');
    const [credentials] = db.engine.client.buildAway.mock.calls[0];
    expect(credentials).toMatchObject({ tenantId: IDS.T1, merchantId: 'MERCHANT-S1', apiKey: SYNDIC_KEY });
    expect(credentials.apiKey).not.toContain('AGENCY');
    expect(credentials.merchantId).not.toBe('AGENCY-MERCHANT');
  });
});

describe('startSyndicCheckout — reprise et chevauchements', () => {
  it('reprend le PENDING identique (même URL, un seul fournisseur appelé)', async () => {
    const first = await startSyndicCheckout(base());
    const second = await startSyndicCheckout(base());

    expect(second.reused).toBe(true);
    expect(second.checkout.id).toBe(first.checkout.id);
    expect(second.checkout.checkoutUrl).toBe(first.checkout.checkoutUrl);
    expect(db.store.checkouts).toHaveLength(1);
    expect(db.engine.client.buildAway).toHaveBeenCalledTimes(1);
  });

  it('409 ONLINE_PAYMENT_IN_PROGRESS pour un chevauchement non identique, avec le lien du même copropriétaire', async () => {
    const first = await startSyndicCheckout(base());

    await expect(startSyndicCheckout(base({ chargeCallIds: [IDS.C1] }))).rejects.toMatchObject({
      statusCode: 409,
      code: 'ONLINE_PAYMENT_IN_PROGRESS',
      data: { codePaiement: first.checkout.codePaiement, checkoutUrl: first.checkout.checkoutUrl }
    });
    // Un autre compte du portail ne reçoit pas l'URL de ce payeur.
    await expect(startSyndicCheckout(base({ tenantClientId: 'client-2' }))).rejects.toMatchObject({
      statusCode: 409,
      code: 'ONLINE_PAYMENT_IN_PROGRESS',
      data: undefined
    });
    expect(db.store.checkouts).toHaveLength(1);
  });

  it('un paiement d’une autre origine (lien) bloque, sans exposer son URL', async () => {
    db.addCheckout({ origin: 'SECURE_LINK', tenantClientId: null, secureLinkId: 'link-1', createdAt: new Date() });

    await expect(startSyndicCheckout(base())).rejects.toMatchObject({
      statusCode: 409,
      code: 'ONLINE_PAYMENT_IN_PROGRESS',
      data: undefined
    });
  });

  it('un REVIEW (sans limite d’âge) bloque : 409 ONLINE_PAYMENT_UNDER_REVIEW', async () => {
    db.addCheckout({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH', createdAt: new Date('2026-01-01T00:00:00Z') });
    await expectAppError(startSyndicCheckout(base()), 409, 'ONLINE_PAYMENT_UNDER_REVIEW');
    await expectAppError(
      startSyndicCheckout(
        base({ origin: 'SECURE_LINK', tenantClientId: null, secureLinkId: 'l', chargeCallIds: [IDS.C1] })
      ),
      409,
      'ONLINE_PAYMENT_UNDER_REVIEW'
    );
  });

  it('un PENDING de plus de 15 minutes n’empêche plus un nouveau paiement', async () => {
    db.addCheckout({ createdAt: new Date(Date.now() - 16 * 60 * 1000) });

    const { reused, checkout } = await startSyndicCheckout(base());

    expect(reused).toBe(false);
    expect(db.store.checkouts).toHaveLength(2);
    expect(checkout.status).toBe('PENDING');
  });

  it('un PENDING d’un autre lot n’interfère pas', async () => {
    db.addCheckout({ lotId: IDS.L2, chargeCallIds: [IDS.C3], createdAt: new Date() });
    const { reused } = await startSyndicCheckout(base());
    expect(reused).toBe(false);
  });

  it('prend le verrou consultatif du lot avant de lire les chevauchements', async () => {
    await startSyndicCheckout(base());
    expect(db.prisma.$executeRaw).toHaveBeenCalled();
    const call = db.prisma.$executeRaw.mock.calls[0];
    expect(String(call[0].join('?'))).toContain('pg_advisory_xact_lock');
    expect(call.slice(1)[0]).toBe(`syndic-online-start:${IDS.T1}:${IDS.L1}`);
  });
});

describe('startSyndicCheckout — lien sécurisé', () => {
  it('pose l’origine, le lien, le créateur et l’URL de retour de la page publique', async () => {
    const { checkout } = await startSyndicCheckout(
      base({
        origin: 'SECURE_LINK',
        tenantClientId: null,
        secureLinkId: 'link-1',
        chargeCallIds: [IDS.C1],
        actorUserId: IDS.MANAGER
      })
    );

    expect(checkout).toMatchObject({ origin: 'SECURE_LINK', secureLinkId: 'link-1', createdByUserId: IDS.MANAGER });
    expect(Number(checkout.amount)).toBe(30000);
    const [, request] = db.engine.client.buildAway.mock.calls[0];
    expect(request.urlRetour).toContain('/payer-charges/statut?paiement=');
    expect(request.urlRetour).not.toContain('#');
  });

  it('reprend un PENDING du même lien (même appel, même montant, URL présente)', async () => {
    const params = base({
      origin: 'SECURE_LINK',
      tenantClientId: null,
      secureLinkId: 'link-1',
      chargeCallIds: [IDS.C1]
    });
    const first = await startSyndicCheckout(params);
    const second = await startSyndicCheckout(params);
    expect(second.reused).toBe(true);
    expect(second.checkout.checkoutUrl).toBe(first.checkout.checkoutUrl);
  });
});

describe('startSyndicCheckout — échec du fournisseur (build-away)', () => {
  it('marque la tentative FAILED, ne stocke aucune URL et répond 502', async () => {
    db.engine.client.buildAway.mockRejectedValue(new Error('réseau coupé'));

    await expectAppError(startSyndicCheckout(base()), 502, 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE');

    expect(db.store.checkouts).toHaveLength(1);
    expect(db.store.checkouts[0]).toMatchObject({ status: 'FAILED', checkoutUrl: null });
    expect(String(db.store.checkouts[0].failureMessage)).not.toContain('réseau');
  });

  it('une URL fournisseur refusée (http hors local) n’est jamais stockée : FAILED + 502', async () => {
    db.engine.client.buildAway.mockResolvedValue({
      url: 'http://evil.example/pay',
      tokens: 't',
      code: '00',
      message: null
    });

    await expectAppError(startSyndicCheckout(base()), 502, 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE');

    expect(db.store.checkouts[0]).toMatchObject({ status: 'FAILED', checkoutUrl: null });
    expect(JSON.stringify(db.store.checkouts[0])).not.toContain('evil.example');
  });

  it('après un échec, un nouveau paiement est possible (la tentative FAILED ne bloque pas)', async () => {
    db.engine.client.buildAway.mockRejectedValueOnce(new Error('boom'));
    await expectAppError(startSyndicCheckout(base()), 502);

    const { reused, checkout } = await startSyndicCheckout(base());

    expect(reused).toBe(false);
    expect(checkout.status).toBe('PENDING');
  });
});
