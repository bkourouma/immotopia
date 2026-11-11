/**
 * Contre-audit de la PR #205 : les expressions qui retirent ou repèrent des
 * balises dans un modèle importé (DOCX, gabarit HTML d'agence) restent
 * linéaires. `<[^>]+>` ou `<p\b[^>]*>` repartaient de chaque `<` jusqu'à la fin
 * du texte : 80 000 `<` prenaient 4 s, 5 Mo des heures, API figée. Chaque cas
 * ci-dessous prendrait plusieurs minutes avec l'ancienne forme.
 */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import PizZip from 'pizzip';

jest.mock('../../src/utils/database', () => ({ prisma: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

import { extractPlaceholders } from '../../src/services/document-template-service';
import { dropEmptyVariableParagraphs } from '../../src/lib/syndics/notifications';
import { stripEmptyPaymentParagraph } from '../../src/lib/syndics/charge-call-payment-url';
import { injectDocxImages } from '../../src/lib/documents/docx-branding';

jest.setTimeout(30_000);

const MB = 1024 * 1024;
/** Large marge pour une machine chargée : l'ancienne forme prenait des minutes à ces tailles. */
const MAX_MS = 2000;

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

describe('extractPlaceholders (modèle importé)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xml-regex-'));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function docxWith(documentXml: string): Promise<string> {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('word/document.xml', documentXml);
    const file = path.join(dir, `m-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`);
    await fs.writeFile(file, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
    return file;
  }

  it('lit toujours les champs coupés par des balises', async () => {
    const file = await docxWith('<w:p><w:r><w:t>{{NOM_</w:t></w:r><w:r><w:t>LOCATAIRE}} {{LOYER}}</w:t></w:r></w:p>');
    // Le découpage insère un espace : seul {{LOYER}} est entier, comme avant.
    expect(await extractPlaceholders(file)).toEqual(['LOYER']);
  });

  it('4 Mo de `<` sans `>` : traités en temps linéaire', async () => {
    const file = await docxWith('<'.repeat(4 * MB) + '<w:t>{{NOM}}</w:t>');
    const start = Date.now();
    expect(await extractPlaceholders(file)).toEqual(['NOM']);
    expect(Date.now() - start).toBeLessThan(MAX_MS);
  });
});

describe('gabarits HTML des notifications de copropriété', () => {
  it('dropEmptyVariableParagraphs : comportement gardé, 1 Mo de `<p` sans `>` en temps linéaire', () => {
    expect(
      dropEmptyVariableParagraphs('<p class="x">Lien : {{meetingLink}}</p>\n<p>Reste</p>', {}, ['meetingLink'])
    ).toBe('<p>Reste</p>');
    const { ms } = timed(() => dropEmptyVariableParagraphs('<p '.repeat(MB / 3), {}, ['meetingLink']));
    expect(ms).toBeLessThan(MAX_MS);
  });

  it('stripEmptyPaymentParagraph : comportement gardé, 1 Mo de `<p` sans `>` en temps linéaire', () => {
    const vars = { paymentBlock: '' } as Parameters<typeof stripEmptyPaymentParagraph>[1];
    expect(stripEmptyPaymentParagraph('<p>A</p><p style="x"> </p>', vars, '{{paymentBlock}}')).toBe('<p>A</p>');
    const { ms } = timed(() => stripEmptyPaymentParagraph('<p '.repeat(MB / 3), vars, '{{paymentBlock}}'));
    expect(ms).toBeLessThan(MAX_MS);
  });
});

describe('injectDocxImages (modèle d’agence piégé)', () => {
  const DOCUMENT = '<w:document><w:body><w:p><w:r><w:t>@@LOGO_EMETTEUR@@</w:t></w:r></w:p></w:body></w:document>';

  it('[Content_Types].xml fait de `<Default` et `<Types` sans `>` : temps linéaire', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Default '.repeat(100_000) + '<Types '.repeat(100_000) + '<Types>');
    zip.file('word/document.xml', DOCUMENT);
    const { ms } = timed(() => injectDocxImages(zip, { LOGO_EMETTEUR: { bytes: PNG_1X1, format: 'png' } }));
    expect(ms).toBeLessThan(MAX_MS);
    expect(zip.file('[Content_Types].xml')!.asText()).toContain('<Types><Default Extension="png"');
  });

  it('relations auto-fermantes avec une longue suite d’espaces : temps linéaire, attributs rognés', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types></Types>');
    zip.file('word/document.xml', DOCUMENT);
    zip.file('word/_rels/document.xml.rels', `<Relationships xmlns="r"${' '.repeat(200_000)}a ${' '.repeat(10)}/>`);
    const { ms } = timed(() => injectDocxImages(zip, { LOGO_EMETTEUR: { bytes: PNG_1X1, format: 'png' } }));
    expect(ms).toBeLessThan(MAX_MS);
    const rels = zip.file('word/_rels/document.xml.rels')!.asText();
    expect(rels).toMatch(/ a><Relationship Id="rIdImmoLogo1"[^>]*\/><\/Relationships>$/);
  });
});
