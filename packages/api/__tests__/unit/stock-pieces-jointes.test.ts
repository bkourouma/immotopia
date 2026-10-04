/**
 * Pièces jointes du stock — lot 040, territoire API-4 (spec B5, critères 1 à 6 ;
 * le critère 7, export d'agence, est dans `tenant-data-export.archive.test.ts`).
 *
 * Deux volets :
 *
 * 1. Les aides PURES du contrat du lot 041 (plan §11) : type par les octets,
 *    filtre des métadonnées, empreinte. Les images sont de vrais petits
 *    fichiers construits ici (JPEG avec un segment EXIF portant des
 *    coordonnées GPS, PNG avec `eXIf`, WebP avec `EXIF`) ; on vérifie que
 *    les métadonnées partent ET que la structure reste valide (pdf-lib relit
 *    le JPEG et décode le PNG).
 * 2. Le service, sans base : client Prisma doublé, fichiers écrits dans un
 *    dossier temporaire.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deflateSync } from 'zlib';
import { PDFDocument } from 'pdf-lib';

let tmpRoot = '';

jest.mock('../../src/utils/project-root', () => ({
  getProjectRoot: () => tmpRoot,
  getUploadsRoot: () => require('path').join(tmpRoot, 'uploads')
}));

jest.mock('../../src/services/permission-service', () => ({ getUserPermissions: jest.fn() }));

const logAuditEvent = jest.fn();
const recordAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => logAuditEvent(...args),
  recordAuditEvent: (...args: any[]) => recordAuditEvent(...args)
}));

const db = {
  stockMovement: { findFirst: jest.fn() },
  stockSlip: { findFirst: jest.fn() },
  stockCountLine: { findFirst: jest.fn() },
  stockAttachment: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  stockClientRequest: { findFirst: jest.fn(), create: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: db }));

import {
  canRemoveAttachment,
  detectStockFileKind,
  displayFileName,
  listStockAttachments,
  readStockAttachmentFile,
  removeStockAttachment,
  sha256Hex,
  STOCK_ATTACHMENT_MAX_BYTES,
  stockAttachmentRelativePath,
  stripImageMetadata,
  toAttachmentView,
  uploadStockAttachment
} from '../../src/lib/finance/stock-pieces-jointes';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';

const TENANT = 'tenant-1';
const MOVEMENT_ID = '11111111-1111-4111-8111-111111111111';
const SLIP_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';

function ctx(overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId: 'user-1',
    valuesVisible: false,
    canValidateCount: false,
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canDispose: false,
    canManageTakers: true,
    canViewAlerts: false,
    canManageSettings: false,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Fabriques d'images réelles
// ---------------------------------------------------------------------------

const GPS_MARKER = 'GPSLatitude=5.3600N;GPSLongitude=4.0083W';

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const length = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 0xff]), payload]);
}

/** Un IFD TIFF avec le pointeur GPS (0x8825) vers un IFD GPS (latitude, longitude). */
function exifPayload(): Buffer {
  const tiff = Buffer.alloc(80);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0
  tiff.writeUInt16LE(1, 8); // une entrée
  tiff.writeUInt16LE(0x8825, 10); // GPSInfo
  tiff.writeUInt16LE(4, 12); // LONG
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18); // IFD GPS
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x0001, 28); // GPSLatitudeRef
  tiff.writeUInt16LE(2, 30); // ASCII
  tiff.writeUInt32LE(2, 32);
  tiff.write('N\0', 36, 'latin1');
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.from(GPS_MARKER, 'latin1')]);
}

function buildJpeg() {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = jpegSegment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  const app1Exif = jpegSegment(0xe1, exifPayload());
  const app1Xmp = jpegSegment(
    0xe1,
    Buffer.from(`http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPS>${GPS_MARKER}</exif:GPS></x:xmpmeta>`, 'latin1')
  );
  const dqt = jpegSegment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)]));
  const sof0 = jpegSegment(0xc0, Buffer.from([8, 0, 16, 0, 16, 1, 1, 0x11, 0]));
  const dht = jpegSegment(0xc4, Buffer.concat([Buffer.from([0x00, 1]), Buffer.alloc(15, 0), Buffer.from([0])]));
  const sos = jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
  const scan = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);
  const eoi = Buffer.from([0xff, 0xd9]);
  const trailer = Buffer.from(`trailer ${GPS_MARKER}`, 'latin1');
  return {
    withMetadata: Buffer.concat([soi, app0, app1Exif, dqt, app1Xmp, sof0, dht, sos, scan, eoi, trailer]),
    expectedClean: Buffer.concat([soi, app0, dqt, sof0, dht, sos, scan, eoi])
  };
}

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function buildPng() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = pngChunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
  const exif = pngChunk('eXIf', Buffer.concat([Buffer.from('MM\0*', 'latin1'), Buffer.from(GPS_MARKER, 'latin1')]));
  const comment = pngChunk('tEXt', Buffer.from('Comment\0photo du chantier', 'latin1'));
  const xmp = pngChunk(
    'iTXt',
    Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>${GPS_MARKER}</x:xmpmeta>`, 'latin1')
  );
  const idat = pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0])));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return {
    withMetadata: Buffer.concat([signature, ihdr, exif, comment, xmp, idat, iend]),
    expectedClean: Buffer.concat([signature, ihdr, comment, idat, iend])
  };
}

function riffChunk(fourcc: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(fourcc, 0, 'latin1');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function riffFile(chunks: Buffer[]): Buffer {
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

function buildWebp() {
  const vp8xData = (flags: number) => Buffer.from([flags, 0, 0, 0, 15, 0, 0, 15, 0, 0]);
  const vp8l = riffChunk('VP8L', Buffer.from([0x2f, 0x0f, 0xc0, 0x03, 0x00])); // taille impaire : bourrage
  const exif = riffChunk('EXIF', Buffer.concat([Buffer.from('II*\0', 'latin1'), Buffer.from(GPS_MARKER, 'latin1')]));
  const xmp = riffChunk('XMP ', Buffer.from(`<x:xmpmeta>${GPS_MARKER}</x:xmpmeta>`, 'latin1'));
  return {
    withMetadata: riffFile([riffChunk('VP8X', vp8xData(0x0c)), vp8l, exif, xmp]),
    expectedClean: riffFile([riffChunk('VP8X', vp8xData(0x00)), vp8l])
  };
}

/** Parcours de la structure RIFF : chaque bloc tient dans le fichier, la taille annoncée est exacte. */
function walkWebp(buffer: Buffer): string[] {
  expect(buffer.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(buffer.readUInt32LE(4) + 8).toBe(buffer.length);
  const names: string[] = [];
  let i = 12;
  while (i < buffer.length) {
    const size = buffer.readUInt32LE(i + 4);
    names.push(buffer.subarray(i, i + 4).toString('latin1'));
    i += 8 + size + (size & 1);
  }
  expect(i).toBe(buffer.length);
  return names;
}

// ---------------------------------------------------------------------------
// 1. Aides pures
// ---------------------------------------------------------------------------

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("Aucune erreur levée alors qu'une erreur était attendue.");
}

describe('detectStockFileKind — type lu dans les octets (B5-R2)', () => {
  it('reconnaît JPEG, PNG, WebP et PDF', () => {
    expect(detectStockFileKind(buildJpeg().withMetadata)).toBe('jpeg');
    expect(detectStockFileKind(buildPng().withMetadata)).toBe('png');
    expect(detectStockFileKind(buildWebp().withMetadata)).toBe('webp');
    expect(detectStockFileKind(Buffer.from('%PDF-1.7\n%...'))).toBe('pdf');
  });

  it('refuse un HTML, même nommé .jpg, un RIFF qui n’est pas du WebP et un fichier vide', () => {
    expect(detectStockFileKind(Buffer.from('<!doctype html><html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectStockFileKind(riffFile([]).fill('WAVE', 8, 12, 'latin1'))).toBeNull();
    expect(detectStockFileKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('stripImageMetadata — EXIF et position retirés, image lisible (B5-R3)', () => {
  it('JPEG : segments APP1 (EXIF avec GPS, XMP) retirés, le reste recopié à l’octet près', async () => {
    const { withMetadata, expectedClean } = buildJpeg();
    expect(withMetadata.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(true);

    const cleaned = stripImageMetadata(withMetadata, 'jpeg');
    expect(cleaned.equals(expectedClean)).toBe(true);
    expect(cleaned.includes(Buffer.from('Exif', 'latin1'))).toBe(false);
    expect(cleaned.includes(Buffer.from('GPS', 'latin1'))).toBe(false);

    // Lisible : pdf-lib relit les segments jusqu'au SOF et y trouve les dimensions.
    const pdf = await PDFDocument.create();
    // Copie : pdf-lib lit le tampon sous-jacent depuis l'octet 0.
    const image = await pdf.embedJpg(new Uint8Array(cleaned));
    expect([image.width, image.height]).toEqual([16, 16]);
  });

  it('JPEG : un fichier tronqué ou mal formé est refusé, jamais stocké tel quel', () => {
    const { withMetadata } = buildJpeg();
    expect(thrown(() => stripImageMetadata(withMetadata.subarray(0, 30), 'jpeg'))).toMatchObject({
      statusCode: 400,
      code: 'STOCK_ATTACHMENT_TYPE'
    });
    expect(() => stripImageMetadata(Buffer.from([0xff, 0xd8, 0x00, 0x01]), 'jpeg')).toThrow();
  });

  it('JPEG : un fichier sans métadonnée ressort identique', () => {
    const { expectedClean } = buildJpeg();
    expect(stripImageMetadata(expectedClean, 'jpeg').equals(expectedClean)).toBe(true);
  });

  it('PNG : bloc eXIf et XMP retirés, autres blocs gardés, image décodable', async () => {
    const { withMetadata, expectedClean } = buildPng();
    const cleaned = stripImageMetadata(withMetadata, 'png');
    expect(cleaned.equals(expectedClean)).toBe(true);
    expect(cleaned.includes(Buffer.from('eXIf', 'latin1'))).toBe(false);
    expect(cleaned.includes(Buffer.from('GPS', 'latin1'))).toBe(false);
    expect(cleaned.includes(Buffer.from('photo du chantier', 'latin1'))).toBe(true);

    // Décodé entièrement (zlib, filtres) par pdf-lib.
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(new Uint8Array(cleaned));
    expect([image.width, image.height]).toEqual([1, 1]);
  });

  it('PNG : un bloc qui déborde du fichier est refusé', () => {
    const { withMetadata } = buildPng();
    expect(thrown(() => stripImageMetadata(withMetadata.subarray(0, withMetadata.length - 6), 'png'))).toMatchObject({
      code: 'STOCK_ATTACHMENT_TYPE'
    });
  });

  it('WebP : blocs EXIF et XMP retirés, drapeaux VP8X remis à zéro, taille RIFF juste', () => {
    const { withMetadata, expectedClean } = buildWebp();
    expect(withMetadata[20] & 0x0c).toBe(0x0c);

    const cleaned = stripImageMetadata(withMetadata, 'webp');
    expect(cleaned.equals(expectedClean)).toBe(true);
    expect(walkWebp(cleaned)).toEqual(['VP8X', 'VP8L']);
    expect(cleaned[20] & 0x0c).toBe(0);
    expect(cleaned.includes(Buffer.from('GPS', 'latin1'))).toBe(false);
  });

  it('PDF : inchangé', () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /GPS (x) >> endobj\n%%EOF');
    expect(stripImageMetadata(pdf, 'pdf')).toBe(pdf);
  });

  it('sha256Hex : 64 caractères hexadécimaux minuscules', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('Aides de présentation', () => {
  it('nettoie le nom affiché et lui donne l’extension du type réel', () => {
    expect(displayFileName('../../etc/passwd.jpg', 'png')).toBe('passwd.png');
    expect(displayFileName('C:\\Users\\x\\Photo chantier<1>.JPG', 'jpeg')).toBe('Photo chantier1.jpg');
    expect(displayFileName('', 'pdf')).toBe('piece-jointe.pdf');
  });

  it('ne relit que le dossier stock de l’agence', () => {
    expect(stockAttachmentRelativePath(TENANT, `/uploads/stock/${TENANT}/2026/a.jpg`)).toBe(
      `stock/${TENANT}/2026/a.jpg`
    );
    expect(stockAttachmentRelativePath(TENANT, '/uploads/stock/autre/2026/a.jpg')).toBeNull();
    expect(stockAttachmentRelativePath(TENANT, `/uploads/stock/${TENANT}/2026/../x.jpg`)).toBeNull();
    expect(stockAttachmentRelativePath(TENANT, `/uploads/maintenance/${TENANT}/a.jpg`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Le service
// ---------------------------------------------------------------------------

const CREATED_AT = new Date('2026-10-04T10:00:00Z');

function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    targetType: 'MOVEMENT',
    movementId: MOVEMENT_ID,
    slipId: null,
    countLineId: null,
    purpose: 'GOODS_PHOTO',
    caption: null,
    fileName: 'photo.jpg',
    fileUrl: `/uploads/stock/${TENANT}/2026/f.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    uploadedByUserId: 'user-1',
    createdAt: CREATED_AT,
    removedAt: null,
    removalReason: null,
    uploadedBy: { fullName: 'Awa Koné', email: 'awa@example.test' },
    removedBy: null,
    ...overrides
  };
}

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'stock-pj-'));
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.stockClientRequest.findFirst.mockResolvedValue(null);
  db.stockClientRequest.create.mockResolvedValue({ id: 'key-1' });
  db.$executeRaw.mockResolvedValue(1);
  db.stockAttachment.create.mockImplementation(async ({ data }: any) => {
    created.push(data);
    return { id: ATTACHMENT_ID };
  });
  db.stockAttachment.findFirst.mockImplementation(async () =>
    attachmentRow(created.length > 0 ? { ...created[created.length - 1], uploadedBy: { fullName: 'Awa Koné' } } : {})
  );
  created.length = 0;
});

const created: any[] = [];

function upload(buffer: Buffer, overrides: Record<string, unknown> = {}, caller = ctx()) {
  return uploadStockAttachment(
    TENANT,
    caller,
    {
      targetType: 'MOVEMENT',
      targetId: MOVEMENT_ID,
      file: { buffer, originalName: 'photo.jpg' },
      ...overrides
    } as any,
    CREATED_AT
  );
}

describe('uploadStockAttachment', () => {
  it('B5-1 : un JPEG avec GPS est stocké sans EXIF ; l’empreinte est celle du fichier stocké', async () => {
    db.stockMovement.findFirst.mockResolvedValue({ id: MOVEMENT_ID, type: 'ISSUE', isDecrease: true });
    const { withMetadata, expectedClean } = buildJpeg();

    const { attachment, replayed } = await upload(withMetadata);

    expect(replayed).toBe(false);
    expect(db.stockMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOVEMENT_ID, tenantId: TENANT } })
    );
    const data = created[0];
    expect(data.fileUrl).toMatch(new RegExp(`^/uploads/stock/${TENANT}/2026/[0-9a-f-]{36}\\.jpg$`));
    const stored = await fs.readFile(path.join(tmpRoot, data.fileUrl));
    expect(stored.equals(expectedClean)).toBe(true);
    expect(data.sha256).toBe(sha256Hex(stored));
    expect(data.sha256).not.toBe(sha256Hex(withMetadata));
    expect(data).toMatchObject({
      tenantId: TENANT,
      targetType: 'MOVEMENT',
      movementId: MOVEMENT_ID,
      mimeType: 'image/jpeg',
      sizeBytes: stored.length,
      uploadedByUserId: 'user-1',
      purpose: 'GOODS_PHOTO'
    });
    expect(attachment.sha256).toBe(data.sha256);
    expect(attachment.canRemove).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'STOCK_ATTACHMENT_ADDED', entityType: 'StockAttachment', tenantId: TENANT })
    );
  });

  it('B5-2 : un « .jpg » qui contient du HTML → 400 STOCK_ATTACHMENT_TYPE, rien écrit', async () => {
    db.stockMovement.findFirst.mockResolvedValue({ id: MOVEMENT_ID, type: 'ISSUE', isDecrease: true });
    await expect(upload(Buffer.from('<html><body>photo</body></html>'))).rejects.toMatchObject({
      statusCode: 400,
      code: 'STOCK_ATTACHMENT_TYPE'
    });
    expect(db.stockAttachment.create).not.toHaveBeenCalled();
  });

  it('refuse un fichier de plus de 10 Mo (413 STOCK_ATTACHMENT_TOO_LARGE)', async () => {
    const big = Buffer.alloc(STOCK_ATTACHMENT_MAX_BYTES + 1);
    big.write('%PDF-', 0, 'latin1');
    await expect(upload(big)).rejects.toMatchObject({ statusCode: 413, code: 'STOCK_ATTACHMENT_TOO_LARGE' });
  });

  it('B5-3 : la cible d’une autre agence → 404, comme une cible inexistante', async () => {
    db.stockMovement.findFirst.mockResolvedValue(null);
    await expect(upload(buildJpeg().expectedClean)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.stockAttachment.create).not.toHaveBeenCalled();
  });

  it('B5-5 : un mouvement RECEIPT ou ADJUSTMENT → 409 STOCK_ATTACHMENT_TARGET_NOT_ALLOWED', async () => {
    for (const type of ['RECEIPT', 'ADJUSTMENT']) {
      db.stockMovement.findFirst.mockResolvedValueOnce({ id: MOVEMENT_ID, type, isDecrease: false });
      await expect(upload(buildJpeg().expectedClean)).rejects.toMatchObject({
        statusCode: 409,
        code: 'STOCK_ATTACHMENT_TARGET_NOT_ALLOWED'
      });
    }
    db.stockMovement.findFirst.mockResolvedValueOnce({ id: MOVEMENT_ID, type: 'TRANSFER', isDecrease: false });
    await expect(upload(buildJpeg().expectedClean)).rejects.toMatchObject({
      code: 'STOCK_ATTACHMENT_TARGET_NOT_ALLOWED'
    });
  });

  it('B5-R6 : le droit est celui de la cible', async () => {
    db.stockMovement.findFirst.mockResolvedValue({ id: MOVEMENT_ID, type: 'SCRAP', isDecrease: true });
    await expect(upload(buildJpeg().expectedClean)).rejects.toMatchObject({ statusCode: 403 });
    await expect(upload(buildJpeg().expectedClean, {}, ctx({ canDispose: true }))).resolves.toBeDefined();

    db.stockSlip.findFirst.mockResolvedValue({ id: SLIP_ID, kind: 'COUNT_REPORT' });
    await expect(
      upload(buildJpeg().expectedClean, { targetType: 'SLIP', targetId: SLIP_ID, purpose: 'SIGNED_SLIP' })
    ).rejects.toMatchObject({ statusCode: 403 });
    db.stockSlip.findFirst.mockResolvedValue({ id: SLIP_ID, kind: 'ISSUE' });
    await expect(
      upload(buildJpeg().expectedClean, { targetType: 'SLIP', targetId: SLIP_ID }, ctx({ canIssue: false }))
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.stockSlip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SLIP_ID, tenantId: TENANT } })
    );
  });

  it('B5-R6 : une ligne d’inventaire n’accepte de pièce qu’en COUNTED, agence lue sur l’inventaire', async () => {
    db.stockCountLine.findFirst.mockResolvedValueOnce({ id: LINE_ID, count: { status: 'DRAFT' } });
    await expect(
      upload(buildJpeg().expectedClean, { targetType: 'COUNT_LINE', targetId: LINE_ID })
    ).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_COUNT_WRONG_STATUS' });
    expect(db.stockCountLine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINE_ID, count: { tenantId: TENANT } } })
    );

    db.stockCountLine.findFirst.mockResolvedValueOnce({ id: LINE_ID, count: { status: 'COUNTED' } });
    const { attachment } = await upload(buildJpeg().expectedClean, { targetType: 'COUNT_LINE', targetId: LINE_ID });
    expect(created[0]).toMatchObject({ targetType: 'COUNT_LINE', countLineId: LINE_ID });
    expect(attachment.id).toBe(ATTACHMENT_ID);
  });

  it('B5-6 : deux dépôts du même fichier avec le même clientRequestId → une seule pièce', async () => {
    db.stockMovement.findFirst.mockResolvedValue({ id: MOVEMENT_ID, type: 'ISSUE', isDecrease: true });
    const file = buildJpeg().withMetadata;

    const first = await upload(file, { clientRequestId: REQUEST_ID });
    expect(first.replayed).toBe(false);
    const claimed = db.stockClientRequest.create.mock.calls[0][0].data;
    expect(claimed).toMatchObject({ tenantId: TENANT, clientRequestId: REQUEST_ID, operation: 'ATTACHMENT' });
    // La clé est la PREMIÈRE écriture, le résultat est inscrit ensuite.
    expect(db.stockClientRequest.create.mock.invocationCallOrder[0]).toBeLessThan(
      db.stockAttachment.create.mock.invocationCallOrder[0]
    );
    expect(db.$executeRaw).toHaveBeenCalled();

    db.stockClientRequest.findFirst.mockResolvedValue({
      bodyHash: claimed.bodyHash,
      createdByUserId: 'user-1',
      resultType: 'StockAttachment',
      resultId: ATTACHMENT_ID
    });
    const second = await upload(file, { clientRequestId: REQUEST_ID });
    expect(second.replayed).toBe(true);
    expect(second.attachment.id).toBe(ATTACHMENT_ID);
    expect(db.stockAttachment.create).toHaveBeenCalledTimes(1);

    // Même clé, autre photo : 409.
    await expect(upload(buildPng().withMetadata, { clientRequestId: REQUEST_ID })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_IDEMPOTENCY_MISMATCH'
    });
  });

  it('efface le fichier écrit si la transaction échoue', async () => {
    db.stockMovement.findFirst.mockResolvedValue({ id: MOVEMENT_ID, type: 'ISSUE', isDecrease: true });
    db.stockAttachment.create.mockRejectedValueOnce(new Error('panne'));
    const folder = path.join(tmpRoot, 'uploads', 'stock', TENANT, '2026');
    const before = await fs.readdir(folder).catch(() => [] as string[]);
    await expect(upload(buildJpeg().expectedClean)).rejects.toThrow('panne');
    expect(await fs.readdir(folder)).toEqual(before);
  });
});

describe('Retrait (B5-R5)', () => {
  it('B5-4 : un tiers sans STOCK_DISPOSE après 15 minutes → 403', async () => {
    db.stockAttachment.findFirst.mockResolvedValue(attachmentRow({ uploadedByUserId: 'user-2' }));
    const later = new Date(CREATED_AT.getTime() + 16 * 60 * 1000);
    await expect(removeStockAttachment(TENANT, ctx(), ATTACHMENT_ID, 'Photo floue', later)).rejects.toMatchObject({
      statusCode: 403,
      code: 'STOCK_ATTACHMENT_REMOVAL_FORBIDDEN'
    });
    // Le dépositaire lui-même, passé le délai, non plus.
    db.stockAttachment.findFirst.mockResolvedValue(attachmentRow());
    await expect(removeStockAttachment(TENANT, ctx(), ATTACHMENT_ID, 'Photo floue', later)).rejects.toMatchObject({
      statusCode: 403
    });
    expect(db.stockAttachment.updateMany).not.toHaveBeenCalled();
  });

  it('STOCK_DISPOSE retire après 15 minutes : ligne gardée, audit critique, fichier effacé', async () => {
    const folder = path.join(tmpRoot, 'uploads', 'stock', TENANT, '2026');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'f.jpg'), 'x');
    db.stockAttachment.findFirst.mockResolvedValue(attachmentRow({ uploadedByUserId: 'user-2' }));
    db.stockAttachment.updateMany.mockResolvedValue({ count: 1 });
    const later = new Date(CREATED_AT.getTime() + 60 * 60 * 1000);

    await removeStockAttachment(
      TENANT,
      ctx({ canDispose: true }),
      ATTACHMENT_ID,
      'La photo montre une personne',
      later
    );

    expect(db.stockAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID, tenantId: TENANT, removedAt: null },
      data: {
        fileUrl: null,
        removedAt: later,
        removedByUserId: 'user-1',
        removalReason: 'La photo montre une personne'
      }
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actionKey: 'STOCK_ATTACHMENT_REMOVED',
        entityId: ATTACHMENT_ID,
        payload: expect.objectContaining({ sha256: 'a'.repeat(64), byDepositor: false })
      })
    );
    await expect(fs.access(path.join(folder, 'f.jpg'))).rejects.toThrow();
  });

  it('le dépositaire retire dans les 15 minutes ; une pièce déjà retirée → 409', async () => {
    db.stockAttachment.findFirst.mockResolvedValue(attachmentRow());
    db.stockAttachment.updateMany.mockResolvedValue({ count: 1 });
    await removeStockAttachment(
      TENANT,
      ctx(),
      ATTACHMENT_ID,
      'Mauvaise photo',
      new Date(CREATED_AT.getTime() + 60_000)
    );
    expect(db.stockAttachment.updateMany).toHaveBeenCalledTimes(1);

    db.stockAttachment.findFirst.mockResolvedValue(attachmentRow({ removedAt: CREATED_AT }));
    await expect(
      removeStockAttachment(TENANT, ctx({ canDispose: true }), ATTACHMENT_ID, 'Encore', CREATED_AT)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('une pièce d’une autre agence → 404', async () => {
    db.stockAttachment.findFirst.mockResolvedValue(null);
    await expect(
      removeStockAttachment(TENANT, ctx({ canDispose: true }), ATTACHMENT_ID, 'Motif')
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.stockAttachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ATTACHMENT_ID, tenantId: TENANT } })
    );
  });
});

describe('Vue et lecture', () => {
  it('canRemove et removableUntil sont calculés pour l’appelant', () => {
    const row = attachmentRow() as any;
    const within = new Date(CREATED_AT.getTime() + 5 * 60 * 1000);
    const mine = toAttachmentView(row, ctx(), within);
    expect(mine.canRemove).toBe(true);
    expect(mine.removableUntil?.toISOString()).toBe('2026-10-04T10:15:00.000Z');
    expect(mine.targetId).toBe(MOVEMENT_ID);

    const other = toAttachmentView(row, ctx({ userId: 'user-9' }), within);
    expect(other).toMatchObject({ canRemove: false, removableUntil: null });
    expect(toAttachmentView(row, ctx({ userId: 'user-9', canDispose: true }), within).canRemove).toBe(true);
    expect(canRemoveAttachment({ ...row, removedAt: within }, ctx({ canDispose: true }), within)).toBe(false);

    const removed = toAttachmentView(
      { ...row, removedAt: within, removalReason: 'Floue', removedBy: { fullName: 'Admin' } },
      ctx(),
      within
    );
    expect(removed.removed).toEqual({ at: within, byLabel: 'Admin', reason: 'Floue' });
  });

  it('la liste vérifie la cible dans l’agence et rend les pièces retirées', async () => {
    db.stockSlip.findFirst.mockResolvedValue({ id: SLIP_ID, kind: 'RECEIPT' });
    db.stockAttachment.findMany.mockResolvedValue([
      attachmentRow({ targetType: 'SLIP', movementId: null, slipId: SLIP_ID, removedAt: CREATED_AT })
    ]);
    const list = await listStockAttachments(TENANT, ctx(), 'SLIP', SLIP_ID);
    expect(list).toHaveLength(1);
    expect(list[0].removed).not.toBeNull();
    expect(db.stockAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, targetType: 'SLIP', slipId: SLIP_ID } })
    );

    db.stockSlip.findFirst.mockResolvedValue(null);
    await expect(listStockAttachments(TENANT, ctx(), 'SLIP', SLIP_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('le fichier d’une pièce retirée → 404 ; sinon il est relu du dossier privé', async () => {
    db.stockAttachment.findFirst.mockResolvedValueOnce({ fileUrl: null, fileName: 'a.jpg', removedAt: CREATED_AT });
    await expect(readStockAttachmentFile(TENANT, ATTACHMENT_ID)).rejects.toMatchObject({ statusCode: 404 });

    const folder = path.join(tmpRoot, 'uploads', 'stock', TENANT, '2026');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'lu.webp'), 'webp');
    db.stockAttachment.findFirst.mockResolvedValueOnce({
      fileUrl: `/uploads/stock/${TENANT}/2026/lu.webp`,
      fileName: 'photo.webp',
      removedAt: null
    });
    const file = await readStockAttachmentFile(TENANT, ATTACHMENT_ID);
    expect(file.mimeType).toBe('image/webp');
    expect(file.buffer.toString()).toBe('webp');

    // Un chemin d'une autre agence enregistré sur la ligne ne sort pas.
    db.stockAttachment.findFirst.mockResolvedValueOnce({
      fileUrl: '/uploads/stock/autre-agence/2026/lu.webp',
      fileName: 'x.webp',
      removedAt: null
    });
    await expect(readStockAttachmentFile(TENANT, ATTACHMENT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
