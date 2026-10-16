/**
 * Canal SMS de la signature électronique (spec 044, lot S7) : schéma, normalisation
 * des signataires, messages courts, remise par le fournisseur interne (isolation de
 * l'agence, transport désactivé ou en échec), code à usage unique, masquage.
 * Base, transport SMS et envois e-mail/WhatsApp sont simulés : aucun appel réseau.
 */
type Row = Record<string, any>;

const prismaMock: Row = {
  crmContact: { findFirst: jest.fn() },
  signatureSigner: { updateMany: jest.fn(async () => ({ count: 1 })) },
  signatureEvent: { count: jest.fn(async () => 0) },
  tenant: { findUnique: jest.fn(async () => ({ name: 'Agence Test' })) }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const assertBelongsToTenant = jest.fn();
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: (...args: unknown[]) => assertBelongsToTenant(...args)
}));

// Client Prisma non régénéré (poste de dev) : l'enum du schéma Zod doit tout de même exister.
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  return {
    ...actual,
    SignatureDocumentKind: actual.SignatureDocumentKind ?? {
      LEASE_CONTRACT: 'LEASE_CONTRACT',
      LEASE_INSPECTION: 'LEASE_INSPECTION'
    }
  };
});

const smsSend = jest.fn();
const isSmsAvailable = jest.fn();
jest.mock('../../src/lib/sms', () => ({
  getSmsTransport: () => ({ send: (...args: unknown[]) => smsSend(...args) }),
  isSmsAvailable: () => isSmsAvailable()
}));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger: loggerMock }));

jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: jest.fn() } }));
jest.mock('../../src/services/providers/whatsapp.provider', () => ({
  configureWhatsAppProvider: jest.fn(() => false),
  sendText: jest.fn()
}));
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async () => undefined),
  appendSignatureEventStandalone: jest.fn(async () => undefined),
  listChainedEvents: jest.fn(async () => [])
}));
jest.mock('../../src/lib/signature/provider', () => ({
  assertSignatureProviderEnabled: () => ({ id: 'internal', qualified: false }),
  getSignatureProvider: () => jest.requireActual('../../src/lib/signature/provider/internal').createInternalProvider()
}));
// Dépendances du service de signature, sans objet ici.
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));
jest.mock('../../src/lib/pdf-convert', () => ({ convertDocxToPdf: jest.fn() }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(),
  countSignaturesThisMonth: jest.fn(async () => 0)
}));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/lib/signature/files', () => ({
  writeSignatureFile: jest.fn(),
  removeSignatureFolder: jest.fn(),
  readSignatureFile: jest.fn()
}));
jest.mock('../../src/lib/signature/quota', () => ({
  reserveSignature: jest.fn(),
  releaseSignature: jest.fn(),
  resolveSignatureQuotaPolicy: jest.fn()
}));
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn(async () => true) }));

import { createSignatureSchema } from '../../src/lib/signature/schemas';
import { buildInviteMessage, buildOtpMessage } from '../../src/lib/signature/messages';
import { createInternalProvider } from '../../src/lib/signature/provider/internal';
import { deliverOtp, inviteSigner } from '../../src/lib/signature/notify';
import { toSignerDto } from '../../src/lib/signature/dto';
import { createSignatureRequest, normalizeSigners } from '../../src/services/signature-service';
import { registerSignatureSource, resetSignatureSourcesForTests } from '../../src/lib/signature/sources';
import type { SignatureDocumentSource } from '../../src/lib/signature/sources';

const sms = {
  role: 'LOCATAIRE',
  fullName: 'Awa Koné',
  channel: 'SMS' as const,
  contact: '07 12 34 56 78',
  contactId: 'crm-1'
};
const PHONE = '+2250712345678';

beforeEach(() => {
  jest.clearAllMocks();
  isSmsAvailable.mockReturnValue(true);
  smsSend.mockResolvedValue({ ok: true });
  prismaMock.crmContact.findFirst.mockResolvedValue({
    id: 'crm-1',
    phonePrimary: PHONE,
    phoneSecondary: null,
    whatsappNumber: null
  });
  assertBelongsToTenant.mockResolvedValue(undefined);
  prismaMock.signatureEvent.count.mockResolvedValue(0);
});

describe('schéma et normalisation', () => {
  it('le schéma accepte le canal SMS', () => {
    const parsed = createSignatureSchema.safeParse({ kind: 'LEASE_CONTRACT', targetId: 'l1', signers: [sms] });
    expect(parsed.success).toBe(true);
  });

  it('normalise un numéro ivoirien saisi en E.164 et conserve le contact CRM', () => {
    const [signer] = normalizeSigners([sms]);
    expect(signer).toMatchObject({ channel: 'SMS', contact: PHONE, contactId: 'crm-1' });
  });

  it('refuse un numéro absent ou invalide, sans jamais citer le numéro', () => {
    expect(() => normalizeSigners([{ ...sms, contact: '' }])).toThrow(/Numéro de téléphone invalide/);
    try {
      normalizeSigners([{ ...sms, contact: '12ab' }]);
      throw new Error('attendu : refus');
    } catch (error) {
      expect((error as Error).message).toMatch(/Numéro de téléphone invalide pour Awa Koné \(SMS\)/);
      expect((error as Error).message).not.toContain('12ab');
    }
  });

  it('exige un contact du CRM', () => {
    expect(() => normalizeSigners([{ ...sms, contactId: undefined }])).toThrow(/exige un contact du CRM/);
  });
});

describe('messages SMS', () => {
  const base = {
    signerName: 'Awa Koné',
    agencyName: 'Agence Immobilière du Plateau et des Deux Plateaux Réunis',
    title: 'Contrat de bail du logement de type F4 situé à Cocody Angré 8e tranche, bâtiment B',
    url: `https://app.immotopia.example/signer/${'a'.repeat(43)}`,
    expiresAt: new Date('2026-11-20T00:00:00Z'),
    language: 'fr' as const,
    channel: 'SMS' as const
  };

  it("l'invitation est courte, sans HTML, et le lien reste entier malgré un titre très long", () => {
    const message = buildInviteMessage(base);
    expect(message.text).toContain(base.url);
    expect(message.text.replace(base.url, '').length).toBeLessThanOrEqual(160);
    expect(message.html).toBeUndefined();
    expect(message.text).not.toMatch(/<[a-z]/i);
    expect(message.text).toContain('…');
  });

  it('la relance garde aussi le lien entier', () => {
    const message = buildInviteMessage({ ...base, reminder: true });
    expect(message.text).toContain(base.url);
    expect(message.text).toMatch(/^Rappel /);
    expect(message.text.replace(base.url, '').length).toBeLessThanOrEqual(160);
  });

  it('le code est court, sans HTML', () => {
    const message = buildOtpMessage({ ...base, code: '482913', ttlMinutes: 10 });
    expect(message.text).toContain('482913');
    expect(message.text.length).toBeLessThanOrEqual(110);
    expect(message.html).toBeUndefined();
  });

  it('les messages e-mail restent inchangés (HTML présent, titre complet)', () => {
    const message = buildInviteMessage({ ...base, channel: 'EMAIL' });
    expect(message.html).toContain('<a href=');
    expect(message.text).toContain(base.title);
  });
});

describe('remise par le fournisseur interne', () => {
  const message = (extra: Row = {}) => ({
    tenantId: 't1',
    channel: 'SMS' as const,
    to: '07 12 34 56 78',
    contactId: 'crm-1',
    subject: '',
    text: 'Code Agence : 123456 (valable 10 min).',
    ...extra
  });

  it("envoie au numéro E.164, avec un contact de l'agence (le where porte le tenantId)", async () => {
    const result = await createInternalProvider().deliver(message());
    expect(result).toEqual({ ok: true });
    expect(prismaMock.crmContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'crm-1', tenantId: 't1' } })
    );
    expect(smsSend).toHaveBeenCalledWith({ to: PHONE, text: 'Code Agence : 123456 (valable 10 min).' });
  });

  it('numéro qui n’est pas celui du contact CRM : NO_CONSENT, rien envoyé', async () => {
    const result = await createInternalProvider().deliver(message({ to: '+2250799999999' }));
    expect(result).toEqual({ ok: false, reason: 'NO_CONSENT' });
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('indicatif hors liste (ex. +33) : SEND_FAILED, rien envoyé', async () => {
    prismaMock.crmContact.findFirst.mockResolvedValue({ phonePrimary: '+33612345678' });
    const result = await createInternalProvider().deliver(message({ to: '+33612345678' }));
    expect(result).toEqual({ ok: false, reason: 'SEND_FAILED' });
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('plafond quotidien atteint : RATE_LIMITED, rien envoyé ; le comptage porte le tenantId et le canal SMS', async () => {
    prismaMock.signatureEvent.count.mockResolvedValue(200);
    const result = await createInternalProvider().deliver(message());
    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' });
    expect(smsSend).not.toHaveBeenCalled();
    expect(prismaMock.signatureEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 't1',
        type: { in: ['INVITE_SENT', 'OTP_SENT'] },
        payload: { path: ['channel'], equals: 'SMS' }
      })
    });
  });

  it('sans contactId : NO_CONSENT, rien envoyé', async () => {
    const result = await createInternalProvider().deliver(message({ contactId: null }));
    expect(result).toEqual({ ok: false, reason: 'NO_CONSENT' });
    expect(smsSend).not.toHaveBeenCalled();
  });

  it("contact d'une autre agence : NO_CONSENT, rien envoyé", async () => {
    prismaMock.crmContact.findFirst.mockResolvedValue(null);
    const result = await createInternalProvider().deliver(message({ tenantId: 't2' }));
    expect(result).toEqual({ ok: false, reason: 'NO_CONSENT' });
    expect(prismaMock.crmContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'crm-1', tenantId: 't2' } })
    );
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('numéro illisible : SEND_FAILED', async () => {
    expect(await createInternalProvider().deliver(message({ to: 'abc' }))).toEqual({
      ok: false,
      reason: 'SEND_FAILED'
    });
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('transport désactivé : DISABLED ; échec du transport : SEND_FAILED', async () => {
    smsSend.mockResolvedValueOnce({ ok: false, reason: 'DISABLED' });
    expect(await createInternalProvider().deliver(message())).toEqual({ ok: false, reason: 'DISABLED' });
    smsSend.mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED' });
    expect(await createInternalProvider().deliver(message())).toEqual({ ok: false, reason: 'SEND_FAILED' });
  });

  it('exception du transport : SEND_FAILED, le journal ne reçoit ni numéro ni texte', async () => {
    smsSend.mockRejectedValueOnce(new Error(`échec pour ${PHONE} : 123456`));
    const result = await createInternalProvider().deliver(message());
    expect(result).toEqual({ ok: false, reason: 'SEND_FAILED' });
    const logged = JSON.stringify([
      loggerMock.error.mock.calls,
      loggerMock.warn.mock.calls,
      loggerMock.info.mock.calls
    ]);
    expect(logged).not.toContain('0712345678');
    expect(logged).not.toContain('123456');
    expect(logged).not.toContain('Code Agence');
  });
});

describe('invitation et code à usage unique par SMS', () => {
  const signer = { id: 's1', fullName: 'Awa Koné', channel: 'SMS', contact: PHONE, contactId: 'crm-1' };

  it("l'invitation part par SMS : SENT, lien intact dans le texte envoyé", async () => {
    const request = {
      id: 'r1',
      tenantId: 't1',
      title: 'Bail',
      language: 'fr',
      expiresAt: new Date('2026-11-20T00:00:00Z')
    };
    const status = await inviteSigner({ request, signer, token: 'tok'.repeat(10), agencyName: 'Agence Test' });
    expect(status).toBe('SENT');
    const sent = smsSend.mock.calls[0][0] as { to: string; text: string };
    expect(sent.to).toBe(PHONE);
    expect(sent.text).toContain('/signer/' + 'tok'.repeat(10));
  });

  it('le code part par SMS, mêmes règles de contact', async () => {
    const args = {
      tenantId: 't1',
      title: 'Bail',
      language: 'fr',
      agencyName: 'Agence Test',
      code: '482913',
      ttlMinutes: 10
    };
    expect(await deliverOtp({ ...args, signer })).toEqual({ ok: true });
    expect((smsSend.mock.calls[0][0] as { text: string }).text).toContain('482913');
    expect(await deliverOtp({ ...args, signer: { ...signer, contactId: null } })).toEqual({
      ok: false,
      reason: 'NO_CONSENT'
    });
    expect(smsSend).toHaveBeenCalledTimes(1);
  });
});

describe('contrôles à la création (SMS)', () => {
  const ctx = { tenantId: 't1', userId: 'u1' } as never;
  const input = (extra: Row = {}) =>
    ({ kind: 'LEASE_INSPECTION', targetId: 'x', signers: [{ ...sms, ...extra }] }) as never;
  const source: SignatureDocumentSource = {
    kind: 'LEASE_INSPECTION',
    targetType: 'LeaseInspection',
    viewPermission: 'CRM_DEALS_VIEW',
    editPermission: 'CRM_DEALS_EDIT',
    feature: 'SALES',
    assertTarget: jest.fn(async () => undefined),
    loadSource: jest.fn(),
    isSourceIntact: jest.fn(async () => true),
    onSealed: jest.fn(async () => undefined)
  };
  beforeEach(() => registerSignatureSource(source));
  afterEach(() => resetSignatureSourcesForTests());

  it('refuse un numéro qui n’appartient pas au contact CRM désigné (400)', async () => {
    await expect(createSignatureRequest(ctx, input({ contact: '07 99 99 99 99' }))).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('refuse un indicatif hors liste autorisée (400)', async () => {
    await expect(createSignatureRequest(ctx, input({ contact: '+33 6 12 34 56 78' }))).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('refuse en 429 quand le plafond quotidien de SMS est atteint', async () => {
    prismaMock.signatureEvent.count.mockResolvedValue(200);
    await expect(createSignatureRequest(ctx, input())).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe('création et sortie', () => {
  const source: SignatureDocumentSource = {
    kind: 'LEASE_INSPECTION',
    targetType: 'LeaseInspection',
    viewPermission: 'CRM_DEALS_VIEW',
    editPermission: 'CRM_DEALS_EDIT',
    feature: 'SALES',
    assertTarget: jest.fn(async () => undefined),
    loadSource: jest.fn(),
    isSourceIntact: jest.fn(async () => true),
    onSealed: jest.fn(async () => undefined)
  };

  afterEach(() => resetSignatureSourcesForTests());

  it("un signataire SMS est refusé en 400 si le SMS n'est pas disponible, avant toute écriture", async () => {
    registerSignatureSource(source);
    isSmsAvailable.mockReturnValue(false);
    await expect(
      createSignatureRequest(
        { tenantId: 't1', userId: 'u1' } as never,
        {
          kind: 'LEASE_INSPECTION',
          targetId: 'x',
          signers: [sms]
        } as never
      )
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('SMS') });
    expect(assertBelongsToTenant).not.toHaveBeenCalled();
  });

  it("un contact CRM d'une autre agence est refusé pour un signataire SMS", async () => {
    registerSignatureSource(source);
    assertBelongsToTenant.mockRejectedValueOnce(Object.assign(new Error('Contact introuvable.'), { statusCode: 404 }));
    await expect(
      createSignatureRequest(
        { tenantId: 't1', userId: 'u1' } as never,
        {
          kind: 'LEASE_INSPECTION',
          targetId: 'x',
          signers: [{ ...sms, contactId: 'crm-autre' }]
        } as never
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(assertBelongsToTenant).toHaveBeenCalledWith(expect.anything(), 'crmContact', 'crm-autre', 't1');
  });

  it('le contact SMS est masqué comme un téléphone', () => {
    const dto = toSignerDto({
      id: 's1',
      role: 'LOCATAIRE',
      position: 1,
      fullName: 'Awa Koné',
      channel: 'SMS',
      contact: PHONE,
      status: 'PENDING',
      signedAt: null,
      inviteStatus: 'SENT',
      otpAttempts: 0
    });
    expect(dto.contactMasked).not.toContain('0712345678');
    expect(dto.contactMasked).toMatch(/[•*]/);
  });
});
