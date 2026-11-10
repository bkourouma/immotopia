/**
 * Bornes des DOCX (audit SUR-03) : un modèle piégé (zip bomb, trop d'entrées,
 * nombre d'entrées ou tailles mensongers, faux ZIP) est refusé avant que PizZip
 * ne décompresse quoi que ce soit, à l'upload, au rendu et à la conversion PDF.
 */
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';

// Objet module réel (et non l'enveloppe `import *`), pour pouvoir l'espionner.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const zlib: typeof import('zlib') = require('zlib');

const mockFindFirst = jest.fn();
const mockWriteFile = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: { documentTemplate: { findFirst: (...a: unknown[]) => mockFindFirst(...a) } }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: (...a: unknown[]) => mockWriteFile(...a),
  readFile: jest.fn()
}));

import { assertDocxWithinLimits, assertDocxUpload } from '../../src/utils/docx-limits';
import { renderDocxBuffer } from '../../src/services/docx-renderer';
import { sanitizeDocx } from '../../src/lib/pdf-convert/sanitize-docx';
import { uploadTemplate } from '../../src/services/document-template-service';
import { BadRequestError } from '../../src/middleware/error-middleware';

jest.setTimeout(60_000);

const MB = 1024 * 1024;
const INVALID = /pas un fichier Word/;
const TOO_BIG = /trop volumineux/;
const CONTENT_TYPES =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const DOCUMENT_XML =
  '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Bonjour {{nom}}</w:t></w:r></w:p></w:body></w:document>';

function build(extra?: (zip: PizZip) => void): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('word/document.xml', DOCUMENT_XML);
  extra?.(zip);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// 60 Mo de zéros : quelques dizaines de Ko une fois compressé.
const bomb = () => build(zip => zip.file('word/media/bomb.bin', Buffer.alloc(60 * MB)));
const manyEntries = () =>
  build(zip => {
    for (let i = 0; i < 2000; i++) zip.file(`word/e${i}.txt`, 'x');
  }); // 2 + 2000 entrées = 2002 > 2000

// ---------------------------------------------------------------------------
// Écriture ZIP à la main, pour forger ce que PizZip ne produirait jamais.
// ---------------------------------------------------------------------------

interface RawEntry {
  name: string;
  /** Octets tels qu'écrits dans l'archive (déjà compressés si méthode 8). */
  data: Buffer;
  method: number;
  /** Taille décompressée ANNONCÉE (répertoire central). */
  uncompressedSize: number;
  /** Bit 3 : tailles locales à 0, descripteur de données après les octets. */
  dataDescriptor?: boolean;
}

interface ForgeOptions {
  /** Nombre d'entrées annoncé par la fin de répertoire (défaut : le vrai). */
  eocdCount?: number;
  /** Octets ajoutés après la dernière entrée du répertoire (comptés dans sa taille). */
  directoryTrailing?: Buffer;
  /** Répète l'entrée centrale d'index donné (même en-tête local). */
  duplicateCentral?: number;
}

const crc = (data: Buffer) => zlib.crc32(data) >>> 0;

function deflated(name: string, content: string | Buffer): RawEntry {
  const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return { name, data: zlib.deflateRawSync(raw), method: 8, uncompressedSize: raw.length };
}

function forgeZip(entries: RawEntry[], options: ForgeOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'latin1');
    const flags = entry.dataDescriptor ? 0x0008 : 0;
    const checksum = entry.method === 0 ? crc(entry.data) : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(entry.dataDescriptor ? 0 : checksum, 14);
    local.writeUInt32LE(entry.dataDescriptor ? 0 : entry.data.length, 18);
    local.writeUInt32LE(entry.dataDescriptor ? 0 : entry.uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    const parts = [local, name, entry.data];
    if (entry.dataDescriptor) {
      const descriptor = Buffer.alloc(16);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(entry.data.length, 8);
      descriptor.writeUInt32LE(entry.uncompressedSize, 12);
      parts.push(descriptor);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    const block = Buffer.concat(parts);
    locals.push(block);
    offset += block.length;
  }
  if (options.duplicateCentral !== undefined) centrals.push(centrals[options.duplicateCentral]);
  const directory = Buffer.concat([...centrals, options.directoryTrailing ?? Buffer.alloc(0)]);
  const count = options.eocdCount ?? centrals.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

const wordEntries = (): RawEntry[] => [
  deflated('[Content_Types].xml', CONTENT_TYPES),
  deflated('word/document.xml', DOCUMENT_XML)
];

/** Flux deflate de `size` octets nuls, produit par morceaux d'1 Mo (jamais 120 Mo en mémoire). */
async function deflatedZeros(size: number): Promise<Buffer> {
  const chunk = Buffer.alloc(MB);
  const parts: Buffer[] = [];
  const deflate = zlib.createDeflateRaw({ level: 9 });
  deflate.on('data', (c: Buffer) => parts.push(c));
  const done = new Promise<void>((resolve, reject) => {
    deflate.on('end', () => resolve());
    deflate.on('error', reject);
  });
  for (let written = 0; written < size; written += chunk.length) {
    if (!deflate.write(chunk)) await new Promise(r => deflate.once('drain', r));
  }
  deflate.end();
  await done;
  return Buffer.concat(parts);
}

/** Espionne zlib.inflateRawSync en laissant passer l'appel réel ; garde options et codes d'erreur. */
function spyInflate() {
  const real = zlib.inflateRawSync;
  const calls: Array<{ maxOutputLength?: number; error?: string }> = [];
  const spy = jest.spyOn(zlib, 'inflateRawSync').mockImplementation(((
    data: Buffer,
    opts?: import('zlib').ZlibOptions
  ) => {
    const call: { maxOutputLength?: number; error?: string } = { maxOutputLength: opts?.maxOutputLength };
    calls.push(call);
    try {
      return real(data, opts);
    } catch (error) {
      call.error = (error as NodeJS.ErrnoException).code ?? 'ERROR';
      throw error;
    }
  }) as typeof real);
  return { spy, calls };
}

const BIG = 120 * MB;
let bigDeflate: Buffer;

beforeAll(async () => {
  bigDeflate = await deflatedZeros(BIG);
});

afterEach(() => jest.restoreAllMocks());

describe('assertDocxWithinLimits', () => {
  it('accepte un DOCX minimal valide', () => {
    expect(() => assertDocxWithinLimits(build())).not.toThrow();
    expect(() => assertDocxUpload(build())).not.toThrow();
    expect(() => assertDocxUpload(forgeZip(wordEntries()))).not.toThrow();
  });

  it('refuse plus de 2000 entrées', () => {
    expect(() => assertDocxWithinLimits(manyEntries())).toThrow(TOO_BIG);
  });

  it('refuse une bombe compressible (60 Mo > 50 Mo)', () => {
    const b = bomb();
    expect(b.length).toBeLessThan(MB);
    expect(() => assertDocxWithinLimits(b)).toThrow(BadRequestError);
  });

  it('respecte un plafond bas fourni', () => {
    expect(() => assertDocxWithinLimits(build(), { maxUncompressedBytes: 10 })).toThrow(BadRequestError);
    expect(() => assertDocxWithinLimits(build(), { maxEntries: 1 })).toThrow(BadRequestError);
    expect(() => assertDocxWithinLimits(build(), { maxEntryUncompressedBytes: 10 })).toThrow(TOO_BIG);
  });

  it('refuse un fichier qui ne commence pas par PK', () => {
    expect(() => assertDocxWithinLimits(Buffer.from('%PDF-1.7 ' + 'x'.repeat(100)))).toThrow(INVALID);
  });

  it('refuse un répertoire central tronqué', () => {
    const ok = build();
    expect(() => assertDocxWithinLimits(ok.subarray(0, ok.length - 30))).toThrow(INVALID);
  });

  it('refuse un nombre d’entrées falsifié (EOCD annonce 2, 3 entrées réelles) sans rien décompresser', () => {
    // PizZip, lui, lit les 3 entrées (il suit la signature, pas le nombre annoncé).
    const small = forgeZip([...wordEntries(), deflated('word/media/x.bin', 'x')], { eocdCount: 2 });
    expect(Object.keys(new PizZip(small).files)).toHaveLength(3);

    const forged = forgeZip(
      [...wordEntries(), { name: 'word/media/big.bin', data: bigDeflate, method: 8, uncompressedSize: BIG }],
      { eocdCount: 2 }
    );
    expect(forged.length).toBeLessThan(2 * MB);
    const { spy } = spyInflate();
    expect(() => assertDocxWithinLimits(forged)).toThrow(INVALID);
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuse une taille déclarée mensongère (10 octets annoncés, ~120 Mo réels) sans allouer', () => {
    const forged = forgeZip([
      ...wordEntries(),
      { name: 'word/media/big.bin', data: bigDeflate, method: 8, uncompressedSize: 10 }
    ]);
    const { calls } = spyInflate();
    const before = process.memoryUsage().arrayBuffers;
    expect(() => assertDocxWithinLimits(forged)).toThrow(TOO_BIG);
    // La décompression du gros flux est plafonnée à la taille annoncée et s'arrête net.
    const bigCall = calls[calls.length - 1];
    expect(bigCall).toEqual({ maxOutputLength: 10, error: 'ERR_BUFFER_TOO_LARGE' });
    expect(calls.every(c => (c.maxOutputLength ?? Infinity) <= DOCUMENT_XML.length + CONTENT_TYPES.length)).toBe(true);
    // Indicatif : rien de l'ordre de 120 Mo n'a été alloué.
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(20 * MB);
  });

  it('refuse une taille déclarée plus grande que la réalité', () => {
    const entries = wordEntries();
    entries[1] = { ...entries[1], uncompressedSize: entries[1].uncompressedSize + 5 };
    expect(() => assertDocxWithinLimits(forgeZip(entries))).toThrow(INVALID);
  });

  it('refuse une méthode de compression inconnue', () => {
    const data = Buffer.from('BZh91AY&SY');
    const forged = forgeZip([
      ...wordEntries(),
      { name: 'word/x.bin', data, method: 12, uncompressedSize: data.length }
    ]);
    expect(() => assertDocxWithinLimits(forged)).toThrow(INVALID);
  });

  it('refuse un flux deflate corrompu', () => {
    const data = Buffer.from([0xff, 0xff, 0xff, 0xff]);
    const forged = forgeZip([...wordEntries(), { name: 'word/x.bin', data, method: 8, uncompressedSize: 100 }]);
    expect(() => assertDocxWithinLimits(forged)).toThrow(INVALID);
  });

  it('refuse une entrée stockée de 60 Mo', () => {
    const data = Buffer.alloc(60 * MB);
    const forged = forgeZip([
      ...wordEntries(),
      { name: 'word/media/big.bin', data, method: 0, uncompressedSize: data.length }
    ]);
    expect(() => assertDocxWithinLimits(forged)).toThrow(TOO_BIG);
  });

  it('refuse une entrée stockée dont la taille annoncée diffère des données', () => {
    const data = Buffer.from('abc');
    const forged = forgeZip([...wordEntries(), { name: 'word/x.bin', data, method: 0, uncompressedSize: 30 }]);
    expect(() => assertDocxWithinLimits(forged)).toThrow(INVALID);
  });

  it('refuse des octets résiduels dans le répertoire central', () => {
    const forged = forgeZip(wordEntries(), { directoryTrailing: Buffer.from('JUNKJUNKJUNK') });
    expect(() => assertDocxWithinLimits(forged)).toThrow(INVALID);
  });

  it('refuse deux entrées centrales qui pointent sur les mêmes données (chevauchement)', () => {
    const forged = forgeZip(wordEntries(), { duplicateCentral: 1 });
    expect(() => assertDocxWithinLimits(forged)).toThrow(INVALID);
  });

  it('refuse le ZIP64 (marqueur 0xFFFF dans la fin de répertoire)', () => {
    const forged = forgeZip(wordEntries());
    forged.writeUInt16LE(0xffff, forged.length - 22 + 10);
    expect(() => assertDocxWithinLimits(forged)).toThrow(TOO_BIG);
  });

  it('accepte un descripteur de données (bit 3) et PizZip lit le même contenu', () => {
    const entries = wordEntries().map(e => ({ ...e, dataDescriptor: true }));
    const forged = forgeZip(entries);
    expect(() => assertDocxUpload(forged)).not.toThrow();
    expect(new PizZip(forged).file('word/document.xml')?.asText()).toBe(DOCUMENT_XML);
  });
});

describe('assertDocxUpload', () => {
  it('refuse un ZIP sans word/document.xml ou sans [Content_Types].xml', () => {
    const noDocument = forgeZip([deflated('[Content_Types].xml', CONTENT_TYPES), deflated('word/other.xml', '<x/>')]);
    expect(() => assertDocxWithinLimits(noDocument)).not.toThrow();
    expect(() => assertDocxUpload(noDocument)).toThrow(INVALID);
    const noTypes = forgeZip([deflated('word/document.xml', DOCUMENT_XML)]);
    expect(() => assertDocxUpload(noTypes)).toThrow(INVALID);
  });

  it('accepte les vrais modèles DOCX du dépôt, en quelques millisecondes', () => {
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    const files = ['assets/modeles_standard', 'assets/modeles_documents'].flatMap(dir =>
      fs
        .readdirSync(path.join(root, dir))
        .filter(f => f.toLowerCase().endsWith('.docx'))
        .map(f => path.join(root, dir, f))
    );
    expect(files).toHaveLength(12);
    const proposal = path.join(root, 'Proposition-Service-SCI-PTC-ImmoTopia.docx');
    if (fs.existsSync(proposal)) files.push(proposal);

    for (const file of files) {
      const buffer = fs.readFileSync(file);
      const start = process.hrtime.bigint();
      expect(() => assertDocxUpload(buffer)).not.toThrow();
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      // Large marge pour une machine chargée ; en pratique quelques ms.
      expect(elapsedMs).toBeLessThan(500);
    }
  });
});

describe('renderDocxBuffer / sanitizeDocx', () => {
  it('rendent un DOCX valide', () => {
    expect(renderDocxBuffer(build(), { nom: 'Awa' }).length).toBeGreaterThan(0);
    expect(sanitizeDocx(build()).length).toBeGreaterThan(0);
  });

  it('refusent la bombe', () => {
    expect(() => renderDocxBuffer(bomb(), {})).toThrow(BadRequestError);
    expect(() => sanitizeDocx(bomb())).toThrow(BadRequestError);
  });

  it('refusent le nombre d’entrées falsifié et la taille mensongère', () => {
    const lying = forgeZip([
      ...wordEntries(),
      { name: 'word/media/big.bin', data: bigDeflate, method: 8, uncompressedSize: 10 }
    ]);
    const miscounted = forgeZip(
      [...wordEntries(), { name: 'word/media/big.bin', data: bigDeflate, method: 8, uncompressedSize: BIG }],
      { eocdCount: 2 }
    );
    expect(() => renderDocxBuffer(miscounted, {})).toThrow(BadRequestError);
    expect(() => sanitizeDocx(miscounted)).toThrow(BadRequestError);
    expect(() => renderDocxBuffer(lying, {})).toThrow(BadRequestError);
    expect(() => sanitizeDocx(lying)).toThrow(BadRequestError);
  });
});

describe('uploadTemplate', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockWriteFile.mockReset();
  });

  it('refuse la bombe avant tout accès base ou disque', async () => {
    await expect(
      uploadTemplate('t1', 'LEASE_HABITATION' as any, bomb(), 'bail.docx', 'Bail', 'u1')
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuse un faux DOCX (PDF renommé)', async () => {
    await expect(
      uploadTemplate(
        't1',
        'LEASE_HABITATION' as any,
        Buffer.from('%PDF-1.7 ' + 'x'.repeat(100)),
        'bail.docx',
        'Bail',
        'u1'
      )
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
