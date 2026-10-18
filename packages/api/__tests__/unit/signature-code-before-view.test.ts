/**
 * Options de source « code avant consultation » et « passerelle externe » (spec 042 §10.5,
 * spec 044) côté signataire : vérification du code (`/otp/verify`), jeton de consultation,
 * PDF servi seulement avec ce jeton (et audité AVANT l'envoi), signature exigeant le jeton,
 * lien du prestataire lu en direct. Les types ordinaires ne changent pas. Base, fichiers,
 * envois et prestataire sont simulés : aucun réseau.
 */
import { AuditActionKey } from '../../src/types/audit-types';
import { otpHash } from '../../src/lib/signature/otp';
import { generateToken, hashToken } from '../../src/lib/signature/token';

type Row = Record<string, any>;
const state: { signer: Row; request: Row; remaining: number } = { signer: {}, request: {}, remaining: 0 };
const order: string[] = [];

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some(branch => matches(row, branch));
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('lte' in cond) return value === null || value === undefined || value <= cond.lte;
      if ('lt' in cond) return value !== null && value !== undefined && value < cond.lt;
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
    count: jest.fn(async ({ where }: Row) =>
      'viewGrantHash' in where ? (matches(state.signer, where) ? 1 : 0) : 'position' in where ? 0 : state.remaining
    ),
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
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
const recordAuditEventMock = jest.fn(async (..._args: unknown[]) => {
  order.push('audit');
});
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: (...args: unknown[]) => recordAuditEventMock(...args)
}));
const appended: Row[] = [];
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async (_tx: unknown, input: Row) => {
    appended.push(input);
  }),
  appendSignatureEventStandalone: jest.fn(async () => undefined),
  listChainedEvents: jest.fn(async () => [{ type: 'CREATED', payload: { providerSignerRefs: ['sg-ref-1'] } }])
}));
jest.mock('../../src/lib/signature/files', () => ({
  readSignatureFile: jest.fn(async () => {
    order.push('read');
    return { buffer: Buffer.from('%PDF-source') };
  }),
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
  prepareSignerToken: jest.fn(),
  commitSignerToken: jest.fn(async () => true)
}));
jest.mock('../../src/lib/signature/cancel', () => ({ cancelRequestInternal: jest.fn(async () => true) }));
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: jest.fn(async () => 'SEALED') }));
const externalClient = { id: 'yousign', getSignerLink: jest.fn() };
jest.mock('../../src/lib/signature/provider/external', () => ({
  getExternalSignatureClientById: (id: string) => (id === 'yousign' ? externalClient : null)
}));

import { logger } from '../../src/utils/logger';
import { maskSensitivePath } from '../../src/utils/sensitive-path';
import { deliverOtp } from '../../src/lib/signature/notify';
import { sealRequest } from '../../src/lib/signature/sealing';
import { sha256Hex } from '../../src/lib/signature/evidence';
import { registerSignatureSource } from '../../src/lib/signature/sources';
import type { SignatureDocumentSource } from '../../src/lib/signature/sources';
import {
  declinePublic,
  getPublicExternalLink,
  getPublicSignature,
  getPublicSourceFile,
  sendPublicOtp,
  signPublic,
  verifyPublicOtp
} from '../../src/services/signature-public-service';

const SOURCE_HASH = sha256Hex(Buffer.from('%PDF-source'));
const typed = { mode: 'TYPED' as const, value: 'Awa Koné' };
const EXTERNAL_URL = 'https://sign.exemple-prestataire.test/s/ABCDEF-secret-link';

const mandateSource: SignatureDocumentSource = {
  kind: 'DIRECT_DEBIT_MANDATE',
  targetType: 'DirectDebitMandate',
  codeBeforeView: true,
  allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP'],
  externalGateway: true,
  viewPermission: 'RENTAL_DIRECT_DEBIT_MANAGE',
  editPermission: 'RENTAL_DIRECT_DEBIT_MANAGE',
  feature: 'RENTAL' as never,
  assertTarget: async () => undefined,
  loadSource: async () => ({ pdf: Buffer.from('%PDF-source'), title: 'Autorisation de prélèvement MDT-2026-0001' }),
  isSourceIntact: async () => true,
  onSealed: async () => undefined
};

let token: string;
let viewToken: string;

function reset(overrides: { signer?: Row; request?: Row } = {}): void {
  token = generateToken();
  viewToken = generateToken();
  const future = new Date(Date.now() + 3 * 86_400_000);
  state.signer = {
    id: 's1',
    tenantId: 't1',
    requestId: 'r1',
    role: 'DEBITEUR',
    position: 0,
    fullName: 'Awa Koné',
    channel: 'EMAIL',
    contact: 'awa@exemple.ci',
    contactId: null,
    inPersonIssuedBy: null,
    status: 'PENDING',
    tokenHash: hashToken(token),
    tokenExpiresAt: future,
    otpHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpSends: 0,
    otpLastSentAt: null,
    otpVerifiedAt: null,
    viewGrantHash: null,
    viewGrantExpiresAt: null,
    ...overrides.signer
  };
  state.request = {
    id: 'r1',
    tenantId: 't1',
    kind: 'DIRECT_DEBIT_MANDATE',
    targetType: 'DirectDebitMandate',
    targetId: 'mandate-1',
    title: 'Autorisation de prélèvement MDT-2026-0001',
    language: 'fr',
    status: 'SENT',
    providerId: 'internal',
    providerRef: 'internal-r1',
    sequential: false,
    expiresAt: future,
    sourceFileKey: '/uploads/signatures/t1/r1/source.pdf',
    sourceHash: SOURCE_HASH,
    sourceDocumentId: null,
    sourceDocHash: 'f'.repeat(64),
    createdByUserId: 'u1',
    ...overrides.request
  };
  state.remaining = 0;
  appended.length = 0;
  order.length = 0;
  jest.clearAllMocks();
  recordAuditEventMock.mockImplementation(async () => {
    order.push('audit');
  });
}

/** Pose un code connu dans l'état du signataire, comme le ferait l'envoi. */
function armOtp(code: string): void {
  state.signer.otpHash = otpHash(code, 's1');
  state.signer.otpExpiresAt = new Date(Date.now() + 5 * 60_000);
  state.signer.otpSends = 1;
  state.signer.otpLastSentAt = new Date();
}

/** Pose un jeton de consultation valide, comme le ferait `verifyPublicOtp`. */
function grantView(expiresAt = new Date(Date.now() + 10 * 60_000)): void {
  state.signer.viewGrantHash = hashToken(viewToken);
  state.signer.viewGrantExpiresAt = expiresAt;
  state.signer.otpVerifiedAt = new Date();
}

async function expectInvalidLink(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toMatchObject({ statusCode: 404, message: 'Lien invalide ou expiré.' });
}

function loggedText(): string {
  const calls = [
    ...(logger.warn as jest.Mock).mock.calls,
    ...(logger.error as jest.Mock).mock.calls,
    ...(logger.info as jest.Mock).mock.calls,
    ...(logger.debug as jest.Mock).mock.calls
  ];
  return JSON.stringify(calls);
}

beforeAll(() => registerSignatureSource(mandateSource));
beforeEach(() => reset());

describe('GET /:token', () => {
  it('annonce codeRequiredBeforeView et external, sans rien du document hors titre et contact masqué', async () => {
    const page = await getPublicSignature(token);
    expect(page).toMatchObject({ codeRequiredBeforeView: true, external: false });
    expect(page.request).toMatchObject({ title: 'Autorisation de prélèvement MDT-2026-0001' });
    expect(page.signer.maskedContact).not.toContain('awa@');
    expect(JSON.stringify(page)).not.toMatch(/IBAN|CI\d{2}/);
  });

  it('type ordinaire : les deux drapeaux valent faux', async () => {
    reset({ request: { kind: 'LEASE_CONTRACT', targetType: 'RentalLease' } });
    const page = await getPublicSignature(token);
    expect(page).toMatchObject({ codeRequiredBeforeView: false, external: false });
  });

  it('demande externe : external vaut vrai et la page ne propose pas de signer', async () => {
    reset({ request: { providerId: 'yousign', providerRef: 'yp-1' } });
    const page = await getPublicSignature(token);
    expect(page).toMatchObject({ codeRequiredBeforeView: true, external: true });
    expect(page.signer.canSign).toBe(false);
  });
});

describe('POST /:token/otp/verify', () => {
  it('bon code : consomme le code, pose otpVerifiedAt, remet un jeton de consultation de 15 min dont seule l’empreinte est stockée', async () => {
    armOtp('482913');
    const before = Date.now();
    const result = await verifyPublicOtp(token, '482 913');

    expect(result.viewToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ttl = new Date(result.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(14 * 60_000);
    expect(ttl).toBeLessThanOrEqual(15 * 60_000 + 2_000);
    expect(state.signer).toMatchObject({
      otpHash: null,
      otpExpiresAt: null,
      viewGrantHash: hashToken(result.viewToken)
    });
    expect(state.signer.otpVerifiedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(state.signer)).not.toContain(result.viewToken);
    expect(appended).toEqual([expect.objectContaining({ type: 'OTP_VERIFIED', signerId: 's1' })]);
    expect(JSON.stringify(appended)).not.toContain(result.viewToken);
    expect(JSON.stringify(appended)).not.toContain('482913');
    expect(loggedText()).not.toContain(result.viewToken);
  });

  it('le code est consommé : le rejouer échoue, sans second jeton', async () => {
    armOtp('482913');
    await verifyPublicOtp(token, '482913');
    const firstHash = state.signer.viewGrantHash;
    await expect(verifyPublicOtp(token, '482913')).rejects.toMatchObject({
      statusCode: 400,
      code: 'SIGNATURE_OTP_INVALID'
    });
    expect(state.signer.viewGrantHash).toBe(firstHash);
  });

  it('mauvais code : essai réservé avant la comparaison, essais restants rendus, événement OTP_FAILED, aucun jeton', async () => {
    armOtp('482913');
    await expect(verifyPublicOtp(token, '000000')).rejects.toMatchObject({
      statusCode: 400,
      code: 'SIGNATURE_OTP_INVALID',
      data: { remainingAttempts: 4 }
    });
    expect(state.signer.otpAttempts).toBe(1);
    expect(state.signer.viewGrantHash).toBeNull();
    expect(appended).toEqual([expect.objectContaining({ type: 'OTP_FAILED' })]);
  });

  it('verrouille après 5 essais : OTP_LOCKED + audit, puis même le bon code est refusé', async () => {
    armOtp('482913');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(verifyPublicOtp(token, '000000')).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(appended.map(event => event.type)).toEqual([
      'OTP_FAILED',
      'OTP_FAILED',
      'OTP_FAILED',
      'OTP_FAILED',
      'OTP_LOCKED'
    ]);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_OTP_LOCKED })
    );
    await expect(verifyPublicOtp(token, '482913')).rejects.toMatchObject({ statusCode: 400 });
    expect(state.signer.viewGrantHash).toBeNull();
  });

  it('code expiré ou jamais envoyé : refus, pas de jeton', async () => {
    await expect(verifyPublicOtp(token, '123456')).rejects.toMatchObject({ statusCode: 400 });
    armOtp('482913');
    state.signer.otpExpiresAt = new Date(Date.now() - 1000);
    await expect(verifyPublicOtp(token, '482913')).rejects.toMatchObject({ statusCode: 400 });
    expect(state.signer.viewGrantHash).toBeNull();
  });

  it('code mal formé : 400 sans consommer d’essai', async () => {
    armOtp('482913');
    await expect(verifyPublicOtp(token, 'abc')).rejects.toMatchObject({ statusCode: 400 });
    await expect(verifyPublicOtp(token, undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect(state.signer.otpAttempts).toBe(0);
  });

  it('source sans codeBeforeView, jeton inconnu ou signature sur place : même 404 que les jetons invalides', async () => {
    reset({ request: { kind: 'LEASE_CONTRACT', targetType: 'RentalLease' } });
    armOtp('482913');
    await expectInvalidLink(() => verifyPublicOtp(token, '482913'));
    expect(state.signer.otpHash).not.toBeNull();

    reset();
    await expectInvalidLink(() => verifyPublicOtp(generateToken(), '482913'));
    reset({ signer: { channel: 'IN_PERSON', contact: '' } });
    await expectInvalidLink(() => verifyPublicOtp(token, '482913'));
  });
});

describe('GET /:token/file', () => {
  it('sans jeton de consultation, avec un mauvais jeton ou un jeton échu : le même 404, rien n’est lu ni audité', async () => {
    await expectInvalidLink(() => getPublicSourceFile(token));
    grantView();
    await expectInvalidLink(() => getPublicSourceFile(token));
    await expectInvalidLink(() => getPublicSourceFile(token, generateToken()));
    await expectInvalidLink(() => getPublicSourceFile(token, 'court'));

    grantView(new Date(Date.now() - 1000));
    await expectInvalidLink(() => getPublicSourceFile(token, viewToken));
    expect(order).toEqual([]);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('jeton valide : sert le PDF et écrit l’audit DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED sans IBAN', async () => {
    grantView();
    const file = await getPublicSourceFile(token, viewToken);
    expect(file.buffer.toString()).toBe('%PDF-source');
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 't1',
        actorUserId: null,
        actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED,
        entityType: 'DirectDebitMandate',
        entityId: 'mandate-1',
        payload: { channel: 'SIGNER', variant: 'source', requestId: 'r1', signerId: 's1' }
      })
    );
    expect(JSON.stringify(recordAuditEventMock.mock.calls)).not.toMatch(/iban|CI\d{2}/i);
  });

  it('un échec d’écriture de l’audit bloque l’envoi du PDF', async () => {
    grantView();
    recordAuditEventMock.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(getPublicSourceFile(token, viewToken)).rejects.toThrow('base indisponible');
  });

  it('lecture seule après signature : le jeton encore valide ouvre le PDF, sans jeton c’est 404', async () => {
    grantView();
    state.signer.status = 'SIGNED';
    state.request.status = 'COMPLETED';
    await expect(getPublicSourceFile(token, viewToken)).resolves.toMatchObject({ title: expect.any(String) });
    await expectInvalidLink(() => getPublicSourceFile(token));
  });

  it('type ordinaire : le PDF reste servi sans code ni jeton, sans audit', async () => {
    reset({ request: { kind: 'LEASE_CONTRACT', targetType: 'RentalLease' } });
    const file = await getPublicSourceFile(token);
    expect(file.buffer.toString()).toBe('%PDF-source');
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('POST /:token/sign', () => {
  it('exige le jeton de consultation au lieu du code', async () => {
    state.remaining = 1;
    await expectInvalidLink(() => signPublic(token, { consent: true, signature: typed }, {}));
    // Un code, même exact, ne suffit plus : le code se vérifie avant la consultation.
    armOtp('482913');
    await expectInvalidLink(() => signPublic(token, { consent: true, code: '482913', signature: typed }, {}));
    grantView();
    await expectInvalidLink(() => signPublic(token, { consent: true, signature: typed }, {}, generateToken()));
    grantView(new Date(Date.now() - 1000));
    await expectInvalidLink(() => signPublic(token, { consent: true, signature: typed }, {}, viewToken));
    expect(state.signer.status).not.toBe('SIGNED');
  });

  it('avec le jeton valide : signe sans code, le reste de la signature est inchangé', async () => {
    grantView();
    state.remaining = 0;
    const result = await signPublic(token, { consent: true, signature: typed }, { ip: '41.202.207.55' }, viewToken);
    expect(result).toEqual({ status: 'SIGNED', requestStatus: 'COMPLETED' });
    expect(sealRequest).toHaveBeenCalledWith('t1', 'r1');
    expect(state.signer).toMatchObject({ status: 'SIGNED', signatureMode: 'TYPED', ipTruncated: '41.202.207.0/24' });
    expect(state.signer.consentTextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(appended.find(event => event.type === 'SIGNED')?.payload).toMatchObject({ otp: true, viewGrant: true });
    expect(JSON.stringify(appended)).not.toContain(viewToken);
    expect(loggedText()).not.toContain(viewToken);
  });

  it('refuse la signature sur place pour ces types, même avec un jeton de consultation', async () => {
    reset({ signer: { channel: 'IN_PERSON', contact: '' } });
    grantView();
    await expectInvalidLink(() => signPublic(token, { consent: true, signature: typed }, {}, viewToken));
  });
});

describe('jeton de consultation : invalidé à l’acte, exigé pour refuser', () => {
  it('la signature efface l’empreinte et l’échéance du jeton de consultation', async () => {
    grantView();
    await signPublic(token, { consent: true, signature: typed }, {}, viewToken);
    expect(state.signer).toMatchObject({ status: 'SIGNED', viewGrantHash: null, viewGrantExpiresAt: null });
    // Le jeton ne rouvre plus rien après l'acte.
    await expectInvalidLink(() => getPublicSourceFile(token, viewToken));
  });

  it('refuser exige le jeton de consultation, comme signer : sans lui ou périmé, le même 404 et rien ne change', async () => {
    await expectInvalidLink(() => declinePublic(token, 'non'));
    await expectInvalidLink(() => declinePublic(token, 'non', generateToken()));
    grantView(new Date(Date.now() - 1000));
    await expectInvalidLink(() => declinePublic(token, 'non', viewToken));
    expect(state.signer.status).toBe('PENDING');
    expect(state.request.status).toBe('SENT');
  });

  it('avec le jeton valide : le refus passe et efface l’empreinte du jeton', async () => {
    grantView();
    await expect(declinePublic(token, 'Montant erroné', viewToken)).resolves.toEqual({ status: 'DECLINED' });
    expect(state.signer).toMatchObject({ status: 'DECLINED', viewGrantHash: null, viewGrantExpiresAt: null });
    expect(state.request.status).toBe('DECLINED');
    await expectInvalidLink(() => getPublicSourceFile(token, viewToken));
  });
});

describe('demande confiée à un prestataire (passerelle externe)', () => {
  beforeEach(() => reset({ request: { providerId: 'yousign', providerRef: 'yp-1' } }));

  it('ImmoTopia garde la porte : envoie le code par ses canaux internes, vérifie le code, sert le PDF avec le jeton', async () => {
    await expect(sendPublicOtp(token)).resolves.toMatchObject({ retryAfterSeconds: 30 });
    expect(deliverOtp).toHaveBeenCalledTimes(1);
    const sent = (deliverOtp as jest.Mock).mock.calls[0][0];
    const verified = await verifyPublicOtp(token, sent.code);
    state.signer.viewGrantHash = hashToken(verified.viewToken);
    await expect(getPublicSourceFile(token, verified.viewToken)).resolves.toBeDefined();
    await expectInvalidLink(() => getPublicSourceFile(token));
  });

  it('signer et refuser dans ImmoTopia restent refusés (la signature se fait chez le prestataire)', async () => {
    grantView();
    await expectInvalidLink(() => signPublic(token, { consent: true, signature: typed }, {}, viewToken));
    await expectInvalidLink(() => declinePublic(token, 'non'));
    expect(state.signer.status).not.toBe('SIGNED');
    expect(state.signer.status).not.toBe('DECLINED');
  });

  it('GET /external-link : jeton de consultation exigé, sinon 404 et aucun appel au prestataire', async () => {
    await expectInvalidLink(() => getPublicExternalLink(token));
    grantView();
    await expectInvalidLink(() => getPublicExternalLink(token));
    await expectInvalidLink(() => getPublicExternalLink(token, generateToken()));
    grantView(new Date(Date.now() - 1000));
    await expectInvalidLink(() => getPublicExternalLink(token, viewToken));
    expect(externalClient.getSignerLink).not.toHaveBeenCalled();
  });

  it('GET /external-link : lit l’URL EN DIRECT chez le prestataire, ne la stocke ni ne la journalise', async () => {
    grantView();
    externalClient.getSignerLink.mockResolvedValue(EXTERNAL_URL);
    const result = await getPublicExternalLink(token, viewToken);
    expect(result).toEqual({ url: EXTERNAL_URL });
    expect(externalClient.getSignerLink).toHaveBeenCalledWith('yp-1', 'sg-ref-1');
    // Chaque appel relit chez le prestataire (rien n'est conservé).
    await getPublicExternalLink(token, viewToken);
    expect(externalClient.getSignerLink).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(state.signer)).not.toContain('secret-link');
    expect(JSON.stringify(state.request)).not.toContain('secret-link');
    expect(JSON.stringify(appended)).not.toContain('secret-link');
    expect(loggedText()).not.toContain('secret-link');
  });

  it('prestataire indisponible : 503 traduite, ni URL ni corps dans les journaux', async () => {
    grantView();
    externalClient.getSignerLink.mockRejectedValue(
      Object.assign(new Error(`échec ${EXTERNAL_URL}`), { code: 'SERVER', name: 'ExternalProviderError' })
    );
    await expect(getPublicExternalLink(token, viewToken)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE'
    });
    expect(loggedText()).not.toContain('secret-link');
    expect(loggedText()).toContain('SERVER');
  });

  it('signataire déjà signé : plus de lien', async () => {
    grantView();
    state.signer.status = 'SIGNED';
    await expectInvalidLink(() => getPublicExternalLink(token, viewToken));
    expect(externalClient.getSignerLink).not.toHaveBeenCalled();
  });

  it('type ordinaire confié au prestataire : tout reste en 404 (comportement existant)', async () => {
    reset({
      request: { providerId: 'yousign', providerRef: 'yp-1', kind: 'LEASE_CONTRACT', targetType: 'RentalLease' }
    });
    grantView();
    await expectInvalidLink(() => getPublicSignature(token));
    await expectInvalidLink(() => sendPublicOtp(token));
    await expectInvalidLink(() => verifyPublicOtp(token, '123456'));
    await expectInvalidLink(() => getPublicSourceFile(token, viewToken));
    await expectInvalidLink(() => getPublicExternalLink(token, viewToken));
  });
});

describe('journaux : le jeton des nouveaux chemins est masqué', () => {
  it('masque le jeton de /otp/verify et de /external-link', () => {
    const tok = generateToken();
    expect(maskSensitivePath(`/api/public/signatures/${tok}/otp/verify`)).toBe(
      '/api/public/signatures/[masqué]/otp/verify'
    );
    expect(maskSensitivePath(`/api/public/signatures/${tok}/external-link`)).toBe(
      '/api/public/signatures/[masqué]/external-link'
    );
  });
});

describe('fournisseur interne', () => {
  it('GET /external-link répond le même 404, même avec un jeton de consultation valide', async () => {
    grantView();
    await expectInvalidLink(() => getPublicExternalLink(token, viewToken));
    expect(externalClient.getSignerLink).not.toHaveBeenCalled();
  });
});
