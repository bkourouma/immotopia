/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lot S1 (besoin 7) : identité des documents.
 *
 * - validation d'une image déposée (octets magiques, taille) ;
 * - `resolveDocumentBranding` : mandant, repli sur l'agence, fichier absent ;
 * - rendu du relevé de compte du lot avec et sans logos : le PDF se génère et
 *   porte le nom de l'émetteur ;
 * - variables d'émetteur du compte rendu d'AG.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { PDFDocument, PDFRawStream } from 'pdf-lib';
import PizZip from 'pizzip';

jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  const nodePath = require('path');
  const nodeOs = require('os');
  return {
    ...actual,
    env: { ...actual.env, UPLOADS_DIR: nodePath.join(nodeOs.tmpdir(), `immotopia-branding-unit-${process.pid}`) }
  };
});

const mockPrisma = {
  syndicate: { findFirst: jest.fn() },
  tenant: { findUnique: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { PDFDocument as PdfDoc, StandardFonts } from 'pdf-lib';
import {
  BRANDING_IMAGE_MAX_BYTES,
  detectImageFormat,
  readImageDimensions,
  resolveBrandingKey,
  saveBrandingImage,
  validateBrandingImage
} from '../../src/lib/documents/branding-storage';
import {
  fitInBox,
  resolveDocumentBranding,
  truncate,
  type DocumentBranding
} from '../../src/lib/documents/document-branding';
import { sanitizeForPdf } from '../../src/lib/documents/pdf-text';
import { buildOwnerAccountStatementPdf } from '../../src/lib/syndics/owner-account-statement';
import { buildIssuerContext, buildMeetingMinutesDocx } from '../../src/lib/syndics/minutes-generator';

const UPLOADS = path.join(os.tmpdir(), `immotopia-branding-unit-${process.pid}`);
const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

/** PNG 1 x 1 valide. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

afterAll(() => {
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

beforeEach(() => {
  mockPrisma.syndicate.findFirst.mockReset();
  mockPrisma.tenant.findUnique.mockReset();
});

describe("validation d'une image déposée", () => {
  it('reconnaît PNG et JPEG par leurs octets, pas par le type déclaré', () => {
    expect(detectImageFormat(PNG)).toBe('png');
    expect(detectImageFormat(JPEG_HEAD)).toBe('jpg');
    expect(detectImageFormat(Buffer.from('GIF89a------'))).toBeNull();
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('accepte une image PNG valide', () => {
    expect(validateBrandingImage({ buffer: PNG, size: PNG.length })).toBe('png');
  });

  it('refuse un fichier absent, un faux PNG ou une image trop lourde (400)', () => {
    expect(() => validateBrandingImage(undefined)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => validateBrandingImage({ buffer: Buffer.from('<html>pas une image</html>') })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
    const heavy = Buffer.concat([PNG, Buffer.alloc(BRANDING_IMAGE_MAX_BYTES)]);
    expect(() => validateBrandingImage({ buffer: heavy, size: heavy.length })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("n'ouvre jamais une clé d'une autre agence ni un chemin qui remonte", () => {
    expect(resolveBrandingKey(TENANT, `branding/${TENANT}/syndics/s1/logo.png`)).toContain(UPLOADS);
    expect(resolveBrandingKey(TENANT, `branding/${OTHER_TENANT}/syndics/s1/logo.png`)).toBeNull();
    expect(resolveBrandingKey(TENANT, `branding/${TENANT}/../${OTHER_TENANT}/logo.png`)).toBeNull();
    expect(resolveBrandingKey(TENANT, '/uploads/properties/x.png')).toBeNull();
    expect(resolveBrandingKey(TENANT, null)).toBeNull();
  });

  it('met une image à l’échelle en gardant ses proportions, sans jamais l’agrandir', () => {
    expect(fitInBox(300, 100, 90, 60)).toEqual({ width: 90, height: 30 });
    expect(fitInBox(100, 200, 90, 60)).toEqual({ width: 30, height: 60 });
    expect(fitInBox(10, 10, 90, 60)).toEqual({ width: 10, height: 10 });
  });
});

/** PNG dont l'en-tête IHDR déclare `width` x `height` (le reste n'est pas lu à la validation). */
function pngDeclaring(width: number, height: number): Buffer {
  const buffer = Buffer.from(PNG);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** JPEG minimal : SOI, APP0, puis `frame` (SOF0 ou rien), puis SOS. */
function jpegDeclaring(frame: { width: number; height: number } | null): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = frame
    ? Buffer.from([
        0xff,
        0xc0,
        0x00,
        0x11,
        0x08,
        frame.height >> 8,
        frame.height & 0xff,
        frame.width >> 8,
        frame.width & 0xff,
        3,
        1,
        0x22,
        0,
        2,
        0x11,
        1,
        3,
        0x11,
        1
      ])
    : Buffer.alloc(0);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, sos, Buffer.from([0x00, 0xff, 0xd9])]);
}

describe('dimensions déclarées (bombe de décompression)', () => {
  it('lit les dimensions d’un PNG et d’un JPEG sans les décoder', () => {
    expect(readImageDimensions(pngDeclaring(1000, 500), 'png')).toEqual({ width: 1000, height: 500 });
    expect(readImageDimensions(jpegDeclaring({ width: 640, height: 480 }), 'jpg')).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions(jpegDeclaring(null), 'jpg')).toBeNull();
  });

  it('accepte un PNG de 1000 x 500', () => {
    expect(validateBrandingImage({ buffer: pngDeclaring(1000, 500) })).toBe('png');
  });

  it('refuse un PNG minuscule qui déclare 8000 x 8000 pixels (400)', () => {
    const bomb = pngDeclaring(8000, 8000);
    expect(bomb.length).toBeLessThan(200);
    expect(() => validateBrandingImage({ buffer: bomb })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('refuse au-delà de 8 Mpx même sous 3000 px de côté', () => {
    expect(() => validateBrandingImage({ buffer: pngDeclaring(3000, 2700) })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it('refuse un JPEG trop grand, et un JPEG sans marqueur SOF lisible', () => {
    expect(validateBrandingImage({ buffer: jpegDeclaring({ width: 800, height: 600 }) })).toBe('jpg');
    expect(() => validateBrandingImage({ buffer: jpegDeclaring({ width: 5000, height: 4000 }) })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(() => validateBrandingImage({ buffer: jpegDeclaring(null) })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});

describe('texte des PDF', () => {
  it('remplace les caractères de contrôle par une espace', () => {
    expect(sanitizeForPdf('Rue 12\nCocody\r\n\tAbidjan\u0085')).toBe('Rue 12 Cocody   Abidjan ');
  });

  it('tronque une chaîne de 200 000 caractères en moins de 50 ms', async () => {
    const doc = await PdfDoc.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const long = 'Résidence '.repeat(20_000);
    const started = performance.now();
    const cut = truncate(long, font, 10, 200);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(50);
    expect(cut.endsWith('...')).toBe(true);
    expect(font.widthOfTextAtSize(cut, 10)).toBeLessThanOrEqual(200);
    expect(truncate('Court', font, 10, 200)).toBe('Court');
  });
});

describe('resolveDocumentBranding', () => {
  it("prend l'identité du mandant, ses images et le logo de la copropriété", async () => {
    const logoKey = await saveBrandingImage(TENANT, ['mandants', 'm1'], 'logo', PNG, 'png');
    const syndicLogoKey = await saveBrandingImage(TENANT, ['syndics', 's1'], 'logo', PNG, 'png');
    mockPrisma.syndicate.findFirst.mockResolvedValue({
      name: 'Résidence Les Rôniers',
      address: 'Cocody',
      registrationNo: 'IMM-42',
      cadastralReference: null,
      logoPath: syndicLogoKey,
      mandatingAgency: {
        name: 'Agence Mandante Alpha',
        legalName: 'Alpha SARL',
        address: 'Plateau, Abidjan',
        phone: '+225 01 02 03',
        email: 'contact@alpha.ci',
        rccm: 'CI-ABJ-2020-B-1',
        taxId: 'NCC-1',
        logoPath: logoKey,
        // Clé enregistrée mais fichier absent du disque : null, pas d'erreur.
        signaturePath: `branding/${TENANT}/mandants/m1/signature-disparue.png`,
        stampPath: null
      }
    });

    const branding = await resolveDocumentBranding(TENANT, 's1');

    expect(mockPrisma.syndicate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1', tenantId: TENANT } })
    );
    expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(branding.issuer).toEqual(
      expect.objectContaining({ kind: 'MANDANT', name: 'Agence Mandante Alpha', rccm: 'CI-ABJ-2020-B-1' })
    );
    expect(branding.issuerLogo?.format).toBe('png');
    expect(branding.signature).toBeNull();
    expect(branding.stamp).toBeNull();
    expect(branding.syndicate).toEqual(
      expect.objectContaining({ name: 'Résidence Les Rôniers', registrationNo: 'IMM-42' })
    );
    expect(branding.syndicate?.logo?.format).toBe('png');
  });

  it("retombe sur l'agence quand la copropriété n'a pas de mandant", async () => {
    const logoDir = path.join(UPLOADS, 'properties', 'agency-logos', TENANT);
    fs.mkdirSync(logoDir, { recursive: true });
    fs.writeFileSync(path.join(logoDir, 'logo.png'), PNG);
    const stampKey = await saveBrandingImage(TENANT, ['agence'], 'cachet', PNG, 'png');
    mockPrisma.syndicate.findFirst.mockResolvedValue({
      name: 'Résidence B',
      address: '',
      registrationNo: null,
      cadastralReference: null,
      logoPath: null,
      mandatingAgency: null
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Cabinet Syndic',
      legalName: null,
      address: 'Rue 12',
      city: 'Abidjan',
      country: null,
      contactPhone: '0700',
      contactEmail: 'syndic@cabinet.ci',
      logoUrl: `/uploads/properties/agency-logos/${TENANT}/logo.png`,
      documentSignaturePath: null,
      documentStampPath: stampKey,
      financeSettings: { taxpayerNumber: 'NCC-AG' }
    });

    const branding = await resolveDocumentBranding(TENANT, 's2');

    expect(branding.issuer).toEqual(
      expect.objectContaining({ kind: 'AGENCY', name: 'Cabinet Syndic', address: 'Rue 12, Abidjan', taxId: 'NCC-AG' })
    );
    expect(branding.issuerLogo?.format).toBe('png');
    expect(branding.stamp?.format).toBe('png');
    expect(branding.signature).toBeNull();
    expect(branding.syndicate?.logo).toBeNull();
  });

  it("ignore une copropriété d'une autre agence et rend des images nulles si les fichiers manquent", async () => {
    mockPrisma.syndicate.findFirst.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Cabinet Syndic',
      legalName: null,
      address: null,
      city: null,
      country: null,
      contactPhone: null,
      contactEmail: null,
      logoUrl: `/uploads/properties/agency-logos/${TENANT}/absent.png`,
      documentSignaturePath: `branding/${TENANT}/agence/signature-absente.png`,
      documentStampPath: `branding/${OTHER_TENANT}/agence/cachet.png`,
      financeSettings: null
    });

    const branding = await resolveDocumentBranding(TENANT, 'syndic-autre-agence');

    expect(branding.issuer.kind).toBe('AGENCY');
    expect(branding.syndicate).toBeNull();
    expect(branding.issuerLogo).toBeNull();
    expect(branding.signature).toBeNull();
    expect(branding.stamp).toBeNull();
  });
});

/** Texte des flux de contenu du PDF (pdf-lib les compresse en Flate). */
async function pdfContentText(buffer: Buffer): Promise<string> {
  const doc = await PDFDocument.load(buffer);
  const chunks: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const bytes = Buffer.from(object.contents);
    try {
      chunks.push(zlib.inflateSync(bytes).toString('latin1'));
    } catch {
      chunks.push(bytes.toString('latin1'));
    }
  }
  return chunks.join('\n');
}

/** pdf-lib écrit le texte des polices standard en hexadécimal WinAnsi. */
function hexOf(text: string): string {
  return Buffer.from(text, 'latin1').toString('hex').toUpperCase();
}

describe('relevé de compte du lot avec identité', () => {
  const payload = {
    syndicateName: 'Résidence Les Rôniers',
    lotNumber: 'A-12',
    ownerName: 'Amadou Koné',
    currency: 'FCFA',
    openingBalance: 1500,
    closingBalance: 0,
    transactions: [
      {
        transactionDate: new Date('2026-01-15T00:00:00.000Z'),
        type: 'CALL',
        label: 'Charges T1',
        debit: 1500,
        credit: null,
        balanceAfter: 1500
      }
    ]
  };

  const branding = (withImages: boolean): DocumentBranding => ({
    issuer: {
      kind: 'MANDANT',
      name: 'Agence Mandante Alpha',
      legalName: 'Alpha SARL',
      address: 'Plateau, Abidjan',
      phone: '+225 01',
      email: 'contact@alpha.ci',
      rccm: 'CI-ABJ-1',
      taxId: null
    },
    issuerLogo: withImages ? { bytes: new Uint8Array(PNG), format: 'png' } : null,
    signature: withImages ? { bytes: new Uint8Array(PNG), format: 'png' } : null,
    stamp: withImages ? { bytes: new Uint8Array(PNG), format: 'png' } : null,
    syndicate: {
      name: 'Résidence Les Rôniers',
      address: 'Cocody',
      registrationNo: 'IMM-42',
      cadastralReference: null,
      logo: withImages ? { bytes: new Uint8Array(PNG), format: 'png' } : null
    }
  });

  it.each([
    ['avec logos, signature et cachet', true],
    ['sans aucune image', false]
  ])('se génère %s et porte le nom de l’émetteur', async (_label, withImages) => {
    const buffer = await buildOwnerAccountStatementPdf(payload, branding(withImages));

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const doc = await PDFDocument.load(buffer);
    expect(doc.getAuthor()).toBe('Agence Mandante Alpha');
    const content = await pdfContentText(buffer);
    expect(content).toContain(hexOf('Agence Mandante Alpha'));
    expect(content).toContain(hexOf('RCCM CI-ABJ-1'));
    // Quatre images (logo émetteur, logo copropriété, signature, cachet) ou aucune.
    expect(content.includes('/XObject') || content.includes(' Do')).toBe(withImages);
  });

  it('se génère avec une adresse saisie sur plusieurs lignes', async () => {
    const multiline = branding(false);
    multiline.issuer.address = 'Rue 12\nCocody\r\nAbidjan';
    const buffer = await buildOwnerAccountStatementPdf(payload, multiline);
    expect(await pdfContentText(buffer)).toContain(hexOf('Rue 12 Cocody  Abidjan'));
  });

  it("ignore une image corrompue plutôt que d'échouer", async () => {
    const broken = branding(false);
    broken.issuerLogo = { bytes: new Uint8Array([...PNG.subarray(0, 8), 1, 2, 3]), format: 'png' };
    await expect(buildOwnerAccountStatementPdf(payload, broken)).resolves.toBeInstanceOf(Buffer);
  });
});

describe("compte rendu d'AG : identité de l'émetteur", () => {
  const brandingAgency: DocumentBranding = {
    issuer: {
      kind: 'AGENCY',
      name: 'Cabinet Syndic',
      legalName: null,
      address: 'Rue 12',
      phone: '0700',
      email: 'syndic@cabinet.ci',
      rccm: null,
      taxId: 'NCC-AG'
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: { name: 'Résidence B', address: null, registrationNo: 'IMM-7', cadastralReference: null, logo: null }
  };

  it('expose les variables texte de l’émetteur, vides quand elles manquent', () => {
    expect(buildIssuerContext(brandingAgency)).toEqual({
      EMETTEUR_NOM: 'Cabinet Syndic',
      EMETTEUR_RAISON_SOCIALE: 'Cabinet Syndic',
      EMETTEUR_ADRESSE: 'Rue 12',
      EMETTEUR_TELEPHONE: '0700',
      EMETTEUR_EMAIL: 'syndic@cabinet.ci',
      EMETTEUR_RCCM: '',
      EMETTEUR_NCC: 'NCC-AG',
      COPROPRIETE_IMMATRICULATION: 'IMM-7',
      COPROPRIETE_REFERENCE_CADASTRALE: ''
    });
    expect(buildIssuerContext(null).EMETTEUR_NOM).toBe('');
  });

  it("place l'identité de l'émetteur en tête du compte rendu généré sans modèle", async () => {
    const buffer = await buildMeetingMinutesDocx(
      { id: 'm1', type: 'ORDINARY', scheduledAt: new Date('2026-03-01T10:00:00Z'), syndicate: { name: 'Résidence B' } },
      `tenant-sans-modele-${process.pid}`,
      brandingAgency
    );
    const xml = new PizZip(buffer).file('word/document.xml')!.asText();
    expect(xml.indexOf('Cabinet Syndic')).toBeGreaterThan(-1);
    expect(xml.indexOf('Cabinet Syndic')).toBeLessThan(xml.indexOf('COMPTE RENDU'));
    expect(xml).toContain('NCC NCC-AG');
  });
});
