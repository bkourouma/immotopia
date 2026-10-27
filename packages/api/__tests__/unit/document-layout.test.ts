/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * En-tête et pied de page standard des PDF (drawDocumentHeader,
 * drawPartyBlock, drawDocumentFooters) : un document sort toujours, même sans
 * logo ; le texte accentué passe par sanitizeForPdf ; la pagination couvre
 * toutes les pages.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import { PDFDocument, PDFPage } from 'pdf-lib';
import { drawDocumentHeader, type DocumentBranding } from '../../src/lib/documents/document-branding';
import {
  drawDocumentFooters,
  drawPartyBlock,
  footerRightText,
  pdfLanguage
} from '../../src/lib/documents/document-layout';
import { runWithLanguage } from '../../src/i18n';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

function branding(overrides: Partial<DocumentBranding> = {}): DocumentBranding {
  return {
    issuer: {
      kind: 'AGENCY',
      name: 'Agence Éléonore',
      legalName: null,
      address: 'Cocody, Abidjan',
      phone: '+225 27 00 00',
      email: 'contact@agence.test',
      rccm: null,
      taxId: null
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null,
    ...overrides
  };
}

let texts: string[];
let fontNames: Map<string, string>;
beforeEach(() => {
  texts = [];
  fontNames = new Map();
  const original = PDFPage.prototype.drawText;
  jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text: string, options?: any) {
    texts.push(text);
    fontNames.set(text, options?.font?.name);
    return original.call(this, text, options);
  });
});
afterEach(() => jest.restoreAllMocks());

describe('drawDocumentHeader', () => {
  it('sort sans logo : identité, titre et sous-titre, et rend une ordonnée sous la page haute', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const y = await drawDocumentHeader(pdfDoc, page, branding(), { title: 'Relevé de compte', subtitle: 'Compte : X' });
    expect(texts).toEqual(expect.arrayContaining(['Agence Éléonore', 'Relevé de compte', 'Compte : X']));
    expect(texts.some(text => text.startsWith('Tél. +225'))).toBe(true);
    expect(y).toBeLessThan(842 - 40);
    expect(y).toBeGreaterThan(600);
  });

  it('ajoute la ligne copropriété et le numéro à droite du titre', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    await drawDocumentHeader(
      pdfDoc,
      page,
      branding({
        syndicate: {
          name: 'Résidence Les Palmiers',
          address: null,
          registrationNo: 'IM-1',
          cadastralReference: null,
          logo: null
        }
      }),
      { title: 'Facture', titleRight: 'N° 12' }
    );
    expect(texts).toContain('N° 12');
    expect(texts.some(text => text.startsWith('Copropriété : Résidence Les Palmiers'))).toBe(true);
    expect(texts.some(text => text.includes('Immatriculation IM-1'))).toBe(true);
  });

  it("n'écrit pas la ligne copropriété quand showSyndicate est faux", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    await drawDocumentHeader(
      pdfDoc,
      page,
      branding({
        syndicate: { name: 'Palmiers', address: null, registrationNo: null, cadastralReference: null, logo: null }
      }),
      { title: 'Reçu', showSyndicate: false }
    );
    expect(texts.some(text => text.startsWith('Copropriété'))).toBe(false);
  });

  it('remplace les caractères hors WinAnsi au lieu de lever', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    await expect(
      drawDocumentHeader(pdfDoc, page, branding(), { title: 'Titre ✓   1 000', subtitle: 'مرحبا' })
    ).resolves.toEqual(expect.any(Number));
  });

  it("n'intègre le logo qu'une fois par document (impression en plusieurs cases)", async () => {
    const pdfDoc = await PDFDocument.create();
    const embed = jest.spyOn(pdfDoc, 'embedPng');
    const withLogo = branding({ issuerLogo: { format: 'png', bytes: PNG } as any });
    for (let index = 0; index < 3; index += 1) {
      await drawDocumentHeader(pdfDoc, pdfDoc.addPage([595, 842]), withLogo, { title: 'Reçu' });
    }
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('suit la case et l’échelle demandées', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const full = await drawDocumentHeader(pdfDoc, page, branding(), { title: 'A' });
    const small = await drawDocumentHeader(pdfDoc, page, branding(), {
      title: 'A',
      scale: 0.4,
      frame: { x: 20, top: 800, width: 200 }
    });
    expect(800 - small).toBeLessThan(842 - 40 - full);
  });
});

describe('drawPartyBlock', () => {
  it('dessine deux colonnes et rend une ordonnée plus basse', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const y = await drawPartyBlock(pdfDoc, page, 700, [
      { title: 'Copropriétaire', lines: ['Awa Koné', 'Rue 12', null, '+225 01'] },
      { title: 'Lot', lines: ['A-12 (appartement)'] }
    ]);
    expect(texts).toEqual(
      expect.arrayContaining(['Copropriétaire', 'Awa Koné', 'Rue 12', 'Lot', 'A-12 (appartement)'])
    );
    expect(y).toBeLessThan(700 - 30);
  });

  it('passe à la ligne une adresse longue au lieu de la tronquer', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const address = 'Boulevard de la République, Immeuble Les Cocotiers, 3e étage porte 12, Plateau, Abidjan';
    await drawPartyBlock(pdfDoc, page, 700, [{ title: 'Facturé à', lines: ['Awa Koné', address] }]);
    const parts = texts.filter(text => text !== 'Facturé à' && text !== 'Awa Koné');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(' ')).toBe(address);
    expect(parts.some(part => part.endsWith('...'))).toBe(false);
  });

  it("met en gras le nom seulement ; sans nom, l'adresse reste en gris normal", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    await drawPartyBlock(pdfDoc, page, 700, [
      { title: 'A', lines: ['Awa Koné', 'Rue 12'] },
      { title: 'B', lines: ['', 'Rue 99'] }
    ]);
    expect(fontNames.get('Awa Koné')).toBe('Helvetica-Bold');
    expect(fontNames.get('Rue 12')).toBe('Helvetica');
    expect(fontNames.get('Rue 99')).toBe('Helvetica');
  });
});

describe('drawDocumentFooters', () => {
  it('numérote toutes les pages avec émetteur et référence', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);
    pdfDoc.addPage([595, 842]);
    await drawDocumentFooters(pdfDoc, { issuerName: 'Agence Éléonore', reference: 'FAC-001' });
    expect(texts.filter(text => text === 'Agence Éléonore')).toHaveLength(3);
    expect(texts).toEqual(
      expect.arrayContaining(['Réf. FAC-001 - Page 1/3', 'Réf. FAC-001 - Page 2/3', 'Réf. FAC-001 - Page 3/3'])
    );
  });

  it('omet la référence quand elle est vide', () => {
    expect(footerRightText(null, 1, 2)).toBe('Page 1/2');
    expect(footerRightText('  ', 2, 2)).toBe('Page 2/2');
  });

  it("garde le français pour un document demandé en arabe (Helvetica n'écrit pas l'arabe)", () => {
    runWithLanguage('ar', () => {
      expect(pdfLanguage()).toBe('fr');
      expect(footerRightText('R1', 1, 1)).not.toContain('?');
    });
  });
});
