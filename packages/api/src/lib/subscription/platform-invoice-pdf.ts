/**
 * PDF d'une facture PLATFORM (ou d'un avoir) — vague 3 lot A.
 *
 * Meme mecanique que les releves de copropriete (pdf-lib, police standard
 * Helvetica encodee en WinAnsi) : TOUT texte passe par `sanitizeForPdf`, qui
 * remplace les espaces insecables de `toLocaleString('fr-FR')` (U+202F,
 * U+00A0) et tout caractere hors WinAnsi. Le document est redige en
 * francais, langue de l'emetteur et de la facture : Helvetica ne sait pas
 * dessiner l'arabe, et une facture n'a qu'une version legale.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { sanitizeForPdf } from '../syndics/owner-account-statement';
import type { InvoiceLineKindCode } from './pricing';
import type { PlatformCustomerInfo, PlatformIssuerInfo } from './platform-invoice';

export interface PlatformInvoicePdfLine {
  kind: InvoiceLineKindCode;
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface PlatformInvoicePdfPayload {
  invoiceNumber: string;
  nature: 'PERIOD' | 'OVERAGE' | 'CREDIT_NOTE' | null;
  status: string;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  currency: string;
  issuer: PlatformIssuerInfo;
  customer: PlatformCustomerInfo;
  lines: PlatformInvoicePdfLine[];
  amountExclTax: number;
  taxRate: number;
  taxAmount: number;
  amountTotal: number;
  /** Avoir : numero de la facture annulee. */
  creditedInvoiceNumber?: string | null;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export function formatFcfa(value: number, currency = 'FCFA'): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
}

const formatDate = (date: Date | null | undefined): string =>
  date ? new Date(date).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '-';

/** Fin de periode exclusive affichee comme dernier jour inclus. */
const lastDay = (date: Date | null | undefined): Date | null =>
  date ? new Date(new Date(date).getTime() - 24 * 60 * 60 * 1000) : null;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'BROUILLON',
  ISSUED: 'A REGLER',
  PAID: 'REGLEE',
  OVERDUE: 'EN RETARD',
  CANCELED: 'ANNULEE PAR AVOIR',
  REFUNDED: 'REMBOURSEE',
  FAILED: 'ECHEC'
};

/** Coupe un texte en lignes qui tiennent dans `maxWidth`. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitizeForPdf(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function buildPlatformInvoicePdf(payload: PlatformInvoicePdfPayload): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const isCreditNote = payload.nature === 'CREDIT_NOTE';
  const title = isCreditNote ? 'AVOIR' : 'FACTURE';
  pdfDoc.setTitle(sanitizeForPdf(`${title} ${payload.invoiceNumber}`));
  pdfDoc.setAuthor(sanitizeForPdf(payload.issuer.name));

  const WIDTH = 595;
  const HEIGHT = 842;
  const LEFT = 40;
  const RIGHT = WIDTH - 40;
  const grey = rgb(0.35, 0.35, 0.35);
  const dark = rgb(0.1, 0.1, 0.1);

  let page: PDFPage = pdfDoc.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - 50;

  const draw = (text: string, x: number, size = 9, f: PDFFont = font, color = dark) =>
    page.drawText(sanitizeForPdf(text), { x, y, size, font: f, color });
  const drawRight = (text: string, xRight: number, size = 9, f: PDFFont = font, color = dark) => {
    const clean = sanitizeForPdf(text);
    page.drawText(clean, { x: xRight - f.widthOfTextAtSize(clean, size), y, size, font: f, color });
  };
  const newPageIfNeeded = (needed: number) => {
    if (y - needed >= 70) return;
    page = pdfDoc.addPage([WIDTH, HEIGHT]);
    y = HEIGHT - 50;
    draw(`${title} ${payload.invoiceNumber} (suite)`, LEFT, 10, bold);
    y -= 24;
  };

  // ---------------------------------------------------------------- en-tete
  draw(payload.issuer.name, LEFT, 14, bold);
  drawRight(title, RIGHT, 18, bold);
  y -= 16;
  const issuerLines = [
    payload.issuer.address,
    payload.issuer.rccm ? `RCCM : ${payload.issuer.rccm}` : null,
    payload.issuer.taxId ? `Compte contribuable : ${payload.issuer.taxId}` : null,
    [payload.issuer.email, payload.issuer.phone].filter(Boolean).join(' - ') || null
  ].filter((l): l is string => Boolean(l));
  const metaLines: Array<[string, string]> = [
    ['Numero', payload.invoiceNumber],
    ["Date d'emission", formatDate(payload.issueDate)],
    [isCreditNote ? 'Date' : 'Echeance', formatDate(isCreditNote ? payload.issueDate : payload.dueDate)],
    ['Statut', STATUS_LABELS[payload.status] ?? payload.status]
  ];
  if (payload.creditedInvoiceNumber) metaLines.push(['Annule la facture', payload.creditedInvoiceNumber]);
  const headerRows = Math.max(issuerLines.length, metaLines.length);
  for (let i = 0; i < headerRows; i += 1) {
    if (issuerLines[i]) draw(issuerLines[i], LEFT, 9, font, grey);
    if (metaLines[i]) {
      draw(`${metaLines[i][0]} :`, 360, 9, font, grey);
      drawRight(metaLines[i][1], RIGHT, 9, bold);
    }
    y -= 13;
  }

  // ---------------------------------------------------------------- client
  y -= 14;
  draw('Facture a', LEFT, 9, bold, grey);
  y -= 14;
  draw(payload.customer.name, LEFT, 11, bold);
  y -= 14;
  for (const line of [
    payload.customer.address,
    payload.customer.taxId ? `Compte contribuable : ${payload.customer.taxId}` : null,
    [payload.customer.email, payload.customer.phone].filter(Boolean).join(' - ') || null
  ]) {
    if (!line) continue;
    for (const part of wrap(line, font, 9, 300)) {
      draw(part, LEFT, 9, font, grey);
      y -= 12;
    }
  }
  if (payload.periodStart && payload.periodEnd) {
    y -= 6;
    const label = payload.nature === 'OVERAGE' ? 'Depassement du mois' : 'Periode facturee';
    draw(`${label} : du ${formatDate(payload.periodStart)} au ${formatDate(lastDay(payload.periodEnd))}`, LEFT, 9, bold);
    y -= 12;
  }

  // ---------------------------------------------------------------- lignes
  y -= 14;
  const COL_QTY = 370;
  const COL_UNIT = 460;
  const drawHeader = () => {
    page.drawRectangle({ x: LEFT - 4, y: y - 4, width: RIGHT - LEFT + 8, height: 16, color: rgb(0.92, 0.93, 0.95) });
    draw('Designation', LEFT, 9, bold);
    drawRight('Qte', COL_QTY, 9, bold);
    drawRight('Prix unitaire HT', COL_UNIT, 9, bold);
    drawRight('Montant HT', RIGHT, 9, bold);
    y -= 18;
  };
  drawHeader();

  for (const line of payload.lines.filter(l => l.kind !== 'TAX')) {
    const labelLines = wrap(line.label, font, 9, COL_QTY - LEFT - 50);
    const periodNote =
      line.periodStart && line.periodEnd &&
      (!payload.periodStart || new Date(line.periodStart).getTime() !== new Date(payload.periodStart).getTime() ||
        !payload.periodEnd || new Date(line.periodEnd).getTime() !== new Date(payload.periodEnd).getTime())
        ? `du ${formatDate(line.periodStart)} au ${formatDate(lastDay(line.periodEnd))}`
        : null;
    newPageIfNeeded(12 * (labelLines.length + (periodNote ? 1 : 0)) + 6);
    labelLines.forEach((part, i) => {
      draw(part, LEFT, 9);
      if (i === 0) {
        drawRight(String(Number.isInteger(line.quantity) ? line.quantity : line.quantity.toFixed(2)), COL_QTY);
        drawRight(formatFcfa(line.unitPrice, ''), COL_UNIT);
        drawRight(formatFcfa(line.amount, ''), RIGHT);
      }
      y -= 12;
    });
    if (periodNote) {
      draw(periodNote, LEFT + 8, 8, font, grey);
      y -= 12;
    }
    y -= 2;
  }

  // ---------------------------------------------------------------- totaux
  newPageIfNeeded(80);
  y -= 6;
  page.drawLine({ start: { x: 330, y: y + 8 }, end: { x: RIGHT, y: y + 8 }, thickness: 0.5, color: grey });
  const totals: Array<[string, number, boolean]> = [
    ['Total HT', payload.amountExclTax, false],
    [`TVA ${payload.taxRate} %`, payload.taxAmount, false],
    [isCreditNote ? 'Total TTC de l\'avoir' : 'Total TTC', payload.amountTotal, true]
  ];
  for (const [label, value, strong] of totals) {
    draw(label, 340, strong ? 11 : 9, strong ? bold : font);
    drawRight(formatFcfa(value, payload.currency), RIGHT, strong ? 11 : 9, strong ? bold : font);
    y -= strong ? 18 : 14;
  }

  // ---------------------------------------------------------------- pied
  y -= 10;
  if (payload.status === 'PAID' && payload.paidAt) {
    const how = [payload.paymentMethod, payload.paymentReference].filter(Boolean).join(', ');
    draw(`Reglee le ${formatDate(payload.paidAt)}${how ? ` (${how})` : ''}.`, LEFT, 9, bold);
    y -= 14;
  } else if (!isCreditNote && payload.status !== 'CANCELED') {
    draw(`Montant a regler avant le ${formatDate(payload.dueDate)}, depuis votre espace ImmoTopia.`, LEFT, 9);
    y -= 14;
  }
  if (payload.notes) {
    for (const part of wrap(payload.notes, font, 8, RIGHT - LEFT)) {
      newPageIfNeeded(12);
      draw(part, LEFT, 8, font, grey);
      y -= 11;
    }
  }
  if (payload.status === 'DRAFT') {
    const first = pdfDoc.getPage(0);
    first.drawText('BROUILLON', { x: 150, y: 380, size: 72, font: bold, color: rgb(0.85, 0.85, 0.85), opacity: 0.5 });
  }

  // Mentions de bas de page, sur chaque page.
  const footer = sanitizeForPdf(
    [payload.issuer.name, payload.issuer.rccm ? `RCCM ${payload.issuer.rccm}` : null, payload.issuer.taxId ? `CC ${payload.issuer.taxId}` : null]
      .filter(Boolean)
      .join(' - ')
  );
  pdfDoc.getPages().forEach((p, index, pages) => {
    p.drawText(footer, { x: LEFT, y: 30, size: 7, font, color: grey });
    const pageLabel = `Page ${index + 1}/${pages.length}`;
    p.drawText(pageLabel, { x: RIGHT - font.widthOfTextAtSize(pageLabel, 7), y: 30, size: 7, font, color: grey });
  });

  return Buffer.from(await pdfDoc.save());
}
