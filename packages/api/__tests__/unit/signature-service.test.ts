/**
 * Création d'une demande de signature de bail (spec 043, lot S1) : fournisseur,
 * isolation de la cible, contrat source, quota réservé puis rendu, doublon,
 * envois, sortie sans secret. Base, fichiers, envois et audit sont simulés.
 */
type Row = Record<string, any>;
const db: { created: Row | null; signers: Row[]; open: Row | null; lease: Row | null; contract: Row | null } = {
  created: null,
  signers: [],
  open: null,
  lease: null,
  contract: null
};

const txMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async () => db.created),
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
  rentalLease: { findFirst: jest.fn(async () => db.lease) },
  rentalDocument: { findFirst: jest.fn(async () => db.contract) },
  crmContact: { findFirst: jest.fn(async () => ({ consentWhatsapp: true })) },
  signatureRequest: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (where.status) return db.open;
      return db.created ? { ...db.created, signers: db.signers } : null;
    }),
    updateMany: jest.fn(async () => ({ count: 1 }))
  },
  signatureSigner: { updateMany: jest.fn(async () => ({ count: 1 })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(txMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const assertBelongsToTenant = jest.fn();
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: (...args: unknown[]) => assertBelongsToTenant(...args)
}));

const getDocumentFile = jest.fn();
jest.mock('../../src/services/document-generation-service', () => ({
  getDocumentFile: (...args: unknown[]) => getDocumentFile(...args)
}));
const convertDocxToPdf = jest.fn();
jest.mock('../../src/lib/pdf-convert', () => ({ convertDocxToPdf: (...args: unknown[]) => convertDocxToPdf(...args) }));
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(),
  countSignaturesThisMonth: jest.fn(async () => 50)
}));
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: jest.fn(async () => undefined),
  logAuditEvent: jest.fn()
}));
jest.mock('../../src/lib/signature/events', () => ({
  appendSignatureEvent: jest.fn(async () => undefined),
  appendSignatureEventStandalone: jest.fn(async () => undefined),
  listChainedEvents: jest.fn(async () => [])
}));
const writeSignatureFile = jest.fn(async () => '/uploads/signatures/t1/r/source.pdf');
const removeSignatureFolder = jest.fn(async () => undefined);
jest.mock('../../src/lib/signature/files', () => ({
  writeSignatureFile: (...args: unknown[]) => (writeSignatureFile as any)(...args),
  removeSignatureFolder: (...args: unknown[]) => (removeSignatureFolder as any)(...args),
  readSignatureFile: jest.fn()
}));
const inviteSigner = jest.fn();
jest.mock('../../src/lib/signature/notify', () => ({
  agencyNameOf: jest.fn(async () => 'Agence Test'),
  inviteSigner: (...args: unknown[]) => inviteSigner(...args),
  notifyIssuer: jest.fn(async () => undefined),
  rotateSignerToken: jest.fn(async () => 'rotated-token-rotated-token-rotated'),
  languageOf: () => 'fr'
}));
const reserveSignature = jest.fn();
const releaseSignature = jest.fn(async () => undefined);
const resolveSignatureQuotaPolicy = jest.fn();
jest.mock('../../src/lib/signature/quota', () => ({
  reserveSignature: (...args: unknown[]) => reserveSignature(...args),
  releaseSignature: (...args: unknown[]) => (releaseSignature as any)(...args),
  resolveSignatureQuotaPolicy: (...args: unknown[]) => resolveSignatureQuotaPolicy(...args)
}));
jest.mock('../../src/lib/signature/sealing', () => ({ sealRequest: jest.fn() }));
const provider = {
  id: 'internal',
  createRequest: jest.fn(async () => ({ providerRef: 'internal-x' })),
  cancel: jest.fn(async () => undefined)
};
const assertSignatureProviderEnabled = jest.fn();
jest.mock('../../src/lib/signature/provider', () => ({
  assertSignatureProviderEnabled: () => assertSignatureProviderEnabled(),
  getSignatureProvider: () => provider
}));

import { AppError, NotFoundError } from '../../src/middleware/error-middleware';
import { AuditActionKey } from '../../src/types/audit-types';
import { recordAuditEvent } from '../../src/services/audit-service';
import {
  createSignatureRequest,
  getSignatureTargetContext,
  normalizeSigners
} from '../../src/services/signature-service';
import { registerSignatureSource, resetSignatureSourcesForTests } from '../../src/lib/signature/sources';
import { leaseContractSource } from '../../src/lib/signature/sources/lease-contract';
import type { SignatureDocumentSource } from '../../src/lib/signature/sources';

const ctx = { tenantId: 't1', userId: 'u1' };
type SignerIn = {
  role: string;
  fullName: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'IN_PERSON';
  contact: string;
  contactId?: string;
};
const input = (signers: SignerIn[], extra: { sequential?: boolean } = {}) => ({
  kind: 'LEASE_CONTRACT' as const,
  targetId: 'lease-1',
  signers,
  ...extra
});
const email = { role: 'LOCATAIRE', fullName: 'Awa Koné', channel: 'EMAIL' as const, contact: 'Awa@Exemple.ci' };
const whatsapp = {
  role: 'BAILLEUR',
  fullName: 'Moussa Traoré',
  channel: 'WHATSAPP' as const,
  contact: '07 12 34 56 78',
  contactId: 'crm-1'
};
const inPerson = { role: 'AGENT', fullName: 'Agent Sur Place', channel: 'IN_PERSON' as const, contact: '' };

beforeEach(() => {
  jest.clearAllMocks();
  db.created = null;
  db.signers = [];
  db.open = null;
  db.lease = { id: 'lease-1', lease_number: 'BAIL-2026-0012', status: 'ACTIVE' };
  db.contract = {
    id: 'doc-1',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_hash: 'f'.repeat(64)
  };
  assertBelongsToTenant.mockResolvedValue(undefined);
  assertSignatureProviderEnabled.mockReturnValue(provider);
  getDocumentFile.mockResolvedValue(Buffer.from('docx'));
  convertDocxToPdf.mockResolvedValue(Buffer.from('%PDF-1.7 contrat'));
  resolveSignatureQuotaPolicy.mockResolvedValue({ ok: true, limit: 50, source: 'OPTION' });
  reserveSignature.mockResolvedValue({ ok: true, month: '2026-10' });
  inviteSigner.mockResolvedValue('SENT');
});

describe('refus avant toute écriture', () => {
  it('fournisseur désactivé : refus clair, rien n’est lu ni réservé', async () => {
    assertSignatureProviderEnabled.mockImplementation(() => {
      throw new AppError("La signature électronique n'est pas activée sur ce serveur.", 503, 'SERVICE_UNAVAILABLE');
    });
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({ statusCode: 503 });
    expect(prismaMock.rentalLease.findFirst).not.toHaveBeenCalled();
    expect(reserveSignature).not.toHaveBeenCalled();
  });

  it("bail d'une autre agence : même 404 qu'un bail inexistant, aucun quota consommé", async () => {
    assertBelongsToTenant.mockRejectedValueOnce(new NotFoundError('Bail introuvable.'));
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({ statusCode: 404 });
    expect(assertBelongsToTenant).toHaveBeenCalledWith(expect.anything(), 'rentalLease', 'lease-1', 't1', {
      tenantField: 'tenant_id',
      message: 'Bail introuvable.'
    });
    expect(reserveSignature).not.toHaveBeenCalled();
    expect(writeSignatureFile).not.toHaveBeenCalled();
  });

  it('un contact CRM d’une autre agence est refusé avant écriture', async () => {
    assertBelongsToTenant.mockImplementation(async (_c: unknown, model: string) => {
      if (model === 'crmContact') throw new NotFoundError('Contact introuvable.');
    });
    await expect(createSignatureRequest(ctx, input([{ ...whatsapp, contactId: 'crm-autre' }]))).rejects.toMatchObject({
      statusCode: 404
    });
    expect(reserveSignature).not.toHaveBeenCalled();
  });

  it('aucun contrat généré : refus clair, aucun quota consommé', async () => {
    db.contract = null;
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toThrow(/Aucun contrat/);
    // Le quota est réservé AVANT la conversion, puis restitué sur toute erreur.
    expect(releaseSignature).toHaveBeenCalledWith('t1', '2026-10');
    expect(writeSignatureFile).not.toHaveBeenCalled();
  });

  it('bail terminé ou annulé : refusé', async () => {
    db.lease = { id: 'lease-1', lease_number: 'B', status: 'CANCELED' };
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('demande déjà ouverte pour ce bail : conflit', async () => {
    db.open = { id: 'r-existante' };
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({ statusCode: 409 });
    expect(reserveSignature).not.toHaveBeenCalled();
  });

  it('conversion qui ne rend pas un PDF : refus, quota restitué', async () => {
    convertDocxToPdf.mockResolvedValueOnce(Buffer.from('pas un pdf'));
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({ statusCode: 502 });
    expect(releaseSignature).toHaveBeenCalledWith('t1', '2026-10');
  });

  it('quota atteint : 409 QUOTA_EXCEEDED, rien n’est écrit ni envoyé', async () => {
    reserveSignature.mockResolvedValueOnce({ ok: false, month: '2026-10' });
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({
      statusCode: 409,
      code: 'QUOTA_EXCEEDED',
      data: { capacityKey: 'SIGNATURES_MENSUELLES', limit: 50 }
    });
    expect(writeSignatureFile).not.toHaveBeenCalled();
    expect(inviteSigner).not.toHaveBeenCalled();
  });

  it('abonnement sans la capacité (enforce) : refusé', async () => {
    resolveSignatureQuotaPolicy.mockResolvedValueOnce({ ok: false, reason: 'OPTION_MISSING' });
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(reserveSignature).not.toHaveBeenCalled();
  });
});

describe('création réussie', () => {
  it('fige le PDF source, audite en transaction, envoie les liens, ne sort aucun secret', async () => {
    const dto: any = await createSignatureRequest(ctx, input([email, whatsapp, inPerson]));
    expect(db.created).toMatchObject({
      tenantId: 't1',
      kind: 'LEASE_CONTRACT',
      targetType: 'RentalLease',
      targetId: 'lease-1',
      status: 'SENT',
      sourceDocumentId: 'doc-1'
    });
    expect(db.created?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(writeSignatureFile).toHaveBeenCalledWith(
      't1',
      expect.any(String),
      'source.pdf',
      Buffer.from('%PDF-1.7 contrat')
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_REQUEST_SENT, tenantId: 't1', actorUserId: 'u1' })
    );
    const audited = (recordAuditEvent as jest.Mock).mock.calls[0][1];
    expect(JSON.stringify(audited)).not.toMatch(/exemple\.ci|\+225|0712345678/);

    // Jetons : seul le SHA-256 est stocké, le jeton en clair ne sort que pour le mode sur place.
    for (const signer of db.signers) expect(signer.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(inviteSigner).toHaveBeenCalledTimes(2); // e-mail + WhatsApp, pas le mode sur place
    const emailToken = inviteSigner.mock.calls[0][0].token;
    expect(db.signers[0].tokenHash).not.toBe(emailToken);
    const byChannel = Object.fromEntries(dto.signers.map((s: Row) => [s.channel, s]));
    expect(byChannel.IN_PERSON.inPersonUrlToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(byChannel.EMAIL.inPersonUrlToken).toBeUndefined();
    expect(byChannel.WHATSAPP.inPersonUrlToken).toBeUndefined();
    const json = JSON.stringify(dto);
    expect(json).not.toContain('exemple.ci');
    expect(json).not.toMatch(/tokenHash|otpHash|SourceKey|FileKey"/);
    expect(json).not.toContain(emailToken);
  });

  it('séquentiel : seul le premier signataire reçoit son lien', async () => {
    await createSignatureRequest(ctx, input([email, whatsapp], { sequential: true }));
    expect(inviteSigner).toHaveBeenCalledTimes(1);
    expect(inviteSigner.mock.calls[0][0].signer.fullName).toBe('Awa Koné');
  });

  it('aucun lien parti (et personne sur place) : demande annulée, quota rendu, 503', async () => {
    inviteSigner.mockResolvedValue('FAILED');
    await expect(createSignatureRequest(ctx, input([email, whatsapp]))).rejects.toMatchObject({ statusCode: 503 });
    expect(releaseSignature).toHaveBeenCalledWith('t1', '2026-10');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: AuditActionKey.SIGNATURE_CANCELED })
    );
  });

  it('échec de persistance : quota rendu et dossier de fichiers effacé', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(createSignatureRequest(ctx, input([email]))).rejects.toThrow('base indisponible');
    expect(releaseSignature).toHaveBeenCalledWith('t1', '2026-10');
    expect(removeSignatureFolder).toHaveBeenCalledWith('t1', expect.any(String));
  });
});

describe('signataires', () => {
  it('normalise les contacts selon le canal et refuse les contacts invalides', () => {
    const [a, b, c] = normalizeSigners([email, whatsapp, inPerson]);
    expect(a.contact).toBe('awa@exemple.ci');
    expect(b.contact).toBe('+2250712345678');
    expect(b.contactId).toBe('crm-1');
    expect(c.contact).toBe('');
    expect(() => normalizeSigners([{ ...email, contact: 'pas-un-mail' }])).toThrow();
    expect(() => normalizeSigners([{ ...whatsapp, contact: 'abc' }])).toThrow();
  });

  it('WhatsApp exige un contact CRM : 400 claire sans contactId', () => {
    const { contactId: _omitted, ...withoutContact } = whatsapp;
    void _omitted;
    expect(() => normalizeSigners([withoutContact])).toThrow(/contact du CRM/);
  });

  it('deux signataires peuvent partager le même contact (jeton et code propres à chacun)', () => {
    const [a, b] = normalizeSigners([email, { ...email, fullName: 'Moussa Koné', role: 'CO_LOCATAIRE' }]);
    expect(a.contact).toBe(b.contact);
  });
});

describe('contact WhatsApp du CRM', () => {
  it('refuse un contact qui n’a pas consenti, avant toute réservation', async () => {
    prismaMock.crmContact.findFirst.mockResolvedValueOnce({ consentWhatsapp: false });
    await expect(createSignatureRequest(ctx, input([whatsapp]))).rejects.toMatchObject({ statusCode: 400 });
    expect(reserveSignature).not.toHaveBeenCalled();
  });
});

describe('quota et conversion', () => {
  it('le quota est réservé AVANT la conversion LibreOffice', async () => {
    await createSignatureRequest(ctx, input([inPerson]));
    expect(reserveSignature.mock.invocationCallOrder[0]).toBeLessThan(convertDocxToPdf.mock.invocationCallOrder[0]);
  });

  it('fige l’empreinte du DOCX source et désigne l’agent de la signature sur place', async () => {
    await createSignatureRequest(ctx, input([inPerson]));
    expect(db.created?.sourceDocHash).toBe('f'.repeat(64));
    expect(db.signers[0].inPersonIssuedBy).toBe('u1');
  });
});

/** Source de test : un autre type de document que le bail. */
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

describe('registre des sources de document', () => {
  afterEach(() => {
    resetSignatureSourcesForTests();
    registerSignatureSource(leaseContractSource);
  });

  it('un type sans source enregistrée est refusé en 400, avant toute lecture ou réservation', async () => {
    await expect(
      createSignatureRequest(ctx, { ...input([email]), kind: 'SALE_MANDATE' } as never)
    ).rejects.toMatchObject({ statusCode: 400, message: 'Ce type de document ne peut pas encore être signé.' });
    expect(reserveSignature).not.toHaveBeenCalled();
    expect(prismaMock.rentalLease.findFirst).not.toHaveBeenCalled();
  });

  it('SG-R1 : un type qui exige un prestataire refuse la signature interne, sans quota consommé', async () => {
    const source = fakeSource({ providerRequired: true });
    registerSignatureSource(source);
    await expect(
      createSignatureRequest(ctx, { ...input([email]), kind: 'SALE_AGREEMENT' } as never)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('prestataire') });
    expect(source.assertTarget).not.toHaveBeenCalled();
    expect(reserveSignature).not.toHaveBeenCalled();
  });

  it('la cible est vérifiée AVANT le quota, le document chargé APRÈS, et le type de cible vient de la source', async () => {
    const source = fakeSource();
    registerSignatureSource(source);
    await createSignatureRequest(ctx, { ...input([inPerson]), kind: 'SALE_AGREEMENT' } as never);
    const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
    expect(order(source.assertTarget as jest.Mock)).toBeLessThan(order(reserveSignature));
    expect(order(reserveSignature)).toBeLessThan(order(source.loadSource as jest.Mock));
    expect(source.assertTarget).toHaveBeenCalledWith(ctx, 'lease-1');
    expect(db.created).toMatchObject({ kind: 'SALE_AGREEMENT', targetType: 'SaleAgreement', sourceDocumentId: null });
  });

  it("un document généré à la volée fige l'empreinte de ses données (snapshotHash) dans sourceDocHash", async () => {
    registerSignatureSource(fakeSource({ snapshotHash: jest.fn(async () => 'd'.repeat(64)) }));
    await createSignatureRequest(ctx, { ...input([inPerson]), kind: 'SALE_AGREEMENT' } as never);
    expect(db.created?.sourceDocHash).toBe('d'.repeat(64));
  });

  it("une cible refusée par sa source (autre agence, statut) n'écrit ni ne réserve rien", async () => {
    registerSignatureSource(
      fakeSource({
        assertTarget: jest.fn(async () => {
          throw new NotFoundError('Compromis introuvable.');
        })
      })
    );
    await expect(
      createSignatureRequest(ctx, { ...input([inPerson]), kind: 'SALE_AGREEMENT' } as never)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(reserveSignature).not.toHaveBeenCalled();
    expect(writeSignatureFile).not.toHaveBeenCalled();
  });

  it('la source du bail est enregistrée et garde ses permissions et sa fonctionnalité', () => {
    expect(leaseContractSource).toMatchObject({
      kind: 'LEASE_CONTRACT',
      targetType: 'RentalLease',
      viewPermission: 'RENTAL_LEASES_VIEW',
      editPermission: 'RENTAL_LEASES_EDIT',
      feature: 'RENTAL'
    });
  });
});

describe('contexte d’une cible', () => {
  afterEach(() => {
    resetSignatureSourcesForTests();
    registerSignatureSource(leaseContractSource);
  });

  it('vérifie la cible puis rend les signataires proposés par la source', async () => {
    const source = fakeSource({
      defaultSigners: jest.fn(async () => [
        { role: 'ACHETEUR', fullName: 'Awa Koné', email: 'awa@exemple.ci', contactId: 'c1' }
      ])
    });
    registerSignatureSource(source);
    const context = await getSignatureTargetContext(ctx, 'SALE_AGREEMENT', 'x1');
    expect(source.assertTarget).toHaveBeenCalledWith(ctx, 'x1');
    expect(context).toEqual({
      kind: 'SALE_AGREEMENT',
      targetType: 'SaleAgreement',
      providerRequired: false,
      signers: [{ role: 'ACHETEUR', fullName: 'Awa Koné', email: 'awa@exemple.ci', contactId: 'c1' }]
    });
  });

  it('une source sans defaultSigners rend une liste vide ; un type sans source est refusé en 400', async () => {
    registerSignatureSource(fakeSource());
    expect((await getSignatureTargetContext(ctx, 'SALE_AGREEMENT', 'x1')).signers).toEqual([]);
    await expect(getSignatureTargetContext(ctx, 'LEASE_INSPECTION', 'x1')).rejects.toMatchObject({ statusCode: 400 });
  });
});
