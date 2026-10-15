/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M2 — disponibilité (configuration de la copropriété + droit
 * SYNDIC), liste du suivi gestionnaire et projections portail/public, sur la
 * base en mémoire de `syndics.online-payment-fixtures`.
 */

import { createEngineDb, IDS, CODE } from './syndics.online-payment-fixtures';

const db = createEngineDb();
const mockDb = db;

jest.mock('../../src/utils/database', () => ({ prisma: mockDb.prisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  assertSyndicateOfTenant: (...a: any[]) => (mockDb.engine.assertSyndicateOfTenant as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({
  decryptSecret: (value: string) => value.replace(/^enc:/, '')
}));

import {
  getSyndicOnlineAvailabilities,
  getSyndicOnlineAvailability,
  isSyndicConfigUsable,
  syndicCredentialsFrom
} from '../../src/lib/syndics/online-payment/gateway-config';
import {
  assertSyndicOnlinePaymentAllowed,
  isSyndicOnlinePaymentAllowed
} from '../../src/lib/syndics/online-payment/feature-gate';
import {
  listSyndicCheckouts,
  toCheckoutRow,
  toCoOwnerCheckout,
  toPublicStatus
} from '../../src/lib/syndics/online-payment/checkout-queries';

beforeEach(() => db.reset());

describe('disponibilité du paiement en ligne', () => {
  it('copropriété configurée et active : disponible, avec le mode et les frais de l’agence', async () => {
    const availability = await getSyndicOnlineAvailability(IDS.T1, IDS.S1);

    expect(availability).toEqual({
      syndicateId: IDS.S1,
      available: true,
      unavailableReason: null,
      mode: 'SIMULATOR',
      simulated: true,
      feesPaidBy: 'AGENCY'
    });
  });

  it('sans configuration de la copropriété : NOT_CONFIGURED, même si l’agence a un compte actif', async () => {
    const availability = await getSyndicOnlineAvailability(IDS.T1, IDS.S2);

    expect(availability).toMatchObject({
      available: false,
      unavailableReason: 'NOT_CONFIGURED',
      mode: null,
      simulated: false
    });
    expect(db.prisma.paymentGatewayConfig.findUnique).not.toHaveBeenCalled();
  });

  it('configuration désactivée, ou LIVE incomplet : NOT_CONFIGURED', async () => {
    db.store.configs[0].isActive = false;
    expect((await getSyndicOnlineAvailability(IDS.T1, IDS.S1)).unavailableReason).toBe('NOT_CONFIGURED');

    db.store.configs[0].isActive = true;
    Object.assign(db.store.configs[0], { mode: 'LIVE', merchantId: 'M', apiKeyEncrypted: null });
    expect((await getSyndicOnlineAvailability(IDS.T1, IDS.S1)).available).toBe(false);
  });

  it('droit SYNDIC refusé ou agence inactive : SUBSCRIPTION (la configuration reste visible)', async () => {
    db.engine.evaluateSchedulingGate.mockResolvedValue('SUBSCRIPTION_DENIED');
    expect(await getSyndicOnlineAvailability(IDS.T1, IDS.S1)).toMatchObject({
      available: false,
      unavailableReason: 'SUBSCRIPTION',
      mode: 'SIMULATOR'
    });
    db.engine.evaluateSchedulingGate.mockResolvedValue('TENANT_INACTIVE');
    expect((await getSyndicOnlineAvailability(IDS.T1, IDS.S1)).unavailableReason).toBe('SUBSCRIPTION');
  });

  it('plusieurs copropriétés : une entrée chacune, le droit n’est évalué qu’une fois', async () => {
    const all = await getSyndicOnlineAvailabilities(IDS.T1, [IDS.S1, IDS.S2, IDS.S1]);

    expect([...all.keys()].sort()).toEqual([IDS.S1, IDS.S2].sort());
    expect(all.get(IDS.S1)!.available).toBe(true);
    expect(all.get(IDS.S2)!.available).toBe(false);
    expect(db.engine.evaluateSchedulingGate).toHaveBeenCalledTimes(1);
    expect((await getSyndicOnlineAvailabilities(IDS.T1, [])).size).toBe(0);
  });

  it('une copropriété d’une autre agence n’est jamais disponible pour cette agence', async () => {
    db.store.configs.push({ id: IDS.CFGB, tenantId: IDS.T2, syndicateId: IDS.SB, mode: 'SIMULATOR', isActive: true });
    expect((await getSyndicOnlineAvailability(IDS.T1, IDS.SB)).available).toBe(false);
    expect((await getSyndicOnlineAvailability(IDS.T2, IDS.SB)).available).toBe(true);
  });

  it('frais : CLIENT par défaut quand l’agence n’a pas de configuration', async () => {
    db.store.agencyConfigs.length = 0;
    expect((await getSyndicOnlineAvailability(IDS.T1, IDS.S1)).feesPaidBy).toBe('CLIENT');
  });
});

describe('configuration utilisable et identifiants', () => {
  it('isSyndicConfigUsable', () => {
    expect(isSyndicConfigUsable(null)).toBe(false);
    expect(isSyndicConfigUsable({ isActive: false, mode: 'SIMULATOR' } as any)).toBe(false);
    expect(isSyndicConfigUsable({ isActive: true, mode: 'SIMULATOR' } as any)).toBe(true);
    expect(isSyndicConfigUsable({ isActive: true, mode: 'LIVE', merchantId: 'M', apiKeyEncrypted: 'k' } as any)).toBe(
      true
    );
    expect(isSyndicConfigUsable({ isActive: true, mode: 'LIVE', merchantId: 'M', apiKeyEncrypted: null } as any)).toBe(
      false
    );
    expect(isSyndicConfigUsable({ isActive: true, mode: 'LIVE', merchantId: null, apiKeyEncrypted: 'k' } as any)).toBe(
      false
    );
  });

  it('syndicCredentialsFrom : clé déchiffrée de la copropriété, agence de la configuration', () => {
    const credentials = syndicCredentialsFrom({
      tenantId: IDS.T1,
      mode: 'LIVE',
      merchantId: 'MERCH',
      apiKeyEncrypted: 'enc:SECRET'
    } as any);
    expect(credentials).toMatchObject({ tenantId: IDS.T1, merchantId: 'MERCH', apiKey: 'SECRET' });
  });

  it('syndicCredentialsFrom : LIVE sans identifiant ou sans clé -> 400, jamais de repli', () => {
    expect(() =>
      syndicCredentialsFrom({ tenantId: IDS.T1, mode: 'LIVE', merchantId: null, apiKeyEncrypted: 'enc:x' } as any)
    ).toThrow(expect.objectContaining({ statusCode: 400, code: 'ONLINE_PAYMENT_UNAVAILABLE' }));
    expect(() =>
      syndicCredentialsFrom({ tenantId: IDS.T1, mode: 'LIVE', merchantId: 'M', apiKeyEncrypted: null } as any)
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('syndicCredentialsFrom : le simulateur n’a besoin d’aucune clé', () => {
    expect(
      syndicCredentialsFrom({ tenantId: IDS.T1, mode: 'SIMULATOR', merchantId: null, apiKeyEncrypted: null } as any)
    ).toMatchObject({
      apiKey: '',
      merchantId: ''
    });
  });
});

describe('droit SYNDIC de l’agence', () => {
  it('autorisé : rien ne se passe', async () => {
    await expect(assertSyndicOnlinePaymentAllowed(IDS.T1)).resolves.toBeUndefined();
    await expect(isSyndicOnlinePaymentAllowed(IDS.T1)).resolves.toBe(true);
  });

  it.each(['SUBSCRIPTION_DENIED', 'TENANT_INACTIVE'])('refus %s : 403 SYNDIC_FEATURE_DENIED', async denial => {
    db.engine.evaluateSchedulingGate.mockResolvedValue(denial);
    await expect(assertSyndicOnlinePaymentAllowed(IDS.T1)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SYNDIC_FEATURE_DENIED'
    });
    await expect(isSyndicOnlinePaymentAllowed(IDS.T1)).resolves.toBe(false);
  });
});

describe('listSyndicCheckouts', () => {
  const at = (iso: string) => new Date(iso);

  beforeEach(() => {
    db.addCheckout({
      codePaiement: 'IMS-aaaaaaaaaaaaaaaaaaaa',
      status: 'SUCCESS',
      createdAt: at('2026-03-01T10:00:00Z')
    });
    db.addCheckout({
      codePaiement: 'IMS-bbbbbbbbbbbbbbbbbbbb',
      status: 'REVIEW',
      reviewKind: 'AMOUNT_MISMATCH',
      createdAt: at('2026-03-02T10:00:00Z')
    });
    db.addCheckout({
      codePaiement: 'IMS-cccccccccccccccccccc',
      status: 'PENDING',
      origin: 'SECURE_LINK',
      lotId: IDS.L2,
      chargeCallIds: [IDS.C3],
      createdAt: at('2026-03-03T23:30:00Z')
    });
    db.addCheckout({
      codePaiement: 'IMS-dddddddddddddddddddd',
      status: 'FAILED',
      createdAt: at('2026-03-10T10:00:00Z')
    });
    // Autre copropriété et autre agence : jamais comptées ni listées.
    db.addCheckout({
      codePaiement: 'IMS-eeeeeeeeeeeeeeeeeeee',
      syndicateId: IDS.S2,
      lotId: IDS.L3,
      chargeCallIds: [IDS.C4]
    });
    db.addCheckout({
      codePaiement: 'IMS-ffffffffffffffffffff',
      tenantId: IDS.T2,
      syndicateId: IDS.SB,
      lotId: IDS.LB,
      chargeCallIds: [IDS.CB]
    });
  });

  it('tri par date décroissante, pagination et compteurs de TOUTE la copropriété', async () => {
    const result = await listSyndicCheckouts(IDS.T1, IDS.S1, { status: ['REVIEW'], page: 1, limit: 20 });

    expect(result.items.map(item => item.codePaiement)).toEqual(['IMS-bbbbbbbbbbbbbbbbbbbb']);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(result.counts).toEqual({ PENDING: 1, SUCCESS: 1, FAILED: 1, CANCELED: 0, EXPIRED: 0, REVIEW: 1 });
    expect(result.items[0]).toMatchObject({ reviewKind: 'AMOUNT_MISMATCH', lot: { id: IDS.L1, lotNumber: 'A12' } });
  });

  it('sans filtre : tout de la copropriété, du plus récent au plus ancien, jamais une autre copropriété ni agence', async () => {
    const result = await listSyndicCheckouts(IDS.T1, IDS.S1);
    expect(result.items.map(item => item.codePaiement)).toEqual([
      'IMS-dddddddddddddddddddd',
      'IMS-cccccccccccccccccccc',
      'IMS-bbbbbbbbbbbbbbbbbbbb',
      'IMS-aaaaaaaaaaaaaaaaaaaa'
    ]);
    expect(result.pagination.total).toBe(4);
  });

  it('filtres : statuts multiples, origine, lot, période (borne haute incluse)', async () => {
    const byStatus = await listSyndicCheckouts(IDS.T1, IDS.S1, { status: ['SUCCESS', 'FAILED'] });
    expect(byStatus.items.map(i => i.status).sort()).toEqual(['FAILED', 'SUCCESS']);

    expect((await listSyndicCheckouts(IDS.T1, IDS.S1, { origin: 'SECURE_LINK' })).items).toHaveLength(1);
    expect((await listSyndicCheckouts(IDS.T1, IDS.S1, { lotId: IDS.L2 })).items[0].codePaiement).toBe(
      'IMS-cccccccccccccccccccc'
    );

    const range = await listSyndicCheckouts(IDS.T1, IDS.S1, { from: '2026-03-02', to: '2026-03-03' });
    expect(range.items.map(i => i.codePaiement)).toEqual(['IMS-cccccccccccccccccccc', 'IMS-bbbbbbbbbbbbbbbbbbbb']);
    // Les compteurs restent ceux de toute la copropriété.
    expect(range.counts.SUCCESS).toBe(1);
  });

  it('pagination', async () => {
    const page2 = await listSyndicCheckouts(IDS.T1, IDS.S1, { page: 2, limit: 3 });
    expect(page2.items).toHaveLength(1);
    expect(page2.pagination).toEqual({ page: 2, limit: 3, total: 4, totalPages: 2 });
    expect((await listSyndicCheckouts(IDS.T1, IDS.S1, { limit: 1000 })).pagination.limit).toBe(100);
  });

  it('une copropriété d’une autre agence répond 404, sans rien révéler', async () => {
    await expect(listSyndicCheckouts(IDS.T1, IDS.SB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(listSyndicCheckouts(IDS.T2, IDS.S1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('une ligne ne porte ni URL de paiement, ni jeton fournisseur, ni charge utile brute', async () => {
    const result = await listSyndicCheckouts(IDS.T1, IDS.S1);
    const json = JSON.stringify(result);
    for (const forbidden of ['checkoutUrl', 'providerToken', 'lastProviderPayload', 'apiKey', 'tok']) {
      expect(json).not.toContain(`"${forbidden}"`);
    }
  });
});

describe('projections portail et publique', () => {
  it('toPublicStatus : REVIEW -> PENDING, EXPIRED -> CANCELED', () => {
    expect(toPublicStatus('REVIEW')).toBe('PENDING');
    expect(toPublicStatus('PENDING')).toBe('PENDING');
    expect(toPublicStatus('EXPIRED')).toBe('CANCELED');
    expect(toPublicStatus('CANCELED')).toBe('CANCELED');
    expect(toPublicStatus('FAILED')).toBe('FAILED');
    expect(toPublicStatus('SUCCESS')).toBe('SUCCESS');
  });

  it('PENDING : URL du fournisseur, périodes dans l’ordre d’échéance, lot, copropriété, frais de l’agence', async () => {
    const checkout = db.addCheckout();

    const dto = await toCoOwnerCheckout(checkout as any, { reused: true });

    expect(dto).toMatchObject({
      codePaiement: CODE,
      status: 'PENDING',
      underReview: false,
      amount: 50000,
      currency: 'FCFA',
      chargeCallIds: [IDS.C1, IDS.C2],
      periods: ['2026-01', '2026-02'],
      reused: true,
      lot: { id: IDS.L1, lotNumber: 'A12' },
      syndicate: { id: IDS.S1, name: 'Résidence Les Palmiers' },
      mode: 'SIMULATOR',
      feesPaidBy: 'AGENCY',
      documents: [],
      completedAt: null
    });
    expect(dto.checkoutUrl).toContain('/simulator/');
  });

  it('REVIEW est présenté « en cours de vérification » (PENDING), sans URL', async () => {
    const dto = await toCoOwnerCheckout(db.addCheckout({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' }) as any);
    expect(dto).toMatchObject({ status: 'PENDING', underReview: true, checkoutUrl: null, reused: false });
    expect(JSON.stringify(dto)).not.toContain('AMOUNT_MISMATCH');
  });

  it('EXPIRED est présenté CANCELED ; l’URL n’est donnée qu’en PENDING', async () => {
    const dto = await toCoOwnerCheckout(db.addCheckout({ status: 'EXPIRED' }) as any);
    expect(dto).toMatchObject({ status: 'CANCELED', underReview: false, checkoutUrl: null });
  });

  it('SUCCESS : les documents émis par l’encaissement, pas ceux d’un autre lot ni d’un autre paiement', async () => {
    const checkout = db.addCheckout({ status: 'SUCCESS', chargePaymentId: 'pay-1', completedAt: new Date() });
    db.store.receipts.push(
      {
        id: 'r1',
        tenantId: IDS.T1,
        lotId: IDS.L1,
        kind: 'RECEIPT',
        number: 'R-2026-000001',
        chargePaymentId: 'pay-1',
        issuedAt: new Date()
      },
      {
        id: 'q1',
        tenantId: IDS.T1,
        lotId: IDS.L1,
        kind: 'QUITTANCE',
        number: 'Q-2026-000001',
        chargePaymentId: null,
        chargeCallId: IDS.C1,
        issuedAt: new Date()
      },
      {
        id: 'other',
        tenantId: IDS.T1,
        lotId: IDS.L2,
        kind: 'RECEIPT',
        number: 'R-2026-000009',
        chargePaymentId: 'pay-9',
        issuedAt: new Date()
      },
      {
        id: 'foreign',
        tenantId: IDS.T2,
        lotId: IDS.L1,
        kind: 'RECEIPT',
        number: 'R-2026-000008',
        chargePaymentId: 'pay-1',
        issuedAt: new Date()
      }
    );

    const dto = await toCoOwnerCheckout(checkout as any);

    expect(dto.status).toBe('SUCCESS');
    expect(dto.documents.map(d => d.number).sort()).toEqual(['Q-2026-000001', 'R-2026-000001']);
  });

  it('aucun secret dans la réponse portail ni dans la ligne gestionnaire', async () => {
    const checkout = db.addCheckout({ providerToken: 'tok-secret', lastProviderPayload: { x: 1 } });
    const portal = JSON.stringify(await toCoOwnerCheckout(checkout as any));
    const manager = JSON.stringify(await toCheckoutRow(checkout as any));
    for (const json of [portal, manager]) {
      expect(json).not.toContain('tok-secret');
      expect(json).not.toContain('lastProviderPayload');
      expect(json).not.toMatch(/apiKey|passwordHash/);
    }
    expect(manager).not.toContain('checkoutUrl');
  });
});
