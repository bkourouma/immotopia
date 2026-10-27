import { promises as fs } from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';

const execFileMock = jest.fn();
jest.mock('child_process', () => ({ execFile: (...args: unknown[]) => execFileMock(...args) }));

const envMock: { DOCX_PDF_CONVERTER?: string } = {};
jest.mock('../../src/config/env', () => ({ env: envMock }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { convertDocxToPdf, isDocxPdfConversionAvailable } from '../../src/lib/pdf-convert';

const PDF = Buffer.from('%PDF-1.7 fake');

/** DOCX minimal valide (la conversion neutralise l'archive avant soffice : un faux fichier est refusé). */
function minimalDocx(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', '<w:document><w:body/></w:document>');
  return zip.generate({ type: 'nodebuffer' });
}

/** Simule soffice : écrit document.pdf dans --outdir. */
function succeedWithPdf() {
  execFileMock.mockImplementation((_bin: string, args: string[], _opts: unknown, cb: (e: Error | null) => void) => {
    const outdir = args[args.indexOf('--outdir') + 1];
    fs.writeFile(path.join(outdir, 'document.pdf'), PDF).then(() => cb(null));
  });
}

describe('pdf-convert', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    envMock.DOCX_PDF_CONVERTER = 'libreoffice';
  });

  it('est indisponible par défaut', () => {
    delete envMock.DOCX_PDF_CONVERTER;
    expect(isDocxPdfConversionAvailable()).toBe(false);
    envMock.DOCX_PDF_CONVERTER = 'disabled';
    expect(isDocxPdfConversionAvailable()).toBe(false);
    envMock.DOCX_PDF_CONVERTER = 'libreoffice';
    expect(isDocxPdfConversionAvailable()).toBe(true);
  });

  it('lève une 503 claire quand la conversion est désactivée, sans lancer soffice', async () => {
    envMock.DOCX_PDF_CONVERTER = 'disabled';
    await expect(convertDocxToPdf(Buffer.from('x'))).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('PDF')
    });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("appelle soffice avec un tableau d'arguments, un profil isolé et un délai de 60 s, puis nettoie", async () => {
    succeedWithPdf();
    const out = await convertDocxToPdf(minimalDocx());
    expect(out.equals(PDF)).toBe(true);

    const [bin, args, opts] = execFileMock.mock.calls[0];
    expect(String(bin)).toMatch(/^soffice(\.exe)?$/);
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual(expect.arrayContaining(['--headless', '--convert-to', 'pdf', '--outdir']));
    expect(args.some((a: string) => a.startsWith('-env:UserInstallation=file:///'))).toBe(true);
    expect(opts.timeout).toBe(60_000);

    const outdir = args[args.indexOf('--outdir') + 1];
    await expect(fs.access(outdir)).rejects.toBeTruthy();
  });

  it('une conversion en échec donne une 503 et nettoie le dossier temporaire', async () => {
    let outdir = '';
    execFileMock.mockImplementation((_b: string, args: string[], _o: unknown, cb: (e: Error) => void) => {
      outdir = args[args.indexOf('--outdir') + 1];
      cb(new Error('boom /secret/path'));
    });
    const err = await convertDocxToPdf(minimalDocx()).catch(e => e);
    expect(err.statusCode).toBe(503);
    expect(err.message).not.toContain('/secret/path');
    await expect(fs.access(outdir)).rejects.toBeTruthy();
  });

  it('signale une sortie absente', async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: (e: Error | null) => void) => cb(null));
    await expect(convertDocxToPdf(minimalDocx())).rejects.toMatchObject({ statusCode: 500 });
  });

  it('refuse un tampon vide', async () => {
    await expect(convertDocxToPdf(Buffer.alloc(0))).rejects.toMatchObject({ statusCode: 400 });
  });
});
