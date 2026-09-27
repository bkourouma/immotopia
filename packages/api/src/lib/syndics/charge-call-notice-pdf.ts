import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import {
  drawDocumentHeader,
  drawSignatureBlock,
  fontsOf,
  truncate,
  type DocumentBranding
} from '../documents/document-branding';
import { sanitizeForPdf } from '../documents/pdf-text';
import { amountToFrenchWords } from './number-to-french-words';
import { A4, formatAmount, wrapText } from './charge-receipt-pdf';
import { frenchDay, periodText, type SnapshotPeriod } from './charge-receipt-snapshot';

/**
 * Avis d'appel de charges en PDF (lot S4, besoin 6), une page A4.
 *
 * Même identité que les reçus et quittances (lot S1 : mandant ou agence,
 * logo de la copropriété, signature et cachet). Contrairement à eux, l'avis
 * n'est pas un original archivé : il est construit à la demande depuis les
 * tables vivantes, et affiche donc toujours le reste à payer du moment.
 */

export interface ChargeCallNoticePaymentMethod {
  type: string;
  label: string;
  provider: string | null;
  accountRef: string | null;
}

export interface ChargeCallNoticeData {
  chargeCallId: string;
  period: SnapshotPeriod;
  /** Date d'émission de l'appel (AAAA-MM-JJ ou ISO). */
  issuedAt: string;
  dueDate: string;
  currency: string;
  amount: number;
  /** Part déjà couverte par l'avance du lot. */
  advanceImputed: number;
  /** Part déjà réglée par des paiements. */
  paid: number;
  outstanding: number;
  lot: { number: string; type: string; label: string | null };
  coowner: { name: string; address: string | null } | null;
  paymentMethods: ChargeCallNoticePaymentMethod[];
}

const MARGIN = 40;
const GREY = rgb(0.35, 0.35, 0.35);
const LIGHT = rgb(0.75, 0.75, 0.75);
const CONTENT_WIDTH = A4.width - 2 * MARGIN;

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Virement bancaire',
  CASH: 'Espèces',
  CHECK: 'Chèque',
  CARD: 'Carte bancaire'
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Libellé « Type - libellé - opérateur - référence » d'un moyen de paiement. */
export function paymentMethodLine(method: ChargeCallNoticePaymentMethod): string {
  const type = PAYMENT_TYPE_LABELS[method.type] ?? method.type;
  const parts = [type, method.label, method.provider, method.accountRef].map(part => part?.trim()).filter(Boolean);
  return Array.from(new Set(parts)).join(' - ');
}

/** Nom de téléchargement de l'avis (sans caractère interdit dans un nom de fichier). */
export function chargeCallNoticeFileName(data: Pick<ChargeCallNoticeData, 'lot' | 'period'>): string {
  const period = data.period.label || data.period.start || '';
  return `Avis d'appel ${data.lot.number} ${period}`.replace(/[\\/:*?"<>|]+/g, '-').trim() + '.pdf';
}

function drawRow(page: PDFPage, y: number, label: string, value: string, fonts: Fonts): number {
  const size = 10;
  page.drawText(sanitizeForPdf(label), { x: MARGIN, y, size, font: fonts.bold });
  page.drawText(truncate(value || ' ', fonts.regular, size, CONTENT_WIDTH - 130), {
    x: MARGIN + 130,
    y,
    size,
    font: fonts.regular
  });
  return y - size * 1.6;
}

function drawInfo(page: PDFPage, y: number, data: ChargeCallNoticeData, fonts: Fonts): number {
  const lot = [`${data.lot.number}${data.lot.type ? ` (${data.lot.type})` : ''}`, data.lot.label].filter(Boolean);
  y = drawRow(page, y, 'Lot', lot.join(' - '), fonts);
  y = drawRow(page, y, 'Copropriétaire', data.coowner?.name ?? 'Non renseigné', fonts);
  if (data.coowner?.address) y = drawRow(page, y, 'Adresse', data.coowner.address, fonts);
  y = drawRow(page, y, 'Période', periodText(data.period), fonts);
  y = drawRow(page, y, "Date d'émission", frenchDay(data.issuedAt), fonts);
  y = drawRow(page, y, "Date d'échéance", frenchDay(data.dueDate), fonts);
  return y - 8;
}

/** Montants : appelé (en chiffres et en lettres), avance imputée, déjà réglé, reste à payer. */
function drawAmounts(page: PDFPage, top: number, data: ChargeCallNoticeData, fonts: Fonts): number {
  const padding = 10;
  const words = wrapText(
    `Soit : ${amountToFrenchWords(data.amount, data.currency)}`,
    fonts.regular,
    9.5,
    CONTENT_WIDTH - 2 * padding,
    3
  );
  const rows: Array<[string, number]> = [];
  if (data.advanceImputed > 0) rows.push(['Avance déjà imputée', data.advanceImputed]);
  if (data.paid > 0) rows.push(['Déjà réglé', data.paid]);
  const height = 2 * padding + 13 * 1.4 + words.length * 9.5 * 1.35 + rows.length * 10 * 1.5 + 13 * 1.6;
  page.drawRectangle({
    x: MARGIN,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    borderColor: LIGHT,
    borderWidth: 0.75,
    color: rgb(0.97, 0.97, 0.97)
  });

  const right = (text: string, y: number, size: number, font: PDFFont) => {
    const clean = sanitizeForPdf(text);
    page.drawText(clean, { x: MARGIN + CONTENT_WIDTH - padding - font.widthOfTextAtSize(clean, size), y, size, font });
  };
  const x = MARGIN + padding;
  let y = top - padding - 13;
  page.drawText('Montant appelé', { x, y, size: 13, font: fonts.bold });
  right(formatAmount(data.amount, data.currency), y, 13, fonts.bold);
  y -= 13 * 0.4;
  for (const line of words) {
    y -= 9.5 * 1.35;
    page.drawText(line, { x, y, size: 9.5, font: fonts.regular, color: GREY });
  }
  for (const [label, value] of rows) {
    y -= 10 * 1.5;
    page.drawText(sanitizeForPdf(label), { x, y, size: 10, font: fonts.regular });
    right(`- ${formatAmount(value, data.currency)}`, y, 10, fonts.regular);
  }
  y -= 13 * 1.6;
  page.drawText('Reste à payer', { x, y, size: 13, font: fonts.bold });
  right(formatAmount(data.outstanding, data.currency), y, 13, fonts.bold);
  return top - height - 16;
}

function drawPaymentMethods(page: PDFPage, y: number, data: ChargeCallNoticeData, fonts: Fonts): number {
  if (data.paymentMethods.length === 0) return y;
  page.drawText('Moyens de paiement', { x: MARGIN, y, size: 10.5, font: fonts.bold });
  y -= 15;
  for (const method of data.paymentMethods.slice(0, 8)) {
    page.drawText(truncate(`- ${paymentMethodLine(method)}`, fonts.regular, 9.5, CONTENT_WIDTH), {
      x: MARGIN,
      y,
      size: 9.5,
      font: fonts.regular
    });
    y -= 13;
  }
  return y - 8;
}

function drawMention(page: PDFPage, y: number, data: ChargeCallNoticeData, fonts: Fonts): number {
  const text =
    data.outstanding > 0
      ? `Merci de régler le reste à payer au plus tard le ${frenchDay(data.dueDate)}, en rappelant la référence du lot ${data.lot.number} et la période.`
      : "Cet appel est entièrement couvert : aucun paiement n'est attendu.";
  for (const line of wrapText(text, fonts.regular, 9.5, CONTENT_WIDTH, 3)) {
    page.drawText(line, { x: MARGIN, y, size: 9.5, font: fonts.regular, color: GREY });
    y -= 13;
  }
  return y;
}

/** Rend l'avis d'appel (une page A4). */
export async function renderChargeCallNoticePdf(
  data: ChargeCallNoticeData,
  branding: DocumentBranding
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4.width, A4.height]);
  const fonts = await fontsOf(pdfDoc);

  let y = await drawDocumentHeader(pdfDoc, page, branding, {
    title: "AVIS D'APPEL DE CHARGES",
    subtitle: periodText(data.period) ? `Période : ${periodText(data.period)}` : undefined
  });
  y = drawInfo(page, y, data, fonts);
  y = drawAmounts(page, y, data, fonts);
  y = drawPaymentMethods(page, y, data, fonts);
  y = drawMention(page, y, data, fonts);

  // Bloc signature en bas à droite, jamais par-dessus le contenu.
  await drawSignatureBlock(pdfDoc, page, branding, {
    x: A4.width - MARGIN - 200,
    y: Math.min(y - 20, 150),
    label: 'Le syndic'
  });

  const title = sanitizeForPdf(`Avis d'appel de charges ${data.lot.number} ${data.period.label ?? ''}`.trim());
  pdfDoc.setTitle(title);
  pdfDoc.setProducer('ImmoTopia');
  pdfDoc.setCreator('ImmoTopia');
  return Buffer.from(await pdfDoc.save());
}
