import { PDFDocument, StandardFonts, rgb, type PDFPage, type RGB } from 'pdf-lib';
import { t } from '../../i18n';
import { embedUnicodeFonts, TextFace } from '../signature/seal-text';
import type { DocumentBranding } from './document-branding';

export type ArabicFaces = { regular: TextFace; bold: TextFace };

const facesByDocument = new WeakMap<PDFDocument, Promise<ArabicFaces>>();

export async function arabicFaces(pdf: PDFDocument): Promise<ArabicFaces> {
  let faces = facesByDocument.get(pdf);
  if (!faces) {
    faces = (async () => {
      const unicode = await embedUnicodeFonts(pdf);
      if (!unicode) throw new Error('Police arabe indisponible pour le PDF');
      const standard = await pdf.embedFont(StandardFonts.Helvetica);
      return {
        regular: new TextFace(standard, unicode.regular, 'rtl'),
        bold: new TextFace(standard, unicode.bold, 'rtl')
      };
    })();
    facesByDocument.set(pdf, faces);
    faces.catch(() => facesByDocument.delete(pdf));
  }
  return faces;
}

/** Texte Unicode lié et bidirectionnel, mesuré avant placement. */
export function drawArabicText(
  page: PDFPage,
  face: TextFace,
  value: string,
  options: { x: number; y: number; size: number; maxWidth: number; align?: 'start' | 'end'; color?: RGB }
) {
  const chars = Array.from(value.replace(/[\r\n\t]+/g, ' ')).slice(0, 300);
  let shown = chars.join('');
  if (face.width(shown, options.size) > options.maxWidth) {
    while (chars.length && face.width(`${chars.join('')}…`, options.size) > options.maxWidth) chars.pop();
    shown = `${chars.join('')}…`;
  }
  const x = options.align === 'start' ? options.x : options.x - face.width(shown, options.size);
  face.draw(page, shown, { x, y: options.y, size: options.size, color: options.color ?? rgb(0.12, 0.15, 0.2) });
}

/** Cellule numérique LTR : réduit la taille au besoin, sans jamais supprimer de chiffres ni le signe. */
export function drawArabicNumber(
  page: PDFPage,
  face: TextFace,
  value: string,
  options: { x: number; y: number; size: number; maxWidth: number; align?: 'start' | 'end'; color?: RGB }
): void {
  face = face.withDirection('ltr');
  const full = value.replace(/[\r\n\t\u00a0\u202f]+/g, ' ');
  const naturalWidth = face.width(full, options.size);
  const size =
    naturalWidth > options.maxWidth && naturalWidth > 0
      ? (options.size * options.maxWidth) / naturalWidth
      : options.size;
  const x = options.align === 'start' ? options.x : options.x - face.width(full, size);
  face.draw(page, full, { x, y: options.y, size, color: options.color ?? rgb(0.12, 0.15, 0.2) });
}

/** Coupe aux espaces sans perdre les libellés longs ; un mot trop large est scindé. */
export function wrapArabicText(face: TextFace, value: string, size: number, maxWidth: number): string[] {
  const words = value
    .replace(/[\r\n\t]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (face.width(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    let segment = '';
    for (const char of word) {
      if (segment && face.width(`${segment}${char}`, size) > maxWidth) {
        lines.push(segment);
        segment = '';
      }
      segment += char;
    }
    current = segment;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export function drawArabicHeader(
  page: PDFPage,
  faces: ArabicFaces,
  branding: DocumentBranding,
  title: string,
  subtitle?: string,
  options: { titleRight?: string; showSyndicate?: boolean; leftReserve?: number; bandBottom?: number } = {}
) {
  const { width, height } = page.getSize();
  const right = width - 40;
  const identityWidth = width - 80 - (options.leftReserve ?? 0);
  let y = height - 46;
  drawArabicText(page, faces.bold, branding.issuer.name || t('Agence', undefined, 'ar'), {
    x: right,
    y,
    size: 13,
    maxWidth: identityWidth
  });
  y -= 22;
  const issuer = branding.issuer;
  const lines = [
    issuer.legalName !== issuer.name ? issuer.legalName : null,
    issuer.address,
    [issuer.phone, issuer.email].filter(Boolean).join(' - '),
    [issuer.rccm ? `RCCM ${issuer.rccm}` : null, issuer.taxId ? `NCC ${issuer.taxId}` : null]
      .filter(Boolean)
      .join(' - ')
  ].filter((line): line is string => Boolean(line));
  for (const line of lines.slice(0, 4)) {
    drawArabicText(page, faces.regular, line, { x: right, y, size: 8, maxWidth: identityWidth });
    y -= 14;
  }
  if (options.bandBottom !== undefined) y = Math.min(y, options.bandBottom - 8);
  page.drawLine({ start: { x: 40, y }, end: { x: right, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 25;
  drawArabicText(page, faces.bold, title, {
    x: right,
    y,
    size: 14,
    maxWidth: options.titleRight ? width - 250 : width - 80
  });
  if (options.titleRight)
    drawArabicText(page, faces.bold, options.titleRight, {
      x: 40,
      y,
      size: 10,
      maxWidth: 170,
      align: 'start'
    });
  if (branding.syndicate && options.showSyndicate !== false) {
    y -= 18;
    drawArabicText(
      page,
      faces.regular,
      `${t('Copropriété', undefined, 'ar')}: ${branding.syndicate.name}${branding.syndicate.address ? ` - ${branding.syndicate.address}` : ''}`,
      { x: right, y, size: 8, maxWidth: width - 80 }
    );
  }
  if (subtitle) {
    y -= 19;
    drawArabicText(page, faces.regular, subtitle, { x: right, y, size: 9, maxWidth: width - 80 });
  }
  return y - 22;
}

export function drawArabicFooters(pdf: PDFDocument, faces: ArabicFaces, issuer: string) {
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const right = width - 40;
    page.drawLine({ start: { x: 40, y: 40 }, end: { x: right, y: 40 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    drawArabicText(page, faces.regular, t('Page {{page}}/{{total}}', { page: index + 1, total: pages.length }, 'ar'), {
      x: right,
      y: 25,
      size: 8,
      maxWidth: 150
    });
    drawArabicText(page, faces.regular, issuer, { x: 40, y: 25, size: 8, maxWidth: 260, align: 'start' });
  });
}
