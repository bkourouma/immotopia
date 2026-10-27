/**
 * Scellement (spec 044, SG-R7, SG-R8) : la piste de preuve est vérifiée AVANT de
 * sceller ; une chaîne rompue refuse le scellement (FAILED) et déclenche un audit
 * critique. Garde-fou statique sur la migration de durcissement.
 */
import * as fs from 'fs';
import * as path from 'path';

type Row = Record<string, any>;
const request: Row = {
  id: 'r1',
  kind: 'LEASE_CONTRACT',
  targetType: 'RentalLease',
  targetId: 'l1',
  title: 'Bail',
  language: 'fr',
  providerId: 'internal',
  sourceFileKey: '/uploads/signatures/t1/r1/source.pdf',
  sourceHash: '',
  createdByUserId: 'u1',
  signers: [
    {
      fullName: 'Awa',
      role: 'LOCATAIRE',
      channel: 'EMAIL',
      status: 'SIGNED',
      signedAt: new Date(),
      ipTruncated: null,
      signatureMode: 'TYPED',
      signatureTyped: 'Awa',
      signatureImageKey: null,
      consentTextHash: 'c'.repeat(64),
      position: 0
    }
  ]
};
const prismaMock: Row = {
  signatureRequest: {
    updateMany: jest.fn(async () => ({ count: 1 })),
    findFirst: jest.fn(async () => request)
  },
  rentalLease: { updateMany: jest.fn(async () => ({ count: 1 })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined)
}));
const listChainedEvents = jest.fn(async () => [{ eventHash: 'e'.repeat(64) }]);
const verifyEventChain = jest.fn(() => ({ ok: true }) as { ok: boolean; brokenAtSeq?: number });
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async () => undefined),
  listChainedEvents: () => listChainedEvents(),
  verifyEventChain: () => verifyEventChain()
}));
const source = Buffer.from('%PDF-source');
jest.mock('../../src/lib/signature/files', () => ({
  readSignatureFile: jest.fn(async () => ({ buffer: source })),
  writeSignatureFile: jest.fn(async () => '/uploads/signatures/t1/r1/signed.pdf')
}));
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence'),
  languageOf: () => 'fr',
  notifyIssuer: jest.fn(async () => undefined)
}));
const cancelRequestInternal = jest.fn(async (..._args: unknown[]) => true);
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelRequestInternal: (...args: unknown[]) => (cancelRequestInternal as any)(...args)
}));
const sealSignedPdf = jest.fn(async () => ({ pdf: Buffer.from('%PDF-sealed'), sha256: 's'.repeat(64), pageCount: 3 }));
jest.mock('../../src/lib/signature/seal', () => ({ sealSignedPdf: () => sealSignedPdf() }));

import { recordAuditEvent } from '../../src/services/audit-service';
import { AuditActionKey } from '../../src/types/audit-types';
import { sha256Hex } from '../../src/lib/signature/evidence';
import { sealRequest } from '../../src/lib/signature/sealing';
import { leaseContractSource } from '../../src/lib/signature/sources/lease-contract';
import { SourceChangedError } from '../../src/lib/signature/sources';

beforeEach(() => {
  jest.clearAllMocks();
  request.sourceHash = sha256Hex(source);
  verifyEventChain.mockReturnValue({ ok: true });
});

describe('scellement et piste de preuve', () => {
  it('demande externe sans client configuré : FAILED, jamais de scellement pdf-lib', async () => {
    request.providerId = 'yousign';
    try {
      expect(await sealRequest('t1', 'r1')).toBe('FAILED');
      expect(sealSignedPdf).not.toHaveBeenCalled();
    } finally {
      request.providerId = 'internal';
    }
  });

  it('scelle quand la piste est intacte', async () => {
    expect(await sealRequest('t1', 'r1')).toBe('SEALED');
    expect(sealSignedPdf).toHaveBeenCalledTimes(1);
  });

  it('marque la cible signée par le hook onSealed de sa source, dans la transaction du scellement', async () => {
    const onSealed = jest.spyOn(leaseContractSource, 'onSealed');
    expect(await sealRequest('t1', 'r1')).toBe('SEALED');
    expect(onSealed).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        id: 'r1',
        tenantId: 't1',
        kind: 'LEASE_CONTRACT',
        targetType: 'RentalLease',
        targetId: 'l1'
      }),
      expect.any(Date)
    );
    // Le bail porte signed_at et la demande, comme avant le registre.
    expect(prismaMock.rentalLease.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', tenant_id: 't1' },
      data: { signed_at: expect.any(Date), signature_request_id: 'r1' }
    });
    onSealed.mockRestore();
  });

  it('S-2 : un document changé depuis l’envoi n’est pas scellé, la demande est annulée (SOURCE_CHANGED)', async () => {
    const intact = jest.spyOn(leaseContractSource, 'isSourceIntact').mockResolvedValue(false);
    expect(await sealRequest('t1', 'r1')).toBe('SKIPPED');
    expect(sealSignedPdf).not.toHaveBeenCalled();
    expect(cancelRequestInternal).toHaveBeenCalledWith({ tenantId: 't1', userId: null }, 'r1', 'SOURCE_CHANGED');
    intact.mockRestore();
  });

  it('S-2 : onSealed qui constate un changement dans la transaction annule la demande, sans nouvelle tentative', async () => {
    const onSealed = jest.spyOn(leaseContractSource, 'onSealed').mockRejectedValue(new SourceChangedError());
    expect(await sealRequest('t1', 'r1')).toBe('SKIPPED');
    expect(cancelRequestInternal).toHaveBeenCalledWith({ tenantId: 't1', userId: null }, 'r1', 'SOURCE_CHANGED');
    onSealed.mockRestore();
  });

  it('refuse de sceller une piste rompue : FAILED, audit critique, réservation libérée', async () => {
    verifyEventChain.mockReturnValue({ ok: false, brokenAtSeq: 2 });
    expect(await sealRequest('t1', 'r1')).toBe('FAILED');
    expect(sealSignedPdf).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionKey: AuditActionKey.SIGNATURE_CHAIN_BROKEN,
        payload: { requestId: 'r1', brokenAtSeq: 2 }
      })
    );
    // La réservation du scellement est libérée (sealingAt: null) pour le réessai de la tâche.
    expect(prismaMock.signatureRequest.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { sealingAt: null } })
    );
  });
});

describe('migration de durcissement', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/migrations/20261015110000_signature_durcissement/migration.sql'),
    'utf8'
  );

  it('interdit aussi la suppression, sauf cascade ou purge explicite', () => {
    expect(sql).toMatch(/BEFORE DELETE ON "signature_events"/);
    expect(sql).toMatch(/app\.signature_purge/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "signature_requests"/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it('ajoute l’agent de la signature sur place et l’empreinte du DOCX source', () => {
    expect(sql).toMatch(/ADD COLUMN "in_person_issued_by"/);
    expect(sql).toMatch(/ADD COLUMN "source_doc_hash" CHAR\(64\)/);
  });
});
