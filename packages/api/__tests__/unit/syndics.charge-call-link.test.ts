/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M6 — lien « Payer cet appel » (`online-payment/charge-call-link`),
 * sur la base en mémoire de `syndics.charge-call-link-fixtures` : le service
 * `lib/secure-links` est le VRAI (jeton, empreinte, expiration, révocation), le
 * moteur de paiement aussi (`startSyndicCheckout`, rapprochement).
 */

import { createLinkDb } from './syndics.charge-call-link-fixtures';
import { IDS, providerStatus } from './syndics.online-payment-fixtures';

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
  issueReceiptsForPaymentTx: (...a: any[]) => (mockDb.engine.issueReceiptsForPaymentTx as any)(...a),
  toDocumentRefs: (docs: any[]) => docs.map(({ id, kind, number }) => ({ id, kind, number }))
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({
  scheduleChargeDocumentDelivery: (...a: any[]) => mockDb.engine.scheduleChargeDocumentDelivery(...a)
}));
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({
  assertFiscalYearOpenTx: (...a: any[]) => (mockDb.engine.assertFiscalYearOpenTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));
// Règle du destinataire (`ownerContactId` puis `coownerId`) sans charger les services de messagerie.
jest.mock('../../src/lib/syndics/notifications', () => ({
  resolveChargeCallRecipient: (lot: any) => (lot?.ownerContactId ? lot.owner : lot?.coownerId ? lot.coowner : null)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({
  decryptSecret: (value: string) => value.replace(/^enc:/, '')
}));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => mockDb.engine.client
}));

import {
  createAutomaticChargeCallPaymentUrl,
  createChargeCallPaymentLink,
  getChargeCallPaymentByToken,
  getChargeCallPaymentStatusByCode,
  listChargeCallPaymentLinks,
  revokeChargeCallPaymentLink,
  startChargeCallPaymentByToken
} from '../../src/lib/syndics/online-payment/charge-call-link';

const VISITOR = { ip: '203.0.113.7', userAgent: 'jest' };
const UNIFORM = 'Lien invalide ou expiré.';
const MANAGER = IDS.MANAGER;

async function expectUniform404(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ statusCode: 404, message: UNIFORM });
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code?: string) {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

/** Lien actif de l'appel C1 (30 000 FCFA) créé par le gestionnaire ; renvoie le jeton en clair. */
async function openLink(chargeCallId: string = IDS.C1, syndicateId: string = IDS.S1, actor: string | null = MANAGER) {
  const { link } = await createChargeCallPaymentLink(IDS.T1, syndicateId, chargeCallId, actor);
  return { token: link.token, id: link.id, url: link.url };
}

const lastAuditActions = () => db.engine.logAuditEvent.mock.calls.map((call: any[]) => call[0].actionKey);

beforeEach(() => {
  db.reset();
  db.engine.client.buildAway.mockResolvedValue({
    url: 'http://localhost:8001/api/payment-gateway/simulator/X',
    tokens: 'tok-1',
    code: '00',
    message: null
  });
  db.engine.client.getStatus.mockResolvedValue(providerStatus({ amount: 30000 }));
});

describe('ouverture du lien (POST /charge-call-payment)', () => {
  it('renvoie l’appel, recalculé côté serveur, sans nom ni coordonnées du copropriétaire', async () => {
    db.addOwnerProfile();
    const { token } = await openLink();

    const dto = await getChargeCallPaymentByToken(token, VISITOR);

    expect(dto).toMatchObject({
      syndicateName: 'Résidence Les Palmiers',
      lotLabel: 'Lot A12',
      period: '2026-01',
      amountDue: 30000,
      currency: 'XOF',
      simulated: true,
      feesPaidBy: 'AGENCY',
      paymentMethods: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'CARD'],
      paymentInProgress: false,
      reviewPending: false
    });
    expect(dto.dueDate).toBe('2026-01-10T00:00:00.000Z');
    const serialized = JSON.stringify(dto);
    for (const secret of ['Awa', 'Kone', 'awa@example.test', '+2250700000000', IDS.AWA, IDS.C1, IDS.L1, token]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('recalcule le reste dû à chaque ouverture (jamais celui de l’envoi)', async () => {
    const { token } = await openLink();
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 5000 });

    expect((await getChargeCallPaymentByToken(token, VISITOR)).amountDue).toBe(25000);
  });

  it('comptabilise la consultation après une lecture réussie seulement', async () => {
    const { token, id } = await openLink();

    await getChargeCallPaymentByToken(token, VISITOR);

    expect(db.links.find(link => link.id === id)).toMatchObject({ viewCount: 1 });
    expect(db.links.find(link => link.id === id)!.lastViewedAt).toBeInstanceOf(Date);
    expect(lastAuditActions()).toContain('SECURE_LINK_VIEWED');
  });

  it('pose le contexte d’agence du lien (jamais celui d’un corps de requête)', async () => {
    const { token } = await openLink();
    db.observedTenants.length = 0;

    await getChargeCallPaymentByToken(token, VISITOR);

    expect(db.observedTenants).toEqual([IDS.T1]);
  });

  it('signale un paiement en cours et un paiement à vérifier couvrant l’appel', async () => {
    const { token } = await openLink();
    db.addCheckout({ chargeCallIds: [IDS.C1], origin: 'PORTAL', createdAt: new Date(Date.now() - 60_000) });
    expect(await getChargeCallPaymentByToken(token, VISITOR)).toMatchObject({
      paymentInProgress: true,
      reviewPending: false
    });

    db.store.checkouts[0].status = 'REVIEW';
    db.store.checkouts[0].createdAt = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    expect(await getChargeCallPaymentByToken(token, VISITOR)).toMatchObject({
      paymentInProgress: false,
      reviewPending: true
    });

    // Un PENDING de plus de 15 minutes n'est plus « en cours ».
    db.store.checkouts[0].status = 'PENDING';
    expect(await getChargeCallPaymentByToken(token, VISITOR)).toMatchObject({ paymentInProgress: false });
  });
});

describe('refus uniforme (404 « Lien invalide ou expiré. »)', () => {
  it('jeton inconnu, malformé, expiré, révoqué ou d’une autre portée : même refus', async () => {
    const { token, id } = await openLink();
    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toBeDefined();

    await expectUniform404(getChargeCallPaymentByToken('x'.repeat(43), VISITOR));
    await expectUniform404(getChargeCallPaymentByToken('court', VISITOR));
    await expectUniform404(getChargeCallPaymentByToken('', VISITOR));

    const row = db.links.find(link => link.id === id)!;
    row.expiresAt = new Date(Date.now() - 1000);
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));

    row.expiresAt = new Date(Date.now() + 86_400_000);
    row.revokedAt = new Date();
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));

    row.revokedAt = null;
    row.scope = 'INSTALLMENT_PAYMENT';
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));

    row.scope = 'CHARGE_CALL_PAYMENT';
    row.objectType = 'RentalInstallment';
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
  });

  it('agence suspendue ou inactive : même refus', async () => {
    const { token } = await openLink();
    db.store.tenants[0].status = 'SUSPENDED';
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));

    db.store.tenants[0].status = 'ACTIVE';
    db.store.tenants[0].isActive = false;
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
  });

  it('appel soldé : même refus, et la consultation n’est pas comptée', async () => {
    const { token, id } = await openLink();
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 30000 });

    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
    await expectUniform404(startChargeCallPaymentByToken(token, VISITOR));
    expect(db.links.find(link => link.id === id)!.viewCount).toBe(0);
    expect(db.engine.client.buildAway).not.toHaveBeenCalled();
  });

  it('copropriété non configurée, configuration désactivée ou droit SYNDIC refusé : même refus', async () => {
    const { token } = await openLink();

    db.store.configs[0].isActive = false;
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
    await expectUniform404(startChargeCallPaymentByToken(token, VISITOR));
    db.store.configs[0].isActive = true;

    db.engine.evaluateSchedulingGate.mockResolvedValue('SYNDIC_FEATURE_DENIED');
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
    await expectUniform404(startChargeCallPaymentByToken(token, VISITOR));
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('appel disparu ou d’une autre agence que celle du lien : même refus', async () => {
    const { token } = await openLink();
    db.store.calls.splice(0, db.store.calls.length, ...db.store.calls.filter(call => call.id !== IDS.C1));
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));

    // Lien de l'agence 1 forgé vers l'appel de l'agence 2 : introuvable dans l'agence du lien.
    db.reset();
    const forged = await openLink();
    db.links.find(link => link.id === forged.id)!.objectId = IDS.CB;
    await expectUniform404(getChargeCallPaymentByToken(forged.token, VISITOR));
  });

  it('devise étrangère : même refus', async () => {
    const { token } = await openLink();
    db.store.calls.find(call => call.id === IDS.C1)!.currency = 'EUR';
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
  });
});

describe('lot revendu (R27)', () => {
  it('le copropriétaire actuel est propriétaire depuis APRÈS la période de l’appel : lien inopérant', async () => {
    const { token } = await openLink();
    // Ancien propriétaire (parti en juillet) et nouveau (depuis le 1er juillet 2026) ; l'appel est de janvier.
    db.addOwnerProfile({ contactId: 'contact-ancien', ownedUntil: new Date('2026-06-30T00:00:00.000Z') });
    db.addOwnerProfile({ contactId: 'contact-nouveau', ownedSince: new Date('2026-07-01T00:00:00.000Z') });

    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
    await expectUniform404(startChargeCallPaymentByToken(token, VISITOR));
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('changement de propriétaire (ancien jusqu’au 30/06, nouveau depuis le 01/07) : appel de mai refusé, appel de juillet accepté', async () => {
    const { token } = await openLink();
    // Ancien propriétaire désactivé : sa fiche compte quand même pour l'historique.
    db.addOwnerProfile({
      contactId: 'contact-ancien',
      ownedUntil: new Date('2026-06-30T00:00:00.000Z'),
      isActive: false
    });
    db.addOwnerProfile({ contactId: IDS.AWA, ownedSince: new Date('2026-07-01T00:00:00.000Z') });
    const call = db.store.calls.find(row => row.id === IDS.C1)!;

    call.dueDate = new Date('2026-05-10T00:00:00.000Z');
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));

    call.dueDate = new Date('2026-07-10T00:00:00.000Z');
    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toMatchObject({ amountDue: 30000 });
  });

  it('propriétaire unique, profil créé aujourd’hui, appel de janvier : lien accepté (pas d’OWNER_CHANGED)', async () => {
    const { token } = await openLink();
    db.addOwnerProfile({ contactId: IDS.AWA, ownedSince: new Date('2026-10-18T00:00:00.000Z') });
    db.store.calls.find(row => row.id === IDS.C1)!.dueDate = new Date('2026-01-10T00:00:00.000Z');

    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toMatchObject({ amountDue: 30000 });
    await startChargeCallPaymentByToken(token, VISITOR);
    expect(db.store.checkouts[0].contactId).toBe(IDS.AWA);
  });

  it('indivision : deux contacts propriétaires en même temps (l’un depuis 2020, l’autre depuis aujourd’hui) : aucun OWNER_CHANGED', async () => {
    const { token } = await openLink();
    db.addOwnerProfile({ contactId: 'contact-depuis-2020', ownershipPercentage: 50 });
    db.addOwnerProfile({
      contactId: IDS.AWA,
      ownershipPercentage: 50,
      ownedSince: new Date('2026-10-18T00:00:00.000Z')
    });
    db.store.calls.find(row => row.id === IDS.C1)!.dueDate = new Date('2026-01-10T00:00:00.000Z');

    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toMatchObject({ amountDue: 30000 });
  });

  it('un autre propriétaire commencé le même jour n’est pas un ancien propriétaire (jour UTC)', async () => {
    const { token } = await openLink();
    db.addOwnerProfile({ contactId: 'contact-coindivisaire', ownedSince: new Date('2026-10-18T18:00:00.000Z') });
    db.addOwnerProfile({ contactId: IDS.AWA, ownedSince: new Date('2026-10-18T00:00:00.000Z') });
    db.store.calls.find(row => row.id === IDS.C1)!.dueDate = new Date('2026-01-10T00:00:00.000Z');

    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toBeDefined();
  });

  it('le copropriétaire actuel l’est depuis avant l’appel : payable, et il est le payeur', async () => {
    const { token } = await openLink();
    db.addOwnerProfile({ contactId: IDS.AWA, ownedSince: new Date('2025-06-01T00:00:00.000Z') });

    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toMatchObject({ amountDue: 30000 });
    await startChargeCallPaymentByToken(token, VISITOR);
    expect(db.store.checkouts[0].contactId).toBe(IDS.AWA);
  });

  it('la période de l’appel (periodStart) prime sur l’échéance', async () => {
    const { token } = await openLink();
    db.store.calls.find(call => call.id === IDS.C1)!.periodStart = new Date('2026-07-01T00:00:00.000Z');
    db.addOwnerProfile({ contactId: 'contact-ancien', ownedUntil: new Date('2026-06-30T00:00:00.000Z') });
    db.addOwnerProfile({ ownedSince: new Date('2026-07-01T00:00:00.000Z') });

    // Propriétaire depuis le premier jour de la période : l'appel est le sien (même si l'échéance est antérieure).
    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toBeDefined();

    db.profiles[1].ownedSince = new Date('2026-07-02T00:00:00.000Z');
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
  });

  it('un lot ancien sans fiche de propriété garde le comportement historique (payable)', async () => {
    const { token } = await openLink();
    expect(db.profiles).toHaveLength(0);
    await expect(getChargeCallPaymentByToken(token, VISITOR)).resolves.toBeDefined();
  });
});

describe('démarrage du paiement (POST /charge-call-payment/start)', () => {
  it('démarre un paiement d’origine SECURE_LINK pour CET appel, au reste dû recalculé', async () => {
    db.addOwnerProfile();
    const { token, id } = await openLink();
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 5000 });

    const { checkoutUrl, reused } = await startChargeCallPaymentByToken(token, VISITOR);

    expect(reused).toBe(false);
    expect(checkoutUrl).toBe('http://localhost:8001/api/payment-gateway/simulator/X');
    expect(db.store.checkouts).toHaveLength(1);
    expect(db.store.checkouts[0]).toMatchObject({
      tenantId: IDS.T1,
      syndicateId: IDS.S1,
      lotId: IDS.L1,
      origin: 'SECURE_LINK',
      secureLinkId: id,
      tenantClientId: null,
      contactId: IDS.AWA,
      chargeCallIds: [IDS.C1],
      status: 'PENDING',
      createdByUserId: MANAGER
    });
    expect(Number(db.store.checkouts[0].amount)).toBe(25000);
    const [, request] = db.engine.client.buildAway.mock.calls[0];
    expect(request).toMatchObject({
      montant: 25000,
      urlRetour: expect.stringMatching(/\/payer-charges\/statut\?paiement=IMS-/)
    });
  });

  it('journalise le démarrage sans jeton ni URL', async () => {
    const { token, id } = await openLink();

    await startChargeCallPaymentByToken(token, VISITOR);

    const audit = db.engine.logAuditEvent.mock.calls
      .map((call: any[]) => call[0])
      .find((event: any) => event.actionKey === 'SECURE_LINK_CHARGE_PAYMENT_STARTED');
    expect(audit).toMatchObject({
      tenantId: IDS.T1,
      entityId: id,
      ipAddress: VISITOR.ip,
      payload: { linkId: id, chargeCallId: IDS.C1, amount: 30000, reused: false }
    });
    expect(JSON.stringify(db.engine.logAuditEvent.mock.calls)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain('localhost:8001');
  });

  it('un lien automatique (sans auteur) démarre avec createdByUserId nul', async () => {
    const { token } = await openLink(IDS.C1, IDS.S1, null);
    await startChargeCallPaymentByToken(token, VISITOR);
    expect(db.store.checkouts[0].createdByUserId).toBeNull();
  });

  it('reprend le paiement PENDING récent du même lien : même URL, une seule tentative', async () => {
    const { token } = await openLink();

    const first = await startChargeCallPaymentByToken(token, VISITOR);
    const second = await startChargeCallPaymentByToken(token, VISITOR);

    expect(second).toEqual({ checkoutUrl: first.checkoutUrl, reused: true });
    expect(db.store.checkouts).toHaveLength(1);
    expect(db.engine.client.buildAway).toHaveBeenCalledTimes(1);
  });

  it('409 quand un paiement du portail est déjà en cours sur cet appel, sans rien divulguer', async () => {
    const { token } = await openLink();
    db.addCheckout({ chargeCallIds: [IDS.C1], origin: 'PORTAL', createdAt: new Date(Date.now() - 60_000) });

    const error: any = await startChargeCallPaymentByToken(token, VISITOR).catch(e => e);

    expect(error).toMatchObject({ statusCode: 409, code: 'ONLINE_PAYMENT_IN_PROGRESS' });
    expect(error.data).toBeUndefined();
    expect(db.store.checkouts).toHaveLength(1);
  });

  it('409 « en cours de vérification » quand un paiement attend la décision du syndic', async () => {
    const { token } = await openLink();
    db.addCheckout({ chargeCallIds: [IDS.C1], status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' });

    await expectAppError(startChargeCallPaymentByToken(token, VISITOR), 409, 'ONLINE_PAYMENT_UNDER_REVIEW');
  });

  it('502 quand le fournisseur est injoignable, la tentative passe FAILED', async () => {
    const { token } = await openLink();
    db.engine.client.buildAway.mockRejectedValue(new Error('timeout'));

    await expectAppError(startChargeCallPaymentByToken(token, VISITOR), 502, 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE');
    expect(db.store.checkouts[0].status).toBe('FAILED');
  });

  it('un refus du moteur entre la lecture et le démarrage reste un 404 uniforme', async () => {
    const { token } = await openLink();
    // 1er appel (disponibilité du lien) : droit accordé ; 2e (moteur) : droit retiré entre-temps.
    db.engine.evaluateSchedulingGate.mockResolvedValueOnce(null).mockResolvedValueOnce('SYNDIC_FEATURE_DENIED');

    await expectUniform404(startChargeCallPaymentByToken(token, VISITOR));
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('refuse (502) une URL de reprise que le contrôle de redirection ne tolère pas', async () => {
    const { token, id } = await openLink();
    db.addCheckout({
      chargeCallIds: [IDS.C1],
      origin: 'SECURE_LINK',
      secureLinkId: id,
      tenantClientId: null,
      amount: 30000,
      checkoutUrl: 'javascript:alert(1)'
    });

    await expectAppError(startChargeCallPaymentByToken(token, VISITOR), 502, 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE');
  });
});

describe('statut du paiement (POST /charge-call-payment/status)', () => {
  const CODE = 'IMS-abcdefghij0123456789';
  const linkCheckout = (overrides: Record<string, unknown> = {}) =>
    db.addCheckout({
      origin: 'SECURE_LINK',
      secureLinkId: 'link-x',
      tenantClientId: null,
      chargeCallIds: [IDS.C1],
      amount: 30000,
      codePaiement: CODE,
      lastCheckedAt: null,
      ...overrides
    });

  it('un code mal formé est refusé sans lecture en base', async () => {
    for (const bad of [
      '',
      'IMS-court',
      'IMT-abcdefghij0123456789',
      `${CODE}x`,
      'IMS-abcdefghij012345678!',
      42 as any
    ]) {
      await expectUniform404(getChargeCallPaymentStatusByCode(bad));
    }
    expect(db.prisma.syndicOnlineCheckout.findFirst).not.toHaveBeenCalled();
  });

  it('un code inconnu, un code du portail ou une agence suspendue répondent comme un lien invalide', async () => {
    await expectUniform404(getChargeCallPaymentStatusByCode(CODE));

    const portal = db.addCheckout({ origin: 'PORTAL', secureLinkId: null, codePaiement: CODE });
    await expectUniform404(getChargeCallPaymentStatusByCode(CODE));
    db.store.checkouts.splice(db.store.checkouts.indexOf(portal), 1);

    linkCheckout();
    db.store.tenants[0].status = 'SUSPENDED';
    await expectUniform404(getChargeCallPaymentStatusByCode(CODE));
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });

  it('rapproche une tentative PENDING auprès du fournisseur : succès, montant et période', async () => {
    linkCheckout();

    const dto = await getChargeCallPaymentStatusByCode(CODE);

    expect(dto).toEqual({
      status: 'SUCCESS',
      amount: 30000,
      currency: 'FCFA',
      syndicateName: 'Résidence Les Palmiers',
      period: '2026-01'
    });
    expect(db.engine.client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('une seule vérification par fenêtre de 10 secondes', async () => {
    db.engine.client.getStatus.mockResolvedValue(providerStatus({ rawState: 'PENDING', mappedState: 'PENDING' }));
    linkCheckout();

    expect((await getChargeCallPaymentStatusByCode(CODE)).status).toBe('PENDING');
    expect((await getChargeCallPaymentStatusByCode(CODE)).status).toBe('PENDING');
    expect(db.engine.client.getStatus).toHaveBeenCalledTimes(1);

    db.store.checkouts[0].lastCheckedAt = new Date(Date.now() - 11_000);
    await getChargeCallPaymentStatusByCode(CODE);
    expect(db.engine.client.getStatus).toHaveBeenCalledTimes(2);
  });

  it('fournisseur injoignable : l’état stocké est renvoyé, sans erreur', async () => {
    db.engine.client.getStatus.mockRejectedValue(new Error('réseau'));
    linkCheckout();

    await expect(getChargeCallPaymentStatusByCode(CODE)).resolves.toMatchObject({ status: 'PENDING', amount: 30000 });
  });

  it('présente REVIEW comme PENDING et EXPIRED comme CANCELED', async () => {
    const row = linkCheckout({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' });
    expect((await getChargeCallPaymentStatusByCode(CODE)).status).toBe('PENDING');

    row.status = 'EXPIRED';
    expect((await getChargeCallPaymentStatusByCode(CODE)).status).toBe('CANCELED');

    row.status = 'FAILED';
    expect((await getChargeCallPaymentStatusByCode(CODE)).status).toBe('FAILED');
  });
});

describe('côté gestionnaire', () => {
  it('crée un lien pour un appel de la copropriété et ne renvoie l’URL qu’à la création', async () => {
    const { link, context } = await createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, MANAGER);

    expect(link.url).toMatch(/\/payer-charges#.{20,}$/);
    expect(context).toMatchObject({ amountDue: 30000, currency: 'XOF', chargeCallId: IDS.C1 });
    expect(db.links[0]).toMatchObject({
      tenantId: IDS.T1,
      scope: 'CHARGE_CALL_PAYMENT',
      objectType: 'ChargeCall',
      objectId: IDS.C1,
      createdByUserId: MANAGER
    });
    // Jamais le jeton en clair en base : l'empreinte seule.
    expect(JSON.stringify(db.links)).not.toContain(link.token);
  });

  it('une durée de plus de 30 jours est refusée (400), jamais tronquée', async () => {
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, MANAGER, { ttlDays: 31 }), 400);
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, MANAGER, { ttlDays: 0 }), 400);
    expect(db.links).toHaveLength(0);

    const { link } = await createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, MANAGER, { ttlDays: 3 });
    expect(Math.round((link.expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(3);
  });

  it('un appel d’une autre copropriété ou d’une autre agence répond comme un appel inexistant (404)', async () => {
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C4, MANAGER), 404);
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.CB, MANAGER), 404);
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.SB, IDS.CB, MANAGER), 404);
    await expectAppError(createChargeCallPaymentLink(IDS.T2, IDS.S1, IDS.C1, MANAGER), 404);
    await expectAppError(
      createChargeCallPaymentLink(IDS.T1, IDS.S1, '00000000-0000-4000-8000-0000000000ff', MANAGER),
      404
    );
    expect(db.links).toHaveLength(0);
  });

  it('refuse un appel soldé, une copropriété non configurée, un droit retiré et un lot revendu', async () => {
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 30000 });
    await expectAppError(
      createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, MANAGER),
      400,
      'ONLINE_PAYMENT_NOTHING_DUE'
    );

    // S2 n'a aucune configuration (l'agence en a une, mais le paiement est propre à la copropriété).
    await expectAppError(
      createChargeCallPaymentLink(IDS.T1, IDS.S2, IDS.C4, MANAGER),
      400,
      'ONLINE_PAYMENT_UNAVAILABLE'
    );

    db.engine.evaluateSchedulingGate.mockResolvedValue('SYNDIC_FEATURE_DENIED');
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C2, MANAGER), 403, 'SYNDIC_FEATURE_DENIED');
    db.engine.evaluateSchedulingGate.mockResolvedValue(null);

    db.addOwnerProfile({ contactId: 'contact-ancien', ownedUntil: new Date('2026-06-30T00:00:00.000Z') });
    db.addOwnerProfile({ contactId: 'contact-nouveau', ownedSince: new Date('2026-07-01T00:00:00.000Z') });
    await expectAppError(createChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C2, MANAGER), 400);
    expect(db.links).toHaveLength(0);
  });

  it('liste les liens de l’appel sans jeton, empreinte ni URL, avec le dernier paiement', async () => {
    const a = await openLink(IDS.C1, IDS.S1, MANAGER);
    const b = await openLink(IDS.C1, IDS.S1, null);
    await openLink(IDS.C2); // autre appel : jamais listé
    db.addCheckout({
      chargeCallIds: [IDS.C1],
      origin: 'SECURE_LINK',
      secureLinkId: a.id,
      amount: 30000,
      status: 'SUCCESS',
      tenantClientId: null
    });
    db.links.find(link => link.id === b.id)!.revokedAt = new Date();

    const list = await listChargeCallPaymentLinks(IDS.T1, IDS.S1, IDS.C1);

    expect(list).toHaveLength(2);
    const byId = new Map(list.map(item => [item.id, item]));
    expect(byId.get(a.id)).toMatchObject({
      status: 'ACTIVE',
      createdByUserId: MANAGER,
      viewCount: 0,
      payment: { status: 'SUCCESS', amount: 30000 }
    });
    expect(byId.get(b.id)).toMatchObject({
      status: 'REVOKED',
      createdByUserId: null,
      payment: { status: 'NONE', amount: null, updatedAt: null }
    });
    const serialized = JSON.stringify(list);
    expect(serialized).not.toMatch(/token|hash|payer-charges/i);
    expect(serialized).not.toContain(a.token);
  });

  it('lister les liens d’un appel d’une autre agence ou copropriété : 404', async () => {
    await expectAppError(listChargeCallPaymentLinks(IDS.T1, IDS.S1, IDS.CB), 404);
    await expectAppError(listChargeCallPaymentLinks(IDS.T2, IDS.S1, IDS.C1), 404);
    await expectAppError(listChargeCallPaymentLinks(IDS.T1, IDS.S1, IDS.C4), 404);
  });

  it('révoque un lien (idempotent) : il ne s’ouvre plus ; un lien d’un autre appel est un 404', async () => {
    const { token, id } = await openLink(IDS.C1);
    const other = await openLink(IDS.C2);

    await revokeChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, id, MANAGER);
    await revokeChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, id, MANAGER);
    await expectUniform404(getChargeCallPaymentByToken(token, VISITOR));
    expect(
      db.engine.logAuditEvent.mock.calls.filter((c: any[]) => c[0].actionKey === 'SECURE_LINK_REVOKED')
    ).toHaveLength(1);

    await expectAppError(revokeChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, other.id, MANAGER), 404);
    await expect(getChargeCallPaymentByToken(other.token, VISITOR)).resolves.toBeDefined();
    // Un lien d'une autre agence : introuvable.
    await expectAppError(revokeChargeCallPaymentLink(IDS.T2, IDS.S1, IDS.C1, other.id, MANAGER), 404);
    await expectAppError(revokeChargeCallPaymentLink(IDS.T1, IDS.S1, IDS.C1, 'inconnu', MANAGER), 404);
  });
});

describe('lien automatique (envoi de l’appel)', () => {
  it('révoque les anciens liens automatiques actifs mais garde ceux du gestionnaire', async () => {
    const manual = await openLink();
    const input = { tenantId: IDS.T1, syndicateId: IDS.S1, lotId: IDS.L1, chargeCallIds: [IDS.C1] };

    const first = await createAutomaticChargeCallPaymentUrl(input);
    const second = await createAutomaticChargeCallPaymentUrl(input);

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const auto = db.links.filter(link => link.createdByUserId === null);
    expect(auto).toHaveLength(2);
    expect(auto.filter(link => link.revokedAt === null)).toHaveLength(1);
    expect(db.links.find(link => link.id === manual.id)!.revokedAt).toBeNull();
  });
});
