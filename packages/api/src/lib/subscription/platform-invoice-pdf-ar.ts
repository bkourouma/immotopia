/** Présentation arabe d'une facture plateforme, avec cellules numériques LTR. */
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { t } from '../../i18n';
import {
  arabicFaces,
  drawArabicFooters,
  drawArabicHeader,
  drawArabicNumber,
  drawArabicText,
  wrapArabicText,
  type ArabicFaces
} from '../documents/pdf-arabic';
import { issuerFromMandant, type DocumentBranding } from '../documents/document-branding';
import { formatFcfa, type PlatformInvoicePdfPayload } from './platform-invoice-pdf';

const W = 595;
const H = 842;
const L = 40;
const R = W - L;
const INK = rgb(0.12, 0.15, 0.2);
const GREY = rgb(0.4, 0.4, 0.4);
// @i18n-keys
const STATUS: Record<string, string> = {
  DRAFT: 'Brouillon',
  ISSUED: 'À régler',
  PAID: 'Réglée',
  OVERDUE: 'En retard',
  CANCELED: 'Annulée',
  REFUNDED: 'Remboursée',
  FAILED: 'Échec'
};

const date = (value: Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '-';

function brandingOf(payload: PlatformInvoicePdfPayload): DocumentBranding {
  return {
    issuer: issuerFromMandant({
      name: payload.issuer.name,
      legalName: null,
      address: payload.issuer.address,
      phone: payload.issuer.phone,
      email: payload.issuer.email,
      rccm: payload.issuer.rccm,
      taxId: payload.issuer.taxId
    }),
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null
  };
}

function text(
  page: PDFPage,
  faces: ArabicFaces,
  value: string,
  right: number,
  y: number,
  width: number,
  bold = false,
  size = 9
) {
  drawArabicText(page, bold ? faces.bold : faces.regular, value, { x: right, y, maxWidth: width, size, color: INK });
}

function number(
  page: PDFPage,
  faces: ArabicFaces,
  value: string,
  right: number,
  y: number,
  width: number,
  bold = false,
  size = 9
) {
  drawArabicNumber(page, bold ? faces.bold : faces.regular, value, { x: right, y, maxWidth: width, size, color: INK });
}

/** Valeur LTR dans une cellule séparée du libellé RTL. */
function pair(page: PDFPage, faces: ArabicFaces, label: string, value: string, y: number, bold = false) {
  text(page, faces, label, R, y, 215, bold);
  number(page, faces, value, 320, y, 260, bold);
}

export async function renderArabicPlatformInvoicePdf(payload: PlatformInvoicePdfPayload): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const faces = await arabicFaces(pdf);
  const credit = payload.nature === 'CREDIT_NOTE';
  const title = credit ? t('Avoir', undefined, 'ar') : t('Facture', undefined, 'ar');
  const branding = brandingOf(payload);
  let page = pdf.addPage([W, H]);
  let y = drawArabicHeader(
    page,
    faces,
    branding,
    title,
    `${t('Traduction arabe', undefined, 'ar')} — ${payload.invoiceNumber}`
  );
  const next = (needed: number) => {
    if (y - needed >= 58) return;
    page = pdf.addPage([W, H]);
    y = H - 55;
    text(
      page,
      faces,
      `${t('Traduction arabe', undefined, 'ar')} — ${title} ${payload.invoiceNumber}`,
      R,
      y,
      R - L,
      true,
      12
    );
    y -= 30;
  };
  pair(page, faces, t('Émise le', undefined, 'ar'), date(payload.issueDate), y);
  y -= 16;
  pair(page, faces, t('Échéance', undefined, 'ar'), date(payload.dueDate), y);
  y -= 16;
  pair(page, faces, t('Statut', undefined, 'ar'), t(STATUS[payload.status] ?? payload.status, undefined, 'ar'), y);
  y -= 16;
  if (payload.creditedInvoiceNumber) {
    pair(page, faces, t('Référence', undefined, 'ar'), payload.creditedInvoiceNumber, y);
    y -= 16;
  }
  y -= 8;
  text(page, faces, t('Facturé à', undefined, 'ar'), R, y, 230, true);
  y -= 17;
  for (const line of [
    payload.customer.name,
    payload.customer.address,
    payload.customer.taxId,
    payload.customer.email,
    payload.customer.phone
  ]) {
    if (!line) continue;
    text(page, faces, line, R, y, R - L);
    y -= 15;
  }
  if (payload.periodStart && payload.periodEnd) {
    y -= 6;
    pair(
      page,
      faces,
      t('Période', undefined, 'ar'),
      `${date(payload.periodStart)} - ${date(new Date(payload.periodEnd.getTime() - 86400000))}`,
      y
    );
    y -= 20;
  }
  y -= 14;
  const header = () => {
    page.drawRectangle({ x: L, y: y - 5, width: R - L, height: 18, color: rgb(0.92, 0.93, 0.95) });
    text(page, faces, t('Désignation', undefined, 'ar'), R, y, 225, true);
    text(page, faces, t('Quantité', undefined, 'ar'), 295, y, 55, true);
    text(page, faces, t('Prix unitaire', undefined, 'ar'), 225, y, 85, true);
    text(page, faces, t('Montant', undefined, 'ar'), 130, y, 90, true);
    y -= 24;
  };
  header();
  for (const line of payload.lines.filter(item => item.kind !== 'TAX')) {
    const labelLines = wrapArabicText(faces.regular, line.label, 9, 245);
    labelLines.forEach((part, index) => {
      next(20);
      if (y > H - 90) header();
      text(page, faces, part, R, y, 245);
      if (index === 0) {
        number(page, faces, String(line.quantity), 295, y, 55);
        number(page, faces, formatFcfa(line.unitPrice, ''), 225, y, 85);
        number(page, faces, formatFcfa(line.amount, ''), 130, y, 90);
      }
      y -= 19;
    });
    if (line.periodStart && line.periodEnd) {
      next(16);
      if (y > H - 90) header();
      text(page, faces, `${date(line.periodStart)} - ${date(line.periodEnd)}`, R, y, 245, false, 7);
      y -= 15;
    }
  }
  next(115);
  y -= 10;
  page.drawLine({ start: { x: L, y: y + 10 }, end: { x: R, y: y + 10 }, thickness: 0.5, color: GREY });
  pair(page, faces, t('Total HT', undefined, 'ar'), formatFcfa(payload.amountExclTax, payload.currency), y);
  y -= 18;
  pair(
    page,
    faces,
    `${t('TVA', undefined, 'ar')} ${payload.taxRate} %`,
    formatFcfa(payload.taxAmount, payload.currency),
    y
  );
  y -= 18;
  pair(
    page,
    faces,
    t(credit ? "Total TTC de l'avoir" : 'Total TTC', undefined, 'ar'),
    formatFcfa(payload.amountTotal, payload.currency),
    y,
    true
  );
  y -= 24;
  if (payload.paidAt) {
    pair(page, faces, t('Réglé', undefined, 'ar'), date(payload.paidAt), y);
    y -= 18;
  }
  if (payload.notes) {
    for (const part of wrapArabicText(faces.regular, payload.notes, 9, R - L)) {
      next(18);
      text(page, faces, part, R, y, R - L);
      y -= 15;
    }
  }
  if (payload.status === 'DRAFT') text(pdf.getPage(0), faces, t('Brouillon', undefined, 'ar'), 490, 390, 400, true, 50);
  drawArabicFooters(pdf, faces, `${t('Traduction arabe', undefined, 'ar')} — ${payload.issuer.name}`);
  pdf.setAuthor(payload.issuer.name);
  pdf.setTitle(`${title} ${payload.invoiceNumber}`);
  return Buffer.from(await pdf.save());
}
