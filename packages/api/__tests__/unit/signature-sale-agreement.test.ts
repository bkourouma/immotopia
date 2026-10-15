/**
 * Signature du compromis de vente (spec 044, lot S4) : PDF sans prix plancher,
 * exigence de prestataire (SG-R1), invalidation à la modification (SG-R2),
 * scellement idempotent, isolation entre agences et permissions de la source.
 * Base, fournisseur, quota et fichiers sont simulés.
 */
import { inflateSync } from 'zlib';

type Row = Record<string, any>;
const db: { agreement: Row | null; currency: string } = { agreement: null, currency: 'XOF' };

const prismaMock: Row = {
  saleAgreement: {
    findFirst: jest.fn(async () => db.agreement),
    findFirstOrThrow: jest.fn(async () => db.agreement),
    // Transition conditionnelle comme Prisma : le `where.status` décide si la ligne est touchée.
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const row = db.agreement;
      if (!row || row.id !== where.id || row.tenantId !== where.tenantId) return { count: 0 };
      const allowed = where.status ? (where.status.in ? where.status.in : [where.status]).includes(row.status) : true;
      if (!allowed) return { count: 0 };
      db.agreement = { ...row, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
      return { count: 1 };
    }),
    update: jest.fn(async ({ data }: Row) => ({
      ...db.agreement,
      // Prisma ignore les champs undefined : le simulacre aussi.
      ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    }))
  },
  saleOffer: { findFirst: jest.fn(async () => ({ buyerContactId: 'c1', financing: 'LOAN', dealId: null })) },
  saleMandate: {
    findFirst: jest.fn(async () => ({ sellerClientId: 'sc1', agentUserId: 'u-agent' }))
  },
  property: {
    findFirst: jest.fn(async () => ({
      title: 'Villa Cocody',
      internalReference: 'BIEN-1',
      address: 'Rue des Jardins',
      locationZone: 'Cocody',
      currency: db.currency
    }))
  },
  saleAgreementCondition: {
    findMany: jest.fn(async () => [{ label: 'Obtention du prêt', dueDate: new Date('2026-11-30') }]),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0),
    create: jest.fn(async () => ({ id: 'cond-1', label: 'x', dueDate: null, status: 'PENDING', resolvedAt: null })),
    update: jest.fn(async () => ({ id: 'cond-1', label: 'x', dueDate: null, status: 'MET', resolvedAt: null })),
    delete: jest.fn(async () => undefined)
  },
  salePaymentMilestone: {
    findMany: jest.fn(async () => [{ label: 'Acompte', dueDate: new Date('2026-11-01'), amount: 5_000_000 }]),
    deleteMany: jest.fn(async () => ({ count: 1 })),
    createMany: jest.fn(async () => ({ count: 0 }))
  },
  tenantClient: {
    findFirst: jest.fn(async () => ({
      details: { crmContactId: 'c-seller' },
      user: { fullName: 'Kouassi Yao', email: 'yao@exemple.ci' }
    }))
  },
  crmContact: {
    findFirst: jest.fn(async ({ where }: Row): Promise<Row | null> => {
      if (where.id === 'c-seller') return { id: 'c-seller', phonePrimary: '0505050505', whatsappNumber: null };
      return {
        id: 'c1',
        firstName: 'Awa',
        lastName: 'Koné',
        legalName: null,
        representativeName: null,
        email: 'awa@exemple.ci',
        phonePrimary: '0102030405',
        whatsappNumber: '0707070707'
      };
    })
  },
  user: { findFirst: jest.fn(async () => ({ fullName: 'Agent Un', email: 'agent@exemple.ci' })) },
  signatureRequest: { findFirst: jest.fn(async () => ({ createdByUserId: 'u-creator' })) },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const assertBelongsToTenant = jest.fn();
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: (...args: unknown[]) => assertBelongsToTenant(...args)
}));

const envMock: { env: Row } = { env: { SIGNATURE_PROVIDER_REQUIRED_KINDS: ['SALE_AGREEMENT'] } };
jest.mock('../../src/config/env', () => ({
  get env() {
    return envMock.env;
  }
}));

const recordAuditEvent = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  recordAuditEvent: (...args: unknown[]) => (recordAuditEvent as any)(...args),
  logAuditEvent: jest.fn()
}));

const setPropertyStatusTx = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/lib/sales/property-status', () => ({
  setPropertyStatusTx: (...args: unknown[]) => (setPropertyStatusTx as any)(...args)
}));
jest.mock('../../src/lib/sales/commissions', () => ({
  commissionDto: jest.fn(),
  createCommissionForAgreementTx: jest.fn()
}));
jest.mock('../../src/lib/sales/offers', () => ({ closeOpenOffersTx: jest.fn() }));
jest.mock('../../src/lib/sales/names', () => ({
  propertyLabels: jest.fn(async () => new Map()),
  tenantClientNames: jest.fn(async () => new Map()),
  crmContactNames: jest.fn(async () => new Map())
}));
const cancelOpenRequestsForTarget = jest.fn(async (..._args: unknown[]) => 1);
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: (...args: unknown[]) => (cancelOpenRequestsForTarget as any)(...args),
  cancelRequestInternal: jest.fn()
}));
jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: jest.fn(async () => branding)
}));

const branding = {
  issuer: {
    kind: 'AGENCY',
    name: 'Agence Test',
    legalName: null,
    address: 'Abidjan',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: null
};

import { BadRequestError, NotFoundError } from '../../src/middleware/error-middleware';
import { SourceChangedError } from '../../src/lib/signature/sources';
import { buildSaleAgreementPdf, loadAgreementPdfData } from '../../src/lib/sales/agreement-pdf';
import { markAgreementSignedTx } from '../../src/lib/sales/agreement-sign';
import {
  addCondition,
  cancelAgreement,
  deleteCondition,
  patchCondition,
  replaceMilestones,
  signAgreement,
  updateAgreement
} from '../../src/lib/sales/agreements';
import { saleAgreementSource } from '../../src/lib/signature/sources/sale-agreement';

const AG = '33333333-3333-4333-8333-333333333333';
const T = 'tenant-1';
const ctx = { tenantId: T, userId: 'u1' };
const baseRow = (extra: Row = {}): Row => ({
  id: AG,
  tenantId: T,
  year: 2026,
  sequence: 7,
  offerId: 'o1',
  mandateId: 'm1',
  propertyId: 'p1',
  price: 120_000_000,
  depositAmount: 12_000_000,
  depositHolder: 'NOTARY',
  notaryName: 'Me Diallo',
  signedAt: null,
  expectedDeedDate: new Date('2026-12-15'),
  deedDate: null,
  status: 'DRAFT',
  cancelledAt: null,
  cancelReason: null,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
  ...extra
});

/** Texte dessiné dans un PDF pdf-lib (flux compressés, chaînes hexadécimales WinAnsi). */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const out: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const text = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
      for (const hex of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        out.push(Buffer.from(hex[1], 'hex').toString('latin1'));
      }
    } catch {
      // flux non texte (police, image)
    }
  }
  return out.join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  db.agreement = baseRow();
  db.currency = 'XOF';
  envMock.env = { SIGNATURE_PROVIDER_REQUIRED_KINDS: ['SALE_AGREEMENT'] };
  assertBelongsToTenant.mockResolvedValue(undefined);
});

describe('PDF du compromis', () => {
  it('produit un PDF valide : parties, prix en lettres, séquestre, conditions, échéancier', async () => {
    const pdf = await buildSaleAgreementPdf(T, AG);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    const text = pdfText(pdf).replace(/\s+/g, ' ');
    expect(text).toContain('COMPROMIS DE VENTE');
    expect(text).toContain('CV-2026-0007');
    expect(text).toContain('Kouassi Yao');
    expect(text).toContain('Awa Koné');
    expect(text).toContain('120 000 000 XOF');
    expect(text).not.toContain('FCFA');
    expect(text).toContain('cent vingt millions');
    expect(text).toContain('séquestré entre les mains du notaire Me Diallo');
    expect(text).toContain('Obtention du prêt');
    expect(text).toContain('Acompte');
    expect(text).toContain('15/12/2026');
  });

  it('R-5 : la devise imprimée est celle du bien, en chiffres comme en lettres', async () => {
    db.currency = 'EUR';
    const text = pdfText(await buildSaleAgreementPdf(T, AG)).replace(/\s+/g, ' ');
    expect(text).toContain('120 000 000 EUR');
    expect(text).toContain('euros');
    expect(text).not.toContain('FCFA');
  });

  it('ne lit jamais le prix plancher du mandat et ne le rend pas', async () => {
    prismaMock.saleMandate.findFirst.mockImplementationOnce(async (args: Row) => {
      expect(args.select).not.toHaveProperty('minimumPrice');
      expect(args.select).not.toHaveProperty('askingPrice');
      // Même si une requête le rendait, il ne figure dans aucun champ imprimé.
      return { sellerClientId: 'sc1', agentUserId: null, minimumPrice: 987_654_321 };
    });
    const data = await loadAgreementPdfData(T, AG);
    expect(JSON.stringify(data)).not.toContain('987654321');
    expect(pdfText(await buildSaleAgreementPdf(T, AG))).not.toContain('987');
  });

  it("compromis d'une autre agence : même NotFoundError qu'un compromis inexistant", async () => {
    db.agreement = null;
    await expect(loadAgreementPdfData('autre-agence', AG)).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.saleAgreement.findFirst).toHaveBeenCalledWith({
      where: { id: AG, tenantId: 'autre-agence' }
    });
  });
});

describe('source SALE_AGREEMENT', () => {
  it('SG-R1 : l’exigence d’un prestataire est portée par le noyau (variable d’environnement), plus par la source', () => {
    expect(saleAgreementSource.providerRequired).toBeUndefined();
  });

  it('déclare les permissions CRM et la fonctionnalité Ventes', () => {
    expect(saleAgreementSource).toMatchObject({
      kind: 'SALE_AGREEMENT',
      targetType: 'SaleAgreement',
      viewPermission: 'CRM_DEALS_VIEW',
      editPermission: 'CRM_DEALS_EDIT',
      feature: 'SALES'
    });
  });

  it('S-6 : un identifiant qui n’est pas un UUID est une cible inconnue, sans lecture', async () => {
    await expect(saleAgreementSource.assertTarget(ctx, 'pas-un-uuid')).rejects.toBeInstanceOf(NotFoundError);
    await expect(saleAgreementSource.defaultSigners!(ctx, 'pas-un-uuid')).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await saleAgreementSource.isSourceIntact({
        id: 'r1',
        tenantId: T,
        kind: 'SALE_AGREEMENT',
        targetType: 'SaleAgreement',
        targetId: 'pas-un-uuid',
        sourceDocumentId: null,
        sourceDocHash: 'x'
      })
    ).toBe(false);
    expect(prismaMock.saleAgreement.findFirst).not.toHaveBeenCalled();
  });

  it("assertTarget : compromis d'une autre agence refusé (404), non brouillon refusé (400)", async () => {
    await saleAgreementSource.assertTarget(ctx, AG);
    expect(assertBelongsToTenant).toHaveBeenCalledWith(expect.anything(), 'saleAgreement', AG, T, expect.anything());

    assertBelongsToTenant.mockRejectedValueOnce(new NotFoundError('Compromis introuvable.'));
    await expect(saleAgreementSource.assertTarget(ctx, AG)).rejects.toBeInstanceOf(NotFoundError);

    db.agreement = baseRow({ status: 'SIGNED' });
    await expect(saleAgreementSource.assertTarget(ctx, AG)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('isSourceIntact : faux si le compromis a changé ou n’est plus en brouillon', async () => {
    const hash = await saleAgreementSource.snapshotHash!(ctx, AG);
    const request = {
      id: 'r1',
      tenantId: T,
      kind: 'SALE_AGREEMENT' as const,
      targetType: 'SaleAgreement',
      targetId: AG,
      sourceDocumentId: null,
      sourceDocHash: hash
    };
    expect(await saleAgreementSource.isSourceIntact(request)).toBe(true);

    db.agreement = baseRow({ price: 130_000_000 });
    expect(await saleAgreementSource.isSourceIntact(request)).toBe(false);

    db.agreement = baseRow({ status: 'CANCELLED' });
    expect(await saleAgreementSource.isSourceIntact(request)).toBe(false);
  });

  it('R-6 : isSourceIntact renvoie false (et ne lève pas) si l’offre, le mandat ou le bien a disparu', async () => {
    const hash = await saleAgreementSource.snapshotHash!(ctx, AG);
    const request = {
      id: 'r1',
      tenantId: T,
      kind: 'SALE_AGREEMENT' as const,
      targetType: 'SaleAgreement',
      targetId: AG,
      sourceDocumentId: null,
      sourceDocHash: hash
    };
    prismaMock.saleOffer.findFirst.mockResolvedValueOnce(null);
    expect(await saleAgreementSource.isSourceIntact(request)).toBe(false);
    prismaMock.property.findFirst.mockResolvedValueOnce(null);
    expect(await saleAgreementSource.isSourceIntact(request)).toBe(false);
  });

  it('R-3 : loadSource rend l’empreinte des données qui ont servi au rendu, celle que recalcule snapshotHash', async () => {
    const loaded = await saleAgreementSource.loadSource(ctx, AG);
    expect(loaded.documentHash).toBe(await saleAgreementSource.snapshotHash!(ctx, AG));
    expect(loaded.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('R-4 : conditions et échéances sont lues avec un tri total (second critère id)', async () => {
    await loadAgreementPdfData(T, AG);
    expect(prismaMock.saleAgreementCondition.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' }
    ]);
    expect(prismaMock.salePaymentMilestone.findMany.mock.calls[0][0].orderBy).toEqual([
      { sortOrder: 'asc' },
      { id: 'asc' }
    ]);
  });

  it('defaultSigners : vendeur (lien CRM du client), acquéreur et agent, lectures filtrées par agence', async () => {
    const signers = await saleAgreementSource.defaultSigners!(ctx, AG);
    expect(signers.map(s => s.role)).toEqual(['VENDEUR', 'ACQUEREUR', 'AGENT']);
    expect(signers[0]).toMatchObject({ contactId: 'c-seller', phone: '0505050505' });
    expect(signers[1]).toMatchObject({ email: 'awa@exemple.ci', phone: '0707070707', contactId: 'c1' });
    for (const call of prismaMock.crmContact.findFirst.mock.calls) expect(call[0].where.tenantId).toBe(T);
    expect(prismaMock.tenantClient.findFirst.mock.calls[0][0].where.tenantId).toBe(T);
  });

  it('S-8 : le vendeur sans lien CRM n’a ni contact, ni téléphone, ni recherche par e-mail', async () => {
    prismaMock.tenantClient.findFirst.mockResolvedValueOnce({
      details: null,
      user: { fullName: 'Kouassi Yao', email: 'yao@exemple.ci' }
    });
    const signers = await saleAgreementSource.defaultSigners!(ctx, AG);
    expect(signers[0]).toMatchObject({ role: 'VENDEUR', contactId: null, phone: null, email: 'yao@exemple.ci' });
    for (const call of prismaMock.crmContact.findFirst.mock.calls) expect(call[0].where).not.toHaveProperty('email');
  });

  it('R-9 : sans négociateur sur le mandat, l’agent est celui qui ouvre l’écran', async () => {
    prismaMock.saleMandate.findFirst.mockResolvedValueOnce({ sellerClientId: 'sc1', agentUserId: null });
    await saleAgreementSource.defaultSigners!(ctx, AG);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
  });
});

describe('onSealed', () => {
  const request = (hash: string | null = null) => ({
    id: 'r1',
    tenantId: T,
    kind: 'SALE_AGREEMENT' as const,
    targetType: 'SaleAgreement',
    targetId: AG,
    sourceDocumentId: null,
    sourceDocHash: hash
  });

  it('DRAFT -> SIGNED à la date du scellement, bien en UNDER_OFFER, par l’émetteur de la demande', async () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const hash = await saleAgreementSource.snapshotHash!(ctx, AG);
    await saleAgreementSource.onSealed(prismaMock as never, request(hash), now);
    expect(prismaMock.saleAgreement.updateMany).toHaveBeenCalledWith({
      where: { id: AG, tenantId: T, status: 'DRAFT' },
      data: { status: 'SIGNED', signedAt: now }
    });
    expect(setPropertyStatusTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ propertyId: 'p1', tenantId: T, newStatus: 'UNDER_OFFER', actorUserId: 'u-creator' })
    );
  });

  it('S-2 : un compromis modifié depuis l’envoi n’est pas marqué signé (SourceChangedError)', async () => {
    const hash = await saleAgreementSource.snapshotHash!(ctx, AG);
    db.agreement = baseRow({ price: 130_000_000 });
    await expect(saleAgreementSource.onSealed(prismaMock as never, request(hash), new Date())).rejects.toBeInstanceOf(
      SourceChangedError
    );
    expect(prismaMock.saleAgreement.updateMany).not.toHaveBeenCalled();
    expect(setPropertyStatusTx).not.toHaveBeenCalled();
  });

  it('S-1 : un compromis qui n’est plus en brouillon n’est pas retouché (le noyau annule la demande)', async () => {
    for (const status of ['SIGNED', 'CANCELLED', 'COMPLETED']) {
      db.agreement = baseRow({ status });
      await expect(saleAgreementSource.onSealed(prismaMock as never, request(null), new Date())).rejects.toBeInstanceOf(
        SourceChangedError
      );
    }
    expect(setPropertyStatusTx).not.toHaveBeenCalled();
    expect(db.agreement?.status).toBe('COMPLETED');
  });

  it('S-1 : transition conditionnelle, le statut du bien n’est touché que si le compromis est passé à SIGNED', async () => {
    prismaMock.saleAgreement.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await markAgreementSignedTx(prismaMock as never, {
      tenantId: T,
      agreementId: AG,
      actorUserId: 'u1',
      signedAt: new Date()
    });
    expect(result).toBeNull();
    expect(setPropertyStatusTx).not.toHaveBeenCalled();
  });

  it('S-5 : statut du bien incompatible au scellement, le compromis est quand même SIGNED et un audit est tracé', async () => {
    setPropertyStatusTx.mockRejectedValueOnce(Object.assign(new Error('Transition invalide'), { status: 409 }));
    await saleAgreementSource.onSealed(prismaMock as never, request(null), new Date());
    expect(db.agreement?.status).toBe('SIGNED');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionKey: 'SIGNATURE_PROPERTY_STATUS_TO_REVIEW',
        entityType: 'SaleAgreement',
        entityId: AG,
        tenantId: T
      })
    );
  });

  it('S-5 : la signature manuelle laisse l’erreur de statut remonter, et une erreur de base remonte toujours', async () => {
    setPropertyStatusTx.mockRejectedValueOnce(Object.assign(new Error('Transition invalide'), { status: 409 }));
    await expect(
      markAgreementSignedTx(prismaMock as never, {
        tenantId: T,
        agreementId: AG,
        actorUserId: 'u1',
        signedAt: new Date()
      })
    ).rejects.toThrow('Transition invalide');
    db.agreement = baseRow();
    setPropertyStatusTx.mockRejectedValueOnce(new Error('connexion perdue'));
    await expect(saleAgreementSource.onSealed(prismaMock as never, request(null), new Date())).rejects.toThrow(
      'connexion perdue'
    );
  });

  it('markAgreementSignedTx ignore un compromis d’une autre agence', async () => {
    const result = await markAgreementSignedTx(prismaMock as never, {
      tenantId: 'autre',
      agreementId: AG,
      actorUserId: 'u1',
      signedAt: new Date()
    });
    expect(result).toBeNull();
    expect(setPropertyStatusTx).not.toHaveBeenCalled();
  });
});

describe('modification après envoi : la demande ouverte est annulée (SG-R2)', () => {
  const expected = [{ tenantId: T, userId: 'u1' }, 'SaleAgreement', AG];

  it('prix modifié : annulée ; enregistrement sans changement : rien', async () => {
    await updateAgreement(T, AG, { price: 125_000_000 }, 'u1');
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledWith(...expected);

    cancelOpenRequestsForTarget.mockClear();
    await updateAgreement(T, AG, { price: 120_000_000, depositAmount: 12_000_000, notaryName: 'Me Diallo' });
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();
  });

  it('échéancier, conditions et annulation du compromis annulent la demande, avec l’utilisateur', async () => {
    db.agreement = baseRow();
    prismaMock.saleAgreementCondition.findFirst.mockResolvedValue({
      id: 'cond-1',
      agreementId: AG,
      label: 'Obtention du prêt',
      dueDate: null,
      status: 'PENDING'
    });

    await replaceMilestones(T, AG, [], 'u1');
    await addCondition(T, AG, { label: 'Permis de construire' }, 'u1');
    await patchCondition(T, 'cond-1', { label: 'Autre' }, 'u1');
    await deleteCondition(T, 'cond-1', 'u1');
    await cancelAgreement(T, 'u1', AG, { reason: 'Désistement' });
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledTimes(5);
    for (const call of cancelOpenRequestsForTarget.mock.calls) {
      expect(call[0]).toEqual({ tenantId: T, userId: 'u1' });
      expect(call[1]).toBe('SaleAgreement');
      expect(call[2]).toBe(AG);
    }
  });

  it('R-1 : un changement de statut seul d’une condition n’annule rien, un libellé ou une échéance oui', async () => {
    prismaMock.saleAgreementCondition.findFirst.mockResolvedValue({
      id: 'cond-1',
      agreementId: AG,
      label: 'x',
      dueDate: null,
      status: 'PENDING'
    });
    // L’update simulé rend { label: 'x', dueDate: null, status: 'MET' } : seul le statut change.
    await patchCondition(T, 'cond-1', { status: 'MET' }, 'u1');
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();

    prismaMock.saleAgreementCondition.update.mockResolvedValueOnce({
      id: 'cond-1',
      label: 'x',
      dueDate: new Date('2026-12-01'),
      status: 'PENDING',
      resolvedAt: null
    });
    await patchCondition(T, 'cond-1', { dueDate: '2026-12-01' }, 'u1');
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledTimes(1);
  });

  it('R-1 : un échéancier inchangé, ou seule la date de paiement modifiée, n’annule rien ; un montant oui', async () => {
    const same = [{ label: 'Acompte', dueDate: new Date('2026-11-01'), amount: 5_000_000 }];
    prismaMock.salePaymentMilestone.findMany.mockResolvedValue(same);
    await replaceMilestones(
      T,
      AG,
      [{ label: 'Acompte', dueDate: '2026-11-01', amount: 5_000_000, paidAt: '2026-11-02' }],
      'u1'
    );
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();

    prismaMock.salePaymentMilestone.findMany
      .mockResolvedValueOnce(same)
      .mockResolvedValueOnce([{ label: 'Acompte', dueDate: new Date('2026-11-01'), amount: 6_000_000 }]);
    await replaceMilestones(T, AG, [{ label: 'Acompte', dueDate: '2026-11-01', amount: 6_000_000 }], 'u1');
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledTimes(1);
  });

  it('S-1 : annulation conditionnelle, un compromis déjà conclu ou annulé entre-temps répond 409', async () => {
    prismaMock.saleAgreement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(cancelAgreement(T, 'u1', AG, { reason: 'Désistement' })).rejects.toMatchObject({ status: 409 });
    expect(setPropertyStatusTx).not.toHaveBeenCalled();
    expect(cancelOpenRequestsForTarget).not.toHaveBeenCalled();
  });

  it('signature manuelle : la demande électronique ouverte est annulée', async () => {
    await signAgreement(T, 'u1', AG, { signedAt: '2026-10-20' });
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledWith({ tenantId: T, userId: 'u1' }, 'SaleAgreement', AG);
  });

  it('un échec de l’annulation ne défait pas la modification', async () => {
    cancelOpenRequestsForTarget.mockRejectedValueOnce(new Error('boom'));
    await expect(updateAgreement(T, AG, { price: 126_000_000 })).resolves.toBeDefined();
  });
});
