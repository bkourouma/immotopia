import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { t, type Language } from '../../i18n';
import { sha256Hex } from './evidence';
import { signerChannelLabel, signerRoleLabel } from './labels';
import { embedUnicodeFonts, isEncodable, safeText, TextFace } from './seal-text';

export { safeText };

/**
 * Scellement du PDF signé (spec 044, SG-R7). À partir du PDF source figé :
 * 1. une page « Signatures » appose les signatures visibles (dessinées ou
 *    saisies) avec nom, rôle et date ;
 * 2. une page « Certificat de signature » récapitule demande, signataires,
 *    canal, date, IP tronquée, empreintes (document source, consentement,
 *    piste d'audit) ;
 * 3. le SHA-256 du PDF final est calculé et rendu (il est conservé dans
 *    `SignatureRequest.signedHash`, il ne peut pas figurer dans le fichier
 *    qu'il décrit).
 *
 * Polices : le texte latin (WinAnsi) reste en Helvetica / Times, comme avant.
 * Dès qu'un texte saisi (nom, titre…) sort de WinAnsi (arabe, lettres rares),
 * une police Unicode est embarquée en sous-ensemble et ce texte est mis en forme
 * (lettres liées, sens droite-à-gauche) : voir `seal-text.ts`. Les libellés du
 * certificat restent en français ou en anglais (une demande `ar` produit un
 * certificat français). Un caractère absent des deux polices est remplacé par
 * `?` plutôt que de faire échouer le scellement ; si la police Unicode est
 * illisible, le repli est l'ancien comportement (`?` pour le non-latin).
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

class Cursor {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private regular: TextFace,
    private bold: TextFace
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
    this.bold.draw(this.page, text, { x: MARGIN, y: this.y - size, size, color: INK });
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
    const labelText = `${this.bold.clean(label)} `;
    const words = this.regular.clean(value).split(' ');
    const lines: string[] = [];
    let current = '';
    const labelWidth = this.bold.width(labelText, size);
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = this.regular.width(candidate, size) + (lines.length === 0 ? labelWidth : 0);
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
        this.bold.draw(this.page, labelText, { x, y: this.y - size, size, color: MUTED });
        x += labelWidth;
      }
      this.regular.draw(this.page, line, { x, y: this.y - size, size, color: INK });
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
  fonts: { regular: TextFace; bold: TextFace; script: TextFace },
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
    fonts.bold.draw(cursor.page, signer.fullName, { x: MARGIN + 10, y: top - 18, size: 11, color: INK });
    fonts.regular.draw(cursor.page, `${signerRoleLabel(signer.role, lang)} — ${formatUtc(signer.signedAt)}`, {
      x: MARGIN + 10,
      y: top - 32,
      size: 9,
      color: MUTED
    });
    // Un dessin illisible ne bloque jamais le scellement : repli sur le nom saisi.
    const image = signer.mode === 'DRAWN' && signer.png ? await doc.embedPng(signer.png).catch(() => null) : null;
    if (image) {
      const scaled = image.scaleToFit(220, 54);
      cursor.page.drawImage(image, { x: MARGIN + 10, y: top - 92 + (54 - scaled.height) / 2, ...scaled });
    } else {
      fonts.script.draw(cursor.page, signer.typed ?? signer.fullName, {
        x: MARGIN + 10,
        y: top - 76,
        size: 24,
        color: rgb(0.05, 0.15, 0.45)
      });
    }
    cursor.y = top - 108;
  }
}

function drawCertificate(
  doc: PDFDocument,
  fonts: { regular: TextFace; bold: TextFace },
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
    cursor.field(t('Rôle :', undefined, lang), signerRoleLabel(signer.role, lang));
    cursor.field(t('Signé le :', undefined, lang), formatUtc(signer.signedAt));
    cursor.field(t('Canal :', undefined, lang), signerChannelLabel(signer.channel, lang));
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

/** Vrai si un texte venu de l'utilisateur (titre, signataires) ne tient pas en WinAnsi. */
function needsUnicodeFont(standard: PDFFont, input: SealInput): boolean {
  const texts = [input.title, input.requestId];
  for (const signer of input.signers) {
    texts.push(signer.fullName, signer.role, signer.channel, signer.typed ?? '', signer.ipTruncated ?? '');
  }
  return texts.some(text => !isEncodable(standard, text.replace(/[\r\n\t]+/g, ' ')));
}

/** Scelle le PDF source : pages « Signatures » et « Certificat » ajoutées, SHA-256 final calculé. */
export async function sealSignedPdf(input: SealInput): Promise<SealResult> {
  const doc = await PDFDocument.load(input.sourcePdf, { ignoreEncryption: false });
  doc.setProducer('ImmoTopia');
  doc.setModificationDate(input.sealedAt);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  // La police Unicode n'est embarquée que si un texte saisi sort de WinAnsi :
  // un PDF 100 % latin reste identique à avant (aucun octet de police en plus).
  const unicode = needsUnicodeFont(helvetica, input) ? await embedUnicodeFonts(doc) : null;
  const fonts = {
    regular: new TextFace(helvetica, unicode?.regular ?? null),
    bold: new TextFace(helveticaBold, unicode?.bold ?? null),
    script: new TextFace(timesItalic, unicode?.regular ?? null)
  };
  const lang = certificateLanguage(input.language);
  await drawSignaturesPage(doc, fonts, input, lang);
  drawCertificate(doc, fonts, input, lang);
  const bytes = await doc.save({ useObjectStreams: false });
  const pdf = Buffer.from(bytes);
  return { pdf, sha256: sha256Hex(pdf), pageCount: doc.getPageCount() };
}
