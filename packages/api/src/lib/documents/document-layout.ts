import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { t } from '../../i18n';
import { PAGE_MARGIN, fontsOf, truncate } from './document-branding';
import { pdfLanguage, sanitizeForPdf } from './pdf-text';

export { pdfLanguage };

/**
 * Éléments de mise en page communs aux PDF générés par le code, à placer
 * autour de l'en-tête standard (`drawDocumentHeader`) :
 *
 * - `drawPartyBlock` : bloc « destinataire / copropriétaire / lot » en deux
 *   colonnes sous l'en-tête ;
 * - `drawDocumentFooters` : pied de page « émetteur - page X/Y - référence »
 *   appliqué à toutes les pages, une fois le contenu terminé.
 *
 * Helvetica (WinAnsi) ne dessine pas l'arabe : un document demandé en arabe
 * garde ses libellés fixes en français plutôt que de sortir en « ? ».
 */

const GREY = rgb(0.35, 0.35, 0.35);
const RULE_GREY = rgb(0.75, 0.75, 0.75);

/** Hauteur réservée en bas de page pour le pied : le contenu s'arrête au-dessus. */
export const FOOTER_RESERVED = 56;

export interface PartyColumn {
  /** Intitulé en petites capitales grises (« Facturé à », « Copropriétaire »…). */
  title: string;
  /**
   * Le premier élément est le nom (en gras s'il n'est pas vide) ; les suivants
   * (adresse, contact…) sont en gris. Un élément vide est sauté.
   */
  lines: Array<string | null | undefined>;
}

/** Nombre maximal de lignes dessinées pour un même élément d'un bloc (adresse longue). */
const PARTY_MAX_LINES = 3;

/**
 * Coupe un texte en lignes qui tiennent dans `maxWidth` (retour à la ligne aux
 * espaces). Au-delà de `maxLines`, la dernière ligne est abrégée par « ... » ;
 * un mot plus large que la zone est coupé.
 */
export function wrapToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = PARTY_MAX_LINES
): string[] {
  const words = sanitizeForPdf(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map(line => truncate(line, font, size, maxWidth));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(lines.slice(maxLines - 1).join(' '), font, size, maxWidth);
  return kept.map(line => truncate(line, font, size, maxWidth));
}

/**
 * Deux colonnes d'identification sous l'en-tête. Renvoie l'ordonnée sous le
 * bloc le plus haut des deux.
 */
export async function drawPartyBlock(
  pdfDoc: PDFDocument,
  page: PDFPage,
  y: number,
  columns: [PartyColumn, PartyColumn?]
): Promise<number> {
  const { regular, bold } = await fontsOf(pdfDoc);
  const { width } = page.getSize();
  const gutter = 20;
  const columnWidth = (width - 2 * PAGE_MARGIN - gutter) / 2;
  let lowest = y;
  columns.forEach((column, index) => {
    if (!column) return;
    const x = PAGE_MARGIN + index * (columnWidth + gutter);
    let cursor = y;
    page.drawText(truncate(column.title, bold, 9, columnWidth), { x, y: cursor, size: 9, font: bold, color: GREY });
    column.lines.forEach((line, lineIndex) => {
      if (!line || !line.trim()) return;
      // Seul le nom (premier élément, non vide) est en gras ; une adresse reste en gris.
      const strong = lineIndex === 0;
      const font = strong ? bold : regular;
      const size = strong ? 11 : 9;
      wrapToWidth(line, font, size, columnWidth).forEach((part, partIndex) => {
        cursor -= partIndex === 0 && strong ? 15 : 12;
        page.drawText(part, { x, y: cursor, size, font, ...(strong ? {} : { color: GREY }) });
      });
    });
    lowest = Math.min(lowest, cursor);
  });
  return lowest - 18;
}

export interface FooterOptions {
  /** Nom de l'émetteur, à gauche. */
  issuerName: string;
  /** Référence du document (numéro, compte…), à droite avant la pagination. */
  reference?: string | null;
}

/** Texte de droite du pied : « Réf. X - Page 1/3 ». */
export function footerRightText(reference: string | null | undefined, page: number, total: number): string {
  const language = pdfLanguage();
  const pageText = t('Page {{page}}/{{total}}', { page, total }, language);
  const ref = reference?.trim() ? t('Réf. {{reference}}', { reference: reference.trim() }, language) : null;
  return sanitizeForPdf([ref, pageText].filter(Boolean).join(' - '));
}

/**
 * Pied de page de toutes les pages : filet, émetteur à gauche, référence et
 * pagination à droite. À appeler une fois toutes les pages ajoutées.
 */
export async function drawDocumentFooters(pdfDoc: PDFDocument, options: FooterOptions): Promise<void> {
  const { regular } = await fontsOf(pdfDoc);
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const right = footerRightText(options.reference, index + 1, pages.length);
    const rightWidth = regular.widthOfTextAtSize(right, 7);
    page.drawLine({
      start: { x: PAGE_MARGIN, y: 38 },
      end: { x: width - PAGE_MARGIN, y: 38 },
      thickness: 0.5,
      color: RULE_GREY
    });
    page.drawText(right, { x: width - PAGE_MARGIN - rightWidth, y: 26, size: 7, font: regular, color: GREY });
    page.drawText(truncate(options.issuerName || ' ', regular, 7, width - 2 * PAGE_MARGIN - rightWidth - 12), {
      x: PAGE_MARGIN,
      y: 26,
      size: 7,
      font: regular,
      color: GREY
    });
  });
}
