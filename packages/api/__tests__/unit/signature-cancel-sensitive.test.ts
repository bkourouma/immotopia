/**
 * Annulation d'une demande de mandat de prélèvement (spec 042 §10) : les jetons de consultation sont
 * invalidés et le PDF source (IBAN complet) est supprimé ; un type ordinaire garde son PDF.
 */
type Row = Record<string, any>;
const state: { kind: string } = { kind: 'DIRECT_DEBIT_MANDATE' };
const prismaMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async () => ({
      id: 'r1',
      tenantId: 't1',
      kind: state.kind,
      targetType: 'DIRECT_DEBIT_MANDATE',
      targetId: 'm1',
      sourceDocumentId: null,
      sourceDocHash: null,
      providerRef: null
    })),
    updateMany: jest.fn(async (..._args: unknown[]) => ({ count: 1 }))
  },
  signatureSigner: { updateMany: jest.fn(async (..._args: unknown[]) => ({ count: 2 })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/signature/events', () => ({ appendSignatureEvent: jest.fn(async () => undefined) }));
jest.mock('../../src/lib/signature/quota', () => ({ releaseSignature: jest.fn(async () => undefined) }));
jest.mock('../../src/lib/signature/provider', () => ({
  getSignatureProvider: () => ({ cancel: jest.fn(async () => undefined) })
}));
const removeSignatureFile = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/lib/signature/files', () => ({
  removeSignatureFile: (...args: unknown[]) => removeSignatureFile(...args)
}));
jest.mock('../../src/lib/signature/sources', () => ({
  findSignatureSource: (kind: string) =>
    kind === 'DIRECT_DEBIT_MANDATE' || kind === 'SYNDIC_DIRECT_DEBIT_MANDATE'
      ? { codeBeforeView: true }
      : { onCancel: undefined }
}));

import { cancelRequestInternal } from '../../src/lib/signature/cancel';

const ctx = { tenantId: 't1', userId: 'u1' };

beforeEach(() => {
  jest.clearAllMocks();
  state.kind = 'DIRECT_DEBIT_MANDATE';
  prismaMock.signatureRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe('annulation : données sensibles', () => {
  it.each(['DIRECT_DEBIT_MANDATE', 'SYNDIC_DIRECT_DEBIT_MANDATE'])(
    '%s : jetons de consultation invalidés et source.pdf supprimé',
    async kind => {
      state.kind = kind;
      await expect(cancelRequestInternal(ctx, 'r1', 'USER')).resolves.toBe(true);
      expect(prismaMock.signatureSigner.updateMany).toHaveBeenCalledWith({
        where: { requestId: 'r1', tenantId: 't1' },
        data: { viewGrantHash: null, viewGrantExpiresAt: null }
      });
      expect(removeSignatureFile).toHaveBeenCalledWith('t1', 'r1', 'source.pdf');
    }
  );

  it('type ordinaire : le PDF source est conservé', async () => {
    state.kind = 'RENTAL_CONTRACT';
    await expect(cancelRequestInternal(ctx, 'r1', 'USER')).resolves.toBe(true);
    expect(removeSignatureFile).not.toHaveBeenCalled();
  });

  it('demande déjà annulée : rien n’est invalidé ni supprimé', async () => {
    prismaMock.signatureRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelRequestInternal(ctx, 'r1', 'USER')).resolves.toBe(false);
    expect(prismaMock.signatureSigner.updateMany).not.toHaveBeenCalled();
    expect(removeSignatureFile).not.toHaveBeenCalled();
  });
});
