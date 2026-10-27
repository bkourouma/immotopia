/**
 * Retour banque d'une remise de copropriété, de bout en bout (spec 042, P4,
 * data-model §9) : le service de retour et l'encaisseur SYNDIC_LOT sont réels ;
 * seuls la base en mémoire, les services de copropriété (affectation, reçus),
 * l'avis de rejet et le chargeur de DTO (rendu scope-aware comme le vrai) sont simulés.
 *
 * Régression : le rechargement de la remise après un constat sans périmètre
 * (RENTAL par défaut) répondait 404 après avoir encaissé.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockRecord = jest.fn();
const mockIssue = jest.fn();
const mockDeliver = jest.fn();
const mockNotice = jest.fn();
const mockLoadDto = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: require('../helpers/direct-debit-return-db').harness.db }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  recordAuditEvent: jest.fn().mockResolvedValue(undefined),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  recordLotPaymentTx: (...args: unknown[]) => mockRecord(...args)
}));
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: (...args: unknown[]) => mockIssue(...args)
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({
  scheduleChargeDocumentDelivery: (...args: unknown[]) => mockDeliver(...args)
}));
jest.mock('../../src/lib/direct-debit/syndic/notifications', () => ({
  sendSyndicDirectDebitRejectionNotice: (...args: unknown[]) => mockNotice(...args)
}));
jest.mock('../../src/lib/direct-debit/remittance-dto', () => ({
  ...jest.requireActual('../../src/lib/direct-debit/remittance-dto'),
  loadRemittanceDto: (...args: unknown[]) => mockLoadDto(...args)
}));

import { NotFoundError } from '../../src/middleware/error-middleware';
import {
  rejectRemittanceLine,
  settleAllRemittanceLines,
  settleRemittanceLine
} from '../../src/lib/direct-debit/returns';
import { NOW, REMITTANCE, TENANT, harness, lineId } from '../helpers/direct-debit-return-db';

const { state } = harness;
const SYNDIC = { scope: 'SYNDIC_LOT', syndicateId: 'synd-1' } as const;
const OTHER_SYNDIC = { scope: 'SYNDIC_LOT', syndicateId: 'synd-2' } as const;

const line = (n: number) => state.lines.find(row => row.id === lineId(n)) as Record<string, any>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask'
    ]
  });
  harness.reset();

  // La remise de test devient une remise de copropriété.
  const remittance = state.remittances.find(row => row.id === REMITTANCE) as Record<string, any>;
  Object.assign(remittance, {
    scope: 'SYNDIC_LOT',
    syndicateId: 'synd-1',
    creditorOverride: { treasuryAccountId: null }
  });
  state.lines
    .filter(row => row.remittanceId === REMITTANCE)
    .forEach((row, index) => {
      Object.assign(row, {
        leaseId: null,
        installmentId: null,
        lotId: `lot-${index + 1}`,
        chargeCallIds: [`call-${index + 1}`],
        chargePaymentId: null,
        activeKey: `lot:lot-${index + 1}`
      });
    });

  // Le vrai chargeur de DTO filtre par périmètre : sans `ctx`, c'est RENTAL_LEASE.
  mockLoadDto.mockImplementation(
    async (_db: unknown, tenantId: string, id: string, ctx: any = { scope: 'RENTAL_LEASE' }) => {
      const found = state.remittances.find(
        row =>
          row.id === id &&
          row.tenantId === tenantId &&
          row.scope === ctx.scope &&
          (ctx.scope !== 'SYNDIC_LOT' || row.syndicateId === ctx.syndicateId)
      );
      return found ? { id: found.id, reference: 'PRL-2026-0001', scope: found.scope } : null;
    }
  );
  mockRecord.mockImplementation(async (_tx: unknown, input: any) => ({
    record: { id: `cp-${input.idempotencyKey}` },
    result: { allocations: [], advance: 0 }
  }));
  mockIssue.mockResolvedValue([]);
  mockDeliver.mockResolvedValue(undefined);
  mockNotice.mockResolvedValue('SENT');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('retour banque / remise de copropriété', () => {
  it('règle une ligne : encaissement de charges, lien sur la ligne, remise rechargée dans son périmètre', async () => {
    const result = await settleRemittanceLine(
      TENANT,
      SYNDIC,
      REMITTANCE,
      lineId(1),
      { settledAt: '2026-10-27' },
      'user-1'
    );

    expect(result).toMatchObject({ id: REMITTANCE, scope: 'SYNDIC_LOT' });
    expect(mockLoadDto).toHaveBeenCalledWith(expect.anything(), TENANT, REMITTANCE, SYNDIC);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT,
        syndicateId: 'synd-1',
        lotId: 'lot-1',
        chargeCallIds: ['call-1'],
        method: 'DIRECT_DEBIT',
        origin: 'DIRECT_DEBIT'
      })
    );
    expect(line(1)).toMatchObject({ status: 'SETTLED', chargePaymentId: `cp-direct-debit-line:${lineId(1)}` });
    // Le lot redevient prélevable : la clé d'activité est libérée.
    expect(line(1).activeKey).toBeNull();
  });

  it('rejette une ligne : avis de copropriété envoyé, remise rechargée dans son périmètre', async () => {
    const result = await rejectRemittanceLine(
      TENANT,
      SYNDIC,
      REMITTANCE,
      lineId(1),
      { rejectedAt: '2026-10-27', code: 'AC04' },
      'user-1'
    );

    expect(result).toMatchObject({ id: REMITTANCE, scope: 'SYNDIC_LOT' });
    expect(line(1)).toMatchObject({ status: 'REJECTED', rejectionCode: 'AC04' });
    expect(mockNotice).toHaveBeenCalledWith(TENANT, lineId(1), { suspended: false });
  });

  it('constate toute la remise : la réponse est la remise de la copropriété, pas un 404', async () => {
    const result = await settleAllRemittanceLines(TENANT, SYNDIC, REMITTANCE, { settledAt: '2026-10-27' }, 'user-1');

    expect(result.settled).toBe(3);
    expect(result.failed).toEqual([]);
    expect(result.remittance).toMatchObject({ id: REMITTANCE, scope: 'SYNDIC_LOT' });
    expect(mockLoadDto).toHaveBeenCalledWith(expect.anything(), TENANT, REMITTANCE, SYNDIC);
  });

  it('une remise d’un autre syndicat de la même agence reste introuvable', async () => {
    await expect(
      settleRemittanceLine(TENANT, OTHER_SYNDIC, REMITTANCE, lineId(1), { settledAt: '2026-10-27' }, 'user-1')
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
