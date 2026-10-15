/**
 * Signature de l'état des lieux (spec 043, lot S3) : PDF serveur, source
 * LEASE_INSPECTION (statut finalisé exigé, isolation inter-agences, empreinte
 * du contenu et des photos, signataires) et annulation à la suppression.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edl-sign-'));
const envMock: { UPLOADS_DIR?: string } = { UPLOADS_DIR: uploadsDir };
jest.mock('../../src/config/env', () => ({ env: envMock }));

type Row = Record<string, any>;
const inspections: Record<string, Row> = {};
let completedRequest: Row | null = null;

const prismaMock: Row = {
  leaseInspection: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = inspections[where.id];
      if (!row || row.tenantId !== where.tenantId) return null;
      if (where.lease?.tenant_id && where.lease.tenant_id !== row.tenantId) return null;
      return row;
    }),
    delete: jest.fn(async () => undefined)
  },
  rentalLease: { findFirst: jest.fn(async ({ where }: Row) => ({ id: where.id })) },
  signatureRequest: { findFirst: jest.fn(async () => completedRequest) },
  crmContact: {
    findMany: jest.fn(async ({ where }: Row) =>
      where.tenantId === 't1'
        ? [
            {
              id: 'c1',
              firstName: 'Awa',
              lastName: 'Traoré',
              email: 'awa@example.com',
              phonePrimary: '0102030405',
              whatsappNumber: null
            }
          ]
        : []
    )
  },
  user: { findUnique: jest.fn(async () => ({ fullName: 'Agent Test', email: 'agent@example.com' })) }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: jest.fn(async () => ({
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
  }))
}));

const cancelOpenRequestsForTarget = jest.fn(async () => 0);
jest.mock('../../src/lib/signature/cancel', () => ({
  cancelOpenRequestsForTarget: (...args: unknown[]) => (cancelOpenRequestsForTarget as any)(...args)
}));

import { NotFoundError } from '../../src/middleware/error-middleware';
import {
  buildInspectionPdf,
  buildInspectionPdfModel,
  computeInspectionContentHash,
  loadInspectionForPdf,
  readInspectionPhoto,
  renderInspectionPdf,
  resolveInspectionPhotoPath
} from '../../src/lib/lease-inspections/inspection-pdf';
import { leaseInspectionSource } from '../../src/lib/signature/sources/lease-inspection';
import { deleteInspection } from '../../src/lib/lease-inspections/service';

const INSPECTION_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';

// PNG 1x1 valide.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

function inspectionRow(overrides: Row = {}): Row {
  return {
    id: INSPECTION_ID,
    tenantId: 't1',
    leaseId: 'l1',
    type: 'EXIT',
    status: 'FINALIZED',
    inspectionDate: new Date('2026-10-01T12:00:00Z'),
    finalizedAt: new Date('2026-10-01T15:00:00Z'),
    rooms: [
      {
        id: 'r1',
        name: 'Cuisine',
        items: [
          { id: 'i1', label: 'Sol', condition: 'GOOD', comment: 'Rayure légère près de l’évier' },
          {
            id: 'i2',
            label: 'Réfrigérateur',
            condition: 'MISSING',
            comment: null,
            kind: 'FURNITURE',
            quantity: 0,
            replacementValue: 250000
          }
        ]
      }
    ],
    meters: { electricity: '1 234', water: '56', gas: null },
    keysCount: 2,
    generalComment: 'RAS',
    tenantPresent: true,
    tenantSignatoryName: 'Awa Traoré',
    agentSignatoryName: 'Agent Test',
    deductions: [{ id: 'd1', label: 'Réfrigérateur manquant', amount: 250000, roomId: 'r1', itemId: 'i2' }],
    photos: [
      {
        id: 'p1',
        roomId: 'r1',
        itemId: 'i1',
        fileName: 'sol.png',
        filePath: 'C:\\x\\sol.png',
        sizeBytes: 70,
        caption: 'Sol'
      },
      {
        id: 'p2',
        roomId: null,
        itemId: null,
        fileName: 'a.webp',
        filePath: '/srv/a.webp',
        sizeBytes: 20,
        caption: null
      },
      {
        id: 'p3',
        roomId: null,
        itemId: null,
        fileName: 'perdue.jpg',
        filePath: '/srv/perdue.jpg',
        sizeBytes: 20,
        caption: null
      }
    ],
    lease: {
      lease_number: 'BAIL-001',
      property: { title: 'Villa Cocody', address: 'Rue des Jardins' },
      primaryRenter: {
        details: { crmContactId: 'c1' },
        user: { fullName: 'Awa Traoré', email: 'awa.user@example.com' }
      },
      coRenters: [{ renterClient: { details: null, user: { fullName: 'Moussa Koné', email: null } } }],
      ownerClient: { details: null, user: { fullName: 'Bailleur Un', email: 'bailleur@example.com' } }
    },
    ...overrides
  };
}

function writePhotos(tenantId = 't1', inspectionId = INSPECTION_ID) {
  const dir = path.join(uploadsDir, 'lease-inspections', tenantId, inspectionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sol.png'), PNG_1X1);
  fs.writeFileSync(path.join(dir, 'a.webp'), WEBP);
  return dir;
}

beforeEach(() => {
  jest.clearAllMocks();
  completedRequest = null;
  fs.rmSync(path.join(uploadsDir, 'lease-inspections'), { recursive: true, force: true });
  for (const key of Object.keys(inspections)) delete inspections[key];
  inspections[INSPECTION_ID] = inspectionRow();
  inspections[DRAFT_ID] = inspectionRow({ id: DRAFT_ID, status: 'DRAFT', finalizedAt: null, photos: [] });
});

afterAll(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('PDF de l’état des lieux', () => {
  it('produit un PDF valide, avec photo lisible, photo WebP et photo manquante tolérées', async () => {
    writePhotos();
    const { buffer, fileName } = await buildInspectionPdf('t1', INSPECTION_ID);
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(fileName).toBe('etat-des-lieux-sortie-2026-10-01.pdf');
    const reloaded = await PDFDocument.load(buffer);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('sort aussi sans aucune photo sur disque', async () => {
    const { buffer } = await buildInspectionPdf('t1', INSPECTION_ID);
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('imprime les retenues et le mobilier d’une sortie, pas les retenues d’une entrée', () => {
    const base = {
      inspectionDate: new Date('2026-10-01T12:00:00Z'),
      finalizedAt: null,
      tenantPresent: false,
      tenantSignatoryName: null,
      agentSignatoryName: 'Agent',
      keysCount: null,
      meters: null,
      generalComment: null,
      rooms: inspections[INSPECTION_ID].rooms,
      deductions: inspections[INSPECTION_ID].deductions,
      lease: { number: 'B1', propertyTitle: null, propertyAddress: null, renterNames: [], ownerName: null },
      photos: []
    };
    const exit = buildInspectionPdfModel({ ...base, type: 'EXIT' });
    const entry = buildInspectionPdfModel({ ...base, type: 'ENTRY' });
    const titles = (model: typeof exit) => model.sections.map(section => section.title);
    expect(titles(exit)).toContain('Retenues proposées sur le dépôt de garantie');
    expect(titles(entry)).not.toContain('Retenues proposées sur le dépôt de garantie');
    const kitchen = exit.sections.find(section => section.title === 'Cuisine');
    expect(kitchen?.kind === 'table' && kitchen.rows[1]).toEqual([
      'Réfrigérateur',
      'Manquant',
      '0',
      '250 000 FCFA / unité',
      ''
    ]);
    expect(exit.signatures[0].label).toBe('Le locataire (absent)');
  });

  it('rend un très long texte arabe ou multiligne sans erreur', async () => {
    const model = buildInspectionPdfModel({
      type: 'ENTRY',
      inspectionDate: new Date('2026-10-01T12:00:00Z'),
      finalizedAt: null,
      tenantPresent: true,
      tenantSignatoryName: 'علي',
      agentSignatoryName: 'Agent',
      keysCount: 1,
      meters: null,
      generalComment: 'مرحبا\n'.repeat(400),
      rooms: Array.from({ length: 30 }, (_, i) => ({
        id: `r${i}`,
        name: `Pièce ${i}`,
        items: Array.from({ length: 12 }, (_, j) => ({
          id: `i${i}-${j}`,
          label: `Élément ${j}`,
          condition: 'GOOD' as const,
          comment: 'x'.repeat(500)
        }))
      })),
      deductions: [],
      lease: { number: 'B1', propertyTitle: 'علي', propertyAddress: null, renterNames: ['علي'], ownerName: null },
      photos: [{ label: 'Photo', caption: null, image: null }]
    });
    const buffer = await renderInspectionPdf(model, {
      issuer: {
        kind: 'AGENCY',
        name: 'A',
        legalName: null,
        address: null,
        phone: null,
        email: null,
        rccm: null,
        taxId: null
      },
      issuerLogo: null,
      signature: null,
      stamp: null,
      syndicate: null
    });
    expect((await PDFDocument.load(buffer)).getPageCount()).toBeGreaterThan(1);
  });
});

describe('photos', () => {
  it('lit une photo valide, signale WebP et fichier absent sans lever', async () => {
    writePhotos();
    expect((await readInspectionPhoto('t1', INSPECTION_ID, { filePath: 'C:\\x\\sol.png' })).ok).toBe(true);
    expect(await readInspectionPhoto('t1', INSPECTION_ID, { filePath: '/srv/a.webp' })).toEqual({
      ok: false,
      reason: 'UNSUPPORTED'
    });
    expect(await readInspectionPhoto('t1', INSPECTION_ID, { filePath: '/srv/perdue.jpg' })).toEqual({
      ok: false,
      reason: 'MISSING'
    });
  });

  it('ne suit jamais le chemin stocké : nom de fichier seul, dans le dossier de cette agence', () => {
    const dir = path.resolve(uploadsDir, 'lease-inspections', 't1', INSPECTION_ID);
    const resolved = resolveInspectionPhotoPath('t1', INSPECTION_ID, '../../../../etc/passwd');
    expect(resolved).toBe(path.join(dir, 'passwd'));
    expect(resolveInspectionPhotoPath('t1', INSPECTION_ID, '..')).toBeNull();
    expect(resolveInspectionPhotoPath('t1', INSPECTION_ID, '')).toBeNull();
  });

  it('une photo d’une autre agence n’est pas lue', async () => {
    writePhotos('t2');
    expect(await readInspectionPhoto('t1', INSPECTION_ID, { filePath: 'sol.png' })).toEqual({
      ok: false,
      reason: 'MISSING'
    });
  });
});

describe('empreinte du contenu', () => {
  it('est stable, puis change avec les données ou le contenu d’une photo', async () => {
    const dir = writePhotos();
    const first = await computeInspectionContentHash(await loadInspectionForPdf('t1', INSPECTION_ID));
    const again = await computeInspectionContentHash(await loadInspectionForPdf('t1', INSPECTION_ID));
    expect(again).toBe(first);

    fs.writeFileSync(path.join(dir, 'sol.png'), Buffer.concat([PNG_1X1, Buffer.from([0])]));
    const photoChanged = await computeInspectionContentHash(await loadInspectionForPdf('t1', INSPECTION_ID));
    expect(photoChanged).not.toBe(first);

    inspections[INSPECTION_ID] = inspectionRow({ generalComment: 'Modifié' });
    const dataChanged = await computeInspectionContentHash(await loadInspectionForPdf('t1', INSPECTION_ID));
    expect(dataChanged).not.toBe(photoChanged);
  });
});

describe('empreinte : photos retenues seulement (S-9) et rendu unique (R-3)', () => {
  const manyPhotos = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `px${String(index).padStart(3, '0')}`,
      roomId: null,
      itemId: null,
      fileName: 'sol.png',
      filePath: 'sol.png',
      sizeBytes: 70,
      caption: `Photo ${index}`
    }));

  it('une photo au-delà du plafond (non imprimée) n’invalide pas la signature, une photo retenue si', async () => {
    writePhotos();
    inspections[INSPECTION_ID] = inspectionRow({ photos: manyPhotos(42) });
    const hash = async () => computeInspectionContentHash(await loadInspectionForPdf('t1', INSPECTION_ID));
    const base = await hash();

    const omitted = manyPhotos(42);
    omitted[41].caption = 'légende modifiée d’une photo non imprimée';
    inspections[INSPECTION_ID] = inspectionRow({ photos: omitted });
    expect(await hash()).toBe(base);

    const retained = manyPhotos(42);
    retained[0].caption = 'légende modifiée d’une photo imprimée';
    inspections[INSPECTION_ID] = inspectionRow({ photos: retained });
    expect(await hash()).not.toBe(base);
  });

  it('le hash du rendu (buildInspectionPdf) est celui que recalcule snapshotHash', async () => {
    writePhotos();
    const { contentHash } = await buildInspectionPdf('t1', INSPECTION_ID);
    expect(contentHash).toBe(
      await leaseInspectionSource.snapshotHash!({ tenantId: 't1', userId: 'u1' }, INSPECTION_ID)
    );
    const loaded = await leaseInspectionSource.loadSource({ tenantId: 't1', userId: 'u1' }, INSPECTION_ID);
    expect(loaded.documentHash).toBe(contentHash);
  });
});

describe('source LEASE_INSPECTION', () => {
  const ctx = { tenantId: 't1', userId: 'u1' };

  it('S-6 : un identifiant qui n’est pas un UUID est une cible inconnue, sans lecture', async () => {
    await expect(leaseInspectionSource.assertTarget(ctx, 'pas-un-uuid')).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaseInspectionSource.defaultSigners!(ctx, 'pas-un-uuid')).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await leaseInspectionSource.isSourceIntact({
        id: 'r',
        tenantId: 't1',
        kind: 'LEASE_INSPECTION',
        targetType: 'LeaseInspection',
        targetId: 'pas-un-uuid',
        sourceDocumentId: null,
        sourceDocHash: null
      })
    ).toBe(false);
    expect(prismaMock.leaseInspection.findFirst).not.toHaveBeenCalled();
  });

  it('R-7 : un état des lieux déjà signé (demande COMPLETED) ne repart pas en signature (409)', async () => {
    completedRequest = { id: 'done' };
    await expect(leaseInspectionSource.assertTarget(ctx, INSPECTION_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.signatureRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', status: 'COMPLETED' }) })
    );
  });

  it('déclare les droits et la fonctionnalité du bail', () => {
    expect(leaseInspectionSource).toMatchObject({
      kind: 'LEASE_INSPECTION',
      targetType: 'LeaseInspection',
      viewPermission: 'RENTAL_LEASES_VIEW',
      editPermission: 'RENTAL_LEASES_EDIT',
      feature: 'RENTAL'
    });
    expect(leaseInspectionSource.providerRequired).toBeFalsy();
  });

  it('accepte un état finalisé de l’agence', async () => {
    await expect(leaseInspectionSource.assertTarget(ctx, INSPECTION_ID)).resolves.toBeUndefined();
  });

  it('refuse un brouillon avec un message clair', async () => {
    await expect(leaseInspectionSource.assertTarget(ctx, DRAFT_ID)).rejects.toThrow(/Finalisez/);
    await expect(leaseInspectionSource.loadSource(ctx, DRAFT_ID)).rejects.toThrow(/Finalisez/);
  });

  it('répond comme un objet inexistant pour une autre agence (aucune fuite d’existence)', async () => {
    const other = { tenantId: 't2', userId: 'u2' };
    await expect(leaseInspectionSource.assertTarget(other, INSPECTION_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaseInspectionSource.loadSource(other, INSPECTION_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaseInspectionSource.defaultSigners!(other, INSPECTION_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaseInspectionSource.snapshotHash!(other, INSPECTION_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      leaseInspectionSource.isSourceIntact({
        id: 'r',
        tenantId: 't2',
        kind: 'LEASE_INSPECTION',
        targetType: 'LeaseInspection',
        targetId: INSPECTION_ID,
        sourceDocumentId: null,
        sourceDocHash: null
      })
    ).resolves.toBe(false);
  });

  it('rend un PDF à signer et son titre', async () => {
    const loaded = await leaseInspectionSource.loadSource(ctx, INSPECTION_ID);
    expect(loaded.pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(loaded.title).toContain('BAIL-001');
    expect(loaded.documentId).toBeNull();
  });

  it('détecte un changement (SG-R2) : contenu, photo ou retour en brouillon', async () => {
    writePhotos();
    const hash = await leaseInspectionSource.snapshotHash!(ctx, INSPECTION_ID);
    const request = {
      id: 'r',
      tenantId: 't1',
      kind: 'LEASE_INSPECTION' as const,
      targetType: 'LeaseInspection',
      targetId: INSPECTION_ID,
      sourceDocumentId: null,
      sourceDocHash: hash
    };
    expect(await leaseInspectionSource.isSourceIntact(request)).toBe(true);

    fs.writeFileSync(path.join(uploadsDir, 'lease-inspections', 't1', INSPECTION_ID, 'sol.png'), Buffer.from('x'));
    expect(await leaseInspectionSource.isSourceIntact(request)).toBe(false);

    writePhotos();
    expect(await leaseInspectionSource.isSourceIntact(request)).toBe(true);
    inspections[INSPECTION_ID] = inspectionRow({ status: 'DRAFT' });
    expect(await leaseInspectionSource.isSourceIntact(request)).toBe(false);
  });

  it('propose locataire, co-locataire, bailleur et agent, avec le contact CRM lié', async () => {
    const signers = await leaseInspectionSource.defaultSigners!(ctx, INSPECTION_ID);
    expect(signers.map(signer => signer.role)).toEqual(['LOCATAIRE', 'CO_LOCATAIRE', 'BAILLEUR', 'AGENT']);
    expect(signers[0]).toMatchObject({ fullName: 'Awa Traoré', contactId: 'c1', phone: '0102030405' });
    expect(signers[3]).toMatchObject({ fullName: 'Agent Test', email: 'agent@example.com' });
    // Le contact n'est cherché que dans l'agence de l'appelant.
    expect(prismaMock.crmContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1' }) })
    );
  });

  it('ne pose rien à la signature (aucune colonne)', async () => {
    await expect(leaseInspectionSource.onSealed({} as never, {} as never, new Date())).resolves.toBeUndefined();
  });
});

describe('suppression d’un état des lieux', () => {
  it('annule les demandes ouvertes d’un brouillon avant de le supprimer', async () => {
    await deleteInspection('t1', 'l1', DRAFT_ID, 'u9');
    expect(cancelOpenRequestsForTarget).toHaveBeenCalledWith(
      { tenantId: 't1', userId: 'u9' },
      'LeaseInspection',
      DRAFT_ID
    );
    expect(prismaMock.leaseInspection.delete).toHaveBeenCalled();
  });

  it('refuse de supprimer un état finalisé : la finalisation est irréversible', async () => {
    await expect(deleteInspection('t1', 'l1', INSPECTION_ID)).rejects.toThrow(/finalisé/);
    expect(prismaMock.leaseInspection.delete).not.toHaveBeenCalled();
  });
});
