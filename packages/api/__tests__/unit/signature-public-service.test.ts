/**
 * Machine d'états du signataire (spec 044, lot S1) : jeton, code à usage unique
 * (5 essais, renvois, délai), signature, refus, tour de signature, uniformité
 * des refus. La base est une doublure en mémoire d'UN signataire et de sa
 * demande ; les envois, le scellement et les fichiers sont simulés.
 */
import { AuditActionKey } from '../../src/types/audit-types';
import { otpHash } from '../../src/lib/signature/otp';
import { generateToken, hashToken } from '../../src/lib/signature/token';

type Row = Record<string, any>;
const state: { signer: Row; request: Row; countBefore: number; remaining: number } = {
  signer: {},
  request: {},
  countBefore: 0,
  remaining: 0
};

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some(branch => matches(row, branch));
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('lt' in cond) return value !== null && value !== undefined && value < cond.lt;
      if ('lte' in cond) return value === null || value === undefined || value <= cond.lte;
      if ('gt' in cond) return value !== null && value !== undefined && value > cond.gt;
      if ('not' in cond) return cond.not === null ? value !== null && value !== undefined : value !== cond.not;
    }
    return value === cond;
  });
}

function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in value)
      row[key] += value.increment;
    else if (value && typeof value === 'object' && !(value instanceof Date) && 'decrement' in value)
      row[key] -= value.decrement;
    else row[key] = value;
  }
}

const prismaMock: Row = {
  signatureSigner: {
    findUnique: jest.fn(async ({ where }: Row) =>
      where.tokenHash === state.signer.tokenHash ? { ...state.signer, request: { ...state.request } } : null
    ),
    findFirst: jest.fn(async ({ where }: Row) => (matches(state.signer, where) ? { ...state.signer } : null)),
    count: jest.fn(async ({ where }: Row) => ('position' in where ? state.countBefore : state.remaining)),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      if (!matches(state.signer, where)) return { count: 0 };
      apply(state.signer, data);
      return { count: 1 };
    })
  },
  signatureRequest: {
    updateMany: jest.fn(async ({ where, data }: Row) => {
      if (!matches(state.request, where)) return { count: 0 };
      apply(state.request, data);
      return { count: 1 };
    })
  },
  rentalDocument: { findFirst: jest.fn(async () => ({ status: 'FINAL', file_hash: 'f'.repeat(64) })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/services/audit-service', () => ({
  ...jest.requireActual('../../src/types/audit-types'),
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async () => undefined),
  appendSignatureEventStandalone: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/signature/files', () => ({
  readSignatureFile: jest.fn(async () => ({ buffer: Buffer.from('%PDF-source') })),
  writeSignatureFile: jest.fn(async () => '/uploads/signatures/t1/r1/signer-s1.png'),
  removeSignatureFile: jest.fn(async () => undefined),
  signatureFileKey: (t: string, r: string, f: string) => `/uploads/signatures/${t}/${r}/${f}`
}));
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence Test'),
  deliverOtp: jest.fn(async () => ({ ok: true })),
  inviteSigner: jest.fn(async () => 'SENT'),
  languageOf: () => 'fr',
  notifyIssuer: jest.fn(async () => undefined),
  prepareSignerToken: jest.fn(() => ({
    token: 'prepared-token-prepared-token-prepared',
    tokenHash: 'h'.repeat(64),
    tokenExpiresAt: new Date()
  })),
  commitSignerToken: jest.fn(async () => true)
}));
jest.mock('../../src/lib/signature/cancel', () => ({ cancelRequestInternal: jest.fn(async () => true) }));
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: jest.fn(async () => 'SEALED') }));

import { recordAuditEvent } from '../../src/services/audit-service';
import { commitSignerToken, deliverOtp, inviteSigner } from '../../src/lib/signature/notify';
import { cancelRequestInternal } from '../../src/lib/signature/cancel';
import { removeSignatureFile, writeSignatureFile } from '../../src/lib/signature/files';
import { sealRequest } from '../../src/lib/signature/sealing';
import { sha256Hex } from '../../src/lib/signature/evidence';
import {
  declinePublic,
  getPublicSignature,
  sendPublicOtp,
  signPublic
} from '../../src/services/signature-public-service';

const SOURCE_HASH = sha256Hex(Buffer.from('%PDF-source'));
const typed = { mode: 'TYPED' as const, value: 'Awa Koné' };
// PNG 1x1 réel : la signature dessinée est relue par pdf-lib avant d'être acceptée.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const drawn = { mode: 'DRAWN' as const, value: `data:image/png;base64,${PNG_1X1}` };
let token: string;

function reset(overrides: { signer?: Row; request?: Row } = {}): void {
  token = generateToken();
  const future = new Date(Date.now() + 3 * 86_400_000);
  state.signer = {
    id: 's1',
    tenantId: 't1',
    requestId: 'r1',
    role: 'LOCATAIRE',
    position: 0,
    fullName: 'Awa Koné',
    channel: 'EMAIL',
    contact: 'awa@exemple.ci',
    contactId: null,
    inPersonIssuedBy: 'agent-9',
    status: 'PENDING',
    tokenHash: hashToken(token),
    tokenExpiresAt: future,
    otpHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpSends: 0,
    otpLastSentAt: null,
    ...overrides.signer
  };
  state.request = {
    id: 'r1',
    tenantId: 't1',
    kind: 'LEASE_CONTRACT',
    targetType: 'RentalLease',
    targetId: 'l1',
    title: 'Contrat de bail',
    language: 'fr',
    status: 'SENT',
    providerId: 'internal',
    sequential: false,
    expiresAt: future,
    sourceFileKey: '/uploads/signatures/t1/r1/source.pdf',
    sourceHash: SOURCE_HASH,
    sourceDocumentId: 'd1',
    sourceDocHash: 'f'.repeat(64),
    createdByUserId: 'u1',
    ...overrides.request
  };
  state.countBefore = 0;
  state.remaining = 0;
  jest.clearAllMocks();
}

async function expectInvalidLink(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toMatchObject({ statusCode: 404, message: 'Lien invalide ou expiré.' });
}

/** Pose un code connu dans l'état du signataire, comme le ferait l'envoi. */
function armOtp(code: string, extra: Row = {}): void {
  state.signer.otpHash = otpHash(code, 's1');
  state.signer.otpExpiresAt = new Date(Date.now() + 5 * 60_000);
  state.signer.otpSends = 1;
  state.signer.otpLastSentAt = new Date();
  Object.assign(state.signer, extra);
}

beforeEach(() => reset());

describe('jeton : refus uniforme', () => {
  it('répond la même 404 pour jeton inconnu, malformé, expiré, demande close ou refusée', async () => {
    await expectInvalidLink(() => getPublicSignature(generateToken()));
    await expectInvalidLink(() => getPublicSignature('court'));

    reset({ signer: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    await expectInvalidLink(() => getPublicSignature(token));

    for (const status of ['CANCELED', 'EXPIRED', 'DECLINED']) {
      reset({ request: { status } });
      await expectInvalidLink(() => getPublicSignature(token));
      await expectInvalidLink(() => sendPublicOtp(token));
    }
    reset({ request: { expiresAt: new Date(Date.now() - 1000) } });
    await expectInvalidLink(() => signPublic(token, { consent: true, code: '123456', signature: typed }, {}));
  });

  it('même 404 quand la demande est confiée à un prestataire externe', async () => {
    reset({ request: { providerId: 'yousign' } });
    await expectInvalidLink(() => getPublicSignature(token));
    await expectInvalidLink(() => sendPublicOtp(token));
    await expectInvalidLink(() => signPublic(token, { consent: true, code: '123456', signature: typed }, {}));
  });

  it('ouvre la page : passe le signataire à OPENED et expose le texte de consentement', async () => {
    const page = await getPublicSignature(token);
    expect(state.signer.status).toBe('OPENED');
    expect(page.signer).toMatchObject({ fullName: 'Awa Koné', channel: 'EMAIL', canSign: true });
    expect(page.signer.maskedContact).not.toContain('awa@');
    expect(page.consentText).toMatch(/consens à le signer/);
    expect(JSON.stringify(page)).not.toContain(state.signer.tokenHash);
  });
});

describe('code à usage unique', () => {
  it('envoie le code par le canal du signataire, ne stocke que son empreinte, impose un délai entre deux envois', async () => {
    const first = await sendPublicOtp(token);
    expect(first.sentTo).not.toContain('awa@');
    expect(first.retryAfterSeconds).toBe(30);
    const sent = (deliverOtp as jest.Mock).mock.calls[0][0];
    expect(state.signer.otpHash).toBe(otpHash(sent.code, 's1'));
    expect(JSON.stringify(state.signer)).not.toContain(sent.code);
    expect(state.signer.otpAttempts).toBe(0);

    await expect(sendPublicOtp(token)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(deliverOtp).toHaveBeenCalledTimes(1);
  });

  it('plafonne les envois à 1 + 3 renvois', async () => {
    reset({ signer: { otpSends: 4, otpLastSentAt: new Date(Date.now() - 3_600_000) } });
    await expect(sendPublicOtp(token)).rejects.toMatchObject({ statusCode: 429 });
    expect(deliverOtp).not.toHaveBeenCalled();
  });

  it("rend l'envoi (compteur, délai) quand la remise échoue et GARDE l'ancien code", async () => {
    const before = new Date(Date.now() - 3_600_000);
    armOtp('482913', { otpLastSentAt: before });
    const previousHash = state.signer.otpHash;
    (deliverOtp as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED' });
    await expect(sendPublicOtp(token)).rejects.toMatchObject({ statusCode: 503 });
    expect(state.signer.otpSends).toBe(1);
    expect(state.signer.otpLastSentAt).toBe(before);
    expect(state.signer.otpHash).toBe(previousHash);
    // L'ancien code reste utilisable.
    state.remaining = 1;
    await expect(signPublic(token, { consent: true, code: '482913', signature: typed }, {})).resolves.toMatchObject({
      status: 'SIGNED'
    });
  });

  it("n'en demande pas pour la signature sur place", async () => {
    reset({ signer: { channel: 'IN_PERSON', contact: '' } });
    await expect(sendPublicOtp(token)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('signature', () => {
  it('signe avec le bon code : conserve consentement, IP hachée et tronquée, refuse de resigner', async () => {
    armOtp('482913');
    state.remaining = 1; // un autre signataire reste à signer
    const result = await signPublic(
      token,
      { consent: true, code: '482 913', signature: typed },
      { ip: '41.202.207.55', userAgent: 'jest' }
    );
    expect(result).toEqual({ status: 'SIGNED', requestStatus: 'PARTIALLY_SIGNED' });
    expect(state.signer).toMatchObject({
      status: 'SIGNED',
      otpHash: null,
      ipTruncated: '41.202.207.0/24',
      signatureMode: 'TYPED'
    });
    expect(state.signer.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.signer.consentTextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.request.status).toBe('PARTIALLY_SIGNED');
    expect(sealRequest).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_SIGNED })
    );
    // Le lien d'un signataire qui a signé cesse d'agir.
    await expectInvalidLink(() => signPublic(token, { consent: true, code: '482913', signature: typed }, {}));
  });

  it('scelle dès que le dernier signataire a signé', async () => {
    armOtp('111111');
    state.remaining = 0;
    const result = await signPublic(token, { consent: true, code: '111111', signature: typed }, {});
    expect(sealRequest).toHaveBeenCalledWith('t1', 'r1');
    expect(result.requestStatus).toBe('COMPLETED');
  });

  it('exige le code hors présence, accepte le mode sur place sans code et trace la présence', async () => {
    await expect(signPublic(token, { consent: true, signature: typed }, {})).rejects.toMatchObject({ statusCode: 400 });
    expect(state.signer.status).not.toBe('SIGNED');

    reset({ signer: { channel: 'IN_PERSON', contact: '' } });
    const result = await signPublic(token, { consent: true, signature: drawn }, { ip: '10.0.0.1' });
    expect(result.status).toBe('SIGNED');
    const { appendSignatureEvent } = jest.requireMock('../../src/lib/signature/events');
    // L'agent présent est celui qui a remis le jeton (inPersonIssuedBy), pas l'auteur de la demande (u1).
    expect(appendSignatureEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'SIGNED',
        payload: expect.objectContaining({
          presence: 'IN_PERSON',
          agentUserId: 'agent-9',
          imageSha256: expect.stringMatching(/^[0-9a-f]{64}$/)
        })
      })
    );
  });

  it('sur place : un nom saisi ne suffit pas, la signature doit être dessinée', async () => {
    reset({ signer: { channel: 'IN_PERSON', contact: '' } });
    await expect(signPublic(token, { consent: true, signature: typed }, {})).rejects.toMatchObject({ statusCode: 400 });
    expect(state.signer.status).not.toBe('SIGNED');
    expect(writeSignatureFile).not.toHaveBeenCalled();
  });

  it("n'écrit l'image qu'une fois la signature acquise, sans écraser, et la retire si la transaction échoue", async () => {
    armOtp('482913');
    state.remaining = 1;
    await signPublic(token, { consent: true, code: '482913', signature: drawn }, {});
    expect(writeSignatureFile).toHaveBeenCalledWith('t1', 'r1', 'signer-s1.png', expect.any(Buffer), {
      exclusive: true
    });
    expect(state.signer.signatureImageKey).toBe('/uploads/signatures/t1/r1/signer-s1.png');

    reset();
    armOtp('482913');
    const { appendSignatureEvent } = jest.requireMock('../../src/lib/signature/events');
    appendSignatureEvent.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(signPublic(token, { consent: true, code: '482913', signature: drawn }, {})).rejects.toThrow(
      'base indisponible'
    );
    expect(removeSignatureFile).toHaveBeenCalledWith('t1', 'r1', 'signer-s1.png');
  });

  it("une mauvaise saisie du code n'écrit aucune image", async () => {
    armOtp('482913');
    await expect(signPublic(token, { consent: true, code: '000000', signature: drawn }, {})).rejects.toMatchObject({
      statusCode: 400
    });
    expect(writeSignatureFile).not.toHaveBeenCalled();
  });

  it('la demande doit être active et non échue AU MOMENT de signer (sinon 404 uniforme, rien de signé)', async () => {
    armOtp('482913');
    prismaMock.signatureRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expectInvalidLink(() => signPublic(token, { consent: true, code: '482913', signature: typed }, {}));
    expect(state.signer.status).not.toBe('SIGNED');
    expect(state.signer.otpAttempts).toBe(0);
  });

  it('contrat régénéré depuis l’envoi (empreinte du DOCX différente) : demande annulée, 404 uniforme', async () => {
    armOtp('482913');
    prismaMock.rentalDocument.findFirst.mockResolvedValueOnce({ status: 'FINAL', file_hash: 'a'.repeat(64) });
    await expectInvalidLink(() => signPublic(token, { consent: true, code: '482913', signature: typed }, {}));
    expect(cancelRequestInternal).toHaveBeenCalledWith({ tenantId: 't1', userId: null }, 'r1', 'SOURCE_CHANGED');
    expect(state.signer.status).not.toBe('SIGNED');
  });

  it('refuse un mauvais code, compte les essais et verrouille au 5e (audit une seule fois)', async () => {
    armOtp('482913');
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(signPublic(token, { consent: true, code: '000000', signature: typed }, {})).rejects.toMatchObject({
        statusCode: 400,
        code: 'SIGNATURE_OTP_INVALID',
        data: { remainingAttempts: 5 - attempt }
      });
    }
    expect(recordAuditEvent).not.toHaveBeenCalled();
    await expect(signPublic(token, { consent: true, code: '000000', signature: typed }, {})).rejects.toMatchObject({
      code: 'SIGNATURE_OTP_INVALID'
    });
    expect(state.signer.otpAttempts).toBe(5);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_OTP_LOCKED })
    );
    // Verrouillé : même le bon code est refusé, sans nouvel audit ni signature.
    await expect(signPublic(token, { consent: true, code: '482913', signature: typed }, {})).rejects.toMatchObject({
      code: 'SIGNATURE_OTP_INVALID'
    });
    expect(state.signer.status).not.toBe('SIGNED');
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('refuse un code expiré', async () => {
    armOtp('482913', { otpExpiresAt: new Date(Date.now() - 1000) });
    await expect(signPublic(token, { consent: true, code: '482913', signature: typed }, {})).rejects.toMatchObject({
      code: 'SIGNATURE_OTP_INVALID'
    });
    expect(state.signer.status).not.toBe('SIGNED');
  });

  it('refuse de signer quand le document source a été altéré', async () => {
    armOtp('482913');
    state.request.sourceHash = sha256Hex('autre contenu');
    await expect(signPublic(token, { consent: true, code: '482913', signature: typed }, {})).rejects.toMatchObject({
      statusCode: 409
    });
    expect(state.signer.status).not.toBe('SIGNED');
  });

  it("refuse une signature dessinée qui n'est pas un PNG lisible", async () => {
    armOtp('482913');
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
    await expect(
      signPublic(
        token,
        {
          consent: true,
          code: '482913',
          signature: { mode: 'DRAWN', value: `data:image/png;base64,${fake.toString('base64')}` }
        },
        {}
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(state.signer.status).not.toBe('SIGNED');
  });
});

describe('ordre de signature (séquentiel)', () => {
  it("refuse code et signature tant que le signataire précédent n'a pas signé", async () => {
    reset({ signer: { position: 1 }, request: { sequential: true } });
    state.countBefore = 1;
    await expect(sendPublicOtp(token)).rejects.toMatchObject({ statusCode: 409, code: 'SIGNATURE_NOT_YOUR_TURN' });
    await expect(signPublic(token, { consent: true, code: '123456', signature: typed }, {})).rejects.toMatchObject({
      code: 'SIGNATURE_NOT_YOUR_TURN'
    });
    const page = await getPublicSignature(token);
    expect(page.signer.canSign).toBe(false);
  });

  it('ouvre le tour du suivant quand un signataire a signé (lien envoyé avec un nouveau jeton)', async () => {
    reset({ request: { sequential: true } });
    armOtp('482913');
    state.remaining = 1;
    prismaMock.signatureSigner.findFirst.mockResolvedValueOnce({ ...state.signer }); // lecture de l'essai
    prismaMock.signatureSigner.findFirst.mockResolvedValueOnce({
      id: 's2',
      fullName: 'Moussa',
      channel: 'EMAIL',
      contact: 'm@exemple.ci',
      contactId: null
    });
    await signPublic(token, { consent: true, code: '482913', signature: typed }, {});
    expect(inviteSigner).toHaveBeenCalledWith(
      expect.objectContaining({ signer: expect.objectContaining({ id: 's2' }) })
    );
    expect(commitSignerToken).toHaveBeenCalledWith('t1', 's2', expect.objectContaining({ token: expect.any(String) }));
  });
});

describe('refus de signer', () => {
  it('clôt la demande, efface le code, audite, et le lien ne marche plus', async () => {
    armOtp('482913');
    const result = await declinePublic(token, '  Clause 4 inacceptable \n');
    expect(result).toEqual({ status: 'DECLINED' });
    expect(state.signer).toMatchObject({ status: 'DECLINED', otpHash: null, declineReason: 'Clause 4 inacceptable' });
    expect(state.request.status).toBe('DECLINED');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_DECLINED })
    );
    await expectInvalidLink(() => declinePublic(token, undefined));
    await expectInvalidLink(() => getPublicSignature(token));
  });
});

describe('ouverture du tour suivant : jeton posé après un envoi réussi', () => {
  it("n'invalide pas le lien déjà reçu quand l'envoi échoue", async () => {
    reset({ request: { sequential: true } });
    armOtp('482913');
    state.remaining = 1;
    (inviteSigner as jest.Mock).mockResolvedValueOnce('FAILED');
    prismaMock.signatureSigner.findFirst.mockResolvedValueOnce({ ...state.signer });
    prismaMock.signatureSigner.findFirst.mockResolvedValueOnce({
      id: 's2',
      fullName: 'Moussa',
      channel: 'EMAIL',
      contact: 'm@exemple.ci',
      contactId: null
    });
    await signPublic(token, { consent: true, code: '482913', signature: typed }, {});
    expect(commitSignerToken).not.toHaveBeenCalled();
  });
});
