/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042 — séquence de la recette du simulateur : « Solde insuffisant », puis
 * « Annuler », puis « Payer » sur le même appel. Le vrai client simulateur
 * (`simulatorClient`) est branché sur la base en mémoire de
 * `syndics.online-payment-fixtures` : le statut vient de `simulatedOutcome`, écrit
 * comme le fait `simulatorActionHandler` (trouver, enregistrer l'issue, rapprocher).
 */

import { createEngineDb, IDS } from './syndics.online-payment-fixtures';

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
// Le moteur parle au client « fournisseur » de la base en mémoire ; ci-dessous, ce client EST le simulateur réel.
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => mockDb.engine.client
}));

import { simulatorClient } from '../../src/lib/payment-gateway/paysecurehub/simulator-client';
import { startSyndicCheckout } from '../../src/lib/syndics/online-payment/checkout-start';
import type { StartSyndicCheckoutParams } from '../../src/lib/syndics/online-payment/checkout-start';
import {
  findSyndicSimulatorCheckout,
  reconcileSyndicCheckoutPublic,
  recordSyndicSimulatedOutcome
} from '../../src/lib/syndics/online-payment/checkout-reconcile';
import { listSyndicCheckouts } from '../../src/lib/syndics/online-payment/checkout-queries';

type Outcome = 'SUCCESS' | 'FAILED' | 'CANCELED';

const params: StartSyndicCheckoutParams = {
  tenantId: IDS.T1,
  syndicateId: IDS.S1,
  lotId: IDS.L1,
  chargeCallIds: [IDS.C1],
  origin: 'PORTAL',
  tenantClientId: 'client-1',
  payerContactId: IDS.AWA
};

/** Un clic sur un bouton de la page du simulateur, pas à pas comme `simulatorActionHandler`. */
async function click(codePaiement: string, outcome: Outcome) {
  const checkout = await findSyndicSimulatorCheckout(codePaiement);
  expect(checkout).not.toBeNull();
  await recordSyndicSimulatedOutcome(checkout!, outcome);
  await reconcileSyndicCheckoutPublic(codePaiement);
}

const statusOf = (id: string) => db.store.checkouts.find(c => c.id === id)!.status;
const statuses = () => db.store.checkouts.map(c => c.status);

beforeEach(() => {
  db.reset();
  db.engine.client.buildAway.mockImplementation((credentials: any, request: any) =>
    simulatorClient.buildAway(credentials, request)
  );
  db.engine.client.getStatus.mockImplementation((credentials: any, code: string) =>
    simulatorClient.getStatus(credentials, code)
  );
});

describe('recette du simulateur : « Solde insuffisant », « Annuler », « Payer » sur le même appel', () => {
  it('chaque essai repart d’une nouvelle tentative : Échoué, Annulé et Payé sont tous listés et comptés', async () => {
    const a = (await startSyndicCheckout(params)).checkout;
    await click(a.codePaiement, 'FAILED');

    const b = (await startSyndicCheckout(params)).checkout;
    expect(b.id).not.toBe(a.id); // une tentative close n'est jamais reprise
    await click(b.codePaiement, 'CANCELED');
    expect(statusOf(b.id)).toBe('CANCELED');

    const c = (await startSyndicCheckout(params)).checkout;
    expect(c.id).not.toBe(b.id);
    await click(c.codePaiement, 'SUCCESS');

    expect(statusOf(a.id)).toBe('FAILED');
    expect(statusOf(b.id)).toBe('CANCELED');
    expect(statusOf(c.id)).toBe('SUCCESS');

    const list = await listSyndicCheckouts(IDS.T1, IDS.S1);
    expect(list.counts).toMatchObject({ FAILED: 1, CANCELED: 1, SUCCESS: 1, PENDING: 0, REVIEW: 0 });
    expect(list.items.map(item => item.status).sort()).toEqual(['CANCELED', 'FAILED', 'SUCCESS']);
    const onlyCanceled = await listSyndicCheckouts(IDS.T1, IDS.S1, { status: ['CANCELED'] });
    expect(onlyCanceled.items).toHaveLength(1);
    expect(db.store.payments).toHaveLength(1);
  });

  it('« Annuler » sur la page d’une tentative DÉJÀ close (retour arrière du navigateur) ne crée aucune ligne « Annulé »', async () => {
    const a = (await startSyndicCheckout(params)).checkout;
    await click(a.codePaiement, 'FAILED');

    // Page périmée rouverte avec « Précédent » : l'issue n'est plus enregistrée (la tentative n'est plus en attente).
    await click(a.codePaiement, 'CANCELED');

    expect(statusOf(a.id)).toBe('FAILED');
    expect(db.store.checkouts.find(c => c.id === a.id)!.simulatedOutcome).toBe('FAILED');
    expect(statuses()).toEqual(['FAILED']);
    const list = await listSyndicCheckouts(IDS.T1, IDS.S1);
    expect(list.counts.CANCELED).toBe(0);
  });

  it('« Payer » sur la page périmée d’une tentative close n’encaisse rien', async () => {
    const a = (await startSyndicCheckout(params)).checkout;
    await click(a.codePaiement, 'CANCELED');
    expect(statusOf(a.id)).toBe('CANCELED');

    await click(a.codePaiement, 'SUCCESS');

    expect(statusOf(a.id)).toBe('CANCELED');
    expect(db.store.payments).toHaveLength(0);
  });

  it('si le rapprochement échoue après « Annuler », la tentative reste en attente et le « Payer » suivant la reprend (R10) : aucune trace d’annulation', async () => {
    const a = (await startSyndicCheckout(params)).checkout;

    // Fournisseur injoignable pendant le rapprochement déclenché par le bouton (erreur avalée par le contrôleur).
    db.engine.client.getStatus.mockRejectedValueOnce(new Error('réseau'));
    const checkout = await findSyndicSimulatorCheckout(a.codePaiement);
    await recordSyndicSimulatedOutcome(checkout!, 'CANCELED');
    await expect(reconcileSyndicCheckoutPublic(a.codePaiement)).rejects.toMatchObject({ statusCode: 502 });
    expect(statusOf(a.id)).toBe('PENDING');

    // « Payer » depuis le portail : la tentative encore ouverte est reprise (R10), pas une nouvelle.
    const again = await startSyndicCheckout(params);
    expect(again.reused).toBe(true);
    expect(again.checkout.id).toBe(a.id);

    await click(a.codePaiement, 'SUCCESS');

    expect(statuses()).toEqual(['SUCCESS']);
    expect((await listSyndicCheckouts(IDS.T1, IDS.S1)).counts.CANCELED).toBe(0);
  });
});
