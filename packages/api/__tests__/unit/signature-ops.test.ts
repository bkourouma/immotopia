/**
 * Opérations de la signature électronique côté agence (spec 043, revue du
 * 2026-10-15) : relance, jeton sur place, piste de preuve, expiration, tâche,
 * scellement refusé sur une piste rompue, annulation sur changement de contrat.
 */
type Row = Record<string, any>;

const db: { request: Row | null; due: Row[]; claimOk: boolean } = { request: null, due: [], claimOk: true };

const prismaMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async () => db.request),
    findMany: jest.fn(async () => db.due),
    updateMany: jest.fn(async () => ({ count: db.claimOk ? 1 : 0 }))
  },
  signatureSigner: { updateMany: jest.fn(async () => ({ count: 1 })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/tenant-ownership', () => ({ assertBelongsToTenant: jest.fn() }));
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));
jest.mock('../../src/lib/pdf-convert', () => ({ convertDocxToPdf: jest.fn() }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(),
  countSignaturesThisMonth: jest.fn()
}));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined),
  logAuditEvent: jest.fn()
}));

const appendSignatureEvent = jest.fn(async () => undefined);
const listChainedEvents = jest.fn(async () => [] as Row[]);
const verifyEventChain = jest.fn(() => ({ ok: true }) as { ok: boolean; brokenAtSeq?: number });
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: (...a: unknown[]) => (appendSignatureEvent as any)(...a),
  appendSignatureEventStandalone: jest.fn(async () => undefined),
  listChainedEvents: (...a: unknown[]) => (listChainedEvents as any)(...a),
  verifyEventChain: (...a: unknown[]) => (verifyEventChain as any)(...a)
}));
jest.mock('../../src/lib/signature/files', () => ({
  readSignatureFile: jest.fn(async () => ({ buffer: Buffer.from('%PDF') })),
  writeSignatureFile: jest.fn(),
  removeSignatureFolder: jest.fn()
}));
const inviteSigner = jest.fn();
const commitSignerToken = jest.fn(async (..._args: unknown[]) => true);
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence'),
  inviteSigner: (...a: unknown[]) => inviteSigner(...a),
  notifyIssuer: jest.fn(async () => undefined),
  languageOf: () => 'fr',
  prepareSignerToken: jest.fn(() => ({
    token: 'tok-tok-tok-tok-tok-tok-tok-tok',
    tokenHash: 'h'.repeat(64),
    tokenExpiresAt: new Date()
  })),
  commitSignerToken: (...a: unknown[]) => (commitSignerToken as any)(...a)
}));
jest.mock('../../src/lib/signature/provider', () => ({
  assertSignatureProviderEnabled: jest.fn(),
  getSignatureProvider: () => ({ id: 'internal', cancel: jest.fn(async () => undefined) })
}));
jest.mock('../../src/lib/signature/quota', () => ({
  reserveSignature: jest.fn(),
  releaseSignature: jest.fn(),
  resolveSignatureQuotaPolicy: jest.fn()
}));
const sealRequestMock = jest.fn();
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: (...a: unknown[]) => sealRequestMock(...a) }));

import { recordAuditEvent } from '../../src/services/audit-service';
import { AuditActionKey } from '../../src/types/audit-types';
import {
  expireDueSignatureRequests,
  getSignatureRequest,
  reissueInPersonToken,
  remindSignatureRequest,
  sealPendingSignatureRequests
} from '../../src/services/signature-service';
import { cancelOpenRequestsForTarget } from '../../src/lib/signature/cancel';

const ctx = { tenantId: 't1', userId: 'u1' };
const future = new Date(Date.now() + 86_400_000);
const signer = (id: string, status: string, channel = 'EMAIL', position = 0) => ({
  id,
  fullName: id,
  channel,
  contact: `${id}@exemple.ci`,
  contactId: null,
  status,
  position,
  role: 'LOCATAIRE',
  signedAt: null,
  inviteStatus: 'SENT',
  otpAttempts: 0
});
const baseRequest = (extra: Row = {}) => ({
  id: 'r1',
  tenantId: 't1',
  kind: 'LEASE_CONTRACT',
  targetType: 'RentalLease',
  targetId: 'l1',
  title: 'Bail',
  language: 'fr',
  status: 'SENT',
  sequential: false,
  expiresAt: future,
  createdAt: new Date(),
  completedAt: null,
  sourceHash: 'a'.repeat(64),
  signedHash: null,
  signedFileKey: null,
  signers: [],
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  db.request = baseRequest();
  db.due = [];
  db.claimOk = true;
  inviteSigner.mockResolvedValue('SENT');
  commitSignerToken.mockResolvedValue(true);
  verifyEventChain.mockReturnValue({ ok: true });
});

describe('relance', () => {
  it("ne relance que les signataires n'ayant rien ouvert (PENDING), pas OPENED ni sur place", async () => {
    db.request = baseRequest({
      signers: [
        signer('s-pending', 'PENDING'),
        signer('s-opened', 'OPENED'),
        signer('s-place', 'PENDING', 'IN_PERSON'),
        signer('s-signed', 'SIGNED')
      ]
    });
    const result = await remindSignatureRequest(ctx, 'r1');
    expect(result).toEqual({ reminded: 1, failed: 0 });
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(inviteSigner.mock.calls[0][0].signer.id).toBe('s-pending');
    expect(inviteSigner.mock.calls[0][0].reminder).toBe(true);
  });

  it("n'enregistre le nouveau jeton qu'après un envoi réussi et remonte les échecs", async () => {
    db.request = baseRequest({ signers: [signer('a', 'PENDING'), signer('b', 'PENDING')] });
    inviteSigner.mockResolvedValueOnce('SENT').mockResolvedValueOnce('FAILED');
    const result = await remindSignatureRequest(ctx, 'r1');
    expect(result).toEqual({ reminded: 1, failed: 1 });
    expect(commitSignerToken).toHaveBeenCalledTimes(1);
    expect(commitSignerToken.mock.calls[0][1]).toBe('a');
  });

  it("réserve l'intervalle de relance par mise à jour atomique : refus 429 sans envoi", async () => {
    db.request = baseRequest({ signers: [signer('a', 'PENDING')] });
    db.claimOk = false;
    await expect(remindSignatureRequest(ctx, 'r1')).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(inviteSigner).not.toHaveBeenCalled();
    expect(prismaMock.signatureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: expect.any(Date) } }] })
      })
    );
  });

  it('séquentiel : seul le signataire en cours est relancé', async () => {
    db.request = baseRequest({
      sequential: true,
      signers: [signer('a', 'PENDING', 'EMAIL', 0), signer('b', 'PENDING', 'EMAIL', 1)]
    });
    await remindSignatureRequest(ctx, 'r1');
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(inviteSigner.mock.calls[0][0].signer.id).toBe('a');
  });

  it('refuse une demande close', async () => {
    db.request = baseRequest({ status: 'COMPLETED' });
    await expect(remindSignatureRequest(ctx, 'r1')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('jeton de signature sur place', () => {
  it("le réémet une seule fois, trace l'agent (événement + audit critique) et ne renvoie que le jeton", async () => {
    db.request = baseRequest({ signers: [signer('s-place', 'PENDING', 'IN_PERSON')] });
    const result = await reissueInPersonToken(ctx, 'r1', 's-place');
    expect(result).toEqual({ inPersonUrlToken: expect.any(String) });
    expect(prismaMock.signatureSigner.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ inPersonIssuedBy: 'u1' }) })
    );
    expect(appendSignatureEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'IN_PERSON_TOKEN_ISSUED', signerId: 's-place', payload: { byUserId: 'u1' } })
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_IN_PERSON_TOKEN_ISSUED, actorUserId: 'u1' })
    );
  });

  it('refuse un signataire qui n’est pas sur place ou introuvable', async () => {
    db.request = baseRequest({ signers: [signer('mail', 'PENDING', 'EMAIL')] });
    await expect(reissueInPersonToken(ctx, 'r1', 'mail')).rejects.toMatchObject({ statusCode: 404 });
    await expect(reissueInPersonToken(ctx, 'r1', 'inconnu')).rejects.toMatchObject({ statusCode: 404 });
    expect(appendSignatureEvent).not.toHaveBeenCalled();
  });
});

describe('piste de preuve', () => {
  it('GET détail expose chainIntact (vrai, puis faux si la chaîne est rompue)', async () => {
    expect((await getSignatureRequest('t1', 'r1')).chainIntact).toBe(true);
    verifyEventChain.mockReturnValueOnce({ ok: false, brokenAtSeq: 3 });
    expect((await getSignatureRequest('t1', 'r1')).chainIntact).toBe(false);
  });
});

describe('expiration', () => {
  it('exclut les demandes dont tous les signataires ont signé (en lecture comme en écriture)', async () => {
    db.due = [{ id: 'r1', tenantId: 't1', title: 'Bail', language: 'fr', createdByUserId: 'u1' }];
    await expireDueSignatureRequests(new Date());
    const stillWaiting = { signers: { some: { status: { not: 'SIGNED' } } } };
    expect(prismaMock.signatureRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(stillWaiting) })
    );
    expect(prismaMock.signatureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(stillWaiting) })
    );
  });

  it('marque EXPIRED, trace et prévient l’émetteur', async () => {
    db.due = [{ id: 'r1', tenantId: 't1', title: 'Bail', language: 'fr', createdByUserId: 'u1' }];
    expect(await expireDueSignatureRequests(new Date())).toBe(1);
    expect(appendSignatureEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'EXPIRED' }));
    db.claimOk = false;
    expect(await expireDueSignatureRequests(new Date())).toBe(0);
  });
});

describe('tâche planifiée', () => {
  it("scelle AVANT d'expirer", async () => {
    const order: string[] = [];
    prismaMock.signatureRequest.findMany.mockImplementation(async ({ where }: Row) => {
      order.push(where.signedFileKey === null ? 'scellement' : 'expiration');
      return [];
    });
    const { runSignatureMaintenance } = await import('../../src/jobs/signature-job');
    await runSignatureMaintenance(new Date());
    expect(order).toEqual(['scellement', 'expiration']);
    expect(sealRequestMock).not.toHaveBeenCalled();
    await sealPendingSignatureRequests();
  });
});

describe('annulation sur changement du document (SG-R2)', () => {
  it('annule les demandes ouvertes du bail, tracées comme SOURCE_CHANGED', async () => {
    prismaMock.signatureRequest.findMany.mockImplementation(async () => [{ id: 'r1' }, { id: 'r2' }]);
    const count = await cancelOpenRequestsForTarget({ tenantId: 't1', userId: 'u1' }, 'RentalLease', 'l1');
    expect(count).toBe(2);
    expect(appendSignatureEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'CANCELED', payload: { reason: 'SOURCE_CHANGED', byUserId: 'u1' } })
    );
    expect(prismaMock.signatureRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', targetType: 'RentalLease', targetId: 'l1' })
      })
    );
  });
});
