/**
 * Sources de signature des mandats (spec 043, lot S2) : mandat de gestion
 * (PropertyMandate) et mandat de vente (SaleMandate). Contrat du registre,
 * isolation entre agences, droits, scellement et annulation, signataires
 * proposés, PDF produit (valide, sans prix plancher ni notes). La base est simulée.
 */
import { PDFDocument } from 'pdf-lib';

type Row = Record<string, any>;

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const MANDATE_ID = '11111111-1111-4111-8111-111111111111';
const SALE_ID = '22222222-2222-4222-8222-222222222222';

const db: { propertyMandate: Row | null; saleMandate: Row | null; shares: Row[]; terms: Row | null } = {
  propertyMandate: null,
  saleMandate: null,
  shares: [],
  terms: null
};

const USERS: Record<string, Row> = {
  'owner-user': { fullName: 'Awa Konan', email: 'awa@example.test' },
  'agent-user': { fullName: 'Marc Agent', email: 'marc@example.test' },
  'caller-user': { fullName: 'Lea Caller', email: 'lea@example.test' }
};

const inTenant = (row: Row | null, where: Row) =>
  row && row.id === where.id && row.tenantId === where.tenantId ? row : null;

const propertyMandateFindFirst = jest.fn(async ({ where }: Row) => inTenant(db.propertyMandate, where));
const saleMandateFindFirst = jest.fn(async ({ where }: Row) => inTenant(db.saleMandate, where));
const shareFindMany = jest.fn(async () => db.shares);
const tenantClientFindFirst = jest.fn(async () => ({
  details: { crmContactId: 'contact-owner' },
  managementTerms: db.terms
}));
const prismaMock: Row = {
  propertyMandate: { findFirst: propertyMandateFindFirst },
  saleMandate: { findFirst: saleMandateFindFirst },
  propertyOwnershipShare: { findMany: shareFindMany },
  tenantClient: { findFirst: tenantClientFindFirst },
  user: { findUnique: jest.fn(async ({ where }: Row) => USERS[where.id] ?? null) }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

// Garde d'appartenance : refuse toute cible d'une autre agence (NotFoundError, comme l'originale).
jest.mock('../../src/utils/tenant-ownership', () => ({
  assertBelongsToTenant: jest.fn(
    async (_client: unknown, model: string, id: string, tenantId: string, options: Row) => {
      const row = model === 'propertyMandate' ? db.propertyMandate : db.saleMandate;
      if (!row || row.id !== id || row.tenantId !== tenantId) {
        const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
        throw new NotFoundError(options?.message ?? 'Ressource introuvable.');
      }
    }
  )
}));

// En-tête d'agence sans lecture de base ni de fichier.
jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: jest.fn(async () => ({
    issuer: {
      kind: 'AGENCY',
      name: 'Agence Test',
      legalName: 'Agence Test SARL',
      address: 'Abidjan',
      phone: null,
      email: null,
      rccm: 'CI-ABJ-2026',
      taxId: null
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null
  }))
}));

import { BadRequestError, NotFoundError } from '../../src/middleware/error-middleware';
import { findSignatureSource, SourceChangedError } from '../../src/lib/signature/sources';
import { managementMandateSource } from '../../src/lib/signature/sources/management-mandate';
import { saleMandateSource } from '../../src/lib/signature/sources/sale-mandate';
import { buildSaleMandateModel, loadSaleMandateData } from '../../src/lib/sales/mandate-pdf';
import {
  buildManagementMandateModel,
  loadManagementMandateData,
  scopeRows
} from '../../src/lib/properties/management-mandate-pdf';

const ctx = { tenantId: TENANT, userId: 'caller-user' };
const intruder = { tenantId: OTHER_TENANT, userId: 'caller-user' };

function seed() {
  db.propertyMandate = {
    id: MANDATE_ID,
    tenantId: TENANT,
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2027-01-01T00:00:00Z'),
    isActive: true,
    revokedAt: null,
    scope: { missions: ['Encaissement', 'Quittances'], renouvellementAuto: true, nested: { secret: 'x' } },
    notes: 'NOTE-INTERNE-CONFIDENTIELLE',
    ownerUserId: 'owner-user',
    property: {
      title: 'Villa Cocody',
      internalReference: 'PROP-001',
      address: 'Rue des Jardins',
      locationZone: 'Cocody',
      currency: 'XOF'
    },
    owner: USERS['owner-user']
  };
  db.terms = {
    managementFeeMode: 'PERCENT',
    managementFeeRate: 8,
    managementFeeFixedAmount: null,
    managementFeeBase: 'RENT_ONLY'
  };
  db.saleMandate = {
    id: SALE_ID,
    tenantId: TENANT,
    year: 2026,
    sequence: 7,
    status: 'ACTIVE',
    revokedAt: null,
    mandateType: 'EXCLUSIVE',
    askingPrice: 85000000,
    minimumPrice: 71234567,
    commissionMode: 'PERCENT',
    commissionRate: 5,
    commissionFixedAmount: null,
    commissionPayer: 'SELLER',
    startDate: new Date('2026-02-01T00:00:00Z'),
    endDate: null,
    notes: 'NOTE-INTERNE-CONFIDENTIELLE',
    propertyId: 'prop-1',
    sellerClientId: 'client-1',
    agentUserId: 'agent-user',
    property: {
      title: 'Villa Cocody',
      internalReference: 'PROP-001',
      address: 'Rue des Jardins',
      locationZone: 'Cocody',
      currency: 'XOF'
    },
    sellerClient: { details: { crmContactId: 'contact-seller' }, user: USERS['owner-user'] },
    agentUser: USERS['agent-user']
  };
  db.shares = [
    {
      sharePercent: 40,
      ownerClient: {
        details: { crmContactId: 'contact-co' },
        user: { fullName: 'Ben Konan', email: 'ben@example.test' }
      }
    }
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
});

describe('contrat des sources de mandat', () => {
  it("s'enregistrent d'elles-memes avec les droits et la fonctionnalite attendus", () => {
    expect(findSignatureSource('MANAGEMENT_MANDATE')).toBe(managementMandateSource);
    expect(findSignatureSource('SALE_MANDATE')).toBe(saleMandateSource);
    expect(managementMandateSource).toMatchObject({
      targetType: 'PropertyMandate',
      viewPermission: 'PROPERTIES_VIEW',
      editPermission: 'PROPERTIES_EDIT',
      feature: 'CORE'
    });
    expect(saleMandateSource).toMatchObject({
      targetType: 'SaleMandate',
      viewPermission: 'CRM_DEALS_VIEW',
      editPermission: 'CRM_DEALS_EDIT',
      feature: 'SALES'
    });
  });
});

describe('assertTarget', () => {
  it("accepte un mandat actif de l'agence", async () => {
    await expect(managementMandateSource.assertTarget(ctx, MANDATE_ID)).resolves.toBeUndefined();
    await expect(saleMandateSource.assertTarget(ctx, SALE_ID)).resolves.toBeUndefined();
  });

  it("refuse un mandat d'une autre agence comme un mandat inexistant", async () => {
    await expect(managementMandateSource.assertTarget(intruder, MANDATE_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saleMandateSource.assertTarget(intruder, SALE_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(managementMandateSource.assertTarget(ctx, 'inconnu')).rejects.toBeInstanceOf(NotFoundError);
  });

  it("traite un identifiant qui n'est pas un UUID comme une cible inconnue (mandat de vente)", async () => {
    await expect(saleMandateSource.assertTarget(ctx, "1'; DROP TABLE")).rejects.toBeInstanceOf(NotFoundError);
    expect(saleMandateFindFirst).not.toHaveBeenCalled();
  });

  it('refuse un mandat revoque ou termine', async () => {
    db.propertyMandate!.isActive = false;
    db.propertyMandate!.revokedAt = new Date();
    await expect(managementMandateSource.assertTarget(ctx, MANDATE_ID)).rejects.toBeInstanceOf(BadRequestError);
    db.saleMandate!.status = 'REVOKED';
    await expect(saleMandateSource.assertTarget(ctx, SALE_ID)).rejects.toBeInstanceOf(BadRequestError);
    db.saleMandate!.status = 'COMPLETED';
    await expect(saleMandateSource.assertTarget(ctx, SALE_ID)).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('PDF source', () => {
  it('produit un PDF valide pour le mandat de gestion', async () => {
    const loaded = await managementMandateSource.loadSource(ctx, MANDATE_ID);
    expect(loaded.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect((await PDFDocument.load(loaded.pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.title).toContain('Villa Cocody');
    expect(loaded.documentId ?? null).toBeNull();
  });

  it('produit un PDF valide pour le mandat de vente, sans lire le prix plancher', async () => {
    const loaded = await saleMandateSource.loadSource(ctx, SALE_ID);
    expect(loaded.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect((await PDFDocument.load(loaded.pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.title).toContain('MV-2026');
    // Le prix plancher n'est même pas demandé à la base.
    for (const [args] of saleMandateFindFirst.mock.calls) {
      expect(JSON.stringify((args as Row).select ?? {})).not.toContain('minimumPrice');
      expect(JSON.stringify((args as Row).select ?? {})).not.toContain('notes');
    }
  });

  it("n'imprime ni prix plancher ni notes internes (modeles)", async () => {
    const branding = { issuer: { name: 'Agence Test', legalName: null, address: null, rccm: null } } as any;
    const sale = JSON.stringify(buildSaleMandateModel((await loadSaleMandateData(TENANT, SALE_ID))!, branding));
    expect(sale).not.toContain('71234567');
    expect(sale).not.toContain('71 234 567');
    expect(sale).not.toContain('NOTE-INTERNE');
    expect(sale).toContain('85 000 000 XOF');
    expect(sale).toContain('Ben Konan');
    const management = JSON.stringify(
      buildManagementMandateModel((await loadManagementMandateData(TENANT, MANDATE_ID))!, branding)
    );
    expect(management).not.toContain('NOTE-INTERNE');
    expect(management).toContain('8 % des loyers');
  });

  it("ne lit rien pour un mandat d'une autre agence", async () => {
    await expect(managementMandateSource.loadSource(intruder, MANDATE_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saleMandateSource.loadSource(intruder, SALE_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('imprime seulement les valeurs simples du perimetre', () => {
    expect(scopeRows(db.propertyMandate!.scope)).toEqual([
      { label: 'Missions', value: 'Encaissement, Quittances' },
      { label: 'Renouvellement auto', value: 'Oui' }
    ]);
    expect(scopeRows(null)).toEqual([]);
  });
});

describe('empreinte et integrite (SG-R2)', () => {
  const request = (hash: string | null, targetId: string, tenantId = TENANT) => ({
    id: 'req-1',
    tenantId,
    kind: 'SALE_MANDATE' as const,
    targetType: 'x',
    targetId,
    sourceDocumentId: null,
    sourceDocHash: hash
  });

  it("un mandat de gestion inchange reste intact, modifie il ne l'est plus", async () => {
    const hash = await managementMandateSource.snapshotHash!(ctx, MANDATE_ID);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await managementMandateSource.isSourceIntact(request(hash, MANDATE_ID))).toBe(true);
    db.propertyMandate!.endDate = new Date('2028-01-01T00:00:00Z');
    expect(await managementMandateSource.isSourceIntact(request(hash, MANDATE_ID))).toBe(false);
  });

  it('un changement des honoraires du proprietaire invalide le mandat de gestion', async () => {
    const hash = await managementMandateSource.snapshotHash!(ctx, MANDATE_ID);
    db.terms!.managementFeeRate = 10;
    expect(await managementMandateSource.isSourceIntact(request(hash, MANDATE_ID))).toBe(false);
  });

  it("un mandat de vente modifie, revoque ou d'une autre agence n'est plus intact", async () => {
    const hash = await saleMandateSource.snapshotHash!(ctx, SALE_ID);
    expect(await saleMandateSource.isSourceIntact(request(hash, SALE_ID))).toBe(true);
    expect(await saleMandateSource.isSourceIntact(request(hash, SALE_ID, OTHER_TENANT))).toBe(false);
    db.saleMandate!.askingPrice = 90000000;
    expect(await saleMandateSource.isSourceIntact(request(hash, SALE_ID))).toBe(false);
    db.saleMandate!.askingPrice = 85000000;
    db.saleMandate!.status = 'REVOKED';
    expect(await saleMandateSource.isSourceIntact(request(hash, SALE_ID))).toBe(false);
  });

  it("l'empreinte ne depend pas du prix plancher (jamais lu)", async () => {
    const before = await saleMandateSource.snapshotHash!(ctx, SALE_ID);
    db.saleMandate!.minimumPrice = 1;
    expect(await saleMandateSource.snapshotHash!(ctx, SALE_ID)).toBe(before);
  });

  it("renvoie null pour une cible d'une autre agence", async () => {
    expect(await managementMandateSource.snapshotHash!(intruder, MANDATE_ID)).toBeNull();
    expect(await saleMandateSource.snapshotHash!(intruder, SALE_ID)).toBeNull();
  });
});

describe('scellement', () => {
  const updateMany = jest.fn(async (_args: Row) => ({ count: 1 }));
  const tx = {
    ...prismaMock,
    propertyMandate: { findFirst: propertyMandateFindFirst, updateMany },
    saleMandate: { findFirst: saleMandateFindFirst, updateMany }
  } as any;
  const now = new Date('2026-10-16T10:00:00Z');
  const view = (kind: string, targetId: string, hash: string | null) =>
    ({ id: 'req-9', tenantId: TENANT, kind, targetType: 'x', targetId, sourceDocHash: hash }) as any;

  beforeEach(() => updateMany.mockClear());

  it('onSealed pose signed_at et la demande, filtre par agence, si les données sont celles de l’envoi', async () => {
    const managementHash = await managementMandateSource.snapshotHash!(ctx, MANDATE_ID);
    const saleHash = await saleMandateSource.snapshotHash!(ctx, SALE_ID);
    await managementMandateSource.onSealed(tx, view('MANAGEMENT_MANDATE', MANDATE_ID, managementHash), now);
    await saleMandateSource.onSealed(tx, view('SALE_MANDATE', SALE_ID, saleHash), now);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: MANDATE_ID, tenantId: TENANT },
      data: { signedAt: now, signatureRequestId: 'req-9' }
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: SALE_ID, tenantId: TENANT },
      data: { signedAt: now, signatureRequestId: 'req-9' }
    });
  });

  it('S-2 : un mandat modifié depuis l’envoi n’est PAS marqué signé (SourceChangedError)', async () => {
    const managementHash = await managementMandateSource.snapshotHash!(ctx, MANDATE_ID);
    const saleHash = await saleMandateSource.snapshotHash!(ctx, SALE_ID);
    db.propertyMandate!.endDate = new Date('2030-01-01T00:00:00Z');
    db.saleMandate!.askingPrice = 99000000;
    await expect(
      managementMandateSource.onSealed(tx, view('MANAGEMENT_MANDATE', MANDATE_ID, managementHash), now)
    ).rejects.toBeInstanceOf(SourceChangedError);
    await expect(saleMandateSource.onSealed(tx, view('SALE_MANDATE', SALE_ID, saleHash), now)).rejects.toBeInstanceOf(
      SourceChangedError
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('S-2 : un mandat révoqué entre l’envoi et le scellement n’est pas marqué signé', async () => {
    db.propertyMandate!.isActive = false;
    db.saleMandate!.status = 'REVOKED';
    await expect(
      managementMandateSource.onSealed(tx, view('MANAGEMENT_MANDATE', MANDATE_ID, null), now)
    ).rejects.toBeInstanceOf(SourceChangedError);
    await expect(saleMandateSource.onSealed(tx, view('SALE_MANDATE', SALE_ID, null), now)).rejects.toBeInstanceOf(
      SourceChangedError
    );
    await expect(saleMandateSource.onSealed(tx, view('SALE_MANDATE', 'pas-un-uuid', null), now)).rejects.toBeInstanceOf(
      SourceChangedError
    );
  });

  it('R-7 : un mandat déjà signé ne repart pas en signature (409), sans onCancel mort', async () => {
    db.propertyMandate!.signedAt = new Date();
    db.saleMandate!.signedAt = new Date();
    await expect(managementMandateSource.assertTarget(ctx, MANDATE_ID)).rejects.toMatchObject({ statusCode: 409 });
    await expect(saleMandateSource.assertTarget(ctx, SALE_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(managementMandateSource.onCancel).toBeUndefined();
    expect(saleMandateSource.onCancel).toBeUndefined();
  });
});

describe('empreinte tirée du rendu (R-3) et du périmètre imprimé (R-8)', () => {
  it('loadSource rend l’empreinte des données du rendu, identique à snapshotHash', async () => {
    const management = await managementMandateSource.loadSource(ctx, MANDATE_ID);
    expect(management.documentHash).toBe(await managementMandateSource.snapshotHash!(ctx, MANDATE_ID));
    const sale = await saleMandateSource.loadSource(ctx, SALE_ID);
    expect(sale.documentHash).toBe(await saleMandateSource.snapshotHash!(ctx, SALE_ID));
  });

  it('seules les clés de périmètre imprimées entrent dans l’empreinte du mandat de gestion', async () => {
    const before = await managementMandateSource.snapshotHash!(ctx, MANDATE_ID);
    db.propertyMandate!.scope = { ...db.propertyMandate!.scope, nested: { autre: 'valeur non imprimée' } };
    expect(await managementMandateSource.snapshotHash!(ctx, MANDATE_ID)).toBe(before);
    db.propertyMandate!.scope = { ...db.propertyMandate!.scope, missions: ['Autre mission'] };
    expect(await managementMandateSource.snapshotHash!(ctx, MANDATE_ID)).not.toBe(before);
  });

  it('R-4 : les lectures de quotes-parts sont triées de façon totale', async () => {
    await saleMandateSource.snapshotHash!(ctx, SALE_ID);
    expect(shareFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    );
  });
});

describe('signataires proposes', () => {
  it('mandat de gestion : mandant avec contact CRM, puis agent', async () => {
    expect(await managementMandateSource.defaultSigners!(ctx, MANDATE_ID)).toEqual([
      { role: 'MANDANT', fullName: 'Awa Konan', email: 'awa@example.test', phone: null, contactId: 'contact-owner' },
      { role: 'AGENT', fullName: 'Lea Caller', email: 'lea@example.test', phone: null, contactId: null }
    ]);
    expect(tenantClientFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, userId: 'owner-user' } })
    );
  });

  it('mandat de vente : vendeur, co-vendeurs (indivision) et negociateur du mandat', async () => {
    const signers = await saleMandateSource.defaultSigners!(ctx, SALE_ID);
    expect(signers.map(s => [s.role, s.fullName, s.contactId])).toEqual([
      ['VENDEUR', 'Awa Konan', 'contact-seller'],
      ['COVENDEUR', 'Ben Konan', 'contact-co'],
      ['AGENT', 'Marc Agent', null]
    ]);
    expect(shareFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) })
    );
  });

  it("ne propose rien pour un mandat d'une autre agence", async () => {
    await expect(managementMandateSource.defaultSigners!(intruder, MANDATE_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saleMandateSource.defaultSigners!(intruder, SALE_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});
