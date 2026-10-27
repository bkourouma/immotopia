/**
 * PDF scellé : texte arabe et lettres hors WinAnsi (audit 2026-10-19, lot T).
 * Avant : Helvetica seule, tout caractère non latin sortait en `?`. Désormais une
 * police Unicode embarquée en sous-ensemble (Noto Sans Arabic) prend le relais, le
 * texte latin ordinaire restant en Helvetica.
 */
import * as fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { sealSignedPdf, type SealSigner } from '../../src/lib/signature/seal';
import { TextFace, embedUnicodeFonts, loadUnicodeFontBytes, visualRuns } from '../../src/lib/signature/seal-text';

const ARABIC_NAME = 'محمد الأمين';
const ARABIC_TITLE = 'عقد إيجار - Villa 12';

async function sourcePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

function signer(fullName: string, overrides: Partial<SealSigner> = {}): SealSigner {
  return {
    fullName,
    role: 'LOCATAIRE',
    channel: 'EMAIL',
    signedAt: new Date('2026-03-04T09:30:00Z'),
    ipTruncated: '41.202.0.0',
    mode: 'TYPED',
    typed: fullName,
    png: null,
    consentTextHash: 'c'.repeat(64),
    ...overrides
  };
}

async function seal(title: string, signers: SealSigner[]) {
  return sealSignedPdf({
    sourcePdf: await sourcePdf(),
    title,
    requestId: 'req-arabe-1',
    language: 'fr',
    sourceHash: 'a'.repeat(64),
    chainHead: 'b'.repeat(64),
    signers,
    sealedAt: new Date('2026-03-04T10:00:00Z')
  });
}

type Inspection = {
  /** Points de code déclarés par les tables ToUnicode des polices embarquées. */
  unicode: Set<number>;
  /** Textes écrits en police standard (octets WinAnsi des opérateurs Tj). */
  standard: string[];
  /** Numéros de glyphes écrits en police Unicode (opérateurs Tj). */
  glyphIds: number[];
  /** Programmes de police TrueType embarqués. */
  fontPrograms: Buffer[];
};

/** Décompose le PDF : tables ToUnicode, programmes de police, et texte écrit par police. */
async function inspect(pdf: Buffer): Promise<Inspection> {
  const doc = await PDFDocument.load(pdf);
  const out: Inspection = { unicode: new Set(), standard: [], glyphIds: [], fontPrograms: [] };
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const bytes = Buffer.from(decodePDFRawStream(object).decode());
    if (
      bytes.length > 4 &&
      (bytes.readUInt32BE(0) === 0x00010000 || bytes.subarray(0, 4).toString('latin1') === 'true')
    ) {
      out.fontPrograms.push(bytes);
      continue;
    }
    const text = bytes.toString('latin1');
    for (const block of text.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]*)>/g)) {
      for (let i = 0; i + 4 <= block[2].length; i += 4) out.unicode.add(parseInt(block[2].slice(i, i + 4), 16));
    }
  }
  for (const page of doc.getPages()) {
    // Police de chaque ressource : « Helvetica… », « Times… » (standard) ou une police Unicode embarquée.
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    const kinds = new Map<string, boolean>();
    for (const [key] of fontDict?.entries() ?? []) {
      const font = fontDict?.lookupMaybe(key, PDFDict);
      const base = font?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText() ?? '';
      kinds.set(key.decodeText(), /^(Helvetica|Times)/.test(base));
    }
    const contents = page.node.Contents();
    const list =
      contents instanceof PDFArray ? contents.asArray().map((_, i) => contents.lookup(i, PDFRawStream)) : [contents];
    for (const stream of list) {
      if (!(stream instanceof PDFRawStream)) continue;
      const text = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      let isStandard = true;
      for (const token of text.matchAll(/\/(\S+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g)) {
        if (token[1] !== undefined) {
          isStandard = kinds.get(token[1]) ?? true;
        } else if (isStandard) {
          out.standard.push(Buffer.from(token[2], 'hex').toString('latin1'));
        } else {
          for (let i = 0; i + 4 <= token[2].length; i += 4) out.glyphIds.push(parseInt(token[2].slice(i, i + 4), 16));
        }
      }
    }
  }
  return out;
}

function outline(glyph: unknown): number {
  return (glyph as { path: { commands: unknown[] } }).path.commands.length;
}

const codes = (text: string): number[] => Array.from(text, ch => ch.codePointAt(0) as number);

describe('PDF scellé : police Unicode', () => {
  it('rend un nom et un titre arabes, un nom accentué et un texte mixte sans « ? »', async () => {
    const result = await seal(ARABIC_TITLE, [
      signer(ARABIC_NAME),
      signer('Zoë Koné', { role: 'BAILLEUR' }),
      signer('Ibrahim إبراهيم (Abidjan)', { mode: 'DRAWN', typed: null })
    ]);
    expect(result.pageCount).toBe(3);
    const found = await inspect(result.pdf);

    // Chaque lettre arabe du nom et du titre est déclarée dans la table ToUnicode.
    for (const code of [...codes('محمدالأمين'), ...codes('عقدإيجار'), ...codes('إبراهيم')]) {
      expect(found.unicode.has(code)).toBe(true);
    }
    // Le latin du texte mixte (Villa, Ibrahim, parenthèses) passe par la même police.
    for (const code of codes('VillaIbrahim()')) expect(found.unicode.has(code)).toBe(true);
    // Aucun point d'interrogation substitué, ni dans la police Unicode ni en police standard.
    expect(found.unicode.has(0x3f)).toBe(false);
    expect(found.standard.filter(text => text.includes('?'))).toEqual([]);
    expect(found.standard.join(' ')).toContain('Zoë Koné');
    expect(found.glyphIds.length).toBeGreaterThan(20);
  });

  it('garde le texte latin ordinaire en police standard, sans octet de police en plus', async () => {
    const latin = await seal('Bail Koné — Résidence Cocody', [signer('Zoë Koné'), signer('Aïcha N’Guessan')]);
    const found = await inspect(latin.pdf);
    expect(found.fontPrograms).toHaveLength(0);
    expect(found.glyphIds).toHaveLength(0);
    expect(found.standard.join(' ')).toContain('Zoë Koné');
    expect(latin.pdf.includes(Buffer.from('NotoSansArabic'))).toBe(false);
  });

  it('embarque un sous-ensemble de la police, de quelques dizaines de Kio au plus, aux glyphes tous dessinés', async () => {
    const latin = await seal('Bail', [signer('Zoë Koné')]);
    const arabic = await seal(ARABIC_TITLE, [signer(ARABIC_NAME), signer('Zoë Koné')]);
    const added = arabic.pdf.length - latin.pdf.length;
    // Police complète : environ 195 Kio par graisse ; le sous-ensemble reste sous 60 Kio.
    expect(added).toBeLessThan(60 * 1024);

    const found = await inspect(arabic.pdf);
    expect(found.fontPrograms.length).toBeGreaterThanOrEqual(1);
    // Chaque sous-ensemble est un TrueType lisible dont tous les glyphes ont un contour,
    // hormis .notdef (0) et l'espace.
    for (const program of found.fontPrograms) {
      const font = fontkit.create(new Uint8Array(program));
      expect(font.numGlyphs).toBeGreaterThan(8);
      const empty: number[] = [];
      for (let id = 1; id < font.numGlyphs; id++) {
        if (outline(font.getGlyph(id)) === 0) empty.push(id);
      }
      expect(empty.length).toBeLessThanOrEqual(1);
    }
    expect(found.unicode.has(0x20)).toBe(true);
  });

  it('écrit un glyphe par position fontkit, marques de largeur nulle comprises', async () => {
    const { pdf } = await seal('Bail', [signer('الأمين')]);
    const found = await inspect(pdf);
    // « الأمين » : au moins un glyphe de marque (largeur nulle) décalé verticalement ou horizontalement.
    const kit = fontkit.create(new Uint8Array(await loadUnicodeFontBytes('regular')));
    const positions = kit.layout('الأمين').positions;
    expect(
      positions.some(position => position.xAdvance === 0 && (position.xOffset !== 0 || position.yOffset !== 0))
    ).toBe(true);
    expect(found.glyphIds.length).toBeGreaterThanOrEqual(positions.length);
  });

  it('range les segments dans l’ordre visuel (page gauche-à-droite) et miroite les parenthèses', () => {
    expect(visualRuns('Ibrahim إبراهيم')).toEqual(['Ibrahim ', 'إبراهيم']);
    expect(visualRuns('إبراهيم Ibrahim')).toEqual(['إبراهيم', ' Ibrahim']);
    // Un numéro de liste reste à gauche d'un nom arabe.
    expect(visualRuns('1. محمد الأمين')).toEqual(['1. ', 'محمد الأمين']);
    // Arabe pur : un seul segment, dans l'ordre logique (fontkit inverse les glyphes).
    expect(visualRuns(ARABIC_NAME)).toEqual([ARABIC_NAME]);
    // Parenthèses prises dans un segment droite-à-gauche : « ( » devient « ) ».
    expect(visualRuns('محمد (الأمين)')).toEqual(['محمد )الأمين(']);
  });

  it('remplace par « ? » seulement les caractères absents des deux polices, ignore les contrôles de sens', async () => {
    const doc = await PDFDocument.create();
    const standard = await doc.embedFont(StandardFonts.Helvetica);
    const unicode = await embedUnicodeFonts(doc);
    expect(unicode).not.toBeNull();
    const face = new TextFace(standard, unicode?.regular ?? null);
    expect(face.clean('Nom 😀 محمد')).toBe('Nom ? محمد');
    expect(face.clean('محمد‏\n الأمين')).toBe('محمد  الأمين');
    // Texte WinAnsi : inchangé, ligne unique.
    expect(face.clean('Résidence\tCocody')).toBe('Résidence Cocody');
    // Sans police Unicode : ancien comportement.
    expect(new TextFace(standard, null).clean('Koné محمد')).toBe('Koné ????');
  });

  it('lit la police une seule fois (mise en cache mémoire)', async () => {
    const first = loadUnicodeFontBytes('bold');
    expect(loadUnicodeFontBytes('bold')).toBe(first);
    const bytes = await first;
    expect(bytes.length).toBeGreaterThan(100_000);
    const font = fontkit.create(new Uint8Array(bytes));
    // Mise en forme arabe : sens droite-à-gauche, formes contextuelles (plus de glyphes que de lettres isolées).
    const run = font.layout('محمد');
    expect(run.direction).toBe('rtl');
    expect(run.glyphs.map(glyph => glyph.codePoints[0])).toEqual([0x62f, 0x645, 0x62d, 0x645]);
  });
});
