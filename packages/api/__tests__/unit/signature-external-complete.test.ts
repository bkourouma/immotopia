/**
 * Fin de signature externe (spec 044, lot S6) : `sealRequest` route vers
 * `completeExternalRequest` quand la demande est confiée à un prestataire :
 * état relu chez lui, PDF signé + preuve privés, clôture conditionnelle,
 * piste SG-R8 contrôlée, jamais de scellement pdf-lib.
 */
type Row = Record<string, any>;
const request: Row = {
  id: 'r1',
  kind: 'SALE_AGREEMENT',
  targetType: 'SaleAgreement',
  targetId: 'sale-1',
  sourceDocumentId: null,
  sourceDocHash: null,
  title: 'Compromis',
  language: 'fr',
  sourceFileKey: '/uploads/signatures/t1/r1/source.pdf',
  sourceHash: '',
  providerId: 'yousign',
  providerRef: 'ys-1',
  createdByUserId: 'u1',
  signers: [
    {
      fullName: 'Awa',
      role: 'ACHETEUR',
      channel: 'EMAIL',
      status: 'SIGNED',
      signedAt: new Date(),
      ipTruncated: null,
      signatureMode: 'PROVIDER',
      signatureTyped: null,
      signatureImageKey: null,
      consentTextHash: null,
      position: 0
    }
  ]
};
const prismaMock: Row = {
  signatureRequest: {
    updateMany: jest.fn(async (..._args: unknown[]) => ({ count: 1 })),
    findFirst: jest.fn(async () => request)
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
const recordAuditEvent = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args)
}));
const appendSignatureEvent = jest.fn(async (..._args: unknown[]) => undefined);
const verifyEventChain = jest.fn(() => ({ ok: true }) as { ok: boolean; brokenAtSeq?: number });
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: (...args: unknown[]) => appendSignatureEvent(...args),
  listChainedEvents: jest.fn(async () => [{ eventHash: 'e'.repeat(64) }]),
  verifyEventChain: () => verifyEventChain()
}));
const source = Buffer.from('%PDF-source');
const writeSignatureFile = jest.fn(async (_t: string, _r: string, name: string) => `/uploads/signatures/t1/r1/${name}`);
jest.mock('../../src/lib/signature/files', () => ({
  readSignatureFile: jest.fn(async () => ({ buffer: source })),
  writeSignatureFile: (...args: [string, string, string]) => writeSignatureFile(...args),
  removeSignatureFile: jest.fn(async () => undefined)
}));
const notifyIssuer = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence'),
  languageOf: () => 'fr',
  notifyIssuer: (...args: unknown[]) => notifyIssuer(...args)
}));
const cancelRequestInternal = jest.fn(async (..._args: unknown[]) => true);
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelRequestInternal: (...args: unknown[]) => cancelRequestInternal(...args)
}));
const sealSignedPdf = jest.fn();
jest.mock('../../src/lib/signature/seal', () => ({ sealSignedPdf: () => sealSignedPdf() }));

const client = {
  id: 'yousign',
  getSnapshot: jest.fn(),
  downloadSigned: jest.fn(),
  downloadEvidence: jest.fn()
};
jest.mock('../../src/lib/signature/provider/external', () => ({
  getExternalSignatureClientById: (id: string) => (id === 'yousign' ? client : null)
}));

import { sealRequest } from '../../src/lib/signature/sealing';
import { sha256Hex } from '../../src/lib/signature/evidence';
import {
  registerSignatureSource,
  resetSignatureSourcesForTests,
  SourceChangedError
} from '../../src/lib/signature/sources';
import type { SignatureDocumentSource } from '../../src/lib/signature/sources';

const signedPdf = Buffer.from('%PDF-1.7 signe par le prestataire');
const evidencePdf = Buffer.from('%PDF-1.7 dossier de preuve');
const onSealed = jest.fn(async (..._args: unknown[]) => undefined);
const isSourceIntact = jest.fn(async (..._args: unknown[]) => true);

beforeEach(() => {
  jest.clearAllMocks();
  request.sourceHash = sha256Hex(source);
  request.providerId = 'yousign';
  resetSignatureSourcesForTests();
  registerSignatureSource({
    kind: 'SALE_AGREEMENT',
    targetType: 'SaleAgreement',
    viewPermission: 'v',
    editPermission: 'e',
    feature: 'SALES',
    assertTarget: jest.fn(),
    loadSource: jest.fn(),
    isSourceIntact: (...a: unknown[]) => isSourceIntact(...a),
    onSealed: (...a: unknown[]) => onSealed(...a)
  } as unknown as SignatureDocumentSource);
  verifyEventChain.mockReturnValue({ ok: true });
  client.getSnapshot.mockResolvedValue({ ref: 'ys-1', state: 'DONE', signers: [] });
  client.downloadSigned.mockResolvedValue(signedPdf);
  client.downloadEvidence.mockResolvedValue(evidencePdf);
  isSourceIntact.mockResolvedValue(true);
  prismaMock.signatureRequest.updateMany.mockResolvedValue({ count: 1 });
});

const sealedUpdate = () =>
  prismaMock.signatureRequest.updateMany.mock.calls.find((call: any[]) => call[0].data?.status === 'COMPLETED')?.[0];

describe('fin de signature externe', () => {
  it('DONE : écrit signed.pdf et evidence.pdf, clôt la demande, chaîne SEALED, sans pdf-lib', async () => {
    await expect(sealRequest('t1', 'r1')).resolves.toBe('SEALED');
    const names = writeSignatureFile.mock.calls.map(call => call[2]);
    expect(names).toEqual(['signed.pdf', 'evidence.pdf']);
    expect(sealedUpdate().data).toMatchObject({
      status: 'COMPLETED',
      signedFileKey: '/uploads/signatures/t1/r1/signed.pdf',
      signedHash: sha256Hex(signedPdf),
      sealingAt: null
    });
    expect(onSealed).toHaveBeenCalledTimes(1);
    expect(appendSignatureEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'SEALED',
        payload: { signedHash: sha256Hex(signedPdf), provider: 'yousign', evidenceHash: sha256Hex(evidencePdf) }
      })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: 'SIGNATURE_SEALED' })
    );
    expect(sealSignedPdf).not.toHaveBeenCalled();
    expect(notifyIssuer).toHaveBeenCalled();
  });

  it('état non terminé chez le prestataire : SKIPPED, réservation libérée, rien écrit', async () => {
    client.getSnapshot.mockResolvedValue({ ref: 'ys-1', state: 'ONGOING', signers: [] });
    await expect(sealRequest('t1', 'r1')).resolves.toBe('SKIPPED');
    expect(client.downloadSigned).not.toHaveBeenCalled();
    expect(writeSignatureFile).not.toHaveBeenCalled();
    expect(sealedUpdate()).toBeUndefined();
    expect(prismaMock.signatureRequest.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { sealingAt: null } })
    );
  });

  it('PDF invalide : échec, jamais COMPLETED', async () => {
    client.downloadSigned.mockResolvedValue(Buffer.from('<html>pas un pdf</html>'));
    await expect(sealRequest('t1', 'r1')).resolves.toBe('FAILED');
    expect(writeSignatureFile).not.toHaveBeenCalled();
    expect(sealedUpdate()).toBeUndefined();
  });

  it('PDF vide : échec', async () => {
    client.downloadEvidence.mockResolvedValue(Buffer.alloc(0));
    await expect(sealRequest('t1', 'r1')).resolves.toBe('FAILED');
    expect(sealedUpdate()).toBeUndefined();
  });

  it('document source modifié : annulation SOURCE_CHANGED, prestataire non sollicité', async () => {
    isSourceIntact.mockResolvedValue(false);
    await expect(sealRequest('t1', 'r1')).resolves.toBe('SKIPPED');
    expect(cancelRequestInternal).toHaveBeenCalledWith({ tenantId: 't1', userId: null }, 'r1', 'SOURCE_CHANGED');
    expect(client.getSnapshot).not.toHaveBeenCalled();
  });

  it('onSealed constate un changement : annulation SOURCE_CHANGED', async () => {
    onSealed.mockRejectedValueOnce(new SourceChangedError());
    await expect(sealRequest('t1', 'r1')).resolves.toBe('SKIPPED');
    expect(cancelRequestInternal).toHaveBeenCalledWith({ tenantId: 't1', userId: null }, 'r1', 'SOURCE_CHANGED');
  });

  it('piste de preuve rompue (SG-R8) : FAILED, rien n’est téléchargé', async () => {
    verifyEventChain.mockReturnValue({ ok: false, brokenAtSeq: 2 });
    await expect(sealRequest('t1', 'r1')).resolves.toBe('FAILED');
    expect(client.getSnapshot).not.toHaveBeenCalled();
  });

  it('erreur du prestataire : FAILED sans lever, réservation libérée', async () => {
    client.getSnapshot.mockRejectedValue(new Error('NETWORK'));
    await expect(sealRequest('t1', 'r1')).resolves.toBe('FAILED');
    expect(sealedUpdate()).toBeUndefined();
  });
});
