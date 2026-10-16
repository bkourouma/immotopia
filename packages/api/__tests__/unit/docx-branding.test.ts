/**
 * Contexte commun et injection des logos dans les DOCX rendus (sans
 * docxtemplater-image-module-free : injection maison via pizzip).
 */
import PizZip from 'pizzip';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  buildCommonDocumentContext,
  fitLogoEmu,
  injectDocxImages,
  isOptionalBrandingKey,
  readImageSize
} from '../../src/lib/documents/docx-branding';
import { renderDocxBuffer } from '../../src/services/docx-renderer';
import { buildStandardTemplate } from '../../src/lib/documents/docx-standard-templates';
import type { DocumentBranding, DocumentImage } from '../../src/lib/documents/document-branding';

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

/** PNG 1x1 valide. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** En-tete PNG de la taille voulue (seuls les 24 premiers octets comptent). */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** JPEG minimal : SOI + SOF0 de 32 x 16 pixels. */
const JPEG_32X16 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03,
  0x11, 0x01
]);

const pngImage = (bytes: Uint8Array = PNG_1X1): DocumentImage => ({ bytes, format: 'png' });

const branding = (overrides: Partial<DocumentBranding> = {}): DocumentBranding => ({
  issuer: {
    kind: 'MANDANT',
    name: 'Cabinet Horizon',
    legalName: 'Horizon Gestion SARL',
    address: 'Cocody, Abidjan',
    phone: '+225 27 00 00 00',
    email: 'contact@horizon.test',
    rccm: 'CI-ABJ-2020-B-1234',
    taxId: '2012345A'
  },
  issuerLogo: pngImage(),
  signature: null,
  stamp: null,
  syndicate: {
    name: 'Résidence Les Flamboyants',
    address: 'Riviera 3',
    registrationNo: 'IMM-001',
    cadastralReference: 'CAD-77',
    logo: pngImage()
  },
  ...overrides
});

const textOf = (zip: PizZip, part: string): string => zip.file(part)!.asText();

describe('contexte commun des documents DOCX', () => {
  it("porte l'identité de l'émetteur, la copropriété, la date et la référence", () => {
    const context = buildCommonDocumentContext(branding(), {
      reference: 'AG-2026-01',
      emittedAt: new Date(2026, 8, 30)
    });

    expect(context).toMatchObject({
      EMETTEUR_NOM: 'Cabinet Horizon',
      EMETTEUR_RAISON_SOCIALE: 'Horizon Gestion SARL',
      EMETTEUR_ADRESSE: 'Cocody, Abidjan',
      EMETTEUR_TELEPHONE: '+225 27 00 00 00',
      EMETTEUR_EMAIL: 'contact@horizon.test',
      EMETTEUR_RCCM: 'CI-ABJ-2020-B-1234',
      EMETTEUR_NCC: '2012345A',
      COPROPRIETE_NOM: 'Résidence Les Flamboyants',
      COPROPRIETE_ADRESSE: 'Riviera 3',
      COPROPRIETE_IMMATRICULATION: 'IMM-001',
      COPROPRIETE_REFERENCE_CADASTRALE: 'CAD-77',
      DATE_EMISSION_DOCUMENT: '30/09/2026',
      REFERENCE_DOCUMENT: 'AG-2026-01'
    });
    expect(context.EMETTEUR_PIED_DE_PAGE).toBe('Cabinet Horizon · RCCM CI-ABJ-2020-B-1234 · NCC 2012345A');
  });

  it("copropriété et identité vides quand le document n'en a pas", () => {
    const context = buildCommonDocumentContext(null);

    for (const key of [
      'EMETTEUR_NOM',
      'EMETTEUR_RCCM',
      'COPROPRIETE_NOM',
      'COPROPRIETE_IMMATRICULATION',
      'COPROPRIETE_REFERENCE_CADASTRALE'
    ]) {
      expect(context[key]).toBe('');
    }
    expect(context.REFERENCE_DOCUMENT).toBe('');
  });

  it('reconnaît les clés dont le vide reste vide', () => {
    expect(isOptionalBrandingKey('EMETTEUR_RCCM')).toBe(true);
    expect(isOptionalBrandingKey('COPROPRIETE_NOM')).toBe(true);
    expect(isOptionalBrandingKey('LOGO_EMETTEUR')).toBe(true);
    expect(isOptionalBrandingKey('LOCATAIRE_NOM')).toBe(false);
  });
});

describe('taille des logos', () => {
  it('lit les dimensions PNG et JPEG', () => {
    expect(readImageSize(pngImage())).toEqual({ width: 1, height: 1 });
    expect(readImageSize({ bytes: JPEG_32X16, format: 'jpg' })).toEqual({ width: 32, height: 16 });
    expect(readImageSize(pngImage(new Uint8Array(40)))).toBeNull();
  });

  it('borne le logo à 2,5 cm de haut et 3,4 cm de large, proportions conservées', () => {
    const wide = fitLogoEmu({ width: 4000, height: 1000 });
    expect(wide.cx).toBeLessThanOrEqual(1224000);
    expect(wide.cx / wide.cy).toBeCloseTo(4, 1);

    const tall = fitLogoEmu({ width: 1000, height: 2000 });
    expect(tall.cy).toBeLessThanOrEqual(900000);
    expect(tall.cx / tall.cy).toBeCloseTo(0.5, 2);
  });

  it("n'agrandit jamais une petite image", () => {
    expect(fitLogoEmu({ width: 10, height: 10 })).toEqual({ cx: 95250, cy: 95250 });
  });
});

describe('injection des logos après le rendu', () => {
  const render = (images: Record<string, DocumentImage | null>) =>
    renderDocxBuffer(buildStandardTemplate('recu_loyer'), {
      EMETTEUR_NOM: 'Cabinet Horizon',
      __images: images
    });

  it("avec images : médias, relations, types de contenu et dessins inline dans l'en-tête", () => {
    const zip = new PizZip(render({ LOGO_EMETTEUR: pngImage(pngHeader(400, 200)), LOGO_COPROPRIETE: pngImage() }));

    expect(zip.file('word/media/logo_emetteur.png')).not.toBeNull();
    expect(zip.file('word/media/logo_copropriete.png')).not.toBeNull();

    const header = textOf(zip, 'word/header1.xml');
    expect(header.match(/<w:drawing>/g)).toHaveLength(2);
    expect(header).not.toContain('@@');
    expect(header).not.toContain('{{LOGO');

    const rels = textOf(zip, 'word/_rels/header1.xml.rels');
    const embedIds = [...header.matchAll(/r:embed="([^"]+)"/g)].map(match => match[1]);
    expect(embedIds).toHaveLength(2);
    for (const id of embedIds) expect(rels).toContain(`Id="${id}"`);
    expect(rels).toContain('Target="media/logo_emetteur.png"');

    expect(textOf(zip, '[Content_Types].xml')).toContain('Extension="png" ContentType="image/png"');
    // 400 x 200 px : borné à 2,5 cm de haut (900000 EMU) au plus.
    const extent = header.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)!;
    expect(Number(extent[2])).toBeLessThanOrEqual(900000);
    expect(Number(extent[1])).toBeLessThanOrEqual(1224000);
  });

  it('les identifiants de dessin sont uniques', () => {
    const zip = new PizZip(render({ LOGO_EMETTEUR: pngImage(), LOGO_COPROPRIETE: pngImage() }));
    const ids = [...textOf(zip, 'word/header1.xml').matchAll(/<wp:docPr id="(\d+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sans image : le marqueur disparaît, aucun dessin, aucun média', () => {
    const zip = new PizZip(render({ LOGO_EMETTEUR: null, LOGO_COPROPRIETE: null }));
    const header = textOf(zip, 'word/header1.xml');

    expect(header).not.toContain('<w:drawing>');
    expect(header).not.toContain('LOGO_');
    expect(header).not.toContain('@@');
    expect(header).toContain('Cabinet Horizon');
    expect(zip.file(/^word\/media\//)).toHaveLength(0);
  });

  it('sans clé __images : aucun marqueur visible non plus', () => {
    const zip = new PizZip(renderDocxBuffer(buildStandardTemplate('recu_loyer'), {}));
    expect(textOf(zip, 'word/header1.xml')).not.toMatch(/LOGO_|@@/);
  });

  it('une image illisible est ignorée (pas de dessin cassé)', () => {
    const zip = new PizZip(render({ LOGO_EMETTEUR: pngImage(new Uint8Array(64)) }));
    expect(textOf(zip, 'word/header1.xml')).not.toContain('<w:drawing>');
    expect(zip.file(/^word\/media\//)).toHaveLength(0);
  });

  it('un marqueur du corps est remplacé, et le fichier de relations du document est créé', () => {
    const zip = new PizZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
    );
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Avant @@LOGO_EMETTEUR@@ après {{LOGO_COPROPRIETE}}</w:t></w:r></w:p></w:body></w:document>'
    );

    injectDocxImages(zip, { LOGO_EMETTEUR: pngImage(), LOGO_COPROPRIETE: null });

    const body = textOf(zip, 'word/document.xml');
    expect(body).toContain('<w:drawing>');
    expect(body).toContain('Avant ');
    expect(body).toContain(' après ');
    expect(body).not.toMatch(/LOGO_|@@/);
    expect(textOf(zip, 'word/_rels/document.xml.rels')).toContain('relationships/image');
    expect(new PizZip(zip.generate({ type: 'nodebuffer' })).file('word/media/logo_emetteur.png')).not.toBeNull();
  });

  const CONTENT_TYPES =
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
  const DOCUMENT_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  it('un identifiant de dessin distinct par marqueur, même répété dans une partie', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file(
      'word/document.xml',
      `<w:document ${DOCUMENT_NS}><w:body><w:p><w:r><w:t>@@LOGO_EMETTEUR@@ et @@LOGO_EMETTEUR@@ puis @@LOGO_COPROPRIETE@@</w:t></w:r></w:p></w:body></w:document>`
    );
    injectDocxImages(zip, { LOGO_EMETTEUR: pngImage(), LOGO_COPROPRIETE: pngImage() });

    const body = textOf(zip, 'word/document.xml');
    expect(body.match(/<w:drawing>/g)).toHaveLength(3);
    const ids = [...body.matchAll(/<wp:docPr id="(\d+)"/g)].map(match => match[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(body).not.toMatch(/@@/);
  });

  it('accepte un fichier de relations auto-fermant', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file(
      'word/document.xml',
      `<w:document ${DOCUMENT_NS}><w:body><w:p><w:r><w:t>@@LOGO_EMETTEUR@@</w:t></w:r></w:p></w:body></w:document>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    );
    injectDocxImages(zip, { LOGO_EMETTEUR: pngImage() });

    const rels = textOf(zip, 'word/_rels/document.xml.rels');
    expect(rels).toMatch(/<Relationships [^>]*><Relationship Id="rIdImmoLogo1"[^>]*\/><\/Relationships>$/);
    expect(textOf(zip, 'word/document.xml')).toContain('<w:drawing>');
  });

  it('sans [Content_Types].xml : erreur journalisée, marqueur supprimé, aucune image', () => {
    const { logger } = jest.requireMock('../../src/utils/logger') as { logger: { error: jest.Mock } };
    logger.error.mockClear();
    const zip = new PizZip();
    zip.file(
      'word/document.xml',
      `<w:document ${DOCUMENT_NS}><w:body><w:p><w:r><w:t>Avant @@LOGO_EMETTEUR@@ après</w:t></w:r></w:p></w:body></w:document>`
    );
    injectDocxImages(zip, { LOGO_EMETTEUR: pngImage() });

    const body = textOf(zip, 'word/document.xml');
    expect(body).not.toMatch(/@@|<w:drawing>/);
    expect(body).toContain('Avant  après');
    expect(zip.file(/^word\/media\//)).toHaveLength(0);
    expect(zip.file('word/_rels/document.xml.rels')).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[Content_Types].xml'), expect.anything());
  });
});
