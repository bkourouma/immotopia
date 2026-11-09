/** Relevé arabe : colonnes et lecture de droite à gauche, chiffres conservés. */
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { t } from '../../i18n';
import { drawDocumentHeader, resolveDocumentBranding } from '../documents/document-branding';
import { arabicFaces, drawArabicNumber } from '../documents/pdf-arabic';
import { TextFace } from '../signature/seal-text';
import type { AccountStatementPdfPayload } from './statement-pdf';
import { money } from './statement-pdf';

const WIDTH = 595;
const HEIGHT = 842;
const LEFT = 40;
const RIGHT = WIDTH - 40;
const INK = rgb(0.12, 0.15, 0.2);
const MUTED = rgb(0.36, 0.4, 0.44);
const COL = { date: 40, billed: 134, settled: 232, balance: 330, label: 555 } as const;

type Faces = { regular: TextFace; bold: TextFace };

function fit(face: TextFace, value: string, size: number, maxWidth: number): string {
  const chars = Array.from(value.replace(/[\r\n\t]+/g, ' ')).slice(0, 300);
  let result = chars.join('');
  if (face.width(result, size) <= maxWidth) return result;
  while (chars.length && face.width(`${chars.join('')}…`, size) > maxWidth) chars.pop();
  result = `${chars.join('')}…`;
  return result;
}

function right(page: PDFPage, face: TextFace, value: string, x: number, y: number, size = 9, maxWidth = 450) {
  const shown = fit(face, value, size, maxWidth);
  face.draw(page, shown, { x: x - face.width(shown, size), y, size, color: INK });
}

function left(page: PDFPage, face: TextFace, value: string, x: number, y: number, size = 8, maxWidth = 90) {
  face.draw(page, fit(face, value, size, maxWidth), { x, y, size, color: INK });
}

/** Les montants et dates restent LTR dans une cellule distincte du libellé arabe. */
function summaryPair(page: PDFPage, faces: Faces, label: string, value: string, y: number, bold = false) {
  const face = bold ? faces.bold : faces.regular;
  const size = 9;
  const shownLabel = fit(face, label, size, 190);
  right(page, face, shownLabel, RIGHT, y, size, 190);
  const valueRight = RIGHT - face.width(shownLabel, size) - 12;
  drawArabicNumber(page, faces.regular, value, { x: valueRight, y, size, maxWidth: 230 });
}

function columns(page: PDFPage, faces: Faces, y: number) {
  right(page, faces.bold, t('Libellé', undefined, 'ar'), COL.label, y, 8, 120);
  left(page, faces.bold, t('Solde après', undefined, 'ar'), COL.balance, y, 8);
  left(page, faces.bold, t('Réglé', undefined, 'ar'), COL.settled, y, 8);
  left(page, faces.bold, t('Facturé', undefined, 'ar'), COL.billed, y, 8);
  left(page, faces.bold, t('Date', undefined, 'ar'), COL.date, y, 8);
  page.drawLine({ start: { x: LEFT, y: y - 5 }, end: { x: RIGHT, y: y - 5 }, thickness: 0.5, color: MUTED });
}

function movementRow(
  page: PDFPage,
  faces: Faces,
  movement: AccountStatementPdfPayload['movements'][number],
  currency: string,
  y: number
) {
  right(page, faces.regular, movement.label, COL.label, y, 8, 120);
  drawArabicNumber(page, faces.regular, money(movement.balanceAfter, currency), {
    x: COL.balance,
    y,
    size: 8,
    maxWidth: 90,
    align: 'start'
  });
  drawArabicNumber(page, faces.regular, movement.amountSettled ? money(movement.amountSettled, currency) : '-', {
    x: COL.settled,
    y,
    size: 8,
    maxWidth: 90,
    align: 'start'
  });
  drawArabicNumber(page, faces.regular, movement.amountBilled ? money(movement.amountBilled, currency) : '-', {
    x: COL.billed,
    y,
    size: 8,
    maxWidth: 90,
    align: 'start'
  });
  drawArabicNumber(page, faces.regular, new Date(movement.movementDate).toISOString().slice(0, 10), {
    x: COL.date,
    y,
    size: 8,
    maxWidth: 86,
    align: 'start'
  });
}

export async function buildArabicAccountStatementPdf(payload: AccountStatementPdfPayload): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const faces: Faces = await arabicFaces(pdf);
  const branding = await resolveDocumentBranding(payload.tenantId, null);
  let page = pdf.addPage([WIDTH, HEIGHT]);
  let y = await drawDocumentHeader(pdf, page, branding, { title: t('Relevé de compte', undefined, 'ar') });
  right(page, faces.regular, `${t('Compte', undefined, 'ar')} : ${payload.accountLabel}`, RIGHT, y, 10);
  y -= 18;
  if (payload.periodFrom || payload.periodTo) {
    const from = payload.periodFrom ? payload.periodFrom.toISOString().slice(0, 10) : '-';
    const to = payload.periodTo ? payload.periodTo.toISOString().slice(0, 10) : '-';
    summaryPair(page, faces, t('Période', undefined, 'ar'), `${from} - ${to}`, y);
    y -= 18;
  }
  summaryPair(
    page,
    faces,
    t("Solde d'ouverture", undefined, 'ar'),
    money(payload.openingBalance, payload.currency),
    y,
    true
  );
  y -= 16;
  summaryPair(
    page,
    faces,
    t('Solde de clôture', undefined, 'ar'),
    money(payload.closingBalance, payload.currency),
    y,
    true
  );
  y -= 16;
  if (payload.filteredTotals) {
    right(page, faces.bold, t('Lignes filtrées', undefined, 'ar'), RIGHT, y, 9);
    y -= 15;
    summaryPair(page, faces, t('Facturé', undefined, 'ar'), money(payload.filteredTotals.debit, payload.currency), y);
    y -= 15;
    summaryPair(page, faces, t('Réglé', undefined, 'ar'), money(payload.filteredTotals.credit, payload.currency), y);
    y -= 18;
  }
  y -= 12;
  columns(page, faces, y);
  y -= 20;
  for (const movement of payload.movements) {
    if (y < 72) {
      page = pdf.addPage([WIDTH, HEIGHT]);
      y = HEIGHT - 56;
      columns(page, faces, y);
      y -= 20;
    }
    movementRow(page, faces, movement, payload.currency, y);
    y -= 15;
  }
  const pages = pdf.getPages();
  for (const [index, sheet] of pages.entries()) {
    sheet.drawLine({ start: { x: LEFT, y: 40 }, end: { x: RIGHT, y: 40 }, thickness: 0.5, color: MUTED });
    right(
      sheet,
      faces.regular,
      t('Page {{page}}/{{total}}', { page: index + 1, total: pages.length }, 'ar'),
      RIGHT,
      25,
      8
    );
    left(sheet, faces.regular, branding.issuer.name, LEFT, 25, 8, 250);
  }
  pdf.setAuthor(branding.issuer.name || 'ImmoTopia');
  return Buffer.from(await pdf.save());
}
