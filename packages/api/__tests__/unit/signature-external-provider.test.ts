/**
 * Fournisseur externe (spec 044, lot S6) : adaptateur `createExternalProvider`
 * et création d'une demande confiée à un prestataire (e-mail seul, aucun lien
 * interne, références des signataires dans CREATED, SG-R1 levé).
 */
type Row = Record<string, any>;
const db: { created: Row | null; signers: Row[] } = { created: null, signers: [] };

const appendSignatureEvent = jest.fn(async (..._args: unknown[]) => undefined);
const txMock: Row = {
  signatureRequest: {
    create: jest.fn(async ({ data }: Row) => {
      db.created = { ...data, createdAt: new Date(), completedAt: null, signedHash: null, signedFileKey: null };
    }),
    updateMany: jest.fn(async () => ({ count: 1 }))
  },
  signatureSigner: {
    createMany: jest.fn(async ({ data }: Row) => {
      db.signers = data.map((row: Row, index: number) => ({ ...row, id: `s${index}`, signedAt: null, otpAttempts: 0 }));
    })
  }
};
const prismaMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (where.status) return null;
      return db.created ? { ...db.created, signers: db.signers } : null;
    }),
    updateMany: jest.fn(async () => ({ count: 1 }))
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(txMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/tenant-ownership', () => ({ assertBelongsToTenant: jest.fn() }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(),
  countSignaturesThisMonth: jest.fn(async () => 0)
}));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: (...args: unknown[]) => appendSignatureEvent(...args),
  appendSignatureEventStandalone: jest.fn(async () => undefined),
  listChainedEvents: jest.fn(async () => [])
}));
const writeSignatureFile = jest.fn(async (..._args: unknown[]) => '/uploads/signatures/t1/r/source.pdf');
jest.mock('../../src/lib/signature/files', () => ({
  writeSignatureFile: (...args: unknown[]) => writeSignatureFile(...args),
  removeSignatureFolder: jest.fn(async () => undefined),
  readSignatureFile: jest.fn(),
  signatureFileKey: jest.fn()
}));
const inviteSigner = jest.fn();
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence Test'),
  inviteSigner: (...args: unknown[]) => inviteSigner(...args),
  notifyIssuer: jest.fn(async () => undefined),
  prepareSignerToken: jest.fn(),
  commitSignerToken: jest.fn(),
  languageOf: () => 'fr'
}));
const reserveSignature = jest.fn();
const releaseSignature = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/lib/signature/quota', () => ({
  reserveSignature: (...args: unknown[]) => reserveSignature(...args),
  releaseSignature: (...args: unknown[]) => releaseSignature(...args),
  resolveSignatureQuotaPolicy: jest.fn(async () => ({ ok: true, limit: 50, source: 'OPTION' }))
}));
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn(async () => true) }));

const client = {
  id: 'yousign',
  create: jest.fn(async (..._args: unknown[]) => ({ providerRef: 'ys-1', signerRefs: ['sg-a', 'sg-b'] })),
  cancel: jest.fn(async (..._args: unknown[]) => undefined),
  getSnapshot: jest.fn(),
  downloadSigned: jest.fn(),
  downloadEvidence: jest.fn(),
  verifyWebhook: jest.fn(),
  parseWebhook: jest.fn()
};
const mockProviderState: { current: any } = { current: null };
jest.mock('../../src/lib/signature/provider', () => ({
  assertSignatureProviderEnabled: () => mockProviderState.current,
  getSignatureProvider: () => mockProviderState.current
}));

import { createExternalProvider } from '../../src/lib/signature/provider/external/provider';
import { createSignatureRequest, getSignatureTargetContext } from '../../src/services/signature-service';
import { registerSignatureSource, resetSignatureSourcesForTests } from '../../src/lib/signature/sources';
import type { SignatureDocumentSource } from '../../src/lib/signature/sources';

const ctx = { tenantId: 't1', userId: 'u1' };
const email = (n: string) => ({
  role: 'PARTIE',
  fullName: `Partie ${n}`,
  channel: 'EMAIL' as const,
  contact: `${n}@ex.ci`
});

function fakeSource(extra: Partial<SignatureDocumentSource> = {}): SignatureDocumentSource {
  return {
    kind: 'SALE_AGREEMENT',
    targetType: 'SaleAgreement',
    viewPermission: 'CRM_DEALS_VIEW',
    editPermission: 'CRM_DEALS_EDIT',
    feature: 'SALES',
    assertTarget: jest.fn(async () => undefined),
    loadSource: jest.fn(async () => ({ pdf: Buffer.from('%PDF-1.7 compromis'), title: 'Compromis' })),
    isSourceIntact: jest.fn(async () => true),
    onSealed: jest.fn(async () => undefined),
    ...extra
  };
}
const input = (signers: unknown[]) => ({ kind: 'SALE_AGREEMENT', targetId: 'sale-1', signers }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  db.created = null;
  db.signers = [];
  resetSignatureSourcesForTests();
  registerSignatureSource(fakeSource());
  mockProviderState.current = createExternalProvider(client as never, { qualified: true });
  reserveSignature.mockResolvedValue({ ok: true, month: '2026-10' });
});

describe('createExternalProvider', () => {
  it('n’est pas qualifié par défaut (signature simple), qualifié si le niveau l’est', () => {
    expect(createExternalProvider(client as never).qualified).toBe(false);
    expect(createExternalProvider(client as never, { qualified: true }).qualified).toBe(true);
  });

  it('porte le client et ne livre aucun message', async () => {
    const provider = createExternalProvider(client as never);
    expect(provider.id).toBe('yousign');
    expect(provider.external).toBe(client);
    await expect(
      provider.deliver({ tenantId: 't1', channel: 'EMAIL', to: 'a@b.ci', subject: 's', text: 't' })
    ).resolves.toEqual({ ok: false, reason: 'UNSUPPORTED' });
  });

  it('createRequest transmet le document et les signataires au prestataire', async () => {
    const provider = createExternalProvider(client as never);
    const pdf = Buffer.from('%PDF-x');
    const expiresAt = new Date();
    const created = await provider.createRequest({
      tenantId: 't1',
      requestId: 'r1',
      kind: 'SALE_AGREEMENT',
      signerCount: 1,
      external: {
        title: 'T',
        pdf,
        language: 'fr',
        sequential: true,
        expiresAt,
        signers: [{ position: 0, fullName: 'A', email: 'a@b.ci', role: 'X' }]
      }
    });
    expect(created).toEqual({ providerRef: 'ys-1', signerRefs: ['sg-a', 'sg-b'] });
    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'r1', pdf, sequential: true }));
  });

  it('cancel prévient le prestataire seulement avec une référence', async () => {
    const provider = createExternalProvider(client as never);
    await provider.cancel('r1', { tenantId: 't1', providerRef: null });
    await provider.cancel('r1');
    expect(client.cancel).not.toHaveBeenCalled();
    await provider.cancel('r1', { tenantId: 't1', providerRef: 'ys-1' });
    expect(client.cancel).toHaveBeenCalledWith('ys-1');
  });
});

describe('création avec un prestataire externe', () => {
  it('refuse un canal WhatsApp ou sur place, avant toute réservation', async () => {
    const whatsapp = { role: 'A', fullName: 'W', channel: 'WHATSAPP', contact: '0712345678' };
    await expect(createSignatureRequest(ctx, input([email('a'), whatsapp]))).rejects.toMatchObject({ statusCode: 400 });
    const inPerson = { role: 'A', fullName: 'P', channel: 'IN_PERSON', contact: '' };
    await expect(createSignatureRequest(ctx, input([email('a'), inPerson]))).rejects.toMatchObject({
      message: expect.stringContaining('e-mail')
    });
    await expect(createSignatureRequest(ctx, input([email('a'), inPerson]))).rejects.toMatchObject({ statusCode: 400 });
    expect(reserveSignature).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
  });

  it('SG-R1 levé : un compromis passe avec un fournisseur qualifié, sans lien interne', async () => {
    await createSignatureRequest(ctx, input([email('a'), email('b')]));
    expect(client.create).toHaveBeenCalledTimes(1);
    const sent = client.create.mock.calls[0][0] as Row;
    expect(sent.signers).toEqual([
      expect.objectContaining({ position: 0, email: 'a@ex.ci' }),
      expect.objectContaining({ position: 1, email: 'b@ex.ci' })
    ]);
    expect(inviteSigner).not.toHaveBeenCalled();
    expect(db.created).toMatchObject({ providerId: 'yousign', providerRef: 'ys-1' });
    expect(db.signers.every(s => s.inviteStatus === 'SENT')).toBe(true);
    const createdEvent = appendSignatureEvent.mock.calls.find(call => (call[1] as Row).type === 'CREATED');
    expect((createdEvent?.[1] as Row).payload.providerSignerRefs).toEqual(['sg-a', 'sg-b']);
  });

  it('SG-R1 maintenu avec le fournisseur interne', async () => {
    mockProviderState.current = { id: 'internal', qualified: false, createRequest: jest.fn(), cancel: jest.fn() };
    await expect(createSignatureRequest(ctx, input([email('a')]))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('prestataire')
    });
    expect(reserveSignature).not.toHaveBeenCalled();
  });

  it('persistance en échec : la demande est annulée chez le prestataire et le quota rendu', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(createSignatureRequest(ctx, input([email('a')]))).rejects.toThrow('base indisponible');
    expect(client.cancel).toHaveBeenCalledWith('ys-1');
    expect(releaseSignature).toHaveBeenCalled();
  });

  it('le contexte de cible signale un fournisseur externe', async () => {
    const result = await getSignatureTargetContext(ctx, 'SALE_AGREEMENT', 'sale-1');
    expect(result.externalProvider).toBe(true);
    expect(result.providerRequired).toBe(false);
  });
});
