/**
 * Outils de fichiers du complément PATRIMOINE : mise en forme française,
 * images PNG (photos d'état des lieux, de sinistre, capture de paiement) et
 * documents Word (.docx) pour les documents locatifs générés.
 *
 * Sans dépendance externe hormis `pizzip` (déjà utilisé par l'application) : les
 * images sont dessinées pixel par pixel puis compressées par `zlib`.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { deflateSync } from 'node:zlib';
import PizZip from 'pizzip';
import { getProjectRoot } from '../../../src/utils/project-root';

// ------------------------------------------------------------------ mise en forme

/** 1 250 000 → « 1 250 000 F CFA » (espace simple : lisible dans un PDF Helvetica). */
export function xof(value: number | string | { toString(): string }): string {
  const n = Math.round(Number(value));
  return `${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F CFA`.replace(/^/, n < 0 ? '-' : '');
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

export function dateFr(d: Date): string {
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthFr(d: Date): string {
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function fileExists(absolute: string): Promise<boolean> {
  try {
    await fs.access(absolute);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export type Rgb = [number, number, number];

/** Image PNG RVB à partir d'une fonction de peinture `(x, y) => [r, g, b]`. */
export function buildPng(width: number, height: number, paint: (x: number, y: number) => Rgb): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[o++] = Math.max(0, Math.min(255, Math.round(r)));
      raw[o++] = Math.max(0, Math.min(255, Math.round(g)));
      raw[o++] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const PALETTES: Rgb[] = [
  [236, 228, 212],
  [222, 232, 226],
  [230, 220, 214],
  [214, 224, 236],
  [240, 236, 222]
];

export type SceneKind = 'room' | 'kitchen' | 'bathroom' | 'facade' | 'stain' | 'roof' | 'storm' | 'screenshot';

/** Illustration d'une scène (la « photo » du dossier de démonstration), déterministe selon `variant`. */
export function sceneImage(kind: SceneKind, variant: number): Buffer {
  const W = 480;
  const H = 320;
  const wall = PALETTES[variant % PALETTES.length];
  const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (kind === 'screenshot') {
    const green: Rgb = variant % 2 ? [255, 121, 0] : [0, 160, 90];
    return buildPng(W, H, (x, y) => {
      if (y < 64) return green;
      if (inRect(x, y, 30, 110, 450, 130)) return [60, 60, 60];
      if (inRect(x, y, 30, 150, 300, 164) || inRect(x, y, 30, 180, 260, 194) || inRect(x, y, 30, 210, 330, 224)) {
        return [180, 180, 180];
      }
      if (inRect(x, y, 30, 258, 190, 296)) return green;
      return [250, 250, 250];
    });
  }
  return buildPng(W, H, (x, y) => {
    const shade = 1 - Math.abs(x - W / 2) / (W * 2.2);
    const floorY = kind === 'facade' || kind === 'roof' || kind === 'storm' ? 250 : 220;
    if (kind === 'facade' || kind === 'roof' || kind === 'storm') {
      const sky: Rgb = kind === 'storm' ? [110, 120, 138] : [150, 190, 226];
      if (y < 80 + (kind === 'roof' ? 90 : 0)) return kind === 'roof' ? [150, 80, 60] : sky;
      if (y >= floorY) return [118, 112, 100];
      if (inRect(x, y, 90, 150, 150, 220) || inRect(x, y, 330, 150, 390, 220)) return [60, 82, 110];
      if (inRect(x, y, 215, 160, 265, floorY)) return [92, 64, 42];
      return [wall[0] * shade, wall[1] * shade, wall[2] * shade];
    }
    if (y >= floorY) return [150 - (y - floorY) * 0.4, 118 - (y - floorY) * 0.3, 86];
    if (inRect(x, y, 60, 60, 190, 170)) return [168, 206, 232];
    if (kind === 'kitchen' && inRect(x, y, 260, 130, 450, floorY)) return [92, 100, 110];
    if (kind === 'bathroom' && inRect(x, y, 280, 90, 420, floorY)) return [232, 238, 240];
    if (kind === 'stain' && (x - 300) * (x - 300) + (y - 70) * (y - 70) < 3600) return [168, 150, 110];
    return [wall[0] * shade, wall[1] * shade, wall[2] * shade];
  });
}

// ------------------------------------------------------------------ DOCX

const xmlEscape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Document Word : une ligne `# Titre` devient un intertitre en gras, une ligne vide un saut. */
export function buildDocx(title: string, lines: readonly string[]): Buffer {
  const paragraph = (text: string, bold: boolean, size: number): string =>
    `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
  const body = [
    paragraph(title, true, 32),
    ...lines.map(line =>
      line === '' ? '<w:p/>' : line.startsWith('# ') ? paragraph(line.slice(2), true, 24) : paragraph(line, false, 22)
    )
  ].join('');
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/**
 * Écrit un document locatif généré là où le téléchargement l'attend :
 * `<racine>/assets/generated_documents/<agence>/<type>/<AAAA>/<MM>/…`
 * (`docx-renderer.saveGeneratedDocument`). Renvoie le chemin absolu.
 */
export async function writeGeneratedDocx(
  tenantId: string,
  docType: string,
  documentNumber: string,
  sourceKey: string,
  issuedAt: Date,
  buffer: Buffer
): Promise<string> {
  const dir = path.join(
    getProjectRoot(),
    'assets',
    'generated_documents',
    tenantId,
    docType,
    String(issuedAt.getFullYear()),
    String(issuedAt.getMonth() + 1).padStart(2, '0')
  );
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${slug(documentNumber)}_${docType}_${sourceKey.substring(0, 8)}.docx`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}
