/**
 * Annulation (spec 044, lot S6) : le prestataire est prévenu avec la référence
 * de la demande ; son échec n'empêche pas l'annulation locale ; une demande
 * déjà annulée ne le rappelle pas.
 */
type Row = Record<string, any>;
const prismaMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async () => ({
      id: 'r1',
      tenantId: 't1',
      kind: 'SALE_AGREEMENT',
      targetType: 'SaleAgreement',
      targetId: 'x',
      sourceDocumentId: null,
      sourceDocHash: null,
      providerRef: 'ys-1'
    })),
    updateMany: jest.fn(async (..._args: unknown[]) => ({ count: 1 }))
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger }));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/signature/events', () => ({ appendSignatureEvent: jest.fn(async () => undefined) }));
jest.mock('../../src/lib/signature/quota', () => ({ releaseSignature: jest.fn(async () => undefined) }));
const providerCancel = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/lib/signature/provider', () => ({
  getSignatureProvider: () => ({ cancel: (...args: unknown[]) => providerCancel(...args) })
}));

import { cancelRequestInternal } from '../../src/lib/signature/cancel';

const ctx = { tenantId: 't1', userId: 'u1' };

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.signatureRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe('annulation avec un prestataire', () => {
  it('prévient le prestataire avec la référence de la demande', async () => {
    await expect(cancelRequestInternal(ctx, 'r1', 'USER')).resolves.toBe(true);
    expect(providerCancel).toHaveBeenCalledWith('r1', { tenantId: 't1', providerRef: 'ys-1' });
  });

  it('un échec chez le prestataire n’empêche pas l’annulation, nom d’erreur seul journalisé', async () => {
    const error = Object.assign(new Error('corps secret'), { name: 'ExternalProviderError' });
    providerCancel.mockRejectedValueOnce(error);
    await expect(cancelRequestInternal(ctx, 'r1', 'USER')).resolves.toBe(true);
    expect(JSON.stringify(logger.warn.mock.calls)).toContain('ExternalProviderError');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('corps secret');
  });

  it('demande déjà annulée localement : le prestataire n’est pas rappelé', async () => {
    prismaMock.signatureRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelRequestInternal(ctx, 'r1', 'USER')).resolves.toBe(false);
    expect(providerCancel).not.toHaveBeenCalled();
  });
});
