import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { t, type Language } from '../../i18n';
import { sha256Hex } from './evidence';

/**
 * Scellement du PDF signé (spec 043, SG-R7). À partir du PDF source figé :
 * 1. une page « Signatures » appose les signatures visibles (dessinées ou
 *    saisies) avec nom, rôle et date ;
 * 2. une page « Certificat de signature » récapitule demande, signataires,
 *    canal, date, IP tronquée, empreintes (document source, consentement,
 *    piste d'audit) ;
 * 3. le SHA-256 du PDF final est calculé et rendu (il est conservé dans
 *    `SignatureRequest.signedHash`, il ne peut pas figurer dans le fichier
 *    qu'il décrit).
 *
 * Polices standard (WinAnsi) : le français et l'anglais sont rendus
 * correctement ; l'arabe n'a pas de police embarquée dans cette version, le
 * certificat d'une demande `ar` est donc produit en français. Un caractère hors
 * WinAnsi (nom en alphabet non latin) est remplacé par `?` plutôt que de
 * faire échouer le scellement.
 */

export type SealSigner = {
  fullName: string;
  role: string;
  channel: string;
  signedAt: Date;
  ipTruncated: string | null;
  mode: 'TYPED' | 'DRAWN';
  typed: string | null;
  png: Buffer | null;
  consentTextHash: string | null;
};

export type SealInput = {
  sourcePdf: Buffer;
  title: string;
  requestId: string;
  language: Language;
  sourceHash: string;
  /** Empreinte de la piste d'audit au moment du scellement (dernier événement). */
  chainHead: string | null;
  signers: SealSigner[];
  sealedAt: Date;
};

export type SealResult = { pdf: Buffer; sha256: string; pageCount: number };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.75, 0.75, 0.8);

function certificateLanguage(language: Language): Language {
  return language === 'en' ? 'en' : 'fr';
}

function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** Remplace les caractères que la police ne sait pas écrire. */
export function safeText(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    try {
      font.widthOfTextAtSize(ch, 1);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

class Cursor {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage(A4);
      this.y = A4[1] - MARGIN;
    }
  }

  heading(text: string, size = 18): void {
    this.ensure(size + 10);
    this.page.drawText(safeText(this.bold, text), { x: MARGIN, y: this.y - size, size, font: this.bold, color: INK });
    this.y -= size + 10;
  }

  rule(): void {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.6,
      color: RULE
    });
    this.y -= 10;
  }

  /** Paragraphe retourné à la ligne ; `label` en gras devant la valeur. */
  field(label: string, value: string, size = 9.5): void {
    const maxWidth = A4[0] - 2 * MARGIN;
    const labelText = `${safeText(this.bold, label)} `;
    const words = safeText(this.regular, value).split(' ');
    const lines: string[] = [];
    let current = '';
    const labelWidth = this.bold.widthOfTextAtSize(labelText, size);
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = this.regular.widthOfTextAtSize(candidate, size) + (lines.length === 0 ? labelWidth : 0);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
    this.ensure(lines.length * (size + 3) + 2);
    lines.forEach((line, index) => {
      let x = MARGIN;
      if (index === 0) {
        this.page.drawText(labelText, { x, y: this.y - size, size, font: this.bold, color: MUTED });
        x += labelWidth;
      }
      this.page.drawText(line, { x, y: this.y - size, size, font: this.regular, color: INK });
      this.y -= size + 3;
    });
    this.y -= 2;
  }

  gap(height: number): void {
    this.y -= height;
  }

  reserve(height: number): void {
    this.ensure(height);
  }
}

async function drawSignaturesPage(
  doc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont; script: PDFFont },
  input: SealInput,
  lang: Language
): Promise<void> {
  const cursor = new Cursor(doc, fonts.regular, fonts.bold);
  cursor.heading(t('Signatures', undefined, lang));
  cursor.field(t('Document :', undefined, lang), input.title);
  cursor.rule();
  for (const signer of input.signers) {
    cursor.reserve(110);
    const top = cursor.y;
    cursor.page.drawRectangle({
      x: MARGIN,
      y: top - 96,
      width: A4[0] - 2 * MARGIN,
      height: 96,
      borderColor: RULE,
      borderWidth: 0.8
    });
    cursor.page.drawText(safeText(fonts.bold, signer.fullName), {
      x: MARGIN + 10,
      y: top - 18,
      size: 11,
      font: fonts.bold,
      color: INK
    });
    cursor.page.drawText(safeText(fonts.regular, `${signer.role} — ${formatUtc(signer.signedAt)}`), {
      x: MARGIN + 10,
      y: top - 32,
      size: 9,
      font: fonts.regular,
      color: MUTED
    });
    // Un dessin illisible ne bloque jamais le scellement : repli sur le nom saisi.
    const image = signer.mode === 'DRAWN' && signer.png ? await doc.embedPng(signer.png).catch(() => null) : null;
    if (image) {
      const scaled = image.scaleToFit(220, 54);
      cursor.page.drawImage(image, { x: MARGIN + 10, y: top - 92 + (54 - scaled.height) / 2, ...scaled });
    } else {
      cursor.page.drawText(safeText(fonts.script, signer.typed ?? signer.fullName), {
        x: MARGIN + 10,
        y: top - 76,
        size: 24,
        font: fonts.script,
        color: rgb(0.05, 0.15, 0.45)
      });
    }
    cursor.y = top - 108;
  }
}

function drawCertificate(
  doc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  input: SealInput,
  lang: Language
): void {
  const cursor = new Cursor(doc, fonts.regular, fonts.bold);
  cursor.heading(t('Certificat de signature', undefined, lang));
  cursor.field(t('Document :', undefined, lang), input.title);
  cursor.field(t('Référence de la demande :', undefined, lang), input.requestId);
  cursor.field(t('Scellé le :', undefined, lang), formatUtc(input.sealedAt));
  cursor.field(t('Empreinte SHA-256 du document source :', undefined, lang), input.sourceHash);
  if (input.chainHead) {
    cursor.field(t('Empreinte de la piste d’audit :', undefined, lang), input.chainHead);
  }
  cursor.gap(4);
  cursor.rule();
  cursor.field(
    '',
    t(
      'Signature électronique simple : lien personnel à jeton, code à usage unique (hors signature sur place), consentement explicite, horodatage, adresse IP tronquée et empreinte du document.',
      undefined,
      lang
    ),
    9
  );
  cursor.rule();
  input.signers.forEach((signer, index) => {
    cursor.heading(`${index + 1}. ${signer.fullName}`, 12);
    cursor.field(t('Rôle :', undefined, lang), signer.role);
    cursor.field(t('Signé le :', undefined, lang), formatUtc(signer.signedAt));
    cursor.field(t('Canal :', undefined, lang), signer.channel);
    cursor.field(t('Adresse IP (tronquée) :', undefined, lang), signer.ipTruncated ?? '-');
    cursor.field(
      t('Mode de signature :', undefined, lang),
      signer.mode === 'DRAWN' ? t('Dessinée', undefined, lang) : t('Saisie', undefined, lang)
    );
    cursor.field(t('Empreinte du consentement :', undefined, lang), signer.consentTextHash ?? '-');
    cursor.gap(6);
  });
  cursor.rule();
  cursor.field(
    '',
    t(
      'L’empreinte SHA-256 du présent fichier scellé est conservée par ImmoTopia et affichée dans la fiche de la demande.',
      undefined,
      lang
    ),
    9
  );
}

/** Scelle le PDF source : pages « Signatures » et « Certificat » ajoutées, SHA-256 final calculé. */
export async function sealSignedPdf(input: SealInput): Promise<SealResult> {
  const doc = await PDFDocument.load(input.sourcePdf, { ignoreEncryption: false });
  doc.setProducer('ImmoTopia');
  doc.setModificationDate(input.sealedAt);
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    script: await doc.embedFont(StandardFonts.TimesRomanItalic)
  };
  const lang = certificateLanguage(input.language);
  await drawSignaturesPage(doc, fonts, input, lang);
  drawCertificate(doc, fonts, input, lang);
  const bytes = await doc.save({ useObjectStreams: false });
  const pdf = Buffer.from(bytes);
  return { pdf, sha256: sha256Hex(pdf), pageCount: doc.getPageCount() };
}
