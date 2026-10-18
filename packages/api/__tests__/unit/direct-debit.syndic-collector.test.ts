/**
 * Encaisseur SYNDIC_LOT — spec 042, P4 (data-model §9.3).
 *
 * Les services de copropriété (affectation des paiements, reçus, livraison)
 * sont simulés : le test vérifie ce que l'encaisseur leur transmet et ce qu'il rend.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockRecord = jest.fn();
const mockIssue = jest.fn();
const mockDeliver = jest.fn();

jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  recordLotPaymentTx: (...args: unknown[]) => mockRecord(...args)
}));
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: (...args: unknown[]) => mockIssue(...args)
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({
  scheduleChargeDocumentDelivery: (...args: unknown[]) => mockDeliver(...args)
}));

import { ConflictError } from '../../src/middleware/error-middleware';
import { getCollector } from '../../src/lib/direct-debit/collectors';
import { syndicCollector } from '../../src/lib/direct-debit/collectors/syndic';
import { paymentMethodLabel } from '../../src/lib/syndics/charge-receipt-snapshot';

const TENANT = 'tenant-a';
const tx = { marker: 'tx' } as any;
const ctx = { tenantId: TENANT, actorUserId: 'user-1', now: new Date('2026-10-26T09:00:00Z') };
const line = (over: Record<string, unknown> = {}) => ({
  id: 'line-7',
  tenantId: TENANT,
  remittanceId: 'rem-1',
  reference: 'PRL-2026-0001-007',
  mandateId: 'mandate-1',
  amount: 90000,
  scope: 'SYNDIC_LOT' as const,
  leaseId: null,
  installmentId: null,
  lotId: 'lot-1',
  chargeCallIds: ['c1', 'c2'],
  syndicateId: 'syn-1',
  rentalPaymentId: null,
  chargePaymentId: null,
  treasuryAccountId: null,
  ...over
});
const settledAt = new Date('2026-10-26T00:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.mockResolvedValue({ record: { id: 'pay-1' }, result: { allocations: [], advance: 0 } });
  mockIssue.mockResolvedValue([{ id: 'doc-1', kind: 'QUITTANCE' }]);
});

describe('encaisseur SYNDIC_LOT', () => {
  it('est celui du périmètre SYNDIC_LOT ; le lot redevient prélevable une fois la ligne réglée', () => {
    expect(getCollector('SYNDIC_LOT')).toBe(syndicCollector);
    expect(getCollector('RENTAL_LEASE')).not.toBe(syndicCollector);
    expect(syndicCollector.scope).toBe('SYNDIC_LOT');
    expect(syndicCollector.keepsActiveKeyOnSettle).toBe(false);
  });

  it('enregistre le paiement de charges : méthode et origine DIRECT_DEBIT, appels figés, clé d idempotence par ligne', async () => {
    await syndicCollector.settleTx(tx, ctx, line(), settledAt);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(tx, {
      tenantId: TENANT,
      syndicateId: 'syn-1',
      lotId: 'lot-1',
      amount: 90000,
      paidAt: settledAt,
      method: 'DIRECT_DEBIT',
      reference: 'PRL-2026-0001-007',
      chargeCallIds: ['c1', 'c2'],
      actorUserId: 'user-1',
      idempotencyKey: 'direct-debit-line:line-7',
      origin: 'DIRECT_DEBIT'
    });
  });

  it('émet reçus et quittances dans la même transaction, et ne planifie la livraison qu après le commit', async () => {
    const outcome = await syndicCollector.settleTx(tx, ctx, line(), settledAt);

    expect(mockIssue).toHaveBeenCalledWith(tx, {
      tenantId: TENANT,
      syndicateId: 'syn-1',
      lotId: 'lot-1',
      paymentId: 'pay-1',
      result: { allocations: [], advance: 0 },
      actorUserId: 'user-1'
    });
    expect(outcome.chargePaymentId).toBe('pay-1');
    expect(outcome.rentalPaymentId).toBeUndefined();
    expect(mockDeliver).not.toHaveBeenCalled();
    await outcome.afterCommit?.();
    expect(mockDeliver).toHaveBeenCalledWith(TENANT, [{ id: 'doc-1', kind: 'QUITTANCE' }]);
  });

  it('un constat sans acteur (import) passe un acteur nul', async () => {
    await syndicCollector.settleTx(tx, { ...ctx, actorUserId: null }, line(), settledAt);
    expect(mockRecord.mock.calls[0][1].actorUserId).toBeNull();
  });

  it('l erreur d un exercice clos (409) remonte telle quelle, sans émettre de document', async () => {
    const closed = new ConflictError("L'exercice comptable est clos.");
    mockRecord.mockRejectedValueOnce(closed);
    await expect(syndicCollector.settleTx(tx, ctx, line(), settledAt)).rejects.toBe(closed);
    expect(mockIssue).not.toHaveBeenCalled();
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('refuse une ligne sans lot ou sans syndicat', async () => {
    await expect(syndicCollector.settleTx(tx, ctx, line({ lotId: null }), settledAt)).rejects.toBeInstanceOf(
      ConflictError
    );
    await expect(syndicCollector.settleTx(tx, ctx, line({ syndicateId: null }), settledAt)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('refuse le rejet tardif d une ligne déjà réglée : aucune contre-passation d un paiement de charges', async () => {
    const error = await syndicCollector.reverseTx(tx, ctx, line()).catch(e => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toBe(
      "Le rejet d'un prélèvement de charges déjà réglé n'est pas pris en charge : régularisez dans la comptabilité de la copropriété."
    );
  });

  it('ne refacture jamais de frais de rejet en copropriété', async () => {
    await expect(syndicCollector.applyRejectFeeTx(tx, ctx, line(), 5000)).resolves.toEqual({ appliedAmount: 0 });
  });
});

describe('reçus', () => {
  it('le mode de paiement DIRECT_DEBIT est libellé « Prélèvement bancaire »', () => {
    expect(paymentMethodLabel('DIRECT_DEBIT')).toBe('Prélèvement bancaire');
    expect(paymentMethodLabel('direct_debit')).toBe('Prélèvement bancaire');
    expect(paymentMethodLabel('VIREMENT')).toBe('Virement');
  });
});
