/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M2 — rapprochement d'une tentative avec PaySecureHub
 * (`reconcileSyndicCheckout*`, tâche planifiée), sur la base en mémoire de
 * `syndics.online-payment-fixtures`.
 */

import {
  createEngineDb,
  IDS,
  CODE,
  SYNDIC_KEY,
  AGENCY_KEY,
  p2002,
  providerStatus
} from './syndics.online-payment-fixtures';

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
jest.mock('../../src/lib/payment-gateway/crypto', () => ({
  decryptSecret: (value: string) => value.replace(/^enc:/, '')
}));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => mockDb.engine.client
}));

import {
  claimStatusWindow,
  findSyndicSimulatorCheckout,
  reconcilePendingSyndicCheckouts,
  reconcileSyndicCheckout,
  reconcileSyndicCheckoutPublic,
  recordSyndicSimulatedOutcome,
  refreshSyndicCheckout,
  verifySyndicCheckout
} from '../../src/lib/syndics/online-payment/checkout-reconcile';
import { getCurrentTenantId } from '../../src/utils/tenant-context';

const status = (overrides: Record<string, unknown> = {}) => providerStatus(overrides);
const payments = () => db.store.payments;
const row = (id: string) => db.store.checkouts.find(c => c.id === id)!;

async function expectAppError(promise: Promise<unknown>, statusCode: number, code?: string) {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

beforeEach(() => {
  db.reset();
  db.engine.client.getStatus.mockResolvedValue(status());
});

describe('succès : un seul encaissement', () => {
  it('enregistre le paiement en ligne (MOBILE_MONEY, 5525, ONLINE), les reçus, et envoie les documents après le commit', async () => {
    const checkout = db.addCheckout();

    const { checkout: result, changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(changed).toBe(true);
    expect(result).toMatchObject({ status: 'SUCCESS', providerTransactionId: 'TX-1', providerServiceName: 'Wave CI' });
    expect(payments()).toHaveLength(1);
    expect(result.chargePaymentId).toBe(payments()[0].id);
    expect(db.engine.recordLotPaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: IDS.T1,
        syndicateId: IDS.S1,
        lotId: IDS.L1,
        amount: 50000,
        method: 'MOBILE_MONEY',
        reference: CODE,
        idempotencyKey: CODE,
        providerTransactionId: 'TX-1',
        origin: 'ONLINE',
        treasuryAccountNumber: '5525',
        chargeCallIds: [IDS.C1, IDS.C2]
      })
    );
    expect(db.engine.issueReceiptsForPaymentTx).toHaveBeenCalledTimes(1);
    expect(db.engine.scheduleChargeDocumentDelivery).toHaveBeenCalledTimes(1);
    expect(db.engine.scheduleChargeDocumentDelivery.mock.calls[0][0]).toBe(IDS.T1);
    expect(db.engine.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_ONLINE_PAYMENT_CONFIRMED' })
    );
    // Les deux appels sont soldés par ce paiement.
    expect(db.store.allocations.map(a => a.amount).sort()).toEqual([20000, 30000]);
  });

  it('rejouer deux fois de suite ne crée rien de plus', async () => {
    const checkout = db.addCheckout();

    await reconcileSyndicCheckout(IDS.T1, checkout.id);
    const second = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(second.changed).toBe(false);
    expect(payments()).toHaveLength(1);
    expect(db.engine.issueReceiptsForPaymentTx).toHaveBeenCalledTimes(1);
    expect(db.engine.scheduleChargeDocumentDelivery).toHaveBeenCalledTimes(1);
  });

  it('deux rapprochements simultanés (IPN + tâche) : un seul vainqueur, un seul paiement, un seul reçu', async () => {
    const checkout = db.addCheckout();

    const [a, b] = await Promise.all([
      reconcileSyndicCheckout(IDS.T1, checkout.id),
      reconcileSyndicCheckout(IDS.T1, checkout.id)
    ]);

    expect([a.changed, b.changed].filter(Boolean)).toHaveLength(1);
    expect(payments()).toHaveLength(1);
    expect(db.engine.issueReceiptsForPaymentTx).toHaveBeenCalledTimes(1);
    expect(db.engine.scheduleChargeDocumentDelivery).toHaveBeenCalledTimes(1);
    expect(row(checkout.id).status).toBe('SUCCESS');
  });

  it('un rejeu de la clé d’idempotence rattache le paiement existant, sans REVIEW ni nouveau reçu', async () => {
    const checkout = db.addCheckout();
    db.store.payments.push({
      id: 'pay-existing',
      lotId: IDS.L1,
      amount: 50000,
      unallocatedAmount: 0,
      idempotencyKey: CODE,
      providerTransactionId: 'TX-1'
    });

    const { checkout: result } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(result).toMatchObject({ status: 'SUCCESS', chargePaymentId: 'pay-existing' });
    expect(payments()).toHaveLength(1);
    expect(db.engine.recordLotPaymentTx).not.toHaveBeenCalled();
    expect(db.engine.issueReceiptsForPaymentTx).not.toHaveBeenCalled();
  });

  it('course sur la clé d’idempotence (P2002 en base) : la transaction est rejouée une fois et rattache le paiement', async () => {
    const checkout = db.addCheckout();
    db.engine.recordLotPaymentTx.mockImplementationOnce(async () => {
      // Un rejeu concurrent (autre connexion) a validé son paiement entre le contrôle et l'écriture.
      db.store.afterRollback.push(() =>
        db.store.payments.push({
          id: 'pay-race',
          lotId: IDS.L1,
          amount: 50000,
          unallocatedAmount: 0,
          idempotencyKey: CODE
        })
      );
      throw p2002('idempotency_key');
    });

    const { checkout: result } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(result).toMatchObject({ status: 'SUCCESS', chargePaymentId: 'pay-race' });
    expect(payments()).toHaveLength(1);
    expect(db.engine.issueReceiptsForPaymentTx).not.toHaveBeenCalled();
  });

  it('un appel soldé entre-temps par un paiement manuel : le reste dû ne couvre plus le paiement -> REVIEW (l’ACCEPT garde l’avance)', async () => {
    const checkout = db.addCheckout();
    db.store.allocations.push({ id: 'manual', paymentId: 'p0', chargeCallId: IDS.C1, amount: 30000 });

    const { checkout: result } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(result).toMatchObject({ status: 'REVIEW', reviewKind: 'CALLS_UNAVAILABLE' });
    expect(payments()).toHaveLength(0);
  });
});

describe('cas douteux : REVIEW, rien d’enregistré', () => {
  const noMoney = (id: string, kind: string) => {
    expect(payments()).toHaveLength(0);
    expect(db.store.allocations).toHaveLength(0);
    expect(db.store.receipts).toHaveLength(0);
    expect(db.engine.scheduleChargeDocumentDelivery).not.toHaveBeenCalled();
    expect(row(id)).toMatchObject({ status: 'REVIEW', reviewKind: kind, chargePaymentId: null });
  };

  it('montant payé différent du montant attendu -> AMOUNT_MISMATCH', async () => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockResolvedValue(status({ amount: 49000 }));

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    noMoney(checkout.id, 'AMOUNT_MISMATCH');
    expect(Number(row(checkout.id).receivedAmount)).toBe(49000);
    expect(db.engine.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'SYNDIC_ONLINE_PAYMENT_REVIEW' })
    );
  });

  it('exercice clos -> FISCAL_YEAR_CLOSED, transaction abandonnée (claim compris)', async () => {
    const checkout = db.addCheckout();
    db.store.closedYears.add(String(new Date().getUTCFullYear()));

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    noMoney(checkout.id, 'FISCAL_YEAR_CLOSED');
    expect(row(checkout.id).completedAt).toBeNull();
    expect(String(row(checkout.id).reviewReason)).toContain('Exercice clos');
  });

  it('appel disparu -> CALLS_UNAVAILABLE', async () => {
    const checkout = db.addCheckout();
    db.store.calls.splice(
      db.store.calls.findIndex(c => c.id === IDS.C2),
      1
    );

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    noMoney(checkout.id, 'CALLS_UNAVAILABLE');
  });

  it('transaction fournisseur déjà enregistrée sur un autre paiement -> DUPLICATE_TRANSACTION', async () => {
    const checkout = db.addCheckout();
    db.store.payments.push({
      id: 'other',
      lotId: IDS.L2,
      amount: 1,
      providerTransactionId: 'TX-1',
      idempotencyKey: 'IMS-other'
    });

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(payments()).toHaveLength(1); // seulement l'autre
    expect(row(checkout.id)).toMatchObject({
      status: 'REVIEW',
      reviewKind: 'DUPLICATE_TRANSACTION',
      chargePaymentId: null
    });
  });

  it('P2002 sur la transaction fournisseur à l’écriture (course) -> DUPLICATE_TRANSACTION', async () => {
    const checkout = db.addCheckout();
    db.engine.recordLotPaymentTx.mockImplementationOnce(async () => {
      throw p2002('provider_transaction_id');
    });

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', reviewKind: 'DUPLICATE_TRANSACTION' });
    expect(payments()).toHaveLength(0);
  });

  it('échec fournisseur APRÈS un succès : REVIEW CONTRARY_STATE, l’encaissement est conservé', async () => {
    const checkout = db.addCheckout();
    await reconcileSyndicCheckout(IDS.T1, checkout.id);
    expect(payments()).toHaveLength(1);

    db.engine.client.getStatus.mockResolvedValue(status({ rawState: 'FAILED', mappedState: 'FAILED' }));
    const { checkout: result, changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(changed).toBe(true);
    expect(result).toMatchObject({ status: 'REVIEW', reviewKind: 'CONTRARY_STATE' });
    expect(result.chargePaymentId).toBe(payments()[0].id);
    expect(payments()).toHaveLength(1);
  });

  it('pendant un REVIEW, une vérification ne fait que mettre à jour le suivi (jamais d’encaissement)', async () => {
    const checkout = db.addCheckout({ status: 'REVIEW', reviewKind: 'FISCAL_YEAR_CLOSED', reviewReason: 'x' });

    const { checkout: result, changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(changed).toBe(false);
    expect(result).toMatchObject({
      status: 'REVIEW',
      reviewKind: 'FISCAL_YEAR_CLOSED',
      lastProviderState: 'SUCCESSFUL'
    });
    expect(result.lastCheckedAt).toBeInstanceOf(Date);
    expect(payments()).toHaveLength(0);
    expect(db.engine.recordLotPaymentTx).not.toHaveBeenCalled();
  });

  it('une erreur non métier ne passe PAS en REVIEW : la tentative reste PENDING, la tâche reprendra', async () => {
    const checkout = db.addCheckout();
    db.engine.recordLotPaymentTx.mockRejectedValueOnce(new Error('connexion perdue'));

    await expect(reconcileSyndicCheckout(IDS.T1, checkout.id)).rejects.toThrow('connexion perdue');

    expect(row(checkout.id)).toMatchObject({ status: 'PENDING', chargePaymentId: null, completedAt: null });
    expect(payments()).toHaveLength(0);

    // La reprise suivante aboutit.
    const retry = await reconcileSyndicCheckout(IDS.T1, checkout.id);
    expect(retry.checkout.status).toBe('SUCCESS');
    expect(payments()).toHaveLength(1);
  });
});

describe('échec, annulation, attente, fournisseur injoignable', () => {
  it.each([
    ['FAILED', 'FAILED'],
    ['CANCELED', 'CANCELED']
  ])('fournisseur %s -> tentative %s, aucune écriture métier', async (mapped, expected) => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockResolvedValue(
      status({ rawState: mapped, mappedState: mapped, error: 'Solde insuffisant' })
    );

    const { checkout: result, changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(changed).toBe(true);
    expect(result).toMatchObject({ status: expected, failureMessage: 'Solde insuffisant' });
    expect(payments()).toHaveLength(0);
  });

  it('en attente chez le fournisseur : seul le suivi bouge', async () => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockResolvedValue(status({ rawState: 'PENDING', mappedState: 'PENDING', amount: null }));

    const { checkout: result, changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(changed).toBe(false);
    expect(result).toMatchObject({ status: 'PENDING', checkAttempts: 1 });
    expect(payments()).toHaveLength(0);
  });

  it('un refus manuel ne se rouvre pas : le succès tardif du fournisseur n’enregistre rien', async () => {
    const checkout = db.addCheckout({ status: 'FAILED', resolution: 'REJECTED' });

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(row(checkout.id)).toMatchObject({ status: 'FAILED', resolution: 'REJECTED' });
    expect(payments()).toHaveLength(0);
  });

  it('fournisseur injoignable : 502, la tentative reste PENDING (tentative comptée)', async () => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockRejectedValue(new Error('timeout'));

    await expectAppError(reconcileSyndicCheckout(IDS.T1, checkout.id), 502, 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE');

    expect(row(checkout.id)).toMatchObject({ status: 'PENDING', checkAttempts: 1 });
  });

  it('une tentative EXPIRED sans succès fournisseur reste EXPIRED', async () => {
    const checkout = db.addCheckout({ status: 'EXPIRED' });
    db.engine.client.getStatus.mockResolvedValue(status({ mappedState: 'PENDING', rawState: 'PENDING' }));
    const { changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);
    expect(changed).toBe(false);
    expect(row(checkout.id).status).toBe('EXPIRED');
  });
});

describe('clé et isolation', () => {
  it('redemande le statut avec la clé de LA copropriété de la tentative, jamais celle de l’agence', async () => {
    db.setLive();
    const checkout = db.addCheckout();

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    const [credentials, code] = db.engine.client.getStatus.mock.calls[0];
    expect(code).toBe(CODE);
    expect(credentials).toMatchObject({ tenantId: IDS.T1, merchantId: 'MERCHANT-S1', apiKey: SYNDIC_KEY });
    expect(JSON.stringify(credentials)).not.toContain(AGENCY_KEY);
    expect(db.prisma.paymentGatewayConfig.findUnique).not.toHaveBeenCalled();
    expect(db.prisma.paymentGatewayConfig.findFirst).not.toHaveBeenCalled();
  });

  it('désactiver la configuration n’empêche pas de rapprocher un paiement déjà lancé', async () => {
    db.store.configs[0].isActive = false;
    const checkout = db.addCheckout();

    const { checkout: result } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(result.status).toBe('SUCCESS');
  });

  it('une configuration rattachée à une autre copropriété est ignorée (jamais une autre clé)', async () => {
    db.store.configs[0].syndicateId = IDS.S2;
    const checkout = db.addCheckout();

    const { changed } = await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(changed).toBe(false);
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });

  it('une tentative d’une autre agence ou d’une autre copropriété répond 404', async () => {
    const checkout = db.addCheckout();
    await expectAppError(reconcileSyndicCheckout(IDS.T2, checkout.id), 404);
    await expectAppError(reconcileSyndicCheckout(IDS.T1, checkout.id, { syndicateId: IDS.S2 }), 404);
    await expectAppError(reconcileSyndicCheckout(IDS.T1, '00000000-0000-4000-8000-0000000000aa'), 404);
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });
});

describe('vérification manuelle (bouton « Vérifier »)', () => {
  it('refuse un paiement ni PENDING ni REVIEW : 409 CHECKOUT_NOT_VERIFIABLE', async () => {
    for (const s of ['SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED']) {
      const checkout = db.addCheckout({ status: s, codePaiement: `IMS-${s}${'x'.repeat(20 - s.length)}` });
      await expectAppError(verifySyndicCheckout(IDS.T1, IDS.S1, checkout.id), 409, 'CHECKOUT_NOT_VERIFIABLE');
    }
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });

  it('renvoie la ligne du suivi et changed', async () => {
    const checkout = db.addCheckout();

    const result = await verifySyndicCheckout(IDS.T1, IDS.S1, checkout.id);

    expect(result.changed).toBe(true);
    expect(result.checkout).toMatchObject({
      id: checkout.id,
      status: 'SUCCESS',
      mode: 'SIMULATOR',
      amount: 50000,
      lot: { id: IDS.L1, lotNumber: 'A12' },
      payer: { contactId: IDS.AWA, name: 'Awa Kone' },
      chargeCalls: [
        { id: IDS.C1, period: '2026-01' },
        { id: IDS.C2, period: '2026-02' }
      ]
    });
    expect(JSON.stringify(result.checkout)).not.toContain('checkoutUrl');
  });
});

describe('IPN et page du simulateur (point d’entrée public par code)', () => {
  it('un code inconnu, ou d’un autre préfixe, ne fait rien et ne révèle rien (null)', async () => {
    db.addCheckout();
    await expect(reconcileSyndicCheckoutPublic('IMS-zzzzzzzzzzzzzzzzzzzz')).resolves.toBeNull();
    await expect(reconcileSyndicCheckoutPublic('IMT-abcdefghij0123456789')).resolves.toBeNull();
    await expect(reconcileSyndicCheckoutPublic('IMP-abcdefghij0123456789')).resolves.toBeNull();
    await expect(reconcileSyndicCheckoutPublic('')).resolves.toBeNull();
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });

  it('retrouve l’agence par le code et rapproche dans le contexte de cette agence', async () => {
    db.addCheckout();
    let seenTenant: string | undefined;
    db.engine.client.getStatus.mockImplementation(async () => {
      seenTenant = getCurrentTenantId();
      return status();
    });

    const result = await reconcileSyndicCheckoutPublic(CODE);

    expect(result?.checkout.status).toBe('SUCCESS');
    expect(seenTenant).toBe(IDS.T1);
  });

  it('une agence suspendue voit quand même ses paiements rapprochés (l’argent est chez le fournisseur)', async () => {
    db.store.tenants[0].status = 'SUSPENDED';
    db.addCheckout();
    const result = await reconcileSyndicCheckoutPublic(CODE);
    expect(result?.checkout.status).toBe('SUCCESS');
  });

  it('simulateur : seulement en mode SIMULATOR, agence non suspendue, code Syndic', async () => {
    const checkout = db.addCheckout();
    expect((await findSyndicSimulatorCheckout(CODE))?.id).toBe(checkout.id);
    expect(await findSyndicSimulatorCheckout('IMT-abcdefghij0123456789')).toBeNull();
    expect(await findSyndicSimulatorCheckout('IMS-zzzzzzzzzzzzzzzzzzzz')).toBeNull();

    db.store.configs[0].mode = 'LIVE';
    expect(await findSyndicSimulatorCheckout(CODE)).toBeNull();
    db.store.configs[0].mode = 'SIMULATOR';
    db.store.tenants[0].status = 'SUSPENDED';
    expect(await findSyndicSimulatorCheckout(CODE)).toBeNull();
  });

  it('simulateur : l’issue choisie n’est enregistrée que pour une tentative en attente', async () => {
    const pending = db.addCheckout();
    await recordSyndicSimulatedOutcome(pending as any, 'SUCCESS');
    expect(row(pending.id).simulatedOutcome).toBe('SUCCESS');

    const done = db.addCheckout({ codePaiement: 'IMS-doneabcdefghij012345', status: 'SUCCESS' });
    await recordSyndicSimulatedOutcome(done as any, 'FAILED');
    expect(row(done.id).simulatedOutcome).toBeNull();
  });
});

describe('lectures du portail et de la page publique (fenêtre de 10 s)', () => {
  it('un seul appel fournisseur par fenêtre', async () => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockResolvedValue(status({ rawState: 'PENDING', mappedState: 'PENDING', amount: null }));

    await refreshSyndicCheckout(row(checkout.id) as any);
    await refreshSyndicCheckout(row(checkout.id) as any);

    expect(db.engine.client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('claimStatusWindow : jamais deux gagnants dans la même fenêtre, ni sur une tentative close', async () => {
    const checkout = db.addCheckout();
    const wins = await Promise.all([claimStatusWindow(IDS.T1, checkout.id), claimStatusWindow(IDS.T1, checkout.id)]);
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await claimStatusWindow(IDS.T2, checkout.id)).toBe(false);

    const closed = db.addCheckout({ codePaiement: 'IMS-closedabcdefghij0123', status: 'FAILED' });
    expect(await claimStatusWindow(IDS.T1, closed.id)).toBe(false);
  });

  it('une erreur fournisseur est avalée : l’état stocké est renvoyé', async () => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockRejectedValue(new Error('timeout'));

    const result = await refreshSyndicCheckout(row(checkout.id) as any);

    expect(result.status).toBe('PENDING');
  });

  it('ne rapproche pas une tentative qui n’est plus PENDING', async () => {
    const checkout = db.addCheckout({ status: 'REVIEW' });
    await refreshSyndicCheckout(row(checkout.id) as any);
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });
});

describe('tâche planifiée', () => {
  const ago = (ms: number) => new Date(Date.now() - ms);

  it('rapproche les PENDING de plus de 2 minutes, dans le contexte de leur agence, et laisse les récents', async () => {
    const old = db.addCheckout({ createdAt: ago(5 * 60 * 1000) });
    const fresh = db.addCheckout({ codePaiement: 'IMS-freshabcdefghij01234', createdAt: ago(30 * 1000) });
    const seen: Array<string | undefined> = [];
    db.engine.client.getStatus.mockImplementation(async () => {
      seen.push(getCurrentTenantId());
      return status();
    });

    const result = await reconcilePendingSyndicCheckouts();

    expect(result).toEqual({ reconciled: 1, expired: 0, errors: 0 });
    expect(seen).toEqual([IDS.T1]);
    expect(row(old.id).status).toBe('SUCCESS');
    expect(row(fresh.id).status).toBe('PENDING');
  });

  it('expire après 48 h une tentative toujours en attente, après une dernière vérification réussie', async () => {
    const stale = db.addCheckout({ createdAt: ago(49 * 60 * 60 * 1000) });
    db.engine.client.getStatus.mockResolvedValue(status({ rawState: 'PENDING', mappedState: 'PENDING', amount: null }));

    const result = await reconcilePendingSyndicCheckouts();

    expect(result).toEqual({ reconciled: 1, expired: 1, errors: 0 });
    expect(db.engine.client.getStatus).toHaveBeenCalledTimes(1);
    expect(row(stale.id).status).toBe('EXPIRED');
  });

  it('n’expire PAS si le fournisseur ne répond pas : un vrai paiement ne se perd pas', async () => {
    const stale = db.addCheckout({ createdAt: ago(49 * 60 * 60 * 1000) });
    db.engine.client.getStatus.mockRejectedValue(new Error('timeout'));

    const result = await reconcilePendingSyndicCheckouts();

    expect(result).toEqual({ reconciled: 0, expired: 0, errors: 1 });
    expect(row(stale.id).status).toBe('PENDING');
  });

  it('un succès tardif (49 h) est encaissé, pas expiré', async () => {
    const stale = db.addCheckout({ createdAt: ago(49 * 60 * 60 * 1000) });

    const result = await reconcilePendingSyndicCheckouts();

    expect(result.expired).toBe(0);
    expect(row(stale.id).status).toBe('SUCCESS');
    expect(payments()).toHaveLength(1);
  });

  it('ne touche ni les REVIEW ni les tentatives closes', async () => {
    db.addCheckout({ status: 'REVIEW', createdAt: ago(10 * 60 * 1000) });
    db.addCheckout({ codePaiement: 'IMS-closedabcdefghij0123', status: 'FAILED', createdAt: ago(10 * 60 * 1000) });

    const result = await reconcilePendingSyndicCheckouts();

    expect(result).toEqual({ reconciled: 0, expired: 0, errors: 0 });
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });
});

describe('durcissements de l’audit', () => {
  it('double encaissement : appels déjà soldés par une autre tentative -> CALLS_UNAVAILABLE, rien d’enregistré', async () => {
    const checkout = db.addCheckout();
    for (const call of db.store.calls.filter(c => [IDS.C1, IDS.C2].includes(c.id))) {
      db.store.allocations.push({
        id: `a-${call.id}`,
        paymentId: 'p0',
        chargeCallId: call.id,
        amount: Number(call.amount)
      });
    }

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', reviewKind: 'CALLS_UNAVAILABLE' });
    expect(payments()).toHaveLength(0);
  });

  it('succès fournisseur sans montant -> REVIEW AMOUNT_MISMATCH, rien d’encaissé', async () => {
    const checkout = db.addCheckout();
    db.engine.client.getStatus.mockResolvedValue(status({ amount: null }));

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' });
    expect(payments()).toHaveLength(0);
  });

  it('succès rapporté sur une tentative EXPIRED -> REVIEW CONTRARY_STATE, rien d’encaissé', async () => {
    const checkout = db.addCheckout({ status: 'EXPIRED' });

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', reviewKind: 'CONTRARY_STATE' });
    expect(payments()).toHaveLength(0);
    // Montant rapporté : la raison reste la raison générale.
    expect(String(row(checkout.id).reviewReason)).not.toContain('sans en rapporter le montant');
  });

  it('succès tardif sur une tentative EXPIRED sans montant rapporté -> REVIEW CONTRARY_STATE, raison explicite, rien d’encaissé', async () => {
    const checkout = db.addCheckout({ status: 'EXPIRED' });
    db.engine.client.getStatus.mockResolvedValue(status({ amount: null }));

    await reconcileSyndicCheckout(IDS.T1, checkout.id);

    expect(row(checkout.id)).toMatchObject({ status: 'REVIEW', reviewKind: 'CONTRARY_STATE', receivedAmount: null });
    expect(String(row(checkout.id).reviewReason)).toContain('sans en rapporter le montant');
    expect(payments()).toHaveLength(0);
  });

  it('simulateur indisponible (production) -> findSyndicSimulatorCheckout renvoie null', async () => {
    const checkout = db.addCheckout();
    const env = jest.requireActual('../../src/config/env');
    const previous = env.paymentGatewaySimulatorAvailable;
    env.paymentGatewaySimulatorAvailable = false;
    try {
      expect(await findSyndicSimulatorCheckout(CODE)).toBeNull();
    } finally {
      env.paymentGatewaySimulatorAvailable = previous;
    }
    expect((await findSyndicSimulatorCheckout(CODE))?.id).toBe(checkout.id);
  });
});
