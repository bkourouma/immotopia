import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

let tmpRoot = '';

jest.mock('../../src/utils/project-root', () => ({
  getProjectRoot: () => tmpRoot,
  getUploadsRoot: () => require('path').join(tmpRoot, 'uploads')
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ getUserPermissions: jest.fn() }));

const db = {
  syndicPaymentDeclaration: { findFirst: jest.fn() },
  syndicPaymentProofRead: { findMany: jest.fn(), updateMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: db }));

import {
  getDeclarationProofForTenant,
  prepareProofFile,
  promoteTempProofToDeclaration,
  PROOF_MAX_BYTES,
  discardTempProof,
  purgeExpiredProofReads,
  purgeOrphanTempProofs,
  saveDeclarationProof,
  saveTempProofRead
} from '../../src/lib/syndics/declared-payment/proof-files';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const DECL = '22222222-2222-4222-8222-222222222222';
const READ = '33333333-3333-4333-8333-333333333333';
const SECRET = 'GPS-LATITUDE-SECRET';

/** JPEG minimal avec un segment APP1 (EXIF) portant un marqueur GPS. */
function jpegWithExif(): Buffer {
  const exif = Buffer.concat([Buffer.from('Exif\u0000\u0000', 'latin1'), Buffer.from(SECRET)]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x00, 0x00]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app1,
    sos,
    Buffer.from([0x11, 0x22, 0x33]),
    Buffer.from([0xff, 0xd9])
  ]);
}

const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const winExe = () => Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
const tempFile = (tenant: string, name: string) =>
  path.join(tmpRoot, 'uploads', 'syndics', 'payment-proofs', 'tmp', tenant, name);

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'proofs-'));
  jest.clearAllMocks();
});
afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('prepareProofFile', () => {
  it('refuse un exécutable déguisé en .jpg (le contenu décide)', () => {
    expect(() => prepareProofFile({ buffer: winExe(), originalname: 'preuve.jpg', mimetype: 'image/jpeg' })).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'DECLARATION_PROOF_INVALID' })
    );
  });

  it('refuse un fichier vide', () => {
    expect(() => prepareProofFile({ buffer: Buffer.alloc(0) })).toThrow(
      expect.objectContaining({ code: 'DECLARATION_PROOF_INVALID' })
    );
  });

  it('refuse plus de 5 Mo', () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(PROOF_MAX_BYTES)]);
    expect(() => prepareProofFile({ buffer: big })).toThrow(
      expect.objectContaining({ statusCode: 413, code: 'DECLARATION_PROOF_TOO_LARGE' })
    );
  });

  it("retire l'EXIF d'un JPEG et calcule le sha256 du contenu final", () => {
    const input = jpegWithExif();
    expect(input.includes(Buffer.from(SECRET))).toBe(true);
    const prepared = prepareProofFile({ buffer: input, mimetype: 'application/pdf' });
    expect(prepared.kind).toBe('jpeg');
    expect(prepared.mimeType).toBe('image/jpeg');
    expect(prepared.buffer.includes(Buffer.from(SECRET))).toBe(false);
    expect(prepared.buffer.length).toBeLessThan(input.length);
    expect(prepared.sizeBytes).toBe(prepared.buffer.length);
    expect(prepared.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepte un PDF tel quel', () => {
    const input = pdf();
    const prepared = prepareProofFile({ buffer: input, originalname: 'x.exe' });
    expect(prepared.kind).toBe('pdf');
    expect(prepared.buffer.equals(input)).toBe(true);
  });

  it('refuse un JPEG cassé', () => {
    expect(() => prepareProofFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]) })).toThrow(
      expect.objectContaining({ code: 'DECLARATION_PROOF_INVALID' })
    );
  });
});

describe('saveDeclarationProof / saveTempProofRead', () => {
  it("écrit sous le dossier de l'agence avec un nom généré", async () => {
    const stored = await saveDeclarationProof({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      declarationId: DECL,
      file: { buffer: jpegWithExif(), originalname: '../../etc/passwd.png' }
    });
    expect(stored.fileUrl).toBe(`/uploads/syndics/payment-proofs/${TENANT}/${SYNDIC}/${DECL}.jpg`);
    const onDisk = await fs.readFile(
      path.join(tmpRoot, 'uploads', 'syndics', 'payment-proofs', TENANT, SYNDIC, `${DECL}.jpg`)
    );
    expect(onDisk.includes(Buffer.from(SECRET))).toBe(false);
    expect(stored.sizeBytes).toBe(onDisk.length);
  });

  it('refuse un identifiant qui sort du dossier', async () => {
    await expect(
      saveDeclarationProof({ tenantId: TENANT, syndicateId: SYNDIC, declarationId: '../evil', file: { buffer: pdf() } })
    ).rejects.toMatchObject({ code: 'DECLARATION_PROOF_INVALID' });
  });

  it('écrit la capture temporaire sous tmp/<tenantId>', async () => {
    const stored = await saveTempProofRead({ tenantId: TENANT, readId: READ, file: { buffer: pdf() } });
    expect(stored.fileUrl).toBe(`/uploads/syndics/payment-proofs/tmp/${TENANT}/${READ}.pdf`);
  });
});

describe('promoteTempProofToDeclaration', () => {
  it('déplace la capture temporaire vers le dossier définitif', async () => {
    const temp = await saveTempProofRead({ tenantId: TENANT, readId: READ, file: { buffer: pdf() } });
    const stored = await promoteTempProofToDeclaration({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      declarationId: DECL,
      tempFileUrl: temp.fileUrl
    });
    expect(stored.fileUrl).toBe(`/uploads/syndics/payment-proofs/${TENANT}/${SYNDIC}/${DECL}.pdf`);
    expect(stored.sha256).toBe(temp.sha256);
    await expect(fs.access(tempFile(TENANT, `${READ}.pdf`))).rejects.toBeTruthy();
  });

  it("refuse une capture temporaire d'une autre agence", async () => {
    const temp = await saveTempProofRead({ tenantId: OTHER_TENANT, readId: READ, file: { buffer: pdf() } });
    await expect(
      promoteTempProofToDeclaration({
        tenantId: TENANT,
        syndicateId: SYNDIC,
        declarationId: DECL,
        tempFileUrl: temp.fileUrl
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    // le fichier de l'autre agence reste en place
    await expect(fs.access(tempFile(OTHER_TENANT, `${READ}.pdf`))).resolves.toBeUndefined();
  });

  it('refuse un chemin avec ..', async () => {
    await expect(
      promoteTempProofToDeclaration({
        tenantId: TENANT,
        syndicateId: SYNDIC,
        declarationId: DECL,
        tempFileUrl: `/uploads/syndics/payment-proofs/tmp/${TENANT}/../${OTHER_TENANT}/x.pdf`
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('getDeclarationProofForTenant', () => {
  const params = { tenantId: TENANT, syndicateId: SYNDIC, declarationId: DECL };

  it('renvoie le fichier privé', async () => {
    const stored = await saveDeclarationProof({ ...params, file: { buffer: pdf() } });
    db.syndicPaymentDeclaration.findFirst.mockResolvedValue({ proofFileUrl: stored.fileUrl });
    const file = await getDeclarationProofForTenant(params);
    expect(file.mimeType).toBe('application/pdf');
    expect(file.buffer.equals(pdf())).toBe(true);
    expect(db.syndicPaymentDeclaration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DECL, tenantId: TENANT, syndicateId: SYNDIC } })
    );
  });

  it("404 si la déclaration est hors de l'agence", async () => {
    db.syndicPaymentDeclaration.findFirst.mockResolvedValue(null);
    await expect(getDeclarationProofForTenant(params)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404 sans preuve', async () => {
    db.syndicPaymentDeclaration.findFirst.mockResolvedValue({ proofFileUrl: null });
    await expect(getDeclarationProofForTenant(params)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404 si le fichier est absent', async () => {
    db.syndicPaymentDeclaration.findFirst.mockResolvedValue({
      proofFileUrl: `/uploads/syndics/payment-proofs/${TENANT}/${SYNDIC}/${DECL}.pdf`
    });
    await expect(getDeclarationProofForTenant(params)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404 si le chemin stocké pointe vers une autre agence', async () => {
    const other = await saveDeclarationProof({
      tenantId: OTHER_TENANT,
      syndicateId: SYNDIC,
      declarationId: DECL,
      file: { buffer: pdf() }
    });
    db.syndicPaymentDeclaration.findFirst.mockResolvedValue({ proofFileUrl: other.fileUrl });
    await expect(getDeclarationProofForTenant(params)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('discardTempProof', () => {
  it('rend true quand le fichier est supprimé ou déjà absent, false pour un chemin hors du dossier de l’agence', async () => {
    const saved = await saveTempProofRead({ tenantId: TENANT, readId: READ, file: { buffer: pdf() } });
    await expect(discardTempProof(TENANT, saved.fileUrl)).resolves.toBe(true);
    await expect(fs.access(tempFile(TENANT, `${READ}.pdf`))).rejects.toBeTruthy();
    await expect(discardTempProof(TENANT, saved.fileUrl)).resolves.toBe(true);
    await expect(discardTempProof(OTHER_TENANT, saved.fileUrl)).resolves.toBe(false);
  });
});

describe('purgeOrphanTempProofs', () => {
  it('supprime par date de modification, sans la base, les captures de plus de 24 h seulement', async () => {
    const old = await saveTempProofRead({ tenantId: TENANT, readId: READ, file: { buffer: pdf() } });
    const recent = await saveTempProofRead({
      tenantId: OTHER_TENANT,
      readId: '44444444-4444-4444-8444-444444444444',
      file: { buffer: pdf() }
    });
    expect(old.fileUrl).toBeTruthy();
    const longAgo = new Date(Date.now() - 25 * 3600 * 1000);
    await fs.utimes(tempFile(TENANT, `${READ}.pdf`), longAgo, longAgo);

    await expect(purgeOrphanTempProofs()).resolves.toBe(1);

    await expect(fs.access(tempFile(TENANT, `${READ}.pdf`))).rejects.toBeTruthy();
    await expect(
      fs.access(tempFile(OTHER_TENANT, '44444444-4444-4444-8444-444444444444.pdf'))
    ).resolves.toBeUndefined();
    expect(recent.fileUrl).toBeTruthy();
    expect(db.syndicPaymentProofRead.findMany).not.toHaveBeenCalled();
  });

  it('dossier temporaire absent : rien à faire, pas d’erreur', async () => {
    await expect(purgeOrphanTempProofs()).resolves.toBe(0);
  });
});

describe('purgeExpiredProofReads', () => {
  it('supprime les fichiers expirés, annule tempFileUrl et compte', async () => {
    const a = await saveTempProofRead({ tenantId: TENANT, readId: READ, file: { buffer: pdf() } });
    db.syndicPaymentProofRead.findMany.mockResolvedValue([
      { id: READ, tenantId: TENANT, tempFileUrl: a.fileUrl },
      // fichier déjà absent : pas une erreur
      { id: 'r2', tenantId: TENANT, tempFileUrl: `/uploads/syndics/payment-proofs/tmp/${TENANT}/r2.pdf` }
    ]);
    db.syndicPaymentProofRead.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date('2026-10-18T00:00:00Z');

    await expect(purgeExpiredProofReads(now)).resolves.toBe(2);

    expect(db.syndicPaymentProofRead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expiresAt: { lt: now }, tempFileUrl: { not: null } }
      })
    );
    expect(db.syndicPaymentProofRead.updateMany).toHaveBeenCalledWith({
      where: { id: READ, tenantId: TENANT },
      data: { tempFileUrl: null }
    });
    await expect(fs.access(tempFile(TENANT, `${READ}.pdf`))).rejects.toBeTruthy();
  });

  it('continue quand une lecture échoue', async () => {
    db.syndicPaymentProofRead.findMany.mockResolvedValue([
      { id: 'r1', tenantId: TENANT, tempFileUrl: `/uploads/syndics/payment-proofs/tmp/${TENANT}/r1.pdf` },
      { id: 'r2', tenantId: TENANT, tempFileUrl: `/uploads/syndics/payment-proofs/tmp/${TENANT}/r2.pdf` }
    ]);
    db.syndicPaymentProofRead.updateMany.mockRejectedValueOnce(new Error('base HS')).mockResolvedValue({ count: 1 });
    await expect(purgeExpiredProofReads()).resolves.toBe(1);
  });
});
