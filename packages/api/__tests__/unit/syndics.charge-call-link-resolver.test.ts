/* eslint-disable @typescript-eslint/no-explicit-any */
/** Spec 042, lot M6 — résolveur du lien joint aux avis et relances. */
import { createLinkDb } from './syndics.charge-call-link-fixtures';
import { IDS } from './syndics.online-payment-fixtures';

const db = createLinkDb();
const mockDb = db;
jest.mock('../../src/utils/database', () => ({ prisma: mockDb.prisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockDb.engine.logAuditEvent(...a),
  flushAuditEvents: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  sumAllocationsByCall: (...a: any[]) => (mockDb.engine.sumAllocationsByCall as any)(...a),
  assertSyndicateOfTenant: (...a: any[]) => (mockDb.engine.assertSyndicateOfTenant as any)(...a),
  recordLotPaymentTx: (...a: any[]) => (mockDb.engine.recordLotPaymentTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: jest.fn(),
  toDocumentRefs: jest.fn()
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({ scheduleChargeDocumentDelivery: jest.fn() }));
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({ assertFiscalYearOpenTx: jest.fn() }));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));
jest.mock('../../src/lib/syndics/notifications', () => ({
  resolveChargeCallRecipient: (lot: any) => (lot?.ownerContactId ? lot.owner : lot?.coownerId ? lot.coowner : null)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({ decryptSecret: (v: string) => v }));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({ gatewayClientForMode: () => mockDb.engine.client }));

import { resolveChargeCallPaymentUrl } from '../../src/lib/syndics/charge-call-payment-url';

const input = (over: Record<string, unknown> = {}) => ({
  tenantId: IDS.T1,
  syndicateId: IDS.S1,
  lotId: IDS.L1,
  chargeCallIds: [IDS.C1],
  ...over
});

beforeEach(() => db.reset());

describe('resolveChargeCallPaymentUrl', () => {
  it('crée un lien automatique de 30 jours, sans auteur, et renvoie son URL', async () => {
    const url = await resolveChargeCallPaymentUrl(input());
    expect(url).toMatch(/^https?:\/\/.+\/payer-charges#.{20,}$/);
    expect(db.links).toHaveLength(1);
    expect(db.links[0]).toMatchObject({
      scope: 'CHARGE_CALL_PAYMENT',
      objectType: 'ChargeCall',
      objectId: IDS.C1,
      createdByUserId: null
    });
    expect(Math.round((db.links[0].expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(30);
    expect(JSON.stringify(db.links)).not.toContain(url!.split('#')[1]);
  });

  it.each([
    ['plusieurs appels', () => input({ chargeCallIds: [IDS.C1, IDS.C2] })],
    ['aucun appel', () => input({ chargeCallIds: [] })],
    ['lot qui ne correspond pas', () => input({ lotId: IDS.L2 })],
    ['autre agence', () => input({ tenantId: IDS.T2 })],
    ['copropriété non configurée', () => input({ syndicateId: IDS.S2, lotId: IDS.L3, chargeCallIds: [IDS.C4] })]
  ])('null : %s', async (_name, make) => {
    expect(await resolveChargeCallPaymentUrl(make())).toBeNull();
    expect(db.links).toHaveLength(0);
  });

  it('null : appel soldé, droit SYNDIC refusé, lot revendu', async () => {
    db.store.allocations.push({ id: 'a', paymentId: 'p', chargeCallId: IDS.C1, amount: 30000 });
    expect(await resolveChargeCallPaymentUrl(input())).toBeNull();
    db.store.allocations.length = 0;
    db.engine.evaluateSchedulingGate.mockResolvedValue('DENIED');
    expect(await resolveChargeCallPaymentUrl(input())).toBeNull();
    db.engine.evaluateSchedulingGate.mockResolvedValue(null);
    db.addOwnerProfile({ contactId: 'contact-ancien', ownedUntil: new Date('2026-06-30T00:00:00.000Z') });
    db.addOwnerProfile({ ownedSince: new Date('2026-07-01T00:00:00.000Z') });
    expect(await resolveChargeCallPaymentUrl(input())).toBeNull();
    expect(db.links).toHaveLength(0);
  });

  it('ne lève jamais, même si la base échoue', async () => {
    db.prisma.chargeCall.findFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(resolveChargeCallPaymentUrl(input())).resolves.toBeNull();
    db.prisma.secureLink.create.mockRejectedValueOnce(new Error('db down'));
    await expect(resolveChargeCallPaymentUrl(input())).resolves.toBeNull();
  });
});
