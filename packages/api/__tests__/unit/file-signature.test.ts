/**
 * Signature des justificatifs : DOCX et DOC ne se reconnaissent plus à leurs
 * seuls premiers octets (un ZIP ou un classeur OLE quelconque n'est pas un
 * document Word).
 */
import {
  detectDocumentKind,
  extensionForKind,
  detectVideoKind,
  detectUploadKind,
  assertUploadMatchesDeclaredType,
  contentMatchesDeclaredType
} from '../../src/utils/file-signature';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Un DOCX minimal : archive dont les entrées `[Content_Types].xml` et `word/document.xml` sont nommées. */
function minimalDocx(): Buffer {
  return Buffer.concat([
    ZIP_MAGIC,
    Buffer.from('\u0014\u0000\u0000\u0000', 'latin1'),
    Buffer.from('[Content_Types].xml'),
    Buffer.from('<Types/>'),
    ZIP_MAGIC,
    Buffer.from('word/document.xml'),
    Buffer.from('<w:document/>')
  ]);
}

describe('detectDocumentKind — DOCX', () => {
  it('accepte un DOCX minimal', () => {
    expect(detectDocumentKind(minimalDocx())).toBe('docx');
  });

  it('refuse un ZIP quelconque', () => {
    const zip = Buffer.concat([ZIP_MAGIC, Buffer.from('readme.txt'), Buffer.from('bonjour')]);
    expect(detectDocumentKind(zip)).toBeNull();
  });

  it('refuse un ZIP avec [Content_Types].xml mais sans entrée word/ (un XLSX, par exemple)', () => {
    const xlsx = Buffer.concat([ZIP_MAGIC, Buffer.from('[Content_Types].xml'), Buffer.from('xl/workbook.xml')]);
    expect(detectDocumentKind(xlsx)).toBeNull();
  });
});

describe('detectDocumentKind — DOC', () => {
  it('accepte un conteneur OLE portant le flux WordDocument', () => {
    const doc = Buffer.concat([OLE_MAGIC, Buffer.alloc(16), Buffer.from('WordDocument', 'utf16le')]);
    expect(detectDocumentKind(doc)).toBe('doc');
  });

  it('refuse un conteneur OLE sans WordDocument', () => {
    const ole = Buffer.concat([OLE_MAGIC, Buffer.alloc(16), Buffer.from('Workbook', 'utf16le')]);
    expect(detectDocumentKind(ole)).toBeNull();
  });
});

describe('extensionForKind', () => {
  it('donne une extension fixe par type détecté', () => {
    expect(extensionForKind('pdf')).toBe('.pdf');
    expect(extensionForKind('jpg')).toBe('.jpg');
    expect(extensionForKind('docx')).toBe('.docx');
    expect(extensionForKind('webp')).toBe('.webp');
  });
});

const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
const MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]);
const MOV_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  ')]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n%contenu\n');
const TIFF_BYTES = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

describe('detectVideoKind', () => {
  it('reconnaît mp4, mov et webm', () => {
    expect(detectVideoKind(MP4_BYTES)).toBe('mp4');
    expect(detectVideoKind(MOV_BYTES)).toBe('mov');
    expect(detectVideoKind(Buffer.concat([EBML, Buffer.from('Bwebm')]))).toBe('webm');
  });
  it('refuse Matroska et le texte', () => {
    expect(detectVideoKind(Buffer.concat([EBML, Buffer.from('Bmatroska')]))).toBeNull();
    expect(detectVideoKind(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
  });
});

describe('detectUploadKind', () => {
  it('reconnaît tiff et dwg', () => {
    expect(detectUploadKind(Buffer.from([0x49, 0x49, 0x2a, 0x00, 1, 2]))).toBe('tiff');
    expect(detectUploadKind(Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 1, 2]))).toBe('tiff');
    expect(detectUploadKind(Buffer.from('AC1027xxxx'))).toBe('dwg');
  });
});

describe('assertUploadMatchesDeclaredType', () => {
  const photo = { allowedKinds: ['jpg', 'png', 'webp'] as const };

  it("rend le type réel et l'extension dérivée", () => {
    expect(assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'image/png' }, photo)).toEqual({
      kind: 'png',
      extension: '.png'
    });
  });
  it('refuse un HTML déclaré image/png (400)', () => {
    expect(() =>
      assertUploadMatchesDeclaredType({ buffer: Buffer.from('<html><script>1</script>'), mimetype: 'image/png' }, photo)
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
  it('accepte un type déclaré voisin de la même famille, extension du type RÉEL', () => {
    // PNG nommé .jpg par le téléphone, déclaré image/jpeg : jpg et png sont autorisés.
    expect(assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'image/jpeg' }, photo)).toEqual({
      kind: 'png',
      extension: '.png'
    });
    expect(assertUploadMatchesDeclaredType({ buffer: JPEG_BYTES, mimetype: 'image/png' }, photo)).toEqual({
      kind: 'jpg',
      extension: '.jpg'
    });
    expect(assertUploadMatchesDeclaredType({ buffer: JPEG_BYTES, mimetype: 'image/webp' }, photo).extension).toBe(
      '.jpg'
    );
    const videos = { allowedKinds: ['mp4', 'webm'] as const };
    expect(assertUploadMatchesDeclaredType({ buffer: MP4_BYTES, mimetype: 'video/webm' }, videos)).toEqual({
      kind: 'mp4',
      extension: '.mp4'
    });
  });
  it('refuse un type déclaré voisin qui n’est pas autorisé, ou hors famille connue', () => {
    // png seul autorisé : image/jpeg n'est le type d'aucun type autorisé.
    expect(() =>
      assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'image/jpeg' }, { allowedKinds: ['png'] })
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'image/svg+xml' }, photo)).toThrow();
    expect(() => assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'image/gif' }, photo)).toThrow();
  });
  it('refuse toujours entre familles : image ↔ document, image ↔ vidéo', () => {
    const mixed = { allowedKinds: ['pdf', 'doc', 'docx', 'jpg', 'png', 'tiff', 'mp4'] as const };
    // Image déclarée pour un contenu document.
    expect(() => assertUploadMatchesDeclaredType({ buffer: PDF_BYTES, mimetype: 'image/png' }, mixed)).toThrow();
    // Document déclaré pour un contenu image.
    expect(() => assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'application/pdf' }, mixed)).toThrow();
    expect(() =>
      assertUploadMatchesDeclaredType(
        { buffer: PNG_BYTES, mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        mixed
      )
    ).toThrow();
    // Vidéo déclarée image, image déclarée vidéo.
    expect(() => assertUploadMatchesDeclaredType({ buffer: MP4_BYTES, mimetype: 'image/png' }, mixed)).toThrow();
    expect(() => assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'video/mp4' }, mixed)).toThrow();
    // Contenu exécutable / HTML déclaré image : aucun type réel reconnu.
    expect(() =>
      assertUploadMatchesDeclaredType({ buffer: Buffer.from('MZ\x90\x00binaire'), mimetype: 'image/jpeg' }, mixed)
    ).toThrow();
    // Entre documents, toujours l'appariement exact (PDF déclaré DOC).
    expect(() =>
      assertUploadMatchesDeclaredType({ buffer: PDF_BYTES, mimetype: 'application/msword' }, mixed)
    ).toThrow();
  });
  it('refuse un type réel hors liste autorisée même si le déclaré l’est', () => {
    expect(() => assertUploadMatchesDeclaredType({ buffer: TIFF_BYTES, mimetype: 'image/png' }, photo)).toThrow();
  });
  it('refuse un type réel hors liste autorisée', () => {
    expect(() => assertUploadMatchesDeclaredType({ buffer: MP4_BYTES, mimetype: 'video/mp4' }, photo)).toThrow();
  });
});

describe('T-B : médias légitimes', () => {
  const MOV_OLD = Buffer.concat([Buffer.from([0, 0, 0, 0x08]), Buffer.from('moov')]);
  const ftyp = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`)]);

  it('accepte mp4 déclaré video/quicktime et mov déclaré video/mp4, extension du type détecté', () => {
    expect(assertUploadMatchesDeclaredType({ buffer: MP4_BYTES, mimetype: 'video/quicktime' })).toEqual({
      kind: 'mp4',
      extension: '.mp4'
    });
    expect(assertUploadMatchesDeclaredType({ buffer: MOV_BYTES, mimetype: 'video/mp4' })).toEqual({
      kind: 'mov',
      extension: '.mov'
    });
  });
  it('garde les autres types strictement appariés', () => {
    expect(() => assertUploadMatchesDeclaredType({ buffer: PNG_BYTES, mimetype: 'image/jpeg' })).toThrow();
    expect(() => assertUploadMatchesDeclaredType({ buffer: MP4_BYTES, mimetype: 'video/webm' })).toThrow();
  });
  it('détecte un MOV ancien sans ftyp (atome moov)', () => {
    expect(detectVideoKind(MOV_OLD)).toBe('mov');
    expect(detectVideoKind(Buffer.concat([Buffer.alloc(4), Buffer.from('moov')]))).toBeNull();
  });
  it('refuse HEIC et AVIF, garde mp4 pour les marques vidéo', () => {
    expect(detectVideoKind(ftyp('heic'))).toBeNull();
    expect(detectVideoKind(ftyp('avif'))).toBeNull();
    expect(detectVideoKind(ftyp('mif1'))).toBeNull();
    expect(detectVideoKind(ftyp('mp42'))).toBe('mp4');
    expect(detectVideoKind(ftyp('M4V '))).toBe('mp4');
  });
  it('tolère jusqu’à 1024 octets de bourrage avant %PDF-', () => {
    const pdf = (pad: number) => Buffer.concat([Buffer.alloc(pad, 0x0a), Buffer.from('%PDF-1.7')]);
    expect(detectDocumentKind(pdf(100))).toBe('pdf');
    expect(detectUploadKind(pdf(100))).toBe('pdf');
    expect(detectDocumentKind(pdf(2000))).toBeNull();
  });
});

describe('PDF : bourrage et signatures strictes', () => {
  const PDF_META = Buffer.from('<x:xmpmeta>%PDF-1.4</x:xmpmeta>', 'latin1');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), PDF_META]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), PDF_META]);
  const tiff = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00]), PDF_META]);

  it('un WebP, un MP4 ou un TIFF contenant %PDF-1.4 en métadonnées garde son vrai type', () => {
    expect(detectUploadKind(webp)).toBe('webp');
    expect(detectUploadKind(mp4)).toBe('mp4');
    expect(detectUploadKind(tiff)).toBe('tiff');
    expect(detectDocumentKind(webp)).toBeNull();
    expect(detectDocumentKind(mp4)).toBeNull();
    expect(detectDocumentKind(tiff)).toBeNull();
  });
  it('accepte un PDF précédé de BOM et de sauts de ligne', () => {
    const pdf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0x0d, 0x0a, 0x0a]), Buffer.from('%PDF-1.7\n')]);
    expect(detectDocumentKind(pdf)).toBe('pdf');
    expect(detectUploadKind(pdf)).toBe('pdf');
  });
  it("accepte un PDF 2.0 à l'offset 0", () => {
    expect(detectUploadKind(Buffer.from('%PDF-2.0\n%%EOF'))).toBe('pdf');
  });
  it('refuse un HTML qui cite %PDF-1.4', () => {
    const html = Buffer.from('<html><body>%PDF-1.4</body></html>');
    expect(detectDocumentKind(html)).toBeNull();
    expect(detectUploadKind(html)).toBeNull();
  });
  it('refuse %PDF- sans version', () => {
    expect(detectDocumentKind(Buffer.from('%PDF-'))).toBeNull();
    expect(detectDocumentKind(Buffer.from('\n\n%PDF-x.y'))).toBeNull();
    expect(detectUploadKind(Buffer.from('%PDF-1'))).toBeNull();
  });
  it('contentMatchesDeclaredType refuse un WebP déclaré application/pdf', () => {
    expect(contentMatchesDeclaredType(webp, 'application/pdf')).toBe(false);
    expect(contentMatchesDeclaredType(Buffer.from('%PDF-1.4'), 'application/pdf')).toBe(true);
  });
});
