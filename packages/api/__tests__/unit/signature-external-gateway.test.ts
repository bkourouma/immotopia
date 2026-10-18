/**
 * Options de source côté agence (spec 042 §10, spec 044) : canaux admis (`allowedChannels`,
 * `IN_PERSON` refusé), passerelle externe (`externalGateway` : demande Yousign en
 * `delivery_mode: 'none'`, invitations d'ImmoTopia), audit des lectures de PDF côté agence
 * AVANT l'envoi. Base, fichiers, envois et prestataire sont simulés : aucun réseau.
 */
type Row = Record<string, any>;
const db: { created: Row | null; signers: Row[] } = { created: null, signers: [] };
const order: string[] = [];

const txMock: Row = {
  signatureRequest: {
    create: jest.fn(async ({ data }: Row) => {
      db.created = { ...data, createdAt: new Date(), completedAt: null, signedHash: null, signedFileKey: null };
    })
  },
  signatureSigner: {
    createMany: jest.fn(async ({ data }: Row) => {
      db.signers = data.map((row: Row, index: number) => ({ ...row, id: `s${index}`, signedAt: null, otpAttempts: 0 }));
    }),
    updateMany: jest.fn(async () => ({ count: 1 }))
  }
};
const prismaMock: Row = {
  crmContact: { findFirst: jest.fn(async () => ({ consentWhatsapp: true })) },
  signatureRequest: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (where.status) return null;
      return db.created ? { ...db.created, signers: db.signers } : null;
    }),
    updateMany: jest.fn(async () => ({ count: 1 }))
  },
  signatureSigner: { updateMany: jest.fn(async () => ({ count: 1 })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(txMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/tenant-ownership', () => ({ assertBelongsToTenant: jest.fn() }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(),
  countSignaturesThisMonth: jest.fn(async () => 0)
}));
const recordAuditEventMock = jest.fn(async (..._args: unknown[]) => {
  order.push('audit');
});
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: (...args: unknown[]) => recordAuditEventMock(...args),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async () => undefined),
  appendSignatureEventStandalone: jest.fn(async () => undefined),
  listChainedEvents: jest.fn(async () => [])
}));
jest.mock('../../src/lib/signature/files', () => ({
  writeSignatureFile: jest.fn(async () => '/uploads/signatures/t1/r/source.pdf'),
  removeSignatureFolder: jest.fn(async () => undefined),
  readSignatureFile: jest.fn(async () => {
    order.push('read');
    return { buffer: Buffer.from('%PDF-1.7 signed') };
  }),
  signatureFileKey: (t: string, r: string, f: string) => `/uploads/signatures/${t}/${r}/${f}`
}));
const sendPrivateFile = jest.fn(() => {
  order.push('send');
});
jest.mock('../../src/lib/files/private-files', () => ({
  sendPrivateFile: (...args: unknown[]) => (sendPrivateFile as any)(...args)
}));
const inviteSigner = jest.fn();
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence Test'),
  inviteSigner: (...args: unknown[]) => inviteSigner(...args),
  notifyIssuer: jest.fn(async () => undefined),
  prepareSignerToken: jest.fn(() => ({
    token: 'prepared-token-prepared-token-prepared',
    tokenHash: 'h'.repeat(64),
    tokenExpiresAt: new Date()
  })),
  commitSignerToken: jest.fn(async () => true),
  languageOf: () => 'fr'
}));
jest.mock('../../src/lib/signature/quota', () => ({
  reserveSignature: jest.fn(async () => ({ ok: true, month: '2026-10' })),
  releaseSignature: jest.fn(async () => undefined),
  resolveSignatureQuotaPolicy: jest.fn(async () => ({ ok: true, limit: 50, source: 'OPTION' }))
}));
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: jest.fn(),
  cancelRequestInternal: jest.fn(async () => true)
}));
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn(async () => true) }));
const provider: Row = {
  id: 'internal',
  qualified: true,
  createRequest: jest.fn(),
  cancel: jest.fn(async () => undefined)
};
jest.mock('../../src/lib/signature/provider', () => ({
  assertSignatureProviderEnabled: () => provider,
  getSignatureProvider: () => provider
}));

import { AuditActionKey } from '../../src/types/audit-types';
import {
  createSignatureRequest,
  getSignatureTargetContext,
  reissueInPersonToken,
  remindSignatureRequest,
  sendSignatureFile
} from '../../src/services/signature-service';
import { registerSignatureSource } from '../../src/lib/signature/sources';
import type { SignatureDocumentSource } from '../../src/lib/signature/sources';
import { reserveSignature } from '../../src/lib/signature/quota';

const ctx = { tenantId: 't1', userId: 'u1' };

const base = {
  targetType: 'DirectDebitMandate',
  viewPermission: 'RENTAL_DIRECT_DEBIT_MANAGE',
  editPermission: 'RENTAL_DIRECT_DEBIT_MANAGE',
  feature: 'RENTAL' as never,
  assertTarget: async () => undefined,
  loadSource: async () => ({ pdf: Buffer.from('%PDF-1.7 mandat'), title: 'Autorisation de prélèvement MDT-2026-0001' }),
  isSourceIntact: async () => true,
  onSealed: async () => undefined
};
const mandate: SignatureDocumentSource = {
  ...base,
  kind: 'DIRECT_DEBIT_MANDATE',
  codeBeforeView: true,
  allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP'],
  externalGateway: true
};
const emailOnly: SignatureDocumentSource = {
  ...base,
  kind: 'SYNDIC_DIRECT_DEBIT_MANDATE',
  codeBeforeView: true,
  allowedChannels: ['EMAIL'],
  externalGateway: true
};

const lease: SignatureDocumentSource = {
  ...base,
  kind: 'LEASE_CONTRACT',
  targetType: 'RentalLease',
  loadSource: async () => ({ pdf: Buffer.from('%PDF-1.7 bail'), title: 'Bail' })
};

const email = { role: 'DEBITEUR', fullName: 'Awa Koné', channel: 'EMAIL' as const, contact: 'Awa@Exemple.ci' };
const whatsapp = {
  role: 'DEBITEUR',
  fullName: 'Moussa Traoré',
  channel: 'WHATSAPP' as const,
  contact: '07 12 34 56 78',
  contactId: 'crm-1'
};
const inPerson = { role: 'AGENT', fullName: 'Agent Sur Place', channel: 'IN_PERSON' as const, contact: '' };
const create = (kind: string, signers: Row[]) =>
  createSignatureRequest(ctx, { kind: kind as never, targetId: 'mandate-1', signers: signers as never });

function externalProvider(): void {
  provider.id = 'yousign';
  provider.qualified = true;
  provider.external = { id: 'yousign' };
  provider.createRequest = jest.fn(async () => ({ providerRef: 'yp-1', signerRefs: ['sg-1'] }));
}
function internalProvider(): void {
  provider.id = 'internal';
  provider.qualified = true;
  delete provider.external;
  provider.createRequest = jest.fn(async () => ({ providerRef: 'internal-x' }));
}

beforeAll(() => {
  registerSignatureSource(mandate);
  registerSignatureSource(emailOnly);
  registerSignatureSource(lease);
});
beforeEach(() => {
  jest.clearAllMocks();
  db.created = null;
  db.signers = [];
  order.length = 0;
  internalProvider();
  inviteSigner.mockResolvedValue('SENT');
  recordAuditEventMock.mockImplementation(async () => {
    order.push('audit');
  });
});

describe('allowedChannels', () => {
  it('refuse un canal hors liste (400 traduite) avant toute réservation de quota', async () => {
    await expect(create('SYNDIC_DIRECT_DEBIT_MANDATE', [whatsapp])).rejects.toMatchObject({
      statusCode: 400,
      message: 'Ce canal d’envoi n’est pas autorisé pour ce type de document.'
    });
    expect(reserveSignature).not.toHaveBeenCalled();
    expect(provider.createRequest).not.toHaveBeenCalled();
  });

  it('refuse IN_PERSON (sans code), même mêlé à des canaux admis', async () => {
    await expect(create('DIRECT_DEBIT_MANDATE', [inPerson])).rejects.toMatchObject({
      statusCode: 400,
      message: 'La signature sur place n’est pas autorisée pour ce type de document : un code est obligatoire.'
    });
    await expect(create('DIRECT_DEBIT_MANDATE', [email, inPerson])).rejects.toMatchObject({ statusCode: 400 });
    expect(reserveSignature).not.toHaveBeenCalled();
    expect(txMock.signatureRequest.create).not.toHaveBeenCalled();
  });

  it('accepte les canaux de la liste', async () => {
    await expect(create('DIRECT_DEBIT_MANDATE', [email])).resolves.toMatchObject({ kind: 'DIRECT_DEBIT_MANDATE' });
    expect(inviteSigner).toHaveBeenCalledTimes(1);
  });

  it('types existants : tous les canaux restent admis (la signature sur place est créée)', async () => {
    const result = await create('LEASE_CONTRACT', [email, inPerson]);
    expect(result.signers).toHaveLength(2);
    expect(lease.allowedChannels).toBeUndefined();
  });

  it('aucun jeton « sur place » pour un type qui ne l’admet pas', async () => {
    db.created = {
      id: 'r1',
      kind: 'DIRECT_DEBIT_MANDATE',
      status: 'SENT',
      expiresAt: new Date(Date.now() + 86_400_000),
      signers: []
    };
    db.signers = [{ id: 's9', channel: 'IN_PERSON', status: 'PENDING' }];
    await expect(reissueInPersonToken(ctx, 'r1', 's9')).rejects.toMatchObject({ statusCode: 400 });
    expect(txMock.signatureSigner.updateMany).not.toHaveBeenCalled();
  });

  it('le contexte de la cible annonce les canaux admis', async () => {
    const context = await getSignatureTargetContext(ctx, 'DIRECT_DEBIT_MANDATE', 'mandate-1');
    expect(context).toMatchObject({ allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP'], codeBeforeView: true });
  });
});

describe('externalGateway avec Yousign', () => {
  beforeEach(() => externalProvider());

  it('crée la demande chez le prestataire SANS envoi de sa part, puis invite par les canaux d’ImmoTopia', async () => {
    const result = await create('DIRECT_DEBIT_MANDATE', [email]);
    expect(provider.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        external: expect.objectContaining({
          deliveryMode: 'none',
          signers: [expect.objectContaining({ email: 'awa@exemple.ci' })]
        })
      })
    );
    // ImmoTopia garde ses jetons et envoie SES invitations.
    expect(txMock.signatureSigner.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/), inviteStatus: 'WAITING' })]
    });
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(inviteSigner.mock.calls[0][0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result)).not.toContain(inviteSigner.mock.calls[0][0].token);
  });

  it('le prestataire n’accepte que des signataires joignables par e-mail (comportement existant)', async () => {
    await expect(create('DIRECT_DEBIT_MANDATE', [whatsapp])).rejects.toMatchObject({ statusCode: 400 });
    expect(provider.createRequest).not.toHaveBeenCalled();
  });

  it('type ordinaire avec Yousign : delivery_mode inchangé (le prestataire invite), aucune invitation interne', async () => {
    await create('LEASE_CONTRACT', [email]);
    const external = provider.createRequest.mock.calls[0][0].external;
    expect(external.deliveryMode).toBeUndefined();
    expect(inviteSigner).not.toHaveBeenCalled();
    expect(txMock.signatureSigner.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ inviteStatus: 'SENT' })]
    });
  });

  it('relance : possible pour la passerelle (invitation d’ImmoTopia), refusée pour un type ordinaire', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const signer = {
      id: 's0',
      fullName: 'Awa',
      channel: 'EMAIL',
      contact: 'a@b.ci',
      contactId: null,
      status: 'PENDING',
      position: 0
    };
    db.signers = [signer];
    db.created = {
      id: 'r1',
      tenantId: 't1',
      kind: 'DIRECT_DEBIT_MANDATE',
      title: 'T',
      language: 'fr',
      status: 'SENT',
      providerId: 'yousign',
      sequential: false,
      expiresAt: future
    };
    await expect(remindSignatureRequest(ctx, 'r1')).resolves.toEqual({ reminded: 1, failed: 0 });
    expect(inviteSigner).toHaveBeenCalledTimes(1);

    inviteSigner.mockClear();
    db.created = { ...db.created, kind: 'LEASE_CONTRACT' };
    await expect(remindSignatureRequest(ctx, 'r1')).rejects.toMatchObject({ statusCode: 409 });
    expect(inviteSigner).not.toHaveBeenCalled();
  });
});

describe('fournisseur interne', () => {
  it('une source externalGateway n’envoie rien à un prestataire : external reste absent', async () => {
    await create('DIRECT_DEBIT_MANDATE', [email]);
    expect(provider.createRequest.mock.calls[0][0].external).toBeUndefined();
    expect(inviteSigner).toHaveBeenCalledTimes(1);
  });
});

describe('audit des lectures côté agence', () => {
  const seed = (kind: string) => {
    db.created = {
      id: 'r1',
      kind,
      targetId: 'mandate-1',
      title: 'Autorisation de prélèvement',
      sourceFileKey: '/uploads/signatures/t1/r1/source.pdf',
      signedFileKey: '/uploads/signatures/t1/r1/signed.pdf'
    };
    db.signers = [];
  };
  const res = {} as never;

  it.each(['source', 'signed', 'evidence'] as const)(
    'variante %s : audit AGENCY écrit AVANT l’envoi, sans IBAN',
    async variant => {
      seed('DIRECT_DEBIT_MANDATE');
      await sendSignatureFile('t1', 'r1', variant, res, 'u1');
      expect(order).toEqual(['read', 'audit', 'send']);
      expect(recordAuditEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 't1',
          actorUserId: 'u1',
          actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED,
          entityType: 'DirectDebitMandate',
          entityId: 'mandate-1',
          payload: { channel: 'AGENCY', variant, requestId: 'r1', signerId: null }
        })
      );
      expect(JSON.stringify(recordAuditEventMock.mock.calls)).not.toMatch(/iban|CI\d{2}/i);
    }
  );

  it('un échec d’audit bloque l’envoi', async () => {
    seed('SYNDIC_DIRECT_DEBIT_MANDATE');
    recordAuditEventMock.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(sendSignatureFile('t1', 'r1', 'source', res, 'u1')).rejects.toThrow('base indisponible');
    expect(sendPrivateFile).not.toHaveBeenCalled();
  });

  it('type ordinaire : aucun audit, le fichier part comme avant', async () => {
    seed('LEASE_CONTRACT');
    await sendSignatureFile('t1', 'r1', 'source', res, 'u1');
    expect(recordAuditEventMock).not.toHaveBeenCalled();
    expect(sendPrivateFile).toHaveBeenCalledTimes(1);
  });
});
