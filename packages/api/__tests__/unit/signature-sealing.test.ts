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
const sealSignedPdf = jest.fn(async () => ({ pdf: Buffer.from('%PDF-sealed'), sha256: 's'.repeat(64), pageCount: 3 }));
jest.mock('../../src/lib/signature/seal', () => ({ sealSignedPdf: () => sealSignedPdf() }));

import { recordAuditEvent } from '../../src/services/audit-service';
import { AuditActionKey } from '../../src/types/audit-types';
import { sha256Hex } from '../../src/lib/signature/evidence';
import { sealRequest } from '../../src/lib/signature/sealing';

beforeEach(() => {
  jest.clearAllMocks();
  request.sourceHash = sha256Hex(source);
  verifyEventChain.mockReturnValue({ ok: true });
});

describe('scellement et piste de preuve', () => {
  it('scelle quand la piste est intacte', async () => {
    expect(await sealRequest('t1', 'r1')).toBe('SEALED');
    expect(sealSignedPdf).toHaveBeenCalledTimes(1);
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
