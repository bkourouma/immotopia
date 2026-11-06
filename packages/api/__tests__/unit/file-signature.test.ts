/**
 * Signature des justificatifs : DOCX et DOC ne se reconnaissent plus à leurs
 * seuls premiers octets (un ZIP ou un classeur OLE quelconque n'est pas un
 * document Word).
 */
import { detectDocumentKind, extensionForKind } from '../../src/utils/file-signature';

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
